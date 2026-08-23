/**
 * sprint.ts — CLI lifecycle for sprint contracts and the evaluator handoff.
 *
 * Subcommands:
 *   sprint new            create a default-FAIL contract from plan.json
 *   sprint approve        mark the contract as approved before building
 *   sprint review         emit the evaluator handoff + eval.json skeleton
 *   sprint accept         apply the evaluator verdict back to plan/session
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
  type SprintEvidence,
} from '../../harness/sprint.js';
import { readState, writeState } from '../../harness/state.js';
import { appendTrace } from '../../harness/trace.js';
import { readSession, updateSession } from '../../harness/session.js';
import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

interface PlanLikeForSprint {
  demo_goal?: string;
  features?: Array<{
    name?: string;
    classification?: string;
    passes?: boolean;
    acceptance_criteria?: string[];
    evidence?: Array<{ kind: string; value: string; at?: string }>;
    sprint?: string | null;
    owner?: string;
    last_verified_at?: string;
  }>;
}

interface EvalResultLike {
  version?: string;
  sprint?: string;
  verdict?: 'pass' | 'fail' | 'blocked' | 'pending';
  strategy?: 'refine' | 'pivot' | 'replan' | 'stop';
  rubric?: unknown;
  criteria?: Array<{
    id?: string;
    description?: string;
    passes?: boolean;
    score?: number;
    weight?: number;
    threshold?: number;
    evidence?: Array<{ kind: string; value: string; at?: string }>;
  }>;
  feedback?: string[];
  iterations?: number;
}

export interface SprintOptions {
  subcommand: 'new' | 'approve' | 'review' | 'accept' | 'status' | 'budget';
  cwd?: string;
  name?: string;
  goal?: string;
  feature?: string;
  minutes?: number;
  maxIterations?: number;
  force?: boolean;
  json?: boolean;
  owner?: string;
}

function readPlan(cwd: string): PlanLikeForSprint | null {
  try {
    return readState<PlanLikeForSprint>({ repoRoot: cwd, file: 'plan.json' });
  } catch {
    return null;
  }
}

function readEval(cwd: string): EvalResultLike | null {
  try {
    return readState<EvalResultLike>({ repoRoot: cwd, file: 'eval.json' });
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
      score: 0,
      evidence: [],
    })),
    feedback: [],
    strategy: 'refine',
    ...(sprint.rubric ? { rubric: sprint.rubric } : {}),
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
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, action: 'created', sprint: sprintData }, null, 2));
    } else {
      log.ok(`wrote sprint contract ${sprintData.name} for ${sprintData.feature}`);
      log.dim(`criteria: ${sprintData.criteria.length} (all default-FAIL)`);
    }
    return 0;
  }

  if (opts.subcommand === 'approve') {
    const current = readSprint(cwd);
    if (!current) {
      log.err('no active sprint; run hackathon sprint new first');
      return 1;
    }
    const updated = updateSprint(cwd, {
      status: 'approved',
      started_at: current.started_at ?? new Date().toISOString(),
    });
    appendTrace(cwd, {
      type: 'sprint.approved',
      actor: 'cli',
      skill: 'sprint',
      status: 'ok',
      summary: `Approved sprint ${current.name}`,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, action: 'approved', sprint: updated }, null, 2));
    } else {
      log.ok(`approved ${current.name} - generator may start`);
    }
    return 0;
  }

  if (opts.subcommand === 'review') {
    const current = readSprint(cwd);
    if (!current) {
      log.err('no active sprint; run hackathon sprint new first');
      return 1;
    }
    if (current.status === 'proposed') {
      log.err('sprint is still proposed; run hackathon sprint approve first');
      return 1;
    }
    if (['passed', 'failed', 'blocked'].includes(current.status)) {
      log.err(`sprint is ${current.status}; create a new sprint before reviewing`);
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
    const pending = updateSprint(cwd, { status: 'pending_review' });
    const evalData = buildEvalSkeleton(current);
    writeState({ repoRoot: cwd, file: 'eval.json', data: evalData });
    appendTrace(cwd, {
      type: 'sprint.review',
      actor: 'cli',
      skill: 'sprint',
      status: 'ok',
      summary: `Emitted evaluator handoff for ${current.name}`,
      data: { verdict: 'pending' },
    });
    if (opts.json) {
      console.log(
        JSON.stringify({ ok: true, action: 'review', sprint: pending, eval: evalData }, null, 2),
      );
      return 0;
    }
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

  if (opts.subcommand === 'accept') {
    const current = readSprint(cwd);
    if (!current) {
      log.err('no active sprint; run hackathon sprint new first');
      return 1;
    }
    const evalResult = readEval(cwd);
    if (!evalResult) {
      log.err('eval.json missing; run hackathon sprint review first');
      return 1;
    }
    if (evalResult.sprint && evalResult.sprint !== current.name) {
      log.err(`eval.json targets ${evalResult.sprint}, not ${current.name}`);
      return 1;
    }
    const verdict = evalResult.verdict;
    if (verdict !== 'pass' && verdict !== 'fail') {
      log.err(`eval verdict is ${verdict ?? 'missing'}; only pass/fail can be accepted`);
      return 1;
    }

    const evalCriteria = evalResult.criteria ?? [];
    const allPass =
      verdict === 'pass' &&
      evalCriteria.length === current.criteria.length &&
      evalCriteria.every((criterion) => criterion.passes === true);
    const plan = readPlan(cwd);
    if (!plan || !Array.isArray(plan.features)) {
      log.err('plan.json missing or invalid; cannot update the feature');
      return 1;
    }
    const feature = plan.features.find((f) => f.name === current.feature);
    if (!feature) {
      log.err(`feature ${current.feature} not found in plan.json`);
      return 1;
    }

    const now = new Date().toISOString();
    const evidence = evalCriteria.flatMap((criterion) => criterion.evidence ?? []);
    const syncedCriteria = current.criteria.map((criterion) => {
      const evaluated = evalCriteria.find((e) => e.id === criterion.id);
      return {
        ...criterion,
        passes: evaluated?.passes === true,
        evidence: (evaluated?.evidence ?? []) as SprintEvidence[],
      };
    });
    const feedback = evalResult.feedback ?? [];
    const iterations = (current.iterations ?? 0) + 1;
    const strategy = evalResult.strategy ?? 'refine';

    if (allPass) {
      feature.passes = true;
      feature.evidence = evidence;
      feature.sprint = current.name;
      feature.last_verified_at = now;
      if (opts.owner) feature.owner = opts.owner;
      writeState({ repoRoot: cwd, file: 'plan.json', data: plan });

      const updated = updateSprint(cwd, {
        status: 'passed',
        verdict: 'pass',
        finished_at: now,
        criteria: syncedCriteria,
        feedback,
        iterations,
      });
      const next = plan.features.find((f) => f.classification === 'KEEP' && f.passes !== true);
      updateSession(cwd, {
        current_stage: 'verifying',
        next_task: next
          ? `Create a sprint for ${next.name}.`
          : 'All KEEP features pass; run fast-verify then demo-coach.',
        completed: [
          ...(readSession(cwd)?.completed ?? []),
          `${current.feature} passed sprint ${current.name}`,
        ],
      });
      appendTrace(cwd, {
        type: 'sprint.passed',
        actor: 'cli',
        skill: 'sprint',
        status: 'ok',
        summary: `Sprint ${current.name} passed: ${current.feature}`,
        data: { evidence_count: evidence.length, iterations },
      });
      if (opts.json) {
        console.log(
          JSON.stringify(
            { ok: true, action: 'accepted', verdict: 'pass', sprint: updated, feature },
            null,
            2,
          ),
        );
      } else {
        log.ok(`sprint ${current.name} passed - ${current.feature} is now passes=true`);
        log.dim(`evidence: ${evidence.length} item(s), iterations: ${iterations}`);
      }
      return 0;
    }

    const budget = enforceSprintBudget({
      ...current,
      iterations,
      started_at: current.started_at ?? now,
    });
    const nextStatus = strategy === 'stop' || !budget.within ? 'blocked' : 'failed';
    const nextTask =
      strategy === 'replan'
        ? `Replan ${current.feature} with the planner; the contract no longer fits the demo path.`
        : strategy === 'pivot'
          ? `Pivot the approach for ${current.feature} while keeping the same sprint contract.`
          : strategy === 'stop'
            ? `Stop work on ${current.feature}; the evaluator called for a halt.`
            : `Fix feedback for ${current.feature}; re-run the generator then sprint review.`;
    const updated = updateSprint(cwd, {
      status: nextStatus,
      verdict: 'fail',
      finished_at: now,
      criteria: syncedCriteria,
      feedback,
      iterations,
    });
    updateSession(cwd, {
      current_stage: strategy === 'replan' ? 'planning' : 'building',
      next_task: nextTask,
      next_action: strategy,
      completed: [
        ...(readSession(cwd)?.completed ?? []),
        `${current.feature} failed sprint ${current.name}`,
      ],
      blockers: feedback.slice(0, 3),
    });
    appendTrace(cwd, {
      type: nextStatus === 'blocked' ? 'sprint.blocked' : 'sprint.failed',
      actor: 'cli',
      skill: 'sprint',
      status: nextStatus === 'blocked' ? 'error' : 'warn',
      summary: `Sprint ${current.name} ${nextStatus}: ${current.feature}`,
      data: { feedback_count: feedback.length, iterations },
    });
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            action: 'accepted',
            verdict: 'fail',
            strategy,
            sprint: updated,
            feedback,
          },
          null,
          2,
        ),
      );
    } else {
      log.err(
        `sprint ${current.name} ${nextStatus}: ${budget.reason ?? (strategy === 'stop' ? 'evaluator requested stop' : 'criteria not met')}`,
      );
      for (const item of feedback.slice(0, 5)) log.dim('  - ' + item);
    }
    return nextStatus === 'blocked' ? 1 : 1;
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
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, action: 'budget', sprint: next }, null, 2));
    } else {
      log.ok(
        `budget updated: time=${next.budget_minutes ?? 'unlimited'}m iterations=${next.max_iterations ?? 'unlimited'}`,
      );
    }
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
