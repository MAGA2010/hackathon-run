// tests/unit/flow.test.mjs
// Unit tests for the `hackathon flow` planning command.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildPlan, flow } from '../../dist/cli/commands/flow.js';

// Strip ANSI escape codes for substring assertions.
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

let captured = '';
const origLog = console.log;
const origWarn = console.warn;
before(() => {
  console.log = (...args) => {
    captured += args.join(' ') + '\n';
  };
  console.warn = (...args) => {
    captured += args.join(' ') + '\n';
  };
});
after(() => {
  console.log = origLog;
  console.warn = origWarn;
});

function makeRepo(files) {
  const repo = mkdtempSync(join(tmpdir(), 'hs-flow-'));
  mkdirSync(join(repo, '.hackathon', 'state'), { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(join(repo, '.hackathon', 'state', name), JSON.stringify(data, null, 2));
  }
  return repo;
}

const emptyPlan = () => ({
  version: '1.0',
  generated_at: new Date().toISOString(),
  demo_goal: 'x',
  time_remaining_minutes: 60,
  features: [],
  demo_path: [],
  next_tasks: [],
});

describe('buildPlan', () => {
  it('flags uninitialized repo', () => {
    const repo = mkdtempSync(join(tmpdir(), 'hs-flow-empty-'));
    const plan = buildPlan({ cwd: repo });
    assert.equal(plan.initialized, false);
    assert.equal(plan.cursor, 0);
    assert.equal(plan.stages.length, 5);
    rmSync(repo, { recursive: true, force: true });
  });

  it('marks stage 1 done when plan.json exists', () => {
    const repo = makeRepo({ 'plan.json': emptyPlan() });
    const plan = buildPlan({ cwd: repo });
    assert.equal(plan.stages[0].done, true);
    assert.equal(plan.cursor, 1);
    rmSync(repo, { recursive: true, force: true });
  });

  it('marks all stages done when all 5 files exist', () => {
    const repo = makeRepo({
      'plan.json': emptyPlan(),
      'verify.json': {
        version: '1.0',
        started_at: new Date().toISOString(),
        status: 'pass',
        steps: [],
      },
      'demo.json': { version: '1.0', duration_seconds: 60, one_liner: 'x', steps: [] },
      'review.json': {
        version: '1.0',
        overall: 4,
        dimensions: [],
        fix_priorities: { fix_now: [], fix_later: [] },
      },
      'ship.json': {
        version: '1.0',
        secret_scan: { clean: true, findings: [] },
        checklist: { passed: [], failed: [] },
        packaging_command: '',
      },
    });
    const plan = buildPlan({ cwd: repo });
    assert.equal(plan.cursor, 5);
    assert.equal(plan.nextCommand, null);
    rmSync(repo, { recursive: true, force: true });
  });

  it('resolves {repoRoot} placeholder in commands', () => {
    const repo = mkdtempSync(join(tmpdir(), 'hs-flow-cmds-'));
    const plan = buildPlan({ cwd: repo });
    for (const stage of plan.stages) {
      for (const cmd of stage.commands) {
        assert.ok(!cmd.includes('{repoRoot}'), 'unresolved placeholder in ' + cmd);
      }
    }
    rmSync(repo, { recursive: true, force: true });
  });
});

describe('flow', () => {
  it('returns 1 and prints warning on uninitialized repo', () => {
    const repo = mkdtempSync(join(tmpdir(), 'hs-flow-noinit-'));
    captured = '';
    const code = flow({ cwd: repo, json: false });
    assert.equal(code, 1);
    const clean = stripAnsi(captured);
    assert.ok(clean.includes('not found'), 'expected warning in: ' + clean);
    rmSync(repo, { recursive: true, force: true });
  });

  it("returns 0 and prints 'Ready to ship' when fully done", () => {
    const repo = makeRepo({
      'plan.json': emptyPlan(),
      'verify.json': {
        version: '1.0',
        started_at: new Date().toISOString(),
        status: 'pass',
        steps: [],
      },
      'demo.json': { version: '1.0', duration_seconds: 60, one_liner: 'x', steps: [] },
      'review.json': {
        version: '1.0',
        overall: 4,
        dimensions: [],
        fix_priorities: { fix_now: [], fix_later: [] },
      },
      'ship.json': {
        version: '1.0',
        secret_scan: { clean: true, findings: [] },
        checklist: { passed: [], failed: [] },
        packaging_command: '',
      },
    });
    captured = '';
    const code = flow({ cwd: repo, json: false });
    assert.equal(code, 0);
    const clean = stripAnsi(captured);
    assert.ok(clean.includes('Ready to ship'));
    rmSync(repo, { recursive: true, force: true });
  });

  it('emits JSON plan with --json flag', () => {
    const repo = mkdtempSync(join(tmpdir(), 'hs-flow-json-'));
    captured = '';
    flow({ cwd: repo, json: true });
    const out = JSON.parse(captured);
    assert.equal(typeof out.cursor, 'number');
    assert.equal(out.stages.length, 5);
    assert.equal(out.stages[0].skill, 'scope-knife');
    rmSync(repo, { recursive: true, force: true });
  });
});
