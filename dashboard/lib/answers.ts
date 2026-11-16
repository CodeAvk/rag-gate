/**
 * Reads the grounded-answer reports that `npm run answer` writes to `data/answers/*.json`
 * (git-ignored). The answer cache in the same folder (`cache-*.json`) is skipped. Read-only.
 *
 * The types mirror the report written by `src/answer/run.ts`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Verdict = "supported" | "unsupported" | "abstained";

export interface AnswerRow {
  id: string;
  style: string;
  question: string;
  expected: string;
  gold: string;
  answer: string | null;
  citations: string[];
  retrieved: string[];
  cached: boolean;
  goldRetrieved: boolean;
  citesGold: boolean;
  correct: boolean;
  verdict: Verdict;
  reasons: string[];
  final: string | null;
  finalCorrect: boolean;
}

export interface AnswerTotals {
  questions: number;
  rawCorrect: number;
  citesGold: number;
  modelAbstained: number;
  supported: number;
  unsupported: number;
  finalCorrect: number;
  finalWrong: number;
  newRequests: number;
}

export interface AnswerReport {
  file: string;
  writtenAt: string; // file modification time, ISO
  corpus: string;
  retriever: string;
  model: string;
  limit: number;
  dropGold: boolean;
  totals: AnswerTotals;
  selfTest: Record<string, { tried: number; caught: number }>;
  rows: AnswerRow[];
}

/** What the reader finally sees for one question, after the citation check. */
export type Outcome = "correct" | "wrong" | "abstained";

export function outcomeOf(row: Pick<AnswerRow, "final" | "finalCorrect">): Outcome {
  if (row.final === null) return "abstained";
  return row.finalCorrect ? "correct" : "wrong";
}

/** A shown answer that is wrong is the failure that matters; abstaining is the safe outcome. */
export function headline(t: AnswerTotals): { correct: number; wrong: number; abstained: number } {
  return { correct: t.finalCorrect, wrong: t.finalWrong, abstained: t.questions - t.finalCorrect - t.finalWrong };
}

function isReport(x: unknown): x is Omit<AnswerReport, "file" | "writtenAt"> {
  const r = x as Partial<AnswerReport> | null;
  return !!r && typeof r === "object" && Array.isArray(r.rows) && !!r.totals && typeof r.retriever === "string";
}

/** Reports newest first. Files that are not answer reports are skipped, not fatal. */
export function loadAnswerReports(root: string): AnswerReport[] {
  const dir = join(root, "data", "answers");
  if (!existsSync(dir)) return [];
  const reports: AnswerReport[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") || file.startsWith("cache-")) continue;
    const path = join(dir, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    if (!isReport(parsed)) continue;
    // Reports written before the check's self-test existed have no `selfTest` field.
    reports.push({ ...parsed, selfTest: parsed.selfTest ?? {}, file, writtenAt: statSync(path).mtime.toISOString() });
  }
  return reports.sort((a, b) => b.writtenAt.localeCompare(a.writtenAt) || a.file.localeCompare(b.file));
}
