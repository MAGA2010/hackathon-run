// tests/unit/v050-run.test.mjs
// Unit tests for v0.5.0: `hackathon run --apply` flag parsing + skeleton builders.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = 'D:/personal skill';
const CLI = join(ROOT, 'dist/cli/index.js');

function run(args, opts = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env },
  });
}

describe('hackathon run --apply', () => {
  it('prints SKILL.md body by default (no --apply)', () => {
    const r = run(['run', 'scope-knife']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('# scope-knife'));
    assert.ok(r.stdout.includes('## Input contract'));
  });

  it('rejects unknown flags loudly', () => {
    const r = run(['run', 'scope-knife', '--bogus']);
    assert.notEqual(r.status, 0);
    assert.ok(/unknown option/i.test(r.stderr));
  });

  it('--no-banner skips the header', () => {
    const r = run(['run', 'scope-knife', '--no-banner']);
    assert.equal(r.status, 0);
    assert.ok(!r.stdout.includes('# Skill: scope-knife'));
  });

  it('writes plan.json when --apply is given', () => {
    const r = run(['run', 'scope-knife', '--demo-goal', 'sign up + save note', '--time-remaining', '120', '--apply']);
    assert.equal(r.status, 0, r.stderr);
    const planPath = join(ROOT, '.hackathon/state/plan.json');
    assert.ok(existsSync(planPath));
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    assert.equal(plan.demo_goal, 'sign up + save note');
    assert.equal(plan.time_remaining_minutes, 120);
  });

  it('writes time-box.json with --team-size and --time-remaining', () => {
    const r = run(['run', 'time-box', '--team-size', '4', '--time-remaining', '180', '--apply']);
    assert.equal(r.status, 0, r.stderr);
    const tbPath = join(ROOT, '.hackathon/state/time-box.json');
    assert.ok(existsSync(tbPath));
    const tb = JSON.parse(readFileSync(tbPath, 'utf8'));
    assert.equal(tb.team_size, 4);
    assert.equal(tb.time_remaining_minutes, 180);
  });

  it('writes a valid skeleton for every skill with --apply', () => {
    const skills = ['scope-knife', 'time-box', 'demo-coach', 'ship-pack', 'recovery-runbook', 'judge-sim', 'fast-verify', 'stack-picker', 'demo-rehearsal', 'team-roster'];
    for (const s of skills) {
      const r = run(['run', s, '--apply']);
      assert.equal(r.status, 0, s + ': ' + r.stderr);
    }
    const files = readdirSync(join(ROOT, '.hackathon/state'));
    assert.ok(files.includes('plan.json'));
    assert.ok(files.includes('time-box.json'));
    assert.ok(files.includes('demo.json'));
    assert.ok(files.includes('ship.json'));
    assert.ok(files.includes('recovery.json'));
    assert.ok(files.includes('review.json'));
    assert.ok(files.includes('verify.json'));
    assert.ok(files.includes('stack.json'));
    assert.ok(files.includes('rehearsal.json'));
    assert.ok(files.includes('roster.json'));
  });

  it('fails loudly on unknown skill', () => {
    const r = run(['run', 'no-such-skill']);
    assert.equal(r.status, 2);
    assert.ok(/skill not found/i.test(r.stdout + r.stderr));
  });
});
