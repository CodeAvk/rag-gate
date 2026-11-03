# VALIDATION_PLAN.md

Rule: do not build the product until the gates it depends on pass. Results are logged below, including failures.

## Gate 0: access and terms
Pass when all hold:
- The Gemini embedding endpoint works with the owner's free key from a script.
- The free-tier limits are measured and written down (per minute, per day, batch size).
- A corpus is chosen whose licence allows this use, or a synthetic generator exists. The licence is recorded.
- Only public or synthetic text is indexed. No exceptions.

## Gate 1: does AI beat the simple baseline? (decide before looking at results)
Test set: at least 60 questions over a corpus with known ground-truth passages, split into a **dev set** (used for tuning) and a **held-out set** (touched once). At least half the questions are paraphrased so they share few words with the passage. Ground truth must be deterministic (known facts) or written by hand, not labelled by the model under test.

Compare, on the held-out set: BM25, Gemini-embedding retrieval, and hybrid (BM25 + embeddings).
Metrics: recall@5, MRR, and the rate of answers whose citation passes the support check.

Pass when AI retrieval (embedding or hybrid) beats BM25 by at least 10 points on recall@5 on the paraphrased questions, and is no worse than BM25 on the rest.

If it does not pass: report it, then either narrow the product to the eval and versioning tooling (with BM25 as the default) or reject the idea. Do not hide the result.

## Gate 2: user validation
**Waived by the owner on 2026-11-02.** This is a portfolio project. Demand is **not validated**, and nothing in the README, docs, commits or profile text may claim demand, users or validation. Say "demand not validated".

## Gate 3: narrow MVP
After Gates 0 and 1. A CLI that indexes a corpus, runs an eval set, stores the run, compares it with the last good run and exits non-zero on regression; plus a small dashboard that shows runs and differences. Measurable success criteria are fixed in `PLAN.md` before building.

## Log
| Date | Gate | Result |
|---|---|---|
| 2026-11-02 | Research | Started. Embedding model names and free-tier terms verified; limits unknown. |
| 2026-11-02 | Gate 2 | Waived by the owner (portfolio project). Demand not validated. |
| 2026-11-03 | Gate 0 | Partly met. Both embedding models work; free tier allows 100 embed requests per minute, and batch items appear to count individually. Daily limit unknown; corpus not chosen. See `docs/GATE0_RESULTS.md`. |
