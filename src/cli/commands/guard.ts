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
import { log } from '../lib/logger.js';
import { c } from '../lib/colors.js';

export interface GuardOptions {
  subcommand: 'stop' | 'clear' | 'steer' | 'status';
  cwd: string;
  reason?: string;
  message?: string;
  json?: boolean;
}

export function guard(opts: GuardOptions): number {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, '.hackathon', 'state');
  if (!existsSync(stateDir)) {
    log.err('.hackathon/state/ not found in ' + cwd);
    log.dim('Run: hackathon init');
    return 1;
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
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, action: 'stop', path: target }, null, 2));
    } else {
      log.warn(`stop requested; wrote ${target}`);
    }
    return 0;
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
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, action: 'clear' }, null, 2));
    } else {
      log.ok('AGENT_STOP and STEER.md cleared');
    }
    return 0;
  }

  if (opts.subcommand === 'steer') {
    const message = (opts.message ?? '').trim();
    if (!message) {
      log.err('steer requires a message');
      return 1;
    }
    const target = writeSteer(cwd, message);
    appendTrace(cwd, {
      type: 'guard.steer',
      actor: 'operator',
      skill: 'guard',
      status: 'ok',
      summary: message,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, action: 'steer', path: target }, null, 2));
    } else {
      log.ok(`steer written to ${target}`);
    }
    return 0;
  }

  const status = guardStatus(cwd);
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, ...status }, null, 2));
  } else {
    console.log(c.bold('hackathon guard status \u2014 ' + cwd));
    console.log('  stopped:  ' + status.stopped);
    if (status.stopped) console.log('  message:  ' + (status.stop_message ?? ''));
    console.log('  stop:     ' + stopPath(cwd));
    console.log(
      '  steer:    ' + steerPath(cwd) + ' (' + (status.steer_present ? 'pending' : 'empty') + ')',
    );
  }
  return 0;
}
