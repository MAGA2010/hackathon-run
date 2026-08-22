// tests/unit/v123-init-skills-discovery.test.mjs
// Regression tests for `hackathon init` + skill discovery after init.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findSkillDirs, loadAllSkills } from '../../dist/harness/loader.js';

const SKILL = `---
name: scope-knife
description: Forces a scope decision.
---
# scope-knife
`;

function writeSkill(root, name, body = SKILL) {
  const dir = join(root, '.hackathon', 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), body);
}

describe('skill discovery after hackathon init', () => {
  it('finds skills under .hackathon/skills when skills/ is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'hs-init-discovery-'));
    try {
      writeSkill(root, 'scope-knife');
      const dirs = findSkillDirs(root);
      assert.equal(dirs.length, 1);
      assert.ok(dirs[0].startsWith(join(root, '.hackathon', 'skills')));
      assert.equal(loadAllSkills(root)[0].frontmatter.name, 'scope-knife');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('prefers skills/ over .hackathon/skills when both exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'hs-init-discovery-'));
    try {
      writeSkill(root, 'scope-knife');
      const sourceDir = join(root, 'skills', 'scope-knife');
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, 'SKILL.md'), SKILL);
      const dirs = findSkillDirs(root);
      assert.equal(dirs.length, 1);
      assert.ok(dirs[0].startsWith(join(root, 'skills')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('merges extra skills from .hackathon/skills', () => {
    const root = mkdtempSync(join(tmpdir(), 'hs-init-discovery-'));
    try {
      const sourceDir = join(root, 'skills', 'demo-coach');
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, 'SKILL.md'), SKILL.replace('scope-knife', 'demo-coach'));
      writeSkill(root, 'scope-knife');
      const dirs = findSkillDirs(root);
      assert.deepEqual(
        dirs.map((d) => d.split(/[\\/]/).pop()),
        ['demo-coach', 'scope-knife'],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
