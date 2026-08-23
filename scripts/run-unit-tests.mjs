import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const testDir = join(process.cwd(), 'tests', 'unit');
const files = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => join(testDir, name));

if (files.length === 0) {
  console.error(`No unit test files found in ${testDir}`);
  process.exit(1);
}

const coverage = process.argv.includes('--coverage');
const args = coverage ? ['--experimental-test-coverage', '--test', ...files] : ['--test', ...files];

const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
