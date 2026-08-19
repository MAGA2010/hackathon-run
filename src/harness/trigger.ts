/**
 * trigger.ts — match a user utterance (or situation) to the best skill.
 *
 * Strategy:
 *   1. Tokenize the utterance, lowercase, strip punctuation.
 *   2. For each candidate skill, build a token bag from:
 *        - description (high weight)
 *        - when_to_use (high weight)
 *        - trigger phrases section in the body (extracted via regex)
 *        - skill name (low weight)
 *   3. Score by overlap. Highest score wins. Score == 0 => no match.
 *   4. Tie-break: smaller trigger budget (more focused skill wins).
 *   5. Final tie-break: alphabetical name order (stable, predictable).
 *
 * This is deliberately simple. It runs on every agent turn, so it must
 * be fast and zero-dep. For production semantic matching, an embedding-
 * based fallback would be added behind a flag.
 */

import type { SkillManifest } from "./types.js";

const TOKEN_RE = /[a-z][a-z0-9_-]+/g;
const PHRASE_HEADER_RE = /^## Trigger phrases/i;

function tokens(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? []);
}

function extractTriggerPhrases(body: string): string[] {
  const lines = body.split("\n");
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    if (PHRASE_HEADER_RE.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (line.startsWith("## ")) break;
      const m = line.match(/^[-*]\s*"?(.+?)"?\s*$/);
      if (m && m[1]) out.push(m[1]);
    }
  }
  return out;
}

function score(utterance: Set<string>, skill: SkillManifest): number {
  const bag = new Set<string>([
    ...tokens(skill.frontmatter.description),
    ...tokens(skill.frontmatter.when_to_use ?? ""),
    ...tokens(extractTriggerPhrases(skill.body).join(" ")),
  ]);
  let hits = 0;
  for (const t of utterance) {
    if (bag.has(t)) hits += 2;
    else {
      for (const b of bag) {
        if (b.includes(t) || t.includes(b)) {
          hits += 1;
          break;
        }
      }
    }
  }
  return hits;
}

export interface MatchResult {
  skill: SkillManifest | null;
  score: number;
  candidates: Array<{ name: string; score: number }>;
}

export function matchSkill(
  utterance: string,
  skills: SkillManifest[],
): MatchResult {
  const utt = new Set(tokens(utterance));
  const byName = new Map(skills.map((s) => [s.frontmatter.name, s]));
  const candidates = skills
    .map((s) => ({ name: s.frontmatter.name, score: score(utt, s) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const sa = byName.get(a.name);
      const sb = byName.get(b.name);
      // Smaller trigger budget = more focused = wins ties.
      if (sa && sb && sa.triggerBudget !== sb.triggerBudget) {
        return sa.triggerBudget - sb.triggerBudget;
      }
      return a.name.localeCompare(b.name);
    });

  const top = candidates[0];
  if (!top || top.score <= 0) {
    return { skill: null, score: 0, candidates };
  }
  const skill = byName.get(top.name) ?? null;
  return { skill, score: top.score, candidates };
}
