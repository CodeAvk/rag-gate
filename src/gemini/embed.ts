/** Minimal Gemini embeddings client over REST, plus the shared POST helper. `fetch` is injectable so tests never touch the network. */

export const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";

export interface EmbedOptions {
  model: string;
  apiKey: string;
  taskType?: TaskType; // only gemini-embedding-001 accepts task_type
  dimensions?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiHttpError extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(`Gemini HTTP ${status}: ${detail}`);
  }
}

function requestBody(text: string, opts: EmbedOptions) {
  return {
    model: `models/${opts.model}`,
    content: { parts: [{ text }] },
    ...(opts.taskType ? { taskType: opts.taskType } : {}),
    ...(opts.dimensions ? { outputDimensionality: opts.dimensions } : {}),
  };
}

/** POST JSON to the Gemini REST API; non-2xx responses become a GeminiHttpError with Google's message. */
export async function post(url: string, body: unknown, opts: { apiKey: string; fetchImpl?: typeof fetch }): Promise<any> {
  const res = await (opts.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text)?.error?.message ?? text;
    } catch {
      /* body was not JSON; keep raw text */
    }
    throw new GeminiHttpError(res.status, detail.replace(/\s+/g, " ").slice(0, 700));
  }
  return JSON.parse(text);
}

export async function embedOne(text: string, opts: EmbedOptions): Promise<number[]> {
  const data = await post(`${BASE}/${opts.model}:embedContent`, requestBody(text, opts), opts);
  return data.embedding.values;
}

export async function embedBatch(texts: string[], opts: EmbedOptions): Promise<number[][]> {
  const body = { requests: texts.map((t) => requestBody(t, opts)) };
  const data = await post(`${BASE}/${opts.model}:batchEmbedContents`, body, opts);
  return data.embeddings.map((e: { values: number[] }) => e.values);
}

export interface QuotaInfo {
  metric?: string;
  limit?: number;
  model?: string;
  retryAfterSeconds?: number;
}

/** Pull the quota metric, limit and retry delay out of a Gemini 429 message. */
export function parseQuotaError(message: string): QuotaInfo {
  const info: QuotaInfo = {};
  const metric = message.match(/Quota exceeded for metric: ([\w./-]+)/);
  if (metric) info.metric = metric[1];
  const limit = message.match(/limit: (\d+)/);
  if (limit) info.limit = Number(limit[1]);
  const model = message.match(/model: ([\w.-]+)/);
  if (model) info.model = model[1];
  const retry = message.match(/retry in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/);
  if (retry) {
    info.retryAfterSeconds = Math.round(
      Number(retry[1] ?? 0) * 3600 + Number(retry[2] ?? 0) * 60 + Number(retry[3]),
    );
  }
  return info;
}
