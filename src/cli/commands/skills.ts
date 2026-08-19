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
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

import { loadAllSkills } from '../../harness/loader.js';
import { c } from '../lib/colors.js';
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
  writeFileSync(p, JSON.stringify(pin, null, 2) + '\n');
  return p;
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
      `  ${'name'.padEnd(20)} ${'trigger/1536'.padEnd(12)} ${'frontmatter preview'.padEnd(60)}`,
    );
    for (const s of loaded) {
      const preview = (s.frontmatter.description ?? '').slice(0, 60);
      console.log(
        `  ${s.frontmatter.name.padEnd(20)} ${String(s.triggerBudget).padEnd(12)} ${preview}`,
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
    const entries: PinEntry[] = loaded.map((s) => {
      const refs =
        s.body
          .match(/(?:state|references|templates|scripts|tests)\/[A-Za-z0-9._-]+/g)
          ?.join('\n') ?? '';
      return {
        name: s.frontmatter.name,
        version: packVersion,
        checksum: checksumOf(JSON.stringify(s.frontmatter) + s.body, refs),
      };
    });
    const pin: PinFile = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      pack_version: packVersion,
      skills: entries,
    };
    const p = writePin(cwd, pin);
    log.ok(`pinned ${entries.length} skills @ pack v${packVersion}`);
    log.dim(`wrote ${p}`);
    return 0;
  }

  if (opts.subcommand === 'diff') {
    const pin = readPin(cwd);
    if (!pin) {
      log.err(`no pin file at ${PIN_PATH}`);
      log.dim(`run ${c.cyan('hackathon skills pin --all')} first`);
      return 1;
    }
    const current = new Map(
      loaded.map((s) => {
        const refs =
          s.body
            .match(/(?:state|references|templates|scripts|tests)\/[A-Za-z0-9._-]+/g)
            ?.join('\n') ?? '';
        return [
          s.frontmatter.name,
          {
            version: packVersion,
            checksum: checksumOf(JSON.stringify(s.frontmatter) + s.body, refs),
          },
        ];
      }),
    );
    let changes = 0;
    for (const entry of pin.skills) {
      const now = current.get(entry.name);
      if (!now) {
        console.log(`  ${c.red('-')} ${entry.name}  (removed from pack)`);
        changes++;
      } else if (now.checksum !== entry.checksum) {
        console.log(`  ${c.yellow('~')} ${entry.name}  ${entry.checksum} -> ${now.checksum}`);
        changes++;
      }
    }
    for (const [name] of current) {
      if (!pin.skills.find((e) => e.name === name)) {
        console.log(`  ${c.green('+')} ${name}  (new in pack)`);
        changes++;
      }
    }
    if (pin.pack_version !== packVersion) {
      console.log();
      console.log(`  ${c.yellow('!')} pack version: ${pin.pack_version} -> ${packVersion}`);
      changes++;
    }
    if (changes === 0) {
      log.ok('no changes since pin');
    }
    return 0;
  }

  log.err(`unknown subcommand: ${opts.subcommand}`);
  return 2;
}
