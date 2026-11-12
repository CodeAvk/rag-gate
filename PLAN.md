# PLAN.md

Status as of 2026-11-12: Gate 0 nearly met (daily embedding limit unmeasured); **Gate 1 passed** on held-out (`docs/GATE1_RESULTS.md`); Gate 2 waived. Gate 3 started 2026-11-10: run store, regression gate and GitHub Actions CI done; product-name check and CI results table done; grounded answers with citations done (first 6-question run); next is a deterministic check that each citation supports its answer.

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
- [x] Single held-out run (2026-11-09): **Gate 1 passed** (paraphrase R@5 +19.0 points on v1, +52.4 on v2; literal equal).
- [x] Gate 3 MVP, part 1 (2026-11-10): run store with config, commit, dataset fingerprint and metrics; committed BM25 baselines for v1 and v2 dev; `--gate` exits 1 on any drop (checked with a deliberately raised baseline).
- [x] Gate 3 MVP, part 2 (2026-11-11): GitHub Actions runs typecheck, tests, audit and the BM25 gate on every push and pull request; actions pinned to commit SHAs; no secrets.
- [x] Product-name check (2026-11-11): Gemini v2 dev paraphrase R@1 0.964 to 0.988; fixes 2 of 3 misses; gated in CI on BM25.
- [x] CI results table (2026-11-11): each gate step writes metric, baseline and change to the GitHub Actions job summary, with regressions marked.
- [x] Grounded answers (2026-11-12): Gemini answers from retrieved passages with citations or abstains; daily cap 15, answer cache; 6-question smoke run 5 correct, 1 abstention, 0 wrong.
- [ ] Citation check: verify each cited passage supports the answer; report unsupported answers as abstentions.
- [ ] Read promptfoo's RAG docs and update the competitor table.
- [x] Gate 2 decision: waived (2026-11-02).

## Work not done
Gemini baselines are not committed and not checked in CI, because CI has no API key; no daily-limit measurement, no interviews (waived), no competitor pricing.
