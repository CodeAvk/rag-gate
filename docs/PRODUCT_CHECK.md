# Product-name check (added 2026-11-11)

## The problem

At Gate 1, every rank-1 miss by Gemini embeddings on synthetic-v2 was the right fact for a look-alike product: a "Tamber 4" passage ranked above the "Tamber 4 Pro" one the question asked about. Embeddings place such names almost on top of each other.

## The fix

`src/retrieval/product-filter.ts` wraps any retriever. When the question names exactly one product from the catalogue (whole words, case-insensitive, longest name wins, so "Tamber 4 Pro" is never read as "Tamber 4"), that product's passages move ahead of all others; order within each group is kept. No product named, or two named, leaves the ranking unchanged.

It is deterministic and makes no API call. It is metadata filtering on names the system already knows, which is cheaper and more reliable than asking a model to tell the names apart.

Use it with `--retriever gemini+product` or `--retriever bm25+product`.

## Results (dev split, seed 1)

Held-out questions were not used: they were spent once on the Gate 1 verdict.

| synthetic-v2, paraphrase questions (n=84) | R@1 | R@5 | MRR |
|---|---|---|---|
| Gemini | 0.964 | 1.000 | 0.982 |
| Gemini + product check | **0.988** | 1.000 | **0.994** |
| BM25 | 0.143 | 0.440 | 0.281 |
| BM25 + product check | 0.167 | 0.595 | 0.379 |

- Gemini had 3 rank-1 misses. The check fixes the two look-alike ones (Tamber 4 Pro weight, Tamber 5 Lite range). The third (Marlow 5 Lite battery) is the right product but the wrong fact, which a name check cannot fix.
- Literal questions stay at 1.000 for every retriever. On synthetic-v1, Gemini was already at 1.000 and stays there; BM25 paraphrase MRR moves from 0.415 to 0.426.
- The check helps BM25 more, but BM25 + check (paraphrase R@5 0.595) is still far behind Gemini (1.000), so the embeddings keep earning their place.
- A test checks that the filter never lowers BM25's Recall@1 or MRR on either dev set. CI gates `bm25+product` on synthetic-v2 against its committed baseline.

## Limits

- Every question in these synthetic sets names its product, so the check always fires here. Real questions often don't ("does the Pro one last longer?"), and then it does nothing.
- The catalogue is exact strings. Typos, abbreviations or new products not in the catalogue are not handled.
