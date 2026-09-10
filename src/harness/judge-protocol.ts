/**
 * judge-protocol.ts - typed judge-sim protocol v2 helpers.
 */

export const JUDGE_PROTOCOL_V2 = 'hackathon-run.judge.v2';

export const JUDGE_DIMENSIONS = [
  'problem_clarity',
  'originality',
  'completeness',
  'technical_depth',
  'demo_quality',
  'business_value',
  'submission_readiness',
] as const;

export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];

export interface JudgeV2Dimension {
  name: JudgeDimension;
  description: string;
  anchors: Record<'0' | '3' | '5', string>;
}

export interface JudgeEvidence {
  plan?: unknown;
  demo?: unknown;
  verify?: unknown;
  verify_was_failing: boolean;
}

export interface JudgeV2Request {
  protocol: typeof JUDGE_PROTOCOL_V2;
  request_id: string;
  task: 'judge-sim';
  rubric: {
    scale: { min: 0; max: 5 };
    dimensions: JudgeV2Dimension[];
  };
  evidence: JudgeEvidence;
  constraints: {
    require_evidence: true;
    require_rationale: true;
    require_confidence: true;
    cap_on_verify_failure: true;
  };
}

export interface JudgeV2Response {
  protocol: typeof JUDGE_PROTOCOL_V2;
  request_id?: string;
  model?: string;
  generated_at?: string;
  dimensions: Array<{
    name: string;
    score: number;
    rationale: string;
    evidence?: Array<{ kind: string; value: string }>;
    confidence: number;
    judge_questions?: string[];
    improvements?: string[];
  }>;
  overall: number;
}

const DIMENSION_DEFINITIONS: Record<JudgeDimension, JudgeV2Dimension> = {
  problem_clarity: {
    name: 'problem_clarity',
    description: 'Is the pain obvious in 10 seconds, and is the target user clear?',
    anchors: {
      '0': 'The problem and target user are not stated.',
      '3': 'The problem is understandable but the user or urgency is vague.',
      '5': 'A stranger immediately understands the pain, user, and why it matters.',
    },
  },
  originality: {
    name: 'originality',
    description: 'Is this novel or differentiated against existing solutions?',
    anchors: {
      '0': 'No comparison or differentiation is supplied.',
      '3': 'The idea differs somewhat but the comparison is generic.',
      '5': 'A specific existing alternative and a concrete difference are supplied.',
    },
  },
  completeness: {
    name: 'completeness',
    description: 'Does the demo path actually run end-to-end with evidence?',
    anchors: {
      '0': 'No verification evidence exists.',
      '3': 'The path partially runs or only manual evidence exists.',
      '5': 'Machine-checkable evidence confirms the whole demo path.',
    },
  },
  technical_depth: {
    name: 'technical_depth',
    description: 'Is there at least one non-obvious technical decision?',
    anchors: {
      '0': 'No engineering decision or tradeoff is explained.',
      '3': 'A decision is named but the tradeoff is shallow.',
      '5': 'A hard decision, tradeoff, and fallback are clearly explained.',
    },
  },
  demo_quality: {
    name: 'demo_quality',
    description: 'Is the pitch tight, sequenced, and rehearsed?',
    anchors: {
      '0': 'No pitch or timing evidence exists.',
      '3': 'A pitch exists but lacks a timed or rehearsed run.',
      '5': 'A timed script and rehearsal evidence are present.',
    },
  },
  business_value: {
    name: 'business_value',
    description: 'Would a beachhead user pay or use this?',
    anchors: {
      '0': 'No user or willingness-to-pay claim is supplied.',
      '3': 'A user segment is named but value evidence is weak.',
      '5': 'The beachhead user, use case, and value are concrete.',
    },
  },
  submission_readiness: {
    name: 'submission_readiness',
    description: 'Can a stranger clone, run, and review the submission safely?',
    anchors: {
      '0': 'README, run steps, or secret hygiene are missing.',
      '3': 'The submission is mostly runnable but has known gaps.',
      '5': 'Clean-clone evidence, documentation, and secret scan are supplied.',
    },
  },
};

export function buildJudgeV2Request(
  evidence: JudgeEvidence,
  requestId = crypto.randomUUID(),
): JudgeV2Request {
  return {
    protocol: JUDGE_PROTOCOL_V2,
    request_id: requestId,
    task: 'judge-sim',
    rubric: {
      scale: { min: 0, max: 5 },
      dimensions: JUDGE_DIMENSIONS.map((name) => DIMENSION_DEFINITIONS[name]),
    },
    evidence,
    constraints: {
      require_evidence: true,
      require_rationale: true,
      require_confidence: true,
      cap_on_verify_failure: true,
    },
  };
}

export interface NormalizedJudgeResponse {
  protocol: 'v1' | 'v2';
  model: string | null;
  overall: number;
  confidenceMean: number | null;
  dimensions: Array<{
    name: JudgeDimension;
    score: number;
    rationale: string;
    confidence: number | null;
    evidence: Array<{ kind: string; value: string }>;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseJudgeV2Response(data: unknown): NormalizedJudgeResponse | null {
  if (!isRecord(data) || data.protocol !== JUDGE_PROTOCOL_V2) return null;
  if (!Array.isArray(data.dimensions) || data.dimensions.length !== JUDGE_DIMENSIONS.length) {
    return null;
  }

  const byName = new Map<string, unknown>();
  for (const item of data.dimensions) {
    if (!isRecord(item) || typeof item.name !== 'string') return null;
    byName.set(item.name, item);
  }

  const dimensions: NormalizedJudgeResponse['dimensions'] = [];
  for (const name of JUDGE_DIMENSIONS) {
    const item = byName.get(name);
    if (!isRecord(item)) return null;
    const score = Number(item.score);
    const confidence = Number(item.confidence);
    const rationale = String(item.rationale ?? item.deduction_reason ?? '').trim();
    const evidence = Array.isArray(item.evidence)
      ? item.evidence
          .filter(isRecord)
          .map((entry) => ({
            kind: String(entry.kind ?? 'manual'),
            value: String(entry.value ?? ''),
          }))
          .filter((entry) => entry.value)
      : [];
    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 5 ||
      !rationale ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      return null;
    }
    dimensions.push({
      name,
      score,
      rationale,
      confidence,
      evidence,
    });
  }

  const overall = Number(data.overall);
  const overallValue = Number.isFinite(overall)
    ? overall
    : dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length;
  const confidenceValues = dimensions
    .map((dimension) => dimension.confidence)
    .filter((value): value is number => value !== null);
  return {
    protocol: 'v2',
    model: typeof data.model === 'string' && data.model ? data.model : null,
    overall: overallValue,
    confidenceMean:
      confidenceValues.length > 0
        ? Number(
            (
              confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
            ).toFixed(3),
          )
        : null,
    dimensions,
  };
}

export interface CalibrationCase {
  id?: string;
  actual: Partial<Record<JudgeDimension, number>>;
  expected: Partial<Record<JudgeDimension, number>>;
}

export interface CalibrationReport {
  cases: number;
  comparedPairs: number;
  meanAbsoluteError: number;
  exactAgreement: number;
  withinOneAgreement: number;
  perDimension: Record<string, { pairs: number; mae: number; bias: number }>;
}

export function computeCalibration(cases: CalibrationCase[]): CalibrationReport {
  let pairCount = 0;
  let absoluteError = 0;
  let exact = 0;
  let withinOne = 0;
  const perDimension: Record<string, { pairs: number; mae: number; bias: number }> = {};

  for (const testCase of cases) {
    for (const name of JUDGE_DIMENSIONS) {
      const actual = testCase.actual[name];
      const expected = testCase.expected[name];
      if (actual == null || expected == null) continue;
      const error = Math.abs(actual - expected);
      pairCount++;
      absoluteError += error;
      if (error === 0) exact++;
      if (error <= 1) withinOne++;
      const bucket = perDimension[name] ?? { pairs: 0, mae: 0, bias: 0 };
      bucket.pairs++;
      bucket.mae += error;
      bucket.bias += actual - expected;
      perDimension[name] = bucket;
    }
  }

  for (const bucket of Object.values(perDimension)) {
    bucket.mae = bucket.pairs > 0 ? bucket.mae / bucket.pairs : 0;
    bucket.bias = bucket.pairs > 0 ? bucket.bias / bucket.pairs : 0;
  }

  return {
    cases: cases.length,
    comparedPairs: pairCount,
    meanAbsoluteError: pairCount > 0 ? absoluteError / pairCount : 0,
    exactAgreement: pairCount > 0 ? exact / pairCount : 0,
    withinOneAgreement: pairCount > 0 ? withinOne / pairCount : 0,
    perDimension,
  };
}
