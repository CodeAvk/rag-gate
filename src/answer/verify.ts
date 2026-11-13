/**
 * Citation check: a deterministic test that an answer is supported by the passages it cites.
 *
 * The model is never asked to grade itself. An answer is "supported" only when it cites at least
 * one passage, every cited passage was actually retrieved, every cited passage is about the product
 * the question names (when it names one), and every number in the answer appears in a cited
 * passage. Anything else is "unsupported" and is reported as an abstention, with the reasons.
 */
import type { Product } from "../corpus/synthetic.js";
import { tokenize } from "../text/tokenize.js";

export type Verdict = "supported" | "unsupported" | "abstained";

export interface Verification {
  verdict: Verdict;
  reasons: string[];
  final: string | null; // the answer to show: the model's answer if supported, otherwise null
}

export interface VerifyContext {
  textOf: Map<string, string>;
  docOf?: Map<string, string>; // passage id -> product docId, for the product check
  product?: Product | null; // the product the question names, if any
}

/** Numbers as written in text, with the unicode minus and thousands separators normalised. */
export function numbersIn(text: string): string[] {
  const clean = text.replace(/[−–]/g, "-").replace(/(\d),(?=\d{3}\b)/g, "$1");
  return (clean.match(/(?<![\d.])-?\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
}

export function verifyAnswer(
  a: { answer: string | null; citations: string[]; retrieved: string[] }, ctx: VerifyContext,
): Verification {
  if (a.answer === null) return { verdict: "abstained", reasons: [], final: null };
  const reasons: string[] = [];
  const cited = [...new Set(a.citations)];
  if (cited.length === 0) reasons.push("no citations");
  for (const id of cited) {
    if (!a.retrieved.includes(id) || !ctx.textOf.has(id)) reasons.push(`cites ${id}, which was not retrieved`);
    else if (ctx.product && ctx.docOf && ctx.docOf.get(id) !== ctx.product.docId) {
      reasons.push(`cites ${id}, which is not about the ${ctx.product.name}`);
    }
  }
  const citedText = cited.filter((id) => a.retrieved.includes(id)).map((id) => ctx.textOf.get(id) ?? "").join("\n");
  const available = new Set(numbersIn(citedText));
  const numbers = numbersIn(a.answer);
  for (const n of numbers) if (!available.has(n)) reasons.push(`number ${n} is not in the cited passages`);
  if (numbers.length === 0 && cited.length > 0) {
    const words = new Set(tokenize(citedText));
    if (!tokenize(a.answer).some((w) => words.has(w))) reasons.push("no word of the answer is in the cited passages");
  }
  return reasons.length === 0
    ? { verdict: "supported", reasons, final: a.answer }
    : { verdict: "unsupported", reasons, final: null };
}

export interface Mutation {
  kind: "wrong-number" | "look-alike-product" | "invented-citation";
  answer: string;
  citations: string[];
  retrieved: string[];
}

/**
 * Deliberately broken copies of a supported answer, for testing the check on realistic text:
 * a changed number, the same fact taken from a look-alike product, and an invented citation.
 * `passages` is the whole corpus; the look-alike is another product's passage for the same fact.
 */
export function mutations(
  a: { answer: string; citations: string[]; retrieved: string[] },
  passages: { id: string; docId: string; text: string }[],
): Mutation[] {
  const out: Mutation[] = [];
  const numbers = numbersIn(a.answer);
  if (numbers.length > 0) {
    const n = numbers[0]!;
    out.push({ kind: "wrong-number", answer: a.answer.replace(n, String(Number(n) + 1)), citations: a.citations, retrieved: a.retrieved });
  }
  const gold = passages.find((p) => p.id === a.citations[0]);
  if (gold) {
    const [docId, fact] = gold.id.split("#");
    const family = docId!.split("-")[0];
    const twin = passages.find((p) => p.id !== gold.id && p.id.endsWith(`#${fact}`) && p.docId.startsWith(`${family}-`));
    const twinNumber = twin ? numbersIn(twin.text)[0] : undefined;
    if (twin && twinNumber !== undefined) {
      out.push({ kind: "look-alike-product", answer: twinNumber, citations: [twin.id], retrieved: [...a.retrieved, twin.id] });
    }
  }
  out.push({ kind: "invented-citation", answer: a.answer, citations: ["invented#passage"], retrieved: a.retrieved });
  return out;
}
