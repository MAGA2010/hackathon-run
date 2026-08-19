// tests/unit/trigger.test.mjs
// Unit tests for the skill matcher. Run with: node --test tests/unit/*.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { matchSkill } from '../../dist/harness/trigger.js';

/** @returns {import('../../dist/harness/types.js').SkillManifest} */
function mk(
  name,
  description,
  when_to_use,
  body = '',
  triggerBudget = description.length + (when_to_use ?? '').length,
) {
  return {
    path: `/tmp/${name}/SKILL.md`,
    dir: `/tmp/${name}`,
    frontmatter: { name, description, when_to_use },
    body,
    triggerBudget,
  };
}

describe('matchSkill', () => {
  it('returns null + score 0 when no tokens overlap', () => {
    const skills = [mk('alpha', 'do alpha things', 'alpha only')];
    const r = matchSkill('zzz qqq xxx', skills);
    assert.equal(r.skill, null);
    assert.equal(r.score, 0);
    assert.equal(r.candidates.length, 1);
  });

  it('picks the skill with overlapping description tokens', () => {
    const skills = [
      mk('alpha', 'ship a web app demo', ''),
      mk('beta', 'verify the demo path runs', ''),
    ];
    const r = matchSkill('verify the demo', skills);
    assert.equal(r.skill?.frontmatter.name, 'beta');
    assert.ok(r.score > 0);
  });

  it('case-insensitive and punctuation-tolerant', () => {
    const skills = [mk('alpha', 'Ship The Demo!', '')];
    const r = matchSkill('ship, the DEMO.', skills);
    assert.equal(r.skill?.frontmatter.name, 'alpha');
  });

  it('sub-token overlap counts as a soft hit', () => {
    // "scope" is a sub-token of "scope-knife" description
    const skills = [mk('scope-knife', 'cut features down to MVP', '')];
    const r = matchSkill('please scope this down', skills);
    assert.equal(r.skill?.frontmatter.name, 'scope-knife');
    assert.ok(r.score > 0);
  });

  it('tie-breaks by smaller trigger budget (more focused wins)', () => {
    // Both have description overlap of 1 token ("verify"), but budgets differ.
    const skills = [
      mk('verbose', 'verify ' + 'x'.repeat(800), ''),
      mk('focused', 'verify ' + 'x'.repeat(80), ''),
    ];
    const r = matchSkill('verify', skills);
    assert.equal(r.skill?.frontmatter.name, 'focused');
  });

  it('final tie-break is alphabetical name order (deterministic)', () => {
    const skills = [mk('zebra', 'verify path demo', ''), mk('alpha', 'verify path demo', '')];
    const r = matchSkill('verify path demo', skills);
    assert.equal(r.skill?.frontmatter.name, 'alpha');
  });

  it('considers when_to_use field for matching', () => {
    const skills = [mk('alpha', 'totally unrelated description', 'verify the demo path now')];
    const r = matchSkill('verify demo', skills);
    assert.equal(r.skill?.frontmatter.name, 'alpha');
  });

  it('considers trigger phrases extracted from body', () => {
    const body = [
      '## Trigger phrases',
      '- verify demo step by step',
      '- run all checks',
      '',
      '## Other section',
    ].join('\n');
    const skills = [mk('alpha', 'no relevant description here', '', body)];
    const r = matchSkill('run all checks', skills);
    assert.equal(r.skill?.frontmatter.name, 'alpha');
  });

  it('returns all candidates sorted by descending score', () => {
    const skills = [
      mk('weak', 'totally unrelated', ''),
      mk('strong', 'verify the demo path end to end', ''),
    ];
    const r = matchSkill('verify demo path', skills);
    assert.equal(r.candidates[0].name, 'strong');
    assert.equal(r.candidates[1].name, 'weak');
    assert.ok(r.candidates[0].score >= r.candidates[1].score);
  });

  it('handles empty utterance safely', () => {
    const skills = [mk('alpha', 'do alpha', '')];
    const r = matchSkill('', skills);
    assert.equal(r.skill, null);
    assert.equal(r.score, 0);
  });
});
