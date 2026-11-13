import { describe, expect, it } from "vitest";
import { AnswerCache, answerQuestion } from "../src/answer/answer.js";
import { parseAnswerArgs } from "../src/answer/run.js";
import { numbersIn, verifyAnswer } from "../src/answer/verify.js";
import type { Hit, Retriever } from "../src/retrieval/bm25.js";

const textOf = new Map([
  ["tamber-4-pro#weight", "The Tamber 4 Pro weighs 212 grams without accessories."],
  ["tamber-4-pro#temperature", "The Tamber 4 Pro works from −10 to 45 °C."],
  ["tamber-4#weight", "The Tamber 4 weighs 198 grams without accessories."],
]);
const docOf = new Map([
  ["tamber-4-pro#weight", "tamber-4-pro"], ["tamber-4-pro#temperature", "tamber-4-pro"], ["tamber-4#weight", "tamber-4"],
]);
const product = { name: "Tamber 4 Pro", docId: "tamber-4-pro" };
const retrieved = ["tamber-4-pro#weight", "tamber-4-pro#temperature", "tamber-4#weight"];
const ctx = { textOf, docOf, product };

describe("numbersIn", () => {
  it("normalises unicode minus and thousands separators and ignores digits inside numbers", () => {
    expect(numbersIn("from −10 to 45 °C")).toEqual(["-10", "45"]);
    expect(numbersIn("1,200 mAh and 3.50 V")).toEqual(["1200", "3.5"]);
    expect(numbersIn("no numbers")).toEqual([]);
  });
});

describe("verifyAnswer", () => {
  it("accepts an answer whose numbers are in a cited, retrieved passage about the right product", () => {
    expect(verifyAnswer({ answer: "212 grams", citations: ["tamber-4-pro#weight"], retrieved }, ctx))
      .toEqual({ verdict: "supported", reasons: [], final: "212 grams" });
    expect(verifyAnswer({ answer: "-10 to 45 degrees Celsius", citations: ["tamber-4-pro#temperature"], retrieved }, ctx).verdict)
      .toBe("supported");
  });

  it("passes an abstention through", () => {
    expect(verifyAnswer({ answer: null, citations: [], retrieved }, ctx)).toEqual({ verdict: "abstained", reasons: [], final: null });
  });

  it("rejects a number that the cited passages do not contain", () => {
    const v = verifyAnswer({ answer: "220 grams", citations: ["tamber-4-pro#weight"], retrieved }, ctx);
    expect(v).toMatchObject({ verdict: "unsupported", final: null });
    expect(v.reasons).toEqual(["number 220 is not in the cited passages"]);
  });

  it("rejects missing, invented and unretrieved citations", () => {
    expect(verifyAnswer({ answer: "212 grams", citations: [], retrieved }, ctx).reasons).toContain("no citations");
    expect(verifyAnswer({ answer: "212 grams", citations: ["made-up#id"], retrieved }, ctx).reasons)
      .toContain("cites made-up#id, which was not retrieved");
    expect(verifyAnswer({ answer: "212 grams", citations: ["tamber-4-pro#weight"], retrieved: ["tamber-4#weight"] }, ctx).verdict)
      .toBe("unsupported");
  });

  it("rejects the right fact for a look-alike product, even when the number matches", () => {
    const v = verifyAnswer({ answer: "198 grams", citations: ["tamber-4#weight"], retrieved }, ctx);
    expect(v.reasons).toEqual(["cites tamber-4#weight, which is not about the Tamber 4 Pro"]);
    // Without a named product the same answer is supported: the check needs the product to apply.
    expect(verifyAnswer({ answer: "198 grams", citations: ["tamber-4#weight"], retrieved }, { textOf }).verdict).toBe("supported");
  });

  it("checks words when the answer has no number", () => {
    expect(verifyAnswer({ answer: "without accessories", citations: ["tamber-4-pro#weight"], retrieved }, ctx).verdict).toBe("supported");
    expect(verifyAnswer({ answer: "waterproof", citations: ["tamber-4-pro#weight"], retrieved }, ctx).reasons)
      .toEqual(["no word of the answer is in the cited passages"]);
  });
});

describe("hiding the gold passage", () => {
  it("removes excluded passages from what the model sees and keeps k passages", async () => {
    const retriever: Retriever = {
      name: "fixed", search: async (_q, k): Promise<Hit[]> => retrieved.slice(0, k).map((id) => ({ id, score: 1 })),
    };
    let prompt = "";
    const out = await answerQuestion("How heavy is the Tamber 4 Pro?", retriever, textOf,
      async (p) => { prompt = p; return { answer: null, citations: [] }; }, new AnswerCache(null), "m", 2, ["tamber-4-pro#weight"]);
    expect(out.retrieved).toEqual(["tamber-4-pro#temperature", "tamber-4#weight"]);
    expect(prompt).not.toContain("212 grams");
  });

  it("is a CLI flag", () => {
    expect(parseAnswerArgs([]).dropGold).toBe(false);
    expect(parseAnswerArgs(["--drop-gold"]).dropGold).toBe(true);
  });
});

describe("mutations", () => {
  it("builds broken copies that the check rejects", async () => {
    const { generate } = await import("../src/corpus/synthetic.js");
    const { V2 } = await import("../src/corpus/synthetic-v2.js");
    const { productCatalog } = await import("../src/corpus/synthetic.js");
    const { findProduct } = await import("../src/retrieval/product-filter.js");
    const { mutations } = await import("../src/answer/verify.js");
    const data = generate(1, 0.5, V2);
    const text = new Map(data.passages.map((p) => [p.id, p.text]));
    const docs = new Map(data.passages.map((p) => [p.id, p.docId]));
    const gold = data.passages.find((p) => p.id === "tamber-4-pro#weight")!;
    const answer = { answer: `${numbersIn(gold.text)[0]} grams`, citations: [gold.id], retrieved: [gold.id] };
    const check = { textOf: text, docOf: docs, product: findProduct("How heavy is the Tamber 4 Pro?", productCatalog(V2)) };
    expect(verifyAnswer(answer, check).verdict).toBe("supported");
    const broken = mutations(answer, data.passages);
    expect(broken.map((m) => m.kind)).toEqual(["wrong-number", "look-alike-product", "invented-citation"]);
    for (const m of broken) expect(verifyAnswer(m, check).verdict, m.kind).toBe("unsupported");
  });
});
