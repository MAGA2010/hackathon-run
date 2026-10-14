/**
 * calibration.ts - extract "predicted vs actual" timing calibration data from
 * time-box.json into a retro-ready record.
 *
 * The v1.6 pulse records what the clock said while work happened (burn rate,
 * slip flag, alarms, deadline). This module turns that telemetry into a
 * durable calibration record the retro skill (and, over many events, a
 * calibration table) can learn from: which stage budgets were overrun, how
 * far the deadline slipped, and how often the soft/firm alarms fired.
 *
 * All fields are null when the underlying state is missing or still a seed,
 * so a calibration record never invents data.
 */

import { readState } from './state.js';

export interface StageCalibration {
  stage: string;
  budgeted_minutes: number | null;
  observed_minutes: number | null;
  overrun_minutes: number | null;
  overrun_ratio: number | null;
  alarm_fired: boolean;
}

export interface CalibrationRecord {
  generated_at: string;
  deadline_at: string | null;
  planned_total_minutes: number | null;
  elapsed_minutes: number | null;
  overrun_minutes: number | null;
  burn_rate: number | null;
  slipping: boolean;
  stages: StageCalibration[];
  alarms_fired: Array<{ stage: string; threshold: number; severity: string }>;
  source_files: string[];
}

interface TimeBoxFile {
  deadline_at?: string;
  time_remaining_minutes?: number;
  buffer_minutes?: number;
  current_stage?: string;
  elapsed_minutes?: number;
  burn_rate?: number | null;
  slipping?: boolean;
  schedule?: Array<{
    stage: string;
    duration_minutes: number;
    ends_at_minute?: number;
  }>;
  alarms?: Array<{ stage: string; threshold: number; severity: string }>;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Build the calibration record for a repo. Returns null when time-box.json
 * is missing, still the init seed (no schedule, no deadline), or written by
 * an older/newer version whose schema this build cannot validate — the
 * extractor is best-effort and must never break the retro flow.
 */
export function buildCalibration(cwd: string): CalibrationRecord | null {
  let timeBox: TimeBoxFile | null;
  try {
    timeBox = readState<TimeBoxFile>({ repoRoot: cwd, file: 'time-box.json' });
  } catch {
    return null;
  }
  if (!timeBox || !Array.isArray(timeBox.schedule) || timeBox.schedule.length === 0) {
    return null;
  }

  const plannedTotal = timeBox.schedule.reduce(
    (sum, window) => sum + (asNumber(window.duration_minutes) ?? 0),
    0,
  );
  const buffer = asNumber(timeBox.buffer_minutes) ?? 0;
  const elapsed = asNumber(timeBox.elapsed_minutes);
  // When the run never recorded elapsed time, the honest fallback is the
  // consumed share of the planned window: planned minus what remained.
  const remaining = asNumber(timeBox.time_remaining_minutes);
  const observedTotal =
    elapsed ??
    (remaining !== null && plannedTotal + buffer > 0
      ? Math.max(0, plannedTotal + buffer - remaining)
      : null);

  const stages: StageCalibration[] = timeBox.schedule.map((window) => {
    const budget = asNumber(window.duration_minutes);
    // Per-stage observation: the current stage records burn; earlier stages
    // are fully consumed by definition, later ones unstarted (0 observed).
    const isCurrent = timeBox.current_stage === window.stage;
    const observed = isCurrent ? (elapsed ?? budget) : null;
    const overrun = budget !== null && observed !== null ? Math.max(0, observed - budget) : null;
    return {
      stage: window.stage,
      budgeted_minutes: budget,
      observed_minutes: observed,
      overrun_minutes: overrun,
      overrun_ratio: budget && overrun !== null ? Number((overrun / budget).toFixed(2)) : null,
      alarm_fired: false,
    };
  });

  const alarms = Array.isArray(timeBox.alarms) ? timeBox.alarms : [];
  const alarmKeys = new Set(alarms.map((alarm) => `${alarm.stage}:${alarm.threshold}`));
  for (const stage of stages) {
    stage.alarm_fired = alarmKeys.has(`${stage.stage}:0.5`) || alarmKeys.has(`${stage.stage}:0.8`);
  }

  const overrunTotal =
    plannedTotal > 0 && observedTotal !== null
      ? Math.max(0, observedTotal - plannedTotal - buffer)
      : null;

  return {
    generated_at: new Date().toISOString(),
    deadline_at: asString(timeBox.deadline_at),
    planned_total_minutes: plannedTotal,
    elapsed_minutes: observedTotal,
    overrun_minutes: overrunTotal,
    burn_rate: asNumber(timeBox.burn_rate),
    slipping: timeBox.slipping === true,
    stages,
    alarms_fired: alarms.map((alarm) => ({
      stage: alarm.stage,
      threshold: alarm.threshold,
      severity: alarm.severity,
    })),
    source_files: ['.hackathon/state/time-box.json'],
  };
}
