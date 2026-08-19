// tests/unit/diff.test.mjs
// Unit tests for `hackathon diff`.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { diff } from '../../dist/cli/commands/diff.js';

let captured = '';
const origLog = console.log;
before(() => {
  console.log = (...args) => {
    captured += args.join(' ') + '\n';
  };
});
after(() => {
  console.log = origLog;
});

function writePlan(dir, data) {
  mkdirSync(join(dir, '.hackathon', 'state'), { recursive: true });
  writeFileSync(join(dir, '.hackathon', 'state', 'plan.json'), JSON.stringify(data, null, 2));
}

const PLAN_A = {
  version: '1.0',
  generated_at: '2026-01-01T00:00:00Z',
  demo_goal: 'demo A',
  time_remaining_minutes: 60,
  features: [
    {
      name: 'auth',
      status: 'implemented',
      classification: 'KEEP',
      rationale: 'core',
      time_estimate_minutes: 30,
    },
    {
      name: 'search',
      status: 'unimplemented',
      classification: 'CUT',
      rationale: 'out of scope',
      time_estimate_minutes: 120,
    },
  ],
  demo_path: [{ step: 1, action: 'open', expected_outcome: 'loads' }],
  next_tasks: [],
};

const PLAN_B = {
  version: '1.0',
  generated_at: '2026-01-02T00:00:00Z',
  demo_goal: 'demo B',
  time_remaining_minutes: 30,
  features: [
    {
      name: 'auth',
      status: 'implemented',
      classification: 'KEEP',
      rationale: 'core',
      time_estimate_minutes: 30,
    },
    {
      name: 'billing',
      status: 'unimplemented',
      classification: 'DEFER',
      rationale: 'polish',
      time_estimate_minutes: 60,
    },
  ],
  demo_path: [
    { step: 1, action: 'open', expected_outcome: 'loads' },
    { step: 2, action: 'click', expected_outcome: 'next page' },
  ],
  next_tasks: [{ priority: 'P0', task: 'ship', estimate_minutes: 30 }],
};

describe('diff', () => {
  it('returns 0 for two identical files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hs-diff-'));
    writePlan(dir, PLAN_A);
    const file = join(dir, '.hackathon', 'state', 'plan.json');
    captured = '';
    const code = diff({ a: file, b: file });
    assert.equal(code, 0);
    assert.ok(captured.includes('no differences'));
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects added / removed / changed fields', () => {
    const dirA = mkdtempSync(join(tmpdir(), 'hs-diff-'));
    const dirB = mkdtempSync(join(tmpdir(), 'hs-diff-'));
    writePlan(dirA, PLAN_A);
    writePlan(dirB, PLAN_B);
    captured = '';
    const code = diff({
      a: join(dirA, '.hackathon', 'state', 'plan.json'),
      b: join(dirB, '.hackathon', 'state', 'plan.json'),
    });
    assert.equal(code, 1);
    // generated_at changed
    assert.ok(captured.includes('generated_at'));
    // demo_goal changed
    assert.ok(captured.includes('demo_goal'));
    // features[search] removed
    assert.ok(captured.includes('features[search]'));
    // features[billing] added
    assert.ok(captured.includes('features[billing]'));
    // demo_path[2] added
    assert.ok(captured.includes('demo_path[2]'));
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  });

  it('--stat prints counts but no per-field paths', () => {
    const dirA = mkdtempSync(join(tmpdir(), 'hs-diff-'));
    const dirB = mkdtempSync(join(tmpdir(), 'hs-diff-'));
    writePlan(dirA, PLAN_A);
    writePlan(dirB, PLAN_B);
    captured = '';
    diff({
      a: join(dirA, '.hackathon', 'state', 'plan.json'),
      b: join(dirB, '.hackathon', 'state', 'plan.json'),
      stat: true,
    });
    assert.ok(!captured.includes('demo_goal'));
    const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const clean = stripAnsi(captured);
    assert.ok(
      /\+\d+\s+-\d+\s+~\d+/.test(clean),
      'expected +X -Y ~Z summary, got: ' + clean.slice(0, 200),
    );
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  });

  it('--json emits machine-readable output', () => {
    const dirA = mkdtempSync(join(tmpdir(), 'hs-diff-'));
    const dirB = mkdtempSync(join(tmpdir(), 'hs-diff-'));
    writePlan(dirA, PLAN_A);
    writePlan(dirB, PLAN_B);
    captured = '';
    diff({
      a: join(dirA, '.hackathon', 'state', 'plan.json'),
      b: join(dirB, '.hackathon', 'state', 'plan.json'),
      json: true,
    });
    const out = JSON.parse(captured);
    assert.ok(out.totalDiffs > 0);
    assert.ok(Array.isArray(out.files));
    assert.ok(out.files[0].counts.added >= 1);
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  });

  it('compares two directories file-by-file', () => {
    const dirA = mkdtempSync(join(tmpdir(), 'hs-diff-'));
    const dirB = mkdtempSync(join(tmpdir(), 'hs-diff-'));
    writePlan(dirA, PLAN_A);
    writePlan(dirB, PLAN_B);
    captured = '';
    diff({
      a: join(dirA, '.hackathon', 'state'),
      b: join(dirB, '.hackathon', 'state'),
      stat: true,
    });
    assert.ok(captured.includes('plan.json'), 'expected plan.json header');
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  });

  it('returns 2 if either path is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hs-diff-'));
    captured = '';
    const code = diff({ a: join(dir, 'no.json'), b: join(dir, 'also-no.json') });
    assert.equal(code, 2);
    rmSync(dir, { recursive: true, force: true });
  });
});
