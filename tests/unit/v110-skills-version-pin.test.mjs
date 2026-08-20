// tests/unit/v110-skills-version-pin.test.mjs
// Tests for per-skill Format v2 version pinning in `hackathon skills pin`.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { skills } from '../../dist/cli/commands/skills.js';

const SKILL_WITH_VERSION = `---
name: my-skill
description: Leads with an action verb and a full description
version: 2.0
category: scoping
tags: ['demo']
dependencies: []
side_effects: ['plan']
triggers: ['do the thing']
---

# my-skill

## Trigger phrases
- do the thing
`;

const SKILL_NO_VERSION = `---
name: other-skill
description: Leads with another action verb
---

# other-skill

## Trigger phrases
- do the other thing
`;

function scaffold(dir, files) {
  mkdirSync(join(dir, 'skills'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, 'skills', name), { recursive: true });
    writeFileSync(join(dir, 'skills', name, 'SKILL.md'), content);
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '9.9.9' }));
}

describe('skills pin per-skill version', () => {
  it("records the skill's own Format v2 version, not only the pack version", () => {
    const dir = mkdtempSync(join(tmpdir(), 'hs-pin-'));
    try {
      scaffold(dir, { 'my-skill': SKILL_WITH_VERSION });
      const code = skills({ subcommand: 'pin', cwd: dir });
      assert.equal(code, 0);
      const pin = JSON.parse(readFileSync(join(dir, '.hackathon', 'skills.json'), 'utf8'));
      assert.equal(pin.pack_version, '9.9.9');
      assert.equal(pin.version, '1.1');
      assert.equal(pin.skills.length, 1);
      assert.equal(pin.skills[0].name, 'my-skill');
      assert.equal(pin.skills[0].version, '2.0');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to the pack version when a skill lacks a version field', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hs-pin-'));
    try {
      scaffold(dir, { 'other-skill': SKILL_NO_VERSION });
      const code = skills({ subcommand: 'pin', cwd: dir });
      assert.equal(code, 0);
      const pin = JSON.parse(readFileSync(join(dir, '.hackathon', 'skills.json'), 'utf8'));
      assert.equal(pin.skills[0].version, '9.9.9');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a per-skill version change in diff', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hs-pin-'));
    try {
      scaffold(dir, { 'my-skill': SKILL_WITH_VERSION });
      skills({ subcommand: 'pin', cwd: dir });

      // Bump the skill's own version and re-pin/diff.
      const bumped = SKILL_WITH_VERSION.replace('version: 2.0', 'version: 3.0');
      writeFileSync(join(dir, 'skills', 'my-skill', 'SKILL.md'), bumped);
      const captured = [];
      const orig = console.log;
      console.log = (...a) => captured.push(a.join(' '));
      let code = -1;
      try {
        code = skills({ subcommand: 'diff', cwd: dir });
      } finally {
        console.log = orig;
      }
      assert.equal(code, 0);
      assert.ok(captured.join('\n').includes('v2.0 -> v3.0'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
