import { describe, expect, it } from "vitest";
import { generate } from "../src/corpus/synthetic.js";
import { evaluate, parseArgs } from "../src/eval/run.js";
import { rankOf, summarize, summarizeByStyle } from "../src/eval/metrics.js";
import { Bm25 } from "../src/retrieval/bm25.js";

const docs = [
  { id: "a", text: "The red kite flies over the hill." },
  { id: "b", text: "A blue boat sails on the lake; the boat is small." },
  { id: "c", text: "Kites and boats are sold at the market." },
];

describe("Bm25", () => {
  it("ranks the document with the query terms first", async () => {
    const hits = await new Bm25(docs).search("blue boat", 3);
    expect(hits[0]!.id).toBe("b");
  });

  it("gives rarer terms a higher idf", () => {
    const bm = new Bm25(docs);
    expect(bm.idf("lake")).toBeGreaterThan(0);
    expect(bm.idf("missing")).toBeGreaterThan(bm.idf("lake"));
  });

  it("returns nothing for stopword-only or unknown queries, and respects k", async () => {
    const bm = new Bm25(docs);
    expect(await bm.search("the of and", 3)).toEqual([]);
    expect(await bm.search("zebra", 3)).toEqual([]);
    expect(await bm.search("boat kite market", 1)).toHaveLength(1);
  });

  it("breaks score ties by id so results repeat exactly", async () => {
    const same = [{ id: "z", text: "apple" }, { id: "y", text: "apple" }];
    expect((await new Bm25(same).search("apple", 2)).map((h) => h.id)).toEqual(["y", "z"]);
  });
});

describe("metrics", () => {
  it("computes rank, recall and MRR", () => {
    expect(rankOf(["x", "g", "y"], "g")).toBe(2);
    expect(rankOf(["x"], "g")).toBeNull();
    const s = summarize([
      { id: "1", style: "literal", rank: 1 },
      { id: "2", style: "literal", rank: 4 },
      { id: "3", style: "paraphrase", rank: null },
      { id: "4", style: "paraphrase", rank: 6 },
    ]);
    expect(s).toEqual({ questions: 4, recallAt1: 0.25, recallAt5: 0.5, mrr: 0.354 });
  });

  it("summarizes per style and handles empty input", () => {
    const by = summarizeByStyle([{ id: "1", style: "literal", rank: 1 }]);
    expect(Object.keys(by)).toEqual(["all", "literal"]);
    expect(summarize([])).toEqual({ questions: 0, recallAt1: 0, recallAt5: 0, mrr: 0 });
  });
});

describe("eval run", () => {
  it("uses the dev split by default and guards the held-out split", () => {
    expect(parseArgs([])).toEqual({
      retriever: "bm25", corpus: "v1", seed: 1, split: "dev", gate: false, saveBaseline: false, tolerance: 0,
    });
    expect(parseArgs(["--corpus", "v2"]).corpus).toBe("v2");
    expect(() => parseArgs(["--corpus", "v9"])).toThrow(/unknown corpus/);
    expect(() => parseArgs(["--split", "heldout"])).toThrow(/--final/);
    expect(parseArgs(["--split", "heldout", "--final"]).split).toBe("heldout");
    expect(() => parseArgs(["--split", "test"])).toThrow(/unknown split/);
  });

  it("parses the gate flags", () => {
    expect(parseArgs(["--gate", "--tolerance", "0.02"])).toMatchObject({ gate: true, tolerance: 0.02 });
    expect(parseArgs(["--save-baseline"]).saveBaseline).toBe(true);
    expect(() => parseArgs(["--gate", "--save-baseline"])).toThrow(/not both/);
    expect(() => parseArgs(["--tolerance", "-1"])).toThrow(/tolerance/);
    expect(() => parseArgs(["--tolerance", "abc"])).toThrow(/tolerance/);
  });

  it("scores only the requested split", async () => {
    const data = generate(1);
    const { summary, results } = await evaluate(new Bm25(data.passages), data, "dev");
    const dev = data.questions.filter((q) => q.split === "dev").length;
    expect(results).toHaveLength(dev);
    expect(summary.all!.questions).toBe(dev);
  });
});
