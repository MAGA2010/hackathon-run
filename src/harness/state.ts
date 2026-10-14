/**
 * state.ts — load and save state files in .hackathon/state/.
 *
 * Every read/write goes through an Ajv-validated JSON Schema so that
 * downstream skills can trust the shape. Failure modes:
 *
 *   - file missing  -> return null (skill will run with no prior state)
 *   - schema invalid -> throw with diff
 *   - file unreadable -> throw
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename, extname } from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { atomicWriteFileSync, withFileLockSync } from './atomic.js';
import { findPackageRoot } from './package-root.js';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validatorCache = new Map<string, ReturnType<typeof ajv.compile>>();

const PACKAGE_ROOT = findPackageRoot();
const PACKAGE_SCHEMAS = PACKAGE_ROOT ? join(PACKAGE_ROOT, 'src', 'state', 'schemas') : null;

function validatorFor(schemaPath: string) {
  if (validatorCache.has(schemaPath)) {
    return validatorCache.get(schemaPath)!;
  }
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  const validate = ajv.compile(schema);
  validatorCache.set(schemaPath, validate);
  return validate;
}

/**
 * Given a state filename like "plan.json", resolve the matching schema path
 * `src/state/schemas/plan.schema.json`. Callers may override via opts.schema.
 */
export function defaultSchemaPath(repoRoot: string, file: string): string {
  const stem = basename(file, extname(file));
  const schemaName = `${stem}.schema.json`;
  const local = resolve(repoRoot, 'src/state/schemas', schemaName);
  if (existsSync(local)) return local;
  if (PACKAGE_SCHEMAS) {
    const bundled = join(PACKAGE_SCHEMAS, schemaName);
    if (existsSync(bundled)) return bundled;
  }
  return local;
}

export interface StateWriteOptions {
  /** repo root containing .hackathon/state */
  repoRoot: string;
  /** state filename (e.g. "plan.json") */
  file: string;
  /** data to write */
  data: unknown;
  /** optional schema path; defaults to src/state/schemas/<name>.schema.json */
  schema?: string;
}

/**
 * Deterministic digest for a state payload. The digest is over compact JSON
 * with sorted object keys, so semantically identical objects produce the
 * same value regardless of parser insertion order.
 */
export function stateChecksum(data: unknown): string {
  const stable = canonicalJson(data);
  return createHash('sha256').update(stable).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function writeState(opts: StateWriteOptions): string {
  const schemaPath = opts.schema ?? defaultSchemaPath(opts.repoRoot, opts.file);
  const validate = validatorFor(schemaPath);
  if (!validate(opts.data)) {
    const errs = (validate.errors ?? [])
      .map((e) => `  - ${e.instancePath} ${e.message}`)
      .join('\n');
    throw new Error(`state validation failed for ${opts.file}:\n${errs}`);
  }
  const target = resolve(opts.repoRoot, '.hackathon/state', opts.file);
  withFileLockSync(target, () => {
    atomicWriteFileSync(target, JSON.stringify(opts.data, null, 2));
  });
  sweepStaleTempFiles(target);
  return target;
}

/**
 * Remove orphaned atomic-write temp files (crash leftovers like
 * `.plan.json.<pid>.<uuid>.tmp`). Files younger than one hour or owned by
 * this pid are left alone so a concurrent writer is never disturbed.
 */
function sweepStaleTempFiles(target: string): void {
  try {
    const dir = dirname(target);
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const entry of readdirSync(dir)) {
      if (!/^\..+\.\d+\.[0-9a-f-]{36}\.tmp$/i.test(entry)) continue;
      const parts = entry.split('.');
      const pid = Number(parts[2]);
      if (Number.isInteger(pid) && pid === process.pid) continue;
      const full = join(dir, entry);
      try {
        if (statSync(full).mtimeMs < cutoff) rmSync(full, { force: true });
      } catch {
        // Another process swept or locked it first; ignore.
      }
    }
  } catch {
    // Sweeping is best-effort; never fail the write.
  }
}

export interface StateReadOptions {
  repoRoot: string;
  file: string;
  schema?: string;
}

export function readState<T = unknown>(opts: StateReadOptions): T | null {
  const target = resolve(opts.repoRoot, '.hackathon/state', opts.file);
  let raw: string;
  try {
    raw = readFileSync(target, 'utf-8');
  } catch {
    return null;
  }
  const data = JSON.parse(raw);
  const schemaPath = opts.schema ?? defaultSchemaPath(opts.repoRoot, opts.file);
  const validate = validatorFor(schemaPath);
  if (!validate(data)) {
    const errs = (validate.errors ?? [])
      .map((e) => `  - ${e.instancePath} ${e.message}`)
      .join('\n');
    throw new Error(`state file ${opts.file} failed schema validation:\n${errs}`);
  }
  return data as T;
}
