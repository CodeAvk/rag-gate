import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { headline, loadAnswerReports, outcomeOf, type AnswerRow, type AnswerTotals } from "../dashboard/lib/answers.js";
import { verifyAnswer, type Verdict } from "../src/answer/verify.js";

const row = (over: Partial<AnswerRow> = {}): AnswerRow => ({
  id: "kestrel-4#range:literal", style: "literal", question: "How far does the Kestrel 4 reach indoors?",
  expected: "90", gold: "kestrel-4#range", answer: "90 metres", citations: ["kestrel-4#range"],
  retrieved: ["kestrel-4#range", "kestrel-4#battery"], cached: true, goldRetrieved: true, citesGold: true,
  correct: true, verdict: "supported", reasons: [], final: "90 metres", finalCorrect: true, ...over,
});
const totals: AnswerTotals = {
  questions: 3, rawCorrect: 2, citesGold: 2, modelAbstained: 1, supported: 2, unsupported: 0,
  finalCorrect: 2, finalWrong: 0, newRequests: 0,
};
const report = (rows: AnswerRow[], over: object = {}) => ({
  corpus: "v2", retriever: "gemini+product", limit: 6, model: "gemini-2.5-flash-lite", dropGold: false,
  totals, selfTest: { "wrong-number": { tried: 2, caught: 2 } }, rows, ...over,
});

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function answersDir(): { root: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), "rag-gate-answers-"));
  dirs.push(root);
  const dir = join(root, "data", "answers");
  mkdirSync(dir, { recursive: true });
  return { root, dir };
}

describe("answer outcomes", () => {
  it("shows correct, wrong or abstained from what the reader finally sees", () => {
    expect(outcomeOf(row())).toBe("correct");
    expect(outcomeOf(row({ final: "75 metres", finalCorrect: false }))).toBe("wrong");
    expect(outcomeOf(row({ final: null, finalCorrect: false }))).toBe("abstained");
    expect(headline(totals)).toEqual({ correct: 2, wrong: 0, abstained: 1 });
  });

  it("uses the same verdicts as the citation check", () => {
    const textOf = new Map([["kestrel-4#range", "The Kestrel 4 keeps a stable link up to 90 metres indoors."]]);
    const v: Verdict = verifyAnswer({ answer: "75 metres", citations: ["kestrel-4#range"], retrieved: ["kestrel-4#range"] }, { textOf }).verdict;
    const shown: AnswerRow["verdict"] = v; // compile-time: the dashboard type accepts every verifier verdict
    expect(shown).toBe("unsupported");
  });
});

describe("loadAnswerReports", () => {
  it("reads reports newest first and skips the cache and unreadable files", () => {
    const { root, dir } = answersDir();
    writeFileSync(join(dir, "old.json"), JSON.stringify(report([row()])));
    writeFileSync(join(dir, "new_dropgold.json"), JSON.stringify(report([row({ final: null, finalCorrect: false, verdict: "abstained" })], { dropGold: true })));
    writeFileSync(join(dir, "cache-gemini-2.5-flash-lite.json"), JSON.stringify({ somekey: { answer: "x" } }));
    writeFileSync(join(dir, "broken.json"), "{ not json");
    writeFileSync(join(dir, "other.json"), JSON.stringify({ hello: "world" }));
    writeFileSync(join(dir, "notes.txt"), "ignored");
    utimesSync(join(dir, "old.json"), new Date("2026-11-12T10:00:00Z"), new Date("2026-11-12T10:00:00Z"));
    utimesSync(join(dir, "new_dropgold.json"), new Date("2026-11-13T10:00:00Z"), new Date("2026-11-13T10:00:00Z"));

    const reports = loadAnswerReports(root);
    expect(reports.map((r) => [r.file, r.dropGold])).toEqual([["new_dropgold.json", true], ["old.json", false]]);
    expect(reports[1]!.writtenAt).toBe("2026-11-12T10:00:00.000Z");
    expect(reports[1]!.rows[0]!.citations).toEqual(["kestrel-4#range"]);
    expect(reports[1]!.selfTest["wrong-number"]).toEqual({ tried: 2, caught: 2 });
  });

  it("accepts an older report without a self-test", () => {
    const { root, dir } = answersDir();
    const { selfTest: _dropped, ...older } = report([row()]);
    writeFileSync(join(dir, "older.json"), JSON.stringify(older));
    expect(loadAnswerReports(root)[0]!.selfTest).toEqual({});
  });

  it("returns nothing on a fresh clone", () => {
    const root = mkdtempSync(join(tmpdir(), "rag-gate-answers-"));
    dirs.push(root);
    expect(loadAnswerReports(root)).toEqual([]);
  });
});
