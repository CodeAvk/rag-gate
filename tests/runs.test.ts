import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generate, TEMPLATE_SETS } from "../src/corpus/synthetic.js";
import { evaluate, formatRegressions } from "../src/eval/run.js";
import type { Summary } from "../src/eval/metrics.js";
import { compareRuns, datasetHash, makeRecord, RunStore, runKey, type RunConfig } from "../src/gate/runs.js";
import { Bm25 } from "../src/retrieval/bm25.js";

const v1 = generate(1);
const config: RunConfig = { retriever: "bm25", corpus: "v1", seed: 1, split: "dev", topK: 10 };
const s = (recallAt1: number, recallAt5: number, mrr: number): Summary => ({ questions: 84, recallAt1, recallAt5, mrr });
const at = new Date("2026-11-10T09:30:00.000Z");

const dirs: string[] = [];
function tempStore() {
  const root = mkdtempSync(join(tmpdir(), "rag-gate-runs-"));
  dirs.push(root);
  return { root, store: new RunStore(join(root, "runs"), join(root, "baselines")) };
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("run records", () => {
  it("are keyed by config and fingerprint the exact dataset", () => {
    const r = makeRecord(config, v1, { all: s(0.9, 1, 0.95) }, at, "abc1234");
    expect(runKey(config, v1.version)).toBe("bm25_synthetic-v1-seed1_dev");
    expect(r.id).toBe("20261110T093000000Z_bm25_synthetic-v1-seed1_dev");
    expect(r).toMatchObject({ createdAt: at.toISOString(), commit: "abc1234", datasetVersion: "synthetic-v1" });
    expect(r.datasetHash).toMatch(/^[0-9a-f]{16}$/);
    expect(datasetHash(generate(2))).not.toBe(r.datasetHash);
    expect(datasetHash(generate(1, 0.5, TEMPLATE_SETS.v2!))).not.toBe(r.datasetHash);
  });
});

describe("compareRuns", () => {
  const base = makeRecord(config, v1, { all: s(0.9, 1, 0.95), paraphrase: s(0.8, 1, 0.9) }, at);

  it("passes when nothing drops, including improvements", () => {
    expect(compareRuns(base, base)).toEqual([]);
    const better = makeRecord(config, v1, { all: s(0.95, 1, 0.97), paraphrase: s(0.9, 1, 0.95) }, at);
    expect(compareRuns(better, base)).toEqual([]);
    expect(formatRegressions([])).toBe("no regression against the baseline");
  });

  it("flags every metric that drops, per group", () => {
    const worse = makeRecord(config, v1, { all: s(0.88, 1, 0.95), paraphrase: s(0.7, 0.98, 0.9) }, at);
    const regs = compareRuns(worse, base);
    expect(regs).toEqual([
      { group: "all", metric: "recallAt1", baseline: 0.9, current: 0.88 },
      { group: "paraphrase", metric: "recallAt1", baseline: 0.8, current: 0.7 },
      { group: "paraphrase", metric: "recallAt5", baseline: 1, current: 0.98 },
    ]);
    expect(formatRegressions(regs)).toContain("REGRESSION paraphrase recallAt1: 0.800 -> 0.700");
  });

  it("allows drops within the tolerance and treats a missing group as a regression", () => {
    const slight = makeRecord(config, v1, { all: s(0.89, 1, 0.95), paraphrase: s(0.79, 1, 0.9) }, at);
    expect(compareRuns(slight, base, 0.01)).toEqual([]);
    const missing = makeRecord(config, v1, { all: s(0.9, 1, 0.95) }, at);
    expect(compareRuns(missing, base).map((r) => r.group)).toEqual(["paraphrase", "paraphrase", "paraphrase"]);
  });

  it("refuses to compare runs on different data", () => {
    const other = makeRecord(config, generate(2), base.summary, at);
    expect(() => compareRuns(other, base)).toThrow(/dataset changed/);
  });
});

describe("RunStore", () => {
  it("appends runs, lists them by key, and round-trips a baseline", () => {
    const { root, store } = tempStore();
    expect(store.list()).toEqual([]);
    expect(store.baseline("bm25_synthetic-v1-seed1_dev")).toBeNull();

    const a = makeRecord(config, v1, { all: s(0.9, 1, 0.95) }, at);
    const b = makeRecord({ ...config, retriever: "gemini" }, v1, { all: s(1, 1, 1) }, at);
    store.append(a);
    store.append(b);
    expect(store.list().map((r) => r.config.retriever)).toEqual(["bm25", "gemini"]);
    expect(store.list("gemini_synthetic-v1-seed1_dev")).toEqual([b]);

    const file = store.saveBaseline(a);
    expect(file).toBe(join(root, "baselines", "bm25_synthetic-v1-seed1_dev.json"));
    expect(readFileSync(file, "utf8").endsWith("\n")).toBe(true);
    expect(store.baseline("bm25_synthetic-v1-seed1_dev")).toEqual(a);
  });

  it("gates a real BM25 run against its own baseline", async () => {
    const { store } = tempStore();
    const { summary } = await evaluate(new Bm25(v1.passages), v1, "dev");
    const first = makeRecord(config, v1, summary, at);
    store.saveBaseline(first);
    const again = makeRecord(config, v1, (await evaluate(new Bm25(v1.passages), v1, "dev")).summary, new Date());
    expect(compareRuns(again, store.baseline(runKey(config, v1.version))!)).toEqual([]);
  });
});
