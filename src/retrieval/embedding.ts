/**
 * Embedding retrieval: passages and queries are embedded with Gemini and ranked by cosine similarity.
 *
 * Vectors are cached on disk by content hash, one file per model, size and task type, so a passage
 * or question is sent to the API once and every later run is free. A limiter keeps item requests
 * under the measured free-tier limit (100 per minute; batch items count individually).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { embedBatch, GeminiHttpError, parseQuotaError, type TaskType } from "../gemini/embed.js";
import type { Doc, Hit, Retriever } from "./bm25.js";

export type BatchEmbedder = (texts: string[], taskType: TaskType) => Promise<number[][]>;

export const hashText = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** On-disk vector cache keyed by text hash. */
export class VectorCache {
  private readonly vectors: Record<string, number[]>;

  constructor(readonly path: string | null) {
    this.vectors = path && existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).vectors : {};
  }

  get(text: string) {
    return this.vectors[hashText(text)];
  }

  set(text: string, vector: number[]) {
    this.vectors[hashText(text)] = vector;
  }

  save() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify({ count: Object.keys(this.vectors).length, vectors: this.vectors }));
  }
}

/** Sliding one-minute window over item requests. `now` and `sleep` are injectable for tests. */
export class RateLimiter {
  private stamps: number[] = [];

  constructor(
    readonly perMinute: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async take(items: number) {
    if (items > this.perMinute) throw new Error(`batch of ${items} exceeds ${this.perMinute} per minute`);
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < 60_000);
      if (this.stamps.length + items <= this.perMinute) {
        for (let i = 0; i < items; i++) this.stamps.push(t);
        return;
      }
      await this.sleep(60_000 - (t - this.stamps[0]!) + 50);
    }
  }
}

export interface EmbedPlan {
  embed: BatchEmbedder;
  limiter: RateLimiter;
  batchSize: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Embed every text missing from the cache, in paced batches, retrying after a 429. Returns API items sent. */
export async function fillCache(texts: string[], taskType: TaskType, cache: VectorCache, plan: EmbedPlan) {
  const missing = [...new Set(texts)].filter((t) => !cache.get(t));
  const sleep = plan.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let sent = 0;
  for (let i = 0; i < missing.length; i += plan.batchSize) {
    const batch = missing.slice(i, i + plan.batchSize);
    for (let attempt = 0; ; attempt++) {
      await plan.limiter.take(batch.length);
      sent += batch.length;
      try {
        const vectors = await plan.embed(batch, taskType);
        batch.forEach((t, j) => cache.set(t, vectors[j]!));
        break;
      } catch (err) {
        if (!(err instanceof GeminiHttpError) || err.status !== 429 || attempt >= (plan.retries ?? 2)) throw err;
        await sleep(((parseQuotaError(err.detail).retryAfterSeconds ?? 30) + 1) * 1000);
      }
    }
    cache.save(); // keep progress if a later batch fails
  }
  return sent;
}

export class EmbeddingRetriever implements Retriever {
  constructor(
    readonly name: string,
    private readonly docs: Doc[],
    private readonly docCache: VectorCache,
    private readonly queryCache: VectorCache,
    private readonly plan: EmbedPlan,
  ) {}

  /** Embed any passages not yet cached. Call once before searching. */
  async build() {
    return fillCache(this.docs.map((d) => d.text), "RETRIEVAL_DOCUMENT", this.docCache, this.plan);
  }

  /** Embed queries ahead of time in batches, so an eval run does not send them one by one. */
  async prepareQueries(queries: string[]) {
    return fillCache(queries, "RETRIEVAL_QUERY", this.queryCache, this.plan);
  }

  async search(query: string, k: number): Promise<Hit[]> {
    await fillCache([query], "RETRIEVAL_QUERY", this.queryCache, this.plan);
    const q = this.queryCache.get(query)!;
    return this.docs
      .map((d) => ({ id: d.id, score: cosine(q, this.docCache.get(d.text) ?? []) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, k);
  }
}

/** Gemini-backed retriever with on-disk caches under data/index/. */
export function geminiRetriever(docs: Doc[], apiKey: string, model = "gemini-embedding-001", dimensions = 768) {
  const file = (task: TaskType) => `data/index/${model}-${dimensions}-${task}.json`;
  const embed: BatchEmbedder = (texts, taskType) => embedBatch(texts, { model, apiKey, taskType, dimensions });
  return new EmbeddingRetriever(`gemini:${model}:${dimensions}`, docs,
    new VectorCache(file("RETRIEVAL_DOCUMENT")), new VectorCache(file("RETRIEVAL_QUERY")),
    { embed, limiter: new RateLimiter(90), batchSize: 30 });
}
