/**
 * validate.ts — validate every JSON file under a path against its schema.
 *
 * Usage:
 *   hackathon validate                     # validate .hackathon/state/ in cwd
 *   hackathon validate path/to/dir/        # validate every *.json in that dir
 *
 * Used by CI to make sure state files conform to their schemas.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

export function validate(dir: string): number {
  const schemasRoot = resolve("src/state/schemas");
  const target = resolve(dir);

  if (!existsSync(target)) {
    console.error(`not a directory: ${target}`);
    return 2;
  }

  let errors = 0;
  const entries = readdirSync(target);
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const file = join(target, name);
    let stat;
    try { stat = statSync(file); } catch { continue; }
    if (!stat.isFile()) continue;

    const base = name.replace(/\.json$/i, "");
    const schemaPath = join(schemasRoot, `${base}.schema.json`);
    if (!existsSync(schemaPath)) {
      console.error(`✗ ${file}: no schema at ${schemaPath}`);
      errors++;
      continue;
    }

    let schema, data;
    try {
      schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
      data = JSON.parse(readFileSync(file, "utf-8"));
    } catch (e) {
      console.error(`✗ ${file}: parse error ${(e as Error).message}`);
      errors++;
      continue;
    }

    const validateFn = ajv.compile(schema);
    if (validateFn(data)) {
      console.log(`✓ ${file}`);
    } else {
      console.error(`✗ ${file}`);
      for (const e of validateFn.errors ?? []) {
        console.error(`    - ${e.instancePath} ${e.message}`);
      }
      errors++;
    }
  }

  return errors === 0 ? 0 : 1;
}

