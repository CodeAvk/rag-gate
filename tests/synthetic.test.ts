import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generate, TEMPLATE_SETS, V1 } from "../src/corpus/synthetic.js";
import { V2 } from "../src/corpus/synthetic-v2.js";
import { tokenize } from "../src/text/tokenize.js";

describe("synthetic-v1 stays fixed", () => {
  it("produces exactly the dataset its cached embeddings and results were built from", () => {
    const hash = createHash("sha256").update(JSON.stringify(generate(1))).digest("hex");
    expect(hash).toBe("09e66a01f0fbdde8d23a99fb293e4c4d192bed905170b10e0b58abea83c160aa");
  });

  it("is registered with v2 under short names", () => {
    expect(TEMPLATE_SETS).toEqual({ v1: V1, v2: V2 });
  });
});

describe.each([V1, V2])("$version", (set) => {
  const data = generate(1, 0.5, set);
  const byId = new Map(data.passages.map((p) => [p.id, p]));
  const nameTokens = new Set(set.families.flatMap((f) => tokenize(f)).concat(set.models.flatMap((m) => tokenize(m))));

  /** Content words a question shares with a passage, ignoring the product name. */
  const overlap = (question: string, passage: string) => {
    const p = new Set(tokenize(passage));
    return [...new Set(tokenize(question))].filter((t) => p.has(t) && !nameTokens.has(t));
  };

  it("is deterministic for a seed and differs across seeds", () => {
    expect(generate(1, 0.5, set)).toEqual(data);
    expect(generate(2, 0.5, set).passages.map((p) => p.text)).not.toEqual(data.passages.map((p) => p.text));
  });

  it("has the expected size and unique ids", () => {
    const products = set.families.length * set.models.length;
    expect(data.version).toBe(set.version);
    expect(data.passages.filter((p) => p.kind === "fact")).toHaveLength(products * set.facts.length);
    expect(data.passages.filter((p) => p.kind === "distractor")).toHaveLength(products);
    expect(data.questions).toHaveLength(products * set.facts.length * 2);
    expect(new Set(data.passages.map((p) => p.id)).size).toBe(data.passages.length);
    expect(new Set(data.questions.map((q) => q.id)).size).toBe(data.questions.length);
  });

  it("points every question at a fact passage that contains the answer", () => {
    for (const q of data.questions) {
      const gold = byId.get(q.goldPassageId);
      expect(gold?.kind).toBe("fact");
      for (const num of q.answer.match(/-?\d+/g) ?? []) expect(gold!.text).toContain(num);
      expect(q.text).not.toMatch(/\d{2,}/); // questions never leak the answer
    }
  });

  it("splits dev and held-out evenly within each style", () => {
    for (const style of ["literal", "paraphrase"]) {
      const group = data.questions.filter((q) => q.style === style);
      expect(group.filter((q) => q.split === "heldout")).toHaveLength(group.length / 2);
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

describe("synthetic-v2 is harder than v1", () => {
  const v2 = generate(1, 0.5, V2);

  it("uses both wordings for every fact", () => {
    for (const fact of V2.facts) {
      const texts = new Set(v2.passages.filter((p) => p.id.endsWith(`#${fact.key}`))
        .map((p) => p.text.replace(/\b(Kestrel|Marlow|Quillon|Tamber|Orrin|Vesper)( \d( Pro| Lite)?)?/g, "N")
          .replace(/-?\d+/g, "#")));
      expect(texts.size, fact.key).toBe(2);
    }
  });

  it("has twice as many look-alike products and longer passages", () => {
    const v1 = generate(1);
    const avg = (d: typeof v1) => d.passages.reduce((a, p) => a + p.text.length, 0) / d.passages.length;
    expect(V2.models.length).toBe(2 * V1.models.length);
    expect(avg(v2)).toBeGreaterThan(avg(v1));
  });
});
