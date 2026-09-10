/**
 * bm25.ts - small, zero-dependency BM25 scorer for skill routing.
 *
 * The catalog is deliberately tiny (15 bundled skills), so we can rebuild
 * collection statistics on every request without meaningful overhead. This
 * scorer is intended as a lexical ranking layer, not a replacement for an
 * embedding backend.
 */

const TOKEN_RE = /[a-z0-9][a-z0-9_-]*/g;
const K1 = 1.2;
const B = 0.75;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

export interface Bm25Document {
  text: string;
  name: string;
}

interface CorpusStats {
  totalDocs: number;
  totalLength: number;
  averageLength: number;
  idf: Map<string, number>;
  documents: Array<{ name: string; tokens: string[]; frequencies: Map<string, number> }>;
}

function termFrequencies(tokens: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}

function buildStats(documents: Bm25Document[]): CorpusStats {
  const tokenized = documents.map((document) => tokenize(document.text));
  const documentFrequency = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const totalDocs = documents.length;
  const totalLength = tokenized.reduce((sum, tokens) => sum + tokens.length, 0);
  const idf = new Map<string, number>();
  for (const [token, frequency] of documentFrequency) {
    idf.set(token, Math.log(1 + (totalDocs - frequency + 0.5) / (frequency + 0.5)));
  }

  return {
    totalDocs,
    totalLength,
    averageLength: totalDocs > 0 ? totalLength / totalDocs : 0,
    idf,
    documents: tokenized.map((tokens, index) => ({
      name: documents[index]?.name ?? '',
      tokens,
      frequencies: termFrequencies(tokens),
    })),
  };
}

/**
 * Score a query against one prebuilt document.
 * Returns a positive BM25 value. Callers should normalize it to [0, 1]
 * using `normalizedBm25Score` if they need a stable threshold.
 */
export function bm25Score(query: string, stats: CorpusStats, documentIndex: number): number {
  const document = stats.documents[documentIndex];
  if (!document || document.tokens.length === 0) return 0;

  const lengthRatio = document.tokens.length / Math.max(stats.averageLength, 1);
  let score = 0;
  for (const token of tokenize(query)) {
    const frequency = document.frequencies.get(token) ?? 0;
    if (frequency === 0) continue;
    const idf = stats.idf.get(token) ?? 0;
    const numerator = frequency * (K1 + 1);
    const denominator = frequency + K1 * (1 - B + B * lengthRatio);
    score += idf * (numerator / denominator);
  }
  return score;
}

/**
 * Normalize a BM25 score using the query's theoretical sum of IDF. This is
 * corpus-relative and stable enough for routing thresholds on a small skill
 * catalog.
 */
export function normalizedBm25Score(
  query: string,
  stats: CorpusStats,
  documentIndex: number,
): number {
  const raw = bm25Score(query, stats, documentIndex);
  if (raw <= 0) return 0;

  let max = 0;
  for (const token of tokenize(query)) {
    const idf = stats.idf.get(token) ?? 0;
    max += idf * (K1 + 1);
  }
  return max > 0 ? raw / max : 0;
}

export function buildBm25Stats(documents: Bm25Document[]): CorpusStats {
  return buildStats(documents);
}
