/** Okapi BM25 keyword retrieval: the non-AI baseline every AI retriever has to beat. */
import { tokenize } from "../text/tokenize.js";

export interface Doc {
  id: string;
  text: string;
}

export interface Hit {
  id: string;
  score: number;
}

export interface Retriever {
  name: string;
  search(query: string, k: number): Promise<Hit[]>;
}

export class Bm25 implements Retriever {
  readonly name = "bm25";
  private readonly tf: Map<string, number>[];
  private readonly lengths: number[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(private readonly docs: Doc[], private readonly k1 = 1.2, private readonly b = 0.75) {
    this.tf = docs.map((d) => {
      const counts = new Map<string, number>();
      for (const t of tokenize(d.text)) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return counts;
    });
    this.lengths = this.tf.map((m) => [...m.values()].reduce((a, c) => a + c, 0));
    this.avgLength = this.lengths.reduce((a, c) => a + c, 0) / Math.max(docs.length, 1);
  }

  idf(term: string): number {
    const n = this.df.get(term) ?? 0;
    return Math.log(1 + (this.docs.length - n + 0.5) / (n + 0.5));
  }

  scores(query: string): Hit[] {
    const terms = [...new Set(tokenize(query))];
    return this.docs.map((d, i) => {
      let score = 0;
      for (const t of terms) {
        const f = this.tf[i]!.get(t);
        if (!f) continue;
        const norm = this.k1 * (1 - this.b + (this.b * this.lengths[i]!) / this.avgLength);
        score += this.idf(t) * ((f * (this.k1 + 1)) / (f + norm));
      }
      return { id: d.id, score };
    });
  }

  async search(query: string, k: number): Promise<Hit[]> {
    return this.scores(query)
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)) // ties broken by id, so runs repeat exactly
      .slice(0, k);
  }
}
