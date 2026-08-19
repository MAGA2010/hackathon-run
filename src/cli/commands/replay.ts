/**
 * replay.ts — reconstruct the team's journey from state files.
 *
 * Reads every JSON file under .hackathon/state/ and emits a chronological
 * timeline + summary. Useful for retro, post-mortems, and writing up the
 * project for the blog.
 *
 * Usage:
 *   hackathon replay                  # cwd's .hackathon/state/
 *   hackathon replay --cwd path       # another repo
 *   hackathon replay --json           # machine-readable
 *
 * Each state file's `generated_at` (or `started_at` for verify.json) is
 * the timestamp used for ordering. Files without timestamps are appended
 * in alphabetical order at the end.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename, extname } from 'node:path';

import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

export interface ReplayOptions {
  cwd?: string;
  json?: boolean;
}

interface TimelineEntry {
  at: string;
  file: string;
  stage: string;
  summary: string;
}

type TimedTimelineEntry = TimelineEntry & { delta_min: number };

export interface CollectedTimeline {
  stateDir: string;
  entries: TimedTimelineEntry[];
}

const STAGE_ORDER: Record<string, number> = {
  plan: 1,
  time: 1.5,
  stack: 1.6,
  verify: 2,
  demo: 3,
  review: 4,
  recovery: 5,
  ship: 6,
  retro: 7,
};

function fileStage(name: string): string {
  const stem = basename(name, extname(name));
  return stem;
}

function readTimestamp(file: string, json: any): string {
  return json.generated_at || json.started_at || json.finished_at || new Date(0).toISOString();
}

function summarize(file: string, json: any): string {
  const stem = fileStage(file);
  switch (stem) {
    case 'plan':
      return `plan: ${(json.demo_goal ?? '').slice(0, 60) || '(no goal)'} | ${(json.features ?? []).length} features`;
    case 'verify':
      return `verify: status=${json.status ?? '?'} | ${(json.steps ?? []).length} steps`;
    case 'demo':
      return `demo: ${json.duration_seconds ?? '?'}s | ${(json.steps ?? []).length} steps | "${(json.one_liner ?? '').slice(0, 50)}"`;
    case 'review':
      return `review: overall=${json.overall ?? '?'} | ${(json.dimensions ?? []).length} dimensions`;
    case 'ship':
      return `ship: clean=${json.secret_scan?.clean ?? '?'} | checklist passed=${(json.checklist?.passed ?? []).length}`;
    case 'recovery':
      return `recovery: severity=${json.severity ?? '?'} | failure="${(json.failure ?? '').slice(0, 50)}"`;
    case 'time-box':
      return `time-box: ${json.team_size ?? '?'}-person team | ${json.time_remaining_minutes ?? '?'}min | stage=${json.current_stage ?? '?'}`;
    case 'stack':
      return `stack: ${json.recommendation?.stack ?? '?'} | ${(json.runners_up ?? []).length} runners-up`;
    case 'retro':
      return `retro: scope=${json.ratios?.scope_accuracy ?? '?'} verify=${json.ratios?.verify_pass_rate ?? '?'}`;
    default:
      return stem + ': (parsed)';
  }
}

export function collectTimeline(cwd: string): CollectedTimeline {
  const stateDir = resolve(cwd, '.hackathon/state');
  if (!existsSync(stateDir)) {
    throw new Error(`.hackathon/state/ not found in ${cwd}`);
  }

  const files = readdirSync(stateDir).filter((f) => f.endsWith('.json'));
  const entries: TimelineEntry[] = [];

  for (const f of files) {
    const full = join(stateDir, f);
    let json: any;
    try {
      json = JSON.parse(readFileSync(full, 'utf8'));
    } catch (e) {
      log.warn(`skipped ${f}: ${(e as Error).message}`);
      continue;
    }
    entries.push({
      at: readTimestamp(f, json),
      file: f,
      stage: fileStage(f),
      summary: summarize(f, json),
    });
  }

  // Sort: primary by timestamp, secondary by stage order
  entries.sort((a, b) => {
    const ta = Date.parse(a.at);
    const tb = Date.parse(b.at);
    if (ta !== tb) return ta - tb;
    return (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99);
  });

  // Compute deltas
  let prev: number | null = null;
  const timeline = entries.map((e) => {
    const t = Date.parse(e.at);
    const deltaMin = prev != null ? Math.round((t - prev) / 60000) : 0;
    prev = t;
    return { ...e, delta_min: deltaMin };
  });

  return { stateDir, entries: timeline };
}

export function replay(opts: ReplayOptions): number {
  const cwd = opts.cwd ?? process.cwd();
  let collected: CollectedTimeline;
  try {
    collected = collectTimeline(cwd);
  } catch (e) {
    log.err((e as Error).message);
    log.dim(`run ${c.cyan('hackathon init')} first`);
    return 2;
  }
  const { stateDir, entries: timeline } = collected;

  if (opts.json) {
    const out = {
      state_dir: stateDir,
      duration_min:
        timeline.length >= 2
          ? Math.round(
              (Date.parse(timeline[timeline.length - 1].at) - Date.parse(timeline[0].at)) / 60000,
            )
          : 0,
      entries: timeline,
    };
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }

  console.log(c.bold(`hackathon replay — ${stateDir}`));
  console.log();
  if (timeline.length === 0) {
    log.dim('(no state files yet)');
    return 0;
  }
  const t0 = Date.parse(timeline[0].at);
  for (const e of timeline) {
    const offsetMin = Math.round((Date.parse(e.at) - t0) / 60000);
    const arrow = e.delta_min > 0 ? `(+ ${e.delta_min} min)` : '';
    console.log(`  T+ ${String(offsetMin).padStart(4)}m  ${c.cyan(e.file.padEnd(20))} ${arrow}`);
    console.log(`         ${e.summary}`);
  }
  console.log();
  console.log(
    `  ${c.bold(timeline.length + ' events')}, total span ${timeline[timeline.length - 1].delta_min != null ? 'see T+ above' : ''}`,
  );
  return 0;
}
