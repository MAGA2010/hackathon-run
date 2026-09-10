/**
 * trace.ts — inspect the append-only harness event log.
 */

import { resolve } from 'node:path';

import { readTraces, traceFile, verifyTraceChain } from '../../harness/trace.js';
import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

export interface TraceOptions {
  cwd?: string;
  json?: boolean;
  last?: number;
  verify?: boolean;
}

export function trace(opts: TraceOptions): number {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const events = readTraces(cwd);
  const selected = opts.last ? events.slice(-opts.last) : events;
  const target = traceFile(cwd);
  const verification = opts.verify ? verifyTraceChain(cwd) : null;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          trace_file: target,
          total: events.length,
          ...(verification ? { verification } : {}),
          events: selected,
        },
        null,
        2,
      ),
    );
    return verification && !verification.ok ? 1 : 0;
  }

  console.log(c.bold('hackathon trace \u2014 ' + target));
  if (verification) {
    const status = verification.ok ? c.green('valid') : c.red('BROKEN');
    console.log(
      c.dim(`chain: ${status}  events=${verification.events} legacy=${verification.legacy_events}`),
    );
    if (!verification.ok) {
      console.log(c.red(`first broken event: ${verification.broken_at ?? 'unknown'}`));
      for (const error of verification.errors.slice(0, 5)) {
        console.log(c.red('  ' + error));
      }
    }
  }
  console.log();
  if (selected.length === 0) {
    log.dim('(no events yet)');
    return verification && !verification.ok ? 1 : 0;
  }
  for (const [i, e] of selected.entries()) {
    const color = e.status === 'error' ? c.red : e.status === 'warn' ? c.yellow : c.green;
    const marker = color(e.status.padEnd(5));
    const time = new Date(e.at).toISOString().replace('T', ' ').slice(0, 19);
    console.log(
      `  ${String(i + 1).padStart(4)}  ${c.dim(time)}  ${marker}  ${e.type.padEnd(22)}  ${e.summary}`,
    );
  }
  console.log();
  console.log(c.dim(`${selected.length}/${events.length} events shown`));
  return verification && !verification.ok ? 1 : 0;
}
