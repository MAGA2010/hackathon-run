/**
 * trigger.ts — match a user utterance (or situation) to the best skill.
 *
 * Strategy (v3, query-conditioned two-stage):
 *
 *   Layer 1 — Exact trigger phrase priority
 *     Every frontmatter `triggers:` entry and every body
 *     `## Trigger phrases` bullet that is fully tokenized-contained in the
 *     utterance is a near-certain dispatch signal. A phrase with at least
 *     one significant token short-circuits the rest of the pipeline.
 *     Stopword-only phrases never short-circuit.
 *
 *   Layer 2 — BM25 primary scoring
 *     A zero-dependency BM25 ranks every skill on the union of
 *     `description + when_to_use + tags + name + triggers`. The ranking is
 *     corpus-normalized to [0, 1] via sum-of-IDF, with a coverage penalty
 *     so a single rare-token hit on a mostly-unrelated query cannot
 *     saturate the score.
 *
 *   Layer 3 — Bigram/trigram context rerank
 *     Shared consecutive-token phrases between the utterance and each
 *     candidate are added as a context boost.
 *
 *   Layer 4 — Synonym rescue (only when top-K BM25 is below the floor)
 *     Domain-bearing tokens are expanded through PARAPHRASE_GROUPS so
 *     "shorten" can dispatch to `scope-knife` and "post mortem" can
 *     dispatch to `retro`.
 *
 *   Layer 5 — Optional embedding rerank (only when HACKATHON_EMBED_BACKEND
 *     is set). The backend is consulted only after the local pipeline
 *     produces non-zero candidates, and it may only reorder those
 *     candidates.
 *
 * Confidence levels are exposed so callers can decide when to refuse a
 * dispatch. `confidence: low` corresponds to a synonym-rescue fallback or
 * a weak BM25 hit; `high` means an exact trigger phrase matched or BM25 +
 * coverage exceed the gate.
 */

import { buildBm25Stats, normalizedBm25Score, bm25Match, type Bm25Document } from './bm25.js';
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
/** Count how many query tokens are in PARAPHRASE_GROUPS AND in the skill bag. */
function countMatchedDomainTokens(queryTokens: string[], bag: Bag): number {
  let count = 0;
  for (const token of queryTokens) {
    if (TOKEN_TO_GROUPS.has(token) && bag.unigrams.has(token)) count++;
  }
  return count;
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

// Lightweight suffix-stripping for action-verb matching: "forces" → "force".
function verbRoot(word: string): string {
  if (word.length > 4) {
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('es') && !word.endsWith('ees')) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  }
  return word;
}

interface Bag {
  unigrams: Set<string>;
  bigrams: Set<string>;
  trigrams: Set<string>;
  phrases: string[];
  firstWord: string;
  firstWordRoot: string;
}

function buildBag(skill: SkillManifest): Bag {
  const descTokens = tokens(skill.frontmatter.description);
  const wtuTokens = tokens(skill.frontmatter.when_to_use ?? '');
  const phraseLines = extractTriggerPhrases(skill.body);
  const declaredPhrases = skill.frontmatter.triggers ?? [];
  const phraseTokens: string[] = [];
  for (const line of [...phraseLines, ...declaredPhrases]) phraseTokens.push(...tokens(line));
  const nameTokens = tokens(skill.frontmatter.name.replace(/-/g, ' '));

  const trigrams = new Set<string>();
  const allTokens = [...descTokens, ...wtuTokens, ...phraseTokens, ...nameTokens];
  for (let i = 0; i < allTokens.length - 2; i++) {
    trigrams.add(allTokens[i] + ' ' + allTokens[i + 1] + ' ' + allTokens[i + 2]);
  }

  const fw = firstWord(skill.frontmatter.description);
  return {
    unigrams: new Set([...descTokens, ...wtuTokens, ...phraseTokens, ...nameTokens]),
    bigrams: new Set([...bigrams(descTokens), ...bigrams(wtuTokens), ...bigrams(phraseTokens)]),
    trigrams,
    phrases: [...phraseLines, ...declaredPhrases].map((p) => p.toLowerCase()),
    firstWord: fw,
    firstWordRoot: verbRoot(fw),
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

export interface MatchCandidate {
  name: string;
  score: number;
  reasons: string[];
  bm25Score: number;
  coverage: number;
  matchedTokens: number;
  matchedDomainTokens: number;
  exactPhrase: boolean;
  synonymRescue: boolean;
}

export interface MatchTrace {
  bm25: Array<{ name: string; score: number; coverage: number; matched: number }>;
  rerankReasons: string[];
  synonymExpanded: string[];
  embeddingUsed: boolean;
}

export interface MatchResult {
  source?: 'token' | 'synonym' | 'embedding' | 'hybrid';
  skill: SkillManifest | null;
  score: number;
  candidates: MatchCandidate[];
  fallback?: boolean;
  confidence?: 'high' | 'medium' | 'low' | 'none';
  trace?: MatchTrace;
}

// ---- Layer 1: exact trigger phrase priority ----

interface PhraseHit {
  skill: SkillManifest;
  phrase: string;
  length: number;
}

const MIN_PHRASE_SIG_LENGTH = 1;

function matchExactPhrases(utteranceWords: string[], skills: SkillManifest[]): PhraseHit[] {
  const rawSet = new Set(utteranceWords);
  const hits: PhraseHit[] = [];
  for (const skill of skills) {
    const bag = buildBag(skill);
    for (const phrase of bag.phrases) {
      // Use ALL tokens (not just significant) so stopword-bearing phrases
      // like "what should we cut" don't match arbitrary utterances that
      // share a single content word.
      const pTokens = tokens(phrase);
      const sigLen = significantWords(pTokens).length;
      if (sigLen < MIN_PHRASE_SIG_LENGTH) continue;
      const present = pTokens.filter((t) => rawSet.has(t)).length;
      if (present === pTokens.length) {
        hits.push({ skill, phrase, length: sigLen });
      }
    }
  }
  return hits;
}

// ---- Thresholds ----

const BM25_FLOOR = 0.08; // below this we will look at synonym rescue
const BM25_HIGH = 0.35; // above this we mark confidence as high
const RESCUE_COVERAGE_MIN = 0.22; // coverage threshold for synonym rescue acceptance
const PHRASE_SHORT_CIRCUIT_BONUS = 1000; // dominates any lexical score
const MIN_MATCHED_TOKENS = 1; // require at least one matched signal token

// ---- Synonym groups (Layer 4) ----

const PARAPHRASE_GROUPS: Record<string, string[]> = {
  scope: [
    'trim',
    'cut',
    'narrow',
    'shorten',
    'reduce',
    'descope',
    'focus',
    'mvp',
    'minimal',
    'roadmap',
  ],
  verify: ['test', 'check', 'run', 'smoke', 'validate', 'pass', 'works', 'verify'],
  demo: ['pitch', 'present', 'show', 'rehearse', 'dry', 'mock', 'speak'],
  team: ['who', 'assign', 'role', 'roster', 'free', 'blocked', 'stuck', 'owner', 'accountable'],
  retro: ['review', 'postmortem', 'post', 'after', 'reflect', 'learn', 'retrospective', 'mortem'],
  stack: ['tech', 'language', 'framework', 'tool', 'choose', 'pick', 'recommend', 'lib'],
  decision: ['log', 'record', 'why', 'keep', 'defer', 'pivot', 'reason', 'rationale', 'decide'],
  recovery: ['fail', 'crash', 'fallback', 'emergency', 'broken', '2am', 'recover'],
  ship: ['submit', 'package', 'secret', 'readme', 'audit', 'ready', 'release', 'leak'],
  judge: ['score', 'rating', 'panel', 'grade', 'feedback', 'review', 'evaluate'],
  clarify: ['idea', 'brief', 'goal', 'project', 'question', 'understand', 'surface', 'refine'],
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

function hasDomainSignal(words: string[]): boolean {
  return words.some((word) => TOKEN_TO_GROUPS.has(word));
}

// ---- Bigram context rerank (Layer 3) ----

interface BigramBoost {
  bonus: number;
  shared: string[];
}

function bigramBoost(utteranceWords: string[], bag: Bag): BigramBoost {
  const signalWords = significantWords(utteranceWords);
  if (signalWords.length < 2) return { bonus: 0, shared: [] };
  const uttBigrams = bigrams(signalWords);
  const uttTrigrams = new Set<string>();
  for (let i = 0; i < signalWords.length - 2; i++) {
    uttTrigrams.add(signalWords[i] + ' ' + signalWords[i + 1] + ' ' + signalWords[i + 2]);
  }
  let bgHits = 0;
  const sharedBg: string[] = [];
  for (const bg of uttBigrams) {
    if (bag.bigrams.has(bg)) {
      bgHits++;
      sharedBg.push(bg);
    }
  }
  let tgHits = 0;
  for (const tg of uttTrigrams) {
    if (bag.trigrams.has(tg)) tgHits++;
  }
  return { bonus: bgHits + tgHits * 2, shared: sharedBg };
}

// ---- Unigram soft substring overlap (kept for short tokens) ----

function unigramHits(utteranceWords: string[], bag: Bag): number {
  const uttSet = new Set(significantWords(utteranceWords));
  let hits = 0;
  for (const t of uttSet) {
    if (bag.unigrams.has(t)) {
      hits++;
      continue;
    }
    // Soft substring: only accept when the bag side is clearly a prefix of
    // the utterance token. This avoids matching e.g. "road" inside
    // "roadmap" against arbitrary skills.
    if (t.length < 5) continue;
    for (const b of bag.unigrams) {
      if (b.length >= 4 && t.startsWith(b) && t.length - b.length <= 3) {
        hits++;
        break;
      }
    }
  }
  return hits;
}

// ---- Tie-break ----

function rankCandidates(candidates: MatchCandidate[], byName: Map<string, SkillManifest>) {
  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    if (b.matchedTokens !== a.matchedTokens) return b.matchedTokens - a.matchedTokens;
    const sa = byName.get(a.name);
    const sb = byName.get(b.name);
    if (sa && sb && sa.triggerBudget !== sb.triggerBudget) {
      return sa.triggerBudget - sb.triggerBudget;
    }
    return a.name.localeCompare(b.name);
  });
}

function confidenceFor(
  top: MatchCandidate | undefined,
  significantCount: number,
  domainSignal: boolean,
): MatchResult['confidence'] {
  if (!top || top.score <= 0) return 'none';
  if (top.exactPhrase) return 'high';
  if (top.bm25Score >= BM25_HIGH && top.coverage >= 0.5) return 'high';
  if (significantCount === 0) return 'none';
  if (top.bm25Score >= 0.2 && top.coverage >= 0.5 && domainSignal) return 'medium';
  if (top.synonymRescue) return 'low';
  if (top.score >= 4 && top.coverage >= 0.5) return 'medium';
  return 'low';
}

/**
 * Reject filler-heavy false positives.
 */
function isConfidentMatch(
  candidate: MatchCandidate,
  significantCount: number,
  domainSignal: boolean,
): boolean {
  if (significantCount <= 0) return false;
  if (candidate.exactPhrase) return true;
  if (
    candidate.bm25Score >= BM25_FLOOR &&
    candidate.coverage >= 0.3 &&
    candidate.matchedTokens >= MIN_MATCHED_TOKENS &&
    domainSignal
  ) {
    return true;
  }
  // Allow a high-coverage exact description match even without a domain word.
  if (candidate.coverage >= 0.8 && candidate.matchedTokens >= 2 && candidate.score >= 3) {
    return true;
  }
  if (candidate.score >= 6) return true;
  return false;
}

export interface MatchOptions {
  trace?: boolean;
}

export function matchSkill(
  utterance: string,
  skills: SkillManifest[],
  options: MatchOptions = {},
): MatchResult {
  const traceOpt = Boolean(options.trace);
  const utteranceWords = tokens(utterance);
  const signalWords = significantWords(utteranceWords);
  const significantCount = signalWords.length;
  const domainSignal = hasDomainSignal(signalWords);
  const byName = new Map(skills.map((s) => [s.frontmatter.name, s]));

  // Layer 1: exact phrase short-circuit.
  const phraseHits = matchExactPhrases(utteranceWords, skills);
  if (phraseHits.length > 0) {
    phraseHits.sort(
      (a, b) =>
        b.length - a.length || a.skill.frontmatter.name.localeCompare(b.skill.frontmatter.name),
    );
    const winner = phraseHits[0];
    const others = phraseHits.slice(1).map((h) => h.skill.frontmatter.name);
    const trace: MatchTrace | undefined = traceOpt
      ? {
          bm25: [],
          rerankReasons: [`exact trigger phrase "${winner.phrase}" matched in full`],
          synonymExpanded: [],
          embeddingUsed: false,
        }
      : undefined;
    const lex = lexicalPipeline(utteranceWords, signalWords, skills, byName, traceOpt);
    const winnerSkill = winner.skill;
    const lexTop = lex.candidates.find((c) => c.name === winnerSkill.frontmatter.name);
    const winnerCandidate: MatchCandidate = {
      name: winnerSkill.frontmatter.name,
      score: PHRASE_SHORT_CIRCUIT_BONUS + winner.length,
      reasons: [
        `+${PHRASE_SHORT_CIRCUIT_BONUS} exact trigger phrase "${winner.phrase}" matched in full`,
      ],
      bm25Score: lexTop?.bm25Score ?? 0,
      coverage: lexTop?.coverage ?? 0,
      matchedTokens: lexTop?.matchedTokens ?? 0,
      matchedDomainTokens: lexTop?.matchedDomainTokens ?? 0,
      exactPhrase: true,
      synonymRescue: false,
    };
    const candidates = [
      winnerCandidate,
      ...lex.candidates.filter((c) => c.name !== winnerSkill.frontmatter.name),
    ];
    const ranked = rankCandidates(candidates, byName);
    if (others.length > 0 && trace) {
      trace.rerankReasons.push(`other phrase matches: ${others.join(', ')}`);
    }
    return {
      skill: winnerSkill,
      score: winnerCandidate.score,
      candidates: ranked,
      source: 'token',
      confidence: 'high',
      trace,
    };
  }

  return lexicalPipeline(utteranceWords, signalWords, skills, byName, traceOpt);
}

function lexicalPipeline(
  utteranceWords: string[],
  signalWords: string[],
  skills: SkillManifest[],
  byName: Map<string, SkillManifest>,
  traceOpt: boolean,
): MatchResult {
  const significantCount = signalWords.length;
  const domainSignal = hasDomainSignal(signalWords);

  const bm25Stats = buildBm25Stats(skills.map(buildBm25Document));
  const useBm25 = significantCount > 0;
  const query = significantCount > 0 ? signalWords.join(' ') : utteranceWords.join(' ');

  const initialCandidates: MatchCandidate[] = skills.map((skill, index) => {
    const bag = buildBag(skill);
    const match = useBm25
      ? bm25Match(query, bm25Stats, index)
      : { score: 0, coverage: 0, matchedTokens: 0, queryTokens: 0 };
    const bm25 = match.score;
    const bg = bigramBoost(utteranceWords, bag);
    const ug = unigramHits(utteranceWords, bag);
    let actionBonus = 0;
    if (
      bag.firstWord &&
      (utteranceWords.includes(bag.firstWord) || utteranceWords.includes(bag.firstWordRoot))
    ) {
      actionBonus = 1;
    }
    const reasons: string[] = [];
    if (bm25 > 0)
      reasons.push(`bm25=${bm25.toFixed(3)} (${match.matchedTokens}/${match.queryTokens} tokens)`);
    if (bg.shared.length > 0) reasons.push(`bigrams: ${bg.shared.slice(0, 3).join(', ')}`);
    if (ug > 0) reasons.push(`+${ug} unigram hits`);
    if (actionBonus > 0) reasons.push(`+${actionBonus} action verb`);
    const matchedDomain = countMatchedDomainTokens(signalWords, bag);
    const score = bm25 * 10 + bg.bonus + ug * 0.5 + actionBonus;
    return {
      name: skill.frontmatter.name,
      score,
      reasons,
      bm25Score: bm25,
      coverage: match.coverage,
      matchedTokens: match.matchedTokens,
      matchedDomainTokens: matchedDomain,
      exactPhrase: false,
      synonymRescue: false,
    };
  });

  const candidates = rankCandidates(initialCandidates, byName);
  const top = candidates[0];

  const bm25Top = top?.bm25Score ?? 0;
  const coverageTop = top?.coverage ?? 0;
  const trace: MatchTrace | undefined = traceOpt
    ? {
        bm25: candidates.slice(0, 5).map((c) => ({
          name: c.name,
          score: c.bm25Score,
          coverage: c.coverage,
          matched: c.matchedTokens,
        })),
        rerankReasons: top?.reasons.slice() ?? [],
        synonymExpanded: [],
        embeddingUsed: false,
      }
    : undefined;

  // Force synonym rescue when the query carries domain tokens but the
  // lexical first pass missed them all. Without this check, an unrelated
  // bigram match (e.g. "next" inside "schedule the next 60 minutes")
  // can outscore a domain-aligned candidate.
  const topMatchedDomain = top ? (candidates[0]?.matchedDomainTokens ?? 0) : 0;
  const missedDomainSignal = domainSignal && topMatchedDomain === 0 && significantCount > 0;

  if (
    !top ||
    bm25Top < BM25_FLOOR ||
    coverageTop < 0.25 ||
    missedDomainSignal ||
    !isConfidentMatch(top, significantCount, domainSignal)
  ) {
    const expanded = expandWithParaphrases(signalWords);
    if (expanded.length > signalWords.length && trace) {
      trace.synonymExpanded = expanded.filter((w) => !signalWords.includes(w));
    }
    if (expanded.length > signalWords.length) {
      const expandedSignal = significantWords(expanded);
      const expandedQuery = expandedSignal.join(' ');
      const rescued: MatchCandidate[] = skills.map((skill, index) => {
        const match = bm25Match(expandedQuery, bm25Stats, index);
        const bg = bigramBoost(expanded, buildBag(skill));
        const ug = unigramHits(expanded, buildBag(skill));
        const score = match.score * 10 + bg.bonus + ug * 0.5;
        return {
          name: skill.frontmatter.name,
          score,
          reasons: score > 0 ? [`synonym expansion (bm25=${match.score.toFixed(3)})`] : [],
          bm25Score: match.score,
          coverage: match.coverage,
          matchedTokens: match.matchedTokens,
          matchedDomainTokens: 0,
          exactPhrase: false,
          synonymRescue: true,
        };
      });
      const ranked = rankCandidates(rescued, byName);
      const rescuedTop = ranked[0];
      if (rescuedTop && rescuedTop.score > 0 && rescuedTop.coverage >= RESCUE_COVERAGE_MIN) {
        const skill = byName.get(rescuedTop.name) ?? null;
        return {
          skill,
          score: rescuedTop.score,
          candidates: ranked,
          fallback: true,
          source: 'synonym',
          confidence: confidenceFor(rescuedTop, significantCount, domainSignal),
          trace,
        };
      }
    }
    return {
      skill: null,
      score: 0,
      candidates,
      confidence: 'none',
      trace,
    };
  }

  const skill = byName.get(top.name) ?? null;
  return {
    skill,
    score: top.score,
    candidates,
    source: bm25Top >= 0.15 ? 'hybrid' : 'token',
    confidence: confidenceFor(top, significantCount, domainSignal),
    trace,
  };
}
