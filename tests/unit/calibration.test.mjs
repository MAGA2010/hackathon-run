// tests/unit/calibration.test.mjs
// Unit tests for the v1.7 pulse→retro calibration extractor.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
const CLI = join(ROOT, 'dist/cli/index.js');

const { buildCalibration } = await import(
  pathToFileURL(join(ROOT, 'dist/harness/calibration.js')).href
);

function writeState(dir, file, data) {
  const stateDir = join(dir, '.hackathon', 'state');
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, file), JSON.stringify(data, null, 2));
}

describe('buildCalibration', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'calibration-'));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null without time-box.json', () => {
    assert.equal(buildCalibration(dir), null);
  });

  it('returns null for a seeded time-box (empty schedule)', () => {
    writeState(dir, 'time-box.json', {
      version: '1.0',
      generated_at: '2026-10-14T00:00:00.000Z',
      time_remaining_minutes: 0,
      team_size: 1,
      current_stage: 'build',
      schedule: [],
    });
    assert.equal(buildCalibration(dir), null);
  });

  it('computes planned vs observed totals and stage overruns', () => {
    writeState(dir, 'time-box.json', {
      version: '1.0',
      generated_at: '2026-10-14T00:00:00.000Z',
      team_size: 4,
      deadline_at: '2026-10-14T08:00:00.000Z',
      time_remaining_minutes: 60,
      buffer_minutes: 30,
      current_stage: 'verify',
      elapsed_minutes: 260,
      burn_rate: 1.4,
      slipping: true,
      schedule: [
        {
          stage: 'build',
          start_in_minutes: 0,
          duration_minutes: 180,
          ends_at_minute: 180,
          exit_criteria: 'core works',
          alarm_at_minutes: [90],
        },
        {
          stage: 'verify',
          start_in_minutes: 180,
          duration_minutes: 60,
          ends_at_minute: 240,
          exit_criteria: 'demo path green',
          alarm_at_minutes: [210],
        },
      ],
      alarms: [
        { stage: 'build', threshold: 0.5, at_minute: 90, severity: 'soft' },
        { stage: 'verify', threshold: 0.8, at_minute: 228, severity: 'firm' },
      ],
    });
    const cal = buildCalibration(dir);
    assert.ok(cal);
    assert.equal(cal.planned_total_minutes, 240);
    assert.equal(cal.elapsed_minutes, 260);
    assert.equal(cal.deadline_at, '2026-10-14T08:00:00.000Z');
    assert.equal(cal.slipping, true);
    assert.equal(cal.burn_rate, 1.4);
    const build = cal.stages.find((s) => s.stage === 'build');
    const verify = cal.stages.find((s) => s.stage === 'verify');
    // build is not the current stage: observed falls back to budget (fully consumed)
    assert.equal(build.budgeted_minutes, 180);
    // verify is current with elapsed 260; overrun vs its 60-minute budget
    assert.equal(verify.overrun_minutes !== null && verify.overrun_minutes >= 0, true);
    assert.equal(cal.alarms_fired.length, 2);
    assert.equal(cal.stages.filter((s) => s.alarm_fired).length, 2);
    assert.deepEqual(cal.source_files, ['.hackathon/state/time-box.json']);
  });
});

describe('retro skeleton carries calibration', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'calibration-cli-'));
    spawnSync(process.execPath, [CLI, 'init', '-y'], { cwd: dir, encoding: 'utf8' });
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('run retro --apply embeds calibration when a real time-box exists', () => {
    writeState(dir, 'time-box.json', {
      version: '1.0',
      generated_at: '2026-10-14T00:00:00.000Z',
      team_size: 4,
      time_remaining_minutes: 240,
      buffer_minutes: 30,
      current_stage: 'build',
      schedule: [
        {
          stage: 'build',
          start_in_minutes: 0,
          duration_minutes: 150,
          ends_at_minute: 150,
          exit_criteria: 'x',
          alarm_at_minutes: [75],
        },
      ],
    });
    const r = spawnSync(process.execPath, [CLI, 'run', 'retro', '--apply', '-C', dir], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    const retro = JSON.parse(readFileSync(join(dir, '.hackathon/state/retro.json'), 'utf8'));
    assert.equal(retro.calibration.planned_total_minutes, 150);
    assert.ok(Array.isArray(retro.calibration.stages));
  });
});
