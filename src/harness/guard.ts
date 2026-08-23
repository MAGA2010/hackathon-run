/**
 * guard.ts — operator controls for long-running agent sessions.
 *
 * Two small files mirror the kill switch and steer hooks from the harness
 * paper:
 *
 *   .hackathon/AGENT_STOP  - halts the loop; `resume` refuses to continue.
 *   .hackathon/STEER.md    - one-shot operator redirect, surfaced once.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const STOP_FILE = 'AGENT_STOP';
export const STEER_FILE = 'STEER.md';

export function stopPath(cwd: string): string {
  return resolve(cwd, '.hackathon', STOP_FILE);
}

export function steerPath(cwd: string): string {
  return resolve(cwd, '.hackathon', STEER_FILE);
}

export function isStopped(cwd: string): boolean {
  return existsSync(stopPath(cwd));
}

export function stopMessage(cwd: string): string | null {
  if (!isStopped(cwd)) return null;
  try {
    const raw = readFileSync(stopPath(cwd), 'utf8').trim();
    return raw || 'Operator requested stop.';
  } catch {
    return 'Operator requested stop.';
  }
}

export function writeStop(cwd: string, reason = 'Operator requested stop.'): string {
  const target = stopPath(cwd);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, reason.trim() || 'Operator requested stop.', 'utf8');
  return target;
}

export function clearStop(cwd: string): void {
  removeFile(stopPath(cwd));
}

export function writeSteer(cwd: string, message: string): string {
  const target = steerPath(cwd);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, message.trim(), 'utf8');
  return target;
}

export function readSteer(cwd: string, clear = true): string | null {
  const target = steerPath(cwd);
  if (!existsSync(target)) return null;
  try {
    return readFileSync(target, 'utf8').trim();
  } finally {
    if (clear) removeFile(target);
  }
}

function removeFile(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

export function guardStatus(cwd: string): {
  stopped: boolean;
  stop_message: string | null;
  stop_path: string;
  steer_present: boolean;
  steer_path: string;
} {
  return {
    stopped: isStopped(cwd),
    stop_message: stopMessage(cwd),
    stop_path: stopPath(cwd),
    steer_present: existsSync(steerPath(cwd)),
    steer_path: steerPath(cwd),
  };
}

export function guardPaths(cwd: string): { stop: string; steer: string } {
  return {
    stop: join(cwd, '.hackathon', STOP_FILE),
    steer: join(cwd, '.hackathon', STEER_FILE),
  };
}
