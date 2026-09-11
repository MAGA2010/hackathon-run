// tests/unit/status.test.mjs
// Unit tests for the status command lifecycle derivation + summary logic.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { status } from '../../dist/cli/commands/status.js';

/** Create a fake repo with .hackathon/state/ and the listed files. */
function makeRepo(files) {
  const repo = mkdtempSync(join(tmpdir(), 'hs-status-'));
  mkdirSync(join(repo, '.hackathon', 'state'), { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(join(repo, '.hackathon', 'state', name), JSON.stringify(data, null, 2));
  }
  return repo;
}

const now = () => new Date().toISOString();

function validPlan() {
  return {
    version: '1.0',
    generated_at: now(),
    demo_goal: 'A user signs up and saves a note.',
    time_remaining_minutes: 180,
    features: [
      {
        name: 'Auth',
        status: 'implemented',
        classification: 'KEEP',
        rationale: 'Core demo path.',
        passes: true,
      },
    ],
    demo_path: [
      {
        step: 1,
        action: 'Open the app.',
        expected_outcome: 'The landing page renders.',
      },
    ],
    next_tasks: [{ priority: 'P0', task: 'Rehearse the pitch.', estimate_minutes: 20 }],
  };
}

function validVerify() {
  return {
    version: '1.0',
    started_at: now(),
    finished_at: now(),
    status: 'pass',
    steps: [
      {
        step: 1,
        action: 'Open the app.',
        status: 'pass',
      },
    ],
  };
}

function validDemo() {
  const names = ['opening', 'pain', 'product', 'core_action', 'result', 'close'];
  return {
    version: '1.0',
    generated_at: now(),
    duration_seconds: 60,
    one_liner: 'A fast way to save your first note.',
    steps: names.map((name, index) => ({
      name,
      max_seconds: 10,
      say: `Step ${index + 1} says what the product does.`,
      click: `Action ${index + 1}.`,
      show: `Result ${index + 1}.`,
      not: `Avoid mistake ${index + 1}.`,
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
    fix_priorities: {
      fix_now: [],
      fix_last_10min: [],
      do_not_touch: [],
    },
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

describe('status command lifecycle', () => {
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

  it("returns 1 with 'missing' message when .hackathon/state/ absent", () => {
    const repo = mkdtempSync(join(tmpdir(), 'hs-empty-'));
    captured = '';
    const code = status({ cwd: repo, json: true });
    assert.equal(code, 1);
    const out = JSON.parse(captured.trim());
    assert.equal(out.initialized, false);
    assert.equal(out.lifecycle, 'empty');
    assert.equal(out.nextSuggestion, 'hackathon init then hackathon run scope-knife');
    rmSync(repo, { recursive: true, force: true });
  });

  it('reports lifecycle=scoping when only plan.json present', () => {
    const repo = makeRepo({ 'plan.json': validPlan() });
    captured = '';
    const code = status({ cwd: repo, json: true });
    assert.equal(code, 0);
    const out = JSON.parse(captured.trim());
    assert.equal(out.initialized, true);
    assert.equal(out.lifecycle, 'scoping');
    assert.ok(out.files['plan.json'].present);
    assert.equal(out.files['plan.json'].complete, true);
    assert.ok(out.files['verify.json'].present === false);
    assert.ok(out.files['plan.json'].highlights.some((h) => h.includes('1 KEEP')));
    rmSync(repo, { recursive: true, force: true });
  });

  it('does not count init placeholder files as completed stages', () => {
    const repo = makeRepo({
      'plan.json': {
        version: '1.0',
        generated_at: now(),
        demo_goal: '(set via hackathon run scope-knife --demo-goal=...)',
        time_remaining_minutes: 0,
        features: [],
        demo_path: [],
        next_tasks: [],
      },
      'verify.json': { version: '1.0', started_at: now(), status: 'skipped', steps: [] },
      'demo.json': {
        version: '1.0',
        duration_seconds: 60,
        one_liner: '(set via hackathon run demo-coach --demo-goal=...)',
        steps: [],
      },
      'review.json': {
        version: '1.0',
        generated_at: now(),
        overall: 0,
        dimensions: [],
        fix_priorities: { fix_now: [], fix_last_10min: [], do_not_touch: [] },
      },
      'ship.json': {
        version: '1.0',
        generated_at: now(),
        secret_scan: { clean: true, findings: [] },
        checklist: { passed: [], failed: [] },
        reproducible: { ok: false, reason: '' },
        packaging_command: 'echo "fill in the tar command"',
      },
    });
    captured = '';
    const code = status({ cwd: repo, json: true });
    assert.equal(code, 0);
    const out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'empty');
    assert.equal(out.cursor, 0);
    assert.equal(out.nextSkill, 'scope-knife');
    assert.equal(out.lifecycle_snapshot.complete['plan.json'], false);
    for (const file of ['plan.json', 'verify.json', 'demo.json', 'review.json', 'ship.json']) {
      assert.equal(out.files[file].present, true);
      assert.equal(out.files[file].complete, false);
    }
    rmSync(repo, { recursive: true, force: true });
  });

  it('progresses through all 5 stages', () => {
    let repo = makeRepo({ 'plan.json': validPlan() });
    captured = '';
    status({ cwd: repo, json: true });
    let out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'scoping');

    rmSync(repo, { recursive: true, force: true });
    repo = makeRepo({
      'plan.json': validPlan(),
      'verify.json': validVerify(),
    });
    captured = '';
    status({ cwd: repo, json: true });
    out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'verifying');

    rmSync(repo, { recursive: true, force: true });
    repo = makeRepo({
      'plan.json': validPlan(),
      'verify.json': validVerify(),
      'demo.json': validDemo(),
    });
    captured = '';
    status({ cwd: repo, json: true });
    out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'demoing');

    rmSync(repo, { recursive: true, force: true });
    repo = makeRepo({
      'plan.json': validPlan(),
      'verify.json': validVerify(),
      'demo.json': validDemo(),
      'review.json': validReview(),
    });
    captured = '';
    status({ cwd: repo, json: true });
    out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'judging');

    rmSync(repo, { recursive: true, force: true });
    repo = makeRepo({
      'plan.json': validPlan(),
      'verify.json': validVerify(),
      'demo.json': validDemo(),
      'review.json': validReview(),
      'ship.json': validShip(),
    });
    captured = '';
    status({ cwd: repo, json: true });
    out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'complete');

    rmSync(repo, { recursive: true, force: true });
  });

  it('reports shipping when ship.json exists but the audit has not passed', () => {
    const repo = makeRepo({
      'plan.json': validPlan(),
      'verify.json': validVerify(),
      'demo.json': validDemo(),
      'review.json': validReview(),
      'ship.json': {
        ...validShip(),
        secret_scan: { clean: false, findings: [{ file: '.env', pattern: '.env file', line: 1 }] },
      },
    });
    captured = '';
    status({ cwd: repo, json: true });
    const out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'shipping');
    assert.equal(out.lifecycle_snapshot.complete['ship.json'], false);
    rmSync(repo, { recursive: true, force: true });
  });

  it('warns when a state file has no generated_at timestamp', () => {
    const repo = makeRepo({
      'plan.json': {
        demo_goal: 'x',
        features: [],
        demo_path: [],
        next_tasks: [],
      },
    });
    captured = '';
    status({ cwd: repo, json: true });
    const out = JSON.parse(captured.trim());
    assert.ok(out.warnings.some((w) => w.includes('plan.json') && w.includes('generated_at')));
    rmSync(repo, { recursive: true, force: true });
  });

  it('emits nextSuggestion for each lifecycle', () => {
    const data = {
      generated_at: new Date().toISOString(),
      demo_goal: 'x',
      features: [],
      demo_path: [],
      next_tasks: [],
    };
    const repo = makeRepo({ 'plan.json': data });
    captured = '';
    status({ cwd: repo, json: true });
    const out = JSON.parse(captured.trim());
    assert.ok(out.nextSuggestion && out.nextSuggestion.length > 0);
    rmSync(repo, { recursive: true, force: true });
  });
});
