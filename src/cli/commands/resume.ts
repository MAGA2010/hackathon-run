/**
 * resume.ts — print the handoff brief a fresh agent needs to continue work.
 *
 * The brief is intentionally small: current stage, next task, feature
 * progress, active sprint, blockers, budget, and environment commands. It
 * should be enough to resume a long-running task without the previous chat.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { readSession, writeSession, defaultSession } from '../../harness/session.js';
import { readSprint } from '../../harness/sprint.js';
import { traceStats } from '../../harness/trace.js';
import { readState } from '../../harness/state.js';
import { isStopped, stopMessage, readSteer } from '../../harness/guard.js';
import { progressExists, progressPath } from '../../harness/progress.js';
import { buildPlan } from './flow.js';
import { c } from '../lib/colors.js';
import { commandFail, commandOk, type CommandResult } from '../lib/command-result.js';
import { log } from '../lib/logger.js';

interface PlanSnapshot {
  demo_goal?: string;
  features?: Array<{
    name?: string;
    classification?: string;
    passes?: boolean;
  }>;
}

export interface ResumeOptions {
  cwd: string;
  json?: boolean;
}

export interface ResumePayload {
  repo_root: string;
  state_dir: string;
  session: ReturnType<typeof defaultSession>;
  plan: {
    demo_goal: string | null;
    keep_features: number;
    passing_features: number;
    next_feature: string | null;
  } | null;
  plan_error: string | null;
  sprint: {
    name: string;
    feature: string;
    status: string;
    verdict: string | null;
    criteria_passed: number;
    criteria_total: number;
    iterations: number;
    budget_minutes: number | null;
    max_iterations: number | null;
  } | null;
  next_stage: string;
  trace: ReturnType<typeof traceStats>;
  stopped: boolean;
  stop_message: string | null;
  steer: string | null;
  progress_file: string;
}

export interface ResumeErrorPayload {
  error: string;
}

function safeReadPlan(cwd: string): { plan: PlanSnapshot | null; error: string | null } {
  try {
    return { plan: readState<PlanSnapshot>({ repoRoot: cwd, file: 'plan.json' }), error: null };
  } catch (e) {
    return { plan: null, error: (e as Error).message };
  }
}

export function resumeResult(
  opts: ResumeOptions,
): CommandResult<ResumePayload | ResumeErrorPayload> {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  if (!existsSync(stateDir)) {
    return commandFail({ error: '.hackathon/state/ not found in ' + cwd });
  }

  const session = readSession(cwd) ?? defaultSession(cwd);
  if (!readSession(cwd)) writeSession(cwd, session);

  const { plan, error: planError } = safeReadPlan(cwd);
  const sprint = readSprint(cwd);
  const flowPlan = buildPlan({ cwd });
  const trace = traceStats(cwd);
  const stopped = isStopped(cwd);
  const steer = stopped ? null : readSteer(cwd, true);
  const progressFile = progressPath(cwd);

  const keep = (plan?.features ?? []).filter((f) => f.classification === 'KEEP');
  const passed = keep.filter((f) => f.passes === true).length;
  const nextStage =
    flowPlan.cursor < flowPlan.stages.length ? flowPlan.stages[flowPlan.cursor] : null;

  const payload: ResumePayload = {
    repo_root: cwd,
    state_dir: stateDir,
    session,
    plan: plan
      ? {
          demo_goal: plan.demo_goal ?? null,
          keep_features: keep.length,
          passing_features: passed,
          next_feature: keep.find((f) => f.passes !== true)?.name ?? null,
        }
      : null,
    plan_error: planError,
    sprint: sprint
      ? {
          name: sprint.name,
          feature: sprint.feature,
          status: sprint.status,
          verdict: sprint.verdict ?? null,
          criteria_passed: sprint.criteria.filter((criterion) => criterion.passes).length,
          criteria_total: sprint.criteria.length,
          iterations: sprint.iterations ?? 0,
          budget_minutes: sprint.budget_minutes ?? null,
          max_iterations: sprint.max_iterations ?? null,
        }
      : null,
    next_stage: nextStage?.skill ?? 'complete',
    trace,
    stopped,
    stop_message: stopped ? stopMessage(cwd) : null,
    steer,
    progress_file: progressFile,
  };
  return {
    exitCode: stopped ? 1 : 0,
    data: payload,
  };
}

export function resume(opts: ResumeOptions): number {
  const result = resumeResult(opts);
  if ('error' in result.data) {
    log.err(result.data.error);
    log.dim('Run: hackathon init');
    return result.exitCode;
  }
  const payload = result.data;

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return result.exitCode;
  }

  if (payload.stopped) {
    log.err('AGENT_STOP exists; agent must not continue.');
    log.dim(payload.stop_message ?? 'Operator requested stop.');
    log.dim('Run: hackathon guard clear to resume.');
    return result.exitCode;
  }

  const cwd = payload.repo_root;
  const stateDir = payload.state_dir;
  const session = payload.session;
  const plan = payload.plan;
  const steer = payload.steer;
  const sprint = payload.sprint;
  console.log(c.bold('hackathon resume \u2014 ' + cwd));
  console.log(c.dim('state dir: ' + stateDir));
  console.log();
  console.log(c.bold('Stage:    ') + c.cyan(session.current_stage));
  console.log(c.bold('Next:     ') + session.next_task);
  if (session.next_action) console.log(c.bold('Strategy: ') + session.next_action);
  console.log(c.bold('Pipeline: ') + c.dim(payload.next_stage));
  if (plan) {
    console.log(
      c.bold('Features: ') +
        `${plan.passing_features}/${plan.keep_features} KEEP features passing (${plan.keep_features - plan.passing_features} remain default-FAIL)`,
    );
    if (plan.next_feature) console.log(c.bold('Feature:  ') + plan.next_feature);
  }
  if (steer) {
    console.log(c.bold('Steer:    ') + steer.replace(/\n/g, '\n          '));
  }
  console.log(
    c.bold('Progress: ') +
      (progressExists(cwd) ? payload.progress_file : payload.progress_file + ' (not yet created)'),
  );
  if (sprint) {
    console.log(
      c.bold('Sprint:   ') +
        `${sprint.name} [${sprint.status}] ${sprint.criteria_passed}/${sprint.criteria_total} criteria passing`,
    );
  }
  if (session.blockers.length > 0) {
    console.log(c.bold('Blockers: '));
    for (const blocker of session.blockers) console.log('  - ' + blocker);
  }
  if (session.environment.init_command) {
    console.log(c.bold('Init:     ') + session.environment.init_command);
  }
  if (session.environment.verify_command) {
    console.log(c.bold('Verify:   ') + session.environment.verify_command);
  }
  if (session.budget_minutes != null || session.max_iterations != null) {
    console.log(
      c.bold('Budget:   ') +
        `time=${session.budget_minutes ?? 'unlimited'}m iterations=${session.max_iterations ?? 'unlimited'}`,
    );
  }
  console.log();
  console.log(
    c.dim(`${payload.trace.count} trace events; last=${payload.trace.lastEvent?.type ?? 'none'}`),
  );
  if (payload.plan_error) log.warn('plan.json could not be parsed: ' + payload.plan_error);
  return result.exitCode;
}
