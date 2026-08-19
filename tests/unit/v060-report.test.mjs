// tests/unit/v060-report.test.mjs
// Unit tests for v0.6.0: `hackathon report` + the decision-log skill.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
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

function makeProject() {
  const tmp = mkdtempSync(join(tmpdir(), 'hs-report-'));
  const stateDir = join(tmp, '.hackathon', 'state');
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    join(stateDir, 'plan.json'),
    JSON.stringify({
      version: '1.0',
      generated_at: '2026-08-19T07:00:00.000Z',
      demo_goal: 'sign in and save a note',
      features: [
        { name: 'Auth', classification: 'KEEP', status: 'implemented' },
        { name: 'Notes', classification: 'KEEP', status: 'implemented' },
        { name: 'Search', classification: 'CUT', status: 'unstarted' },
      ],
      demo_path: [],
      next_tasks: [],
    }),
  );
  writeFileSync(
    join(stateDir, 'verify.json'),
    JSON.stringify({
      version: '1.0',
      started_at: '2026-08-19T08:00:00.000Z',
      status: 'passed',
      steps: [{ command: 'open /', status: 'pass' }],
    }),
  );
  writeFileSync(
    join(stateDir, 'review.json'),
    JSON.stringify({
      version: '1.0',
      generated_at: '2026-08-19T09:00:00.000Z',
      overall: 4,
      dimensions: [{ name: 'problem_clarity', score: 4, deduction_reason: 'solid' }],
      fix_priorities: { fix_now: [], fix_last_10min: [], do_not_touch: [] },
    }),
  );
  writeFileSync(
    join(stateDir, 'ship.json'),
    JSON.stringify({
      version: '1.0',
      generated_at: '2026-08-19T10:00:00.000Z',
      readme: { present: ['README.md'], missing: [] },
      secret_scan: { clean: true, findings: [] },
      checklist: { passed: ['README exists'], failed: [] },
      reproducible: { ok: true, reason: '' },
      packaging_command: 'echo package',
    }),
  );
  writeFileSync(
    join(stateDir, 'retro.json'),
    JSON.stringify({
      version: '1.0',
      generated_at: '2026-08-19T11:00:00.000Z',
      ratios: {
        scope_accuracy: 0.8,
        time_accuracy: 0.9,
        verify_pass_rate: 1.0,
        judge_score_avg: 4,
      },
      surprises: [],
      keep_doing: ['scoped early'],
      stop_doing: [],
      try_next_time: ['rehearse twice'],
    }),
  );
  return tmp;
}

describe('hackathon report', () => {
  it('renders a markdown report with verdict + sections', () => {
    const tmp = makeProject();
    const r = run(['report', '-C', tmp]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('# Hackathon report'));
    assert.ok(r.stdout.includes('sign in and save a note'));
    assert.ok(r.stdout.includes('SHIP READY'));
    assert.ok(r.stdout.includes('## Timeline'));
    assert.ok(r.stdout.includes('## Judge review'));
    assert.ok(r.stdout.includes('## Retrospective'));
    rmSync(tmp, { recursive: true, force: true });
  });

  it('emits a JSON payload with states and verdict', () => {
    const tmp = makeProject();
    const r = run(['report', '-C', tmp, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.verdict.label, 'SHIP READY');
    assert.ok(payload.states['plan.json']);
    assert.ok(payload.states['ship.json']);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes the markdown report to a file with --out', () => {
    const tmp = makeProject();
    const out = join(tmp, 'REPORT.md');
    const r = run(['report', '-C', tmp, '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(out));
    assert.ok(readFileSync(out, 'utf8').includes('# Hackathon report'));
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('decision-log skill', () => {
  it('validates cleanly against the protocol', () => {
    const r = run(['validate-skill', join(ROOT, 'skills', 'decision-log'), '--json']);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.errors, 0);
  });

  it('writes a valid skeleton with run --apply', () => {
    const r = run(['run', 'decision-log', '--apply']);
    assert.equal(r.status, 0, r.stderr);
    const path = join(ROOT, '.hackathon/state/decision-log.json');
    assert.ok(existsSync(path));
    const data = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(data.version, '1.0');
    assert.ok(Array.isArray(data.entries));
  });
});
