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

function safeReadPlan(cwd: string): { plan: PlanSnapshot | null; error: string | null } {
  try {
    return { plan: readState<PlanSnapshot>({ repoRoot: cwd, file: 'plan.json' }), error: null };
  } catch (e) {
    return { plan: null, error: (e as Error).message };
  }
}

export function resume(opts: ResumeOptions): number {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  if (!existsSync(stateDir)) {
    log.err('.hackathon/state/ not found in ' + cwd);
    log.dim('Run: hackathon init');
    return 1;
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

  const payload = {
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

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return stopped ? 1 : 0;
  }

  if (stopped) {
    log.err('AGENT_STOP exists; agent must not continue.');
    log.dim(stopMessage(cwd) ?? 'Operator requested stop.');
    log.dim('Run: hackathon guard clear to resume.');
    return 1;
  }

  console.log(c.bold('hackathon resume \u2014 ' + cwd));
  console.log(c.dim('state dir: ' + stateDir));
  console.log();
  console.log(c.bold('Stage:    ') + c.cyan(session.current_stage));
  console.log(c.bold('Next:     ') + session.next_task);
  console.log(
    c.bold('Stage:    ') +
      c.dim(nextStage ? nextStage.skill + ' -> ' + nextStage.produces : 'complete'),
  );
  if (plan) {
    console.log(
      c.bold('Features: ') +
        `${passed}/${keep.length} KEEP features passing (${keep.length - passed} remain default-FAIL)`,
    );
    const nextFeature = keep.find((f) => f.passes !== true);
    if (nextFeature) console.log(c.bold('Feature:  ') + nextFeature.name);
  }
  if (steer) {
    console.log(c.bold('Steer:    ') + steer.replace(/\n/g, '\n          '));
  }
  console.log(
    c.bold('Progress: ') +
      (progressExists(cwd) ? progressFile : progressFile + ' (not yet created)'),
  );
  if (sprint) {
    console.log(
      c.bold('Sprint:   ') +
        `${sprint.name} [${sprint.status}] ${sprint.criteria.filter((criterion) => criterion.passes).length}/${sprint.criteria.length} criteria passing`,
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
  console.log(c.dim(`${trace.count} trace events; last=${trace.lastEvent?.type ?? 'none'}`));
  if (planError) log.warn('plan.json could not be parsed: ' + planError);
  return 0;
}
