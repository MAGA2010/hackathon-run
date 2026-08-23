/**
 * sprint.ts — CLI lifecycle for sprint contracts and the evaluator handoff.
 *
 * Subcommands:
 *   sprint new            create a default-FAIL contract from plan.json
 *   sprint approve        mark the contract as approved before building
 *   sprint review         emit the evaluator handoff + eval.json skeleton
 *   sprint status         show the active contract
 *   sprint budget         set time / iteration gates
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  readSprint,
  writeSprint,
  updateSprint,
  sprintFromPlan,
  enforceSprintBudget,
  type Sprint,
} from '../../harness/sprint.js';
import { readState, writeState } from '../../harness/state.js';
import { appendTrace } from '../../harness/trace.js';
import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

interface PlanLikeForSprint {
  demo_goal?: string;
  features?: Array<{
    name?: string;
    classification?: string;
    passes?: boolean;
    acceptance_criteria?: string[];
  }>;
}

export interface SprintOptions {
  subcommand: 'new' | 'approve' | 'review' | 'status' | 'budget';
  cwd?: string;
  name?: string;
  goal?: string;
  feature?: string;
  minutes?: number;
  maxIterations?: number;
  force?: boolean;
  json?: boolean;
}

function readPlan(cwd: string): PlanLikeForSprint | null {
  try {
    return readState<PlanLikeForSprint>({ repoRoot: cwd, file: 'plan.json' });
  } catch {
    return null;
  }
}

function buildEvalSkeleton(sprint: Sprint) {
  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    sprint: sprint.name,
    verdict: 'pending',
    criteria: sprint.criteria.map((criterion) => ({
      id: criterion.id,
      description: criterion.description,
      passes: false,
      evidence: [],
    })),
    feedback: [],
    iterations: sprint.iterations ?? 0,
    budget_minutes: sprint.budget_minutes ?? 0,
  };
}

export function sprint(opts: SprintOptions): number {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const stateDir = resolve(cwd, '.hackathon', 'state');

  if (opts.subcommand === 'new') {
    if (!existsSync(stateDir)) {
      log.err('.hackathon/state/ not found in ' + cwd);
      log.dim('Run: hackathon init first');
      return 1;
    }
    const existing = readSprint(cwd);
    if (existing && !opts.force) {
      log.err('active sprint already exists: ' + existing.name);
      log.dim('Use --force to overwrite, or sprint status to inspect it.');
      return 1;
    }
    const plan = readPlan(cwd);
    if (!plan) {
      log.err('plan.json missing or invalid; run scope-knife first');
      return 1;
    }
    const sprintData = sprintFromPlan(plan, opts.feature);
    sprintData.name = opts.name ?? sprintData.name;
    sprintData.goal = opts.goal ?? sprintData.goal;
    if (opts.minutes != null) sprintData.budget_minutes = opts.minutes;
    if (opts.maxIterations != null) sprintData.max_iterations = opts.maxIterations;
    writeSprint(cwd, sprintData);
    appendTrace(cwd, {
      type: 'sprint.created',
      actor: 'cli',
      skill: 'sprint',
      status: 'ok',
      summary: `Created sprint ${sprintData.name} for ${sprintData.feature}`,
      data: { criteria: sprintData.criteria.length },
    });
    log.ok(`wrote sprint contract ${sprintData.name} for ${sprintData.feature}`);
    log.dim(`criteria: ${sprintData.criteria.length} (all default-FAIL)`);
    return 0;
  }

  if (opts.subcommand === 'approve') {
    const current = readSprint(cwd);
    if (!current) {
      log.err('no active sprint; run hackathon sprint new first');
      return 1;
    }
    updateSprint(cwd, { status: 'approved' });
    appendTrace(cwd, {
      type: 'sprint.approved',
      actor: 'cli',
      skill: 'sprint',
      status: 'ok',
      summary: `Approved sprint ${current.name}`,
    });
    log.ok(`approved ${current.name} - generator may start`);
    return 0;
  }

  if (opts.subcommand === 'review') {
    const current = readSprint(cwd);
    if (!current) {
      log.err('no active sprint; run hackathon sprint new first');
      return 1;
    }
    const budget = enforceSprintBudget(current);
    if (!budget.within) {
      updateSprint(cwd, {
        status: 'blocked',
        feedback: [...(current.feedback ?? []), budget.reason ?? 'budget exhausted'],
      });
      log.err(budget.reason ?? 'budget exhausted');
      return 1;
    }
    updateSprint(cwd, { status: 'pending_review' });
    writeState({ repoRoot: cwd, file: 'eval.json', data: buildEvalSkeleton(current) });
    appendTrace(cwd, {
      type: 'sprint.review',
      actor: 'cli',
      skill: 'sprint',
      status: 'ok',
      summary: `Emitted evaluator handoff for ${current.name}`,
      data: { verdict: 'pending' },
    });
    console.log(c.bold('Evaluator handoff'));
    console.log();
    console.log(c.dim('Role: read-only evaluator. Do not edit code or state files.'));
    console.log(
      c.dim('Rule: every criterion starts false; PASS requires machine-checkable evidence.'),
    );
    console.log(c.dim('Write: update .hackathon/state/eval.json only.'));
    console.log();
    for (const criterion of current.criteria) {
      console.log('  ' + c.cyan(criterion.id) + '  ' + criterion.description);
    }
    if (current.budget_minutes != null || current.max_iterations != null) {
      console.log();
      console.log(
        c.dim(
          `budget: ${current.budget_minutes ?? 'unlimited'}m, iterations ${current.max_iterations ?? 'unlimited'}`,
        ),
      );
    }
    return 0;
  }

  if (opts.subcommand === 'budget') {
    const current = readSprint(cwd);
    if (!current) {
      log.err('no active sprint; run hackathon sprint new first');
      return 1;
    }
    const patch: Partial<Sprint> = {};
    if (opts.minutes != null) patch.budget_minutes = opts.minutes;
    if (opts.maxIterations != null) patch.max_iterations = opts.maxIterations;
    const next = updateSprint(cwd, patch);
    appendTrace(cwd, {
      type: 'sprint.budget',
      actor: 'cli',
      skill: 'sprint',
      status: 'ok',
      summary: `Updated budget for ${next.name}`,
      data: {
        budget_minutes: next.budget_minutes ?? null,
        max_iterations: next.max_iterations ?? null,
      },
    });
    log.ok(
      `budget updated: time=${next.budget_minutes ?? 'unlimited'}m iterations=${next.max_iterations ?? 'unlimited'}`,
    );
    return 0;
  }

  const current = readSprint(cwd);
  if (!current) {
    log.err('no active sprint; run hackathon sprint new first');
    return 1;
  }
  if (opts.json) {
    console.log(JSON.stringify(current, null, 2));
    return 0;
  }
  console.log(c.bold('hackathon sprint status \u2014 ' + cwd));
  console.log();
  console.log('  name:      ' + current.name);
  console.log('  feature:   ' + current.feature);
  console.log('  goal:      ' + current.goal);
  console.log('  status:    ' + current.status);
  console.log('  verdict:   ' + (current.verdict ?? 'pending'));
  console.log('  iterations:' + (current.iterations ?? 0));
  console.log(
    '  criteria:  ' +
      current.criteria.filter((criterion) => criterion.passes).length +
      '/' +
      current.criteria.length +
      ' passing',
  );
  return 0;
}
