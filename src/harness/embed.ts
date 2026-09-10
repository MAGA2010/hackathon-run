/**
 * embed.ts — optional pluggable semantic matcher backend.
 *
 * The default matcher (trigger.ts) is BM25 + token + synonym based and
 * runs offline with zero dependencies. Teams that want real vector
 * similarity can point `HACKATHON_EMBED_BACKEND` at an HTTP endpoint and
 * this module will POST the utterance plus the local candidate set and
 * use the returned ranking to reorder those candidates. Any transport or
 * schema failure falls back to the local matcher, so an unreachable
 * backend never breaks intent matching.
 *
 * The embedding backend is **not** the default dispatch path. It runs
 * only when HACKATHON_EMBED_BACKEND is set, and it is treated as a
 * final reranker: it only reorders the candidates the local pipeline
 * produced, never replaces them with arbitrary skills.
 *
 * Contract (see docs/architecture/skill-protocol.md):
 *   POST <backend>  { utterance, skills: [{name, description, when_to_use}] }
 *   200 response    { best: "<name>", candidates?: [{name, score}] }
 *                   (also accepts { rankings: [...] } or { best: {name, score} })
 *
 * Env:
 *   HACKATHON_EMBED_BACKEND         HTTP(S) endpoint URL (empty = disabled)
 *   HACKATHON_EMBED_TIMEOUT_SECONDS abort timeout, default 3
 */

import { matchSkill, type MatchCandidate, type MatchResult } from './trigger.js';
import type { SkillManifest } from './types.js';

export const EMBED_BACKEND_ENV = 'HACKATHON_EMBED_BACKEND';
export const EMBED_TIMEOUT_ENV = 'HACKATHON_EMBED_TIMEOUT_SECONDS';
const EMBED_CANDIDATE_LIMIT = 5;

export interface EmbedMatchOutcome {
  result: MatchResult;
  source: 'embedding' | 'token' | 'synonym' | 'hybrid';
}

interface RemoteSkill {
  name: string;
  description: string;
  when_to_use: string;
}

function scoreOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalise the many reasonable backend response shapes into a MatchResult.
 * The backend may only reorder candidates that survived the local gate.
 */
function parseReranking(
  data: unknown,
  local: MatchResult,
  byName: Map<string, SkillManifest>,
): MatchResult | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const localCandidates = local.candidates
    .filter((candidate) => candidate.score > 0)
    .slice(0, EMBED_CANDIDATE_LIMIT);
  const localByName = new Map(localCandidates.map((candidate) => [candidate.name, candidate]));

  let bestName: string | null = null;
  const candidates: Array<{ name: string; score: number }> = [];

  const rawBest = obj.best;
  if (typeof rawBest === 'string') {
    bestName = rawBest;
  } else if (rawBest && typeof rawBest === 'object') {
    bestName = String((rawBest as Record<string, unknown>).name ?? '');
  }

  const rawList = obj.candidates ?? obj.rankings ?? obj.scores ?? null;
  if (Array.isArray(rawList)) {
    for (const entry of rawList) {
      if (typeof entry === 'string') {
        candidates.push({ name: entry, score: 0 });
      } else if (entry && typeof entry === 'object') {
        const e = entry as Record<string, unknown>;
        const name = String(e.name ?? e.skill ?? '');
        if (name) candidates.push({ name, score: scoreOf(e.score) });
      }
    }
  }

  if (!bestName && candidates.length > 0) bestName = candidates[0].name;
  if (!bestName || !localByName.has(bestName)) return null;

  const requested = candidates
    .filter((candidate) => localByName.has(candidate.name))
    .filter(
      (candidate, index, all) => all.findIndex((other) => other.name === candidate.name) === index,
    );
  const bestLocal = localByName.get(bestName)!;
  const best: MatchCandidate = {
    ...bestLocal,
    score: requested.find((candidate) => candidate.name === bestName)?.score ?? bestLocal.score,
    reasons: [...bestLocal.reasons, 'embedding rerank'],
  };
  const ordered: MatchCandidate[] = [best];
  for (const candidate of requested) {
    if (candidate.name === bestName) continue;
    const existing = localByName.get(candidate.name)!;
    ordered.push({
      ...existing,
      score: candidate.score,
      reasons: [...existing.reasons, 'embedding rerank'],
    });
  }
  for (const candidate of localCandidates) {
    if (ordered.some((entry) => entry.name === candidate.name)) continue;
    ordered.push(candidate);
  }

  const skill = byName.get(bestName) ?? null;
  if (!skill) return null;

  return {
    ...local,
    skill,
    score: best.score,
    candidates: ordered,
    source: 'embedding',
    confidence: local.confidence === 'none' ? 'low' : local.confidence,
    trace: local.trace
      ? {
          ...local.trace,
          rerankReasons: [
            ...local.trace.rerankReasons,
            `embedding selected ${bestName} from ${localCandidates.length} local candidates`,
          ],
          embeddingUsed: true,
        }
      : undefined,
  };
}

export async function matchSkillWithBackend(
  utterance: string,
  skills: SkillManifest[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<EmbedMatchOutcome> {
  const backend = (env[EMBED_BACKEND_ENV] ?? '').trim();
  if (!backend) {
    const local = matchSkill(utterance, skills);
    return { result: local, source: local.source ?? (local.fallback ? 'synonym' : 'token') };
  }

  const local = matchSkill(utterance, skills, { trace: true });
  const candidates = local.candidates
    .filter((candidate) => candidate.score > 0)
    .slice(0, EMBED_CANDIDATE_LIMIT);
  if (candidates.length === 0 || candidates[0].exactPhrase) {
    return { result: local, source: local.source ?? (local.fallback ? 'synonym' : 'token') };
  }

  const timeoutSeconds = Math.max(1, Number(env[EMBED_TIMEOUT_ENV] ?? 3));
  const byName = new Map(skills.map((skill) => [skill.frontmatter.name, skill]));
  const payload = {
    utterance,
    skills: candidates.map((candidate): RemoteSkill => {
      const skill = byName.get(candidate.name)!;
      return {
        name: skill.frontmatter.name,
        description: skill.frontmatter.description,
        when_to_use: skill.frontmatter.when_to_use ?? '',
      };
    }),
  };

  try {
    const res = await fetch(backend, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
    if (!res.ok) throw new Error(`backend status ${res.status}`);
    const data: unknown = await res.json();
    const ranking = parseReranking(data, local, byName);
    if (!ranking) throw new Error('backend returned no usable reranking');
    return { result: ranking, source: 'embedding' };
  } catch {
    return { result: local, source: local.source ?? (local.fallback ? 'synonym' : 'token') };
  }
}
