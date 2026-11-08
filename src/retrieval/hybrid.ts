/**
 * Hybrid retrieval by reciprocal rank fusion (RRF): each retriever ranks the passages, and a
 * passage's fused score is the sum of 1 / (k + rank) over the retrievers that returned it.
 * RRF uses ranks only, so BM25 scores and cosine similarities never need to be put on one scale.
 */
import type { Hit, Retriever } from "./bm25.js";

export function reciprocalRankFusion(rankings: string[][], k = 60): Hit[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)));
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export class HybridRetriever implements Retriever {
  readonly name: string;

  /** `depth` is how many results each retriever contributes before fusion. */
  constructor(private readonly retrievers: Retriever[], private readonly k = 60, private readonly depth = 50) {
    this.name = `hybrid(${retrievers.map((r) => r.name).join("+")})`;
  }

  async search(query: string, k: number): Promise<Hit[]> {
    const rankings = await Promise.all(
      this.retrievers.map(async (r) => (await r.search(query, this.depth)).map((h) => h.id)));
    return reciprocalRankFusion(rankings, this.k).slice(0, k);
  }
}
