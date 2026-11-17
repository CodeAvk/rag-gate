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

## Competitors and alternatives (partly verified, docs read 2026-11-17)
Checked against each tool's own documentation pages, not by running the tools. "Not on the page" means the page I read did not describe it; the tool may still do it elsewhere.

| Tool | Confirmed from its docs | Not on the pages I read |
|---|---|---|
| promptfoo (MIT, Node/TypeScript) | RAG guide (promptfoo.dev/docs/guides/evaluate-rag): retrieval tested with deterministic `contains-all` on retrieved text, or LLM-judged `context-recall` and `context-relevance`; answers checked with LLM-judged `factuality`, `answer-relevance` and `context-faithfulness`, embedding `similar`, or custom code. A web viewer compares prompts, models and pipelines within one run. CI page (docs/integrations/ci-cd): `--fail-on-error` fails on any failed test; a pass-rate threshold needs a custom script over `results.json`; `--tag` can record the git SHA. | Recall@k or MRR; a built-in citation check; a stored baseline or regression diff against an earlier run (the CI page says comparing runs needs your own scripting). |
| Ragas (Apache-2.0, Python) | RAG metrics: Context Precision, Context Recall, Context Entities Recall, Noise Sensitivity, Response Relevancy, Faithfulness. Context recall also has non-LLM versions: `NonLLMContextRecall` (string matching) and `IDBasedContextRecall` (compares retrieved ids with reference ids, close to this project's Recall@k). | CI gating or run history. |
| DeepEval (Python) | Retriever metrics Contextual Relevancy, Precision and Recall; generator metrics Answer Relevancy and Faithfulness. The docs say almost all predefined metrics are LLM-as-a-judge. Pytest integration (`deepeval test run`) for CI. | Comparing a run against an earlier one, on the metrics page; shared reports go through its hosted service. |
| TruLens, LangSmith, Arize Phoenix | Not checked. | Everything. |

What this changes:
- Overlap is large. Every tool above scores faithfulness and context, and promptfoo and DeepEval run in CI. A pass/fail eval in CI is not a differentiator.
- Where this project still differs, as far as the pages show: (1) the answer check is deterministic (citations must be retrieved, about the named product, and contain every number), where the tools above mostly use an LLM judge; (2) the gate compares every metric with a committed baseline tied to a dataset fingerprint and fails on any drop, and promptfoo's docs leave that to custom scripting; (3) cost is bounded to a free tier with a daily cap and caches.
- The deterministic check is narrow: it only works where answers are short facts (numbers, named products). An LLM judge covers open-ended answers that this check cannot.
- No pricing has been checked for any of them. This is a portfolio project; demand is not validated.

## Risks
- Crowded space; promptfoo, Ragas and DeepEval overlap and are mature (see the table above).
- Free-tier embedding quota may be too small for large corpora. Index size has to fit the quota.
- Free-tier terms: submitted text may be used to improve Google's products, so only public or synthetic text may be indexed.
- A synthetic corpus can favour whichever method the author designs for. The test must include paraphrased queries and be built before tuning.
- Without user interviews, demand is not validated.

## Open research tasks
- [x] Measure free-tier embedding limits per minute (100 requests). Daily limit still open.
- [x] Corpus: synthetic, generated in this repo (no third-party licence). See `docs/CORPUS.md`.
- [x] Read promptfoo's RAG documentation and list what it already does (2026-11-17).
- [x] DeepEval metrics page checked (2026-11-17); Ragas metrics checked.
- [ ] Check TruLens and Phoenix feature pages.
- [x] Decide the answer-support check: deterministic (2026-11-13), tested on deliberately broken answers. See `docs/ANSWERS.md`.
