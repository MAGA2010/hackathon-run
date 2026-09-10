/**
 * judge-calibrate.ts - measure an LLM judge backend against a golden set.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildJudgeV2Request,
  computeCalibration,
  JUDGE_DIMENSIONS,
  parseJudgeV2Response,
  type JudgeEvidence,
} from '../../harness/judge-protocol.js';
import { c } from '../lib/colors.js';

export interface JudgeCalibrateOptions {
  golden: string;
  backend: string;
  timeoutSeconds?: number;
  maxMae?: number;
  json?: boolean;
  out?: string;
}

interface GoldenFile {
  version?: number;
  cases: Array<{
    id?: string;
    input: JudgeEvidence;
    expected: Record<string, number>;
  }>;
}

function readGolden(path: string): GoldenFile {
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8')) as GoldenFile;
  if (!Array.isArray(raw.cases) || raw.cases.length === 0) {
    throw new Error('golden file must contain a non-empty cases array');
  }
  return raw;
}

export async function calibrateJudge(
  opts: JudgeCalibrateOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const golden = readGolden(opts.golden);
  const timeout = Math.max(1, opts.timeoutSeconds ?? 10) * 1000;
  const actualCases: Array<{
    actual: Record<string, number>;
    expected: Record<string, number>;
  }> = [];

  for (const testCase of golden.cases) {
    const request = buildJudgeV2Request(testCase.input);
    const response = await fetchImpl(opts.backend, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(`judge backend returned ${response.status}`);
    const parsed = parseJudgeV2Response(await response.json());
    if (!parsed) throw new Error('judge backend returned an invalid v2 response');
    const actual = Object.fromEntries(
      parsed.dimensions.map((dimension) => [dimension.name, dimension.score]),
    );
    actualCases.push({
      actual,
      expected: Object.fromEntries(
        JUDGE_DIMENSIONS.filter((name) => testCase.expected[name] != null).map((name) => [
          name,
          Number(testCase.expected[name]),
        ]),
      ),
    });
  }

  const report = computeCalibration(actualCases);
  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log(c.bold('hackathon judge calibration'));
    console.log(`cases=${report.cases} pairs=${report.comparedPairs}`);
    console.log(`mae=${report.meanAbsoluteError.toFixed(3)}`);
    console.log(
      `exact=${(report.exactAgreement * 100).toFixed(1)}% within-one=${(report.withinOneAgreement * 100).toFixed(1)}%`,
    );
    for (const [name, value] of Object.entries(report.perDimension)) {
      console.log(
        `  ${name.padEnd(24)} mae=${value.mae.toFixed(3)} bias=${value.bias >= 0 ? '+' : ''}${value.bias.toFixed(3)}`,
      );
    }
  }

  if (opts.out) {
    writeFileSync(resolve(opts.out), JSON.stringify(report, null, 2) + '\n', 'utf8');
  }

  const maxMae = opts.maxMae ?? 1;
  return report.meanAbsoluteError <= maxMae ? 0 : 1;
}

export function judgeCalibrate(opts: JudgeCalibrateOptions): Promise<number> {
  return calibrateJudge(opts).catch((error: unknown) => {
    process.stderr.write(`judge-calibrate failed: ${(error as Error).message}\n`);
    return 2;
  });
}
