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

const result = spawnSync(process.execPath, args, {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.status !== 0 && process.env.GITHUB_ACTIONS === 'true') {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const failures = [];
  let current = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('not ok ') || line.startsWith('\u2716 ')) {
      if (current.length > 0) failures.push(current.join('\n'));
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
      if (line === '...') {
        failures.push(current.join('\n'));
        current = [];
      }
    }
  }
  if (current.length > 0) failures.push(current.join('\n'));
  const annotations = failures.length > 0 ? failures : output.split(/\r?\n/).slice(-120);
  for (const message of annotations) {
    const safeMessage = message
      .replaceAll('%', '%25')
      .replaceAll('\r', '%0D')
      .replaceAll('\n', '%0A');
    process.stdout.write(`::error title=unit test::${safeMessage}\n`);
  }
}

process.exit(result.status ?? 1);
