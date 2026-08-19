/**
 * flow.ts — guided end-to-end pipeline (scope → verify → demo → judge → ship).
 *
 * The Hackathon Surgeon skills are designed to be invoked by an agent that
 * reads each SKILL.md, runs the Python scripts, and writes the state files.
 * `hackathon flow` is a planning aid that:
 *
 *   - reads the current state and decides which stage is next
 *   - prints the exact python3 command to run for each stage
 *   - can optionally --execute each step (requires python3 on PATH)
 *   - stops on first failure or missing prereq
 *
 * Stages (canonical 36-hour pipeline):
 *   1. scope-knife   → .hackathon/state/plan.json
 *   2. fast-verify   → .hackathon/state/verify.json
 *   3. demo-coach    → .hackathon/state/demo.json
 *   4. judge-sim     → .hackathon/state/review.json
 *   5. ship-pack     → .hackathon/state/ship.json
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

interface StageSpec {
  /** order in the pipeline */
  order: number;
  /** skill name (matches skills/<name>) */
  skill: string;
  /** state file this stage produces */
  produces: string;
  /** one-line description shown in the plan */
  summary: string;
  /** python command line(s) to run for this stage (use {repoRoot} placeholder) */
  commands: string[];
  /** what to ask the agent for if --execute can't auto-resolve */
  requiredArgs?: string[];
  /** stage that must be complete before this one runs */
  requires?: string;
}

const STAGES: StageSpec[] = [
  {
    order: 1,
    skill: 'scope-knife',
    produces: 'plan.json',
    summary: 'classify every feature KEEP/CUT/DEFER + lock the demo path',
    commands: [
      'python3 skills/scope-knife/scripts/scan_repo.py {repoRoot}',
      'python3 skills/scope-knife/scripts/classify.py --inventory /tmp/inv.json --demo-goal "<one-sentence goal>" --time-remaining 240 --out-dir {repoRoot}/.hackathon',
    ],
    requiredArgs: ['demo_goal', 'time_remaining_minutes'],
  },
  {
    order: 2,
    skill: 'fast-verify',
    produces: 'verify.json',
    summary: 'run each demo_path step end-to-end, capture pass/fail',
    requires: 'plan.json',
    commands: [
      'python3 skills/fast-verify/scripts/verify_step.py --plan {repoRoot}/.hackathon/state/plan.json --step 1',
    ],
    requiredArgs: [],
  },
  {
    order: 3,
    skill: 'demo-coach',
    produces: 'demo.json',
    summary: 'generate a 60-second pitch script with 6 canonical steps',
    requires: 'verify.json',
    commands: [
      'python3 skills/demo-coach/scripts/coach.py --duration 60 --demo-goal "<see plan.json>"',
    ],
    requiredArgs: ['duration_seconds'],
  },
  {
    order: 4,
    skill: 'judge-sim',
    produces: 'review.json',
    summary: 'simulate a judge panel + score across 5 dimensions',
    requires: 'demo.json',
    commands: [
      'python3 skills/judge-sim/scripts/score.py --demo {repoRoot}/.hackathon/state/demo.json',
    ],
    requiredArgs: [],
  },
  {
    order: 5,
    skill: 'ship-pack',
    produces: 'ship.json',
    summary: 'secret scan + README checklist + reproducible packaging command',
    requires: 'review.json',
    commands: ['python3 skills/ship-pack/scripts/audit.py --repo-root {repoRoot}'],
    requiredArgs: [],
  },
];

export interface FlowPlan {
  cwd: string;
  initialized: boolean;
  pythonAvailable: boolean;
  /** index into STAGES: 0 = nothing done, STAGES.length = everything done */
  cursor: number;
  /** per-stage status */
  stages: Array<{
    order: number;
    skill: string;
    produces: string;
    summary: string;
    done: boolean;
    commands: string[];
    requiredArgs?: string[];
    requires?: string;
  }>;
  nextCommand: string | null;
}

function pythonAvailable(): boolean {
  const r = spawnSync('python3', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

export function buildPlan(opts: { cwd: string }): FlowPlan {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  const initialized = existsSync(stateDir);
  const enriched = STAGES.map((s) => {
    const path = join(stateDir, s.produces);
    const done = existsSync(path);
    return {
      order: s.order,
      skill: s.skill,
      produces: s.produces,
      summary: s.summary,
      done,
      commands: s.commands.map((cmd) => cmd.replace(/\{repoRoot\}/g, cwd)),
      requiredArgs: s.requiredArgs,
      requires: s.requires,
    };
  });
  let cursor = enriched.findIndex((s) => !s.done);
  if (cursor < 0) cursor = enriched.length;
  const nextStage = cursor < enriched.length ? enriched[cursor] : null;
  return {
    cwd,
    initialized,
    pythonAvailable: pythonAvailable(),
    cursor,
    stages: enriched,
    nextCommand: nextStage?.commands[0] ?? null,
  };
}

export function flow(opts: { cwd: string; json?: boolean; execute?: boolean }): number {
  const plan = buildPlan({ cwd: opts.cwd });
  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
    return plan.cursor === plan.stages.length ? 0 : 1;
  }
  console.log(c.bold('\u{1F3AF}  hackathon flow \u2014 ' + plan.cwd));
  console.log(c.dim('state dir: ' + join(plan.cwd, '.hackathon', 'state')));
  console.log(c.dim('python3: ' + (plan.pythonAvailable ? 'available' : 'NOT FOUND on PATH')));
  console.log();
  if (!plan.initialized) {
    log.warn('.hackathon/state/ not found in ' + plan.cwd);
    log.dim('Run: hackathon init');
    return 1;
  }
  for (const s of plan.stages) {
    const mark = s.done ? c.green('\u2713') : c.gray('\u00b7');
    console.log(
      '  ' +
        mark +
        '  ' +
        c.bold('Stage ' + s.order + ': ' + s.skill) +
        c.dim('  \u2192 ' + s.produces),
    );
    console.log('     ' + c.dim(s.summary));
    if (!s.done) {
      for (const cmd of s.commands) console.log('     ' + c.cyan('$ ' + cmd));
      if (s.requiredArgs && s.requiredArgs.length > 0) {
        console.log('     ' + c.yellow('args required: ' + s.requiredArgs.join(', ')));
      }
    }
  }
  console.log();
  if (plan.cursor === plan.stages.length) {
    console.log(c.green('All 5 stages complete. Ready to ship.'));
    return 0;
  }
  const next = plan.stages[plan.cursor];
  console.log(c.bold('Next: ') + c.cyan(next?.skill ?? '?'));
  if (plan.nextCommand) {
    console.log(c.dim('Run: ') + plan.nextCommand);
  }
  if (opts.execute) {
    if (!plan.pythonAvailable) {
      log.err('python3 not available; cannot --execute. Run the commands above manually.');
      return 2;
    }
    log.info('--execute: invoking the python scripts for each remaining stage');
    for (let i = plan.cursor; i < plan.stages.length; i++) {
      const stage = plan.stages[i];
      if (!stage) continue;
      for (const cmd of stage.commands) {
        log.info('$ ' + cmd);
        // We deliberately do not shell-split: each command string is trusted
        // (built from STAGES above, no user input). Pass to sh -c.
        const r = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
        if (r.status !== 0) {
          log.err('stage ' + stage.skill + ' failed (exit ' + r.status + ')');
          return r.status ?? 1;
        }
      }
    }
    console.log();
    console.log(c.green('All stages executed. Re-run to see updated state.'));
    return 0;
  }
  return plan.cursor === 0 ? 1 : 0;
}
