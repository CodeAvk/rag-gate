/**
 * Score a retriever on the synthetic question set.
 *
 * Usage: npm run eval -- [--retriever bm25|gemini] [--seed 1] [--split dev]
 * The held-out split is for the single final Gate 1 comparison, so it needs
 * `--split heldout --final` and is never the default.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generate, type Dataset } from "../corpus/synthetic.js";
import { loadApiKey } from "../env.js";
import { Bm25, type Retriever } from "../retrieval/bm25.js";
import { geminiRetriever } from "../retrieval/embedding.js";
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
  if (name === "gemini") {
    const retriever = geminiRetriever(data.passages, loadApiKey());
    const sent = (await retriever.build()) +
      (await retriever.prepareQueries(data.questions.filter((q) => q.split === split).map((q) => q.text)));
    console.log(`embedding API items sent this run: ${sent} (cached texts are free)`);
    return retriever;
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
  return { retriever: arg(argv, "--retriever", "bm25")!, seed: Number(arg(argv, "--seed", "1")), split };
}

function table(summary: Record<string, Summary>) {
  return Object.entries(summary)
    .map(([k, s]) => `${k.padEnd(11)} n=${String(s.questions).padEnd(4)} R@1 ${s.recallAt1.toFixed(3)}  ` +
                     `R@5 ${s.recallAt5.toFixed(3)}  MRR ${s.mrr.toFixed(3)}`)
    .join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const data = generate(opts.seed);
  const { summary, results } = await evaluate(await makeRetriever(opts.retriever, data, opts.split), data, opts.split);
  const name = `${opts.retriever}_${data.version}-seed${opts.seed}_${opts.split}`;
  mkdirSync("data/eval", { recursive: true });
  writeFileSync(`data/eval/${name}.json`, JSON.stringify({ ...opts, summary, results }, null, 2));
  console.log(`${name}\n${table(summary)}`);
}

if (process.argv[1]?.endsWith("run.ts")) {
  main().catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
}
