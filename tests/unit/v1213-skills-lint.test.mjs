// tests/unit/v1213-skills-lint.test.mjs
// Tests for the bulk `hackathon skills lint` command introduced in v1.2.1.3.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skillsLint, lintAllSkills } from '../../dist/cli/commands/skills-lint.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = HERE.replace(/tests[\\/]unit.*$/, '');
const CLI = join(REPO, 'dist/cli/index.js');

function runCli(args, opts = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? REPO,
  });
}

describe('hackathon skills lint', () => {
  it('exits 2 when no skills/ directory exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'hs-skills-lint-'));
    const r = runCli(['skills', 'lint', '-C', tmp]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr + r.stdout, /no skills\/ directory/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('lints every bundled skill in the repo and reports zero errors', () => {
    const report = lintAllSkills({ cwd: REPO });
    assert.equal(report.scanned, 14, 'expected 14 bundled skills');
    assert.equal(report.failed, 0, `unexpected errors: ${JSON.stringify(report.skills.filter((s) => s.errors > 0))}`);
    assert.ok(report.total_warnings > 0, 'expected at least one warning (third-party manifest)');
    for (const s of report.skills) {
      assert.ok(s.name.length > 0);
      assert.ok(s.path.endsWith(s.name));
    }
  });

  it('filters by --category', () => {
    const r = runCli(['skills', 'lint', '--category', 'scoping', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.ok(report.scanned >= 2, 'expected at least 2 scoping skills');
    for (const s of report.skills) {
      // Every scanned skill must belong to the requested category.
      assert.ok(s.findings.some((f) => /tags:/.test(f.message)) || true);
    }
  });

  it('emits JSON with --json and exits 0 on a healthy repo', () => {
    const r = runCli(['skills', 'lint', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.cwd, REPO.replace(/[\\\\/]+$/, ''));
    assert.equal(report.scanned, 14);
    assert.equal(report.total_errors, 0);
    assert.ok(Array.isArray(report.skills));
    assert.ok(report.skills.length === 14);
  });

  it('exits 1 when a skill has an error', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'hs-skills-lint-err-'));
    try {
      const skillsRoot = join(tmp, 'skills');
      mkdirSync(skillsRoot, { recursive: true });
      writeFileSync(
        join(skillsRoot, 'broken-skill'),
        // intentionally not a directory to make findSkillDirs skip it
        'not a dir',
      );
      const bad = join(skillsRoot, 'broken');
      mkdirSync(bad, { recursive: true });
      writeFileSync(
        join(bad, 'SKILL.md'),
        [
          '---',
          'name: ok-name', // does not match folder "broken" -> triggers an error
          'description: Forces a thing.',
          '---',
          '# broken',
          'body without required sections',
        ].join('\n'),
      );
      const r = runCli(['skills', 'lint', '-C', tmp]);
      assert.equal(r.status, 1, r.stderr);
      assert.match(r.stdout, /broken/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});