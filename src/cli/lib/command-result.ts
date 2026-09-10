/**
 * Shared command result envelope.
 *
 * CLI commands keep returning process exit codes for compatibility, while
 * their result-producing counterparts return the validated payload that MCP
 * and programmatic callers can consume without intercepting console output.
 */

export interface CommandResult<T> {
  exitCode: number;
  data: T;
}

export function commandOk<T>(data: T): CommandResult<T> {
  return { exitCode: 0, data };
}

export function commandFail<T>(data: T, exitCode = 1): CommandResult<T> {
  return { exitCode, data };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
