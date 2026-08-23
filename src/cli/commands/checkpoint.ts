/**
 * checkpoint.ts — append an agent-maintained progress entry.
 *
 * Every long-running session should end with one checkpoint so the next
 * fresh context can resume from PROGRESS.md + git log without guessing.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { appendProgress, progressPath } from '../../harness/progress.js';
import { defaultSession, readSession, updateSession } from '../../harness/session.js';
import { appendTrace } from '../../harness/trace.js';
import { log } from '../lib/logger.js';

export interface CheckpointOptions {
  cwd: string;
  summary: string;
  stage?: string;
  nextTask?: string;
  feature?: string;
  actor?: string;
  json?: boolean;
}

export function checkpoint(opts: CheckpointOptions): number {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  if (!existsSync(stateDir)) {
    log.err('.hackathon/state/ not found in ' + cwd);
    log.dim('Run: hackathon init');
    return 1;
  }
  if (!opts.summary.trim()) {
    log.err('checkpoint requires --summary');
    return 1;
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
  appendTrace(cwd, {
    type: 'session.checkpoint',
    actor: opts.actor ?? 'agent',
    skill: 'checkpoint',
    status: 'ok',
    summary: opts.summary,
    data: { stage, next_task: nextTask, progress_file: path },
  });

  if (opts.json) {
    console.log(
      JSON.stringify({ ok: true, action: 'checkpoint', path, stage, next_task: nextTask }, null, 2),
    );
  } else {
    log.ok(`checkpoint appended to ${progressPath(cwd)}`);
    log.dim(`stage: ${stage}; next: ${nextTask}`);
  }
  return 0;
}
