// tests/unit/v120-manifest.test.mjs
// Tests for v1.2.0 optional third-party manifest fields
// (license, author, homepage, repository, compatibility).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseFrontmatter } from '../../dist/harness/frontmatter.js';
import { search as skillsSearch } from '../../dist/cli/commands/skills-search.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = HERE.replace(/tests[\\/]unit.*$/, '');

function captureJson(fn) {
  const captured = [];
  const orig = console.log;
  console.log = (...a) => captured.push(a.join(' '));
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return JSON.parse(captured.join('\n'));
}

describe('v1.2 manifest parser', () => {
  it('preserves license, compatibility, author, homepage, repository', () => {
    const md = [
      '---',
      'name: third-party-tool',
      'description: Detects the best tool.',
      'license: Apache-2.0',
      'compatibility: Requires Node 20+',
      'author: acme-org',
      'homepage: https://example.com/tool',
      'repository: acme-org/tool',
      '---',
      'body',
    ].join('\n');
    const r = parseFrontmatter(md);
    assert.equal(r.frontmatter.license, 'Apache-2.0');
    assert.equal(r.frontmatter.compatibility, 'Requires Node 20+');
    assert.equal(r.frontmatter.author, 'acme-org');
    assert.equal(r.frontmatter.homepage, 'https://example.com/tool');
    assert.equal(r.frontmatter.repository, 'acme-org/tool');
  });

  it('leaves manifest fields undefined when absent', () => {
    const md = '---\nname: foo\ndescription: A test.\n---\nbody';
    const r = parseFrontmatter(md);
    assert.equal(r.frontmatter.license, undefined);
    assert.equal(r.frontmatter.compatibility, undefined);
    assert.equal(r.frontmatter.author, undefined);
    assert.equal(r.frontmatter.homepage, undefined);
    assert.equal(r.frontmatter.repository, undefined);
  });
});

describe('v1.2 manifest validation', () => {
  it('warns when third-party manifest fields are missing', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'hs-v120-'));
    try {
      writeFileSync(
        join(dir, 'SKILL.md'),
        [
          '---',
          'name: bare-skill',
          'description: Forces a thing.',
          '---',
          '# bare-skill',
          '',
          '## Input contract',
          'x',
          '## Execution',
          'x',
          '## Output contract',
          'x',
          '## Acceptance criteria',
          'x',
          '## Failure modes',
          'x',
        ].join('\n'),
      );
      const { validateSkill } = await import('../../dist/cli/commands/validate-skill.js');
      const captured = [];
      const orig = console.log;
      console.log = (...a) => captured.push(a.join(' '));
      try {
        validateSkill({ target: dir, cwd: REPO });
      } finally {
        console.log = orig;
      }
      const joined = captured.join('\n');
      assert.match(joined, /missing optional manifest field: license/);
      assert.match(joined, /missing optional manifest field: author/);
      assert.match(joined, /missing optional manifest field: homepage/);
      assert.match(joined, /missing optional manifest field: repository/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns on malformed homepage / repository and overlong compatibility', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'hs-v120-'));
    try {
      writeFileSync(
        join(dir, 'SKILL.md'),
        [
          '---',
          'name: malformed-skill',
          'description: Forces a thing.',
          'license: MIT',
          'author: acme',
          'homepage: not-a-url',
          'repository: just text',
          'compatibility: ' + 'x'.repeat(501),
          '---',
          '# malformed-skill',
          '',
          '## Input contract',
          'x',
          '## Execution',
          'x',
          '## Output contract',
          'x',
          '## Acceptance criteria',
          'x',
          '## Failure modes',
          'x',
        ].join('\n'),
      );
      const { validateSkill } = await import('../../dist/cli/commands/validate-skill.js');
      const captured = [];
      const orig = console.log;
      console.log = (...a) => captured.push(a.join(' '));
      try {
        validateSkill({ target: dir, cwd: REPO });
      } finally {
        console.log = orig;
      }
      const joined = captured.join('\n');
      assert.match(joined, /homepage "not-a-url" does not look like a URL/);
      assert.match(joined, /repository "just text" does not look like a URL or owner\/repo/);
      assert.match(joined, /compatibility exceeds 500 chars \(501\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts full URL and SCP-style repository values', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'hs-v120-url-'));
    try {
      const { validateSkill } = await import('../../dist/cli/commands/validate-skill.js');
      const good = [
        'https://github.com/org/repo',
        'git@github.com:org/repo',
        'ssh://git@github.com/org/repo',
        'org/repo',
      ];
      for (const repository of good) {
        writeFileSync(
          join(dir, 'SKILL.md'),
          [
            '---',
            'name: url-skill',
            'description: Forces a thing.',
            'license: MIT',
            'author: acme',
            'homepage: https://example.com',
            `repository: ${repository}`,
            '---',
            '# url-skill',
            '',
            '## Input contract',
            'x',
            '## Execution',
            'x',
            '## Output contract',
            'x',
            '## Acceptance criteria',
            'x',
            '## Failure modes',
            'x',
          ].join('\n'),
        );
        const captured = [];
        const orig = console.log;
        console.log = (...a) => captured.push(a.join(' '));
        try {
          validateSkill({ target: dir, cwd: REPO });
        } finally {
          console.log = orig;
        }
        const joined = captured.join('\n');
        assert.doesNotMatch(joined, /does not look like a URL or owner\/repo/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('skills search --json manifest surface', () => {
  it('emits author/license/homepage/repository/compatibility (null for bundled)', () => {
    const json = captureJson(() => skillsSearch({ cwd: REPO, json: true, category: 'scoping' }));
    assert.ok(json.skills.length >= 1);
    for (const s of json.skills) {
      assert.ok('author' in s);
      assert.ok('license' in s);
      assert.ok('homepage' in s);
      assert.ok('repository' in s);
      assert.ok('compatibility' in s);
      assert.equal(s.author, null);
      assert.equal(s.license, null);
      assert.equal(s.homepage, null);
      assert.equal(s.repository, null);
      assert.equal(s.compatibility, null);
    }
  });
});

describe('find_skills MCP manifest surface', () => {
  it('surfaces manifest keys over JSON-RPC', async () => {
    const server = join(REPO, 'dist', 'mcp', 'server.js');
    const response = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [server], { cwd: REPO });
      const responses = [];
      let buf = '';
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        reject(new Error('timeout'));
      }, 15000);
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
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', () => {
        clearTimeout(timer);
        resolve(responses);
      });
      child.stdin.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'find_skills', arguments: { category: 'scoping' } },
        }) + '\n',
      );
    });
    assert.equal(response.length, 1);
    const payload = JSON.parse(response[0].result.content[0].text);
    assert.ok(payload.skills.length >= 1);
    for (const s of payload.skills) {
      assert.ok('author' in s);
      assert.ok('license' in s);
      assert.ok('homepage' in s);
      assert.ok('repository' in s);
      assert.ok('compatibility' in s);
    }
  });
});
