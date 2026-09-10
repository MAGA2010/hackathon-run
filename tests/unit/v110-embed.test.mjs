// tests/unit/v110-embed.test.mjs
// Tests for the optional pluggable embedding matcher backend.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { matchSkillWithBackend } from '../../dist/harness/embed.js';

function mk(name, description, when_to_use = '') {
  return {
    path: `/tmp/${name}/SKILL.md`,
    dir: `/tmp/${name}`,
    frontmatter: { name, description, when_to_use },
    body: '',
    triggerBudget: description.length + when_to_use.length,
  };
}

const SKILLS = [
  mk('scope-knife', 'Force a KEEP, CUT, or DEFER decision', ''),
  mk('fast-verify', 'Verify the demo path runs end to end', ''),
];

describe('embedding matcher backend', () => {
  let server;
  let baseUrl;
  let requestBodies = [];

  before(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        requestBodies.push(JSON.parse(body || '{}'));
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            best: 'scope-knife',
            candidates: [
              { name: 'scope-knife', score: 0.98 },
              { name: 'fast-verify', score: 0.72 },
            ],
          }),
        );
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('uses the local matcher when no backend is configured', async () => {
    const outcome = await matchSkillWithBackend('verify the demo', SKILLS, {});
    assert.ok(['token', 'hybrid'].includes(outcome.source));
    assert.equal(outcome.result.skill?.frontmatter.name, 'fast-verify');
  });

  it('uses the embedding backend ranking when configured', async () => {
    const outcome = await matchSkillWithBackend('scope the verify demo', SKILLS, {
      HACKATHON_EMBED_BACKEND: baseUrl,
    });
    assert.equal(outcome.source, 'embedding');
    assert.equal(outcome.result.skill?.frontmatter.name, 'scope-knife');
    assert.equal(outcome.result.candidates[0].name, 'scope-knife');
    assert.equal(outcome.result.trace?.embeddingUsed, true);
    assert.ok(requestBodies.length >= 1);
    assert.equal(requestBodies[requestBodies.length - 1].utterance, 'scope the verify demo');
    assert.equal(requestBodies[requestBodies.length - 1].skills.length, 2);
  });

  it('does not let the backend invent a match with no local candidates', async () => {
    const outcome = await matchSkillWithBackend('anything', SKILLS, {
      HACKATHON_EMBED_BACKEND: baseUrl,
    });
    assert.notEqual(outcome.source, 'embedding');
    assert.equal(outcome.result.skill, null);
  });

  it('falls back to the local matcher when the backend is unreachable', async () => {
    const outcome = await matchSkillWithBackend('verify the demo', SKILLS, {
      HACKATHON_EMBED_BACKEND: 'http://127.0.0.1:1',
      HACKATHON_EMBED_TIMEOUT_SECONDS: '1',
    });
    assert.ok(['token', 'synonym', 'hybrid'].includes(outcome.source));
    assert.equal(outcome.result.skill?.frontmatter.name, 'fast-verify');
  });
});
