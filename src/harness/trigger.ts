/**
 * trigger.ts — match a user utterance (or situation) to the best skill.
 *
 * Strategy (v2, layered scoring):
 *   1. Tokenize the utterance, lowercase, strip punctuation.
 *   2. For each candidate skill, build a weighted token bag:
 *        - description tokens            : weight 3
 *        - first word of description    : weight +2 bonus (action verb)
 *        - when_to_use tokens           : weight 2
 *        - trigger phrases (body)       : weight 2 + exact-phrase bonus
 *        - skill name tokens            : weight 1
 *   3. Score by overlap. Bigram overlap (two-word phrases) is added.
 *   4. Highest score wins. Score == 0 => no match.
 *   5. Tie-break: smaller trigger budget (more focused skill wins).
 *   6. Final tie-break: alphabetical name order (stable, predictable).
 *
 * This is deliberately simple. It runs on every agent turn, so it must
 * be fast and zero-dep. For production semantic matching, an embedding-
 * based fallback would be added behind a flag.
 */

import { buildBm25Stats, normalizedBm25Score, type Bm25Document } from './bm25.js';
import type { SkillManifest } from './types.js';

const TOKEN_RE = /[a-z][a-z0-9_-]+/g;

function tokens(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

function bigrams(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    out.push(words[i] + ' ' + words[i + 1]);
  }
  return out;
}

// Function words that do not carry domain intent. They are still kept for
// exact trigger-phrase checks, but removed before token/bigram scoring so an
// unrelated sentence cannot match every skill through common filler words.
const STOPWORDS = new Set([
  'a',
  'about',
  'after',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'him',
  'his',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'not',
  'of',
  'on',
  'or',
  'our',
  'please',
  'she',
  'should',
  'so',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'to',
  'too',
  'us',
  'was',
  'we',
  'were',
  'what',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

function significantWords(words: string[]): string[] {
  return words.filter((w) => !STOPWORDS.has(w));
}

const PHRASE_HEADER_RE = /^## Trigger phrases/i;

function extractTriggerPhrases(body: string): string[] {
  const lines = body.split('\n');
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    if (PHRASE_HEADER_RE.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (line.startsWith('## ')) break;
      const m = line.match(/^[-*]\s*"?(.+?)"?\s*$/);
      if (m && m[1]) out.push(m[1]);
    }
  }
  return out;
}

function firstWord(description: string): string {
  const m = description.toLowerCase().match(TOKEN_RE);
  return m && m[0] ? m[0] : '';
}

interface Bag {
  unigrams: Set<string>;
  bigrams: Set<string>;
  phrases: string[]; // exact-phrase trigger phrases, lowercased
  firstWord: string; // action verb
}

function buildBag(skill: SkillManifest): Bag {
  const descTokens = tokens(skill.frontmatter.description);
  const wtuTokens = tokens(skill.frontmatter.when_to_use ?? '');
  const phraseLines = extractTriggerPhrases(skill.body);
  const declaredPhrases = skill.frontmatter.triggers ?? [];
  const phraseTokens: string[] = [];
  for (const line of [...phraseLines, ...declaredPhrases]) phraseTokens.push(...tokens(line));
  const nameTokens = tokens(skill.frontmatter.name.replace(/-/g, ' '));

  return {
    unigrams: new Set([...descTokens, ...wtuTokens, ...phraseTokens, ...nameTokens]),
    bigrams: new Set([...bigrams(descTokens), ...bigrams(wtuTokens), ...bigrams(phraseTokens)]),
    phrases: [...phraseLines, ...declaredPhrases].map((p) => p.toLowerCase()),
    firstWord: firstWord(skill.frontmatter.description),
  };
}

function buildBm25Document(skill: SkillManifest): Bm25Document {
  const text = [
    skill.frontmatter.description.repeat(4),
    (skill.frontmatter.when_to_use ?? '').repeat(3),
    [...(skill.frontmatter.triggers ?? []), ...extractTriggerPhrases(skill.body)]
      .join('\n')
      .repeat(3),
    (skill.frontmatter.tags ?? []).join(' '),
    skill.frontmatter.name.replace(/-/g, ' '),
  ]
    .filter((part) => part.trim())
    .join('\n');
  return { name: skill.frontmatter.name, text };
}

function score(utteranceWords: string[], bag: Bag): { score: number; reasons: string[] } {
  const rawSet = new Set(utteranceWords);
  const signalWords = significantWords(utteranceWords);
  const uttSet = new Set(signalWords);
  const uttBigrams = new Set(bigrams(signalWords));
  let score = 0;
  const reasons: string[] = [];

  // Exact-phrase bonus (strong signal).
  for (const phrase of bag.phrases) {
    const pTokens = tokens(phrase);
    if (pTokens.length === 0) continue;
    if (pTokens.every((t) => rawSet.has(t))) {
      score += 5;
      reasons.push('+' + 5 + ' phrase: "' + phrase + '"');
    }
  }

  // First-word (action verb) bonus.
  if (bag.firstWord && rawSet.has(bag.firstWord)) {
    score += 2;
    reasons.push('+' + 2 + ' action verb: ' + bag.firstWord);
  }

  // Unigram overlap.
  let directHits = 0;
  for (const t of uttSet) {
    if (bag.unigrams.has(t)) {
      directHits++;
    } else {
      // soft substring hit (counts once per utterance token).
      if (t.length < 4) continue;
      for (const b of bag.unigrams) {
        if (b.length >= 4 && (b.includes(t) || t.includes(b))) {
          directHits++;
          break;
        }
      }
    }
  }
  score += directHits;
  if (directHits > 0) reasons.push('+' + directHits + ' unigram overlap');

  // Bigram overlap bonus.
  let bgHits = 0;
  for (const bg of uttBigrams) {
    if (bag.bigrams.has(bg)) bgHits++;
  }
  if (bgHits > 0) {
    score += bgHits * 2;
    reasons.push('+' + bgHits * 2 + ' bigram overlap (' + bgHits + ')');
  }

  return { score, reasons };
}

export interface MatchCandidate {
  name: string;
  score: number;
  reasons: string[];
  /** Score produced by the legacy exact/phrase/token matcher. */
  legacyScore?: number;
  /** Corpus-normalized BM25 score in [0, 1]. */
  bm25Score?: number;
}

export interface MatchResult {
  /** How the match was produced: token overlap, synonym rescue, or an embedding backend. */
  source?: 'token' | 'synonym' | 'embedding' | 'hybrid';
  skill: SkillManifest | null;
  score: number;
  candidates: MatchCandidate[];
  /** True when the zero-score path was rescued by synonym expansion. */
  fallback?: boolean;
}

const PARAPHRASE_GROUPS: Record<string, string[]> = {
  scope: ['trim', 'cut', 'narrow', 'shorten', 'reduce', 'descope', 'focus', 'mvp', 'minimal'],
  verify: ['test', 'check', 'run', 'smoke', 'validate', 'pass', 'works'],
  demo: ['pitch', 'present', 'show', 'rehearse', 'dry', 'mock', 'speak'],
  team: ['who', 'assign', 'role', 'roster', 'free', 'blocked', 'stuck', 'owner', 'accountable'],
  retro: ['review', 'postmortem', 'post', 'after', 'reflect', 'learn', 'retrospective'],
  stack: ['tech', 'language', 'framework', 'tool', 'choose', 'pick', 'recommend', 'lib'],
  decision: ['log', 'record', 'why', 'keep', 'defer', 'pivot', 'reason', 'rationale', 'decide'],
  recovery: ['fail', 'crash', 'fallback', 'emergency', 'broken', '2am', 'recover'],
  ship: ['submit', 'package', 'secret', 'readme', 'audit', 'ready', 'release', 'leak'],
  judge: ['score', 'rating', 'panel', 'grade', 'feedback', 'review', 'evaluate'],
  clarify: ['idea', 'brief', 'what', 'goal', 'question', 'understand', 'surface', 'refine'],
  time: ['schedule', 'allocate', 'clock', 'hours', 'deadline', 'remaining', 'budget', 'minutes'],
};

const TOKEN_TO_GROUPS = new Map<string, string[]>();
for (const [group, members] of Object.entries(PARAPHRASE_GROUPS)) {
  for (const token of [group, ...members]) {
    const groups = TOKEN_TO_GROUPS.get(token) ?? [];
    if (!groups.includes(group)) groups.push(group);
    TOKEN_TO_GROUPS.set(token, groups);
  }
}

function expandWithParaphrases(words: string[]): string[] {
  const expanded = new Set<string>(words);
  for (const word of words) {
    const groups = TOKEN_TO_GROUPS.get(word);
    if (!groups) continue;
    for (const group of groups) {
      expanded.add(group);
      for (const synonym of PARAPHRASE_GROUPS[group]) expanded.add(synonym);
    }
  }
  return [...expanded];
}

function rankCandidates(candidates: MatchCandidate[], byName: Map<string, SkillManifest>) {
  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const sa = byName.get(a.name);
    const sb = byName.get(b.name);
    if (sa && sb && sa.triggerBudget !== sb.triggerBudget) {
      return sa.triggerBudget - sb.triggerBudget;
    }
    return a.name.localeCompare(b.name);
  });
}

function hasExplicitSignal(reasons: string[]): boolean {
  return reasons.some((reason) => reason.includes('phrase:') || reason.includes('action verb:'));
}

function hasDomainSignal(words: string[]): boolean {
  return words.some((word) => TOKEN_TO_GROUPS.has(word));
}

/**
 * Reject filler-heavy false positives. A match is only confident when it
 * carries an explicit phrase/action signal, reaches a small absolute score, or
 * covers most of the domain-bearing utterance tokens.
 */
function isConfidentMatch(
  candidate: MatchCandidate,
  significantCount: number,
  domainSignal: boolean,
): boolean {
  if (significantCount <= 0) return false;
  if (hasExplicitSignal(candidate.reasons)) return true;
  const legacy = candidate.legacyScore ?? candidate.score;
  if (legacy >= 4) return true;
  if ((candidate.bm25Score ?? 0) >= 0.35 && legacy >= 2 && domainSignal) return true;
  return legacy / significantCount >= 0.8;
}

export function matchSkill(utterance: string, skills: SkillManifest[]): MatchResult {
  const utteranceWords = tokens(utterance);
  const significantCount = significantWords(utteranceWords).length;
  const domainSignal = hasDomainSignal(utteranceWords);
  const byName = new Map(skills.map((s) => [s.frontmatter.name, s]));

  const bm25Stats = buildBm25Stats(skills.map(buildBm25Document));
  const useBm25 = significantCount > 1;
  const candidates: MatchCandidate[] = skills.map((s, index) => {
    const bag = buildBag(s);
    const r = score(utteranceWords, bag);
    const bm25 = useBm25 ? normalizedBm25Score(utteranceWords.join(' '), bm25Stats, index) : 0;
    const bm25Points = bm25 >= 0.2 ? Math.round(bm25 * 8) : 0;
    const reasons = bm25Points > 0 ? [...r.reasons, `+${bm25Points} bm25 relevance`] : r.reasons;
    return {
      name: s.frontmatter.name,
      score: r.score + bm25Points,
      reasons,
      legacyScore: r.score,
      bm25Score: bm25,
    };
  });

  rankCandidates(candidates, byName);

  const top = candidates[0];
  const directNoMatch =
    !top || ((top.legacyScore ?? 0) <= 0 && ((top.bm25Score ?? 0) < 0.35 || !domainSignal));
  const directLowConfidence = !!top && !isConfidentMatch(top, significantCount, domainSignal);
  if (directNoMatch || directLowConfidence) {
    // Expand only domain-bearing words. Question filler such as "what" must not
    // trigger idea-clarify, while "who" (kept as a domain word for roster
    // synonym rescue) still can.
    const signalWords = significantWords(utteranceWords);
    const expanded = expandWithParaphrases(signalWords);
    if (expanded.length > signalWords.length) {
      const fallbackCandidates: MatchCandidate[] = skills.map((s) => {
        const r = score(expanded, buildBag(s));
        return { name: s.frontmatter.name, score: r.score, reasons: r.reasons };
      });
      rankCandidates(fallbackCandidates, byName);
      const fallbackTop = fallbackCandidates[0];
      if (fallbackTop && fallbackTop.score > 0) {
        fallbackTop.reasons = [...fallbackTop.reasons, 'synonym expansion'];
        const skill = byName.get(fallbackTop.name) ?? null;
        return {
          skill,
          score: fallbackTop.score,
          candidates: fallbackCandidates,
          fallback: true,
          source: 'synonym',
        };
      }
    }
    return { skill: null, score: 0, candidates };
  }
  const skill = byName.get(top.name) ?? null;
  return {
    skill,
    score: top.score,
    candidates,
    source:
      (top.bm25Score ?? 0) >= 0.2 && (top.legacyScore ?? 0) > 0 && domainSignal
        ? 'hybrid'
        : 'token',
  };
}
