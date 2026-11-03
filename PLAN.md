# PLAN.md

Status as of 2026-11-03: Gate 0 partly met (per-minute embedding limit measured; daily limit and corpus pending). First code: Gemini embeddings client and the Gate 0 probe, with tests. See `docs/GATE0_RESULTS.md`.

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
- [ ] Choose the corpus and record its licence, or write the synthetic generator.
- [ ] Read promptfoo's RAG docs and update the competitor table.
- [x] Gate 2 decision: waived (2026-11-02).

## Work not done
No retrieval or evaluation code yet, no corpus, no daily-limit measurement, no interviews (waived), no competitor pricing.
