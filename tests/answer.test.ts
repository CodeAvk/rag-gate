import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerCache, answerQuestion, buildPrompt, containsExpected, type Answer } from "../src/answer/answer.js";
import { parseAnswerArgs, sampleQuestions } from "../src/answer/run.js";
import { generate } from "../src/corpus/synthetic.js";
import { V2 } from "../src/corpus/synthetic-v2.js";
import { DailyCapError, generateJson, pacificDate, UsageCounter } from "../src/gemini/generate.js";
import type { Hit, Retriever } from "../src/retrieval/bm25.js";

const dirs: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), "rag-gate-answer-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function fakeFetch(reply: unknown, status = 200, calls: { url: string; body: any }[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
}
const reply = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

describe("pacificDate and UsageCounter", () => {
  it("dates the quota day in Pacific time", () => {
    expect(pacificDate(new Date("2026-11-12T07:59:00Z"))).toBe("2026-11-11");
    expect(pacificDate(new Date("2026-11-12T08:01:00Z"))).toBe("2026-11-12");
  });

  it("counts requests per day, persists them, and refuses past the cap", () => {
    const file = join(temp(), "usage.json");
    let now = new Date("2026-11-12T12:00:00Z");
    const counter = new UsageCounter(file, 2, () => now);
    expect(counter.take()).toBe(1);
    expect(new UsageCounter(file, 2, () => now).take()).toBe(2);
    expect(() => counter.take()).toThrow(DailyCapError);
    now = new Date("2026-11-13T12:00:00Z");
    expect(counter.used()).toBe(0);
    expect(counter.take()).toBe(1);
  });
});

describe("generateJson", () => {
  it("sends a JSON-schema request at temperature 0 and parses the reply", async () => {
    const calls: { url: string; body: any }[] = [];
    const usage = new UsageCounter(join(temp(), "u.json"), 5);
    const out = await generateJson<Answer>("prompt", { type: "OBJECT" },
      { model: "m", apiKey: "k", usage, fetchImpl: fakeFetch(reply({ answer: "24 months", citations: ["a#b"] }), 200, calls) });
    expect(out).toEqual({ answer: "24 months", citations: ["a#b"] });
    expect(calls[0]!.url).toMatch(/models\/m:generateContent$/);
    expect(calls[0]!.body.generationConfig).toMatchObject({ temperature: 0, responseMimeType: "application/json" });
    expect(usage.used()).toBe(1);
  });

  it("counts failed requests and explains empty or blocked replies", async () => {
    const usage = new UsageCounter(join(temp(), "u.json"), 5);
    const opts = { model: "m", apiKey: "k", usage };
    await expect(generateJson("p", {}, { ...opts, fetchImpl: fakeFetch({ error: { message: "quota" } }, 429) })).rejects.toThrow(/429/);
    await expect(generateJson("p", {}, { ...opts, fetchImpl: fakeFetch({ promptFeedback: { blockReason: "SAFETY" } }) }))
      .rejects.toThrow(/blockReason SAFETY/);
    expect(usage.used()).toBe(2);
  });
});

describe("grounded answering", () => {
  const passages = [
    { id: "p#warranty", text: "The P has a 24 month warranty." },
    { id: "q#warranty", text: "The Q has a 12 month warranty." },
  ];
  const textOf = new Map(passages.map((p) => [p.id, p.text]));
  const retriever: Retriever = { name: "fixed", search: async (): Promise<Hit[]> => passages.map((p, i) => ({ id: p.id, score: 1 - i })) };

  it("puts every retrieved passage in the prompt with its id", () => {
    const prompt = buildPrompt("How long is the P covered?", passages);
    expect(prompt).toContain("[p#warranty] The P has a 24 month warranty.");
    expect(prompt).toContain('"answer": null');
    expect(prompt.endsWith("Question: How long is the P covered?")).toBe(true);
  });

  it("asks once, then serves the same prompt from the cache", async () => {
    const cache = new AnswerCache(join(temp(), "cache.json"));
    let asked = 0;
    const gen = async (): Promise<Answer> => {
      asked++;
      return { answer: " 24 months ", citations: ["p#warranty", 7 as unknown as string] };
    };
    const first = await answerQuestion("How long is the P covered?", retriever, textOf, gen, cache, "m");
    expect(first).toMatchObject({ answer: "24 months", citations: ["p#warranty"], retrieved: ["p#warranty", "q#warranty"], cached: false });
    const again = await answerQuestion("How long is the P covered?", retriever, textOf, gen, cache, "m");
    expect(again.cached).toBe(true);
    expect(asked).toBe(1);
  });

  it("treats an empty answer as an abstention", async () => {
    const out = await answerQuestion("What colour is it?", retriever, textOf,
      async () => ({ answer: "", citations: [] }), new AnswerCache(null), "m");
    expect(out.answer).toBeNull();
  });

  it("checks the expected number as a whole number", () => {
    expect(containsExpected("24 months", "24")).toBe(true);
    expect(containsExpected("124 months", "24")).toBe(false);
    expect(containsExpected("down to −10 °C", "-10")).toBe(true);
    expect(containsExpected(null, "24")).toBe(false);
  });
});

describe("answer CLI", () => {
  it("defaults to a small v2 sample and bounds the limit", () => {
    expect(parseAnswerArgs([])).toEqual({ corpus: "v2", retriever: "gemini+product", limit: 6, model: "gemini-2.5-flash-lite", dropGold: false });
    expect(() => parseAnswerArgs(["--limit", "50"])).toThrow(/limit/);
    expect(() => parseAnswerArgs(["--corpus", "v9"])).toThrow(/corpus/);
  });

  it("samples dev questions only, split between styles and spread across products", () => {
    const qs = sampleQuestions(generate(1, 0.5, V2).questions, 6);
    expect(qs).toHaveLength(6);
    expect(qs.every((q) => q.split === "dev")).toBe(true);
    expect(qs.filter((q) => q.style === "literal")).toHaveLength(3);
    expect(new Set(qs.map((q) => q.goldPassageId.split("#")[0])).size).toBeGreaterThan(3);
  });
});
