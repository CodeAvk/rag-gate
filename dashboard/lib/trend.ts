/**
 * Score trend over the run history: one small panel per run config (retriever, dataset, seed, split),
 * each with two lines, all questions and paraphrased questions, plus the committed baseline values.
 * Pure functions only; the page draws the SVG from what these return.
 */
import { runKey, type RunRecord } from "./data";

export type Metric = "recallAt1" | "recallAt5" | "mrr";
export const METRIC_LABELS: Record<Metric, string> = { recallAt1: "Recall@1", recallAt5: "Recall@5", mrr: "MRR" };
export const SERIES = [
  { group: "all", label: "all questions" },
  { group: "paraphrase", label: "paraphrased questions" },
] as const;
export type Group = (typeof SERIES)[number]["group"];

export function parseMetric(value: unknown): Metric {
  return value === "recallAt5" || value === "mrr" ? value : "recallAt1";
}

export interface TrendPoint {
  t: number; // ms since epoch
  runId: string;
  commit: string | null;
  values: Partial<Record<Group, number>>;
}

export interface TrendPanel {
  key: string;
  retriever: string;
  dataset: string; // e.g. "synthetic-v2 dev" or "synthetic-v1 dev, seed 3"
  points: TrendPoint[]; // oldest first
  baseline: Partial<Record<Group, number>> | null;
}

/** Groups runs by config, oldest point first. Panels with a baseline come first, then by key. */
export function buildTrends(runs: RunRecord[], baselines: RunRecord[], metric: Metric): TrendPanel[] {
  const base = new Map(baselines.map((b) => [runKey(b), b]));
  const panels = new Map<string, TrendPanel>();
  for (const run of runs) {
    const key = runKey(run);
    let panel = panels.get(key);
    if (!panel) {
      const b = base.get(key);
      panel = {
        key,
        retriever: run.config.retriever,
        dataset: `${run.datasetVersion} ${run.config.split}${run.config.seed !== 1 ? `, seed ${run.config.seed}` : ""}`,
        points: [],
        baseline: b ? valuesOf(b, metric) : null,
      };
      panels.set(key, panel);
    }
    panel.points.push({ t: Date.parse(run.createdAt), runId: run.id, commit: run.commit, values: valuesOf(run, metric) });
  }
  for (const p of panels.values()) p.points.sort((a, b) => a.t - b.t || a.runId.localeCompare(b.runId));
  return [...panels.values()].sort((a, b) => Number(b.baseline !== null) - Number(a.baseline !== null) || a.key.localeCompare(b.key));
}

function valuesOf(r: RunRecord, metric: Metric): Partial<Record<Group, number>> {
  const out: Partial<Record<Group, number>> = {};
  for (const { group } of SERIES) {
    const v = r.summary[group]?.[metric];
    if (typeof v === "number") out[group] = v;
  }
  return out;
}

/** The shared time range of all panels, so panels can be compared side by side. */
export function timeDomain(panels: TrendPanel[]): [number, number] | null {
  const ts = panels.flatMap((p) => p.points.map((x) => x.t));
  if (ts.length === 0) return null;
  return [Math.min(...ts), Math.max(...ts)];
}

/** Maps a time to an x position; a single instant sits in the middle. */
export function xScale([t0, t1]: [number, number], left: number, right: number): (t: number) => number {
  if (t1 === t0) return () => (left + right) / 2;
  return (t) => left + ((t - t0) / (t1 - t0)) * (right - left);
}

/** Scores are 0..1, so the y axis is fixed at 0..1: a flat line is flat, not zoomed noise. */
export function yScale(top: number, bottom: number): (v: number) => number {
  return (v) => bottom - Math.min(1, Math.max(0, v)) * (bottom - top);
}

/** The latest value and its change from the baseline, for the direct label at the line end. */
export function latest(panel: TrendPanel, group: Group): { value: number; delta: number | null } | null {
  for (let i = panel.points.length - 1; i >= 0; i--) {
    const v = panel.points[i]!.values[group];
    if (v !== undefined) {
      const b = panel.baseline?.[group];
      return { value: v, delta: b === undefined ? null : v - b };
    }
  }
  return null;
}
