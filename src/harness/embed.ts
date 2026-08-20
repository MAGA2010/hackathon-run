/**
 * embed.ts — optional pluggable semantic matcher backend.
 *
 * The default matcher (trigger.ts) is token + synonym based and runs
 * offline with zero dependencies. Teams that want real vector similarity
 * can point `HACKATHON_EMBED_BACKEND` at an HTTP endpoint and this module
 * will POST the utterance + skill descriptions and use the returned
 * ranking instead. Any transport or schema failure falls back to the
 * local matcher, so an unreachable backend never breaks intent matching.
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

import { matchSkill, type MatchResult } from './trigger.js';
import type { SkillManifest } from './types.js';

export const EMBED_BACKEND_ENV = 'HACKATHON_EMBED_BACKEND';
export const EMBED_TIMEOUT_ENV = 'HACKATHON_EMBED_TIMEOUT_SECONDS';

export interface EmbedMatchOutcome {
  result: MatchResult;
  source: 'embedding' | 'token' | 'synonym';
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
 * Returns null when the response does not name a known skill.
 */
function parseRanking(data: unknown, skills: SkillManifest[]): MatchResult | null {
  if (!data || typeof data !== 'object') return null;
  const byName = new Map(skills.map((s) => [s.frontmatter.name, s]));
  const obj = data as Record<string, unknown>;

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
  if (!bestName || !byName.has(bestName)) return null;

  const skill = byName.get(bestName)!;
  const ranked = candidates
    .filter((c) => byName.has(c.name))
    .map((c) => ({
      name: c.name,
      score: c.score,
      reasons: ['embedding backend'],
    }));
  const best = ranked.find((c) => c.name === bestName) ?? {
    name: bestName,
    score: 0,
    reasons: ['embedding backend'],
  };
  const ordered = [best, ...ranked.filter((c) => c.name !== bestName)];

  return {
    skill,
    score: best.score,
    candidates: ordered,
    source: 'embedding',
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

  const timeoutSeconds = Math.max(1, Number(env[EMBED_TIMEOUT_ENV] ?? 3));
  const payload = {
    utterance,
    skills: skills.map((s): RemoteSkill => ({
      name: s.frontmatter.name,
      description: s.frontmatter.description,
      when_to_use: s.frontmatter.when_to_use ?? '',
    })),
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
    const ranking = parseRanking(data, skills);
    if (!ranking) throw new Error('backend returned no usable ranking');
    return { result: ranking, source: 'embedding' };
  } catch {
    const local = matchSkill(utterance, skills);
    return { result: local, source: local.source ?? (local.fallback ? 'synonym' : 'token') };
  }
}
