import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAllSkills } from '../dist/harness/loader.js';
import { matchSkill } from '../dist/harness/trigger.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = HERE.replace(/scripts$/, '');

const fixturePath =
  process.env.ROUTING_GOLDEN ?? join(ROOT, 'tests', 'fixtures', 'routing-golden.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const args = new Set(process.argv.slice(2));
const jsonOutput = args.has('--json');
const outPath = (() => {
  const idx = process.argv.indexOf('--out');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

const PRECISION_MIN = Number(process.env.ROUTING_PRECISION_MIN ?? 0.95);
const RECALL_MIN = Number(process.env.ROUTING_RECALL_MIN ?? 0.95);
const FPR_MAX = Number(process.env.ROUTING_FPR_MAX ?? 0.05);

const skills = loadAllSkills(ROOT);

const rows = fixture.cases.map((testCase) => {
  const result = matchSkill(testCase.utterance, skills, { trace: false });
  const actual = result.skill?.frontmatter.name ?? null;
  return {
    utterance: testCase.utterance,
    category: testCase.category ?? 'uncategorized',
    expected: testCase.expected ?? null,
    actual,
    ok: actual === (testCase.expected ?? null),
    source: result.source ?? null,
    score: Number(result.score.toFixed(3)),
    confidence: result.confidence,
    bm25: Number((result.candidates[0]?.bm25Score ?? 0).toFixed(3)),
  };
});

const positives = rows.filter((row) => row.expected !== null);
const negatives = rows.filter((row) => row.expected === null);
const truePositives = positives.filter((row) => row.actual === row.expected).length;
const falsePositives = negatives.filter((row) => row.actual !== null).length;
const falseNegatives = positives.length - truePositives;

const precision = positives.length > 0 ? truePositives / positives.length : 0;
const recall = positives.length > 0 ? truePositives / positives.length : 0;
const falsePositiveRate = negatives.length > 0 ? falsePositives / negatives.length : 0;

const byCategory = new Map();
for (const row of rows) {
  const bucket = byCategory.get(row.category) ?? {
    total: 0,
    positives: 0,
    negatives: 0,
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
  };
  bucket.total += 1;
  if (row.expected === null) {
    bucket.negatives += 1;
    if (row.actual !== null) bucket.falsePositives += 1;
  } else {
    bucket.positives += 1;
    if (row.actual === row.expected) bucket.truePositives += 1;
    else bucket.falseNegatives += 1;
  }
  byCategory.set(row.category, bucket);
}
const categoryReport = [...byCategory.entries()]
  .map(([name, b]) => ({
    name,
    total: b.total,
    positives: b.positives,
    negatives: b.negatives,
    truePositives: b.truePositives,
    falsePositives: b.falsePositives,
    falseNegatives: b.falseNegatives,
    precision: b.positives > 0 ? b.truePositives / b.positives : null,
    recall: b.positives > 0 ? b.truePositives / b.positives : null,
    falsePositiveRate: b.negatives > 0 ? b.falsePositives / b.negatives : null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const bySkill = new Map();
for (const row of positives) {
  const bucket = bySkill.get(row.expected) ?? {
    skill: row.expected,
    positives: 0,
    truePositives: 0,
    falseNegatives: 0,
    confusions: new Map(),
  };
  bucket.positives += 1;
  if (row.actual === row.expected) bucket.truePositives += 1;
  else {
    bucket.falseNegatives += 1;
    if (row.actual) {
      bucket.confusions.set(row.actual, (bucket.confusions.get(row.actual) ?? 0) + 1);
    }
  }
  bySkill.set(row.expected, bucket);
}
const skillReport = [...bySkill.entries()]
  .map(([name, b]) => ({
    skill: name,
    positives: b.positives,
    truePositives: b.truePositives,
    falseNegatives: b.falseNegatives,
    recall: b.positives > 0 ? b.truePositives / b.positives : 0,
    topConfusion:
      b.confusions.size > 0 ? [...b.confusions.entries()].sort((a, c) => c[1] - a[1])[0] : null,
  }))
  .sort((a, b) => a.skill.localeCompare(b.skill));

const failures = rows.filter((row) => !row.ok);

const report = {
  fixture: fixturePath,
  total: rows.length,
  positive: positives.length,
  negative: negatives.length,
  truePositives,
  falsePositives,
  falseNegatives,
  precision: Number(precision.toFixed(4)),
  recall: Number(recall.toFixed(4)),
  falsePositiveRate: Number(falsePositiveRate.toFixed(4)),
  thresholds: { precisionMin: PRECISION_MIN, recallMin: RECALL_MIN, fprMax: FPR_MAX },
  passed: precision >= PRECISION_MIN && recall >= RECALL_MIN && falsePositiveRate <= FPR_MAX,
  byCategory: categoryReport,
  bySkill: skillReport,
  failures: failures.map((row) => ({
    utterance: row.utterance,
    category: row.category,
    expected: row.expected,
    actual: row.actual,
    confidence: row.confidence,
    bm25: row.bm25,
  })),
};

if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const row of rows) {
    const mark = row.ok ? 'PASS' : 'FAIL';
    const expected = row.expected ?? 'no-match';
    const actual = row.actual ?? 'no-match';
    console.log(
      `${mark}  [${row.category.padEnd(11)}] ${row.utterance.padEnd(48)} expected=${expected.padEnd(20)} actual=${actual.padEnd(20)} conf=${row.confidence} bm25=${row.bm25}`,
    );
  }
  console.log();
  console.log(
    `total=${report.total}  pos=${report.positive}  neg=${report.negative}  tp=${truePositives}  fp=${falsePositives}  fn=${falseNegatives}`,
  );
  console.log(
    `precision=${(precision * 100).toFixed(1)}%  recall=${(recall * 100).toFixed(1)}%  fpr=${(falsePositiveRate * 100).toFixed(1)}%`,
  );
  console.log(
    `thresholds: precision>=${(PRECISION_MIN * 100).toFixed(0)}%  recall>=${(RECALL_MIN * 100).toFixed(0)}%  fpr<=${(FPR_MAX * 100).toFixed(0)}%`,
  );
  console.log();
  console.log('By category:');
  for (const c of categoryReport) {
    const p = c.precision === null ? '-' : (c.precision * 100).toFixed(0) + '%';
    const r = c.recall === null ? '-' : (c.recall * 100).toFixed(0) + '%';
    const f = c.falsePositiveRate === null ? '-' : (c.falsePositiveRate * 100).toFixed(0) + '%';
    console.log(
      `  ${c.name.padEnd(12)}  total=${c.total}  precision=${p.padStart(4)}  recall=${r.padStart(4)}  fpr=${f.padStart(4)}`,
    );
  }
  console.log();
  console.log('By skill (positive cases only):');
  for (const s of skillReport) {
    const conf = s.topConfusion ? `  top-confusion=${s.topConfusion[0]}(${s.topConfusion[1]})` : '';
    console.log(
      `  ${s.skill.padEnd(20)}  pos=${s.positives}  tp=${s.truePositives}  fn=${s.falseNegatives}  recall=${(s.recall * 100).toFixed(0)}%${conf}`,
    );
  }
}

const ok = precision >= PRECISION_MIN && recall >= RECALL_MIN && falsePositiveRate <= FPR_MAX;
process.exit(ok ? 0 : 1);
