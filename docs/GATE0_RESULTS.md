# Gate 0 results: what the free embedding tier allows

Measured 2026-11-03 with `npm run probe` (`src/gate0/probe.ts`). The probe sends only synthetic sentences, stops at a hard local cap of 60 HTTP calls, and reads limits from Google's own 429 error messages. This run made 43 calls. Raw output is written to `data/gate0/` (git-ignored).

## Findings

| Question | Result | Confidence |
|---|---|---|
| Do both embedding models work on the free key? | Yes: `gemini-embedding-001` and `gemini-embedding-2` both returned vectors. | Measured |
| Default vector size | 3072 for both models. | Measured |
| Latency of one call | About 1.0 to 1.4 s (40 back-to-back calls took 37.8 s, about 0.95 s each). | Measured, one run |
| Per-minute limit | **100 embed requests per minute** on the free tier. Google's 429 named the metric `embed_content_free_tier_requests`, `limit: 100`, model `gemini-embedding-1.0`, "requests per minute". | Measured (quoted from the API) |
| Does batching save quota? | **Apparently not.** A single batch of 100 texts, sent right after one single call, was refused with that per-minute limit, so each text in a batch seems to count as one request. | Inferred from one refusal; not yet confirmed with a smaller batch |
| Daily limit | **Unknown.** It was not reached in 43 calls and is not listed on Google's docs pages. | Not measured |
| Limit for `gemini-embedding-2` | Unknown; only one call was made to it. | Not measured |

## What this means for the design

- Embedding speed is bounded at about 100 texts per minute. A corpus of 2,000 chunks would take at least 20 minutes to index, so indexes must be cached and versioned rather than rebuilt on every run.
- Batches should stay well under 100 texts and be paced across minutes, with retry after the delay Google returns.
- Eval runs embed only the questions (60 or more) when the index is unchanged, which fits inside one minute's quota.
- The free-tier terms still apply: content may be used to improve Google's products, so only public or synthetic text is sent.

## Gate 0 status

| Criterion | Status |
|---|---|
| Embedding endpoint works with the free key | Done |
| Free-tier limits measured | Partly: per-minute limit measured; daily limit and the `gemini-embedding-2` limit not yet |
| Licence-safe or synthetic corpus chosen | Done (2026-11-04): synthetic-v1, generated in this repo, see `docs/CORPUS.md` |
| Only public or synthetic text sent | Holding (probe used synthetic sentences only) |

**Gate 0 is not passed yet.**

## Next
1. Confirm batch counting with a batch of 10, and measure the daily limit only if a design decision depends on it.
2. ~~Choose the corpus~~ Done: synthetic generator with known facts (`docs/CORPUS.md`).
