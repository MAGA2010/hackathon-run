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
import { syncVerificationToPlan } from '../../harness/verification.js';
import { c } from '../lib/colors.js';
import { commandFail, commandOk, type CommandResult } from '../lib/command-result.js';
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

type PlanFeature = NonNullable<PlanLikeForSprint['features']>[number];

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

export interface SprintErrorPayload {
  ok: false;
  action: SprintOptions['subcommand'];
  error: string;
  hint?: string;
}

export type SprintPayload =
  | SprintErrorPayload
  | {
      ok: true;
      action: 'created' | 'approved' | 'budget';
      sprint: Sprint;
    }
  | {
      ok: true;
      action: 'review';
      sprint: Sprint;
      eval: ReturnType<typeof buildEvalSkeleton>;
      verification_sync: ReturnType<typeof syncVerificationToPlan>;
    }
  | {
      ok: true;
      action: 'accepted';
      verdict: 'pass';
      sprint: Sprint;
      feature: PlanFeature;
    }
  | {
      ok: false;
      action: 'accepted';
      verdict: 'fail';
      strategy: string;
      sprint: Sprint;
      feedback: string[];
      reason: string;
    }
  | Sprint;

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
      ...(criterion.weight != null ? { weight: criterion.weight } : {}),
      ...(criterion.threshold != null ? { threshold: criterion.threshold } : {}),
      evidence: [],
    })),
    feedback: [],
    strategy: 'refine',
    ...(sprint.rubric ? { rubric: sprint.rubric } : {}),
    iterations: sprint.iterations ?? 0,
    budget_minutes: sprint.budget_minutes ?? 0,
  };
}

export function sprintResult(opts: SprintOptions): CommandResult<SprintPayload> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const stateDir = resolve(cwd, '.hackathon', 'state');

  if (opts.subcommand === 'new') {
    if (!existsSync(stateDir)) {
      return commandFail({
        ok: false,
        action: 'new',
        error: '.hackathon/state/ not found in ' + cwd,
        hint: 'Run: hackathon init first',
      });
    }
    const existing = readSprint(cwd);
    if (existing && !opts.force) {
      return commandFail({
        ok: false,
        action: 'new',
        error: 'active sprint already exists: ' + existing.name,
        hint: 'Use --force to overwrite, or sprint status to inspect it.',
      });
    }
    const plan = readPlan(cwd);
    if (!plan) {
      return commandFail({
        ok: false,
        action: 'new',
        error: 'plan.json missing or invalid; run scope-knife first',
      });
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
    return commandOk({ ok: true, action: 'created', sprint: sprintData });
  }

  if (opts.subcommand === 'approve') {
    const current = readSprint(cwd);
    if (!current) {
      return commandFail({
        ok: false,
        action: 'approve',
        error: 'no active sprint; run hackathon sprint new first',
      });
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
    return commandOk({ ok: true, action: 'approved', sprint: updated });
  }

  if (opts.subcommand === 'review') {
    const current = readSprint(cwd);
    if (!current) {
      return commandFail({
        ok: false,
        action: 'review',
        error: 'no active sprint; run hackathon sprint new first',
      });
    }
    if (current.status === 'proposed') {
      return commandFail({
        ok: false,
        action: 'review',
        error: 'sprint is still proposed; run hackathon sprint approve first',
      });
    }
    if (['passed', 'failed', 'blocked'].includes(current.status)) {
      return commandFail({
        ok: false,
        action: 'review',
        error: `sprint is ${current.status}; create a new sprint before reviewing`,
      });
    }
    const budget = enforceSprintBudget(current);
    if (!budget.within) {
      updateSprint(cwd, {
        status: 'blocked',
        feedback: [...(current.feedback ?? []), budget.reason ?? 'budget exhausted'],
      });
      return commandFail({
        ok: false,
        action: 'review',
        error: budget.reason ?? 'budget exhausted',
      });
    }
    const verificationSync = syncVerificationToPlan(cwd);
    const pending = updateSprint(cwd, { status: 'pending_review' });
    const evalData = buildEvalSkeleton(current);
    writeState({ repoRoot: cwd, file: 'eval.json', data: evalData });
    appendTrace(cwd, {
      type: 'sprint.review',
      actor: 'cli',
      skill: 'sprint',
      status: 'ok',
      summary: `Emitted evaluator handoff for ${current.name}`,
      data: {
        verdict: 'pending',
        features_synced: verificationSync.updates.length,
      },
    });
    return commandOk({
      ok: true,
      action: 'review',
      sprint: pending,
      eval: evalData,
      verification_sync: verificationSync,
    });
  }

  if (opts.subcommand === 'accept') {
    const current = readSprint(cwd);
    if (!current) {
      return commandFail({
        ok: false,
        action: 'accept',
        error: 'no active sprint; run hackathon sprint new first',
      });
    }
    const evalResult = readEval(cwd);
    if (!evalResult) {
      return commandFail({
        ok: false,
        action: 'accept',
        error: 'eval.json missing; run hackathon sprint review first',
      });
    }
    if (evalResult.sprint && evalResult.sprint !== current.name) {
      return commandFail({
        ok: false,
        action: 'accept',
        error: `eval.json targets ${evalResult.sprint}, not ${current.name}`,
      });
    }
    const verdict = evalResult.verdict;
    if (verdict !== 'pass' && verdict !== 'fail') {
      return commandFail({
        ok: false,
        action: 'accept',
        error: `eval verdict is ${verdict ?? 'missing'}; only pass/fail can be accepted`,
      });
    }
    syncVerificationToPlan(cwd);

    const evalCriteria = evalResult.criteria ?? [];
    const allPass =
      verdict === 'pass' &&
      evalCriteria.length === current.criteria.length &&
      evalCriteria.every((criterion) => criterion.passes === true);
    const plan = readPlan(cwd);
    if (!plan || !Array.isArray(plan.features)) {
      return commandFail({
        ok: false,
        action: 'accept',
        error: 'plan.json missing or invalid; cannot update the feature',
      });
    }
    const feature = plan.features.find((f) => f.name === current.feature);
    if (!feature) {
      return commandFail({
        ok: false,
        action: 'accept',
        error: `feature ${current.feature} not found in plan.json`,
      });
    }

    const now = new Date().toISOString();
    const evidence = evalCriteria.flatMap((criterion) => criterion.evidence ?? []);
    const syncedCriteria = current.criteria.map((criterion) => {
      const evaluated = evalCriteria.find((e) => e.id === criterion.id);
      return {
        ...criterion,
        passes: evaluated?.passes === true,
        evidence: (evaluated?.evidence ?? []) as SprintEvidence[],
        score: evaluated?.score ?? criterion.score,
        weight: evaluated?.weight ?? criterion.weight,
        threshold: evaluated?.threshold ?? criterion.threshold,
      };
    });
    const feedback = evalResult.feedback ?? [];
    const iterations = (current.iterations ?? 0) + 1;
    const strategy = evalResult.strategy ?? 'refine';

    if (allPass) {
      feature.passes = true;
      feature.evidence = [...(feature.evidence ?? []), ...evidence];
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
        data: { evidence_count: feature.evidence.length, iterations },
      });
      return commandOk({
        ok: true,
        action: 'accepted',
        verdict: 'pass',
        sprint: updated,
        feature,
      });
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
    const data = {
      ok: false as const,
      action: 'accepted' as const,
      verdict: 'fail' as const,
      strategy,
      sprint: updated,
      feedback,
      reason:
        budget.reason ?? (strategy === 'stop' ? 'evaluator requested stop' : 'criteria not met'),
    };
    return commandFail(data);
  }

  if (opts.subcommand === 'budget') {
    const current = readSprint(cwd);
    if (!current) {
      return commandFail({
        ok: false,
        action: 'budget',
        error: 'no active sprint; run hackathon sprint new first',
      });
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
    return commandOk({ ok: true, action: 'budget', sprint: next });
  }

  const current = readSprint(cwd);
  if (!current) {
    return commandFail({
      ok: false,
      action: 'status',
      error: 'no active sprint; run hackathon sprint new first',
    });
  }
  return commandOk(current);
}

export function sprint(opts: SprintOptions): number {
  const result = sprintResult(opts);
  const payload = result.data;
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return result.exitCode;
  }
  if ('error' in payload) {
    log.err(payload.error);
    if (payload.hint) log.dim(payload.hint);
    if (payload.error.includes('.hackathon/state/')) log.dim('Run: hackathon init first');
    return result.exitCode;
  }
  if (!('action' in payload)) {
    console.log(c.bold('hackathon sprint status \u2014 ' + resolve(opts.cwd ?? process.cwd())));
    console.log();
    console.log('  name:      ' + payload.name);
    console.log('  feature:   ' + payload.feature);
    console.log('  goal:      ' + payload.goal);
    console.log('  status:    ' + payload.status);
    console.log('  verdict:   ' + (payload.verdict ?? 'pending'));
    console.log('  iterations:' + (payload.iterations ?? 0));
    console.log(
      '  criteria:  ' +
        payload.criteria.filter((criterion) => criterion.passes).length +
        '/' +
        payload.criteria.length +
        ' passing',
    );
    return result.exitCode;
  }
  if (payload.action === 'created') {
    log.ok(`wrote sprint contract ${payload.sprint.name} for ${payload.sprint.feature}`);
    log.dim(`criteria: ${payload.sprint.criteria.length} (all default-FAIL)`);
    return result.exitCode;
  }
  if (payload.action === 'approved') {
    log.ok(`approved ${payload.sprint.name} - generator may start`);
    return result.exitCode;
  }
  if (payload.action === 'budget') {
    log.ok(
      `budget updated: time=${payload.sprint.budget_minutes ?? 'unlimited'}m iterations=${payload.sprint.max_iterations ?? 'unlimited'}`,
    );
    return result.exitCode;
  }
  if (payload.action === 'review') {
    console.log(c.bold('Evaluator handoff'));
    console.log();
    console.log(c.dim('Role: read-only evaluator. Do not edit code or state files.'));
    console.log(
      c.dim('Rule: every criterion starts false; PASS requires machine-checkable evidence.'),
    );
    console.log(c.dim('Write: update .hackathon/state/eval.json only.'));
    console.log();
    for (const criterion of payload.sprint.criteria) {
      console.log('  ' + c.cyan(criterion.id) + '  ' + criterion.description);
    }
    if (payload.sprint.budget_minutes != null || payload.sprint.max_iterations != null) {
      console.log();
      console.log(
        c.dim(
          `budget: ${payload.sprint.budget_minutes ?? 'unlimited'}m, iterations ${payload.sprint.max_iterations ?? 'unlimited'}`,
        ),
      );
    }
    return result.exitCode;
  }
  if (payload.action === 'accepted' && payload.verdict === 'pass') {
    log.ok(`sprint ${payload.sprint.name} passed - ${payload.feature?.name} is now passes=true`);
    log.dim(
      `evidence: ${payload.feature?.evidence?.length ?? 0} item(s), iterations: ${payload.sprint.iterations ?? 0}`,
    );
    return result.exitCode;
  }
  if (payload.action === 'accepted' && payload.verdict === 'fail') {
    log.err(`sprint ${payload.sprint.name} ${payload.sprint.status}: ${payload.reason}`);
    for (const item of payload.feedback.slice(0, 5)) log.dim('  - ' + item);
    return result.exitCode;
  }
  log.err('sprint command failed');
  return result.exitCode;
}
