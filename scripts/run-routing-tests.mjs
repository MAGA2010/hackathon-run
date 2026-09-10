import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadAllSkills } from '../dist/harness/loader.js';
import { matchSkill } from '../dist/harness/trigger.js';

const root = process.cwd();
const fixture = JSON.parse(
  readFileSync(join(root, 'tests', 'fixtures', 'routing-golden.json'), 'utf8'),
);
const skills = loadAllSkills(root);

const rows = fixture.cases.map((testCase) => {
  const result = matchSkill(testCase.utterance, skills);
  const actual = result.skill?.frontmatter.name ?? null;
  return {
    utterance: testCase.utterance,
    expected: testCase.expected,
    actual,
    ok: actual === testCase.expected,
    source: result.source ?? null,
    score: result.score,
  };
});

const positives = rows.filter((row) => row.expected !== null);
const negatives = rows.filter((row) => row.expected === null);
const truePositives = positives.filter((row) => row.actual === row.expected).length;
const falsePositives = negatives.filter((row) => row.actual !== null).length;
const precision = positives.length > 0 ? truePositives / positives.length : 0;
const recall = positives.length > 0 ? truePositives / positives.length : 0;
const falsePositiveRate = negatives.length > 0 ? falsePositives / negatives.length : 0;

for (const row of rows) {
  const mark = row.ok ? 'PASS' : 'FAIL';
  const expected = row.expected ?? 'no-match';
  const actual = row.actual ?? 'no-match';
  console.log(`${mark}  ${row.utterance.padEnd(48)} expected=${expected.padEnd(16)} actual=${actual}`);
}

const report = {
  total: rows.length,
  positive: positives.length,
  negative: negatives.length,
  truePositives,
  falsePositives,
  precision,
  recall,
  falsePositiveRate,
};

console.log(JSON.stringify(report, null, 2));

const ok = precision >= 0.95 && recall >= 0.95 && falsePositiveRate === 0;
process.exit(ok ? 0 : 1);
