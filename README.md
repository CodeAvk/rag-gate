# RAG Gate

[![quality-gate](https://github.com/CodeAvk/rag-gate/actions/workflows/quality-gate.yml/badge.svg)](https://github.com/CodeAvk/rag-gate/actions/workflows/quality-gate.yml)

A planned TypeScript tool that tests a retrieval-augmented generation (RAG) pipeline like software: it evaluates retrieval and answers, versions every run and index, checks that each citation really supports its answer, and fails CI when quality regresses.

> **Status: early stage. Gate 1 passed:** on held-out synthetic questions, Gemini embeddings beat BM25 by +19 and +52 points of paraphrase Recall@5. Built so far: the Gemini embeddings client, a quota probe, a synthetic test corpus, the BM25 baseline, Gemini embedding retrieval with a cached index, a hybrid of the two, an evaluation runner, a run store with a regression gate, and CI that runs the gate on every push. This is a portfolio project; demand has not been validated.

## The idea

RAG systems change often (chunk size, embedding model, prompt), and a small change can silently make answers worse. RAG Gate would make that visible:

- run a fixed question set against a versioned index;
- compare retrieval from keyword search (BM25) and from embeddings, so the AI part has to earn its place;
- verify that each cited passage supports the answer, and report an abstention when it does not;
- store runs and compare them with the last good one;
- exit non-zero in CI when a metric drops.

## Where this stands

Built so far (TypeScript, Node 22):

- `src/gemini/embed.ts`: a small REST client for Gemini embeddings (single and batch), with readable errors and a parser for Google's quota messages.
- `src/gate0/probe.ts`: measures what the free tier allows, using synthetic text and a hard cap on calls. First result: 100 embedding requests per minute ([docs/GATE0_RESULTS.md](docs/GATE0_RESULTS.md)).
- `src/corpus/`: seeded generators for two synthetic test sets with exact answers, literal and paraphrased questions, and a held-out split. v2 is the harder one: 24 look-alike products, varied wording and topic traps ([docs/CORPUS.md](docs/CORPUS.md)).
- `src/retrieval/bm25.ts` and `src/eval/`: the BM25 keyword baseline and an evaluation runner (Recall@1, Recall@5, MRR, per question style). BM25 solves literal questions perfectly but reaches only 0.643 Recall@5 on paraphrases ([docs/GATE1_RESULTS.md](docs/GATE1_RESULTS.md)).
- `src/retrieval/hybrid.ts`: hybrid retrieval by reciprocal rank fusion of BM25 and embeddings. On these test sets it is worse than embeddings alone, because BM25 is confidently wrong on paraphrases, so it is not the default ([docs/GATE1_RESULTS.md](docs/GATE1_RESULTS.md)).
- `src/retrieval/embedding.ts`: Gemini embedding retrieval with an on-disk vector cache (each text is embedded once), a rate limiter under the free-tier limit, and retry after a 429. On the dev set it scores 1.000 Recall@5 on paraphrases, which also shows the test set is too easy and needs a harder version.
- `src/gate/runs.ts`: the run store and regression check. Every eval run is appended to a local history with its config, the git commit, a fingerprint of the exact dataset and its metrics. A run can be saved as the baseline for its config (`baselines/`, committed); `--gate` compares a new run with it and exits 1 if any metric (Recall@1, Recall@5, MRR, overall or per style) drops by more than the tolerance. Runs on a changed dataset are refused rather than compared.
- `.github/workflows/quality-gate.yml`: CI on every push and pull request. It runs the typecheck, the unit tests and `npm audit`, then the regression gate on BM25 for both synthetic dev sets. BM25 needs no API key, so CI uses no secrets; Gemini runs stay local because of the free-tier quota.

```
npm install
npm test            # unit tests, no network
npm run typecheck
npm run corpus      # writes the synthetic corpus to data/corpus/
npm run eval        # scores BM25 on the dev split
npm run eval -- --retriever gemini   # embeddings; first run sends about 180 items to the free API
npm run eval -- --retriever gemini --corpus v2   # harder set; first run sends about 360 items
npm run eval -- --retriever hybrid --corpus v2   # BM25 + embeddings fused; reuses cached vectors
npm run eval -- --corpus v2 --save-baseline     # make this run the baseline for its config
npm run eval -- --corpus v2 --gate              # compare with the baseline; exit 1 on any drop
npm run gate -- --corpus v2                     # same check; this is what CI runs
npm run eval -- --corpus v2 --gate --tolerance 0.02   # allow drops of up to 0.02
npm run probe       # needs GEMINI_API_KEY in .env; makes up to 60 calls
```

The plan and the evidence so far are in:

- [PRODUCT_RESEARCH.md](PRODUCT_RESEARCH.md): ideas considered, verified facts, competitors, risks, and what is still unverified
- [VALIDATION_PLAN.md](VALIDATION_PLAN.md): the gates the project must pass before it is built
- [PLAN.md](PLAN.md): phases, draft success criteria and next actions

Existing tools such as promptfoo and Ragas already cover parts of this space, so any differentiation here is a hypothesis until it is tested.

## Planned stack

TypeScript throughout: Node, a small API and job queue, a vector store, a Next.js dashboard, Vitest and GitHub Actions. Embeddings and answers use the free tier of the Gemini API, so only public or synthetic text is ever indexed.
