# PLAN.md

Status as of 2026-11-04: Gate 0 nearly met: per-minute embedding limit measured and synthetic corpus built (`docs/CORPUS.md`); daily limit still unmeasured. Gate 1 on dev: embeddings beat BM25 on paraphrases on both sets (v2: R@5 1.000 vs 0.440). v2 gives Recall@1 and MRR headroom; Recall@5 is still at the ceiling. Held-out run still pending (`docs/GATE1_RESULTS.md`).

## Phases
1. **Research**: in progress. See `PRODUCT_RESEARCH.md`.
2. **Gate 0, access and terms**: measure the free embedding limits; choose a licence-safe or synthetic corpus.
3. **Gate 1, AI versus baseline**: BM25 versus embeddings versus hybrid on a held-out set. Reject or narrow if AI does not win.
4. **Gate 2, user validation**: waived by the owner (2026-11-02). Portfolio project; demand is not validated and is never claimed.
5. **Gate 3, MVP**: TypeScript CLI plus dashboard; success criteria below.
6. **Publish**: each push follows `CLAUDE.md` (identity, remote, tests, secret scan, audit).

## MVP success criteria (draft, to confirm after Gate 1)
- A run of 60 or more questions completes inside the free quota, and the run is reproducible from a stored config.
- A deliberate regression (for example a smaller chunk size) fails the CI check with a readable diff; an unchanged config passes.
- Every cited passage in a reported answer is checked, and unsupported answers are reported as abstentions.
- Tests cover the metrics, the support check and the regression gate.

## Planned stack (TypeScript throughout, subject to Gate 0)
Node 22, Fastify or Hono, BullMQ with Redis for jobs, Postgres with pgvector or Qdrant for vectors, Next.js dashboard, Vitest, GitHub Actions, Docker Compose.

## Next actions
- [x] Measure the free-tier embedding limits with a small script (2026-11-03: 100 requests per minute).
- [ ] Confirm whether batch items count individually; measure the daily limit only if the design needs it.
- [x] Synthetic corpus generator with exact ground truth (2026-11-04).
- [x] BM25 baseline and retrieval metrics on the dev set (2026-11-05: paraphrase R@5 0.643, literal 1.000).
- [x] Embedding retriever with a cached index, on the dev set (2026-11-05: 1.000 on every metric; set too easy).
- [x] Harder second template set (2026-11-08, synthetic-v2): Gemini paraphrase R@1 0.964, R@5 1.000; BM25 R@5 0.440.
- [x] Hybrid retriever by reciprocal rank fusion (2026-11-08): worse than embeddings alone on paraphrases (v2 R@1 0.583 vs 0.964); kept as an option, not the default.
- [ ] Single held-out run: BM25 versus Gemini embeddings on v1 and v2.
- [ ] Read promptfoo's RAG docs and update the competitor table.
- [x] Gate 2 decision: waived (2026-11-02).

## Work not done
No held-out run yet, no daily-limit measurement, no interviews (waived), no competitor pricing.
