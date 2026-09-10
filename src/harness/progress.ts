/**
 * progress.ts — agent-maintained handoff log.
 *
 * The paper's second core primitive is an agent-maintained progress file.
 * Every session reads it first and appends one checkpoint before finishing,
 * so a fresh context window can get up to speed from PROGRESS.md + git log
 * instead of guessing what the previous agent did.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { Session } from './session.js';

export const PROGRESS_FILE = 'PROGRESS.md';
export const SESSION_BRIEF_FILE = 'SESSION.md';
export const SESSION_BRIEF_MAX_LINES = 150;

export interface ProgressEntry {
  actor: string;
  stage: string;
  feature?: string;
  next_task: string;
  summary: string;
}

export function progressPath(cwd: string): string {
  return resolve(cwd, '.hackathon', PROGRESS_FILE);
}

export function progressExists(cwd: string): boolean {
  return existsSync(progressPath(cwd));
}

export function readProgress(cwd: string): string | null {
  try {
    return readFileSync(progressPath(cwd), 'utf8');
  } catch {
    return null;
  }
}

export function defaultProgress(cwd: string, demoGoal = 'TBD'): string {
  const path = progressPath(cwd);
  return [
    '# Hackathon Run Progress',
    '',
    'Agent-maintained handoff log. Read this first in every session, then read git log.',
    '',
    'Rules:',
    '',
    '- Work on one feature per sprint.',
    '- Append one checkpoint before ending a session.',
    '- Leave the repo clean enough to merge to main.',
    '',
    '## Initial setup',
    '',
    `- Demo goal: ${demoGoal}`,
    '- Next: run scope-knife, then write the default-FAIL plan.',
    '',
  ].join('\n');
}

export function appendProgress(cwd: string, entry: ProgressEntry): string {
  const path = progressPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, defaultProgress(cwd), 'utf8');

  const header = `## ${new Date().toISOString()} - ${entry.actor}`;
  const lines = [header];
  if (entry.feature) lines.push(`- Feature: ${entry.feature}`);
  lines.push(`- Stage: ${entry.stage}`);
  lines.push(`- Next: ${entry.next_task}`);
  lines.push(`- What changed: ${entry.summary}`);
  appendFileSync(path, '\n' + lines.join('\n') + '\n', 'utf8');
  return path;
}

export function progressDir(cwd: string): string {
  return join(cwd, '.hackathon');
}

export function sessionBriefPath(cwd: string): string {
  return resolve(cwd, '.hackathon', SESSION_BRIEF_FILE);
}

export interface SessionBriefInput {
  session: Session;
  latestSummary: string;
  traceCount: number;
  traceFile: string;
  sprint?: {
    name: string;
    feature: string;
    status: string;
    verdict?: string;
    iterations?: number;
    budgetMinutes?: number;
    maxIterations?: number;
  } | null;
  features?: Array<{
    name: string;
    classification?: string;
    passes?: boolean;
  }>;
}

function oneLine(value: string, maxLength = 320): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

function boundLines(lines: string[], maxLines = SESSION_BRIEF_MAX_LINES): string[] {
  if (lines.length <= maxLines) return lines;
  const bounded = lines.slice(0, maxLines - 1);
  bounded.push(
    `- More context omitted from this compressed view. Read \`.hackathon/PROGRESS.md\` and \`.hackathon/traces/events.jsonl\` for the full history.`,
  );
  return bounded;
}

export function renderSessionBrief(input: SessionBriefInput): string {
  const { session, sprint, features = [] } = input;
  const lines = [
    '# Hackathon Run Session',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Raw trace: \`${input.traceFile}\` (${input.traceCount} append-only events)`,
    'Full progress: `.hackathon/PROGRESS.md`',
    '',
    '## Current',
    '',
    `- Stage: ${oneLine(session.current_stage)}`,
    `- Next task: ${oneLine(session.next_task)}`,
    `- Strategy: ${session.next_action ?? 'none'}`,
    `- Latest checkpoint: ${oneLine(input.latestSummary)}`,
    '',
    '## Blockers',
    '',
    ...(session.blockers.length > 0
      ? session.blockers.slice(0, 8).map((blocker) => `- ${oneLine(blocker)}`)
      : ['- None recorded.']),
    '',
    '## Sprint',
    '',
    ...(sprint
      ? [
          `- Name: ${oneLine(sprint.name)}`,
          `- Feature: ${oneLine(sprint.feature)}`,
          `- Status: ${sprint.status}; verdict: ${sprint.verdict ?? 'pending'}`,
          `- Iterations: ${sprint.iterations ?? 0}; budget: ${sprint.budgetMinutes ?? 'unlimited'}m; max iterations: ${sprint.maxIterations ?? 'unlimited'}`,
        ]
      : ['- No active sprint.']),
    '',
    '## Feature contract',
    '',
    ...(features.length > 0
      ? features
          .slice(0, 30)
          .map(
            (feature) =>
              `- [${feature.passes === true ? 'x' : ' '}] ${oneLine(feature.name)} (${feature.classification ?? 'UNCLASSIFIED'})`,
          )
      : ['- No plan features recorded.']),
    '',
    '## Resume rules',
    '',
    '- Read this file, `PROGRESS.md`, `state/session.json`, git log, and the active sprint before editing.',
    '- Start the app and run the configured smoke/verify command before building.',
    '- Work on one unpassed KEEP feature per sprint; never set `passes: true` by hand.',
    '- Keep the raw trace append-only. This file is only a bounded handoff view.',
    '',
  ];
  return boundLines(lines).join('\n');
}

export function writeSessionBrief(
  cwd: string,
  input: SessionBriefInput,
): {
  path: string;
  lineCount: number;
} {
  const path = sessionBriefPath(cwd);
  const content = renderSessionBrief(input);
  const lineCount = content.split(/\r?\n/).length - 1;
  if (lineCount > SESSION_BRIEF_MAX_LINES) {
    throw new Error(`compressed session brief exceeded ${SESSION_BRIEF_MAX_LINES} lines`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return { path, lineCount };
}
