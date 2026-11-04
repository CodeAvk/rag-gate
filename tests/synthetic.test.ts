import { describe, expect, it } from "vitest";
import { FACTS, FAMILIES, generate, MODELS } from "../src/corpus/synthetic.js";
import { tokenize } from "../src/text/tokenize.js";

const data = generate(1);
const byId = new Map(data.passages.map((p) => [p.id, p]));
const nameTokens = new Set(FAMILIES.flatMap((f) => tokenize(f)).concat(MODELS));

/** Content words a question shares with a passage, ignoring the product name. */
function overlap(question: string, passage: string): string[] {
  const p = new Set(tokenize(passage));
  return [...new Set(tokenize(question))].filter((t) => p.has(t) && !nameTokens.has(t));
}

describe("synthetic dataset", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    expect(generate(1)).toEqual(data);
    expect(generate(2).passages.map((p) => p.text)).not.toEqual(data.passages.map((p) => p.text));
  });

  it("has the expected size", () => {
    const products = FAMILIES.length * MODELS.length;
    expect(data.passages.filter((p) => p.kind === "fact")).toHaveLength(products * FACTS.length);
    expect(data.passages.filter((p) => p.kind === "distractor")).toHaveLength(products);
    expect(data.questions).toHaveLength(products * FACTS.length * 2);
    expect(new Set(data.passages.map((p) => p.id)).size).toBe(data.passages.length);
  });

  it("points every question at a fact passage that contains the answer", () => {
    for (const q of data.questions) {
      const gold = byId.get(q.goldPassageId);
      expect(gold?.kind).toBe("fact");
      for (const num of q.answer.match(/-?\d+/g) ?? []) expect(gold!.text).toContain(num);
    }
  });

  it("splits dev and held-out evenly within each style", () => {
    for (const style of ["literal", "paraphrase"]) {
      const group = data.questions.filter((q) => q.style === style);
      const held = group.filter((q) => q.split === "heldout").length;
      expect(held).toBe(group.length / 2);
    }
  });

  it("keeps literal questions lexically close and paraphrases lexically far", () => {
    for (const q of data.questions) {
      const shared = overlap(q.text, byId.get(q.goldPassageId)!.text);
      if (q.style === "literal") expect(shared.length, q.text).toBeGreaterThanOrEqual(2);
      else expect(shared.length, `${q.text} shares ${shared}`).toBeLessThanOrEqual(1);
    }
  });

  it("makes distractors share keywords with questions but hold no numbers", () => {
    for (const p of data.passages.filter((x) => x.kind === "distractor")) {
      expect(p.text).not.toMatch(/\d{2,}/);
      expect(tokenize(p.text)).toEqual(expect.arrayContaining(["warranty", "battery", "wireless"]));
    }
  });
});
