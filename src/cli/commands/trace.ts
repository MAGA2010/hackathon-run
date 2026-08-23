/**
 * trace.ts — inspect the append-only harness event log.
 */

import { resolve } from 'node:path';

import { readTraces, traceFile } from '../../harness/trace.js';
import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

export interface TraceOptions {
  cwd?: string;
  json?: boolean;
  last?: number;
}

export function trace(opts: TraceOptions): number {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const events = readTraces(cwd);
  const selected = opts.last ? events.slice(-opts.last) : events;
  const target = traceFile(cwd);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          trace_file: target,
          total: events.length,
          events: selected,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(c.bold('hackathon trace \u2014 ' + target));
  console.log();
  if (selected.length === 0) {
    log.dim('(no events yet)');
    return 0;
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
  return 0;
}
