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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validatorCache = new Map<string, ReturnType<typeof ajv.compile>>();

function findPackageRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

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
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(opts.data, null, 2));
  return target;
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
