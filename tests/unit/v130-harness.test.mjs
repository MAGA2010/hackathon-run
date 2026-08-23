// Unit tests for v1.3 harness primitives: session, sprint, trace, resume.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { defaultSession, readSession, writeSession } from '../../dist/harness/session.js';
import {
  defaultSprint,
  readSprint,
  writeSprint,
  sprintFromPlan,
  enforceSprintBudget,
} from '../../dist/harness/sprint.js';
import { appendTrace, readTraces, traceStats } from '../../dist/harness/trace.js';
import { writeState } from '../../dist/harness/state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
const CLI = join(ROOT, 'dist', 'cli', 'index.js');

let tmp;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'hs-v130-'));
});
after(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function makeHarnessRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'hs-v130-repo-'));
  mkdirSync(join(repo, '.hackathon', 'state'), { recursive: true });
  return repo;
}

function validPlan() {
  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    demo_goal: 'sign up and save a note',
    time_remaining_minutes: 120,
    features: [
      {
        name: 'Auth',
        status: 'implemented',
        classification: 'KEEP',
        rationale: 'core',
        passes: false,
        acceptance_criteria: ['A user can sign up and see the dashboard.'],
        evidence: [],
      },
    ],
    demo_path: [{ step: 1, action: 'Open app', expected_outcome: 'Loads' }],
    next_tasks: [{ priority: 'P0', task: 'Finish Auth', estimate_minutes: 30 }],
  };
}

describe('session handoff', () => {
  it('round-trips a session and keeps generated_at stable', () => {
    const repo = makeHarnessRepo();
    const session = defaultSession(repo, {
      current_stage: 'building',
      next_task: 'Build Auth against sprint-1',
      environment: { init_command: 'npm run dev' },
    });
    writeSession(repo, session);
    const back = readSession(repo);
    assert.ok(back);
    assert.equal(back.current_stage, 'building');
    assert.equal(back.next_task, 'Build Auth against sprint-1');
    assert.equal(back.environment.init_command, 'npm run dev');
    rmSync(repo, { recursive: true, force: true });
  });
});

describe('sprint contract', () => {
  it('creates a default-FAIL contract from the first unpassed KEEP feature', () => {
    const repo = makeHarnessRepo();
    writeState({ repoRoot: repo, file: 'plan.json', data: validPlan() });
    const sprint = sprintFromPlan(validPlan());
    assert.equal(sprint.feature, 'Auth');
    assert.equal(sprint.status, 'proposed');
    assert.equal(sprint.criteria.length, 1);
    assert.equal(sprint.criteria[0].passes, false);
    writeSprint(repo, sprint);
    assert.ok(readSprint(repo));
    rmSync(repo, { recursive: true, force: true });
  });

  it('enforces iteration and time gates', () => {
    const sprint = defaultSprint({ iterations: 3, max_iterations: 3 });
    const blocked = enforceSprintBudget(sprint);
    assert.equal(blocked.within, false);
    assert.match(blocked.reason ?? '', /iteration budget exhausted/);
  });
});

describe('trace log', () => {
  it('appends and reads JSONL events', () => {
    const repo = makeHarnessRepo();
    appendTrace(repo, {
      type: 'sprint.review',
      actor: 'cli',
      status: 'ok',
      summary: 'reviewed sprint-1',
    });
    appendTrace(repo, {
      type: 'flow.stage.done',
      actor: 'cli',
      skill: 'scope-knife',
      status: 'ok',
      summary: 'plan complete',
    });
    const events = readTraces(repo);
    assert.equal(events.length, 2);
    assert.equal(events[1].type, 'flow.stage.done');
    const stats = traceStats(repo);
    assert.equal(stats.count, 2);
    rmSync(repo, { recursive: true, force: true });
  });
});

describe('resume CLI', () => {
  it('prints a JSON handoff brief for a fresh agent', () => {
    const repo = makeHarnessRepo();
    writeState({ repoRoot: repo, file: 'plan.json', data: validPlan() });
    const r = spawnSync(process.execPath, [CLI, 'resume', '--json', '-C', repo], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.session.current_stage, 'planning');
    assert.equal(payload.plan.next_feature, 'Auth');
    assert.equal(payload.plan.passing_features, 0);
    assert.ok(payload.trace);
    rmSync(repo, { recursive: true, force: true });
  });

  it('trace CLI returns the appended events as JSON', () => {
    const repo = makeHarnessRepo();
    appendTrace(repo, {
      type: 'skill.invoke',
      actor: 'test',
      skill: 'scope-knife',
      status: 'ok',
      summary: 'traced',
    });
    const r = spawnSync(process.execPath, [CLI, 'trace', '--json', '-C', repo], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.total, 1);
    assert.equal(payload.events[0].type, 'skill.invoke');
    rmSync(repo, { recursive: true, force: true });
  });
});
