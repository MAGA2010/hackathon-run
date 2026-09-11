/**
 * lifecycle.ts - canonical completion and phase semantics for the five-stage flow.
 *
 * State files are deliberately seeded during `init`, so file existence is not
 * evidence that a stage ran. This module is the single source of truth used by
 * status, resume, and flow.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const FLOW_STATE_FILES = [
  'plan.json',
  'verify.json',
  'demo.json',
  'review.json',
  'ship.json',
] as const;
export type FlowStateFile = (typeof FLOW_STATE_FILES)[number];

export type LifecycleStage =
  'empty' | 'scoping' | 'verifying' | 'demoing' | 'judging' | 'shipping' | 'complete';

export const LIFECYCLE_ORDER: LifecycleStage[] = [
  'empty',
  'scoping',
  'verifying',
  'demoing',
  'judging',
  'shipping',
  'complete',
];

export interface LifecycleSnapshot {
  cwd: string;
  stateDir: string;
  initialized: boolean;
  present: Record<FlowStateFile, boolean>;
  state: Partial<Record<FlowStateFile, unknown>>;
  complete: Record<FlowStateFile, boolean>;
  lifecycle: LifecycleStage;
  cursor: number;
  nextSkill: string | null;
}

export interface LifecycleSummary {
  cwd: string;
  state_dir: string;
  initialized: boolean;
  lifecycle: LifecycleStage;
  cursor: number;
  next_skill: string | null;
  present: Record<FlowStateFile, boolean>;
  complete: Record<FlowStateFile, boolean>;
}

export const PIPELINE_SKILLS = [
  'scope-knife',
  'fast-verify',
  'demo-coach',
  'judge-sim',
  'ship-pack',
] as const;

const PLACEHOLDER_RE =
  /\(\s*(?:set via|fill in|describe|the core action|the action|team|target user|time|pain point|product|success state|repo link|N|step)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNonPlaceholderString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !PLACEHOLDER_RE.test(value);
}

function planComplete(data: unknown): boolean {
  if (!isRecord(data)) return false;
  return (
    isNonPlaceholderString(data.demo_goal) &&
    Array.isArray(data.features) &&
    Array.isArray(data.demo_path) &&
    data.demo_path.length > 0 &&
    Array.isArray(data.next_tasks)
  );
}

function verifyComplete(data: unknown): boolean {
  return isRecord(data) && data.status === 'pass';
}

function demoComplete(data: unknown): boolean {
  if (!isRecord(data) || !isNonPlaceholderString(data.one_liner)) return false;
  if (!Array.isArray(data.steps) || data.steps.length < 6) return false;
  return data.steps.every((step) => {
    if (!isRecord(step)) return false;
    return ['say', 'click', 'show', 'not'].every((key) => isNonPlaceholderString(step[key]));
  });
}

function reviewComplete(data: unknown): boolean {
  if (!isRecord(data) || typeof data.overall !== 'number') return false;
  if (!Array.isArray(data.dimensions) || data.dimensions.length !== 7) return false;
  if (!isRecord(data.fix_priorities)) return false;
  const priorities = data.fix_priorities;
  if (!Array.isArray(priorities.fix_now) || !Array.isArray(priorities.fix_last_10min)) return false;
  if (!Array.isArray(priorities.do_not_touch)) return false;
  return data.dimensions.every((dimension) => {
    if (!isRecord(dimension)) return false;
    return (
      typeof dimension.score === 'number' &&
      isNonPlaceholderString(dimension.deduction_reason) &&
      Array.isArray(dimension.judge_questions) &&
      dimension.judge_questions.length >= 2 &&
      Array.isArray(dimension.improvements)
    );
  });
}

function shipAuditComplete(data: unknown): boolean {
  if (!isRecord(data)) return false;
  const secretScan = isRecord(data.secret_scan) ? data.secret_scan : null;
  const reproducible = isRecord(data.reproducible) ? data.reproducible : null;
  const checklist = isRecord(data.checklist) ? data.checklist : null;
  const packaging = data.packaging_command;
  return Boolean(
    secretScan?.clean === true &&
    Array.isArray(secretScan.findings) &&
    reproducible?.ok === true &&
    typeof reproducible.reason === 'string' &&
    checklist &&
    Array.isArray(checklist.failed) &&
    checklist.failed.length === 0 &&
    isNonPlaceholderString(packaging) &&
    !/fill in|placeholder/i.test(packaging),
  );
}

/** Return true only when the artifact proves that its stage completed. */
export function stateFileComplete(file: FlowStateFile, data: unknown): boolean {
  switch (file) {
    case 'plan.json':
      return planComplete(data);
    case 'verify.json':
      return verifyComplete(data);
    case 'demo.json':
      return demoComplete(data);
    case 'review.json':
      return reviewComplete(data);
    case 'ship.json':
      return shipAuditComplete(data);
  }
}

export function lifecycleForState(
  state: Partial<Record<FlowStateFile, unknown>>,
  present: Partial<Record<FlowStateFile, boolean>> = {},
): LifecycleStage {
  if (!stateFileComplete('plan.json', state['plan.json'])) return 'empty';
  if (!stateFileComplete('verify.json', state['verify.json'])) return 'scoping';
  if (!stateFileComplete('demo.json', state['demo.json'])) return 'verifying';
  if (!stateFileComplete('review.json', state['review.json'])) return 'demoing';
  if (!present['ship.json']) return 'judging';
  if (!stateFileComplete('ship.json', state['ship.json'])) return 'shipping';
  return 'complete';
}

export function flowCursor(state: Partial<Record<FlowStateFile, unknown>>): number {
  for (let index = 0; index < FLOW_STATE_FILES.length; index++) {
    const file = FLOW_STATE_FILES[index]!;
    if (!stateFileComplete(file, state[file])) return index;
  }
  return FLOW_STATE_FILES.length;
}

export function readLifecycleSnapshot(cwd: string): LifecycleSnapshot {
  const root = resolve(cwd);
  const stateDir = join(root, '.hackathon', 'state');
  const initialized = existsSync(stateDir);
  const present = {} as Record<FlowStateFile, boolean>;
  const state: Partial<Record<FlowStateFile, unknown>> = {};
  for (const file of FLOW_STATE_FILES) {
    const path = join(stateDir, file);
    present[file] = existsSync(path);
    if (!present[file]) continue;
    try {
      state[file] = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    } catch {
      state[file] = null;
    }
  }
  const complete = {} as Record<FlowStateFile, boolean>;
  for (const file of FLOW_STATE_FILES) complete[file] = stateFileComplete(file, state[file]);
  const cursor = initialized ? flowCursor(state) : 0;
  const lifecycle = initialized ? lifecycleForState(state, present) : 'empty';
  return {
    cwd: root,
    stateDir,
    initialized,
    present,
    state,
    complete,
    lifecycle,
    cursor,
    nextSkill: cursor < PIPELINE_SKILLS.length ? PIPELINE_SKILLS[cursor]! : null,
  };
}

/** Stable public lifecycle metadata shared by status, resume, and flow. */
export function lifecycleSummary(snapshot: LifecycleSnapshot): LifecycleSummary {
  return {
    cwd: snapshot.cwd,
    state_dir: snapshot.stateDir,
    initialized: snapshot.initialized,
    lifecycle: snapshot.lifecycle,
    cursor: snapshot.cursor,
    next_skill: snapshot.nextSkill,
    present: { ...snapshot.present },
    complete: { ...snapshot.complete },
  };
}

export function lifecycleStageNumber(stage: LifecycleStage): number {
  return LIFECYCLE_ORDER.indexOf(stage) + 1;
}

export const LIFECYCLE_NEXT_SUGGESTION: Record<LifecycleStage, string | null> = {
  empty: 'hackathon init then hackathon run scope-knife',
  scoping: 'hackathon run fast-verify on the demo_path steps',
  verifying: 'hackathon run demo-coach after fast-verify passes',
  demoing: 'hackathon run judge-sim',
  judging: 'hackathon run ship-pack',
  shipping: 'fix the ship-pack findings, then run hackathon run ship-pack',
  complete: 'ship it - the audited pipeline is complete',
};
