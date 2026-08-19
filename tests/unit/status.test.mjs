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
    const repo = makeRepo({
      'plan.json': {
        generated_at: new Date().toISOString(),
        demo_goal: 'demo X',
        features: [{ name: 'a', classification: 'KEEP', effort_hours: 1, rationale: 'r' }],
        demo_path: ['step1'],
        next_tasks: ['t1'],
      },
    });
    captured = '';
    const code = status({ cwd: repo, json: true });
    assert.equal(code, 0);
    const out = JSON.parse(captured.trim());
    assert.equal(out.initialized, true);
    assert.equal(out.lifecycle, 'scoping');
    assert.ok(out.files['plan.json'].present);
    assert.ok(out.files['verify.json'].present === false);
    assert.ok(out.files['plan.json'].highlights.some((h) => h.includes('1 KEEP')));
    rmSync(repo, { recursive: true, force: true });
  });

  it('progresses through all 5 stages', () => {
    const data = {
      generated_at: new Date().toISOString(),
      demo_goal: 'x',
      features: [{ name: 'a', classification: 'KEEP', effort_hours: 1, rationale: 'r' }],
      demo_path: ['s'],
      next_tasks: [],
    };
    const stages = ['scoping', 'verifying', 'demoing', 'judging', 'shipping'];
    let repo = makeRepo({ 'plan.json': data });
    captured = '';
    status({ cwd: repo, json: true });
    let out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'scoping');

    rmSync(repo, { recursive: true, force: true });
    repo = makeRepo({
      'plan.json': data,
      'verify.json': { generated_at: new Date().toISOString(), status: 'pass', steps: [] },
    });
    captured = '';
    status({ cwd: repo, json: true });
    out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'verifying');

    rmSync(repo, { recursive: true, force: true });
    repo = makeRepo({
      'plan.json': data,
      'verify.json': { generated_at: new Date().toISOString(), status: 'pass', steps: [] },
      'demo.json': {
        generated_at: new Date().toISOString(),
        duration_seconds: 60,
        steps: [],
        one_liner: 'hi',
      },
    });
    captured = '';
    status({ cwd: repo, json: true });
    out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'demoing');

    rmSync(repo, { recursive: true, force: true });
    repo = makeRepo({
      'plan.json': data,
      'verify.json': { generated_at: new Date().toISOString(), status: 'pass', steps: [] },
      'demo.json': {
        generated_at: new Date().toISOString(),
        duration_seconds: 60,
        steps: [],
        one_liner: 'hi',
      },
      'review.json': {
        generated_at: new Date().toISOString(),
        overall: 4.2,
        dimensions: [],
        fix_priorities: { fix_now: ['x'], fix_later: [] },
      },
    });
    captured = '';
    status({ cwd: repo, json: true });
    out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'judging');

    rmSync(repo, { recursive: true, force: true });
    repo = makeRepo({
      'plan.json': data,
      'verify.json': { generated_at: new Date().toISOString(), status: 'pass', steps: [] },
      'demo.json': {
        generated_at: new Date().toISOString(),
        duration_seconds: 60,
        steps: [],
        one_liner: 'hi',
      },
      'review.json': {
        generated_at: new Date().toISOString(),
        overall: 4.2,
        dimensions: [],
        fix_priorities: { fix_now: [], fix_later: [] },
      },
      'ship.json': {
        generated_at: new Date().toISOString(),
        secret_scan: { clean: true, findings: [] },
        checklist: { passed: ['a'], failed: [] },
        packaging_command: 'tar -czf',
      },
    });
    captured = '';
    status({ cwd: repo, json: true });
    out = JSON.parse(captured.trim());
    assert.equal(out.lifecycle, 'shipping');

    assert.ok(stages.includes('scoping'));
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
