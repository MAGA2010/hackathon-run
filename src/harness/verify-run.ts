/**
 * verify-run.ts - deterministic fast-verify executor shared by the CLI
 * `verify run` command and the flow pipeline's fast-verify stage.
 *
 * Reads `plan.demo_path`, executes each step's verification command through
 * `verify_step.py`, stops at the first failure (hard rule from the skill),
 * writes a schema-valid `verify.json` with the workspace digest, and syncs
 * the evidence into `plan.features[].passes` via `syncVerificationToPlan`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';

import { findSkillDirs } from './loader.js';
import { readState, writeState } from './state.js';
import { syncVerificationToPlan } from './verification.js';
import { appendTrace } from './trace.js';
import { computeWorkspaceDigest } from './workspace.js';
import { resolvePython, type PythonResolution } from './python.js';

interface DemoPathStep {
  step?: number;
  action?: string;
  expected_outcome?: string;
  command?: string;
  timeout_seconds?: number;
}

interface PlanSnapshot {
  demo_path?: DemoPathStep[];
}

function skillScript(cwd: string, skill: string, script: string): string {
  const dir = findSkillDirs(cwd).find((d) => basename(d) === skill);
  if (dir) return join(dir, 'scripts', script);
  return join(cwd, 'skills', skill, 'scripts', script);
}

function shellPythonCommand(python: PythonResolution): string {
  return [python.executable, ...python.args].join(' ');
}

export interface VerifyRunOptions {
  cwd: string;
  /** Stop verifying after this many elapsed seconds (skill default 600). */
  timeBudgetSeconds?: number;
}

export interface VerifyRunResult {
  /** Process exit code: 0 pass/partial, 1 fail or unusable state. */
  code: number;
  status: 'pass' | 'fail' | 'partial' | 'skipped';
  total: number;
  passed: number;
  skipped: number;
  firstFailure?: { step: number; error_signature: string; diagnosis: Record<string, unknown> };
  verifyFile: string;
}

function runPythonCapture(
  python: PythonResolution,
  script: string,
  args: string[],
  cwd: string,
): { status: number | null; stdout: string; error?: Error } {
  const result = spawnSync(python.executable, [...python.args, script, ...args], {
    encoding: 'utf8',
    cwd,
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout ?? '', error: result.error };
}

/**
 * Execute the demo path end-to-end and persist the verification evidence.
 * Exported so `flow --execute` and `verify run` share one implementation.
 */
export function executeVerifyRun(cwd: string, python: PythonResolution): VerifyRunResult {
  const root = resolve(cwd);
  const startedAt = new Date().toISOString();
  let plan: PlanSnapshot | null;
  let planError: string | undefined;
  try {
    plan = readState<PlanSnapshot>({ repoRoot: root, file: 'plan.json' });
  } catch (error) {
    // A corrupt or schema-mismatched plan is a usage error, not a crash:
    // surface it through the normal result channel instead of a stack trace.
    planError = `plan.json is unreadable: ${(error as Error).message.split('\n')[0]}`;
    plan = null;
  }
  const workspaceDigest = plan ? computeWorkspaceDigest(root) : null;
  const demoSteps = plan?.demo_path ?? [];
  if (demoSteps.length === 0) {
    return {
      code: planError ? 2 : 1,
      status: 'skipped',
      total: 0,
      passed: 0,
      skipped: 0,
      firstFailure: planError ? { step: 0, error_signature: planError, diagnosis: {} } : undefined,
      verifyFile: join(root, '.hackathon', 'state', 'verify.json'),
    };
  }

  const steps: Array<Record<string, unknown>> = [];
  let overall: 'pass' | 'fail' | 'partial' | 'skipped' = 'pass';
  let skipped = 0;
  let firstFailure: VerifyRunResult['firstFailure'];

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

    const verifyScript = skillScript(root, 'fast-verify', 'verify_step.py');
    const args = [
      '--command',
      item.command,
      '--expected-outcome',
      item.expected_outcome ?? '',
      '--timeout',
      String(item.timeout_seconds ?? 30),
    ];
    const result = runPythonCapture(python, verifyScript, args, root);

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
      const diagnoseResult = runPythonCapture(
        python,
        skillScript(root, 'fast-verify', 'diagnose.py'),
        ['--signature', signature],
        root,
      );
      try {
        diagnosis = JSON.parse(diagnoseResult.stdout.trim()) as Record<string, unknown>;
      } catch {
        // Keep the generic diagnosis when the helper cannot produce JSON.
      }
      steps[steps.length - 1] = { ...steps[steps.length - 1], diagnosis };
      firstFailure = {
        step,
        error_signature: signature,
        diagnosis,
      };
      break;
    }
  }

  if (overall === 'pass' && skipped === demoSteps.length) overall = 'skipped';

  const verifyFile = join(root, '.hackathon', 'state', 'verify.json');
  writeState({
    repoRoot: root,
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
  syncVerificationToPlan(root);
  appendTrace(root, {
    type: 'skill.invoke',
    actor: 'cli',
    skill: 'fast-verify',
    status: overall === 'pass' ? 'ok' : overall === 'fail' ? 'error' : 'warn',
    summary: `verify run: ${overall} (${steps.length - skipped}/${demoSteps.length} executed, ${skipped} skipped)`,
  });

  const artifactDir = join(root, '.hackathon', 'artifacts');
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

  return {
    code: overall === 'fail' ? 1 : 0,
    status: overall,
    total: demoSteps.length,
    passed: steps.filter((step) => step.status === 'pass').length,
    skipped,
    firstFailure,
    verifyFile,
  };
}

export interface VerifyRunCliResult {
  code: number;
  message: string;
  result: VerifyRunResult;
}

/** Entry point for `hackathon verify run`. */
export function verifyRunResult(opts: VerifyRunOptions): VerifyRunCliResult {
  const root = resolve(opts.cwd);
  const python = resolvePython();
  if (!python) {
    return {
      code: 2,
      message: 'python not available; install Python 3 or set PYTHON',
      result: {
        code: 2,
        status: 'skipped',
        total: 0,
        passed: 0,
        skipped: 0,
        verifyFile: join(root, '.hackathon', 'state', 'verify.json'),
      },
    };
  }
  const result = executeVerifyRun(root, python);
  const message =
    result.total === 0
      ? (result.firstFailure?.error_signature ?? 'plan.demo_path is empty; run scope-knife first')
      : `verify ${result.status}: ${result.passed}/${result.total} steps passed, ${result.skipped} skipped`;
  return { code: result.code, message, result };
}
