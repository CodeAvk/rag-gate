import { describe, expect, it } from "vitest";
import type { Hit, Retriever } from "../src/retrieval/bm25.js";
import { HybridRetriever, reciprocalRankFusion } from "../src/retrieval/hybrid.js";

/** Retriever that returns a fixed ranking and records the depth it was asked for. */
function fixed(name: string, ids: string[], asked: number[] = []): Retriever {
  return {
    name,
    async search(_q: string, k: number): Promise<Hit[]> {
      asked.push(k);
      return ids.slice(0, k).map((id, i) => ({ id, score: 1 / (i + 1) }));
    },
  };
}

describe("reciprocalRankFusion", () => {
  it("sums 1/(k+rank) across rankings", () => {
    const fused = reciprocalRankFusion([["a", "b"], ["b", "c"]], 60);
    expect(fused.map((h) => h.id)).toEqual(["b", "a", "c"]);
    expect(fused[0]!.score).toBeCloseTo(1 / 62 + 1 / 61);
    expect(fused[1]!.score).toBeCloseTo(1 / 61);
  });

  it("rewards agreement: a passage ranked second by both beats one ranked first by only one", () => {
    const fused = reciprocalRankFusion([["x", "both"], ["y", "both"]]);
    expect(fused[0]!.id).toBe("both");
  });

  it("breaks ties by id and handles empty input", () => {
    expect(reciprocalRankFusion([["b"], ["a"]]).map((h) => h.id)).toEqual(["a", "b"]);
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});

describe("HybridRetriever", () => {
  it("fuses its retrievers, asks each for the full depth, and returns the top k", async () => {
    const asked: number[] = [];
    const hybrid = new HybridRetriever([fixed("bm25", ["a", "b", "c"], asked), fixed("emb", ["c", "b", "a"], asked)], 60, 3);
    const hits = await hybrid.search("q", 2);
    expect(hybrid.name).toBe("hybrid(bm25+emb)");
    expect(asked).toEqual([3, 3]);
    // a and c: 1/61 + 1/63 = 0.032266 each; b: 2/62 = 0.032258. RRF slightly favours a first place
    // plus a last place over two middle places, and the a/c tie breaks by id.
    expect(hits.map((h) => h.id)).toEqual(["a", "c"]);
  });

  it("still returns results when one retriever finds nothing", async () => {
    const hybrid = new HybridRetriever([fixed("bm25", []), fixed("emb", ["z", "y"])]);
    expect((await hybrid.search("q", 5)).map((h) => h.id)).toEqual(["z", "y"]);
  });
});
