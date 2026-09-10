/**
 * atomic.ts - cross-process file locking and crash-safe JSON writes.
 *
 * State and trace files are shared by CLI commands, MCP calls, and parallel
 * test processes. A direct writeFileSync can leave truncated JSON behind,
 * and two concurrent appends can silently lose one event. This module keeps
 * both operations small and synchronous so the existing command surface can
 * adopt them without changing its API.
 */

import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));
const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const DEFAULT_STALE_LOCK_MS = 30000;

function sleepSync(milliseconds: number): void {
  Atomics.wait(SLEEP_BUFFER, 0, 0, milliseconds);
}

export interface FileLockOptions {
  timeoutMs?: number;
  staleMs?: number;
}

/**
 * Run a critical section while holding a sibling `.lock` file.
 *
 * `open(..., "wx")` is atomic across processes on Windows and POSIX. Stale
 * locks are reclaimed after `staleMs` so a killed process cannot block the
 * repository forever.
 */
export function withFileLockSync<T>(target: string, fn: () => T, options: FileLockOptions = {}): T {
  const lockPath = `${target}.lock`;
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);
  const staleMs = Math.max(1, options.staleMs ?? DEFAULT_STALE_LOCK_MS);
  const startedAt = Date.now();
  mkdirSync(dirname(lockPath), { recursive: true });

  while (true) {
    try {
      const fd = openSync(lockPath, 'wx');
      try {
        writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > staleMs) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        // The lock disappeared between open and stat. Retry immediately.
        continue;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`timed out waiting for file lock: ${lockPath}`);
      }
      sleepSync(10);
    }
  }

  try {
    return fn();
  } finally {
    try {
      if (existsSync(lockPath)) unlinkSync(lockPath);
    } catch {
      // A stale-lock reclaimer may have removed it first.
    }
  }
}

/**
 * Write a file through a sibling temporary file, then atomically rename it.
 * Readers therefore observe either the previous complete file or the new
 * complete file, never a partial write.
 */
export function atomicWriteFileSync(
  target: string,
  data: string | Uint8Array,
  encoding: BufferEncoding = 'utf8',
): void {
  const directory = dirname(target);
  mkdirSync(directory, { recursive: true });
  const tempPath = join(directory, `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  const fd = openSync(tempPath, 'wx');
  try {
    if (typeof data === 'string') {
      writeSync(fd, data, null, encoding);
    } else {
      writeSync(fd, data);
    }
    fsyncSync(fd);
  } catch (error) {
    try {
      closeSync(fd);
    } catch {
      // Preserve the original write error.
    }
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup.
    }
    throw error;
  }
  closeSync(fd);
  renameSync(tempPath, target);

  try {
    const directoryFd = openSync(directory, 'r');
    try {
      fsyncSync(directoryFd);
    } finally {
      closeSync(directoryFd);
    }
  } catch {
    // Directory fsync is not supported on every Windows filesystem.
  }
}
