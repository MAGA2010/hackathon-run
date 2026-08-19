// tests/unit/v050-replay-skills.test.mjs
// Unit tests for v0.5.0: hackathon replay + hackathon skills catalog.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = 'D:/personal skill';
const CLI = join(ROOT, 'dist/cli/index.js');

function run(args, opts = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? ROOT,
  });
}

describe('hackathon replay', () => {
  it('reports missing state dir', () => {
    const r = run(['replay', '-C', tmpdir()]);
    assert.notEqual(r.status, 0);
    assert.ok(/not found/i.test(r.stdout + r.stderr));
  });

  it('emits a timeline (json) from .hackathon/state/', () => {
    const r = run(['replay', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.ok(payload.state_dir);
    assert.ok(Array.isArray(payload.entries));
    assert.ok(payload.entries.length >= 1);
  });
});

describe('hackathon skills catalog', () => {
  it('lists bundled skills', () => {
    const r = run(['skills', 'list']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('scope-knife'));
    assert.ok(r.stdout.includes('demo-rehearsal'));
  });

  it('pin writes .hackathon/skills.json with checksums', () => {
    const r = run(['skills', 'pin', '--all']);
    assert.equal(r.status, 0, r.stderr);
    const pinPath = join(ROOT, '.hackathon/skills.json');
    assert.ok(existsSync(pinPath));
    const pin = JSON.parse(readFileSync(pinPath, 'utf8'));
    assert.equal(pin.version, '1.0');
    assert.ok(Array.isArray(pin.skills));
    assert.ok(pin.skills.length >= 13);
    for (const e of pin.skills) {
      assert.ok(e.name);
      assert.ok(e.version);
      assert.ok(e.checksum.startsWith('sha256:'));
    }
  });

  it('diff reports no changes immediately after pin', () => {
    run(['skills', 'pin', '--all']);
    const r = run(['skills', 'diff']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(/no changes/i.test(r.stdout));
  });

  it('show prints the pin', () => {
    run(['skills', 'pin', '--all']);
    const r = run(['skills', 'show']);
    assert.equal(r.status, 0, r.stderr);
    const pin = JSON.parse(r.stdout);
    assert.equal(pin.version, '1.0');
  });
});
