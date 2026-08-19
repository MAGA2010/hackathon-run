// tests/unit/v040-skills.test.mjs
// Unit tests for the v0.4.0 skill roster: time-box, stack-picker, retro.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
const CLI = join(ROOT, 'dist', 'cli', 'index.js');

const NEW_SKILLS = ['time-box', 'stack-picker', 'retro'];
const NEW_SCHEMAS = ['time-box.schema.json', 'stack.schema.json', 'retro.schema.json'];

describe('v0.4.0 skill roster', () => {
  for (const name of NEW_SKILLS) {
    it(name + '/SKILL.md exists and has 6 required body sections', () => {
      const skillMd = join(ROOT, 'skills', name, 'SKILL.md');
      assert.ok(existsSync(skillMd), 'missing ' + skillMd);
      const txt = readFileSync(skillMd, 'utf8');
      const required = [
        '## Input contract',
        '## Execution',
        '## Output contract',
        '## Acceptance criteria',
        '## Failure modes',
        '## Trigger phrases',
      ];
      for (const section of required) {
        assert.ok(txt.includes(section), name + ' missing ' + section);
      }
    });

    it(name + ' passes validate-skill with 0 errors', () => {
      const r = spawnSync(process.execPath, [CLI, 'validate-skill', join(ROOT, 'skills', name)], {
        encoding: 'utf8',
        cwd: ROOT,
      });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.ok(r.stdout.includes('0 errors'), r.stdout);
    });

    it(name + ' frontmatter description + when_to_use under 1536 chars', () => {
      const txt = readFileSync(join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');
      const fm = txt.split(/^---\s*$/m)[1] || '';
      const descMatch = fm.match(/^description:\s*(.+)$/m);
      const wtuMatch = fm.match(/^when_to_use:\s*[|>]([\s\S]+?)(?=^[a-z_]+:\s|^---)/m);
      const total =
        (descMatch ? descMatch[1].length : 0) +
        (wtuMatch ? wtuMatch[1].replace(/\s+/g, ' ').trim().length : 0);
      assert.ok(total < 1536, name + ' trigger budget ' + total + ' exceeds 1536');
    });
  }

  for (const schemaName of NEW_SCHEMAS) {
    it('schema ' + schemaName + ' parses as valid JSON', () => {
      const p = join(ROOT, 'src', 'state', 'schemas', schemaName);
      assert.ok(existsSync(p), 'missing ' + p);
      const data = JSON.parse(readFileSync(p, 'utf8'));
      assert.equal(data.type, 'object');
      assert.ok(Array.isArray(data.required));
      assert.ok(data.required.length > 0);
      assert.ok(data.properties.version);
    });
  }
});
