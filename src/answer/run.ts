/**
 * Answer a small sample of dev questions with Gemini, grounded in retrieved passages.
 *
 * Usage: npm run answer -- [--corpus v2] [--retriever gemini+product] [--limit 6] [--model gemini-2.5-flash-lite]
 *                          [--drop-gold]
 * Each new question costs one generateContent request against a daily cap; cached answers are free.
 * When the cap is reached the run stops, still writes its report, and the same command picks up
 * the rest on a later day, because the sample order is prefix-stable and earlier answers are cached.
 * Every answer then goes through the deterministic citation check; unsupported answers count as
 * abstentions. `--drop-gold` hides the gold passage from the model, so the right outcome is to abstain.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generate as generateDataset, productCatalog, TEMPLATE_SETS, type Question } from "../corpus/synthetic.js";
import { loadApiKey } from "../env.js";
import { makeRetriever } from "../eval/run.js";
import { GeminiHttpError } from "../gemini/embed.js";
import { DailyCapError, DEFAULT_MODEL, generateJson, UsageCounter } from "../gemini/generate.js";
import { findProduct } from "../retrieval/product-filter.js";
import { AnswerCache, answerQuestion, containsExpected, type Answer } from "./answer.js";
import { mutations, verifyAnswer, type Verdict } from "./verify.js";

function arg(argv: string[], flag: string, fallback: string): string {
  const i = argv.indexOf(flag);
  return i === -1 ? fallback : argv[i + 1]!;
}

export function parseAnswerArgs(argv: string[]) {
  const corpus = arg(argv, "--corpus", "v2");
  if (!TEMPLATE_SETS[corpus]) throw new Error(`unknown corpus: ${corpus}`);
  const limit = Number(arg(argv, "--limit", "6"));
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new Error(`limit must be 1..${MAX_LIMIT}: ${limit}`);
  return {
    corpus, retriever: arg(argv, "--retriever", "gemini+product"), limit, model: arg(argv, "--model", DEFAULT_MODEL),
    dropGold: argv.includes("--drop-gold"),
  };
}

/** Errors that end a batch cleanly instead of failing it: the daily cap, rate limits, server overload. */
export function stopsBatch(err: unknown): boolean {
  if (err instanceof DailyCapError) return true;
  return err instanceof GeminiHttpError && [429, 500, 503].includes(err.status);
}

/** Upper bound for `--limit`; the sample itself stops at the size of the dev split. */
export const MAX_LIMIT = 200;

/**
 * 0..m-1 in bit-reversed order (0, m/2, m/4, 3m/4, ...): every prefix is spread evenly over the
 * range, so the first few questions already cover many products.
 */
export function spreadOrder(m: number): number[] {
  let bits = 0;
  while (1 << bits < m) bits++;
  const out: number[] = [];
  for (let i = 0; i < 1 << bits; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    if (r < m) out.push(r);
  }
  return out;
}

/**
 * Dev questions in a fixed order, alternating literal and paraphrased, each style spread across
 * products. The order is prefix-stable: raising `limit` keeps every earlier question, so a larger
 * sample grows day by day through the answer cache instead of starting over.
 */
export function sampleQuestions(questions: Question[], limit: number): Question[] {
  const byStyle = (["literal", "paraphrase"] as const).map((style) => {
    const pool = questions.filter((q) => q.split === "dev" && q.style === style);
    return spreadOrder(pool.length).map((i) => pool[i]!);
  });
  const out: Question[] = [];
  for (let i = 0; out.length < limit && i < Math.max(...byStyle.map((p) => p.length)); i++) {
    for (const pool of byStyle) {
      const q = pool[i];
      if (q && out.length < limit) out.push(q);
    }
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
  correct: boolean; // the model's raw answer contains the expected value
  verdict: Verdict;
  reasons: string[];
  final: string | null; // what is shown after the citation check
  finalCorrect: boolean;
}

async function main() {
  const opts = parseAnswerArgs(process.argv.slice(2));
  const data = generateDataset(1, 0.5, TEMPLATE_SETS[opts.corpus]);
  const retriever = await makeRetriever(opts.retriever, data, "dev");
  const textOf = new Map(data.passages.map((p) => [p.id, p.text]));
  const docOf = new Map(data.passages.map((p) => [p.id, p.docId]));
  const catalog = productCatalog(TEMPLATE_SETS[opts.corpus]!);
  const apiKey = loadApiKey();
  const usage = new UsageCounter(`data/usage/generate-${opts.model}.json`);
  const cache = new AnswerCache(`data/answers/cache-${opts.model}.json`);
  const generate = (prompt: string, schema: object) => generateJson<Answer>(prompt, schema, { model: opts.model, apiKey, usage });

  const rows: Row[] = [];
  const sample = sampleQuestions(data.questions, opts.limit);
  let stopped: string | null = null;
  for (const q of sample) {
    let a: Awaited<ReturnType<typeof answerQuestion>>;
    try {
      a = await answerQuestion(q.text, retriever, textOf, generate, cache, opts.model, 5,
        opts.dropGold ? [q.goldPassageId] : []);
    } catch (err) {
      // The daily cap or a temporary API failure ends this batch; keep what was answered. Answered
      // questions are cached, so a rerun costs nothing for them. No automatic retry: every attempt
      // counts against the free quota.
      if (!stopsBatch(err)) throw err;
      stopped = (err as Error).message;
      console.log(`stopped after ${rows.length} of ${sample.length}: ${stopped}`);
      break;
    }
    const check = verifyAnswer(a, { textOf, docOf, product: findProduct(q.text, catalog) });
    const row: Row = {
      id: q.id, style: q.style, question: q.text, expected: q.answer, gold: q.goldPassageId,
      answer: a.answer, citations: a.citations, retrieved: a.retrieved, cached: a.cached,
      goldRetrieved: a.retrieved.includes(q.goldPassageId),
      citesGold: a.citations.includes(q.goldPassageId),
      correct: containsExpected(a.answer, q.answer),
      ...check, finalCorrect: containsExpected(check.final, q.answer),
    };
    rows.push(row);
    console.log(`${row.verdict.padEnd(11)} ${q.id.padEnd(34)} expected ${q.answer.padEnd(8)} answer ${JSON.stringify(a.answer)} ` +
      `cites ${a.citations.join(",") || "-"}${a.cached ? " (cached)" : ""}${check.reasons.length ? `\n            ${check.reasons.join("; ")}` : ""}`);
  }
  const n = rows.length;
  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const totals = {
    questions: n, rawCorrect: count((r) => r.correct), citesGold: count((r) => r.citesGold),
    modelAbstained: count((r) => r.verdict === "abstained"), supported: count((r) => r.verdict === "supported"),
    unsupported: count((r) => r.verdict === "unsupported"), finalCorrect: count((r) => r.finalCorrect),
    finalWrong: count((r) => r.final !== null && !r.finalCorrect), newRequests: count((r) => !r.cached),
  };
  console.log(`model: correct ${totals.rawCorrect}/${n}, abstained ${totals.modelAbstained}; ` +
    `check: supported ${totals.supported}, unsupported ${totals.unsupported}; ` +
    `shown: correct ${totals.finalCorrect}, wrong ${totals.finalWrong}, abstained ${n - totals.finalCorrect - totals.finalWrong}; ` +
    `new requests ${totals.newRequests} (used today: ${usage.used()})`);
  // Self-test: break each supported answer on purpose and count how many the check rejects.
  const selfTest: Record<string, { tried: number; caught: number }> = {};
  for (const r of rows.filter((x) => x.verdict === "supported")) {
    for (const m of mutations({ answer: r.answer!, citations: r.citations, retrieved: r.retrieved }, data.passages)) {
      const t = (selfTest[m.kind] ??= { tried: 0, caught: 0 });
      t.tried++;
      if (verifyAnswer(m, { textOf, docOf, product: findProduct(r.question, catalog) }).verdict === "unsupported") t.caught++;
    }
  }
  if (Object.keys(selfTest).length) {
    console.log(`check self-test on broken copies of supported answers: ` +
      Object.entries(selfTest).map(([k, t]) => `${k} ${t.caught}/${t.tried}`).join(", "));
  }
  mkdirSync("data/answers", { recursive: true });
  const file = `data/answers/${opts.retriever}_${data.version}_${opts.model}_limit${opts.limit}${opts.dropGold ? "_dropgold" : ""}.json`;
  writeFileSync(file, JSON.stringify({ ...opts, sampled: sample.length, stopped, totals, selfTest, rows }, null, 2));
  console.log(`written: ${file}`);
}

if (/answer[\\/]run\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
}
