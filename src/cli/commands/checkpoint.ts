/**
 * checkpoint.ts — append an agent-maintained progress entry.
 *
 * Every long-running session should end with one checkpoint so the next
 * fresh context can resume from PROGRESS.md + git log without guessing.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { appendProgress, progressPath, writeSessionBrief } from '../../harness/progress.js';
import { defaultSession, readSession, updateSession } from '../../harness/session.js';
import { readSprint } from '../../harness/sprint.js';
import { readState } from '../../harness/state.js';
import { appendTrace, traceStats, traceFile } from '../../harness/trace.js';
import { commandFail, commandOk, type CommandResult } from '../lib/command-result.js';
import { log } from '../lib/logger.js';

export interface CheckpointOptions {
  cwd: string;
  summary: string;
  stage?: string;
  nextTask?: string;
  feature?: string;
  actor?: string;
  compress?: boolean;
  json?: boolean;
}

export interface CheckpointPayload {
  ok: true;
  action: 'checkpoint';
  path: string;
  stage: string;
  next_task: string;
  compressed_session: string | null;
  compressed_lines: number | null;
}

export interface CheckpointErrorPayload {
  ok: false;
  action: 'checkpoint';
  error: string;
}

interface PlanBrief {
  features?: Array<{
    name?: string;
    classification?: string;
    passes?: boolean;
  }>;
}

export function checkpointResult(
  opts: CheckpointOptions,
): CommandResult<CheckpointPayload | CheckpointErrorPayload> {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  if (!existsSync(stateDir)) {
    return commandFail({
      ok: false,
      action: 'checkpoint',
      error: '.hackathon/state/ not found in ' + cwd,
    });
  }
  if (!opts.summary.trim()) {
    return commandFail({
      ok: false,
      action: 'checkpoint',
      error: 'checkpoint requires --summary',
    });
  }

  const session = readSession(cwd) ?? defaultSession(cwd);
  const stage = opts.stage ?? session.current_stage;
  const nextTask = opts.nextTask ?? session.next_task;
  const path = appendProgress(cwd, {
    actor: opts.actor ?? 'agent',
    stage,
    feature: opts.feature,
    next_task: nextTask,
    summary: opts.summary,
  });
  updateSession(cwd, { current_stage: stage, next_task: nextTask });
  let compressed: { path: string; lineCount: number } | null = null;
  if (opts.compress) {
    const sprint = readSprint(cwd);
    const plan = (() => {
      try {
        return readState<PlanBrief>({ repoRoot: cwd, file: 'plan.json' });
      } catch {
        return null;
      }
    })();
    const features = (plan?.features ?? [])
      .filter((feature): feature is { name: string; classification?: string; passes?: boolean } =>
        Boolean(feature.name),
      )
      .map((feature) => ({
        name: feature.name,
        classification: feature.classification,
        passes: feature.passes,
      }));
    compressed = writeSessionBrief(cwd, {
      session: { ...session, current_stage: stage, next_task: nextTask },
      latestSummary: opts.summary,
      traceCount: traceStats(cwd).count,
      traceFile: traceFile(cwd),
      sprint: sprint
        ? {
            name: sprint.name,
            feature: sprint.feature,
            status: sprint.status,
            verdict: sprint.verdict,
            iterations: sprint.iterations,
            budgetMinutes: sprint.budget_minutes,
            maxIterations: sprint.max_iterations,
          }
        : null,
      features,
    });
  }
  appendTrace(cwd, {
    type: 'session.checkpoint',
    actor: opts.actor ?? 'agent',
    skill: 'checkpoint',
    status: 'ok',
    summary: opts.summary,
    data: {
      stage,
      next_task: nextTask,
      progress_file: path,
      compressed_session: compressed?.path ?? null,
      compressed_lines: compressed?.lineCount ?? null,
    },
  });

  return commandOk({
    ok: true,
    action: 'checkpoint',
    path,
    stage,
    next_task: nextTask,
    compressed_session: compressed?.path ?? null,
    compressed_lines: compressed?.lineCount ?? null,
  });
}

export function checkpoint(opts: CheckpointOptions): number {
  const result = checkpointResult(opts);
  if (!result.data.ok) {
    log.err(result.data.error);
    if (result.data.error.includes('.hackathon/state/')) log.dim('Run: hackathon init');
    return result.exitCode;
  }
  if (opts.json) {
    console.log(JSON.stringify(result.data, null, 2));
    return result.exitCode;
  }
  const cwd = resolve(opts.cwd);
  log.ok(`checkpoint appended to ${progressPath(cwd)}`);
  log.dim(`stage: ${result.data.stage}; next: ${result.data.next_task}`);
  if (result.data.compressed_session) {
    log.ok(
      `compressed session brief written to ${result.data.compressed_session} (${result.data.compressed_lines} lines)`,
    );
  }
  return result.exitCode;
}
