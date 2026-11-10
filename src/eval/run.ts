/**
 * Score a retriever on the synthetic question set.
 *
 * Usage: npm run eval -- [--retriever bm25|gemini|hybrid] [--corpus v1|v2] [--seed 1] [--split dev]
 *                        [--save-baseline | --gate] [--tolerance 0]
 * The held-out split is for the single final Gate 1 comparison, so it needs
 * `--split heldout --final` and is never the default.
 *
 * Every run is recorded in the run store. `--save-baseline` makes this run the baseline for its
 * config; `--gate` compares the run with that baseline and exits non-zero on any regression.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { generate, TEMPLATE_SETS, type Dataset } from "../corpus/synthetic.js";
import { loadApiKey } from "../env.js";
import { Bm25, type Retriever } from "../retrieval/bm25.js";
import { geminiRetriever } from "../retrieval/embedding.js";
import { HybridRetriever } from "../retrieval/hybrid.js";
import { compareRuns, makeRecord, RunStore, runKey, type Regression } from "../gate/runs.js";
import { rankOf, summarizeByStyle, type QuestionResult, type Summary } from "./metrics.js";

export const TOP_K = 10;

export async function evaluate(retriever: Retriever, data: Dataset, split: "dev" | "heldout") {
  const results: (QuestionResult & { top: string[] })[] = [];
  for (const q of data.questions.filter((x) => x.split === split)) {
    const top = (await retriever.search(q.text, TOP_K)).map((h) => h.id);
    results.push({ id: q.id, style: q.style, rank: rankOf(top, q.goldPassageId), top: top.slice(0, 3) });
  }
  return { summary: summarizeByStyle(results), results };
}

export async function makeRetriever(name: string, data: Dataset, split: "dev" | "heldout"): Promise<Retriever> {
  if (name === "bm25") return new Bm25(data.passages);
  if (name === "gemini" || name === "hybrid") {
    const embedding = geminiRetriever(data.passages, loadApiKey());
    const sent = (await embedding.build()) +
      (await embedding.prepareQueries(data.questions.filter((q) => q.split === split).map((q) => q.text)));
    console.log(`embedding API items sent this run: ${sent} (cached texts are free)`);
    return name === "gemini" ? embedding : new HybridRetriever([new Bm25(data.passages), embedding]);
  }
  throw new Error(`unknown retriever: ${name}`);
}

function arg(argv: string[], flag: string, fallback?: string) {
  const i = argv.indexOf(flag);
  return i === -1 ? fallback : argv[i + 1];
}

export function parseArgs(argv: string[]) {
  const raw = arg(argv, "--split", "dev");
  if (raw !== "dev" && raw !== "heldout") throw new Error(`unknown split: ${raw}`);
  const split: "dev" | "heldout" = raw;
  if (split === "heldout" && !argv.includes("--final")) {
    throw new Error("the held-out split is used once, for the final comparison: add --final to confirm");
  }
  const corpus = arg(argv, "--corpus", "v1")!;
  if (!TEMPLATE_SETS[corpus]) throw new Error(`unknown corpus: ${corpus}`);
  const gate = argv.includes("--gate");
  const saveBaseline = argv.includes("--save-baseline");
  if (gate && saveBaseline) throw new Error("use --gate or --save-baseline, not both");
  const tolerance = Number(arg(argv, "--tolerance", "0"));
  if (!(tolerance >= 0 && tolerance < 1)) throw new Error(`tolerance must be in [0, 1): ${tolerance}`);
  return {
    retriever: arg(argv, "--retriever", "bm25")!, corpus, seed: Number(arg(argv, "--seed", "1")), split,
    gate, saveBaseline, tolerance,
  };
}

export function formatRegressions(regressions: Regression[]): string {
  if (regressions.length === 0) return "no regression against the baseline";
  return regressions
    .map((r) => `REGRESSION ${r.group} ${r.metric}: ${r.baseline.toFixed(3)} -> ${r.current.toFixed(3)}`)
    .join("\n");
}

function gitCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function table(summary: Record<string, Summary>) {
  return Object.entries(summary)
    .map(([k, s]) => `${k.padEnd(11)} n=${String(s.questions).padEnd(4)} R@1 ${s.recallAt1.toFixed(3)}  ` +
                     `R@5 ${s.recallAt5.toFixed(3)}  MRR ${s.mrr.toFixed(3)}`)
    .join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const data = generate(opts.seed, 0.5, TEMPLATE_SETS[opts.corpus]);
  const { summary, results } = await evaluate(await makeRetriever(opts.retriever, data, opts.split), data, opts.split);
  const config = { retriever: opts.retriever, corpus: opts.corpus, seed: opts.seed, split: opts.split, topK: TOP_K };
  const name = runKey(config, data.version);
  mkdirSync("data/eval", { recursive: true });
  writeFileSync(`data/eval/${name}.json`, JSON.stringify({ ...config, summary, results }, null, 2));
  console.log(`${name}\n${table(summary)}`);

  const store = new RunStore();
  const record = makeRecord(config, data, summary, new Date(), gitCommit());
  store.append(record);
  console.log(`run stored: ${record.id}`);
  if (opts.saveBaseline) {
    console.log(`baseline saved: ${store.saveBaseline(record)}`);
    return;
  }
  const baseline = store.baseline(name);
  if (!baseline) {
    if (opts.gate) throw new Error(`no baseline for ${name}: run once with --save-baseline first`);
    return;
  }
  const regressions = compareRuns(record, baseline, opts.tolerance);
  console.log(`compared with baseline ${baseline.id} (tolerance ${opts.tolerance})\n${formatRegressions(regressions)}`);
  if (opts.gate && regressions.length > 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("run.ts")) {
  main().catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
}
