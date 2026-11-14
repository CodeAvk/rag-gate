/**
 * Reads the rag-gate run store for the dashboard: committed baselines (`baselines/*.json`) and the
 * local run history (`data/runs/runs.jsonl`, git-ignored). Read-only; nothing here writes files.
 *
 * The types mirror `src/gate/runs.ts`. The status check below repeats the gate's rule for display
 * only; a root test (`tests/dashboard-data.test.ts`) keeps the two in agreement.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Summary {
  questions: number;
  recallAt1: number;
  recallAt5: number;
  mrr: number;
}

export interface RunRecord {
  id: string;
  createdAt: string;
  commit: string | null;
  config: { retriever: string; corpus: string; seed: number; split: "dev" | "heldout"; topK: number };
  datasetVersion: string;
  datasetHash: string;
  summary: Record<string, Summary>;
}

export type Status = "pass" | "regression" | "no baseline" | "dataset changed";

export interface RunRow {
  run: RunRecord;
  key: string;
  status: Status;
  regressions: string[]; // e.g. "paraphrase Recall@1 0.964 -> 0.940"
}

export interface DashboardData {
  root: string;
  baselines: RunRecord[];
  runs: RunRow[]; // newest first
  historyFound: boolean;
}

const METRICS = [["recallAt1", "Recall@1"], ["recallAt5", "Recall@5"], ["mrr", "MRR"]] as const;

export function runKey(r: RunRecord): string {
  return `${r.config.retriever}_${r.datasetVersion}-seed${r.config.seed}_${r.config.split}`;
}

/** Same rule as the CI gate with tolerance 0: any metric below the baseline is a regression. */
export function statusAgainst(run: RunRecord, baseline: RunRecord | undefined): Pick<RunRow, "status" | "regressions"> {
  if (!baseline) return { status: "no baseline", regressions: [] };
  if (baseline.datasetHash !== run.datasetHash) return { status: "dataset changed", regressions: [] };
  const regressions: string[] = [];
  for (const [group, base] of Object.entries(baseline.summary)) {
    for (const [metric, label] of METRICS) {
      const now = run.summary[group]?.[metric] ?? 0;
      if (now < base[metric] - 1e-9) regressions.push(`${group} ${label} ${base[metric].toFixed(3)} -> ${now.toFixed(3)}`);
    }
  }
  return { status: regressions.length ? "regression" : "pass", regressions };
}

/** The repository root: RAG_GATE_ROOT if set, otherwise the parent of the dashboard folder. */
export function repoRoot(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  // The run store lives outside this app and is read at request time, so the bundler must not trace it.
  return resolve(/*turbopackIgnore: true*/ env.RAG_GATE_ROOT ?? join(/*turbopackIgnore: true*/ cwd, ".."));
}

export function loadDashboard(root = repoRoot()): DashboardData {
  const baselineDir = join(root, "baselines");
  const baselines = existsSync(baselineDir)
    ? readdirSync(baselineDir).filter((f) => f.endsWith(".json")).sort()
        .map((f) => JSON.parse(readFileSync(join(baselineDir, f), "utf8")) as RunRecord)
    : [];
  const byKey = new Map(baselines.map((b) => [runKey(b), b]));

  const historyFile = join(root, "data", "runs", "runs.jsonl");
  const historyFound = existsSync(historyFile);
  const runs = historyFound
    ? readFileSync(historyFile, "utf8").split("\n").filter((l) => l.trim())
        .map((l) => JSON.parse(l) as RunRecord)
    : [];
  const rows = runs
    .map((run) => ({ run, key: runKey(run), ...statusAgainst(run, byKey.get(runKey(run))) }))
    .sort((a, b) => b.run.createdAt.localeCompare(a.run.createdAt));
  return { root, baselines, runs: rows, historyFound };
}
