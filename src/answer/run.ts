/**
 * Answer a small sample of dev questions with Gemini, grounded in retrieved passages.
 *
 * Usage: npm run answer -- [--corpus v2] [--retriever gemini+product] [--limit 6] [--model gemini-2.5-flash-lite]
 * Each new question costs one generateContent request against a daily cap; cached answers are free.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generate as generateDataset, TEMPLATE_SETS, type Question } from "../corpus/synthetic.js";
import { loadApiKey } from "../env.js";
import { makeRetriever } from "../eval/run.js";
import { DEFAULT_MODEL, generateJson, UsageCounter } from "../gemini/generate.js";
import { AnswerCache, answerQuestion, containsExpected, type Answer } from "./answer.js";

function arg(argv: string[], flag: string, fallback: string): string {
  const i = argv.indexOf(flag);
  return i === -1 ? fallback : argv[i + 1]!;
}

export function parseAnswerArgs(argv: string[]) {
  const corpus = arg(argv, "--corpus", "v2");
  if (!TEMPLATE_SETS[corpus]) throw new Error(`unknown corpus: ${corpus}`);
  const limit = Number(arg(argv, "--limit", "6"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error(`limit must be 1..20: ${limit}`);
  return { corpus, retriever: arg(argv, "--retriever", "gemini+product"), limit, model: arg(argv, "--model", DEFAULT_MODEL) };
}

/** An even spread of dev questions, half literal and half paraphrased, in a fixed order. */
export function sampleQuestions(questions: Question[], limit: number): Question[] {
  const out: Question[] = [];
  for (const [style, n] of [["literal", Math.floor(limit / 2)], ["paraphrase", Math.ceil(limit / 2)]] as const) {
    const pool = questions.filter((q) => q.split === "dev" && q.style === style);
    const step = Math.max(1, Math.floor(pool.length / Math.max(1, n)));
    for (let i = 0; i < n && i * step < pool.length; i++) out.push(pool[i * step]!);
  }
  return out;
}

interface Row extends Answer {
  id: string;
  style: string;
  question: string;
  expected: string;
  gold: string;
  retrieved: string[];
  cached: boolean;
  goldRetrieved: boolean;
  citesGold: boolean;
  correct: boolean;
}

async function main() {
  const opts = parseAnswerArgs(process.argv.slice(2));
  const data = generateDataset(1, 0.5, TEMPLATE_SETS[opts.corpus]);
  const retriever = await makeRetriever(opts.retriever, data, "dev");
  const textOf = new Map(data.passages.map((p) => [p.id, p.text]));
  const apiKey = loadApiKey();
  const usage = new UsageCounter(`data/usage/generate-${opts.model}.json`);
  const cache = new AnswerCache(`data/answers/cache-${opts.model}.json`);
  const generate = (prompt: string, schema: object) => generateJson<Answer>(prompt, schema, { model: opts.model, apiKey, usage });

  const rows: Row[] = [];
  for (const q of sampleQuestions(data.questions, opts.limit)) {
    const a = await answerQuestion(q.text, retriever, textOf, generate, cache, opts.model);
    const row: Row = {
      id: q.id, style: q.style, question: q.text, expected: q.answer, gold: q.goldPassageId,
      answer: a.answer, citations: a.citations, retrieved: a.retrieved, cached: a.cached,
      goldRetrieved: a.retrieved.includes(q.goldPassageId),
      citesGold: a.citations.includes(q.goldPassageId),
      correct: containsExpected(a.answer, q.answer),
    };
    rows.push(row);
    console.log(`${row.correct ? "ok  " : "MISS"} ${q.id.padEnd(34)} expected ${q.answer.padEnd(4)} answer ${JSON.stringify(a.answer)} ` +
      `cites ${a.citations.join(",") || "-"}${a.cached ? " (cached)" : ""}`);
  }
  const n = rows.length;
  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const totals = {
    questions: n, correct: count((r) => r.correct), citesGold: count((r) => r.citesGold),
    abstained: count((r) => r.answer === null), newRequests: count((r) => !r.cached),
  };
  console.log(`correct ${totals.correct}/${n}, cites gold ${totals.citesGold}/${n}, abstained ${totals.abstained}, ` +
    `new requests ${totals.newRequests} (used today: ${usage.used()})`);
  mkdirSync("data/answers", { recursive: true });
  const file = `data/answers/${opts.retriever}_${data.version}_${opts.model}_n${n}.json`;
  writeFileSync(file, JSON.stringify({ ...opts, totals, rows }, null, 2));
  console.log(`written: ${file}`);
}

if (/answer[\\/]run\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
}
