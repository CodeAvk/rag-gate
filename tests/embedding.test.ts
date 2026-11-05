import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GeminiHttpError, type TaskType } from "../src/gemini/embed.js";
import {
  cosine, EmbeddingRetriever, fillCache, RateLimiter, VectorCache, type BatchEmbedder,
} from "../src/retrieval/embedding.js";
import { tokenize } from "../src/text/tokenize.js";

const VOCAB = ["boat", "lake", "kite", "hill", "market", "water", "sky"];
const SYNONYMS: Record<string, string> = { ship: "boat", pond: "lake" };

/** Fake embedder: bag of words over a tiny vocabulary, with a few synonyms, so tests stay offline. */
function fakeEmbedder(log: { batches: string[][]; tasks: TaskType[] } = { batches: [], tasks: [] }): BatchEmbedder {
  return async (texts, task) => {
    log.batches.push(texts);
    log.tasks.push(task);
    return texts.map((t) => {
      const words = tokenize(t).map((w) => SYNONYMS[w] ?? w);
      return VOCAB.map((v) => words.filter((w) => w === v).length);
    });
  };
}

const noWait = new RateLimiter(1000, () => 0, async () => {});
const docs = [
  { id: "a", text: "A kite over the hill." },
  { id: "b", text: "A boat on the lake." },
  { id: "c", text: "Things sold at the market." },
];

describe("cosine", () => {
  it("is 1 for parallel vectors, 0 for orthogonal or empty ones", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([], [])).toBe(0);
  });
});

describe("EmbeddingRetriever", () => {
  it("finds a passage by meaning when the words differ", async () => {
    const r = new EmbeddingRetriever("fake", docs, new VectorCache(null), new VectorCache(null),
      { embed: fakeEmbedder(), limiter: noWait, batchSize: 10 });
    await r.build();
    expect((await r.search("ship on a pond", 3))[0]!.id).toBe("b");
  });

  it("uses document and query task types", async () => {
    const log = { batches: [] as string[][], tasks: [] as TaskType[] };
    const r = new EmbeddingRetriever("fake", docs, new VectorCache(null), new VectorCache(null),
      { embed: fakeEmbedder(log), limiter: noWait, batchSize: 10 });
    await r.build();
    await r.search("kite", 1);
    expect(log.tasks).toEqual(["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]);
  });

  it("never re-embeds cached text, across runs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rag-gate-idx-"));
    const plan = { embed: fakeEmbedder(), limiter: noWait, batchSize: 2 };
    const first = new EmbeddingRetriever("fake", docs, new VectorCache(join(dir, "d.json")),
      new VectorCache(join(dir, "q.json")), plan);
    expect(await first.build()).toBe(3);
    await first.prepareQueries(["kite", "kite", "boat"]);
    const log = { batches: [] as string[][], tasks: [] as TaskType[] };
    const second = new EmbeddingRetriever("fake", docs, new VectorCache(join(dir, "d.json")),
      new VectorCache(join(dir, "q.json")), { ...plan, embed: fakeEmbedder(log) });
    expect(await second.build()).toBe(0);
    await second.search("kite", 1);
    expect(log.batches).toEqual([]);
  });
});

describe("fillCache", () => {
  it("splits work into batches and sends duplicates once", async () => {
    const log = { batches: [] as string[][], tasks: [] as TaskType[] };
    const sent = await fillCache(["a", "b", "c", "a"], "RETRIEVAL_DOCUMENT", new VectorCache(null),
      { embed: fakeEmbedder(log), limiter: noWait, batchSize: 2 });
    expect(sent).toBe(3);
    expect(log.batches).toEqual([["a", "b"], ["c"]]);
  });

  it("waits the delay Google gives after a 429, then succeeds", async () => {
    let calls = 0;
    const waits: number[] = [];
    const flaky: BatchEmbedder = async (texts) => {
      calls += 1;
      if (calls === 1) throw new GeminiHttpError(429, "Quota exceeded. Please retry in 12.2s.");
      return texts.map(() => [1]);
    };
    const cache = new VectorCache(null);
    await fillCache(["x"], "RETRIEVAL_QUERY", cache,
      { embed: flaky, limiter: noWait, batchSize: 5, sleep: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([13_000]);
    expect(cache.get("x")).toEqual([1]);
  });

  it("gives up after the retry budget and rethrows other errors at once", async () => {
    const always429: BatchEmbedder = async () => { throw new GeminiHttpError(429, "retry in 1s"); };
    await expect(fillCache(["x"], "RETRIEVAL_QUERY", new VectorCache(null),
      { embed: always429, limiter: noWait, batchSize: 1, retries: 1, sleep: async () => {} }))
      .rejects.toThrow(/429/);
    const bad: BatchEmbedder = async () => { throw new GeminiHttpError(400, "bad"); };
    await expect(fillCache(["x"], "RETRIEVAL_QUERY", new VectorCache(null),
      { embed: bad, limiter: noWait, batchSize: 1, sleep: async () => {} })).rejects.toThrow(/400/);
  });
});

describe("RateLimiter", () => {
  it("waits for the window to clear once the per-minute budget is used", async () => {
    let t = 0;
    const slept: number[] = [];
    const limiter = new RateLimiter(10, () => t, async (ms) => { slept.push(ms); t += ms; });
    await limiter.take(6);
    await limiter.take(4);
    expect(slept).toEqual([]);
    t = 1_000;
    await limiter.take(3);
    expect(slept).toEqual([59_050]);
  });

  it("rejects a batch larger than the budget", async () => {
    await expect(new RateLimiter(5).take(6)).rejects.toThrow(/exceeds/);
  });
});
