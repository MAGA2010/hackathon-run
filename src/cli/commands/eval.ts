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

export function evalStatus(opts: EvalStatusOptions): number {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  if (!existsSync(stateDir)) {
    log.err('.hackathon/state/ not found in ' + cwd);
    log.dim('Run: hackathon init');
    return 1;
  }

  const evalData = readState<EvalFileLike>({ repoRoot: cwd, file: 'eval.json' });
  if (!evalData) {
    log.err('eval.json missing; run hackathon sprint review first');
    return 1;
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

  const payload = {
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

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  console.log(c.bold('hackathon eval \u2014 ' + cwd));
  console.log('  verdict:      ' + (evalData.verdict ?? 'pending'));
  console.log('  strategy:     ' + strategy);
  console.log('  criteria:     ' + `${passed}/${criteria.length} passing`);
  if (weightedScore != null) console.log('  weighted:     ' + weightedScore + ' / 5');
  for (const dimension of dimensions) {
    console.log(
      '  rubric:       ' +
        `${dimension.name ?? dimension.id ?? '?'} (weight ${dimension.weight ?? 0}, threshold ${dimension.threshold ?? 0})`,
    );
  }
  if ((evalData.feedback ?? []).length > 0) {
    console.log(c.bold('  feedback:'));
    for (const item of (evalData.feedback ?? []).slice(0, 5)) console.log('    - ' + item);
  }
  return 0;
}
