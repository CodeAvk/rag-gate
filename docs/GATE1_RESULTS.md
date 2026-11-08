# Gate 1 results: does AI retrieval beat keyword search?

Status: **in progress.** BM25, Gemini embeddings and a hybrid of the two have been measured on the **dev** splits of v1 and v2 only. The held-out split has not been touched; it is used once, for the final comparison.

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

## synthetic-v2 on the dev split (2026-11-08)

The harder set (see `docs/CORPUS.md`): 192 passages, 168 dev questions. Reproduce with `npm run eval -- --corpus v2` and `npm run eval -- --retriever gemini --corpus v2`. The Gemini run sent 372 items (360 texts plus one batch of 12 retried after a 429).

| Retriever | Questions | Recall@1 | Recall@5 | MRR |
|---|---|---|---|---|
| BM25 | Literal (84) | 1.000 | 1.000 | 1.000 |
| BM25 | Paraphrase (84) | 0.143 | 0.440 | 0.281 |
| Gemini embeddings | Literal (84) | 1.000 | 1.000 | 1.000 |
| Gemini embeddings | Paraphrase (84) | 0.964 | 1.000 | 0.982 |

What changed compared with v1:

- BM25 got much worse on paraphrases (Recall@5 0.643 to 0.440). It now also lands on the wrong product: in 9 of its 47 paraphrase misses the top hit was a look-alike product, because of the "Pro" and "Lite" models.
- Gemini is no longer perfect at rank 1. Its 3 misses, all with the right passage second: two look-alike products (`tamber-4-pro` weight ranked below `tamber-4`, `tamber-5-lite` range below `tamber-5`) and one topic trap (a battery question matched the warranty passage that mentions battery wear).
- Recall@5 is still 1.000 for Gemini, so v2 is still at the ceiling on that metric. Recall@1 and MRR now have room to move, so a regression gate should watch them, not only Recall@5.

## Hybrid (BM25 + embeddings) on the dev splits (2026-11-08)

Reciprocal rank fusion (k = 60) of the BM25 and Gemini rankings, top 50 from each, equal weight (`src/retrieval/hybrid.ts`). Reproduce with `npm run eval -- --retriever hybrid --corpus v1` (or `v2`). It reused the cached vectors, so it sent 0 items to the API.

Paraphrased questions:

| Set | Retriever | Recall@1 | Recall@5 | MRR |
|---|---|---|---|---|
| v1 | BM25 | 0.238 | 0.643 | 0.415 |
| v1 | Gemini | 1.000 | 1.000 | 1.000 |
| v1 | Hybrid | 0.786 | 1.000 | 0.893 |
| v2 | BM25 | 0.143 | 0.440 | 0.281 |
| v2 | Gemini | 0.964 | 1.000 | 0.982 |
| v2 | Hybrid | 0.583 | 0.952 | 0.736 |

Literal questions stay at 1.000 for all three.

**Finding: equal-weight hybrid is worse than embeddings alone here.** On v2 it put the right passage lower than Gemini did for 35 paraphrases and higher for 2. On paraphrases BM25 is confidently wrong (it ranks the other facts of the right product first), and RRF gives that wrong ranking the same vote as the embedding ranking.

This is a property of this test set, where literal questions are already solved by both methods and paraphrases are BM25's worst case. On real text, where exact terms such as model numbers or error codes matter, hybrid often helps; that is not tested here.

**Decision:** embeddings alone are the AI retriever taken to the held-out run. Hybrid stays available (`--retriever hybrid`) but is not the default. A weighted fusion that trusts BM25 less is a possible later experiment, decided before looking at held-out.

## The bar for AI retrieval

The rule in `VALIDATION_PLAN.md`, fixed before any embedding results: AI retrieval must beat BM25 by **at least 10 points of Recall@5 on paraphrased questions** on the held-out split, and be no worse on literal ones. On dev that would mean paraphrase Recall@5 of 0.743 or more and literal Recall@5 of 1.000. The binding comparison is on held-out.

## Caveats

- The corpus was written by me with templates designed to expose exactly this weakness, so a large BM25 gap here is expected and does not show how BM25 does on real text.
- BM25 has not been tuned. Untuned is fair as a baseline, but a tuned or stemmed BM25 could do somewhat better.
- 42 paraphrase questions per split is a small sample; one question is about 2.4 points.

## Next

1. ~~Embedding retriever on dev~~ Done (2026-11-05).
2. ~~A harder second template set~~ Done (2026-11-08): Recall@1 and MRR now have headroom; Recall@5 does not.
3. ~~Hybrid (BM25 plus embeddings)~~ Done (2026-11-08): worse than embeddings alone on this data; not the default.
4. One final run on held-out: BM25 versus Gemini embeddings, on v1 and v2.
