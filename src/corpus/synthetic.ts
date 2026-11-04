/**
 * Synthetic corpus and question set with exact ground truth.
 *
 * Fictional products, each described by one passage per fact plus a distractor passage that
 * repeats question keywords without answering anything. Every fact gets two questions:
 * - literal: reuses the passage's wording (keyword search should do well);
 * - paraphrase: avoids the passage's wording (this is where embeddings have to earn their place).
 * Near-identical product names (family "4" and "5") make retrieval pick the right entity.
 *
 * All text is generated here. No third-party text, so there is no licence question.
 * Usage: npm run corpus [seed]   -> data/corpus/synthetic-v1-seed<seed>/{corpus,questions}.json
 */
import { mkdirSync, writeFileSync } from "node:fs";

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

interface Fact {
  key: string;
  value: (r: Rng) => string;
  passage: (name: string, v: string) => string;
  literal: (name: string) => string;
  paraphrase: (name: string) => string;
}

type Rng = () => number;

/** mulberry32: small seeded PRNG so every run of the generator is identical. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

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

const distractor = (n: string) =>
  `Register the ${n} online to keep warranty, battery, charge and return records together; ` +
  `the wireless setup guide and accessories list are on the same page.`;

export function generate(seed = 1, heldoutShare = 0.5): Dataset {
  const r = rng(seed);
  const passages: Passage[] = [];
  const questions: Question[] = [];
  for (const family of FAMILIES) {
    for (const model of MODELS) {
      const name = `${family} ${model}`;
      const docId = `${family}-${model}`.toLowerCase();
      for (const fact of FACTS) {
        const value = fact.value(r);
        const pid = `${docId}#${fact.key}`;
        passages.push({ id: pid, docId, text: fact.passage(name, value), kind: "fact" });
        for (const style of ["literal", "paraphrase"] as const) {
          const text = style === "literal" ? fact.literal(name) : fact.paraphrase(name);
          questions.push({ id: `${pid}:${style}`, text, style, goldPassageId: pid, answer: value, split: "dev" });
        }
      }
      passages.push({ id: `${docId}#register`, docId, text: distractor(name), kind: "distractor" });
    }
  }
  // Seeded split, balanced within each style so dev and held-out have the same mix.
  for (const style of ["literal", "paraphrase"] as const) {
    const group = questions.filter((q) => q.style === style);
    const order = group.map((q) => ({ q, k: r() })).sort((a, b) => a.k - b.k);
    const cut = Math.round(order.length * (1 - heldoutShare));
    order.forEach(({ q }, i) => { q.split = i < cut ? "dev" : "heldout"; });
  }
  return { version: "synthetic-v1", seed, passages, questions };
}

function main() {
  const seed = Number(process.argv[2] ?? 1);
  const data = generate(seed);
  const dir = `data/corpus/${data.version}-seed${seed}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/corpus.json`, JSON.stringify(data.passages, null, 2));
  writeFileSync(`${dir}/questions.json`, JSON.stringify(data.questions, null, 2));
  const held = data.questions.filter((q) => q.split === "heldout").length;
  console.log(`${data.passages.length} passages, ${data.questions.length} questions ` +
              `(${data.questions.length - held} dev, ${held} held-out) -> ${dir}`);
}

if (process.argv[1]?.endsWith("synthetic.ts")) main();
