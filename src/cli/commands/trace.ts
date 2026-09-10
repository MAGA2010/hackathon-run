/**
 * trace.ts — inspect the append-only harness event log.
 */

import { resolve } from 'node:path';

import { readTraces, traceFile, verifyTraceChain } from '../../harness/trace.js';
import { c } from '../lib/colors.js';
import { commandOk, type CommandResult } from '../lib/command-result.js';
import { log } from '../lib/logger.js';

export interface TraceOptions {
  cwd?: string;
  json?: boolean;
  last?: number;
  verify?: boolean;
}

export interface TracePayload {
  trace_file: string;
  total: number;
  verification?: ReturnType<typeof verifyTraceChain>;
  events: ReturnType<typeof readTraces>;
}

export function traceResult(opts: TraceOptions): CommandResult<TracePayload> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const events = readTraces(cwd);
  const selected = opts.last ? events.slice(-opts.last) : events;
  const target = traceFile(cwd);
  const verification = opts.verify ? verifyTraceChain(cwd) : null;

  const payload: TracePayload = {
    trace_file: target,
    total: events.length,
    ...(verification ? { verification } : {}),
    events: selected,
  };
  return {
    exitCode: verification && !verification.ok ? 1 : 0,
    data: payload,
  };
}

export function trace(opts: TraceOptions): number {
  const result = traceResult(opts);
  const payload = result.data;
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return result.exitCode;
  }

  console.log(c.bold('hackathon trace \u2014 ' + payload.trace_file));
  if (payload.verification) {
    const status = payload.verification.ok ? c.green('valid') : c.red('BROKEN');
    console.log(
      c.dim(
        `chain: ${status}  events=${payload.verification.events} legacy=${payload.verification.legacy_events}`,
      ),
    );
    if (!payload.verification.ok) {
      console.log(c.red(`first broken event: ${payload.verification.broken_at ?? 'unknown'}`));
      for (const error of payload.verification.errors.slice(0, 5)) {
        console.log(c.red('  ' + error));
      }
    }
  }
  console.log();
  if (payload.events.length === 0) {
    log.dim('(no events yet)');
    return result.exitCode;
  }
  for (const [i, e] of payload.events.entries()) {
    const color = e.status === 'error' ? c.red : e.status === 'warn' ? c.yellow : c.green;
    const marker = color(e.status.padEnd(5));
    const time = new Date(e.at).toISOString().replace('T', ' ').slice(0, 19);
    console.log(
      `  ${String(i + 1).padStart(4)}  ${c.dim(time)}  ${marker}  ${e.type.padEnd(22)}  ${e.summary}`,
    );
  }
  console.log();
  console.log(c.dim(`${payload.events.length}/${payload.total} events shown`));
  return result.exitCode;
}
