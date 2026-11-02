# CLAUDE.md — rag-gate rules

Personal portfolio project. Owner's GitHub account: `CodeAvk` (https://github.com/CodeAvk). Repo: `CodeAvk/rag-gate`.

## Product requirements
- AI must do real work (retrieval, grounded answering with verified citations, anomaly detection). A generic chatbot or a CRUD app with a chat box does not qualify.
- Every AI component must beat a simpler non-AI baseline (BM25 keyword search) on a measured test. If it does not, say so in `PRODUCT_RESEARCH.md` and cut it or reject the idea.
- Use free-tier AI APIs (Gemini). No local or built-in models. If no free API fits, use deterministic logic. Never present canned output as AI output.
- Verify free-tier limits and data terms on the provider's own page before relying on them. Free-tier content may be used by the provider to improve its products, so send only public or synthetic text. Stay inside free quota.
- Never fabricate interviews, demand, benchmarks or sources. Mark unverified claims as unverified.
- Gates in `VALIDATION_PLAN.md` apply, except Gate 2 (user interviews), which the owner waived on 2026-11-02. This is a portfolio project: never claim user demand or validation in the README, docs, commits or any profile text. Say "demand not validated".

## Language
- TypeScript first: backend, CLI, dashboard and tests. Write real features only. No filler code, generated bulk or line padding to change language statistics.

## Git and GitHub safety
- The machine's global git identity is a work identity. Never commit or push with it. This repo uses a repo-local identity: `CodeAvk` / `avksmlavk@gmail.com`.
- Before any push, check `git config user.name`, `git config user.email` and `git remote -v` (destination must be `CodeAvk/rag-gate`). If anything is ambiguous, stop and report.
- Never push to company repos. Never copy company code, secrets, data or proprietary material here. Keep employer details out of this repo.
- Keys and tokens live in a git-ignored `.env`, never in the repo, never printed. Run tests, a secret scan over all history and a dependency audit before every push.
- One feature per commit, pushed when finished, tested and verified. No fake, backdated or filler commits. No AI co-author trailers on commits.

## Data and licences
- No real personal data. Use synthetic documents or text with a licence that allows this use, and record the licence next to the data.
