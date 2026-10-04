/**
 * pulse.ts - derive a live time-and-risk snapshot from optional state files.
 *
 * This module intentionally reads state files directly instead of going
 * through readState(). Older time-box and rehearsal artifacts may not match
 * the current schema yet, and status should degrade gracefully instead of
 * refusing to show the rest of the lifecycle.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

export interface TimeBoxAlarm {
  stage: string;
  threshold: number;
  at_minute: number;
  severity: 'soft' | 'firm' | 'hard';
}

export interface ScheduleWindow {
  stage: string;
  start_in_minutes: number;
  duration_minutes: number;
  ends_at_minute: number;
  per_person_minutes?: number;
  exit_criteria: string;
  alarm_at_minutes: number[];
}

export interface PulseStage {
  stage: string;
  start_in_minutes: number;
  duration_minutes: number;
  elapsed_minutes: number;
  remaining_minutes: number;
  burn_rate: number | null;
  next_alarm_in_minutes: number | null;
  alarms_triggered: TimeBoxAlarm[];
  exit_criteria: string | null;
  state: 'on-track' | 'watch' | 'critical' | 'expired';
}

export interface RehearsalRisk {
  step: number;
  action: string;
  class: 'drift' | 'broken' | string;
  overrun_seconds: number;
  recommendation: string | null;
}

export interface VerificationFailure {
  step: number;
  action: string;
  error_signature: string | null;
  likely_cause: string | null;
  minimal_fix: string | null;
}

export interface RecoveryEvidence {
  risk_level: 'none' | 'low' | 'medium' | 'high';
  suggested_severity: 'P0' | 'P1' | 'P2' | 'P3';
  likely_failures: Array<{
    source: 'fast-verify' | 'demo-rehearsal';
    step: number | null;
    action: string | null;
    detail: string | null;
  }>;
}

export interface PulseSummary {
  available: boolean;
  generated_at: string | null;
  current_stage: string | null;
  deadline_at: string | null;
  minutes_remaining: number | null;
  minutes_elapsed: number | null;
  stale: boolean;
  stage: PulseStage | null;
  recovery_budget: {
    deficit_minutes: number;
    cut_from_verify: number;
    cut_from_demo: number;
    cut_from_ship_buffer: number;
    rationale: string | null;
  } | null;
  rehearsal: {
    available: boolean;
    run_number: number | null;
    total_seconds: number | null;
    target_total_seconds: number | null;
    within_budget: boolean | null;
    verdict: string | null;
    drift_steps: number;
    broken_steps: number;
    fix_count: number;
    risks: RehearsalRisk[];
  };
  verification: {
    available: boolean;
    status: string | null;
    passed_steps: number;
    failed_steps: number;
    failures: VerificationFailure[];
  };
  recovery_evidence: RecoveryEvidence;
  recommended_action: string | null;
}

const STALE_AFTER_MINUTES = 30;

function readJson(path: string): JsonRecord | null {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isoMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function minutesFromMs(ms: number): number {
  return Math.max(0, Math.floor(ms / 60000));
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeAlarms(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map(asInt)
      .filter((item): item is number => item !== null && item >= 0)
      .sort((a, b) => a - b);
  }
  const single = asInt(value);
  return single !== null && single >= 0 ? [single] : [];
}

function normalizeSchedule(value: unknown): ScheduleWindow[] {
  if (!Array.isArray(value)) return [];
  const windows: ScheduleWindow[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const start = asInt(raw.start_in_minutes ?? raw.starts_at_minute) ?? 0;
    const end = asInt(raw.ends_at_minute);
    const duration = asInt(raw.duration_minutes);
    const resolvedDuration = duration ?? (end !== null ? end - start : 0);
    const alarms = normalizeAlarms(raw.alarm_at_minutes ?? raw.alarms_at_minute);
    windows.push({
      stage: asString(raw.stage) ?? 'unknown',
      start_in_minutes: start,
      duration_minutes: Math.max(0, resolvedDuration),
      ends_at_minute: end ?? start + Math.max(0, resolvedDuration),
      per_person_minutes: asInt(raw.per_person_minutes) ?? undefined,
      exit_criteria: asString(raw.exit_criteria) ?? '',
      alarm_at_minutes: alarms,
    });
  }
  return windows.sort((a, b) => a.start_in_minutes - b.start_in_minutes);
}

function normalizeTopAlarms(value: unknown): TimeBoxAlarm[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!isRecord(raw)) return null;
      const at = asInt(raw.at_minute);
      const threshold = typeof raw.threshold === 'number' ? raw.threshold : null;
      const severity = asString(raw.severity);
      if (at === null) return null;
      return {
        stage: asString(raw.stage) ?? 'unknown',
        threshold: threshold ?? 1,
        at_minute: at,
        severity:
          severity === 'soft' || severity === 'firm' || severity === 'hard' ? severity : 'soft',
      };
    })
    .filter((item): item is TimeBoxAlarm => item !== null);
}

function currentStage(schedule: ScheduleWindow[], elapsed: number): ScheduleWindow | null {
  const active = schedule.find(
    (window) => elapsed >= window.start_in_minutes && elapsed < window.ends_at_minute,
  );
  if (active) return active;
  const next = schedule.find((window) => window.start_in_minutes >= elapsed);
  if (next) return next;
  return schedule[schedule.length - 1] ?? null;
}

function declaredStageExitCriteria(stage: string): string {
  const criteria: Record<string, string> = {
    build: 'demo_path steps compile and the happy path runs locally',
    verify: 'every demo_path step passes; failure modes have runbooks',
    demo: '3 timed runs in a row under the budget, with recovery-runbook in hand',
    ship: 'README + secret scan + reproducible packaging command all green',
  };
  return criteria[stage] ?? 'complete the current stage before the next alarm';
}

function buildDeclaredStage(
  stage: string,
  elapsed: number,
  remaining: number,
  budget: number,
  alarms: TimeBoxAlarm[],
): PulseStage {
  const window: ScheduleWindow = {
    stage,
    start_in_minutes: 0,
    duration_minutes: Math.max(0, budget),
    ends_at_minute: Math.max(0, budget),
    exit_criteria: declaredStageExitCriteria(stage),
    alarm_at_minutes: [],
  };
  return buildStage(window, elapsed, remaining, alarms);
}

function stageState(
  window: ScheduleWindow,
  elapsed: number,
  remaining: number,
): PulseStage['state'] {
  if (remaining <= 0 || elapsed >= window.ends_at_minute) return 'expired';
  const burn =
    window.duration_minutes > 0
      ? Math.max(0, elapsed - window.start_in_minutes) / window.duration_minutes
      : 0;
  if (burn >= 1 || remaining <= 15) return 'critical';
  if (burn >= 0.8) return 'watch';
  return 'on-track';
}

function buildStage(
  window: ScheduleWindow,
  elapsed: number,
  remaining: number,
  alarms: TimeBoxAlarm[],
): PulseStage {
  const stageElapsed = Math.min(
    window.duration_minutes,
    Math.max(0, elapsed - window.start_in_minutes),
  );
  const stageRemaining = Math.max(0, window.duration_minutes - stageElapsed);
  const burnRate = window.duration_minutes > 0 ? stageElapsed / window.duration_minutes : null;
  const nextAlarm = alarms
    .filter((alarm) => alarm.stage === window.stage && alarm.at_minute > elapsed)
    .sort((a, b) => a.at_minute - b.at_minute)[0];
  const triggered = alarms
    .filter((alarm) => alarm.stage === window.stage && alarm.at_minute <= elapsed)
    .sort((a, b) => a.at_minute - b.at_minute);
  return {
    stage: window.stage,
    start_in_minutes: window.start_in_minutes,
    duration_minutes: window.duration_minutes,
    elapsed_minutes: stageElapsed,
    remaining_minutes: stageRemaining,
    burn_rate: burnRate === null ? null : Math.min(99, Math.round(burnRate * 100) / 100),
    next_alarm_in_minutes: nextAlarm ? Math.max(0, nextAlarm.at_minute - elapsed) : null,
    alarms_triggered: triggered,
    exit_criteria: window.exit_criteria || null,
    state: stageState(window, elapsed, remaining),
  };
}

function buildRehearsal(raw: JsonRecord | null): PulseSummary['rehearsal'] {
  if (!raw) {
    return {
      available: false,
      run_number: null,
      total_seconds: null,
      target_total_seconds: null,
      within_budget: null,
      verdict: null,
      drift_steps: 0,
      broken_steps: 0,
      fix_count: 0,
      risks: [],
    };
  }
  const segments = Array.isArray(raw.segments) ? raw.segments : [];
  const riskSource = Array.isArray(raw.risks) ? raw.risks : segments;
  const risks: RehearsalRisk[] = [];
  let drift = 0;
  let broken = 0;
  for (const rawRisk of riskSource) {
    if (!isRecord(rawRisk)) continue;
    const classification = asString(rawRisk.class ?? rawRisk.classification);
    if (classification === 'drift') drift += 1;
    if (classification === 'broken') broken += 1;
    if (classification !== 'drift' && classification !== 'broken') continue;
    const actual = typeof rawRisk.actual_seconds === 'number' ? rawRisk.actual_seconds : 0;
    const budget = typeof rawRisk.budget_seconds === 'number' ? rawRisk.budget_seconds : 0;
    const step = asInt(rawRisk.step ?? rawRisk.index) ?? 0;
    risks.push({
      step,
      action: asString(rawRisk.action ?? rawRisk.name) ?? `step-${step}`,
      class: classification,
      overrun_seconds: asInt(rawRisk.overrun_seconds) ?? Math.max(0, actual - budget),
      recommendation:
        asString(rawRisk.recommendation) ??
        (classification === 'broken'
          ? 'rewrite the step and cut one sentence'
          : 'trim one sentence or add a breath'),
    });
  }
  const fixes = Array.isArray(raw.fixes) ? raw.fixes : [];
  return {
    available: true,
    run_number: asInt(raw.run_number),
    total_seconds: typeof raw.total_seconds === 'number' ? raw.total_seconds : null,
    target_total_seconds: asInt(raw.target_total_seconds),
    within_budget: typeof raw.within_budget === 'boolean' ? raw.within_budget : null,
    verdict: asString(raw.verdict),
    drift_steps: drift,
    broken_steps: broken,
    fix_count: fixes.length,
    risks: risks.slice(0, 5),
  };
}

function buildVerification(raw: JsonRecord | null): PulseSummary['verification'] {
  if (!raw) {
    return {
      available: false,
      status: null,
      passed_steps: 0,
      failed_steps: 0,
      failures: [],
    };
  }
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const failures: VerificationFailure[] = [];
  let passed = 0;
  let failed = 0;
  for (const rawStep of steps) {
    if (!isRecord(rawStep)) continue;
    if (rawStep.status === 'pass') passed += 1;
    if (rawStep.status !== 'fail') continue;
    failed += 1;
    const diagnosis = isRecord(rawStep.diagnosis) ? rawStep.diagnosis : null;
    failures.push({
      step: asInt(rawStep.step) ?? 0,
      action: asString(rawStep.action) ?? `step-${rawStep.step ?? '?'}`,
      error_signature: asString(rawStep.error_signature),
      likely_cause: diagnosis ? asString(diagnosis.likely_cause) : null,
      minimal_fix: diagnosis ? asString(diagnosis.minimal_fix) : null,
    });
  }
  return {
    available: true,
    status: asString(raw.status),
    passed_steps: passed,
    failed_steps: failed,
    failures: failures.slice(0, 8),
  };
}

function buildEvidence(
  verification: PulseSummary['verification'],
  rehearsal: PulseSummary['rehearsal'],
  remaining: number | null,
): RecoveryEvidence {
  const likely: RecoveryEvidence['likely_failures'] = [];
  for (const failure of verification.failures) {
    likely.push({
      source: 'fast-verify',
      step: failure.step || null,
      action: failure.action || null,
      detail: failure.error_signature ?? failure.minimal_fix,
    });
  }
  for (const risk of rehearsal.risks) {
    likely.push({
      source: 'demo-rehearsal',
      step: risk.step || null,
      action: risk.action || null,
      detail: risk.recommendation,
    });
  }
  let suggestedSeverity: RecoveryEvidence['suggested_severity'] = 'P3';
  let riskLevel: RecoveryEvidence['risk_level'] = 'none';
  if (verification.failed_steps > 0) {
    suggestedSeverity = 'P1';
    riskLevel = 'high';
  } else if (rehearsal.broken_steps > 0) {
    suggestedSeverity = 'P2';
    riskLevel = 'medium';
  } else if (rehearsal.drift_steps > 0) {
    suggestedSeverity = 'P2';
    riskLevel = 'low';
  }
  if (remaining !== null && remaining <= 0) {
    suggestedSeverity = 'P0';
    riskLevel = 'high';
  }
  return {
    risk_level: riskLevel,
    suggested_severity: suggestedSeverity,
    likely_failures: likely.slice(0, 10),
  };
}

function recommendedAction(pulse: Omit<PulseSummary, 'recommended_action'>): string | null {
  if (!pulse.available) return null;
  if ((pulse.minutes_remaining ?? 1) <= 0) return 'recovery-runbook';
  if (pulse.verification.failed_steps > 0) return 'fast-verify';
  if (pulse.rehearsal.broken_steps > 0 || pulse.rehearsal.drift_steps > 0) {
    return 'demo-rehearsal';
  }
  if (pulse.stage?.state === 'critical' && pulse.stage.burn_rate !== null) {
    return pulse.stage.burn_rate >= 1 ? 'scope-knife' : 'time-box';
  }
  if (!pulse.rehearsal.available) return 'demo-rehearsal';
  return null;
}

export function computePulse(opts: { cwd: string; now?: Date }): PulseSummary | null {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  const timeBox = readJson(join(stateDir, 'time-box.json'));
  const rehearsalRaw = readJson(join(stateDir, 'rehearsal.json'));
  const verifyRaw = readJson(join(stateDir, 'verify.json'));
  if (!timeBox && !rehearsalRaw && !verifyRaw) return null;

  const nowMs = (opts.now ?? new Date()).getTime();
  const generatedAt = timeBox ? asString(timeBox.generated_at) : null;
  const generatedMs = isoMs(generatedAt);
  const timeRemaining = timeBox ? asInt(timeBox.time_remaining_minutes) : null;
  const deadlineFromState = timeBox ? isoMs(timeBox.deadline_at) : null;
  const deadlineMs =
    deadlineFromState ??
    (generatedMs !== null && timeRemaining !== null ? generatedMs + timeRemaining * 60000 : null);
  const minutesElapsed = generatedMs !== null ? minutesFromMs(nowMs - generatedMs) : null;
  const minutesRemaining =
    deadlineMs !== null ? Math.max(0, Math.round((deadlineMs - nowMs) / 60000)) : null;
  const schedule = normalizeSchedule(timeBox?.schedule);
  const alarms = normalizeTopAlarms(timeBox?.alarms);
  const declaredStage = timeBox ? asString(timeBox.current_stage) : null;
  const currentStageStartedMs = timeBox ? isoMs(timeBox.current_stage_started_at) : null;
  const currentStageBudget = timeBox ? asInt(timeBox.current_stage_budget_minutes) : null;
  const currentStageElapsed =
    currentStageStartedMs !== null
      ? minutesFromMs(nowMs - currentStageStartedMs)
      : (minutesElapsed ?? 0);
  const activeWindow = currentStage(schedule, minutesElapsed ?? 0);
  const declaredWindow = declaredStage
    ? schedule.find((window) => window.stage === declaredStage)
    : null;
  const stage = declaredWindow
    ? buildStage(declaredWindow, currentStageElapsed, minutesRemaining ?? 0, alarms)
    : !declaredWindow && declaredStage && currentStageBudget !== null
      ? buildDeclaredStage(
          declaredStage,
          currentStageElapsed,
          minutesRemaining ?? 0,
          currentStageBudget,
          alarms,
        )
      : activeWindow
        ? buildStage(activeWindow, minutesElapsed ?? 0, minutesRemaining ?? 0, alarms)
        : null;
  const rehearsal = buildRehearsal(rehearsalRaw);
  const verification = buildVerification(verifyRaw);
  const recoveryBudget = isRecord(timeBox?.recovery)
    ? {
        deficit_minutes: asInt(timeBox?.recovery.deficit_minutes) ?? 0,
        cut_from_verify: asInt(timeBox?.recovery.cut_from_verify) ?? 0,
        cut_from_demo: asInt(timeBox?.recovery.cut_from_demo) ?? 0,
        cut_from_ship_buffer: asInt(timeBox?.recovery.cut_from_ship_buffer) ?? 0,
        rationale: asString(timeBox?.recovery.rationale),
      }
    : null;
  const evidence = buildEvidence(verification, rehearsal, minutesRemaining);
  const available = Boolean(timeBox || rehearsalRaw || verifyRaw);
  const stale = generatedMs !== null && nowMs - generatedMs > STALE_AFTER_MINUTES * 60000;
  const partial = {
    available,
    generated_at: generatedAt,
    current_stage: declaredStage,
    deadline_at: deadlineMs !== null ? new Date(deadlineMs).toISOString() : null,
    minutes_remaining: minutesRemaining,
    minutes_elapsed: minutesElapsed,
    stale,
    stage,
    recovery_budget: recoveryBudget,
    rehearsal,
    verification,
    recovery_evidence: evidence,
  };
  return {
    ...partial,
    recommended_action: recommendedAction(partial),
  };
}
