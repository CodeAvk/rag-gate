import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generate } from "../src/corpus/synthetic.js";
import type { Summary } from "../src/eval/metrics.js";
import { markdownReport, writeJobSummary } from "../src/gate/report.js";
import { compareRuns, makeRecord, type RunConfig } from "../src/gate/runs.js";

const v1 = generate(1);
const config: RunConfig = { retriever: "bm25", corpus: "v1", seed: 1, split: "dev", topK: 10 };
const s = (recallAt1: number, recallAt5: number, mrr: number): Summary => ({ questions: 84, recallAt1, recallAt5, mrr });
const at = new Date("2026-11-11T09:00:00.000Z");
const base = makeRecord(config, v1, { all: s(0.6, 0.8, 0.7), paraphrase: s(0.2, 0.6, 0.4) }, at, "aaa1111");

describe("markdownReport", () => {
  it("shows every metric with its baseline and change, and passes cleanly", () => {
    const run = makeRecord(config, v1, { all: s(0.62, 0.8, 0.7), paraphrase: s(0.2, 0.6, 0.4) }, at, "bbb2222");
    const md = markdownReport(run, base, compareRuns(run, base));
    expect(md).toContain("### bm25_synthetic-v1-seed1_dev: ✅ no regression");
    expect(md).toContain("Commit `bbb2222`");
    expect(md).toContain("baseline from commit `aaa1111`");
    expect(md).toContain("| all | Recall@1 | 0.600 | 0.620 | +0.020 |");
    expect(md).toContain("| paraphrase | MRR | 0.400 | 0.400 | ±0.000 |");
    expect(md.match(/^\| (all|paraphrase) \|/gm)).toHaveLength(6);
    expect(md).not.toContain("❌");
  });

  it("marks each regression and a missing group", () => {
    const run = makeRecord(config, v1, { all: s(0.55, 0.8, 0.7) }, at, "ccc3333");
    const md = markdownReport(run, base, compareRuns(run, base));
    expect(md).toContain("❌ 4 regression(s)");
    expect(md).toContain("| all | Recall@1 | 0.600 | 0.550 | −0.050 ❌ |");
    expect(md).toContain("| paraphrase | Recall@5 | 0.600 | missing |  ❌ |");
  });

  it("lists current values only when there is no baseline", () => {
    const md = markdownReport(base, null, []);
    expect(md).toContain("⚪ no baseline");
    expect(md).toContain("| all | Recall@5 | 0.800 |");
    expect(md).not.toContain("baseline from");
  });
});

describe("writeJobSummary", () => {
  it("appends to GITHUB_STEP_SUMMARY and does nothing outside Actions", () => {
    const dir = mkdtempSync(join(tmpdir(), "rag-gate-summary-"));
    try {
      const file = join(dir, "summary.md");
      expect(writeJobSummary("a\n", { GITHUB_STEP_SUMMARY: file })).toBe(true);
      expect(writeJobSummary("b\n", { GITHUB_STEP_SUMMARY: file })).toBe(true);
      expect(readFileSync(file, "utf8")).toBe("a\nb\n");
      expect(writeJobSummary("c\n", {})).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
