/**
 * eval.ts — lightweight evaluator dashboard.
 *
 * Reads the active eval.json + sprint.json and reports the verdict, rubric
 * strategy, pass rate, and weighted score so a team can treat each sprint as
 * a mini eval run instead of a black-box pass/fail.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { readSprint } from '../../harness/sprint.js';
import { readState } from '../../harness/state.js';
import { c } from '../lib/colors.js';
import { commandFail, commandOk, type CommandResult } from '../lib/command-result.js';
import { log } from '../lib/logger.js';

interface EvalFileLike {
  verdict?: 'pass' | 'fail' | 'blocked' | 'pending';
  strategy?: 'refine' | 'pivot' | 'replan' | 'stop';
  criteria?: Array<{
    id?: string;
    description?: string;
    passes?: boolean;
    score?: number;
    weight?: number;
  }>;
  feedback?: string[];
  rubric?: {
    dimensions?: Array<{
      id?: string;
      name?: string;
      description?: string;
      weight?: number;
      threshold?: number;
    }>;
  };
}

export interface EvalStatusOptions {
  cwd: string;
  json?: boolean;
}

export interface EvalStatusPayload {
  verdict: string;
  strategy: string;
  criteria_passed: number;
  criteria_total: number;
  weighted_score: number | null;
  rubric_dimensions: Array<{
    id: string;
    name: string;
    weight: number;
    threshold: number;
  }>;
  sprint: { name: string; feature: string; status: string } | null;
  feedback: string[];
}

export interface EvalStatusErrorPayload {
  error: string;
}

export function evalStatusResult(
  opts: EvalStatusOptions,
): CommandResult<EvalStatusPayload | EvalStatusErrorPayload> {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  if (!existsSync(stateDir)) {
    return commandFail({ error: '.hackathon/state/ not found in ' + cwd });
  }

  const evalData = readState<EvalFileLike>({ repoRoot: cwd, file: 'eval.json' });
  if (!evalData) {
    return commandFail({ error: 'eval.json missing; run hackathon sprint review first' });
  }

  const sprint = readSprint(cwd);
  const criteria = evalData.criteria ?? [];
  const passed = criteria.filter((criterion) => criterion.passes === true).length;
  const scored = criteria.filter(
    (criterion) => typeof criterion.score === 'number' && typeof criterion.weight === 'number',
  );
  const weightedScore =
    scored.length > 0
      ? Math.round(
          (scored.reduce(
            (sum, criterion) => sum + (criterion.score ?? 0) * (criterion.weight ?? 0),
            0,
          ) /
            scored.reduce((sum, criterion) => sum + (criterion.weight ?? 0), 0)) *
            10,
        ) / 10
      : null;
  const strategy = evalData.strategy ?? 'refine';
  const dimensions = evalData.rubric?.dimensions ?? [];

  const payload: EvalStatusPayload = {
    verdict: evalData.verdict ?? 'pending',
    strategy,
    criteria_passed: passed,
    criteria_total: criteria.length,
    weighted_score: weightedScore,
    rubric_dimensions: dimensions.map((dimension) => ({
      id: dimension.id ?? '',
      name: dimension.name ?? '',
      weight: dimension.weight ?? 0,
      threshold: dimension.threshold ?? 0,
    })),
    sprint: sprint ? { name: sprint.name, feature: sprint.feature, status: sprint.status } : null,
    feedback: evalData.feedback ?? [],
  };
  return commandOk(payload);
}

export function evalStatus(opts: EvalStatusOptions): number {
  const result = evalStatusResult(opts);
  if ('error' in result.data) {
    log.err(result.data.error);
    if (result.data.error.includes('.hackathon/state/')) log.dim('Run: hackathon init');
    return result.exitCode;
  }
  const payload = result.data;
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return result.exitCode;
  }

  const cwd = resolve(opts.cwd);
  console.log(c.bold('hackathon eval \u2014 ' + cwd));
  console.log('  verdict:      ' + payload.verdict);
  console.log('  strategy:     ' + payload.strategy);
  console.log('  criteria:     ' + `${payload.criteria_passed}/${payload.criteria_total} passing`);
  if (payload.weighted_score != null) {
    console.log('  weighted:     ' + payload.weighted_score + ' / 5');
  }
  for (const dimension of payload.rubric_dimensions) {
    console.log(
      '  rubric:       ' +
        `${dimension.name ?? dimension.id ?? '?'} (weight ${dimension.weight ?? 0}, threshold ${dimension.threshold ?? 0})`,
    );
  }
  if (payload.feedback.length > 0) {
    console.log(c.bold('  feedback:'));
    for (const item of payload.feedback.slice(0, 5)) console.log('    - ' + item);
  }
  return result.exitCode;
}
