# PRODUCT_RESEARCH.md

Last updated: 2026-11-02. Status: research started, no code. Nothing here is validated demand.

## Idea in one line
RAG Gate: a TypeScript tool that evaluates a RAG pipeline, versions every run and index, verifies that each citation really supports its answer, and fails CI when quality regresses.

## Ideas considered (author's assessment, not market evidence)
| # | Idea | AI's job | Non-AI baseline | Verdict so far |
|---|---|---|---|---|
| 1 | **RAG Gate**: eval, run and index versioning, CI regression gate | Embedding retrieval; answer generation with citations | BM25 keyword retrieval; plain string-match checks | **Chosen for research.** Must beat BM25 on a held-out set. |
| 2 | Retrieval drift monitor: cluster unanswerable queries, flag falling retrieval confidence | Embedding clustering, anomaly detection | Count of zero-result queries | Possible second module. Needs query traffic, which would be synthetic. |
| 3 | Citation-verified docs assistant | Retrieval plus grounded answers | BM25 plus snippet display | Too close to a chatbot alone. Kept only as a part of idea 1. |
| 4 | Runbook triage with feedback loop | Embedding match to runbooks | Keyword rules | Weak: everything would be synthetic. On hold. |
| 5 | Embedding-model comparison dashboard only | Embeddings | BM25 | Folded into idea 1 (it is one view of it). |

## Verified facts (provider pages, fetched 2026-11-02)
- Gemini API embedding models: `gemini-embedding-001` (text only, max input 2,048 tokens, `task_type` supported) and `gemini-embedding-2` (multimodal, max input 8,192 tokens, no `task_type`; task goes in the prompt text). Output size is flexible from 128 to 3072 dimensions. Source: ai.google.dev/gemini-api/docs/embeddings.
- Free tier: input for both models is "free of charge" and "used to improve our products: yes". Paid tier: not used. Source: ai.google.dev/gemini-api/docs/pricing.
- Rate limits: the rate-limit docs page says limits vary by model, apply per project, and that daily quotas reset at midnight Pacific time. It does not list numbers; they are shown only in Google AI Studio. Measured on 2026-11-03 (see `docs/GATE0_RESULTS.md`): **100 embed requests per minute** on the free tier, and items in a batch appear to count individually. The daily limit is still unknown.

## Competitors and alternatives (partly verified)
| Tool | What I confirmed | Not confirmed |
|---|---|---|
| promptfoo | MIT licence. README says it tests "prompts, agents, and RAGs", mentions CI/CD and a results viewer. Package files suggest Node/TypeScript. | Which retrieval metrics it has; whether it tracks runs over time or versions indexes. |
| Ragas | Python, Apache-2.0. Pre-built metrics, test-data generation, framework integrations. | Specific RAG metrics; any CI gating or run tracking. |
| TruLens, DeepEval, LangSmith, Arize Phoenix | Not checked. | Everything. |

No pricing for any competitor has been checked. Differentiation is therefore a hypothesis: versioned indexes and runs, citation-support verification with abstention, and a regression history.

## Risks
- Crowded space; promptfoo overlaps and is mature.
- Free-tier embedding quota may be too small for large corpora. Index size has to fit the quota.
- Free-tier terms: submitted text may be used to improve Google's products, so only public or synthetic text may be indexed.
- A synthetic corpus can favour whichever method the author designs for. The test must include paraphrased queries and be built before tuning.
- Without user interviews, demand is not validated.

## Open research tasks
- [x] Measure free-tier embedding limits per minute (100 requests). Daily limit still open.
- [x] Corpus: synthetic, generated in this repo (no third-party licence). See `docs/CORPUS.md`.
- [ ] Read promptfoo's RAG documentation and list what it already does.
- [ ] Check TruLens, DeepEval and Phoenix feature pages.
- [ ] Decide the answer-support check (deterministic span/overlap check versus a Gemini judge) and how to test the check itself.
