/**
 * session.ts — durable handoff state for long-running agent work.
 *
 * The session file is the compact artifact a fresh agent reads to resume
 * a project without replaying the previous conversation. It mirrors the
 * structured-artifact handoff pattern from Anthropic's long-running agent
 * harness work.
 */

import { resolve } from 'node:path';

import { readState, writeState } from './state.js';

export interface SessionEnvironment {
  init_command?: string;
  verify_command?: string;
  known_issues?: string[];
}

export interface Session {
  version: '1.0';
  generated_at: string;
  updated_at?: string;
  current_stage: string;
  next_task: string;
  completed: string[];
  blockers: string[];
  environment: SessionEnvironment;
  budget_minutes?: number;
  max_iterations?: number;
}

const SESSION_FILE = 'session.json';

export function defaultSession(cwd: string, patch: Partial<Session> = {}): Session {
  const now = new Date().toISOString();
  return {
    version: '1.0',
    generated_at: now,
    updated_at: now,
    current_stage: 'planning',
    next_task: 'Run hackathon run scope-knife to produce a default-FAIL plan.',
    completed: [],
    blockers: [],
    environment: {
      init_command: '',
      verify_command: '',
      known_issues: [],
    },
    ...patch,
  };
}

export function readSession(cwd: string): Session | null {
  return readState<Session>({ repoRoot: cwd, file: SESSION_FILE });
}

export function writeSession(cwd: string, session: Session): string {
  return writeState({ repoRoot: cwd, file: SESSION_FILE, data: session });
}

export function updateSession(cwd: string, patch: Partial<Session>): Session {
  const current = readSession(cwd) ?? defaultSession(cwd);
  const next: Session = {
    ...current,
    ...patch,
    version: '1.0',
    generated_at: current.generated_at,
    updated_at: new Date().toISOString(),
  };
  writeSession(cwd, next);
  return next;
}

export function sessionPath(cwd: string): string {
  return resolve(cwd, '.hackathon', 'state', SESSION_FILE);
}
