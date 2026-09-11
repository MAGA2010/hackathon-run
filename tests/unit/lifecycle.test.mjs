// Unit tests for the shared five-stage lifecycle snapshot.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FLOW_STATE_FILES,
  lifecycleSummary,
  readLifecycleSnapshot,
  stateFileComplete,
} from '../../dist/harness/lifecycle.js';
import { buildSkeleton } from '../../dist/cli/commands/run.js';
import { statusResult } from '../../dist/cli/commands/status.js';
import { resumeResult } from '../../dist/cli/commands/resume.js';
import { buildPlan } from '../../dist/cli/commands/flow.js';

const now = () => new Date().toISOString();

function makeStateRepo(files) {
  const repo = mkdtempSync(join(tmpdir(), 'hs-lifecycle-'));
  const stateDir = join(repo, '.hackathon', 'state');
  mkdirSync(stateDir, { recursive: true });
  for (const [file, data] of Object.entries(files)) {
    writeFileSync(join(stateDir, file), JSON.stringify(data, null, 2));
  }
  return repo;
}

function validPlan() {
  return {
    version: '1.0',
    generated_at: now(),
    demo_goal: 'A user signs up and saves a note.',
    time_remaining_minutes: 120,
    features: [],
    demo_path: [{ step: 1, action: 'Open the app.', expected_outcome: 'It renders.' }],
    next_tasks: [],
  };
}

function validVerify() {
  return {
    version: '1.0',
    started_at: now(),
    status: 'pass',
    steps: [],
  };
}

function validDemo() {
  const names = ['opening', 'pain', 'product', 'core_action', 'result', 'close'];
  return {
    version: '1.0',
    duration_seconds: 60,
    one_liner: 'A fast way to save a note.',
    steps: names.map((name, index) => ({
      name,
      max_seconds: 10,
      say: `Line ${index + 1}.`,
      click: `Click ${index + 1}.`,
      show: `Show ${index + 1}.`,
      not: `Avoid ${index + 1}.`,
      risks: [],
    })),
  };
}

function validReview() {
  const names = [
    'problem_clarity',
    'originality',
    'completeness',
    'technical_depth',
    'demo_quality',
    'business_value',
    'submission_readiness',
  ];
  return {
    version: '1.0',
    generated_at: now(),
    overall: 4,
    dimensions: names.map((name) => ({
      name,
      score: 4,
      deduction_reason: `${name} is clear.`,
      judge_questions: ['What changed?', 'Why does it matter?'],
      improvements: [],
    })),
    fix_priorities: { fix_now: [], fix_last_10min: [], do_not_touch: [] },
  };
}

function validShip() {
  return {
    version: '1.0',
    generated_at: now(),
    readme: { present: ['name', 'run'], missing: [] },
    secret_scan: { clean: true, findings: [] },
    checklist: { passed: ['readme'], failed: [] },
    reproducible: { ok: true, reason: 'README + dependency manifest present.' },
    packaging_command: 'tar czf submit.tar.gz --exclude=node_modules .',
  };
}

describe('lifecycle snapshot', () => {
  it('treats every init skeleton as seeded but incomplete', () => {
    const files = Object.fromEntries(
      FLOW_STATE_FILES.map((file) => [file, buildSkeleton(file, { skillName: file })]),
    );
    const repo = makeStateRepo(files);
    try {
      const snapshot = readLifecycleSnapshot(repo);
      assert.equal(snapshot.initialized, true);
      assert.equal(snapshot.lifecycle, 'empty');
      assert.equal(snapshot.cursor, 0);
      assert.equal(snapshot.nextSkill, 'scope-knife');
      for (const file of FLOW_STATE_FILES) {
        assert.equal(snapshot.present[file], true);
        assert.equal(snapshot.complete[file], false);
      }
      assert.equal(lifecycleSummary(snapshot).complete['plan.json'], false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('advances only when each stage artifact is complete', () => {
    const repo = makeStateRepo({
      'plan.json': validPlan(),
      'verify.json': validVerify(),
      'demo.json': validDemo(),
      'review.json': validReview(),
      'ship.json': validShip(),
    });
    try {
      const snapshot = readLifecycleSnapshot(repo);
      assert.equal(snapshot.lifecycle, 'complete');
      assert.equal(snapshot.cursor, 5);
      assert.equal(snapshot.nextSkill, null);
      for (const file of FLOW_STATE_FILES) assert.equal(snapshot.complete[file], true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('returns the same lifecycle snapshot from status, resume, and flow', () => {
    const repo = makeStateRepo({ 'plan.json': validPlan() });
    try {
      const status = statusResult({ cwd: repo });
      const resume = resumeResult({ cwd: repo });
      const flow = buildPlan({ cwd: repo, python: null });
      assert.ok(!('error' in status.data));
      assert.ok(!('error' in resume.data));
      assert.deepEqual(status.data.lifecycle_snapshot, resume.data.lifecycle_snapshot);
      assert.deepEqual(status.data.lifecycle_snapshot, flow.lifecycle_snapshot);
      assert.equal(resume.data.next_stage, 'fast-verify');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('rejects generated placeholder prefixes even when the surrounding shape exists', () => {
    const plan = {
      ...validPlan(),
      demo_goal: '(set via hackathon run scope-knife --demo-goal=...)',
    };
    assert.equal(stateFileComplete('plan.json', plan), false);
  });
});
