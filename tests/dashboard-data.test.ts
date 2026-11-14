import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDashboard, repoRoot, statusAgainst } from "../dashboard/lib/data.js";
import { generate } from "../src/corpus/synthetic.js";
import type { Summary } from "../src/eval/metrics.js";
import { compareRuns, makeRecord, type RunConfig, type RunRecord } from "../src/gate/runs.js";

const v1 = generate(1);
const config: RunConfig = { retriever: "bm25", corpus: "v1", seed: 1, split: "dev", topK: 10 };
const s = (recallAt1: number, recallAt5: number, mrr: number): Summary => ({ questions: 84, recallAt1, recallAt5, mrr });
const rec = (summary: Record<string, Summary>, at: string, data = v1, cfg = config) => makeRecord(cfg, data, summary, new Date(at), "abc1234");
const base = rec({ all: s(0.6, 0.8, 0.7), paraphrase: s(0.2, 0.6, 0.4) }, "2026-11-10T00:00:00Z");

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("dashboard status agrees with the CI gate", () => {
  const cases: [string, RunRecord][] = [
    ["identical", base],
    ["improved", rec({ all: s(0.7, 0.9, 0.8), paraphrase: s(0.3, 0.7, 0.5) }, "2026-11-11T00:00:00Z")],
    ["one metric down", rec({ all: s(0.6, 0.79, 0.7), paraphrase: s(0.2, 0.6, 0.4) }, "2026-11-11T00:00:00Z")],
    ["group missing", rec({ all: s(0.6, 0.8, 0.7) }, "2026-11-11T00:00:00Z")],
  ];
  it.each(cases)("%s", (_name, run) => {
    const gate = compareRuns(run, base);
    const shown = statusAgainst(run, base);
    expect(shown.status).toBe(gate.length ? "regression" : "pass");
    expect(shown.regressions).toHaveLength(gate.length);
  });

  it("reports a changed dataset or a missing baseline instead of comparing", () => {
    const other = rec(base.summary, "2026-11-11T00:00:00Z", generate(2));
    expect(() => compareRuns(other, base)).toThrow(/dataset changed/);
    expect(statusAgainst(other, base).status).toBe("dataset changed");
    expect(statusAgainst(base, undefined).status).toBe("no baseline");
  });
});

describe("loadDashboard", () => {
  it("reads baselines and history, newest run first, with a status per run", () => {
    const root = mkdtempSync(join(tmpdir(), "rag-gate-dash-"));
    dirs.push(root);
    mkdirSync(join(root, "baselines"));
    writeFileSync(join(root, "baselines", "bm25_synthetic-v1-seed1_dev.json"), JSON.stringify(base));
    mkdirSync(join(root, "data", "runs"), { recursive: true });
    const worse = rec({ all: s(0.5, 0.8, 0.7), paraphrase: s(0.2, 0.6, 0.4) }, "2026-11-12T00:00:00Z");
    const gemini = rec(base.summary, "2026-11-11T00:00:00Z", v1, { ...config, retriever: "gemini" });
    for (const r of [base, worse, gemini]) appendFileSync(join(root, "data", "runs", "runs.jsonl"), JSON.stringify(r) + "\n");

    const d = loadDashboard(root);
    expect(d.historyFound).toBe(true);
    expect(d.baselines).toEqual([base]);
    expect(d.runs.map((r) => [r.run.config.retriever, r.status])).toEqual([
      ["bm25", "regression"], ["gemini", "no baseline"], ["bm25", "pass"],
    ]);
    expect(d.runs[0]!.regressions).toEqual(["all Recall@1 0.600 -> 0.500"]);
  });

  it("handles a fresh clone with no history and no baselines", () => {
    const root = mkdtempSync(join(tmpdir(), "rag-gate-dash-"));
    dirs.push(root);
    expect(loadDashboard(root)).toEqual({ root, baselines: [], runs: [], historyFound: false });
  });

  it("finds the repository root from RAG_GATE_ROOT or the parent folder", () => {
    expect(repoRoot({ RAG_GATE_ROOT: "/srv/rag-gate" }, "/x")).toBe(resolve("/srv/rag-gate"));
    expect(repoRoot({}, resolve("/repo/dashboard"))).toBe(resolve("/repo"));
  });
});
