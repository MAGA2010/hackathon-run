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

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { findSkillDirs } from '../../harness/loader.js';
import {
  lifecycleSummary,
  readLifecycleSnapshot,
  type FlowStateFile,
  type LifecycleStage,
  type LifecycleSummary,
} from '../../harness/lifecycle.js';
import { executeVerifyRun } from '../../harness/verify-run.js';
import { resolvePython, shellPythonCommand, type PythonResolution } from '../../harness/python.js';
import { readState, writeState } from '../../harness/state.js';
import { appendTrace, readTraces } from '../../harness/trace.js';
import { readSession, updateSession } from '../../harness/session.js';
import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

interface StageStep {
  /** script filename under <skill>/scripts/ */
  script: string;
  /**
   * argv for the script. Placeholders are resolved before display/execution:
   * `{repoRoot}`, `{demoGoal}`, `{timeRemaining}`, `{inventory}`.
   */
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
  /** python script + argv to run for this stage */
  steps: StageStep[];
}

const STAGES: StageSpec[] = [
  {
    order: 1,
    skill: 'scope-knife',
    produces: 'plan.json',
    summary: 'classify every feature KEEP/CUT/DEFER + lock the demo path',
    steps: [
      { script: 'scan_repo.py', args: ['{repoRoot}'] },
      {
        script: 'classify.py',
        args: [
          '--inventory',
          '{inventory}',
          '--demo-goal',
          '{demoGoal}',
          '--time-remaining',
          '{timeRemaining}',
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
    steps: [],
  },
  {
    order: 3,
    skill: 'demo-coach',
    produces: 'demo.json',
    summary: 'generate a 60-second pitch script with 6 canonical steps',
    requires: 'verify.json',
    steps: [
      {
        script: 'coach.py',
        args: [
          '--duration',
          '60',
          '--demo-goal',
          '{demoGoal}',
          '--out-dir',
          '{repoRoot}/.hackathon',
        ],
      },
    ],
  },
  {
    order: 4,
    skill: 'judge-sim',
    produces: 'review.json',
    summary: 'simulate a judge panel + score across 7 dimensions',
    requires: 'demo.json',
    steps: [
      {
        script: 'score.py',
        args: ['--repo-root', '{repoRoot}', '--out-dir', '{repoRoot}/.hackathon'],
      },
    ],
  },
  {
    order: 5,
    skill: 'ship-pack',
    produces: 'ship.json',
    summary: 'secret scan + README checklist + reproducible packaging command',
    requires: 'review.json',
    steps: [
      {
        script: 'audit.py',
        args: ['--repo-root', '{repoRoot}', '--out-dir', '{repoRoot}/.hackathon'],
      },
    ],
  },
];

export interface FlowPlan {
  cwd: string;
  initialized: boolean;
  lifecycle: LifecycleStage;
  nextSkill: string | null;
  lifecycle_snapshot: LifecycleSummary;
  pythonAvailable: boolean;
  python: PythonResolution | null;
  traceCount?: number;
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
    requires?: string;
  }>;
  nextCommand: string | null;
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

function resolveArgs(args: string[], values: Record<string, string>): string[] {
  return args.map((arg) =>
    arg.replace(/\{(repoRoot|demoGoal|timeRemaining|inventory)\}/g, (match, key: string) => {
      return values[key] ?? match;
    }),
  );
}

function resolveFlowPython(
  python: string | null | undefined,
  pythonResolution: PythonResolution | null | undefined,
): PythonResolution | null {
  if (pythonResolution !== undefined) return pythonResolution;
  if (python === null) return null;
  if (python !== undefined) {
    return { executable: python, args: [], source: 'PYTHON', version: '' };
  }
  return resolvePython();
}

export function buildPlan(opts: {
  cwd: string;
  demoGoal?: string;
  timeRemaining?: number;
  inventoryPath?: string;
  python?: string | null;
  pythonResolution?: PythonResolution | null;
}): FlowPlan {
  const cwd = resolve(opts.cwd);
  const snapshot = readLifecycleSnapshot(cwd);
  const initialized = snapshot.initialized;
  const python = resolveFlowPython(opts.python, opts.pythonResolution);
  const pythonCommand = python ? shellPythonCommand(python) : 'python3';
  const demoGoal = opts.demoGoal?.trim() || 'A working demo that judges can run end-to-end.';
  const timeRemaining = opts.timeRemaining ?? 240;
  const inventoryPath =
    opts.inventoryPath ?? join(tmpdir(), `hackathon-flow-${process.pid}-inventory.json`);
  const enriched = STAGES.map((s) => {
    const done = snapshot.complete[s.produces as FlowStateFile];
    const steps = s.steps.map((step) => ({
      script: skillScript(cwd, s.skill, step.script),
      args: resolveArgs(step.args, {
        repoRoot: cwd,
        demoGoal,
        timeRemaining: String(timeRemaining),
        inventory: inventoryPath,
      }),
    }));
    const commands = steps.map(
      (step) => `${pythonCommand} ${quoteArg(step.script)} ${step.args.map(quoteArg).join(' ')}`,
    );
    return {
      order: s.order,
      skill: s.skill,
      produces: s.produces,
      summary: s.summary,
      done,
      commands,
      steps,
      requires: s.requires,
    };
  });
  const cursor = snapshot.cursor;
  const nextStage = cursor < enriched.length ? enriched[cursor] : null;
  return {
    cwd,
    initialized,
    lifecycle: snapshot.lifecycle,
    nextSkill: snapshot.nextSkill,
    lifecycle_snapshot: lifecycleSummary(snapshot),
    pythonAvailable: python !== null,
    python,
    traceCount: readTraces(cwd).length,
    cursor,
    stages: enriched,
    nextCommand: nextStage?.commands[0] ?? null,
  };
}

interface FlowOptions {
  cwd: string;
  json?: boolean;
  execute?: boolean;
  demoGoal?: string;
  timeRemaining?: number;
}

interface PlanSnapshot {
  demo_goal?: string;
  time_remaining_minutes?: number;
  demo_path?: Array<{
    step?: number;
    action: string;
    expected_outcome?: string;
    feature?: string;
    command?: string;
    timeout_seconds?: number;
  }>;
}

type ResolvedStage = FlowPlan['stages'][number];

function readFlowPlan(cwd: string): PlanSnapshot | null {
  try {
    return readState<PlanSnapshot>({ repoRoot: cwd, file: 'plan.json' });
  } catch {
    return null;
  }
}

function stepDisplay(python: PythonResolution, step: ResolvedStage['steps'][number]): string {
  return `${shellPythonCommand(python)} ${quoteArg(step.script)} ${step.args.map(quoteArg).join(' ')}`;
}

function runPythonCommand(
  python: PythonResolution,
  script: string,
  args: string[],
  cwd: string,
  captureOutput: boolean,
): { status: number | null; stdout: string; error?: Error } {
  const commandArgs = [...python.args, script, ...args];
  if (captureOutput) {
    const result = spawnSync(python.executable, commandArgs, { encoding: 'utf8', cwd });
    return { status: result.status, stdout: result.stdout ?? '', error: result.error };
  }
  const result = spawnSync(python.executable, commandArgs, { stdio: 'inherit', cwd });
  return { status: result.status, stdout: '', error: result.error };
}

function traceStage(
  cwd: string,
  stage: ResolvedStage,
  event: 'start' | 'done' | 'fail',
  detail?: string,
) {
  appendTrace(cwd, {
    type: `flow.stage.${event}`,
    actor: 'cli',
    skill: stage.skill,
    status: event === 'fail' ? 'error' : 'ok',
    summary:
      event === 'start'
        ? `Stage ${stage.order} ${stage.skill} started`
        : event === 'done'
          ? `Stage ${stage.order} ${stage.skill} completed`
          : `Stage ${stage.skill} failed: ${detail ?? 'unknown error'}`,
  });
}

function failStage(stage: ResolvedStage, detail: string, status?: number | null): number {
  log.err(`stage ${stage.skill} failed (${detail})`);
  return status ?? 1;
}

function updateSessionForStage(cwd: string, stage: ResolvedStage) {
  updateSession(cwd, {
    current_stage: stage.skill,
    next_task: `Continue after ${stage.skill}; re-run hackathon resume for the next handoff.`,
    completed: [...(readSession(cwd)?.completed ?? []), `${stage.skill} -> ${stage.produces}`],
  });
}

function executeScopeKnife(
  python: PythonResolution,
  stage: ResolvedStage,
  cwd: string,
  inventoryPath: string,
): number {
  const [scan, classify] = stage.steps;
  if (!scan || !classify) return failStage(stage, 'missing scope-knife steps');

  log.info('$ ' + stepDisplay(python, scan));
  const scanResult = runPythonCommand(python, scan.script, scan.args, cwd, true);
  if (scanResult.status !== 0) {
    return failStage(
      stage,
      scanResult.error?.message ?? `scan_repo.py exited ${scanResult.status}`,
      scanResult.status,
    );
  }
  if (!scanResult.stdout.trim()) return failStage(stage, 'scan_repo.py produced no inventory');
  writeFileSync(inventoryPath, scanResult.stdout);

  log.info('$ ' + stepDisplay(python, classify));
  const classifyResult = runPythonCommand(python, classify.script, classify.args, cwd, false);
  if (classifyResult.status !== 0) {
    return failStage(
      stage,
      classifyResult.error?.message ?? `classify.py exited ${classifyResult.status}`,
      classifyResult.status,
    );
  }
  return 0;
}

function executeFastVerify(python: PythonResolution, stage: ResolvedStage, cwd: string): number {
  const result = executeVerifyRun(cwd, python);
  if (result.total === 0) {
    return failStage(stage, 'plan.demo_path is empty; run scope-knife first');
  }
  if (result.status === 'fail') {
    const first = result.firstFailure;
    if (first) {
      const diagnosis = first.diagnosis as { minimal_fix?: string };
      log.err(`step ${first.step} failed: ${first.error_signature}`);
      if (diagnosis?.minimal_fix) log.dim(`minimal fix: ${diagnosis.minimal_fix}`);
    }
    return failStage(stage, 'fast-verify stopped at the first failing step');
  }
  if (result.status === 'skipped' || result.status === 'partial') {
    log.warn(
      'fast-verify did not fully verify the demo path; skipped steps need commands or an agent',
    );
  }
  return 0;
}

function executePythonStage(python: PythonResolution, stage: ResolvedStage, cwd: string): number {
  for (const step of stage.steps) {
    log.info('$ ' + stepDisplay(python, step));
    const result = runPythonCommand(python, step.script, step.args, cwd, false);
    if (result.status !== 0) {
      return failStage(
        stage,
        result.error?.message ?? `${step.script} exited ${result.status}`,
        result.status,
      );
    }
  }
  return 0;
}

export function flow(opts: FlowOptions): number {
  const cwd = resolve(opts.cwd);
  const pythonResolution = resolvePython();
  const initialized = existsSync(join(cwd, '.hackathon', 'state'));
  const existingPlan = initialized ? readFlowPlan(cwd) : null;
  const demoGoal =
    opts.demoGoal?.trim() ||
    existingPlan?.demo_goal?.trim() ||
    'A working demo that judges can run end-to-end.';
  const timeRemaining = opts.timeRemaining ?? existingPlan?.time_remaining_minutes ?? 240;

  let tempDir: string | undefined;
  if (opts.execute && initialized) {
    tempDir = mkdtempSync(join(tmpdir(), 'hackathon-flow-'));
  }
  const inventoryPath = tempDir
    ? join(tempDir, 'inventory.json')
    : join(tmpdir(), `hackathon-flow-${process.pid}-inventory.json`);

  try {
    const plan = buildPlan({
      cwd,
      demoGoal,
      timeRemaining,
      inventoryPath,
      pythonResolution,
    });
    if (opts.json) {
      console.log(JSON.stringify(plan, null, 2));
      return plan.cursor === plan.stages.length ? 0 : 1;
    }
    console.log(c.bold('\u{1F3AF}  hackathon flow \u2014 ' + plan.cwd));
    console.log(c.dim('state dir: ' + join(plan.cwd, '.hackathon', 'state')));
    console.log(
      c.dim(
        'python: ' +
          (plan.python
            ? `${shellPythonCommand(plan.python)} (${plan.python.version}, ${plan.python.source})`
            : 'NOT FOUND on PATH'),
      ),
    );
    console.log();
    if (!plan.initialized) {
      log.warn('.hackathon/state/ not found in ' + plan.cwd);
      log.dim('Run: hackathon init');
      return 1;
    }
    for (const stage of plan.stages) {
      const mark = stage.done ? c.green('\u2713') : c.gray('\u00b7');
      console.log(
        '  ' +
          mark +
          '  ' +
          c.bold('Stage ' + stage.order + ': ' + stage.skill) +
          c.dim('  \u2192 ' + stage.produces),
      );
      console.log('     ' + c.dim(stage.summary));
      if (!stage.done) {
        for (const command of stage.commands) console.log('     ' + c.cyan('$ ' + command));
      }
    }
    console.log();
    if (plan.lifecycle === 'complete') {
      console.log(c.green('All 5 stages complete. Ready to ship.'));
      return 0;
    }
    const next = plan.stages[plan.cursor];
    console.log(c.bold('Next: ') + c.cyan(next?.skill ?? '?'));
    if (plan.nextCommand) {
      console.log(c.dim('Run: ') + plan.nextCommand);
    }
    if (opts.execute) {
      if (!pythonResolution) {
        log.err('python not available; cannot --execute. Run the commands above manually.');
        return 2;
      }
      log.info('--execute: running each remaining stage in order');
      for (let index = plan.cursor; index < plan.stages.length; index++) {
        const stage = plan.stages[index];
        if (!stage) continue;
        traceStage(cwd, stage, 'start');

        let code: number;
        if (stage.skill === 'scope-knife') {
          code = executeScopeKnife(pythonResolution, stage, cwd, inventoryPath);
        } else if (stage.skill === 'fast-verify') {
          code = executeFastVerify(pythonResolution, stage, cwd);
        } else {
          code = executePythonStage(pythonResolution, stage, cwd);
        }

        if (code !== 0) {
          traceStage(cwd, stage, 'fail', 'stage returned ' + code);
          return code;
        }
        traceStage(cwd, stage, 'done');
        updateSessionForStage(cwd, stage);
      }
      console.log();
      console.log(c.green('All stages executed. Re-run to see updated state.'));
      return 0;
    }
    return plan.cursor === 0 ? 1 : 0;
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}
