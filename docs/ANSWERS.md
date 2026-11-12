# Grounded answers (added 2026-11-12)

`src/answer/` turns retrieval into answers. For each question it retrieves the top 5 passages, sends them to Gemini with their ids, and asks for JSON: a short answer plus the ids of the passages it relies on, or `"answer": null` when the passages do not contain the answer.

- Model: `gemini-2.5-flash-lite` at temperature 0, with a JSON response schema (`src/gemini/generate.ts`).
- Quota: a hard cap of 15 generateContent requests per Pacific day per model, counted on disk before each request, failed ones included. Google's docs point to AI Studio for the live free-tier numbers; this account measured 20 per day earlier.
- Cache: answers are keyed by a hash of model and prompt, so rerunning the same questions costs nothing.
- Only synthetic text is sent to the API.

This step does not grade itself. Checking that each citation really supports its answer is the next, deterministic step.

## First run (synthetic-v2 dev, `gemini+product` retrieval, 6 questions)

`npm run answer` samples 3 literal and 3 paraphrased dev questions spread across products.

| Result | Count |
|---|---|
| Answer contains the expected value and cites the gold passage | 5 / 6 |
| Abstained | 1 / 6 |
| Wrong answer or wrong citation | 0 / 6 |
| Requests used | 6 (a rerun used 0, served from the cache) |

The abstention: "Can the Tamber 5 Lite last through a long flight without being plugged in?" The gold passage was retrieved first ("runs for roughly 22 hours between charges"), but the question asks for a judgement the passage does not state, and the model declined rather than guess. That is the cautious behaviour the prompt asks for, but it counts as a miss against the expected value "22". Some paraphrased questions are phrased as yes/no questions, which a numeric expected answer does not fit well.

Six questions is a smoke test, not a measurement. A larger sample is limited by the free daily quota and will be built up over several days through the cache.
