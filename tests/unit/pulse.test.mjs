// tests/unit/pulse.test.mjs
// Verify the v1.6 pulse layer: live clock, stage burn, and recovery evidence.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { computePulse } from '../../dist/harness/pulse.js';

function makeRepo(files) {
  const repo = mkdtempSync(join(tmpdir(), 'hs-pulse-'));
  const stateDir = join(repo, '.hackathon', 'state');
  mkdirSync(stateDir, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(join(stateDir, name), JSON.stringify(data, null, 2));
  }
  return repo;
}

describe('pulse v1.6', () => {
  it('returns null when no time/risk evidence exists', () => {
    const repo = mkdtempSync(join(tmpdir(), 'hs-pulse-empty-'));
    assert.equal(computePulse({ cwd: repo }), null);
    rmSync(repo, { recursive: true, force: true });
  });

  it('derives remaining time and current-stage burn rate', () => {
    const now = new Date('2026-10-04T10:00:00.000Z');
    const repo = makeRepo({
      'time-box.json': {
        version: '1.0',
        generated_at: '2026-10-04T09:50:00.000Z',
        deadline_at: '2026-10-04T11:50:00.000Z',
        time_remaining_minutes: 120,
        team_size: 4,
        current_stage: 'build',
        elapsed_minutes: 20,
        current_stage_started_at: '2026-10-04T09:30:00.000Z',
        current_stage_budget_minutes: 60,
        schedule: [
          {
            stage: 'verify',
            start_in_minutes: 0,
            duration_minutes: 30,
            ends_at_minute: 30,
            exit_criteria: 'every demo_path step passes',
            alarm_at_minutes: [15, 24, 30],
          },
        ],
        alarms: [
          { stage: 'verify', threshold: 0.5, at_minute: 15, severity: 'soft' },
          { stage: 'verify', threshold: 0.8, at_minute: 24, severity: 'firm' },
          { stage: 'verify', threshold: 1, at_minute: 30, severity: 'hard' },
        ],
      },
    });

    const pulse = computePulse({ cwd: repo, now });
    assert.ok(pulse);
    assert.equal(pulse.available, true);
    assert.equal(pulse.minutes_elapsed, 10);
    assert.equal(pulse.minutes_remaining, 110);
    assert.equal(pulse.stage?.stage, 'build');
    assert.equal(pulse.stage?.elapsed_minutes, 30);
    assert.equal(pulse.stage?.burn_rate, 0.5);
    assert.equal(pulse.stage?.state, 'on-track');
    assert.equal(pulse.recommended_action, 'demo-rehearsal');
    rmSync(repo, { recursive: true, force: true });
  });

  it('recommends a rehearsal after drift even when no step is broken', () => {
    const repo = makeRepo({
      'rehearsal.json': {
        version: '1.0',
        started_at: '2026-10-04T09:55:00.000Z',
        target_total_seconds: 60,
        total_seconds: 64,
        within_budget: true,
        verdict: 'mixed',
        segments: [
          {
            step: 1,
            action: 'open app',
            budget_seconds: 20,
            actual_seconds: 24,
            score: 6,
            class: 'drift',
          },
        ],
        risks: [
          {
            step: 1,
            action: 'open app',
            class: 'drift',
            overrun_seconds: 4,
            recommendation: 'trim one sentence or add a breath',
          },
        ],
        fixes: [],
      },
    });
    const pulse = computePulse({ cwd: repo });
    assert.equal(pulse?.rehearsal.drift_steps, 1);
    assert.equal(pulse?.rehearsal.broken_steps, 0);
    assert.equal(pulse?.recommended_action, 'demo-rehearsal');
    rmSync(repo, { recursive: true, force: true });
  });

  it('combines verification and rehearsal failures into recovery evidence', () => {
    const now = new Date('2026-10-04T10:00:00.000Z');
    const repo = makeRepo({
      'verify.json': {
        version: '1.0',
        started_at: '2026-10-04T09:58:00.000Z',
        status: 'fail',
        steps: [
          {
            step: 1,
            action: 'open app',
            status: 'fail',
            error_signature: 'connection refused',
            diagnosis: { likely_cause: 'server down', minimal_fix: 'npm run dev' },
          },
        ],
      },
      'rehearsal.json': {
        version: '1.0',
        started_at: '2026-10-04T09:55:00.000Z',
        target_total_seconds: 60,
        total_seconds: 72,
        within_budget: false,
        verdict: 'rewrite-needed',
        segments: [
          {
            step: 2,
            action: 'save note',
            budget_seconds: 20,
            actual_seconds: 32,
            score: 2,
            class: 'broken',
          },
        ],
        risks: [
          {
            step: 2,
            action: 'save note',
            class: 'broken',
            overrun_seconds: 12,
            recommendation: 'replace save-note wording',
          },
        ],
        fixes: [
          {
            step: 2,
            cut: 'drop one sentence',
            keep: 'the core action phrase',
            new_budget_seconds: 15,
          },
        ],
      },
    });

    const pulse = computePulse({ cwd: repo, now });
    assert.ok(pulse);
    assert.equal(pulse.verification.failed_steps, 1);
    assert.equal(pulse.rehearsal.broken_steps, 1);
    assert.equal(pulse.recovery_evidence.risk_level, 'high');
    assert.equal(pulse.recovery_evidence.suggested_severity, 'P1');
    assert.equal(pulse.rehearsal.risks[0]?.recommendation, 'replace save-note wording');
    assert.equal(pulse.recovery_evidence.likely_failures.length, 2);
    assert.equal(pulse.recommended_action, 'fast-verify');
    rmSync(repo, { recursive: true, force: true });
  });
});
