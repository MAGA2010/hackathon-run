import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readState, writeState } from '../../dist/harness/state.js';
import {
  appendTrace,
  readTraces,
  traceFile,
  verifyTraceChain,
} from '../../dist/harness/trace.js';
import { syncVerificationToPlan } from '../../dist/harness/verification.js';
import { computeWorkspaceDigest } from '../../dist/harness/workspace.js';

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'hs-v140-evidence-'));
  mkdirSync(join(repo, '.hackathon', 'state'), { recursive: true });
  writeFileSync(join(repo, 'app.py'), 'print("ok")\n', 'utf8');
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
    demo_path: [
      {
        step: 1,
        action: 'Run auth check',
        expected_outcome: 'ok',
        feature: 'Auth',
        command: 'python -c "print(\\"ok\\")"',
      },
    ],
    next_tasks: [{ priority: 'P0', task: 'Finish Auth', estimate_minutes: 30 }],
  };
}

function passingVerification(workspaceDigest) {
  return {
    version: '1.0',
    started_at: '2026-09-10T00:00:00Z',
    finished_at: '2026-09-10T00:00:01Z',
    workspace_digest: workspaceDigest,
    status: 'pass',
    steps: [
      {
        step: 1,
        action: 'Run auth check',
        command: 'python -c "print(\\"ok\\")"',
        expected_outcome: 'ok',
        actual_outcome: 'ok',
        status: 'pass',
        exit_code: 0,
        stdout_sha256: 'a'.repeat(64),
        stderr_sha256: 'b'.repeat(64),
        cwd: process.cwd(),
        started_at: '2026-09-10T00:00:00Z',
        finished_at: '2026-09-10T00:00:01Z',
      },
    ],
  };
}

describe('v1.4 evidence chain', () => {
  it('writes state atomically without leaving temp or lock files', () => {
    const repo = makeRepo();
    try {
      writeState({ repoRoot: repo, file: 'plan.json', data: validPlan() });
      const stateDir = join(repo, '.hackathon', 'state');
      assert.deepEqual(readdirSync(stateDir), ['plan.json']);
      assert.ok(existsSync(join(stateDir, 'plan.json')));
      assert.ok(!existsSync(join(stateDir, 'plan.json.lock')));
      assert.ok(!existsSync(join(stateDir, '.plan.json.tmp')));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('appends a hash chain and detects tampering', () => {
    const repo = makeRepo();
    try {
      appendTrace(repo, {
        type: 'skill.invoke',
        actor: 'test',
        skill: 'scope-knife',
        status: 'ok',
        summary: 'first',
      });
      appendTrace(repo, {
        type: 'flow.stage.done',
        actor: 'test',
        status: 'ok',
        summary: 'second',
      });

      const events = readTraces(repo);
      assert.equal(events.length, 2);
      assert.equal(events[0].seq, 1);
      assert.equal(events[1].seq, 2);
      assert.equal(events[1].prev_hash, events[0].hash);
      assert.equal(verifyTraceChain(repo).ok, true);

      const target = traceFile(repo);
      const tampered = readFileSync(target, 'utf8').replace('"summary":"first"', '"summary":"edited"');
      writeFileSync(target, tampered, 'utf8');
      const verification = verifyTraceChain(repo);
      assert.equal(verification.ok, false);
      assert.equal(verification.broken_at, 1);
      assert.match(verification.errors.join('\n'), /hash mismatch/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('normalizes legacy events without weakening validation for new events', () => {
    const repo = makeRepo();
    try {
      mkdirSync(join(repo, '.hackathon', 'traces'), { recursive: true });
      const target = traceFile(repo);
      writeFileSync(
        target,
        JSON.stringify({
          at: '2026-09-09T00:00:00Z',
          type: 'legacy.event',
          status: 'ok',
          summary: 'legacy',
        }) + '\n',
        'utf8',
      );
      appendTrace(repo, {
        type: 'flow.stage.done',
        actor: 'test',
        status: 'ok',
        summary: 'signed event',
      });

      const verification = verifyTraceChain(repo);
      assert.equal(verification.ok, true, verification.errors.join('\n'));
      assert.equal(verification.legacy_events, 1);
      assert.equal(verification.events, 2);

      const tampered = readFileSync(target, 'utf8').replace('"summary":"legacy"', '"summary":"edited"');
      writeFileSync(target, tampered, 'utf8');
      const afterTamper = verifyTraceChain(repo);
      assert.equal(afterTamper.ok, false);
      assert.equal(afterTamper.broken_at, 2);
      assert.match(afterTamper.errors.join('\n'), /prev_hash mismatch/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('marks verification stale when the source tree changes', () => {
    const repo = makeRepo();
    try {
      const plan = validPlan();
      writeState({ repoRoot: repo, file: 'plan.json', data: plan });
      const originalDigest = computeWorkspaceDigest(repo);
      writeState({
        repoRoot: repo,
        file: 'verify.json',
        data: passingVerification(originalDigest),
      });
      assert.equal(syncVerificationToPlan(repo).updates[0].passes, true);

      writeFileSync(join(repo, 'app.py'), 'print("changed")\n', 'utf8');
      const result = syncVerificationToPlan(repo);
      assert.equal(result.updates[0].passes, false);
      assert.equal(result.updates[0].stale, true);
      const synced = readState({ repoRoot: repo, file: 'plan.json' });
      assert.equal(synced.features[0].passes, false);
      assert.equal(synced.features[0].evidence.at(-1).status, 'stale');
      assert.equal(synced.features[0].evidence.at(-1).stale, true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
