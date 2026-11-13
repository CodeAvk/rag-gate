# Grounded answers (added 2026-11-12)

`src/answer/` turns retrieval into answers. For each question it retrieves the top 5 passages, sends them to Gemini with their ids, and asks for JSON: a short answer plus the ids of the passages it relies on, or `"answer": null` when the passages do not contain the answer.

- Model: `gemini-2.5-flash-lite` at temperature 0, with a JSON response schema (`src/gemini/generate.ts`).
- Quota: a hard cap of 15 generateContent requests per Pacific day per model, counted on disk before each request, failed ones included. Google's docs point to AI Studio for the live free-tier numbers; this account measured 20 per day earlier.
- Cache: answers are keyed by a hash of model and prompt, so rerunning the same questions costs nothing.
- Only synthetic text is sent to the API.

The model never grades itself: every answer then goes through the citation check below.

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

## Citation check (added 2026-11-13)

`src/answer/verify.ts` decides, without any model, whether an answer is supported by what it cites. An answer is **supported** only if:

1. it cites at least one passage;
2. every cited passage was actually retrieved and shown to the model (no invented ids);
3. every cited passage is about the product the question names, when it names one (catches the right fact taken from a look-alike product);
4. every number in the answer appears in a cited passage (unicode minus and thousands separators are normalised). An answer with no number must share at least one content word with the cited text.

Anything else is **unsupported**: the answer is not shown and counts as an abstention, with the reasons recorded.

### Results (same 6 synthetic-v2 dev questions)

| Run | Model answered correctly | Model abstained | Check: supported / unsupported | Shown: correct / wrong / abstained |
|---|---|---|---|---|
| Normal retrieval | 5 | 1 | 5 / 0 | 5 / 0 / 1 |
| Gold passage hidden (`--drop-gold`) | 0 | 6 | 0 / 0 | 0 / 0 / 6 |

With the gold passage removed from its context, the model abstained on all 6 questions instead of guessing from the other passages of the same product. So in these 12 real answers the check had nothing to reject.

To show the check working on realistic text, the CLI also breaks each supported answer three ways and checks it again:

| Broken copy | Caught |
|---|---|
| Number changed by one | 5 / 5 |
| Same fact from a look-alike product (e.g. Tamber 4 instead of Tamber 4 Pro), cited correctly | 5 / 5 |
| Citation to a passage id that does not exist | 5 / 5 |

### Limits

- The broken copies are failure types I chose, so 15/15 shows the check catches those, not every possible failure.
- A number that is in a cited passage but answers a different question (quoting the battery hours when asked about recharge time, while citing the battery passage) passes the check. Catching that would need the question's topic matched to the passage, which is not built.
- The product check only applies when the question names a catalogue product.
- 12 real answers is a small sample, limited by the free daily quota.
