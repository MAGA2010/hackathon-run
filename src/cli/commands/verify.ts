/**
 * verify.ts - `hackathon verify run` command.
 *
 * Thin CLI wrapper around the shared deterministic executor in
 * harness/verify-run.ts. Prints a human-readable summary by default or a
 * machine-readable JSON payload with --json.
 */

import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';
import { verifyRunResult } from '../../harness/verify-run.js';

export interface VerifyCommandOptions {
  cwd?: string;
  json?: boolean;
}

export function verifyRun(opts: VerifyCommandOptions): number {
  const { code, message, result } = verifyRunResult({ cwd: opts.cwd ?? process.cwd() });
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          code,
          status: result.status,
          total: result.total,
          passed: result.passed,
          skipped: result.skipped,
          first_failure: result.firstFailure ?? null,
          verify_file: result.verifyFile,
          message,
        },
        null,
        2,
      ),
    );
    return code;
  }
  if (code === 2) {
    log.err(message);
    return code;
  }
  if (result.total === 0) {
    log.err(message);
    log.dim('Run: hackathon run scope-knife --demo-goal "..." --apply');
    return code;
  }
  const mark =
    result.status === 'pass'
      ? c.green('pass')
      : result.status === 'fail'
        ? c.red('fail')
        : c.yellow(result.status);
  console.log(`${c.bold('\u{1F50E} verify run')} — ${mark}`);
  console.log(c.dim(`${result.passed}/${result.total} steps passed, ${result.skipped} skipped`));
  if (result.firstFailure) {
    console.log(c.red(`step ${result.firstFailure.step}: `) + result.firstFailure.error_signature);
    const fix = (result.firstFailure.diagnosis as { minimal_fix?: string }).minimal_fix;
    if (fix) console.log(c.dim('minimal fix: ' + fix));
  }
  console.log(c.dim('wrote ' + result.verifyFile));
  return code;
}
