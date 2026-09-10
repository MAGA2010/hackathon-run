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

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { findSkillDirs } from '../../harness/loader.js';
import { readState, writeState } from '../../harness/state.js';
import { appendTrace, readTraces } from '../../harness/trace.js';
import { readSession, updateSession } from '../../harness/session.js';
import { syncVerificationToPlan } from '../../harness/verification.js';
import { computeWorkspaceDigest } from '../../harness/workspace.js';
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
  pythonAvailable: boolean;
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

function resolveArgs(args: string[], values: Record<string, string>): string[] {
  return args.map((arg) =>
    arg.replace(/\{(repoRoot|demoGoal|timeRemaining|inventory)\}/g, (match, key: string) => {
      return values[key] ?? match;
    }),
  );
}

export function buildPlan(opts: {
  cwd: string;
  demoGoal?: string;
  timeRemaining?: number;
  inventoryPath?: string;
  python?: string | null;
}): FlowPlan {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  const initialized = existsSync(stateDir);
  const python = opts.python ?? findPython();
  const demoGoal = opts.demoGoal?.trim() || 'A working demo that judges can run end-to-end.';
  const timeRemaining = opts.timeRemaining ?? 240;
  const inventoryPath =
    opts.inventoryPath ?? join(tmpdir(), `hackathon-flow-${process.pid}-inventory.json`);
  const enriched = STAGES.map((s) => {
    const done = existsSync(join(stateDir, s.produces));
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

function stepDisplay(python: string, step: ResolvedStage['steps'][number]): string {
  return `${python} ${quoteArg(step.script)} ${step.args.map(quoteArg).join(' ')}`;
}

function runPythonCommand(
  python: string,
  script: string,
  args: string[],
  cwd: string,
  captureOutput: boolean,
): { status: number | null; stdout: string; error?: Error } {
  if (captureOutput) {
    const result = spawnSync(python, [script, ...args], { encoding: 'utf8', cwd });
    return { status: result.status, stdout: result.stdout ?? '', error: result.error };
  }
  const result = spawnSync(python, [script, ...args], { stdio: 'inherit', cwd });
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
  python: string,
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

function executeFastVerify(python: string, stage: ResolvedStage, cwd: string): number {
  const plan = readFlowPlan(cwd);
  const startedAt = new Date().toISOString();
  const workspaceDigest = computeWorkspaceDigest(cwd);
  const demoSteps = plan?.demo_path ?? [];
  if (demoSteps.length === 0) {
    return failStage(stage, 'plan.demo_path is empty; run scope-knife first');
  }

  const steps: Array<Record<string, unknown>> = [];
  let overall: 'pass' | 'fail' | 'partial' | 'skipped' = 'pass';
  let skipped = 0;

  for (let index = 0; index < demoSteps.length; index++) {
    const item = demoSteps[index];
    if (!item) continue;
    const step = item.step ?? index + 1;

    if (!item.command?.trim()) {
      skipped++;
      if (overall === 'pass') overall = 'partial';
      steps.push({
        step,
        action: item.action,
        expected_outcome: item.expected_outcome ?? '',
        status: 'skip',
        actual_outcome: 'No command supplied for this demo step.',
        duration_seconds: 0,
      });
      continue;
    }

    const verifyScript = skillScript(cwd, 'fast-verify', 'verify_step.py');
    const args = [
      '--command',
      item.command,
      '--expected-outcome',
      item.expected_outcome ?? '',
      '--timeout',
      String(item.timeout_seconds ?? 30),
    ];
    log.info('$ ' + stepDisplay(python, { script: verifyScript, args }));
    const result = runPythonCommand(python, verifyScript, args, cwd, true);

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    } catch {
      parsed = null;
    }

    const passed = result.status === 0 && parsed?.status === 'pass';
    steps.push({
      step,
      action: item.action,
      expected_outcome: item.expected_outcome ?? '',
      command: item.command,
      status: passed ? 'pass' : 'fail',
      actual_outcome: parsed?.actual_outcome ?? 'Verification command produced no JSON result.',
      duration_seconds: parsed?.duration_seconds ?? 0,
      ...(parsed?.exit_code != null ? { exit_code: parsed.exit_code } : {}),
      ...(parsed?.stdout_sha256 ? { stdout_sha256: parsed.stdout_sha256 } : {}),
      ...(parsed?.stderr_sha256 ? { stderr_sha256: parsed.stderr_sha256 } : {}),
      ...(parsed?.cwd ? { cwd: parsed.cwd } : {}),
      ...(parsed?.started_at ? { started_at: parsed.started_at } : {}),
      ...(parsed?.finished_at ? { finished_at: parsed.finished_at } : {}),
      ...(parsed?.error_signature ? { error_signature: parsed.error_signature } : {}),
    });

    if (!passed) {
      overall = 'fail';
      const signature = String(
        parsed?.error_signature ?? (result.stdout.trim() || 'verification failed'),
      );
      let diagnosis: Record<string, unknown> = {
        likely_cause: 'Verification command failed or expected output was missing.',
        minimal_fix: 'Inspect the command output and fix the first failing demo step.',
        re_verify_command: item.command,
      };
      const diagnoseScript = skillScript(cwd, 'fast-verify', 'diagnose.py');
      const diagnosisResult = runPythonCommand(
        python,
        diagnoseScript,
        ['--signature', signature],
        cwd,
        true,
      );
      try {
        diagnosis = JSON.parse(diagnosisResult.stdout.trim()) as Record<string, unknown>;
      } catch {
        // Keep the generic diagnosis when the helper cannot produce JSON.
      }
      steps[steps.length - 1] = { ...steps[steps.length - 1], diagnosis };
      break;
    }
  }

  if (overall === 'pass' && skipped === demoSteps.length) overall = 'skipped';

  writeState({
    repoRoot: cwd,
    file: 'verify.json',
    data: {
      version: '1.0',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      workspace_digest: workspaceDigest,
      status: overall,
      steps,
    },
  });
  const sync = syncVerificationToPlan(cwd);
  if (sync.updates.length > 0) {
    const passed = sync.updates.filter((update) => update.passes).length;
    log.info(
      `synced fast-verify to plan.json: ${passed}/${sync.updates.length} feature(s) passing`,
    );
  }

  const artifactDir = join(cwd, '.hackathon', 'artifacts');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, 'fast-verify-output.md'),
    [
      '# Fast Verify Output',
      '',
      `_Generated: ${startedAt}_`,
      '',
      overall === 'pass'
        ? 'Every demo step passed and its expected outcome was observed.'
        : overall === 'fail'
          ? 'Verification stopped at the first failing step; see verify.json for the diagnosis.'
          : 'Some demo steps have no executable command and were recorded as skip.',
      '',
    ].join('\n'),
  );
  if (overall === 'fail') return 1;
  if (overall === 'skipped' || overall === 'partial') {
    log.warn(
      'fast-verify did not fully verify the demo path; skipped steps need commands or an agent',
    );
  }
  return 0;
}

function executePythonStage(python: string, stage: ResolvedStage, cwd: string): number {
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
  const stateDir = join(cwd, '.hackathon', 'state');
  const initialized = existsSync(stateDir);
  const python = findPython();
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
      python,
    });
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
    if (plan.cursor === plan.stages.length) {
      const verification = readState<{ status?: string }>({ repoRoot: cwd, file: 'verify.json' });
      if (verification?.status !== 'pass') {
        console.log(c.yellow('All state files exist, but the demo is not verified.'));
        console.log(
          c.dim(
            'Add executable commands to plan.demo_path and re-run fast-verify before shipping.',
          ),
        );
        return 1;
      }
      console.log(c.green('All 5 stages complete. Ready to ship.'));
      return 0;
    }
    const next = plan.stages[plan.cursor];
    console.log(c.bold('Next: ') + c.cyan(next?.skill ?? '?'));
    if (plan.nextCommand) {
      console.log(c.dim('Run: ') + plan.nextCommand);
    }
    if (opts.execute) {
      if (!python) {
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
          code = executeScopeKnife(python, stage, cwd, inventoryPath);
        } else if (stage.skill === 'fast-verify') {
          code = executeFastVerify(python, stage, cwd);
        } else {
          code = executePythonStage(python, stage, cwd);
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
