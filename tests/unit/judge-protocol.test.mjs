import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildJudgeV2Request,
  computeCalibration,
  parseJudgeV2Response,
} from '../../dist/harness/judge-protocol.js';
import { calibrateJudge } from '../../dist/cli/commands/judge-calibrate.js';

function validResponse() {
  return {
    protocol: 'hackathon-run.judge.v2',
    model: 'test-judge',
    overall: 3,
    dimensions: [
      'problem_clarity',
      'originality',
      'completeness',
      'technical_depth',
      'demo_quality',
      'business_value',
      'submission_readiness',
    ].map((name, index) => ({
      name,
      score: index % 5,
      rationale: 'Rubric-based rationale.',
      evidence: [{ kind: 'test', value: 'npm test' }],
      confidence: 0.8,
    })),
  };
}

describe('judge protocol v2', () => {
  it('builds a typed request with all seven rubric dimensions', () => {
    const request = buildJudgeV2Request({ verify_was_failing: false });
    assert.equal(request.protocol, 'hackathon-run.judge.v2');
    assert.equal(request.rubric.dimensions.length, 7);
    assert.equal(request.constraints.require_evidence, true);
    assert.equal(request.evidence.verify_was_failing, false);
  });

  it('parses a valid v2 response', () => {
    const parsed = parseJudgeV2Response(validResponse());
    assert.ok(parsed);
    assert.equal(parsed.protocol, 'v2');
    assert.equal(parsed.model, 'test-judge');
    assert.equal(parsed.dimensions.length, 7);
    assert.equal(parsed.dimensions[0].confidence, 0.8);
    assert.equal(parsed.confidenceMean, 0.8);
  });

  it('rejects v2 responses without rationale, evidence, or confidence', () => {
    const missingRationale = validResponse();
    delete missingRationale.dimensions[0].rationale;
    assert.equal(parseJudgeV2Response(missingRationale), null);

    const missingConfidence = validResponse();
    delete missingConfidence.dimensions[0].confidence;
    assert.equal(parseJudgeV2Response(missingConfidence), null);

    const missingEvidence = validResponse();
    missingEvidence.dimensions[0].evidence = [];
    assert.equal(parseJudgeV2Response(missingEvidence), null);
  });

  it('computes judge calibration metrics', () => {
    const report = computeCalibration([
      {
        actual: { problem_clarity: 4, originality: 2 },
        expected: { problem_clarity: 4, originality: 3 },
      },
    ]);
    assert.equal(report.comparedPairs, 2);
    assert.equal(report.exactAgreement, 0.5);
    assert.equal(report.withinOneAgreement, 1);
    assert.equal(report.meanAbsoluteError, 0.5);
    assert.equal(report.perDimension.originality.bias, -1);
  });

  it('ships at least 20 golden calibration cases', () => {
    const golden = JSON.parse(
      readFileSync(new URL('../../tests/fixtures/judge-golden.json', import.meta.url), 'utf8'),
    );
    assert.ok(golden.cases.length >= 20);
  });

  it('runs calibration against an injected backend', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'hs-judge-calibrate-'));
    const golden = join(tmp, 'golden.json');
    try {
      writeFileSync(
        golden,
        JSON.stringify({
          cases: [
            {
              input: { verify_was_failing: false },
              expected: {
                problem_clarity: 0,
                originality: 1,
                completeness: 2,
                technical_depth: 3,
                demo_quality: 4,
                business_value: 0,
                submission_readiness: 1,
              },
            },
          ],
        }),
        'utf8',
      );
      const fakeFetch = async () => ({ ok: true, json: async () => validResponse() });
      const exitCode = await calibrateJudge(
        { golden, backend: 'http://judge.test', maxMae: 2 },
        fakeFetch,
      );
      assert.equal(exitCode, 0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
