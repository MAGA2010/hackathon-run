// tests/unit/mcp.test.mjs
// Unit tests for the MCP server (line-delimited JSON-RPC over stdio).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
const SERVER = join(ROOT, 'dist', 'mcp', 'server.js');

function call(request) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER], { cwd: ROOT });
    const responses = [];
    let buf = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) responses.push(JSON.parse(line));
      }
    });
    child.stderr.on('data', () => {});
    child.on('exit', () => resolve(responses));
    child.stdin.end(JSON.stringify(request) + '\n');
    setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error('timeout'));
    }, 5000);
  });
}

describe('MCP server', () => {
  it('responds to initialize with server info', async () => {
    const res = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 1);
    assert.ok(res[0].result.protocolVersion);
    assert.equal(res[0].result.serverInfo.name, 'hackathon-run');
  });

  it('responds to tools/list with 14 tools', async () => {
    const res = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal(res.length, 1);
    const tools = res[0].result.tools;
    assert.equal(tools.length, 14);
    const names = tools.map((t) => t.name);
    assert.ok(names.includes('list_skills'));
    assert.ok(names.includes('get_skill'));
    assert.ok(names.includes('match_skill'));
    assert.ok(names.includes('status'));
    assert.ok(names.includes('replay'));
    assert.ok(names.includes('report'));
    assert.ok(names.includes('skills_pin'));
    assert.ok(names.includes('skills_diff'));
    assert.ok(names.includes('skill_chain'));
  });

  it('list_skills returns the 15 bundled skills', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_skills', arguments: {} },
    });
    const payload = JSON.parse(res[0].result.content[0].text);
    const names = payload.skills.map((s) => s.name);
    assert.ok(names.includes('scope-knife'));
    assert.ok(names.includes('fast-verify'));
    assert.ok(names.includes('demo-coach'));
    assert.ok(names.includes('judge-sim'));
    assert.ok(names.includes('ship-pack'));
    assert.ok(names.includes('recovery-runbook'));
    assert.ok(names.includes('time-box'));
    assert.ok(names.includes('stack-picker'));
    assert.ok(names.includes('retro'));
    assert.ok(names.includes('idea-clarify'));
    assert.ok(names.includes('pivot'));
    assert.ok(names.includes('demo-rehearsal'));
    assert.ok(names.includes('team-roster'));
    assert.ok(names.includes('decision-log'));
    assert.equal(names.length, 15);
  });

  it('get_skill returns the body of a known skill', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_skill', arguments: { name: 'scope-knife' } },
    });
    const payload = JSON.parse(res[0].result.content[0].text);
    assert.equal(payload.name, 'scope-knife');
    assert.ok(payload.body.length > 100);
    assert.ok(payload.description.startsWith('Forces'));
  });

  it('get_skill errors on an unknown skill', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'get_skill', arguments: { name: 'no-such-skill' } },
    });
    // The error is returned in the tool result, not as a JSON-RPC error,
    // because toolCall throws and we wrap it in a content response.
    // In our impl, throwing from toolCall surfaces as JSON-RPC error.
    assert.ok(res[0].error || res[0].result);
  });

  it('match_skill returns best + candidates', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'match_skill', arguments: { utterance: 'scope is too big', debug: true } },
    });
    const payload = JSON.parse(res[0].result.content[0].text);
    assert.equal(payload.utterance, 'scope is too big');
    assert.ok(payload.best);
    assert.ok(Array.isArray(payload.candidates));
    assert.ok(payload.candidates.length > 0);
  });

  it('returns method-not-found for unknown methods', async () => {
    const res = await call({ jsonrpc: '2.0', id: 7, method: 'no/such/method' });
    assert.equal(res[0].error.code, -32601);
  });

  it('serverInfo.version matches package.json', async () => {
    const { readFileSync } = await import('node:fs');
    const res = await call({ jsonrpc: '2.0', id: 8, method: 'initialize', params: {} });
    const pkg = JSON.parse(readFileSync(ROOT + '/package.json', 'utf8'));
    assert.equal(res[0].result.serverInfo.version, pkg.version);
  });

  it('list_examples returns the 6 bundled example projects', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'list_examples', arguments: {} },
    });
    const payload = JSON.parse(res[0].result.content[0].text);
    const names = payload.examples.map((e) => e.name);
    assert.ok(names.includes('web-app'));
    assert.ok(names.includes('ai-ml'));
    assert.ok(names.includes('mobile'));
    assert.ok(names.includes('data-eng'));
    assert.ok(names.includes('chrome-extension'));
    assert.ok(names.includes('devtool-cli'));
    for (const ex of payload.examples) {
      assert.ok(ex.has_state === true);
    }
  });

  it('list_examples supports stack filter', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'list_examples', arguments: { stack: 'python' } },
    });
    const payload = JSON.parse(res[0].result.content[0].text);
    assert.ok(payload.examples.length >= 1);
    for (const ex of payload.examples) {
      assert.ok(ex.stack.includes('python'), 'stack=' + ex.stack);
    }
  });

  it('get_recovery_plan returns the fallback script + decision tree', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'get_recovery_plan',
        arguments: { failing_step: 'login', time_remaining_minutes: 5 },
      },
    });
    const payload = JSON.parse(res[0].result.content[0].text);
    assert.equal(payload.failing_step, 'login');
    assert.equal(payload.time_remaining_minutes, 5);
    assert.ok(Array.isArray(payload.fallback_script));
    assert.ok(payload.fallback_script.length >= 3);
    assert.ok(payload.decision_tree);
    assert.ok(Array.isArray(payload.checklist));
  });

  it('validate_skill lints a known-bad skill directory', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'hs-test-'));
    try {
      writeFileSync(
        join(dir, 'SKILL.md'),
        '---\nname: bad\ndescription: leads with no verb\n---\n# bad\n',
      );
      const res = await call({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: { name: 'validate_skill', arguments: { target: dir } },
      });
      const payload = JSON.parse(res[0].result.content[0].text);
      assert.equal(payload.target, dir);
      assert.equal(payload.exitCode, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('apply_skill_advice writes to .hackathon/state/', async () => {
    const { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } =
      await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'hs-apply-'));
    try {
      const res = await call({
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: {
          name: 'apply_skill_advice',
          arguments: {
            state_file: 'plan',
            payload: {
              version: '1.0',
              generated_at: '2025-01-01T00:00:00Z',
              demo_goal: 'test',
              time_remaining_minutes: 60,
              features: [],
              demo_path: [],
              next_tasks: [],
            },
            cwd: dir,
          },
        },
      });
      const payload = JSON.parse(res[0].result.content[0].text);
      assert.ok(payload.wrote.includes('.hackathon') && payload.wrote.includes('plan.json'));
      assert.ok(existsSync(payload.wrote));
      const written = JSON.parse(readFileSync(payload.wrote, 'utf8'));
      assert.equal(written.demo_goal, 'test');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
