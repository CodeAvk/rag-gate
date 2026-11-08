/**
 * Template set v2: a harder test than v1, written after v1 put embeddings at the ceiling.
 *
 * - 24 products: models "4", "4 Pro", "5" and "5 Lite" per family, so names overlap heavily.
 * - Two wordings per passage and per question, drawn per product, so sentence shape alone
 *   does not identify the fact.
 * - Longer passages that also mention neighbouring topics (a warranty passage talks about
 *   battery wear and returns; a recharge passage mentions battery life), as real docs do.
 */
import { int } from "./random.js";
import type { Fact, TemplateSet } from "./synthetic.js";

const two = (a: string, b: string, i: number) => (i === 0 ? a : b);

const FACTS_V2: Fact[] = [
  {
    key: "warranty",
    variants: 2,
    value: (r) => `${[6, 12, 18, 24, 36][int(r, 0, 4)]}`,
    passage: (n, v, i) => two(
      `Every ${n} unit is backed by a ${v}-month limited warranty against manufacturing defects. ` +
        `Accidental damage and normal battery wear are not included, and the warranty does not change the return policy.`,
      `Coverage for manufacturing defects on the ${n} lasts ${v} months from purchase. ` +
        `This limited warranty excludes drops, water damage and battery ageing.`, i),
    literal: (n, i) => two(`How long is the limited warranty against manufacturing defects on the ${n}?`,
      `For how many months does the ${n} limited warranty cover manufacturing defects?`, i),
    paraphrase: (n, i) => two(`My ${n} stopped working by itself after a few weeks; until when will the maker fix it free?`,
      `If a factory fault shows up on my ${n}, for how long am I protected?`, i),
  },
  {
    key: "battery",
    variants: 2,
    value: (r) => `${int(r, 6, 40)}`,
    passage: (n, v, i) => two(
      `In everyday use the ${n} runs for roughly ${v} hours between charges. ` +
        `Heavy wireless streaming shortens this, and recharge speed depends on the adapter.`,
      `Battery life on the ${n} is rated at about ${v} hours of mixed use, measured with the screen at half brightness.`, i),
    literal: (n, i) => two(`How many hours does the ${n} run between charges?`,
      `What is the rated battery life of the ${n} in hours?`, i),
    paraphrase: (n, i) => two(`Can the ${n} last through a long flight without being plugged in?`,
      `How long will the ${n} keep going before it dies?`, i),
  },
  {
    key: "weight",
    variants: 2,
    value: (r) => `${int(r, 120, 980)}`,
    passage: (n, v, i) => two(
      `Without its stand and cables, the ${n} weighs ${v} grams, which is more than the travel case alone.`,
      `The ${n} has a mass of ${v} g with no accessories attached.`, i),
    literal: (n, i) => two(`How many grams does the ${n} weigh without its stand and cables?`,
      `What is the mass of the ${n} with no accessories attached?`, i),
    paraphrase: (n, i) => two(`Is the ${n} light enough to carry in a small bag all day?`,
      `How much will the ${n} add to my backpack?`, i),
  },
  {
    key: "range",
    variants: 2,
    value: (r) => `${int(r, 10, 90)}`,
    passage: (n, v, i) => two(
      `Indoors the ${n} keeps a stable wireless link up to ${v} metres away; ` +
        `thick walls and other routers reduce that distance.`,
      `Wireless range for the ${n} is specified as ${v} metres indoors under typical home conditions.`, i),
    literal: (n, i) => two(`How many metres away does the ${n} keep a stable wireless link indoors?`,
      `How many metres of wireless range does the ${n} have indoors?`, i),
    paraphrase: (n, i) => two(`Will my laptop stay connected to the ${n} from the far end of the flat?`,
      `How far can I walk away from the ${n} before the signal drops?`, i),
  },
  {
    key: "temperature",
    variants: 2,
    value: (r) => `${int(r, -20, 5)} to ${int(r, 35, 60)}`,
    passage: (n, v, i) => {
      const [lo, hi] = v.split(" to ");
      return two(
        `The ${n} is designed to operate between ${lo} and ${hi} degrees Celsius. ` +
          `Charging outside this range may be paused to protect the battery.`,
        `Rated operating temperature for the ${n}: ${lo} to ${hi} degrees Celsius.`, i);
    },
    literal: (n, i) => two(`Between which degrees Celsius is the ${n} designed to operate?`,
      `What is the rated operating temperature of the ${n} in degrees Celsius?`, i),
    paraphrase: (n, i) => two(`Is it safe to leave the ${n} switched on in a freezing shed or a hot car?`,
      `Will the ${n} cope with a scorching summer afternoon?`, i),
  },
  {
    key: "returns",
    variants: 2,
    value: (r) => `${[14, 30, 45, 60][int(r, 0, 3)]}`,
    passage: (n, v, i) => two(
      `Unwanted ${n} orders can be returned within ${v} days of delivery for a full refund, ` +
        `provided the box is complete; faulty units are handled under warranty instead.`,
      `The return window for the ${n} is ${v} days from delivery, with a full refund to the original payment method.`, i),
    literal: (n, i) => two(`Within how many days of delivery can the ${n} be returned for a full refund?`,
      `How many days from delivery is the return window for the ${n}?`, i),
    paraphrase: (n, i) => two(`I regret buying the ${n}; how long until it is too late to get my money back?`,
      `Can I still send the ${n} back if I changed my mind a few weeks later?`, i),
  },
  {
    key: "recharge",
    variants: 2,
    value: (r) => `${int(r, 30, 240)}`,
    passage: (n, v, i) => two(
      `With the bundled adapter, the ${n} goes from empty to full in about ${v} minutes; ` +
        `a slower USB port takes longer and does not affect battery life.`,
      `Full recharge time for the ${n} is ${v} minutes using the included adapter.`, i),
    literal: (n, i) => two(`How many minutes does the ${n} take to go from empty to full with the bundled adapter?`,
      `What is the full recharge time of the ${n} with the included adapter?`, i),
    paraphrase: (n, i) => two(`If the ${n} is flat, how soon can I use it again after plugging it in?`,
      `How fast does the ${n} top itself back up?`, i),
  },
];

export const V2: TemplateSet = {
  version: "synthetic-v2",
  families: ["Kestrel", "Marlow", "Quillon", "Tamber", "Orrin", "Vesper"],
  models: ["4", "4 Pro", "5", "5 Lite"],
  facts: FACTS_V2,
  distractor: (n) =>
    `Register the ${n} online to keep warranty, battery, charge and return records together; ` +
    `the wireless setup guide, the temperature notes and the accessories list are on the same page.`,
};
