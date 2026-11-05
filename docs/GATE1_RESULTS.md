# Gate 1 results: does AI retrieval beat keyword search?

Status: **in progress.** BM25 and Gemini embeddings have been measured on the **dev** split only. The held-out split has not been touched; it is used once, for the final comparison.

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

## Gemini embeddings on the dev split (2026-11-05)

`gemini-embedding-001`, 768 dimensions, task types `RETRIEVAL_DOCUMENT` for passages and `RETRIEVAL_QUERY` for questions, cosine similarity. Reproduce with `npm run eval -- --retriever gemini`. The run sent 180 items to the free API (96 passages, 84 questions); a second run sent 0 because every vector is cached.

| Questions | n | Recall@1 | Recall@5 | MRR |
|---|---|---|---|---|
| All | 84 | 1.000 | 1.000 | 1.000 |
| Literal | 42 | 1.000 | 1.000 | 1.000 |
| Paraphrase | 42 | 1.000 | 1.000 | 1.000 |

Compared with BM25 on the same questions: paraphrase Recall@5 rises from 0.643 to 1.000 (+35.7 points) and Recall@1 from 0.238 to 1.000. Literal questions stay at 1.000.

### Checking that the perfect score is real

A perfect score can hide a bug, so the similarity scores were inspected:

- The right passage is first for every question, but often narrowly: the gap to the runner-up is at least 0.036 on literal questions and at least 0.012 on paraphrases (median about 0.05).
- In 68 of 84 questions the runner-up is **the same fact about a different product**, usually the twin model. Example, "If the Kestrel 4 breaks because of a factory fault, for how long am I protected?": Kestrel 4 warranty 0.872, Kestrel 4 returns 0.806, Kestrel 5 warranty 0.783.
- Passage and question vectors come from separate caches and different task types, and no passage contains question text.

### What this does and does not show

- On this set, embeddings fix exactly the weakness BM25 showed: they match a paraphrase to the right fact.
- The set is **too easy for embeddings**: they hit the ceiling, so it cannot tell a good embedding setup from a slightly worse one. That matters for this product, because a regression gate needs a test where scores have room to drop. A harder set is needed: a second, differently worded template set, more look-alike products and longer passages.
- The narrow margins show the real difficulty is telling near-identical product names apart, not the paraphrase.

## The bar for AI retrieval

The rule in `VALIDATION_PLAN.md`, fixed before any embedding results: AI retrieval must beat BM25 by **at least 10 points of Recall@5 on paraphrased questions** on the held-out split, and be no worse on literal ones. On dev that would mean paraphrase Recall@5 of 0.743 or more and literal Recall@5 of 1.000. The binding comparison is on held-out.

## Caveats

- The corpus was written by me with templates designed to expose exactly this weakness, so a large BM25 gap here is expected and does not show how BM25 does on real text.
- BM25 has not been tuned. Untuned is fair as a baseline, but a tuned or stemmed BM25 could do somewhat better.
- 42 paraphrase questions per split is a small sample; one question is about 2.4 points.

## Next

1. ~~Embedding retriever on dev~~ Done (2026-11-05).
2. A harder second template set, so scores are not at the ceiling.
3. Hybrid (BM25 plus embeddings).
4. One final run on held-out.
