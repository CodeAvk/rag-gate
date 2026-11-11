import { describe, expect, it } from "vitest";
import { generate, productCatalog, V1 } from "../src/corpus/synthetic.js";
import { V2 } from "../src/corpus/synthetic-v2.js";
import { evaluate, makeRetriever } from "../src/eval/run.js";
import type { Hit, Retriever } from "../src/retrieval/bm25.js";
import { findProduct, ProductFilter } from "../src/retrieval/product-filter.js";

const catalog = productCatalog(V2);

function fixed(ids: string[]): Retriever {
  return { name: "emb", search: async (_q, k): Promise<Hit[]> => ids.slice(0, k).map((id, i) => ({ id, score: 1 - i / 10 })) };
}

describe("productCatalog", () => {
  it("lists every family and model with the generator's doc ids", () => {
    expect(catalog).toHaveLength(24);
    expect(catalog).toContainEqual({ name: "Tamber 4 Pro", docId: "tamber-4-pro" });
    const docIds = new Set(generate(1, 0.5, V2).passages.map((p) => p.docId));
    expect(new Set(catalog.map((p) => p.docId))).toEqual(docIds);
  });
});

describe("findProduct", () => {
  it("prefers the longest name, so look-alikes are told apart", () => {
    expect(findProduct("How heavy is the Tamber 4 Pro to carry?", catalog)?.docId).toBe("tamber-4-pro");
    expect(findProduct("How heavy is the Tamber 4 to carry?", catalog)?.docId).toBe("tamber-4");
    expect(findProduct("how long does the tamber 5 lite last?", catalog)?.docId).toBe("tamber-5-lite");
  });

  it("matches whole words only and returns null when nothing or two products match", () => {
    expect(findProduct("Is the Tamber 45 available?", catalog)).toBeNull();
    expect(findProduct("Which battery lasts longest?", catalog)).toBeNull();
    expect(findProduct("Tamber 4 or Marlow 5?", catalog)).toBeNull();
  });
});

describe("ProductFilter", () => {
  const passages = [
    { id: "tamber-4#weight", docId: "tamber-4" },
    { id: "tamber-4-pro#weight", docId: "tamber-4-pro" },
    { id: "tamber-4-pro#battery", docId: "tamber-4-pro" },
    { id: "marlow-5#weight", docId: "marlow-5" },
  ];
  const inner = fixed(["tamber-4#weight", "marlow-5#weight", "tamber-4-pro#weight", "tamber-4-pro#battery"]);

  it("moves the named product's passages first and keeps the inner order within groups", async () => {
    const filter = new ProductFilter(inner, catalog, passages);
    const ids = (await filter.search("How heavy is the Tamber 4 Pro?", 4)).map((h) => h.id);
    expect(filter.name).toBe("emb+product");
    expect(ids).toEqual(["tamber-4-pro#weight", "tamber-4-pro#battery", "tamber-4#weight", "marlow-5#weight"]);
  });

  it("leaves the ranking unchanged when no single product is named, and respects k", async () => {
    const filter = new ProductFilter(inner, catalog, passages);
    expect((await filter.search("Which one is lightest?", 2)).map((h) => h.id)).toEqual(["tamber-4#weight", "marlow-5#weight"]);
    expect(await filter.search("How heavy is the Tamber 4 Pro?", 1)).toHaveLength(1);
  });

  it("does not hurt BM25 on either synthetic set (dev split)", async () => {
    for (const set of [V1, V2]) {
      const data = generate(1, 0.5, set);
      const corpus = set === V1 ? "v1" : "v2";
      const base = (await evaluate(await makeRetriever("bm25", data, "dev"), data, "dev")).summary;
      const withCheck = (await evaluate(await makeRetriever("bm25+product", data, "dev"), data, "dev")).summary;
      for (const group of Object.keys(base)) {
        expect(withCheck[group]!.recallAt1, `${corpus} ${group}`).toBeGreaterThanOrEqual(base[group]!.recallAt1);
        expect(withCheck[group]!.mrr, `${corpus} ${group}`).toBeGreaterThanOrEqual(base[group]!.mrr);
      }
    }
  });
});
