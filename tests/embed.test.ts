import { describe, expect, it } from "vitest";
import { embedBatch, embedOne, GeminiHttpError, parseQuotaError } from "../src/gemini/embed.js";

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  return (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe("embedOne", () => {
  it("posts to embedContent with the key in a header and returns the vector", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const values = await embedOne("hello", {
      model: "gemini-embedding-001", apiKey: "k", taskType: "RETRIEVAL_QUERY", dimensions: 768,
      fetchImpl: fakeFetch(200, { embedding: { values: [0.1, 0.2] } }, seen),
    });
    expect(values).toEqual([0.1, 0.2]);
    expect(seen.url).toMatch(/gemini-embedding-001:embedContent$/);
    expect(seen.url).not.toContain("k");
    const body = JSON.parse(String(seen.init?.body));
    expect(body).toMatchObject({ taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 });
    expect((seen.init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
  });

  it("omits optional fields when not given", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    await embedOne("hi", { model: "gemini-embedding-2", apiKey: "k",
      fetchImpl: fakeFetch(200, { embedding: { values: [1] } }, seen) });
    const body = JSON.parse(String(seen.init?.body));
    expect(body).not.toHaveProperty("taskType");
    expect(body).not.toHaveProperty("outputDimensionality");
  });

  it("raises GeminiHttpError with the API's short message", async () => {
    const err = await embedOne("x", { model: "m", apiKey: "k",
      fetchImpl: fakeFetch(400, { error: { message: "bad   request" } }) }).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiHttpError);
    expect(err.status).toBe(400);
    expect(err.detail).toBe("bad request");
  });

  it("keeps a non-JSON error body", async () => {
    const err = await embedOne("x", { model: "m", apiKey: "k", fetchImpl: fakeFetch(503, "unavailable") })
      .catch((e) => e);
    expect(err.detail).toBe("unavailable");
  });
});

describe("embedBatch", () => {
  it("sends one request per text and returns vectors in order", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const out = await embedBatch(["a", "b"], { model: "gemini-embedding-001", apiKey: "k",
      fetchImpl: fakeFetch(200, { embeddings: [{ values: [1] }, { values: [2] }] }, seen) });
    expect(out).toEqual([[1], [2]]);
    expect(seen.url).toMatch(/:batchEmbedContents$/);
    expect(JSON.parse(String(seen.init?.body)).requests).toHaveLength(2);
  });
});

describe("parseQuotaError", () => {
  it("reads metric, limit, model and retry delay", () => {
    const msg = "You exceeded your current quota. * Quota exceeded for metric: " +
      "generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, " +
      "model: gemini-2.5-flash Please retry in 2h33m12.33s.";
    expect(parseQuotaError(msg)).toEqual({
      metric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
      limit: 20, model: "gemini-2.5-flash", retryAfterSeconds: 9192,
    });
  });

  it("handles seconds-only retry and missing fields", () => {
    expect(parseQuotaError("Please retry in 41.5s.")).toEqual({ retryAfterSeconds: 42 });
    expect(parseQuotaError("something else")).toEqual({});
  });
});
