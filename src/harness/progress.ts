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

export const PROGRESS_FILE = 'PROGRESS.md';

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
