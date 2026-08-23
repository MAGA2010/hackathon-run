#!/usr/bin/env node
/**
 * harness-ab.mjs — compare a solo agent run against the full harness.
 *
 * Usage:
 *   node scripts/harness-ab.mjs \
 *     --solo-command "hackathon run scope-knife" \
 *     --harness-command "hackathon flow --execute" \
 *     --output .hackathon/traces/harness-ab.json
 *
 * This is a measurement primitive, not a substitute for human judgment.
 * Run it on the same project twice and compare duration, exit code, and the
 * resulting state before deciding which harness components are paying for
 * themselves.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function valueOf(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const soloCommand = valueOf('--solo-command');
const harnessCommand = valueOf('--harness-command');
const outputPath = valueOf('--output') ?? '.hackathon/traces/harness-ab.json';
const cwd = process.cwd();

if (!soloCommand || !harnessCommand) {
  console.error(
    'usage: harness-ab.mjs --solo-command <cmd> --harness-command <cmd> [--output <file>]',
  );
  process.exit(2);
}

function measure(label, command) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const durationMs = Date.now() - startedMs;
  return {
    label,
    command,
    started_at: startedAt,
    duration_ms: durationMs,
    duration_s: Math.round(durationMs / 100) / 10,
    exit_code: result.status,
    signal: result.signal ?? null,
    stdout_bytes: (result.stdout ?? '').length,
    stderr_bytes: (result.stderr ?? '').length,
    tail: (result.stdout ?? '').slice(-4000),
  };
}

const solo = measure('solo', soloCommand);
const harness = measure('harness', harnessCommand);
const output = resolve(cwd, outputPath);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      version: '1.0',
      generated_at: new Date().toISOString(),
      cwd,
      command_line: process.argv.slice(2),
      runs: [solo, harness],
      verdict:
        solo.exit_code === 0 && harness.exit_code === 0
          ? 'compare state artifacts and human quality before judging the harness'
          : 'at least one run failed; inspect the runs above',
    },
    null,
    2,
  ) + '\n',
);

console.log(`solo:     ${solo.duration_s}s exit=${solo.exit_code}`);
console.log(`harness:  ${harness.duration_s}s exit=${harness.exit_code}`);
console.log(`wrote ${output}`);
