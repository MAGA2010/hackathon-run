// tests/unit/v110-run-chain.test.mjs
// Tests for `hackathon run --chain` topological ordering.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { resolveChainOrder, runChain } from '../../dist/cli/commands/run.js';
import { loadAllSkills } from '../../dist/harness/loader.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = HERE.replace(/tests[/\\]unit.*$/, '');

function mk(name, dependencies = []) {
  return {
    path: `/tmp/${name}/SKILL.md`,
    dir: `/tmp/${name}`,
    frontmatter: { name, description: `Do ${name} things`, dependencies },
    body: '',
    triggerBudget: 10,
  };
}

describe('run --chain', () => {
  it('orders dependencies before the target', () => {
    const skills = [mk('a', ['b']), mk('b', ['c']), mk('c')];
    const plan = resolveChainOrder(skills, 'a');
    assert.equal(plan.cycle, null);
    assert.deepEqual(plan.order, ['c', 'b', 'a']);
  });

  it('detects a dependency cycle', () => {
    const skills = [mk('a', ['b']), mk('b', ['a'])];
    const plan = resolveChainOrder(skills, 'a');
    assert.ok(plan.cycle, 'expected a cycle to be reported');
    assert.equal(plan.order.length, 0);
  });

  it('skips unknown dependencies without failing', () => {
    const skills = [mk('a', ['no-such-skill'])];
    const plan = resolveChainOrder(skills, 'a');
    assert.deepEqual(plan.order, ['a']);
  });

  it('returns empty order for an unknown target', () => {
    const plan = resolveChainOrder([mk('a')], 'missing');
    assert.deepEqual(plan.order, []);
    assert.equal(plan.cycle, null);
  });

  it('orders a real skill chain deps-first', () => {
    const skills = loadAllSkills(REPO);
    const plan = resolveChainOrder(skills, 'demo-rehearsal');
    assert.equal(plan.cycle, null);
    assert.equal(plan.order[plan.order.length - 1], 'demo-rehearsal');
    assert.ok(plan.order.indexOf('demo-coach') < plan.order.indexOf('demo-rehearsal'));
    assert.ok(plan.order.indexOf('fast-verify') < plan.order.indexOf('demo-coach'));
  });

  it('runChain prints the chain and exits 0', () => {
    const captured = [];
    const orig = console.log;
    console.log = (...a) => captured.push(a.join(' '));
    let code = -1;
    try {
      code = runChain({ skillName: 'stack-picker', cwd: REPO, noBanner: true });
    } finally {
      console.log = orig;
    }
    assert.equal(code, 0);
    const out = captured.join('\n');
    assert.ok(out.includes('idea-clarify'), 'chain should include idea-clarify');
    assert.ok(out.includes('scope-knife'), 'chain should include scope-knife');
    assert.ok(out.includes('stack-picker'), 'chain should include stack-picker');
  });
});
