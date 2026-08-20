/**
 * skills-lint.ts — bulk-lint every bundled skill in one shot.
 *
 * Useful for CI and pre-commit hooks: instead of running
 * `hackathon validate-skill skills/<each>` 14 times, run
 * `hackathon skills lint` once and get a single summary table
 * plus per-skill detail.
 *
 * Behavior:
 *   - Default: scans `skills/` under `--cwd` (default: process.cwd())
 *   - For each SKILL.md found, runs the same checks as `validate-skill`
 *   - Prints a summary table: skill | errors | warnings
 *   - Prints detailed findings only for skills that have any errors
 *     (warnings are summarized, not re-printed, to keep CI logs short)
 *   - With `--verbose`, prints every finding from every skill
 *   - With `--category <name>`, only lints skills in that Format v2 category
 *   - With `--json`, emits a single JSON document
 *
 * Exit codes:
 *   0  all skills pass (warnings allowed)
 *   1  at least one ERROR-level finding across the catalog
 *   2  I/O or usage error (e.g. missing skills/ directory)
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { findSkillDirs } from '../../harness/loader.js';
import { checkSkill, type Finding } from './validate-skill.js';
import { c } from '../lib/colors.js';

export interface SkillsLintOptions {
  cwd?: string;
  json?: boolean;
  verbose?: boolean;
  category?: string;
}

export interface SkillLintResult {
  name: string;
  path: string;
  errors: number;
  warnings: number;
  info: number;
  findings: Finding[];
}

export interface SkillsLintReport {
  cwd: string;
  skills_dir: string;
  scanned: number;
  passed: number;
  failed: number;
  total_errors: number;
  total_warnings: number;
  skills: SkillLintResult[];
}

export function lintAllSkills(opts: SkillsLintOptions): SkillsLintReport {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const skillsRoot = join(cwd, 'skills');
  const skillDirs = findSkillDirs(cwd);
  const wantedCategory = opts.category?.trim();

  const results: SkillLintResult[] = [];
  for (const dir of skillDirs) {
    let findings: Finding[] = [];
    try {
      findings = checkSkill(dir, cwd);
    } catch (e) {
      findings = [
        {
          severity: 'error',
          message: `failed to load skill: ${(e as Error).message}`,
        },
      ];
    }

    const name = basename(dir);
    if (wantedCategory) {
      // Defer category check: read the frontmatter via the same path the loader uses.
      // findSkillDirs only returns dirs with SKILL.md present, but we still need
      // the parsed category. The simplest reliable signal: read the file and grep
      // for `category: <name>` (no quotes).
      try {
        const raw = readFileSync(join(dir, 'SKILL.md'), 'utf-8');
        const m = raw.match(/^category:\s*([^\n#]+)/m);
        const cat = m ? m[1].trim() : '';
        if (cat !== wantedCategory) continue;
      } catch {
        continue;
      }
    }

    results.push({
      name,
      path: dir,
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warn').length,
      info: findings.filter((f) => f.severity === 'info').length,
      findings,
    });
  }

  return {
    cwd,
    skills_dir: skillsRoot,
    scanned: results.length,
    passed: results.filter((r) => r.errors === 0).length,
    failed: results.filter((r) => r.errors > 0).length,
    total_errors: results.reduce((n, r) => n + r.errors, 0),
    total_warnings: results.reduce((n, r) => n + r.warnings, 0),
    skills: results,
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export function skillsLint(opts: SkillsLintOptions): number {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const skillsRoot = join(cwd, 'skills');

  if (!existsSync(skillsRoot)) {
    process.stderr.write(`hackathon skills lint: no skills/ directory under ${cwd}\n`);
    return 2;
  }

  const report = lintAllSkills(opts);

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.total_errors > 0 ? 1 : 0;
  }

  const headline = c.bold('hackathon skills lint');
  const root = c.dim('skills dir: ' + report.skills_dir);
  console.log(`${headline}  ${root}`);
  console.log();

  if (report.scanned === 0) {
    console.log(c.yellow('no skills found'));
    return 0;
  }

  const nameWidth = Math.max(4, ...report.skills.map((s) => s.name.length));
  const errWidth = Math.max(5, ...report.skills.map((s) => String(s.errors).length));
  const warnWidth = Math.max(7, ...report.skills.map((s) => String(s.warnings).length));

  console.log(
    `  ${pad('skill', nameWidth)}  ${pad('errors', errWidth)}  ${pad('warns', warnWidth)}`,
  );
  console.log(`  ${'-'.repeat(nameWidth)}  ${'-'.repeat(errWidth)}  ${'-'.repeat(warnWidth)}`);
  for (const s of report.skills) {
    const errCell =
      s.errors > 0 ? c.red(pad(String(s.errors), errWidth)) : c.green(pad('0', errWidth));
    const warnCell =
      s.warnings > 0 ? c.yellow(pad(String(s.warnings), warnWidth)) : pad('0', warnWidth);
    console.log(`  ${pad(s.name, nameWidth)}  ${errCell}  ${warnCell}`);
  }

  console.log();
  const summary =
    `${report.scanned} skills scanned, ` +
    `${c.green(report.passed + ' passed')}, ` +
    `${report.failed > 0 ? c.red(report.failed + ' failed') : c.green('0 failed')}, ` +
    `${report.total_errors} error(s), ${report.total_warnings} warning(s)`;
  console.log('  ' + summary);

  if (opts.verbose || report.total_errors > 0) {
    console.log();
    console.log(c.bold('Details:'));
    for (const s of report.skills) {
      const relevant = opts.verbose ? s.findings : s.findings.filter((f) => f.severity === 'error');
      if (relevant.length === 0) continue;
      console.log();
      console.log(c.bold('  ' + s.name));
      for (const f of relevant) {
        const tag =
          f.severity === 'error'
            ? c.red('ERROR')
            : f.severity === 'warn'
              ? c.yellow('WARN ')
              : c.gray('info ');
        console.log(`    [${tag}] ${f.message}`);
      }
    }
  }

  return report.total_errors > 0 ? 1 : 0;
}
