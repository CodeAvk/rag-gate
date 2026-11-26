import { describe, expect, it } from "vitest";
import { interpretBatchCount, type BatchOutcome } from "../src/gate0/batch-count.js";

const ok: BatchOutcome = { ok: true, ms: 900 };
const quota: BatchOutcome = { ok: false, ms: 300, status: 429, quota: { limit: 100 } };
const accepted = (n: number) => Array.from({ length: n }, () => ok);

describe("interpretBatchCount", () => {
  it("counts per text when the batch that passes the limit is refused", () => {
    const verdict = interpretBatchCount([...accepted(10), quota], 10, 12_000);
    expect(verdict).toMatchObject({ counting: "per-text", batchesAccepted: 10, textsAccepted: 100 });
  });

  it("counts per batch when more texts than the limit pass", () => {
    const verdict = interpretBatchCount(accepted(15), 10, 14_000);
    expect(verdict).toMatchObject({ counting: "per-batch", batchesAccepted: 15, textsAccepted: 150 });
  });

  it("is inconclusive when the refusal comes too early", () => {
    expect(interpretBatchCount([...accepted(4), quota], 10, 5_000).counting).toBe("inconclusive");
  });

  it("is inconclusive when the batches take more than a minute", () => {
    expect(interpretBatchCount(accepted(15), 10, 61_000).counting).toBe("inconclusive");
  });

  it("is inconclusive when the failure is not a quota refusal", () => {
    const serverError: BatchOutcome = { ok: false, ms: 200, status: 500 };
    expect(interpretBatchCount([...accepted(10), serverError], 10, 12_000).counting).toBe("inconclusive");
  });

  it("is inconclusive when too few texts were sent", () => {
    expect(interpretBatchCount(accepted(5), 10, 5_000).counting).toBe("inconclusive");
  });
});
