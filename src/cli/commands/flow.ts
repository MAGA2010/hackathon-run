/**
 * flow.ts — guided end-to-end pipeline (scope → verify → demo → judge → ship).
 *
 * The Hackathon Run skills are designed to be invoked by an agent that
 * reads each SKILL.md, runs the Python scripts, and writes the state files.
 * `hackathon flow` is a planning aid that:
 *
 *   - reads the current state and decides which stage is next
 *   - prints the exact python command to run for each stage
 *   - can optionally --execute each step (requires python on PATH)
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
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { findSkillDirs } from '../../harness/loader.js';
import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

interface StageStep {
  /** script filename under <skill>/scripts/ */
  script: string;
  /** argv for the script; `{repoRoot}` is replaced with the resolved cwd */
  args: string[];
}

interface StageSpec {
  /** order in the pipeline */
  order: number;
  /** skill name (matches skills/<name>) */
  skill: string;
  /** state file this stage produces */
  produces: string;
  /** one-line description shown in the plan */
  summary: string;
  /** stage that must be complete before this one runs */
  requires?: string;
  /** what to ask the agent for if --execute can't auto-resolve */
  requiredArgs?: string[];
  /** python script + argv to run for this stage */
  steps: StageStep[];
}

const STAGES: StageSpec[] = [
  {
    order: 1,
    skill: 'scope-knife',
    produces: 'plan.json',
    summary: 'classify every feature KEEP/CUT/DEFER + lock the demo path',
    requiredArgs: ['demo_goal', 'time_remaining_minutes'],
    steps: [
      { script: 'scan_repo.py', args: ['{repoRoot}'] },
      {
        script: 'classify.py',
        args: [
          '--inventory',
          '/tmp/inv.json',
          '--demo-goal',
          '<one-sentence goal>',
          '--time-remaining',
          '240',
          '--out-dir',
          '{repoRoot}/.hackathon',
        ],
      },
    ],
  },
  {
    order: 2,
    skill: 'fast-verify',
    produces: 'verify.json',
    summary: 'run each demo_path step end-to-end, capture pass/fail',
    requires: 'plan.json',
    requiredArgs: [],
    steps: [
      {
        script: 'verify_step.py',
        args: ['--plan', '{repoRoot}/.hackathon/state/plan.json', '--step', '1'],
      },
    ],
  },
  {
    order: 3,
    skill: 'demo-coach',
    produces: 'demo.json',
    summary: 'generate a 60-second pitch script with 6 canonical steps',
    requires: 'verify.json',
    requiredArgs: ['duration_seconds'],
    steps: [
      {
        script: 'coach.py',
        args: ['--duration', '60', '--demo-goal', '<see plan.json>'],
      },
    ],
  },
  {
    order: 4,
    skill: 'judge-sim',
    produces: 'review.json',
    summary: 'simulate a judge panel + score across 7 dimensions',
    requires: 'demo.json',
    requiredArgs: [],
    steps: [
      {
        script: 'score.py',
        args: ['--demo', '{repoRoot}/.hackathon/state/demo.json'],
      },
    ],
  },
  {
    order: 5,
    skill: 'ship-pack',
    produces: 'ship.json',
    summary: 'secret scan + README checklist + reproducible packaging command',
    requires: 'review.json',
    requiredArgs: [],
    steps: [
      {
        script: 'audit.py',
        args: ['--repo-root', '{repoRoot}'],
      },
    ],
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
    steps: Array<{ script: string; args: string[] }>;
    requiredArgs?: string[];
    requires?: string;
  }>;
  nextCommand: string | null;
}

function findPython(): string | null {
  for (const candidate of ['python3', 'python']) {
    const r = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (r.status === 0) return candidate;
  }
  return null;
}

function quoteArg(arg: string): string {
  if (/^[\w./:+-]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["\\])/g, '\\$1')}"`;
}

function skillScript(cwd: string, skill: string, script: string): string {
  const dir = findSkillDirs(cwd).find((d) => basename(d) === skill);
  if (dir) return join(dir, 'scripts', script);
  return join(cwd, 'skills', skill, 'scripts', script);
}

export function buildPlan(opts: { cwd: string }): FlowPlan {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  const initialized = existsSync(stateDir);
  const python = findPython();
  const enriched = STAGES.map((s) => {
    const done = existsSync(join(stateDir, s.produces));
    const steps = s.steps.map((step) => ({
      script: skillScript(cwd, s.skill, step.script),
      args: step.args.map((arg) => arg.replace(/\{repoRoot\}/g, cwd)),
    }));
    const commands = steps.map(
      (step) =>
        `${python ?? 'python3'} ${quoteArg(step.script)} ${step.args.map(quoteArg).join(' ')}`,
    );
    return {
      order: s.order,
      skill: s.skill,
      produces: s.produces,
      summary: s.summary,
      done,
      commands,
      steps,
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
    pythonAvailable: python !== null,
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
  console.log(c.dim('python: ' + (plan.pythonAvailable ? 'available' : 'NOT FOUND on PATH')));
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
    const python = findPython();
    if (!python) {
      log.err('python not available; cannot --execute. Run the commands above manually.');
      return 2;
    }
    log.info('--execute: invoking the python scripts for each remaining stage');
    for (let i = plan.cursor; i < plan.stages.length; i++) {
      const stage = plan.stages[i];
      if (!stage) continue;
      for (const step of stage.steps) {
        const display = `${python} ${quoteArg(step.script)} ${step.args.map(quoteArg).join(' ')}`;
        log.info('$ ' + display);
        const r = spawnSync(python, [step.script, ...step.args], {
          stdio: 'inherit',
          cwd: plan.cwd,
        });
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
