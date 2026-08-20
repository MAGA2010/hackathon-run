// tests/unit/v050-replay-skills.test.mjs
// Unit tests for v0.5.0: hackathon replay + hackathon skills catalog.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
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
    const tmp = mkdtempSync(join(tmpdir(), 'hs-replay-'));
    try {
      const stateDir = join(tmp, '.hackathon', 'state');
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(
        join(stateDir, 'verify.json'),
        JSON.stringify({
          version: '1.0',
          started_at: '2026-08-19T08:00:00.000Z',
          status: 'passed',
          steps: [],
        }),
      );
      writeFileSync(
        join(stateDir, 'plan.json'),
        JSON.stringify({
          version: '1.0',
          generated_at: '2026-08-19T07:00:00.000Z',
          demo_goal: 'sign in and save a note',
          features: [],
          demo_path: [],
          next_tasks: [],
        }),
      );
      const r = run(['replay', '-C', tmp, '--json']);
      assert.equal(r.status, 0, r.stderr);
      const payload = JSON.parse(r.stdout);
      assert.ok(payload.state_dir);
      assert.equal(payload.entries.length, 2);
      assert.equal(payload.entries[0].file, 'plan.json');
      assert.equal(payload.entries[1].file, 'verify.json');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('orders time-box.json before stack.json when timestamps tie (v1.2.1)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'hs-replay-tie-'));
    try {
      const stateDir = join(tmp, '.hackathon', 'state');
      mkdirSync(stateDir, { recursive: true });
      const ts = '2026-08-19T09:00:00.000Z';
      writeFileSync(
        join(stateDir, 'stack.json'),
        JSON.stringify({
          version: '1.0',
          generated_at: ts,
          demo_format: 'web',
          recommendation: { stack: 'next', score: 8, rationale: 'r' },
          runners_up: [],
          bootstrap: { steps: [] },
        }),
      );
      writeFileSync(
        join(stateDir, 'time-box.json'),
        JSON.stringify({
          version: '1.0',
          generated_at: ts,
          time_remaining_minutes: 240,
          team_size: 4,
          current_stage: 'build',
          schedule: [],
        }),
      );
      const r = run(['replay', '-C', tmp, '--json']);
      assert.equal(r.status, 0, r.stderr);
      const payload = JSON.parse(r.stdout);
      assert.equal(payload.entries.length, 2);
      assert.equal(payload.entries[0].file, 'time-box.json');
      assert.equal(payload.entries[1].file, 'stack.json');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
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
    assert.equal(pin.version, '1.1');
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
    assert.equal(pin.version, '1.1');
  });
});

