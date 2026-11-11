/**
 * Product-name check: a deterministic re-ranker for catalogues with look-alike product names.
 *
 * Embeddings place "Tamber 4" and "Tamber 4 Pro" almost on top of each other, so the right fact
 * for the wrong product can outrank the gold passage. When the query names exactly one product
 * from the catalogue, this re-ranker moves that product's passages ahead of all others and keeps
 * the inner retriever's order within each group. No API call is involved: it is metadata filtering
 * on names the system already knows, the kind of rule that should run before paying for AI.
 */
import type { Product } from "../corpus/synthetic.js";
import type { Hit, Retriever } from "./bm25.js";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The product a query names, matched on whole words and ignoring case. When several names match,
 * the longest wins, so "Tamber 4 Pro" is not read as "Tamber 4". Returns null for no match, or
 * when two different products of the same length both match (the query is ambiguous).
 */
export function findProduct(query: string, products: Product[]): Product | null {
  const matches = products
    .filter((p) => new RegExp(`(^|[^a-z0-9])${escape(p.name.toLowerCase())}($|[^a-z0-9])`).test(query.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);
  if (matches.length === 0) return null;
  if (matches.length > 1 && matches[1]!.name.length === matches[0]!.name.length) return null;
  return matches[0]!;
}

export class ProductFilter implements Retriever {
  readonly name: string;
  private readonly docOf: Map<string, string>;

  /** `passages` maps each passage id to its product docId; `depth` is how many hits to re-rank. */
  constructor(
    private readonly inner: Retriever,
    private readonly products: Product[],
    passages: { id: string; docId: string }[],
    private readonly depth = 50,
  ) {
    this.name = `${inner.name}+product`;
    this.docOf = new Map(passages.map((p) => [p.id, p.docId]));
  }

  async search(query: string, k: number): Promise<Hit[]> {
    const hits = await this.inner.search(query, Math.max(k, this.depth));
    const product = findProduct(query, this.products);
    if (!product) return hits.slice(0, k);
    const named = hits.filter((h) => this.docOf.get(h.id) === product.docId);
    const others = hits.filter((h) => this.docOf.get(h.id) !== product.docId);
    return [...named, ...others].slice(0, k);
  }
}
