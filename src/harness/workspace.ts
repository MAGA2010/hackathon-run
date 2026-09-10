/**
 * workspace.ts - deterministic source digest for evidence invalidation.
 *
 * Verification evidence is only trustworthy for the code revision it was
 * produced against. The digest intentionally excludes generated state,
 * dependency caches, VCS internals, and build outputs so verification itself
 * does not change the fingerprint.
 */

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.hackathon',
  '.next',
  '.pytest_cache',
  '.mypy_cache',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'site',
  'target',
]);

const MAX_HASHED_FILE_BYTES = 10 * 1024 * 1024;

function walk(root: string, directory: string, files: string[]): void {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(root, full, files);
    } else {
      files.push(relative(root, full).split(sep).join('/'));
    }
  }
}

/**
 * Hash every source file by relative path and content. Symlinks hash their
 * target string rather than following the link, preventing accidental reads
 * outside the workspace.
 */
export function computeWorkspaceDigest(cwd: string): string {
  const root = resolve(cwd);
  const files: string[] = [];
  walk(root, root, files);
  files.sort();

  const hash = createHash('sha256');
  for (const relativePath of files) {
    const full = join(root, ...relativePath.split('/'));
    let stat;
    try {
      stat = lstatSync(full);
    } catch {
      continue;
    }

    hash.update(`path:${relativePath}\n`);
    if (stat.isSymbolicLink()) {
      hash.update(`symlink:${readlinkSync(full)}\n`);
    } else if (stat.isFile()) {
      if (stat.size <= MAX_HASHED_FILE_BYTES) {
        hash.update(readFileSync(full));
      } else {
        hash.update(`large-file:${stat.size}:${Math.trunc(stat.mtimeMs)}\n`);
      }
      hash.update('\n');
    }
  }
  return hash.digest('hex');
}
