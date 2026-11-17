import { describe, expect, it } from "vitest";
import { buildTrends, latest, parseMetric, timeDomain, xScale, yScale } from "../dashboard/lib/trend.js";
import { generate } from "../src/corpus/synthetic.js";
import type { Summary } from "../src/eval/metrics.js";
import { makeRecord, type RunConfig } from "../src/gate/runs.js";

const v1 = generate(1);
const bm25: RunConfig = { retriever: "bm25", corpus: "v1", seed: 1, split: "dev", topK: 10 };
const gemini: RunConfig = { ...bm25, retriever: "gemini" };
const s = (recallAt1: number, recallAt5 = 0.9, mrr = 0.8): Summary => ({ questions: 84, recallAt1, recallAt5, mrr });
const rec = (cfg: RunConfig, all: number, para: number | null, at: string) =>
  makeRecord(cfg, v1, para === null ? { all: s(all) } : { all: s(all), paraphrase: s(para) }, new Date(at), "abc1234");

describe("buildTrends", () => {
  const base = rec(bm25, 0.6, 0.2, "2026-11-10T00:00:00Z");
  const runs = [
    rec(bm25, 0.62, 0.25, "2026-11-12T00:00:00Z"),
    rec(gemini, 1, 1, "2026-11-11T00:00:00Z"),
    base,
    rec(bm25, 0.55, null, "2026-11-11T00:00:00Z"),
  ];

  it("makes one panel per config, baselined panels first, points oldest first", () => {
    const panels = buildTrends(runs, [base], "recallAt1");
    expect(panels.map((p) => [p.retriever, p.dataset, p.points.length])).toEqual([
      ["bm25", "synthetic-v1 dev", 3], ["gemini", "synthetic-v1 dev", 1],
    ]);
    expect(panels[0]!.points.map((p) => p.values)).toEqual([
      { all: 0.6, paraphrase: 0.2 }, { all: 0.55 }, { all: 0.62, paraphrase: 0.25 },
    ]);
    expect(panels[0]!.baseline).toEqual({ all: 0.6, paraphrase: 0.2 });
    expect(panels[1]!.baseline).toBeNull();
  });

  it("reads the chosen metric and labels a non-default seed", () => {
    const seeded = rec({ ...bm25, seed: 3 }, 0.5, 0.1, "2026-11-11T00:00:00Z");
    const [panel] = buildTrends([seeded], [], "recallAt5");
    expect(panel!.dataset).toBe("synthetic-v1 dev, seed 3");
    expect(panel!.points[0]!.values).toEqual({ all: 0.9, paraphrase: 0.9 });
  });

  it("gives the latest value of each line and its change from the baseline", () => {
    const [panel, noBase] = buildTrends(runs, [base], "recallAt1");
    expect(latest(panel!, "all")!.value).toBe(0.62);
    expect(latest(panel!, "all")!.delta).toBeCloseTo(0.02);
    expect(latest(noBase!, "paraphrase")).toEqual({ value: 1, delta: null });
    expect(latest(buildTrends([rec(bm25, 0.5, null, "2026-11-11T00:00:00Z")], [], "mrr")[0]!, "paraphrase")).toBeNull();
  });

  it("has no panels and no time range without runs", () => {
    expect(buildTrends([], [base], "mrr")).toEqual([]);
    expect(timeDomain([])).toBeNull();
  });
});

describe("scales", () => {
  it("shares one time range across panels and keeps scores on a fixed 0..1 axis", () => {
    const panels = buildTrends([rec(bm25, 0.5, 0.1, "2026-11-10T00:00:00Z"), rec(gemini, 1, 1, "2026-11-14T00:00:00Z")], [], "recallAt1");
    const d = timeDomain(panels)!;
    expect(d).toEqual([Date.parse("2026-11-10T00:00:00Z"), Date.parse("2026-11-14T00:00:00Z")]);
    const x = xScale(d, 30, 330);
    expect(x(d[0])).toBe(30);
    expect(x(d[1])).toBe(330);
    expect(x((d[0] + d[1]) / 2)).toBe(180);
    expect(xScale([5, 5], 30, 330)(5)).toBe(180);
    const y = yScale(10, 110);
    expect([y(0), y(0.5), y(1), y(1.4), y(-1)]).toEqual([110, 60, 10, 10, 110]);
  });

  it("falls back to Recall@1 for an unknown metric", () => {
    expect(parseMetric("mrr")).toBe("mrr");
    expect(parseMetric("recallAt5")).toBe("recallAt5");
    expect(parseMetric(["mrr"])).toBe("recallAt1");
    expect(parseMetric(undefined)).toBe("recallAt1");
  });
});
