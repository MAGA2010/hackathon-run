// tests/unit/v040-examples.test.mjs
// Unit tests for the v0.4.0 example projects: data-eng, chrome-extension, devtool-cli.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
const CLI = join(ROOT, 'dist', 'cli', 'index.js');

const NEW_EXAMPLES = [
  { name: 'data-eng', file: 'src/etl.py' },
  { name: 'chrome-extension', file: 'manifest.json' },
  { name: 'devtool-cli', file: 'src/cli.mjs' },
];

describe('v0.4.0 example projects', () => {
  for (const ex of NEW_EXAMPLES) {
    it(ex.name + '/' + ex.file + ' exists', () => {
      assert.ok(existsSync(join(ROOT, 'examples', ex.name, ex.file)));
    });

    it(ex.name + '/.hackathon/state/plan.json validates against schema', () => {
      const r = spawnSync(
        process.execPath,
        [CLI, 'validate', join(ROOT, 'examples', ex.name, '.hackathon', 'state')],
        { encoding: 'utf8', cwd: ROOT },
      );
      assert.equal(r.status, 0, r.stdout + r.stderr);
    });

    it('hackathon status --cwd examples/' + ex.name + ' parses plan.json', () => {
      const r = spawnSync(
        process.execPath,
        [CLI, 'status', '--cwd', join(ROOT, 'examples', ex.name), '--json'],
        { encoding: 'utf8', cwd: ROOT },
      );
      assert.equal(r.status, 0, r.stdout + r.stderr);
      const json = JSON.parse(r.stdout);
      assert.equal(json.lifecycle, 'scoping');
      assert.ok(json.files['plan.json']);
      assert.ok(json.files['plan.json'].present);
      assert.ok(json.files['plan.json'].highlights.length > 0);
    });
  }

  it('devtool-cli actually runs end-to-end', () => {
    const r = spawnSync(process.execPath, [join(ROOT, 'examples/devtool-cli/src/cli.mjs')], {
      input: '{"hello":"world","n":42}',
      encoding: 'utf8',
      cwd: ROOT,
    });
    assert.equal(r.status, 0, 'stderr: ' + r.stderr);
    assert.ok(/^\[\d{4}-\d{2}-\d{2}T/.test(r.stdout), 'no ISO timestamp in: ' + r.stdout);
    assert.ok(r.stdout.includes('"hello"'));
    assert.ok(r.stdout.includes('"world"'));
  });

  it('chrome-extension smoke script reports all required files present', () => {
    const r = spawnSync(
      process.execPath,
      [join(ROOT, 'examples/chrome-extension/scripts/smoke.mjs')],
      {
        encoding: 'utf8',
        cwd: ROOT,
      },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});
