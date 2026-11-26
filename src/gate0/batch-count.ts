/**
 * Gate 0 follow-up: does each text in a batch count toward the free-tier limit of
 * 100 embed requests per minute, or does a batch count once?
 *
 * After an idle wait (so the minute window is clear), the probe sends batches of 10
 * synthetic sentences back to back, 15 batches at most (150 texts in 15 HTTP calls):
 * - if each text counts, Google refuses the 11th batch (texts 101 to 110);
 * - if a batch counts once, all 15 batches pass, 150 texts in under a minute.
 * Every call counts toward a hard local cap, and limits are read from Google's 429 message.
 *
 * Usage: npm run probe:batch   (PROBE_WAIT_SECONDS sets the idle wait, default 65)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadApiKey } from "../env.js";
import { embedBatch, GeminiHttpError, parseQuotaError, type QuotaInfo } from "../gemini/embed.js";
import { syntheticSentences } from "./probe.js";

export const MODEL = "gemini-embedding-001";
export const BATCH_SIZE = 10;
export const MAX_BATCHES = 15;
/** Per-minute limit measured on 2026-11-03 (docs/GATE0_RESULTS.md). */
export const MINUTE_LIMIT = 100;

export interface BatchOutcome {
  ok: boolean;
  ms: number;
  status?: number;
  error?: string;
  quota?: QuotaInfo;
}

export type BatchCounting = "per-text" | "per-batch" | "inconclusive";

export interface BatchCountVerdict {
  counting: BatchCounting;
  reason: string;
  batchesAccepted: number;
  textsAccepted: number;
}

/**
 * Read the outcome of the probe. Only a clean result gives a verdict: all batches sent
 * within one minute, and either a quota refusal exactly when the texts would pass the
 * limit (per text), or more texts than the limit accepted with no refusal (per batch).
 */
export function interpretBatchCount(
  outcomes: BatchOutcome[],
  batchSize: number,
  elapsedMs: number,
  limit = MINUTE_LIMIT,
): BatchCountVerdict {
  const refusal = outcomes.findIndex((o) => !o.ok);
  const batchesAccepted = refusal === -1 ? outcomes.length : refusal;
  const textsAccepted = batchesAccepted * batchSize;
  const verdict = (counting: BatchCounting, reason: string) =>
    ({ counting, reason, batchesAccepted, textsAccepted });

  if (elapsedMs > 60_000) {
    return verdict("inconclusive", `the batches took ${Math.round(elapsedMs / 1000)} s, more than one minute`);
  }
  if (refusal === -1) {
    if (textsAccepted > limit) {
      return verdict("per-batch", `${textsAccepted} texts in ${batchesAccepted} calls were accepted, above the limit of ${limit}`);
    }
    return verdict("inconclusive", `only ${textsAccepted} texts were sent, not more than the limit of ${limit}`);
  }
  const failed = outcomes[refusal]!;
  if (failed.status !== 429) {
    return verdict("inconclusive", `batch ${refusal + 1} failed with HTTP ${failed.status ?? "error"}, not a quota refusal`);
  }
  if (textsAccepted <= limit && textsAccepted + batchSize > limit) {
    return verdict("per-text", `batch ${refusal + 1} was refused once the texts would pass ${limit}, after ${batchesAccepted} calls`);
  }
  return verdict("inconclusive", `batch ${refusal + 1} was refused after ${textsAccepted} texts; the minute window was probably not clear`);
}

async function main() {
  const apiKey = loadApiKey();
  const waitSeconds = Number(process.env.PROBE_WAIT_SECONDS ?? 65);
  console.log(`waiting ${waitSeconds} s so the per-minute window is clear`);
  await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));

  const outcomes: BatchOutcome[] = [];
  const sentences = syntheticSentences(BATCH_SIZE * MAX_BATCHES);
  const start = performance.now();
  for (let i = 0; i < MAX_BATCHES; i++) {
    const texts = sentences.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const callStart = performance.now();
    try {
      await embedBatch(texts, { model: MODEL, apiKey, taskType: "RETRIEVAL_DOCUMENT" });
      outcomes.push({ ok: true, ms: Math.round(performance.now() - callStart) });
    } catch (err) {
      const ms = Math.round(performance.now() - callStart);
      if (err instanceof GeminiHttpError) {
        outcomes.push({ ok: false, ms, status: err.status, error: err.detail,
          quota: err.status === 429 ? parseQuotaError(err.detail) : undefined });
      } else {
        outcomes.push({ ok: false, ms, error: String(err) });
      }
      break;
    }
  }
  const elapsedMs = Math.round(performance.now() - start);

  const report = {
    finishedAt: new Date().toISOString(),
    model: MODEL,
    batchSize: BATCH_SIZE,
    calls: outcomes.length,
    elapsedMs,
    outcomes,
    verdict: interpretBatchCount(outcomes, BATCH_SIZE, elapsedMs),
  };
  mkdirSync("data/gate0", { recursive: true });
  const file = `data/gate0/batch-count-${Date.now()}.json`;
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`report written to ${file}`);
}

if (process.argv[1]?.endsWith("batch-count.ts")) {
  main().catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
}
