/**
 * Grounded answering: retrieve passages, then ask the model to answer only from them, citing the
 * passage ids it used, or to return no answer when the passages do not contain it.
 *
 * This step only produces answers. Checking that each citation really supports its answer is a
 * separate, deterministic step, so the model is never trusted to grade itself.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Retriever } from "../retrieval/bm25.js";

export interface Answer {
  answer: string | null; // null means the model abstained
  citations: string[];
}

export interface AnsweredQuestion extends Answer {
  question: string;
  retrieved: string[];
  cached: boolean;
}

export type Generate = (prompt: string, schema: object) => Promise<Answer>;

export const ANSWER_SCHEMA = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING", nullable: true, description: "Short answer with its unit, or null if the passages do not say" },
    citations: { type: "ARRAY", items: { type: "STRING" }, description: "Ids of the passages the answer relies on" },
  },
  required: ["answer", "citations"],
};

export function buildPrompt(question: string, passages: { id: string; text: string }[]): string {
  return [
    "Answer the question using only the passages below.",
    "Rules:",
    "- Use only what the passages state. Do not use outside knowledge or guess.",
    "- Cite the id of every passage your answer relies on, exactly as written in the brackets.",
    '- If the passages do not contain the answer, return "answer": null and "citations": [].',
    "- Keep the answer short: the value and its unit.",
    "",
    "Passages:",
    ...passages.map((p) => `[${p.id}] ${p.text}`),
    "",
    `Question: ${question}`,
  ].join("\n");
}

/** Answers keyed by a hash of model and prompt, so a rerun spends no quota on questions already asked. */
export class AnswerCache {
  private entries: Record<string, Answer>;

  constructor(private readonly file: string | null) {
    this.entries = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  }

  static key(model: string, prompt: string): string {
    return createHash("sha256").update(`${model}\n${prompt}`).digest("hex").slice(0, 32);
  }

  get(key: string): Answer | undefined {
    return this.entries[key];
  }

  set(key: string, value: Answer): void {
    this.entries[key] = value;
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.entries, null, 2));
    }
  }
}

export async function answerQuestion(
  question: string, retriever: Retriever, textOf: Map<string, string>,
  generate: Generate, cache: AnswerCache, model: string, k = 5, exclude: string[] = [],
): Promise<AnsweredQuestion> {
  // `exclude` hides passages from the model, e.g. the gold one, to test that it abstains.
  const retrieved = (await retriever.search(question, k + exclude.length))
    .map((h) => h.id).filter((id) => !exclude.includes(id)).slice(0, k);
  const prompt = buildPrompt(question, retrieved.map((id) => ({ id, text: textOf.get(id) ?? "" })));
  const key = AnswerCache.key(model, prompt);
  const hit = cache.get(key);
  if (hit) return { question, retrieved, ...hit, cached: true };
  const raw = await generate(prompt, ANSWER_SCHEMA);
  const answer: Answer = {
    answer: typeof raw.answer === "string" && raw.answer.trim() !== "" ? raw.answer.trim() : null,
    citations: Array.isArray(raw.citations) ? raw.citations.filter((c): c is string => typeof c === "string") : [],
  };
  cache.set(key, answer);
  return { question, retrieved, ...answer, cached: false };
}

/** True if every number in the expected answer appears as a whole number in the given answer. */
export function containsExpected(answer: string | null, expected: string): boolean {
  if (!answer) return false;
  const found = new Set(answer.replace(/−/g, "-").match(/-?\d+(?:\.\d+)?/g) ?? []);
  const wanted = expected.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return wanted.length > 0 && wanted.every((n) => found.has(n));
}
