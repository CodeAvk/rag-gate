/**
 * Gate 0 probe: measure what the Gemini free tier allows for embeddings.
 * Sends only synthetic sentences. Every HTTP call counts toward a hard local cap,
 * and real limits are read from Google's own 429 messages rather than guessed.
 *
 * Usage: npm run probe            (PROBE_MAX_CALLS caps total calls, default 60)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadApiKey } from "../env.js";
import { embedBatch, embedOne, GeminiHttpError, parseQuotaError, type QuotaInfo } from "../gemini/embed.js";

const MODELS = ["gemini-embedding-001", "gemini-embedding-2"];
const MAX_CALLS = Number(process.env.PROBE_MAX_CALLS ?? 60);
const RATE_PROBE_CALLS = Number(process.env.PROBE_RATE_CALLS ?? 40);

let calls = 0;
function spend() {
  if (calls >= MAX_CALLS) throw new Error(`local cap of ${MAX_CALLS} calls reached`);
  calls += 1;
}

export function syntheticSentences(n: number): string[] {
  const things = ["blue widget", "copper valve", "paper lantern", "steel hinge", "glass bead"];
  return Array.from({ length: n }, (_, i) =>
    `Synthetic note ${i}: the ${things[i % things.length]} ships on day ${(i % 28) + 1}.`);
}

interface Outcome {
  ok: boolean;
  ms: number;
  dimensions?: number;
  count?: number;
  status?: number;
  error?: string;
  quota?: QuotaInfo;
}

async function attempt(fn: () => Promise<number[] | number[][]>): Promise<Outcome> {
  spend();
  const start = performance.now();
  try {
    const out = await fn();
    const ms = Math.round(performance.now() - start);
    const vectors = Array.isArray(out[0]) ? (out as number[][]) : [out as number[]];
    return { ok: true, ms, dimensions: vectors[0]?.length, count: vectors.length };
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    if (err instanceof GeminiHttpError) {
      return { ok: false, ms, status: err.status, error: err.detail,
               quota: err.status === 429 ? parseQuotaError(err.detail) : undefined };
    }
    return { ok: false, ms, error: String(err) };
  }
}

async function main() {
  const apiKey = loadApiKey();
  const report: Record<string, unknown> = { startedAt: new Date().toISOString(), maxCalls: MAX_CALLS };

  // 1. Does each model answer, and with how many dimensions by default?
  const single: Record<string, Outcome> = {};
  for (const model of MODELS) {
    single[model] = await attempt(() => embedOne(syntheticSentences(1)[0]!, { model, apiKey }));
  }
  report.single = single;

  // 2. Batch size: 100 items, then 250 only if 100 worked (the error states the real maximum).
  const model = MODELS[0]!;
  const batch: Record<number, Outcome> = {};
  for (const size of [100, 250]) {
    batch[size] = await attempt(() =>
      embedBatch(syntheticSentences(size), { model, apiKey, taskType: "RETRIEVAL_DOCUMENT" }));
    if (!batch[size]!.ok) break;
  }
  report.batch = batch;

  // 3. Rate: back-to-back single calls until the first 429 or the call budget runs out.
  const rate = { attempted: 0, succeeded: 0, firstFailure: undefined as Outcome | undefined, ms: 0 };
  const start = performance.now();
  for (let i = 0; i < RATE_PROBE_CALLS && calls < MAX_CALLS; i++) {
    const out = await attempt(() => embedOne(`Synthetic rate probe ${i}.`, { model, apiKey }));
    rate.attempted += 1;
    if (out.ok) rate.succeeded += 1;
    else {
      rate.firstFailure = out;
      break;
    }
  }
  rate.ms = Math.round(performance.now() - start);
  report.rate = rate;
  report.totalCalls = calls;
  report.finishedAt = new Date().toISOString();

  mkdirSync("data/gate0", { recursive: true });
  const file = `data/gate0/probe-${Date.now()}.json`;
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`report written to ${file}`);
}

if (process.argv[1]?.endsWith("probe.ts")) {
  main().catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
}
