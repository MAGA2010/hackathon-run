/**
 * skills.ts — manage the team's .hackathon/skills.json catalog.
 *
 * The catalog pins which skill versions a team is using. Useful for:
 *   - reproducibility (CI runs the same set of skills)
 *   - team coordination (everyone agrees on which skills are active)
 *   - upgrading (show diff between current and available versions)
 *
 * Subcommands:
 *   hackathon skills list                list bundled skills (default if none)
 *   hackathon skills pin --all           pin every bundled skill
 *   hackathon skills diff                show what changed since the pin
 *   hackathon skills show                print the current pin (if any)
 *
 * Since v1.1.0 each entry records the skill's own Format v2 `version`
 * (falling back to the pack version), not only the pack-level version.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';

import { loadAllSkills } from '../../harness/loader.js';
import { c } from '../lib/colors.js';
import { commandFail, commandOk, type CommandResult } from '../lib/command-result.js';
import { log } from '../lib/logger.js';

const PIN_PATH = '.hackathon/skills.json';
const PKG_VERSION_FALLBACK = '0.0.0';

interface PinEntry {
  name: string;
  version: string;
  checksum: string;
}

interface PinFile {
  version: string;
  generated_at: string;
  pack_version: string;
  skills: PinEntry[];
}

export interface SkillsPinPayload {
  ok: true;
  action: 'pin';
  path: string;
  pack_version: string;
  skills: PinEntry[];
  output: string;
}

interface SkillDiffChange {
  kind: 'added' | 'removed' | 'changed' | 'pack-version';
  name?: string;
  from?: string | null;
  to?: string | null;
}

export interface SkillsDiffPayload {
  ok: boolean;
  action: 'diff';
  changes: SkillDiffChange[];
  pack_version_before?: string;
  pack_version_after?: string;
  output: string;
  error?: string;
}

function readPkgVersion(repoRoot: string): string {
  const p = join(repoRoot, 'package.json');
  if (!existsSync(p)) return PKG_VERSION_FALLBACK;
  try {
    return JSON.parse(readFileSync(p, 'utf8')).version ?? PKG_VERSION_FALLBACK;
  } catch {
    return PKG_VERSION_FALLBACK;
  }
}

function checksumOf(raw: string, refs: string): string {
  const h = createHash('sha256');
  h.update(raw);
  h.update('\0');
  h.update(refs);
  return 'sha256:' + h.digest('hex').slice(0, 16);
}

function skillVersion(frontmatter: { version?: string }, packVersion: string): string {
  return frontmatter.version ?? packVersion;
}

function readPin(cwd: string): PinFile | null {
  const p = resolve(cwd, PIN_PATH);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writePin(cwd: string, pin: PinFile): string {
  const p = resolve(cwd, PIN_PATH);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(pin, null, 2) + '\n');
  return p;
}

function currentPinEntries(loaded: ReturnType<typeof loadAllSkills>, packVersion: string) {
  return loaded.map((s) => {
    const refs =
      s.body.match(/(?:state|references|templates|scripts|tests)\/[A-Za-z0-9._-]+/g)?.join('\n') ??
      '';
    return {
      name: s.frontmatter.name,
      version: skillVersion(s.frontmatter, packVersion),
      checksum: checksumOf(JSON.stringify(s.frontmatter) + s.body, refs),
    };
  });
}

export function skillsPinResult(cwd: string): CommandResult<SkillsPinPayload> {
  const loaded = loadAllSkills(cwd);
  const packVersion = readPkgVersion(cwd);
  const entries = currentPinEntries(loaded, packVersion);
  const pin: PinFile = {
    version: '1.1',
    generated_at: new Date().toISOString(),
    pack_version: packVersion,
    skills: entries,
  };
  const path = writePin(cwd, pin);
  return commandOk({
    ok: true,
    action: 'pin',
    path,
    pack_version: packVersion,
    skills: entries,
    output: `pinned ${entries.length} skills at their Format v2 versions (pack v${packVersion})\nwrote ${path}`,
  });
}

export function skillsDiffResult(cwd: string): CommandResult<SkillsDiffPayload> {
  const loaded = loadAllSkills(cwd);
  const packVersion = readPkgVersion(cwd);
  const pin = readPin(cwd);
  if (!pin) {
    return commandFail({
      ok: false,
      action: 'diff',
      changes: [],
      output: '',
      error: `no pin file at ${PIN_PATH}`,
    });
  }
  const current = new Map(
    currentPinEntries(loaded, packVersion).map((entry) => [entry.name, entry]),
  );
  const changes: SkillDiffChange[] = [];
  const lines: string[] = [];
  for (const entry of pin.skills) {
    const now = current.get(entry.name);
    if (!now) {
      lines.push(`  - ${entry.name}  (removed from pack)`);
      changes.push({ kind: 'removed', name: entry.name, from: entry.version, to: null });
    } else if (now.checksum !== entry.checksum) {
      lines.push(`  ~ ${entry.name}  ${entry.checksum} -> ${now.checksum}`);
      if (now.version !== entry.version) {
        lines.push(`  ^ ${entry.name}  v${entry.version} -> v${now.version}`);
      }
      changes.push({
        kind: 'changed',
        name: entry.name,
        from: entry.checksum,
        to: now.checksum,
      });
    }
  }
  for (const [name] of current) {
    if (!pin.skills.find((entry) => entry.name === name)) {
      lines.push(`  + ${name}  (new in pack)`);
      changes.push({ kind: 'added', name, from: null, to: current.get(name)?.version ?? null });
    }
  }
  if (pin.pack_version !== packVersion) {
    lines.push('');
    lines.push(`  ! pack version: ${pin.pack_version} -> ${packVersion}`);
    changes.push({
      kind: 'pack-version',
      from: pin.pack_version,
      to: packVersion,
    });
  }
  if (changes.length === 0) lines.push('no changes since pin');
  return commandOk({
    ok: true,
    action: 'diff',
    changes,
    pack_version_before: pin.pack_version,
    pack_version_after: packVersion,
    output: lines.join('\n'),
  });
}

export interface SkillsOptions {
  subcommand: 'list' | 'pin' | 'diff' | 'show';
  cwd?: string;
}

export function skills(opts: SkillsOptions): number {
  const cwd = opts.cwd ?? process.cwd();
  const loaded = loadAllSkills(cwd);
  const packVersion = readPkgVersion(cwd);

  if (opts.subcommand === 'list') {
    console.log(c.bold(`hackathon skills list — ${loaded.length} bundled`));
    console.log();
    console.log(
      `  ${'name'.padEnd(20)} ${'version'.padEnd(8)} ${'trigger/1536'.padEnd(12)} ${'frontmatter preview'.padEnd(60)}`,
    );
    for (const s of loaded) {
      const preview = (s.frontmatter.description ?? '').slice(0, 60);
      console.log(
        `  ${s.frontmatter.name.padEnd(20)} ${(s.frontmatter.version ?? packVersion).padEnd(8)} ${String(s.triggerBudget).padEnd(12)} ${preview}`,
      );
    }
    return 0;
  }

  if (opts.subcommand === 'show') {
    const pin = readPin(cwd);
    if (!pin) {
      log.err(`no pin file at ${PIN_PATH}`);
      log.dim(`run ${c.cyan('hackathon skills pin --all')} to create one`);
      return 1;
    }
    console.log(JSON.stringify(pin, null, 2));
    return 0;
  }

  if (opts.subcommand === 'pin') {
    const result = skillsPinResult(cwd);
    for (const line of result.data.output.split('\n')) console.log(line);
    return result.exitCode;
  }

  if (opts.subcommand === 'diff') {
    const result = skillsDiffResult(cwd);
    if (!result.data.ok) {
      log.err(result.data.error ?? `no pin file at ${PIN_PATH}`);
      log.dim(`run ${c.cyan('hackathon skills pin --all')} first`);
      return result.exitCode;
    }
    if (result.data.output) console.log(result.data.output);
    return result.exitCode;
  }

  log.err(`unknown subcommand: ${opts.subcommand}`);
  return 2;
}
