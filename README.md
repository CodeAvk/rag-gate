# RAG Gate

A planned TypeScript tool that tests a retrieval-augmented generation (RAG) pipeline like software: it evaluates retrieval and answers, versions every run and index, checks that each citation really supports its answer, and fails CI when quality regresses.

> **Status: early stage.** Built so far: the Gemini embeddings client, a quota probe, a synthetic test corpus, the BM25 baseline, Gemini embedding retrieval with a cached index, and an evaluation runner. This is a portfolio project; demand has not been validated.

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
- `src/corpus/synthetic.ts`: a seeded generator for a synthetic test corpus with exact answers, literal and paraphrased questions, and a held-out split ([docs/CORPUS.md](docs/CORPUS.md)).
- `src/retrieval/bm25.ts` and `src/eval/`: the BM25 keyword baseline and an evaluation runner (Recall@1, Recall@5, MRR, per question style). BM25 solves literal questions perfectly but reaches only 0.643 Recall@5 on paraphrases ([docs/GATE1_RESULTS.md](docs/GATE1_RESULTS.md)).
- `src/retrieval/embedding.ts`: Gemini embedding retrieval with an on-disk vector cache (each text is embedded once), a rate limiter under the free-tier limit, and retry after a 429. On the dev set it scores 1.000 Recall@5 on paraphrases, which also shows the test set is too easy and needs a harder version.

```
npm install
npm test            # unit tests, no network
npm run typecheck
npm run corpus      # writes the synthetic corpus to data/corpus/
npm run eval        # scores BM25 on the dev split
npm run eval -- --retriever gemini   # embeddings; first run sends about 180 items to the free API
npm run probe       # needs GEMINI_API_KEY in .env; makes up to 60 calls
```

The plan and the evidence so far are in:

- [PRODUCT_RESEARCH.md](PRODUCT_RESEARCH.md): ideas considered, verified facts, competitors, risks, and what is still unverified
- [VALIDATION_PLAN.md](VALIDATION_PLAN.md): the gates the project must pass before it is built
- [PLAN.md](PLAN.md): phases, draft success criteria and next actions

Existing tools such as promptfoo and Ragas already cover parts of this space, so any differentiation here is a hypothesis until it is tested.

## Planned stack

TypeScript throughout: Node, a small API and job queue, a vector store, a Next.js dashboard, Vitest and GitHub Actions. Embeddings and answers use the free tier of the Gemini API, so only public or synthetic text is ever indexed.
