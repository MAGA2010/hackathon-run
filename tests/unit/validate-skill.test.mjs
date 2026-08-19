// tests/unit/validate-skill.test.mjs
// Unit tests for `hackathon validate-skill` and `hackathon new-skill`.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateSkill } from '../../dist/cli/commands/validate-skill.js';
import { newSkill } from '../../dist/cli/commands/new-skill.js';

let captured = '';
const origLog = console.log;
before(() => {
  console.log = (...args) => {
    captured += args.join(' ') + '\n';
  };
});
after(() => {
  console.log = origLog;
});

function makeSkillDir(body, opts = {}) {
  // Folder name must match the frontmatter name; extract it from the body.
  const m = body.match(/^name:\s*(\S+)/m);
  const folder = opts.folder ?? (m ? m[1] : 'scope-knife');
  const dir = join(mkdtempSync(join(tmpdir(), 'hs-vs-')), folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), body);
  if (opts.withScript) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(
      join(dir, 'scripts', `${opts.folder ?? folder ?? 'my-skill'}.py`),
      opts.scriptBody ??
        '#!/usr/bin/env python3\nVERSION = "1.0"\nimport argparse\nap = argparse.ArgumentParser()\n',
    );
  }
  return dir;
}

const GOOD_BODY = `---
name: scope-knife
description: Forces a KEEP, CUT, or DEFER decision on every feature when scope is too large.
when_to_use: |
  Trigger when scope is huge. Do not invoke when scope is already agreed.
---

# scope-knife

## Input contract

- repo_root: path

## Execution

### 1. Scan repo

Run the scanner.

## Output contract

- .hackathon/state/plan.json

## Acceptance criteria

- [ ] Outputs a plan.

## Failure modes

| Mode | Behavior |
| ---- | -------- |
| Empty | Suggest idea-clarify |

## Trigger phrases

- "too many ideas"
`;

describe('validate-skill', () => {
  it('passes a fully-formed skill with 0 errors', () => {
    const dir = makeSkillDir(GOOD_BODY);
    captured = '';
    const code = validateSkill({ target: dir, cwd: process.cwd(), json: true });
    const out = JSON.parse(captured);
    assert.equal(out.errors, 0);
    assert.equal(code, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('errors when folder name does not match frontmatter name', () => {
    const dir = makeSkillDir(GOOD_BODY.replace('name: scope-knife', 'name: different-name'), {
      folder: 'scope-knife',
    });
    const code = validateSkill({ target: dir, cwd: process.cwd() });
    assert.equal(
      code,
      1,
      "folder='scope-knife' but frontmatter name='different-name' should error",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it('errors when a required body section is missing', () => {
    const dir = makeSkillDir(
      GOOD_BODY.replace('## Acceptance criteria\n\n- [ ] Outputs a plan.\n\n', ''),
    );
    const code = validateSkill({ target: dir, cwd: process.cwd() });
    assert.equal(code, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it('errors when an unknown state file is referenced', () => {
    const dir = makeSkillDir(GOOD_BODY + '\nRefer to state/foo.json in the artifact.\n');
    const code = validateSkill({ target: dir, cwd: process.cwd() });
    assert.equal(code, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes when the referenced state file has a schema in the cwd's src/state/schemas/", () => {
    const dir = makeSkillDir(GOOD_BODY.replace('state/plan.json', 'state/recovery.json'));
    const code = validateSkill({ target: dir, cwd: process.cwd() });
    assert.equal(code, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('warns when scripts/<folder>.py lacks a VERSION pin', () => {
    const dir = makeSkillDir(GOOD_BODY, {
      withScript: true,
      folder: 'scope-knife',
      scriptBody: '#!/usr/bin/env python3\nimport argparse\nap = argparse.ArgumentParser()\n',
    });
    captured = '';
    validateSkill({ target: dir, cwd: process.cwd(), json: true });
    const out = JSON.parse(captured);
    assert.ok(out.warnings >= 1, 'expected at least one warning, got ' + JSON.stringify(out));
    assert.ok(out.findings.some((f) => /VERSION/.test(f.message)));
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not accept a VERSION pin hidden inside the docstring', () => {
    const dir = makeSkillDir(GOOD_BODY, {
      withScript: true,
      folder: 'scope-knife',
      scriptBody:
        '#!/usr/bin/env python3\n"""\nVERSION = "1.0"\nnot real code\n"""\nimport argparse\nap = argparse.ArgumentParser()\n--feature x\n',
    });
    captured = '';
    validateSkill({ target: dir, cwd: process.cwd(), json: true });
    const out = JSON.parse(captured);
    assert.ok(
      out.findings.some((f) => /VERSION/.test(f.message)),
      'a VERSION pin inside the docstring must still warn',
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it('accepts a real module-level VERSION pin', () => {
    const dir = makeSkillDir(GOOD_BODY, {
      withScript: true,
      folder: 'scope-knife',
      scriptBody:
        '#!/usr/bin/env python3\n"""\nDocstring.\n"""\nimport argparse\n\nVERSION = "1.0"\n\nap = argparse.ArgumentParser()\n',
    });
    captured = '';
    validateSkill({ target: dir, cwd: process.cwd(), json: true });
    const out = JSON.parse(captured);
    assert.ok(
      !out.findings.some((f) => /VERSION/.test(f.message)),
      'a real module-level VERSION pin must not warn',
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns 2 for a non-existent directory', () => {
    const code = validateSkill({ target: '/no/such/dir/anywhere' });
    assert.equal(code, 2);
  });
});

describe('new-skill', () => {
  it('creates skills/<name>/SKILL.md + scripts/ + tests/', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'hs-ns-'));
    mkdirSync(join(cwd, 'skills'), { recursive: true });
    const code = newSkill({
      name: 'demo-rehearsal',
      cwd,
      description: 'Run timed dry-runs of the demo script.',
      whenToUse: 'Rehearsal time. Do not invoke before scope-knife.',
      withTests: true,
    });
    assert.equal(code, 0);
    assert.ok(existsSync(join(cwd, 'skills', 'demo-rehearsal', 'SKILL.md')));
    assert.ok(existsSync(join(cwd, 'skills', 'demo-rehearsal', 'scripts', 'demo-rehearsal.py')));
    assert.ok(existsSync(join(cwd, 'skills', 'demo-rehearsal', 'tests', 'test_demo-rehearsal.sh')));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('rejects invalid (non-kebab-case) skill names', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'hs-ns-'));
    const code = newSkill({ name: 'Demo Rehearsal!!', cwd });
    assert.equal(code, 1);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('refuses to overwrite an existing skill without --force', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'hs-ns-'));
    mkdirSync(join(cwd, 'skills', 'my-skill'), { recursive: true });
    const code1 = newSkill({ name: 'my-skill', cwd });
    assert.equal(code1, 1, 'should refuse when folder exists');
    const code2 = newSkill({ name: 'my-skill', cwd, force: true });
    assert.equal(code2, 0, '--force should overwrite');
    rmSync(cwd, { recursive: true, force: true });
  });
});
