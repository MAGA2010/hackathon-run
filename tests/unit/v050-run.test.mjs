// tests/unit/v050-run.test.mjs
// Unit tests for v0.5.0: `hackathon run --apply` flag parsing + skeleton builders.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    env: { ...process.env },
  });
}

// Apply targets must run in an isolated repo: the dogfood .hackathon/state/
// in the repository root can hold complete artifacts, and --apply refuses to
// overwrite those by design. `init` has no -C flag, so run it with cwd set.
function isolatedRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'hackathon-run-apply-'));
  const bootstrap = spawnSync(process.execPath, [CLI, 'init', '-y'], {
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env },
  });
  if (bootstrap.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error('init failed in isolated repo: ' + bootstrap.stderr);
  }
  return dir;
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
    const dir = isolatedRepo();
    try {
      const r = run([
        'run',
        'scope-knife',
        '--demo-goal',
        'sign up + save note',
        '--time-remaining',
        '120',
        '--apply',
        '-C',
        dir,
      ]);
      assert.equal(r.status, 0, r.stderr);
      const planPath = join(dir, '.hackathon/state/plan.json');
      assert.ok(existsSync(planPath));
      const plan = JSON.parse(readFileSync(planPath, 'utf8'));
      assert.equal(plan.demo_goal, 'sign up + save note');
      assert.equal(plan.time_remaining_minutes, 120);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes time-box.json with --team-size and --time-remaining', () => {
    const dir = isolatedRepo();
    try {
      const r = run([
        'run',
        'time-box',
        '--team-size',
        '4',
        '--time-remaining',
        '180',
        '--apply',
        '-C',
        dir,
      ]);
      assert.equal(r.status, 0, r.stderr);
      const tbPath = join(dir, '.hackathon/state/time-box.json');
      assert.ok(existsSync(tbPath));
      const tb = JSON.parse(readFileSync(tbPath, 'utf8'));
      assert.equal(tb.team_size, 4);
      assert.equal(tb.time_remaining_minutes, 180);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a valid skeleton for every skill with --apply', () => {
    const dir = isolatedRepo();
    try {
      const skills = [
        'scope-knife',
        'time-box',
        'demo-coach',
        'ship-pack',
        'recovery-runbook',
        'judge-sim',
        'fast-verify',
        'stack-picker',
        'demo-rehearsal',
        'team-roster',
      ];
      for (const s of skills) {
        const r = run(['run', s, '--apply', '-C', dir]);
        assert.equal(r.status, 0, s + ': ' + r.stderr);
      }
      const files = readdirSync(join(dir, '.hackathon/state'));
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
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite a complete artifact with a skeleton without --force', () => {
    const dir = isolatedRepo();
    try {
      // The seeded plan skeleton is not "complete" by design; complete it the
      // way a real scope-knife run would before testing the overwrite guard.
      const planPath = join(dir, '.hackathon/state/plan.json');
      const seeded = JSON.parse(readFileSync(planPath, 'utf8'));
      seeded.demo_goal = 'sign up + save note';
      seeded.demo_path = [{ step: 1, action: 'Open', expected_outcome: 'visible' }];
      seeded.next_tasks = [{ priority: 'P0', task: 'build demo path', estimate_minutes: 30 }];
      writeFileSync(planPath, JSON.stringify(seeded));

      const blocked = run([
        'run',
        'scope-knife',
        '--demo-goal',
        'clobber attempt',
        '--apply',
        '-C',
        dir,
      ]);
      assert.notEqual(blocked.status, 0);
      assert.match(blocked.stderr, /--force/);
      const plan = JSON.parse(readFileSync(planPath, 'utf8'));
      assert.equal(plan.demo_goal, 'sign up + save note');

      const forced = run([
        'run',
        'scope-knife',
        '--demo-goal',
        'deliberate reset',
        '--apply',
        '--force',
        '-C',
        dir,
      ]);
      assert.equal(forced.status, 0, forced.stderr);
      const reset = JSON.parse(readFileSync(planPath, 'utf8'));
      assert.equal(reset.demo_goal, 'deliberate reset');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails loudly on unknown skill', () => {
    const r = run(['run', 'no-such-skill']);
    assert.equal(r.status, 2);
    assert.ok(/skill not found/i.test(r.stdout + r.stderr));
  });
});
