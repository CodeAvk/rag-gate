/**
 * Run store and regression check.
 *
 * Every evaluation run is appended to a local history (`data/runs/runs.jsonl`, git-ignored) with
 * its config, a fingerprint of the exact dataset it scored, and its metrics. A run can be promoted
 * to the baseline for its config (`baselines/<key>.json`, committed), and later runs of the same
 * config are compared against it: any metric that drops by more than the tolerance is a regression.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Dataset } from "../corpus/synthetic.js";
import type { Summary } from "../eval/metrics.js";

export interface RunConfig {
  retriever: string;
  corpus: string;
  seed: number;
  split: "dev" | "heldout";
  topK: number;
}

export interface RunRecord {
  id: string;
  createdAt: string;
  commit: string | null;
  config: RunConfig;
  datasetVersion: string;
  datasetHash: string;
  summary: Record<string, Summary>;
}

export const METRICS = ["recallAt1", "recallAt5", "mrr"] as const;
export type Metric = (typeof METRICS)[number];

export interface Regression {
  group: string; // "all", "literal", "paraphrase"
  metric: Metric;
  baseline: number;
  current: number;
}

/** Short fingerprint of a dataset, so a baseline is only compared with runs on the same data. */
export function datasetHash(data: Dataset): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
}

/** One baseline per config: retriever, dataset version, seed and split. */
export function runKey(config: RunConfig, datasetVersion: string): string {
  return `${config.retriever}_${datasetVersion}-seed${config.seed}_${config.split}`;
}

export function makeRecord(
  config: RunConfig, data: Dataset, summary: Record<string, Summary>,
  now = new Date(), commit: string | null = null,
): RunRecord {
  const createdAt = now.toISOString();
  return {
    id: `${createdAt.replace(/[-:.]/g, "")}_${runKey(config, data.version)}`,
    createdAt, commit, config, datasetVersion: data.version, datasetHash: datasetHash(data), summary,
  };
}

/**
 * Metrics that fell by more than `tolerance` (absolute, on the 0..1 scale) in any group the
 * baseline has. A group missing from the current run counts as a regression on every metric.
 */
export function compareRuns(current: RunRecord, baseline: RunRecord, tolerance = 0): Regression[] {
  if (current.datasetHash !== baseline.datasetHash) {
    throw new Error(`dataset changed (baseline ${baseline.datasetHash}, run ${current.datasetHash}): ` +
      "re-run and save a new baseline instead of comparing");
  }
  const out: Regression[] = [];
  for (const [group, base] of Object.entries(baseline.summary)) {
    const now = current.summary[group];
    for (const metric of METRICS) {
      const value = now ? now[metric] : 0;
      if (value < base[metric] - tolerance - 1e-9) out.push({ group, metric, baseline: base[metric], current: value });
    }
  }
  return out;
}

export class RunStore {
  constructor(private readonly historyDir = "data/runs", private readonly baselineDir = "baselines") {}

  private get historyFile() {
    return join(this.historyDir, "runs.jsonl");
  }

  append(record: RunRecord): void {
    mkdirSync(this.historyDir, { recursive: true });
    appendFileSync(this.historyFile, JSON.stringify(record) + "\n");
  }

  /** All stored runs, oldest first, optionally only those for one config key. */
  list(key?: string): RunRecord[] {
    if (!existsSync(this.historyFile)) return [];
    const runs = readFileSync(this.historyFile, "utf8").split("\n").filter(Boolean)
      .map((line) => JSON.parse(line) as RunRecord);
    return key ? runs.filter((r) => runKey(r.config, r.datasetVersion) === key) : runs;
  }

  baseline(key: string): RunRecord | null {
    const file = join(this.baselineDir, `${key}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as RunRecord) : null;
  }

  saveBaseline(record: RunRecord): string {
    mkdirSync(this.baselineDir, { recursive: true });
    const file = join(this.baselineDir, `${runKey(record.config, record.datasetVersion)}.json`);
    writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
    return file;
  }
}
