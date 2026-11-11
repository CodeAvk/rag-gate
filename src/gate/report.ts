/**
 * Markdown report of one gated run: every metric next to its baseline, with the change and a
 * mark on each regression. CI appends it to the GitHub Actions job summary ($GITHUB_STEP_SUMMARY),
 * so a reviewer sees what moved without opening the logs.
 */
import { appendFileSync } from "node:fs";
import { METRICS, runKey, type Metric, type Regression, type RunRecord } from "./runs.js";

const LABEL: Record<Metric, string> = { recallAt1: "Recall@1", recallAt5: "Recall@5", mrr: "MRR" };
const fmt = (x: number) => x.toFixed(3);
const signed = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "±") + Math.abs(x).toFixed(3);

export function markdownReport(run: RunRecord, baseline: RunRecord | null, regressions: Regression[]): string {
  const key = runKey(run.config, run.datasetVersion);
  const status = !baseline ? "⚪ no baseline" : regressions.length ? `❌ ${regressions.length} regression(s)` : "✅ no regression";
  const lines = [
    `### ${key}: ${status}`,
    "",
    `Commit \`${run.commit ?? "unknown"}\` · dataset \`${run.datasetHash}\`` +
      (baseline ? ` · baseline from commit \`${baseline.commit ?? "unknown"}\`` : ""),
    "",
  ];
  const failed = new Set(regressions.map((r) => `${r.group}/${r.metric}`));
  if (baseline) {
    lines.push("| group | metric | baseline | this run | change |", "|---|---|---:|---:|---:|");
  } else {
    lines.push("| group | metric | this run |", "|---|---|---:|");
  }
  const groups = [...new Set([...Object.keys(run.summary), ...Object.keys(baseline?.summary ?? {})])];
  for (const group of groups) {
    for (const metric of METRICS) {
      const now = run.summary[group]?.[metric];
      const shown = now === undefined ? "missing" : fmt(now);
      if (!baseline) {
        lines.push(`| ${group} | ${LABEL[metric]} | ${shown} |`);
        continue;
      }
      const base = baseline.summary[group]?.[metric];
      const change = now === undefined || base === undefined ? "" : signed(now - base);
      const mark = failed.has(`${group}/${metric}`) ? " ❌" : "";
      lines.push(`| ${group} | ${LABEL[metric]} | ${base === undefined ? "new" : fmt(base)} | ${shown} | ${change}${mark} |`);
    }
  }
  return lines.join("\n") + "\n\n";
}

/** Append the report to the GitHub Actions job summary when running in Actions; no-op elsewhere. */
export function writeJobSummary(markdown: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const file = env.GITHUB_STEP_SUMMARY;
  if (!file) return false;
  appendFileSync(file, markdown);
  return true;
}
