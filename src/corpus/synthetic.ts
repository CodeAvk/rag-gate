/**
 * Synthetic corpus and question set with exact ground truth.
 *
 * Fictional products, each described by one passage per fact plus a distractor passage that
 * repeats question keywords without answering anything. Every fact gets two questions:
 * - literal: reuses the passage's wording (keyword search should do well);
 * - paraphrase: avoids the passage's wording (this is where embeddings have to earn their place).
 * Near-identical product names (family "4" and "5") make retrieval pick the right entity.
 *
 * Two template sets: v1 (one fixed wording per fact, 12 products) and v2 (harder, see synthetic-v2.ts).
 * All text is generated here. No third-party text, so there is no licence question.
 * Usage: npm run corpus [seed] [v1|v2]   -> data/corpus/synthetic-<v>-seed<seed>/{corpus,questions}.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { int, rng, type Rng } from "./random.js";
import { V2 } from "./synthetic-v2.js";

export { rng } from "./random.js";

export interface Passage {
  id: string;
  docId: string;
  text: string;
  kind: "fact" | "distractor";
}

export interface Question {
  id: string;
  text: string;
  style: "literal" | "paraphrase";
  goldPassageId: string;
  answer: string;
  split: "dev" | "heldout";
}

export interface Dataset {
  version: string;
  seed: number;
  passages: Passage[];
  questions: Question[];
}

/**
 * One fact type. `variants` > 1 means each product draws one of several wordings; the
 * template functions receive the drawn index, and a literal question uses its passage's index. v1 facts have a single wording and draw nothing,
 * so v1 output is unchanged by this option.
 */
export interface Fact {
  key: string;
  value: (r: Rng) => string;
  passage: (name: string, v: string, variant: number) => string;
  literal: (name: string, variant: number) => string;
  paraphrase: (name: string, variant: number) => string;
  variants?: number;
}

export interface TemplateSet {
  version: string;
  families: string[];
  models: string[];
  facts: Fact[];
  distractor: (name: string) => string;
}

export const FACTS: Fact[] = [
  {
    key: "warranty",
    value: (r) => `${[6, 12, 18, 24, 36][int(r, 0, 4)]}`,
    passage: (n, v) => `The ${n} comes with a ${v}-month limited warranty that covers manufacturing defects.`,
    literal: (n) => `What limited warranty does the ${n} come with?`,
    paraphrase: (n) => `If the ${n} breaks because of a factory fault, for how long am I protected?`,
  },
  {
    key: "battery",
    value: (r) => `${int(r, 6, 40)}`,
    passage: (n, v) => `On a full charge, the ${n} battery lasts about ${v} hours of typical use.`,
    literal: (n) => `How many hours does the ${n} battery last on a full charge?`,
    paraphrase: (n) => `How much time can I use the ${n} before I must plug it in again?`,
  },
  {
    key: "weight",
    value: (r) => `${int(r, 120, 980)}`,
    passage: (n, v) => `The ${n} weighs ${v} grams without accessories.`,
    literal: (n) => `How many grams does the ${n} weigh without accessories?`,
    paraphrase: (n) => `How heavy is the ${n} to carry around?`,
  },
  {
    key: "range",
    value: (r) => `${int(r, 10, 90)}`,
    passage: (n, v) => `The wireless range of the ${n} is up to ${v} metres indoors.`,
    literal: (n) => `What is the indoor wireless range of the ${n} in metres?`,
    paraphrase: (n) => `How far away from the ${n} can my laptop stay connected at home?`,
  },
  {
    key: "temperature",
    value: (r) => `${int(r, -20, 5)} to ${int(r, 35, 60)}`,
    passage: (n, v) => `The ${n} is rated to operate between ${v.replace(" to ", " and ")} degrees Celsius.`,
    literal: (n) => `Between which degrees Celsius is the ${n} rated to operate?`,
    paraphrase: (n) => `Will the ${n} keep working in a freezing garage or on a hot summer day?`,
  },
  {
    key: "returns",
    value: (r) => `${[14, 30, 45, 60][int(r, 0, 3)]}`,
    passage: (n, v) => `Customers can return the ${n} within ${v} days of delivery for a full refund.`,
    literal: (n) => `Within how many days of delivery can customers return the ${n} for a full refund?`,
    paraphrase: (n) => `If I change my mind after buying the ${n}, how soon must I send it back to get my money?`,
  },
  {
    key: "recharge",
    value: (r) => `${int(r, 30, 240)}`,
    passage: (n, v) => `A complete recharge of the ${n} takes ${v} minutes with the included adapter.`,
    literal: (n) => `How many minutes does a complete recharge of the ${n} take with the included adapter?`,
    paraphrase: (n) => `Once the ${n} is empty, how quickly is it ready again after I plug it in?`,
  },
];

export const FAMILIES = ["Kestrel", "Marlow", "Quillon", "Tamber", "Orrin", "Vesper"];
export const MODELS = ["4", "5"];

export const V1: TemplateSet = {
  version: "synthetic-v1",
  families: FAMILIES,
  models: MODELS,
  facts: FACTS,
  distractor: (n) =>
    `Register the ${n} online to keep warranty, battery, charge and return records together; ` +
    `the wireless setup guide and accessories list are on the same page.`,
};

export const TEMPLATE_SETS: Record<string, TemplateSet> = { v1: V1, v2: V2 };

export interface Product {
  name: string; // as written in passages and questions, e.g. "Kestrel 4 Pro"
  docId: string; // e.g. "kestrel-4-pro"
}

/** Every product in a template set, in generation order. */
export function productCatalog(set: TemplateSet): Product[] {
  return set.families.flatMap((family) => set.models.map((model) => ({
    name: `${family} ${model}`,
    docId: `${family}-${model}`.toLowerCase().replace(/\s+/g, "-"),
  })));
}

export function generate(seed = 1, heldoutShare = 0.5, set: TemplateSet = V1): Dataset {
  const r = rng(seed);
  const pick = (fact: Fact) => (fact.variants && fact.variants > 1 ? int(r, 0, fact.variants - 1) : 0);
  const passages: Passage[] = [];
  const questions: Question[] = [];
  for (const { name, docId } of productCatalog(set)) {
    for (const fact of set.facts) {
      const value = fact.value(r);
      const pid = `${docId}#${fact.key}`;
      const wording = pick(fact);
      passages.push({ id: pid, docId, text: fact.passage(name, value, wording), kind: "fact" });
      for (const style of ["literal", "paraphrase"] as const) {
        // Literal questions reuse their passage's wording; paraphrases draw their own.
        const text = style === "literal" ? fact.literal(name, wording) : fact.paraphrase(name, pick(fact));
        questions.push({ id: `${pid}:${style}`, text, style, goldPassageId: pid, answer: value, split: "dev" });
      }
    }
    passages.push({ id: `${docId}#register`, docId, text: set.distractor(name), kind: "distractor" });
  }
  // Seeded split, balanced within each style so dev and held-out have the same mix.
  for (const style of ["literal", "paraphrase"] as const) {
    const group = questions.filter((q) => q.style === style);
    const order = group.map((q) => ({ q, k: r() })).sort((a, b) => a.k - b.k);
    const cut = Math.round(order.length * (1 - heldoutShare));
    order.forEach(({ q }, i) => { q.split = i < cut ? "dev" : "heldout"; });
  }
  return { version: set.version, seed, passages, questions };
}

function main() {
  const seed = Number(process.argv[2] ?? 1);
  const set = TEMPLATE_SETS[process.argv[3] ?? "v1"];
  if (!set) throw new Error(`unknown template set: ${process.argv[3]}`);
  const data = generate(seed, 0.5, set);
  const dir = `data/corpus/${data.version}-seed${seed}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/corpus.json`, JSON.stringify(data.passages, null, 2));
  writeFileSync(`${dir}/questions.json`, JSON.stringify(data.questions, null, 2));
  const held = data.questions.filter((q) => q.split === "heldout").length;
  console.log(`${data.passages.length} passages, ${data.questions.length} questions ` +
              `(${data.questions.length - held} dev, ${held} held-out) -> ${dir}`);
}

if (process.argv[1]?.endsWith("synthetic.ts")) main();
