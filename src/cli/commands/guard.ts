/**
 * guard.ts — operator controls for a running harness.
 *
 *   hackathon guard stop    write .hackathon/AGENT_STOP and halt resumes
 *   hackathon guard clear   remove the stop and any pending steer
 *   hackathon guard steer   drop a one-shot redirect for the next resume
 *   hackathon guard status  inspect both operator-control files
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  clearStop,
  guardStatus,
  readSteer,
  stopMessage,
  stopPath,
  steerPath,
  writeSteer,
  writeStop,
} from '../../harness/guard.js';
import { appendTrace } from '../../harness/trace.js';
import { commandFail, commandOk, type CommandResult } from '../lib/command-result.js';
import { log } from '../lib/logger.js';
import { c } from '../lib/colors.js';

export interface GuardOptions {
  subcommand: 'stop' | 'clear' | 'steer' | 'status';
  cwd: string;
  reason?: string;
  message?: string;
  json?: boolean;
}

export interface GuardPayload {
  ok: boolean;
  action: GuardOptions['subcommand'];
  path?: string;
  stopped?: boolean;
  stop_message?: string | null;
  steer_present?: boolean;
  error?: string;
}

export function guardResult(opts: GuardOptions): CommandResult<GuardPayload> {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  if (!existsSync(stateDir)) {
    return commandFail({
      ok: false,
      action: opts.subcommand,
      error: '.hackathon/state/ not found in ' + cwd,
    });
  }

  if (opts.subcommand === 'stop') {
    const target = writeStop(cwd, opts.reason ?? 'Operator requested stop.');
    appendTrace(cwd, {
      type: 'guard.stop',
      actor: 'operator',
      skill: 'guard',
      status: 'warn',
      summary: opts.reason ?? 'Operator requested stop.',
    });
    return commandOk({ ok: true, action: 'stop', path: target });
  }

  if (opts.subcommand === 'clear') {
    readSteer(cwd, true);
    clearStop(cwd);
    appendTrace(cwd, {
      type: 'guard.clear',
      actor: 'operator',
      skill: 'guard',
      status: 'ok',
      summary: 'Operator controls cleared',
    });
    return commandOk({ ok: true, action: 'clear' });
  }

  if (opts.subcommand === 'steer') {
    const message = (opts.message ?? '').trim();
    if (!message) {
      return commandFail({ ok: false, action: 'steer', error: 'steer requires a message' });
    }
    const target = writeSteer(cwd, message);
    appendTrace(cwd, {
      type: 'guard.steer',
      actor: 'operator',
      skill: 'guard',
      status: 'ok',
      summary: message,
    });
    return commandOk({ ok: true, action: 'steer', path: target });
  }

  const status = guardStatus(cwd);
  return commandOk({ ok: true, action: 'status', ...status });
}

export function guard(opts: GuardOptions): number {
  const result = guardResult(opts);
  const payload = result.data;
  if (!payload.ok) {
    log.err(payload.error ?? 'guard command failed');
    if (payload.error?.includes('.hackathon/state/')) log.dim('Run: hackathon init');
    return result.exitCode;
  }
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return result.exitCode;
  }
  const cwd = resolve(opts.cwd);
  if (payload.action === 'stop') {
    log.warn(`stop requested; wrote ${payload.path}`);
    return result.exitCode;
  }
  if (payload.action === 'clear') {
    log.ok('AGENT_STOP and STEER.md cleared');
    return result.exitCode;
  }
  if (payload.action === 'steer') {
    log.ok(`steer written to ${payload.path}`);
    return result.exitCode;
  }
  console.log(c.bold('hackathon guard status \u2014 ' + cwd));
  console.log('  stopped:  ' + payload.stopped);
  if (payload.stopped) console.log('  message:  ' + (payload.stop_message ?? ''));
  console.log('  stop:     ' + stopPath(cwd));
  console.log(
    '  steer:    ' + steerPath(cwd) + ' (' + (payload.steer_present ? 'pending' : 'empty') + ')',
  );
  return result.exitCode;
}
