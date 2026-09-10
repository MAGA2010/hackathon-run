/**
 * verification.ts - synchronize fast-verify evidence into the plan contract.
 *
 * A demo step can declare which feature owns it with `demo_path[].feature`.
 * When all executable steps owned by a feature pass, that feature is marked
 * `passes: true`. A failure or skipped step resets it to false. Older plans
 * without explicit ownership fall back to the active sprint or the only
 * unpassed KEEP feature.
 */

import { readState, writeState } from './state.js';
import { readSprint } from './sprint.js';
import { appendTrace } from './trace.js';
import { computeWorkspaceDigest } from './workspace.js';

export type VerificationStatus = 'pass' | 'fail' | 'partial' | 'skipped';
export type VerificationStepStatus = 'pass' | 'fail' | 'skip';
export type VerificationEvidenceKind = 'command' | 'url' | 'test' | 'browser' | 'manual' | 'log';

export interface VerificationStep {
  step: number;
  action?: string;
  command?: string;
  expected_outcome?: string;
  actual_outcome?: string;
  status: VerificationStepStatus;
  error_signature?: string;
  exit_code?: number;
  stdout_sha256?: string;
  stderr_sha256?: string;
  cwd?: string;
  started_at?: string;
  finished_at?: string;
}

export interface VerificationFile {
  version?: string;
  started_at?: string;
  finished_at?: string;
  workspace_digest?: string;
  status: VerificationStatus;
  steps: VerificationStep[];
}

interface PlanEvidence {
  kind: VerificationEvidenceKind;
  value: string;
  at?: string;
  source?: 'fast-verify' | 'evaluator' | 'manual';
  status?: 'pass' | 'fail' | 'stale';
  exit_code?: number;
  source_digest?: string;
  output_digest?: string;
  stale?: boolean;
}

interface PlanDemoStep {
  step?: number;
  action?: string;
  expected_outcome?: string;
  feature?: string;
}

interface PlanFeature {
  name?: string;
  classification?: string;
  passes?: boolean;
  evidence?: PlanEvidence[];
  last_verified_at?: string;
}

interface PlanFile {
  features?: PlanFeature[];
  demo_path?: PlanDemoStep[];
}

export interface VerificationSyncUpdate {
  feature: string;
  passes: boolean;
  steps: number[];
  evidenceCount: number;
  stale: boolean;
}

export interface VerificationSyncResult {
  synced: boolean;
  reason?: string;
  updates: VerificationSyncUpdate[];
}

function stepNumber(step: PlanDemoStep | VerificationStep, index: number): number {
  return step.step ?? index + 1;
}

function normalizedFeature(value: string | undefined): string | null {
  const feature = value?.trim();
  return feature ? feature : null;
}

function ownerForStep(
  demoStep: PlanDemoStep,
  featureNames: Set<string>,
  fallbackFeature: string | null,
): string | null {
  const explicit = normalizedFeature(demoStep.feature);
  if (explicit && featureNames.has(explicit)) return explicit;
  return fallbackFeature;
}

function evidenceForStep(
  step: VerificationStep,
  at: string,
  sourceDigest: string | undefined,
  stale: boolean,
): PlanEvidence {
  if (stale) {
    return {
      kind: 'log',
      value: `fast-verify step ${step.step} stale: source changed since verification`,
      at,
      source: 'fast-verify',
      status: 'stale',
      source_digest: sourceDigest,
      stale: true,
    };
  }

  if (step.status === 'pass') {
    return {
      kind: 'command',
      value: step.command?.trim() || `fast-verify step ${step.step} passed`,
      at,
      source: 'fast-verify',
      status: 'pass',
      ...(step.exit_code != null ? { exit_code: step.exit_code } : {}),
      ...(sourceDigest ? { source_digest: sourceDigest } : {}),
      ...(step.stdout_sha256 ? { output_digest: step.stdout_sha256 } : {}),
    };
  }

  const detail =
    step.error_signature?.trim() ||
    step.actual_outcome?.trim() ||
    (step.status === 'skip' ? 'no executable verification command' : 'verification failed');
  return {
    kind: 'log',
    value: `fast-verify step ${step.step} ${step.status}: ${detail}`,
    at,
    source: 'fast-verify',
    status: 'fail',
    ...(step.exit_code != null ? { exit_code: step.exit_code } : {}),
    ...(sourceDigest ? { source_digest: sourceDigest } : {}),
  };
}

/**
 * Apply the latest verify.json result to plan.features[].passes.
 *
 * The operation is idempotent for a given verify.json: older fast-verify
 * evidence is replaced while evaluator/manual evidence is preserved.
 */
export function syncVerificationToPlan(cwd: string): VerificationSyncResult {
  const verification = readState<VerificationFile>({ repoRoot: cwd, file: 'verify.json' });
  const plan = readState<PlanFile>({ repoRoot: cwd, file: 'plan.json' });

  if (!verification) {
    return { synced: false, reason: 'verify.json is missing', updates: [] };
  }
  if (!plan || !Array.isArray(plan.features) || !Array.isArray(plan.demo_path)) {
    return { synced: false, reason: 'plan.json is missing or invalid', updates: [] };
  }

  const features = plan.features.filter(
    (feature): feature is PlanFeature & { name: string } =>
      typeof feature.name === 'string' && feature.name.length > 0,
  );
  const featureNames = new Set(features.map((feature) => feature.name));
  const verificationByStep = new Map(
    verification.steps.map((step, index) => [stepNumber(step, index), step]),
  );
  const currentDigest = verification.workspace_digest ? computeWorkspaceDigest(cwd) : undefined;
  const stale = Boolean(
    verification.workspace_digest &&
    currentDigest &&
    verification.workspace_digest !== currentDigest,
  );

  const explicitOwners = new Set(
    plan.demo_path
      .map((step) => normalizedFeature(step.feature))
      .filter((feature): feature is string => feature !== null && featureNames.has(feature)),
  );

  let fallbackFeature: string | null = null;
  if (explicitOwners.size === 0) {
    const sprint = readSprint(cwd);
    if (sprint && featureNames.has(sprint.feature)) {
      fallbackFeature = sprint.feature;
    } else {
      const unpassedKeep = features.filter(
        (feature) => feature.classification === 'KEEP' && feature.passes !== true,
      );
      if (unpassedKeep.length === 1) fallbackFeature = unpassedKeep[0]?.name ?? null;
    }
  }

  const ownedSteps = new Map<string, number[]>();
  for (let index = 0; index < plan.demo_path.length; index += 1) {
    const demoStep = plan.demo_path[index];
    if (!demoStep) continue;
    const owner = ownerForStep(demoStep, featureNames, fallbackFeature);
    if (!owner) continue;
    const numbers = ownedSteps.get(owner) ?? [];
    numbers.push(stepNumber(demoStep, index));
    ownedSteps.set(owner, numbers);
  }

  const now = verification.finished_at ?? new Date().toISOString();
  const updates: VerificationSyncUpdate[] = [];
  for (const feature of features) {
    const numbers = ownedSteps.get(feature.name);
    if (!numbers || numbers.length === 0) continue;

    const results = numbers
      .map((number) => verificationByStep.get(number))
      .filter((step): step is VerificationStep => step !== undefined);
    if (results.length === 0) continue;

    const passes =
      !stale &&
      results.length === numbers.length &&
      results.every((step) => step.status === 'pass');
    const nextEvidence = results.map((step) =>
      evidenceForStep(step, now, verification.workspace_digest, stale),
    );
    const previousEvidence = feature.evidence ?? [];
    const preservedEvidence = previousEvidence.filter(
      (evidence) => evidence.source !== 'fast-verify',
    );
    const evidence = [...preservedEvidence, ...nextEvidence];
    feature.passes = passes;
    feature.evidence = evidence;
    if (!stale) feature.last_verified_at = now;
    updates.push({
      feature: feature.name,
      passes,
      steps: numbers,
      evidenceCount: nextEvidence.length,
      stale,
    });
  }

  if (updates.length > 0) {
    writeState({ repoRoot: cwd, file: 'plan.json', data: plan });
  }

  for (const update of updates) {
    appendTrace(cwd, {
      type: 'feature.verification.synced',
      actor: 'cli',
      skill: 'fast-verify',
      status: update.passes ? 'ok' : 'warn',
      summary: update.stale
        ? `${update.feature} verification became stale`
        : `${update.feature} verification ${update.passes ? 'passed' : 'failed'}`,
      data: {
        feature: update.feature,
        passes: update.passes,
        steps: update.steps,
        evidence_count: update.evidenceCount,
        stale: update.stale,
        workspace_digest: verification.workspace_digest ?? null,
      },
    });
  }

  return {
    synced: updates.length > 0,
    reason: updates.length === 0 ? 'no demo steps map to a plan feature' : undefined,
    updates,
  };
}
