// tests/unit/state.test.mjs
// Unit tests for readState/writeState Ajv-validated JSON state files.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sep } from 'node:path';

import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

import { writeState, readState, defaultSchemaPath } from '../../dist/harness/state.js';
import { validate as validateStateDir } from '../../dist/cli/commands/validate.js';

let tmp;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'hs-state-'));
});
after(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

const repoRoot = process.cwd();

const validPlan = () => ({
  version: '1.0',
  generated_at: new Date().toISOString(),
  demo_goal: 'demo goal here',
  time_remaining_minutes: 60,
  features: [
    {
      name: 'f1',
      status: 'implemented',
      classification: 'KEEP',
      rationale: 'core',
      time_estimate_minutes: 30,
    },
    {
      name: 'f2',
      status: 'unimplemented',
      classification: 'CUT',
      rationale: 'out of scope',
      time_estimate_minutes: 120,
    },
  ],
  demo_path: [
    { step: 1, action: 'Open the app', expected_outcome: 'Loads' },
    { step: 2, action: 'Sign up', expected_outcome: 'Account created' },
  ],
  next_tasks: [{ priority: 'P0', task: 'Finish signup', estimate_minutes: 30 }],
});

const validVerify = () => ({
  version: '1.0',
  started_at: new Date().toISOString(),
  status: 'pass',
  steps: [{ step: 1, action: 'Open the app', status: 'pass', duration_seconds: 1.2 }],
});

describe('defaultSchemaPath', () => {
  it('maps plan.json to plan.schema.json (cross-platform)', () => {
    const p = defaultSchemaPath(repoRoot, 'plan.json');
    assert.ok(
      p.endsWith(normalize('src/state/schemas/plan.schema.json')),
      'expected to end with src/state/schemas/plan.schema.json, got ' + p,
    );
  });

  it('maps recovery.json to recovery.schema.json', () => {
    const p = defaultSchemaPath(repoRoot, 'recovery.json');
    assert.ok(p.endsWith(normalize('src/state/schemas/recovery.schema.json')));
  });

  it('strips any extension when computing the stem', () => {
    const p = defaultSchemaPath(repoRoot, 'weird.filename.json');
    assert.ok(p.endsWith(normalize('src/state/schemas/weird.filename.schema.json')));
  });

  it('falls back to the bundled package schemas outside the source tree', () => {
    const outside = mkdtempSync(join(tmpdir(), 'hs-state-outside-'));
    try {
      const p = defaultSchemaPath(outside, 'plan.json');
      assert.ok(existsSync(p), 'expected the bundled plan.schema.json to exist');
      assert.ok(p.endsWith(normalize('src/state/schemas/plan.schema.json')));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('readState / writeState', () => {
  it('round-trips a valid plan.json through Ajv', () => {
    const written = writeState({ repoRoot, file: 'plan.json', data: validPlan() });
    assert.ok(written.endsWith('plan.json'));
    assert.ok(existsSync(written));

    const raw = readFileSync(written, 'utf-8');
    assert.ok(JSON.parse(raw).features.length === 2);

    const back = readState({ repoRoot, file: 'plan.json' });
    assert.ok(back);
    assert.equal(back.demo_goal, 'demo goal here');
    assert.equal(back.features.length, 2);
  });

  it('writes state into a project that does not have src/state/schemas', () => {
    const outside = mkdtempSync(join(tmpdir(), 'hs-state-write-outside-'));
    try {
      const written = writeState({ repoRoot: outside, file: 'plan.json', data: validPlan() });
      assert.ok(existsSync(written));
      assert.ok(JSON.parse(readFileSync(written, 'utf8')).demo_goal === 'demo goal here');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('validate command falls back to bundled schemas outside the source tree', () => {
    const outside = mkdtempSync(join(tmpdir(), 'hs-validate-outside-'));
    try {
      writeState({ repoRoot: outside, file: 'plan.json', data: validPlan() });
      const origLog = console.log;
      const origErr = console.error;
      console.log = () => {};
      console.error = () => {};
      try {
        assert.equal(validateStateDir(join(outside, '.hackathon', 'state')), 0);
      } finally {
        console.log = origLog;
        console.error = origErr;
      }
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects plan.json missing required fields', () => {
    assert.throws(
      () => writeState({ repoRoot, file: 'plan.json', data: { demo_goal: 'x' } }),
      /state validation failed/,
    );
  });

  it('rejects plan.json with bad classification enum', () => {
    assert.throws(
      () =>
        writeState({
          repoRoot,
          file: 'plan.json',
          data: {
            version: '1.0',
            generated_at: new Date().toISOString(),
            demo_goal: 'x',
            time_remaining_minutes: 30,
            features: [
              { name: 'f', status: 'implemented', classification: 'MAYBE', rationale: 'r' },
            ],
            demo_path: [],
            next_tasks: [],
          },
        }),
      /state validation failed/,
    );
  });

  it('rejects plan.json with wrong version', () => {
    const d = validPlan();
    d.version = '2.0';
    assert.throws(
      () => writeState({ repoRoot, file: 'plan.json', data: d }),
      /state validation failed/,
    );
  });

  it('rejects extra (additionalProperties=false) fields', () => {
    const d = { ...validPlan(), secret_field: 'nope' };
    assert.throws(
      () => writeState({ repoRoot, file: 'plan.json', data: d }),
      /state validation failed/,
    );
  });

  it('readState returns null when file is missing', () => {
    const r = readState({ repoRoot, file: 'no-such-file.json' });
    assert.equal(r, null);
  });

  it('readState throws on schema-invalid existing file', () => {
    const path = join(repoRoot, '.hackathon', 'state', 'verify.json');
    mkdirSync(join(repoRoot, '.hackathon', 'state'), { recursive: true });
    writeFileSync(path, JSON.stringify({ totally: 'wrong' }));
    try {
      assert.throws(() => readState({ repoRoot, file: 'verify.json' }), /failed schema validation/);
    } finally {
      unlinkSync(path);
    }
  });

  it('validates verify.json with steps array of pass/fail', () => {
    writeState({ repoRoot, file: 'verify.json', data: validVerify() });
    const back = readState({ repoRoot, file: 'verify.json' });
    assert.equal(back.status, 'pass');
    assert.equal(back.steps.length, 1);
    assert.equal(back.steps[0].step, 1);
  });

  it('rejects verify.json with bad status enum', () => {
    const d = validVerify();
    d.status = 'maybe';
    assert.throws(
      () => writeState({ repoRoot, file: 'verify.json', data: d }),
      /state validation failed/,
    );
  });
});
