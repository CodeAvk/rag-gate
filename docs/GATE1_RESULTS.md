# Gate 1 results: does AI retrieval beat keyword search?

Status: **in progress.** Only the BM25 baseline has been measured, and only on the **dev** split. The held-out split has not been touched; it is used once, for the final comparison.

## BM25 baseline on the dev split (2026-11-05)

Corpus `synthetic-v1`, seed 1 (see `docs/CORPUS.md`): 96 passages, 84 dev questions. BM25 with k1 = 1.2, b = 0.75, untuned. Reproduce with `npm run eval`.

| Questions | n | Recall@1 | Recall@5 | MRR |
|---|---|---|---|---|
| All | 84 | 0.619 | 0.821 | 0.707 |
| Literal | 42 | 1.000 | 1.000 | 1.000 |
| Paraphrase | 42 | 0.238 | 0.643 | 0.415 |

## What the misses show

- Literal questions are solved perfectly, as expected when the question reuses the passage's words.
- On paraphrases BM25 still finds the **right product** every time: in all 15 paraphrase misses beyond rank 5, the top hit belonged to the correct product. It picks the **wrong fact** about that product, because the paraphrase shares almost no words with the right passage. The misses were 9 warranty questions and 6 operating-temperature questions.
- A paraphrase Recall@5 of 0.643 is close to what guessing 5 of a product's 8 passages would give (0.625), which fits that explanation.

## The bar for AI retrieval

The rule in `VALIDATION_PLAN.md`, fixed before any embedding results: AI retrieval must beat BM25 by **at least 10 points of Recall@5 on paraphrased questions** on the held-out split, and be no worse on literal ones. On dev that would mean paraphrase Recall@5 of 0.743 or more and literal Recall@5 of 1.000. The binding comparison is on held-out.

## Caveats

- The corpus was written by me with templates designed to expose exactly this weakness, so a large BM25 gap here is expected and does not show how BM25 does on real text.
- BM25 has not been tuned. Untuned is fair as a baseline, but a tuned or stemmed BM25 could do somewhat better.
- 42 paraphrase questions per split is a small sample; one question is about 2.4 points.

## Next

1. Embedding retriever (`gemini-embedding-001`, document and query task types) on the dev split, with the index cached so it is embedded once.
2. Hybrid (BM25 plus embeddings).
3. One final run of all three on held-out.
