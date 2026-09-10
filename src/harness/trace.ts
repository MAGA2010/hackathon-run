/**
 * trace.ts - tamper-evident append-only event log for the harness.
 *
 * Every meaningful action is appended as one JSON line under
 * `.hackathon/traces/events.jsonl`. New events carry a sequence number and
 * SHA-256 hash chain, so `hackathon trace --verify` can detect edits,
 * deletions, and reordering.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { withFileLockSync } from './atomic.js';

export const TRACE_FILE = 'events.jsonl';
export const TRACE_SCHEMA_VERSION = '1.0';
export const TRACE_GENESIS_HASH = '0'.repeat(64);

export interface TraceEvent {
  schema_version?: string;
  event_id?: string;
  seq?: number;
  prev_hash?: string;
  hash?: string;
  at: string;
  type: string;
  actor?: string;
  skill?: string;
  status: 'ok' | 'warn' | 'error' | 'skip';
  summary: string;
  run_id?: string;
  span_id?: string;
  duration_ms?: number;
  data?: Record<string, unknown>;
}

export type TraceEventInput = Omit<
  TraceEvent,
  'schema_version' | 'event_id' | 'seq' | 'prev_hash' | 'hash' | 'at'
>;

export interface TraceChainVerification {
  ok: boolean;
  events: number;
  legacy_events: number;
  broken_at: number | null;
  errors: string[];
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function eventWithoutHash(event: TraceEvent): Omit<TraceEvent, 'hash'> {
  const { hash: _hash, ...core } = event;
  return core;
}

export function traceEventHash(event: TraceEvent): string {
  return createHash('sha256')
    .update(canonicalJson(eventWithoutHash(event)))
    .digest('hex');
}

function parseTraceLines(raw: string): { events: TraceEvent[]; malformed: number[] } {
  const events: TraceEvent[] = [];
  const malformed: number[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as TraceEvent;
      if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
        malformed.push(index + 1);
      } else {
        events.push(event);
      }
    } catch {
      malformed.push(index + 1);
    }
  }
  return { events, malformed };
}

function normalizeLegacyChain(events: TraceEvent[]): TraceEvent[] {
  let previousHash = TRACE_GENESIS_HASH;
  return events.map((event, index) => {
    const seq = event.seq ?? index + 1;
    const prevHash = event.prev_hash ?? previousHash;
    const normalized: TraceEvent = {
      ...event,
      schema_version: event.schema_version ?? TRACE_SCHEMA_VERSION,
      event_id: event.event_id ?? `legacy-${String(seq).padStart(8, '0')}`,
      seq,
      prev_hash: prevHash,
    };
    normalized.hash = event.hash ?? traceEventHash(normalized);
    previousHash = normalized.hash;
    return normalized;
  });
}

function isLegacyTraceEvent(event: TraceEvent): boolean {
  return (
    event.schema_version == null &&
    event.event_id == null &&
    event.seq == null &&
    event.prev_hash == null &&
    event.hash == null
  );
}

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

export function appendTrace(cwd: string, event: TraceEventInput): string | null {
  if (!traceEnabled(cwd)) return null;
  const dir = traceDir(cwd);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, TRACE_FILE);

  withFileLockSync(target, () => {
    let existing: TraceEvent[] = [];
    if (existsSync(target)) {
      existing = normalizeLegacyChain(parseTraceLines(readFileSync(target, 'utf8')).events);
    }
    const previous = existing.at(-1);
    const full: TraceEvent = {
      schema_version: TRACE_SCHEMA_VERSION,
      event_id: randomUUID(),
      seq: (previous?.seq ?? 0) + 1,
      prev_hash: previous?.hash ?? TRACE_GENESIS_HASH,
      ...event,
      at: new Date().toISOString(),
    };
    full.hash = traceEventHash(full);

    const fd = openSync(target, 'a');
    try {
      writeSync(fd, JSON.stringify(full) + '\n', null, 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  });
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
  const { events } = parseTraceLines(raw);
  return normalizeLegacyChain(events);
}

export function verifyTraceChain(cwd: string): TraceChainVerification {
  const target = traceFile(cwd);
  let raw = '';
  try {
    raw = readFileSync(target, 'utf8');
  } catch {
    return {
      ok: true,
      events: 0,
      legacy_events: 0,
      broken_at: null,
      errors: [],
    };
  }

  const { events, malformed } = parseTraceLines(raw);
  const normalizedEvents = normalizeLegacyChain(events);
  const errors = malformed.map((line) => `line ${line}: malformed JSON event`);
  let previousHash = TRACE_GENESIS_HASH;
  let legacyEvents = 0;
  let brokenAt: number | null = malformed[0] ?? null;

  for (const [index, event] of events.entries()) {
    const expectedSeq = index + 1;
    const normalized = normalizedEvents[index]!;
    if (isLegacyTraceEvent(event)) {
      // Legacy events predate the hash chain. Backfill them deterministically
      // so the next signed event still detects edits to any legacy prefix.
      legacyEvents += 1;
      previousHash = normalized.hash!;
      continue;
    }

    const eventErrors: string[] = [];
    if (event.seq !== expectedSeq) {
      eventErrors.push(`seq expected ${expectedSeq}, got ${String(event.seq)}`);
    }
    if (event.prev_hash !== previousHash) {
      eventErrors.push(
        `prev_hash mismatch: expected ${previousHash}, got ${String(event.prev_hash)}`,
      );
    }
    if (!event.hash) {
      eventErrors.push('missing hash');
    } else if (traceEventHash(event) !== event.hash) {
      eventErrors.push('hash mismatch');
    }
    if (eventErrors.length > 0) {
      brokenAt ??= index + 1;
      errors.push(`event ${index + 1}: ${eventErrors.join('; ')}`);
    }
    previousHash = event.hash ?? traceEventHash(event);
  }

  return {
    ok: errors.length === 0,
    events: events.length,
    legacy_events: legacyEvents,
    broken_at: brokenAt,
    errors,
  };
}

export function traceStats(cwd: string): {
  count: number;
  byType: Record<string, number>;
  lastEvent: TraceEvent | null;
} {
  const events = readTraces(cwd);
  const byType: Record<string, number> = {};
  for (const event of events) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
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
  withFileLockSync(target, () => {
    const fd = openSync(target, 'w');
    closeSync(fd);
  });
}
