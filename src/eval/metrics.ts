/** Retrieval metrics against one gold passage per question. */

export function rankOf(ranked: string[], gold: string): number | null {
  const i = ranked.indexOf(gold);
  return i === -1 ? null : i + 1;
}

export interface QuestionResult {
  id: string;
  style: string;
  rank: number | null; // 1-based rank of the gold passage, null if not retrieved
}

export interface Summary {
  questions: number;
  recallAt1: number;
  recallAt5: number;
  mrr: number;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

export function summarize(results: QuestionResult[]): Summary {
  const n = results.length;
  if (n === 0) return { questions: 0, recallAt1: 0, recallAt5: 0, mrr: 0 };
  const hit = (k: number) => results.filter((r) => r.rank !== null && r.rank <= k).length / n;
  const mrr = results.reduce((a, r) => a + (r.rank ? 1 / r.rank : 0), 0) / n;
  return { questions: n, recallAt1: round(hit(1)), recallAt5: round(hit(5)), mrr: round(mrr) };
}

/** Overall summary plus one per question style (literal, paraphrase). */
export function summarizeByStyle(results: QuestionResult[]): Record<string, Summary> {
  const out: Record<string, Summary> = { all: summarize(results) };
  for (const style of [...new Set(results.map((r) => r.style))].sort()) {
    out[style] = summarize(results.filter((r) => r.style === style));
  }
  return out;
}
