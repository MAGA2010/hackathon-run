/**
 * sprint.ts — sprint contract lifecycle.
 *
 * A sprint is the smallest unit of generator/evaluator work. The contract
 * is agreed before implementation: every criterion starts false and only
 * the evaluator can turn it true with evidence.
 */

import { readState, writeState } from './state.js';

export interface SprintEvidence {
  kind: 'command' | 'url' | 'test' | 'browser' | 'manual' | 'log';
  value: string;
  at?: string;
}

export interface SprintCriterion {
  id: string;
  description: string;
  passes: boolean;
  evidence?: SprintEvidence[];
  note?: string;
}

export interface Sprint {
  version: '1.0';
  generated_at: string;
  started_at?: string;
  finished_at?: string;
  name: string;
  goal: string;
  feature: string;
  status:
    'proposed' | 'approved' | 'in_progress' | 'pending_review' | 'passed' | 'failed' | 'blocked';
  definition_of_done?: string[];
  criteria: SprintCriterion[];
  verdict?: 'pass' | 'fail' | 'pending';
  feedback?: string[];
  iterations?: number;
  budget_minutes?: number;
  max_iterations?: number;
}

const SPRINT_FILE = 'sprint.json';

export function defaultSprint(patch: Partial<Sprint> = {}): Sprint {
  const now = new Date().toISOString();
  return {
    version: '1.0',
    generated_at: now,
    name: 'sprint-1',
    goal: '',
    feature: '',
    status: 'proposed',
    criteria: [],
    iterations: 0,
    ...patch,
  };
}

export function readSprint(cwd: string): Sprint | null {
  return readState<Sprint>({ repoRoot: cwd, file: SPRINT_FILE });
}

export function writeSprint(cwd: string, sprint: Sprint): string {
  return writeState({ repoRoot: cwd, file: SPRINT_FILE, data: sprint });
}

export function updateSprint(cwd: string, patch: Partial<Sprint>): Sprint {
  const current = readSprint(cwd) ?? defaultSprint();
  const next: Sprint = {
    ...current,
    ...patch,
    version: '1.0',
    generated_at: current.generated_at,
  };
  writeSprint(cwd, next);
  return next;
}

export interface PlanLike {
  features?: Array<{
    name?: string;
    classification?: string;
    passes?: boolean;
    acceptance_criteria?: string[];
  }>;
  demo_goal?: string;
}

type PlanFeature = NonNullable<PlanLike['features']>[number];

export function nextUnpassedFeature(plan: PlanLike | null): PlanFeature | null {
  if (!plan || !Array.isArray(plan.features)) return null;
  return plan.features.find((f) => f.classification === 'KEEP' && f.passes !== true) ?? null;
}

export function sprintFromPlan(plan: PlanLike | null, featureName?: string): Sprint {
  const feature = plan?.features?.find((f) => f.name === featureName) ?? nextUnpassedFeature(plan);
  const criteria: SprintCriterion[] =
    feature?.acceptance_criteria && feature.acceptance_criteria.length > 0
      ? feature.acceptance_criteria.map((description, i) => ({
          id: `c${i + 1}`,
          description,
          passes: false,
          evidence: [],
        }))
      : [
          {
            id: 'c1',
            description: `${feature?.name ?? 'Feature'} works end-to-end on the demo path.`,
            passes: false,
            evidence: [],
          },
        ];
  return defaultSprint({
    name: (featureName ?? feature?.name) ? `sprint-${feature?.name ?? 'next'}` : 'sprint-1',
    feature: feature?.name ?? featureName ?? 'next-unpassed-feature',
    goal: plan?.demo_goal ?? 'Complete the current sprint.',
    criteria,
    definition_of_done: criteria.map((c) => c.description),
  });
}

export function enforceSprintBudget(
  sprint: Sprint,
  now: Date = new Date(),
): { within: boolean; reason: string | null } {
  if (sprint.max_iterations != null && (sprint.iterations ?? 0) >= sprint.max_iterations) {
    return {
      within: false,
      reason: `iteration budget exhausted (${sprint.iterations}/${sprint.max_iterations})`,
    };
  }
  if (sprint.budget_minutes != null && sprint.started_at) {
    const elapsed = (now.getTime() - Date.parse(sprint.started_at)) / 60000;
    if (elapsed >= sprint.budget_minutes) {
      return {
        within: false,
        reason: `time budget exhausted (${Math.round(elapsed)}/${sprint.budget_minutes} min)`,
      };
    }
  }
  return { within: true, reason: null };
}
