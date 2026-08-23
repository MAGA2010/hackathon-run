/**
 * trace.ts — append-only event log for the harness.
 *
 * Every meaningful action (skill invocation, stage completion, sprint
 * verdict) is appended as a JSON line under .hackathon/traces/events.jsonl.
 * The log is deliberately append-only so replay and retro can reconstruct
 * what actually happened rather than relying on final state snapshots.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface TraceEvent {
  at: string;
  type: string;
  actor?: string;
  skill?: string;
  status: 'ok' | 'warn' | 'error' | 'skip';
  summary: string;
  data?: Record<string, unknown>;
}

export const TRACE_FILE = 'events.jsonl';

export function traceDir(cwd: string): string {
  return resolve(cwd, '.hackathon', 'traces');
}

export function traceFile(cwd: string): string {
  return join(traceDir(cwd), TRACE_FILE);
}

export function traceEnabled(cwd: string): boolean {
  if (process.env.HACKATHON_TRACE === '0') return false;
  return existsSync(resolve(cwd, '.hackathon'));
}

export function appendTrace(cwd: string, event: Omit<TraceEvent, 'at'>): string | null {
  if (!traceEnabled(cwd)) return null;
  const dir = traceDir(cwd);
  mkdirSync(dir, { recursive: true });
  const full: TraceEvent = { ...event, at: new Date().toISOString() };
  const target = join(dir, TRACE_FILE);
  appendFileSync(target, JSON.stringify(full) + '\n', 'utf8');
  return target;
}

export function readTraces(cwd: string): TraceEvent[] {
  const target = traceFile(cwd);
  let raw: string;
  try {
    raw = readFileSync(target, 'utf8');
  } catch {
    return [];
  }
  const events: TraceEvent[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as TraceEvent);
    } catch {
      // Preserve malformed lines as opaque data rather than crashing replay.
      events.push({
        at: new Date(0).toISOString(),
        type: 'trace.unknown',
        status: 'warn',
        summary: 'malformed trace line',
        data: { raw: trimmed },
      });
    }
  }
  return events;
}

export function traceStats(cwd: string): {
  count: number;
  byType: Record<string, number>;
  lastEvent: TraceEvent | null;
} {
  const events = readTraces(cwd);
  const byType: Record<string, number> = {};
  for (const e of events) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }
  return {
    count: events.length,
    byType,
    lastEvent: events.length > 0 ? events[events.length - 1] : null,
  };
}

export function clearTraces(cwd: string): void {
  const dir = traceDir(cwd);
  mkdirSync(dir, { recursive: true });
  const target = traceFile(cwd);
  appendFileSync(target, '', 'utf8');
}
