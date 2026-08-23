// tests/unit/frontmatter.test.mjs
// Unit tests for the YAML frontmatter parser.
// Run with: node --test tests/unit/*.test.mjs (after `npm run build`).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFrontmatter,
  TRIGGER_BUDGET,
  enforceTriggerBudget,
} from '../../dist/harness/frontmatter.js';

describe('parseFrontmatter', () => {
  it('extracts name + description from a minimal skill', () => {
    const md = '---\nname: foo\ndescription: A test skill.\n---\nBody goes here.';
    const r = parseFrontmatter(md);
    assert.equal(r.frontmatter.name, 'foo');
    assert.equal(r.frontmatter.description, 'A test skill.');
    assert.equal(r.frontmatter.when_to_use, undefined);
    assert.equal(r.body.trim(), 'Body goes here.');
  });

  it('reads block-scalar when_to_use with newlines preserved', () => {
    const md =
      '---\n' +
      'name: foo\n' +
      'description: A test.\n' +
      'when_to_use: |\n' +
      '  use when X\n' +
      '  use when Y\n' +
      '---\nbody';
    const r = parseFrontmatter(md);
    assert.equal(r.frontmatter.when_to_use, 'use when X\nuse when Y');
  });

  it('rejects missing frontmatter', () => {
    assert.throws(() => parseFrontmatter('no frontmatter here'), /missing YAML frontmatter/);
  });

  it('accepts CRLF frontmatter from a Windows checkout', () => {
    const md = [
      '---\r',
      'name: windows-skill\r',
      'description: Parses CRLF skill files.\r',
      '---\r',
      'body',
    ].join('\n');
    const r = parseFrontmatter(md);
    assert.equal(r.frontmatter.name, 'windows-skill');
    assert.equal(r.frontmatter.description, 'Parses CRLF skill files.');
    assert.equal(r.body, 'body');
  });

  it('rejects missing required field name', () => {
    const md = '---\ndescription: only description\n---\nbody';
    assert.throws(() => parseFrontmatter(md), /required field: name/);
  });

  it('rejects missing required field description', () => {
    const md = '---\nname: foo\n---\nbody';
    assert.throws(() => parseFrontmatter(md), /required field: description/);
  });

  it('reads arrays for paths and allowed_tools', () => {
    const md = [
      '---',
      'name: foo',
      'description: A test.',
      'paths:',
      '  - src/**',
      '  - docs/**',
      'allowed_tools:',
      '  - Read',
      '  - Bash',
      '---',
      'body',
    ].join('\n');
    const r = parseFrontmatter(md);
    assert.deepEqual(r.frontmatter.paths, ['src/**', 'docs/**']);
    assert.deepEqual(r.frontmatter.allowed_tools, ['Read', 'Bash']);
  });
});

describe('trigger budget', () => {
  it('computes budget as description.length + when_to_use.length', () => {
    const md =
      '---\nname: foo\ndescription: ' +
      'a'.repeat(100) +
      '\nwhen_to_use: ' +
      'b'.repeat(50) +
      '\n---\nbody';
    const r = parseFrontmatter(md);
    assert.equal(r.triggerBudget, 150);
  });

  it('enforceTriggerBudget throws when over budget', () => {
    const md = '---\nname: foo\ndescription: ' + 'a'.repeat(TRIGGER_BUDGET + 1) + '\n---\nbody';
    const r = parseFrontmatter(md);
    assert.throws(() => enforceTriggerBudget(r), /trigger budget exceeded/);
  });

  it('enforceTriggerBudget passes when at exactly the budget', () => {
    const md = '---\nname: foo\ndescription: ' + 'a'.repeat(TRIGGER_BUDGET) + '\n---\nbody';
    const r = parseFrontmatter(md);
    assert.doesNotThrow(() => enforceTriggerBudget(r));
  });
});
