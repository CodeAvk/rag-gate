/**
 * Gemini text generation with JSON output, under a hard daily request cap.
 *
 * The free tier allows about 20 generateContent requests per day per model (measured earlier in
 * this account; Google's docs point to AI Studio for the live numbers). The cap here is lower and
 * counts every HTTP attempt, including failed ones, because Google counts those too.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BASE, post } from "./embed.js";

export const DEFAULT_MODEL = "gemini-2.5-flash-lite";
export const DEFAULT_DAILY_CAP = 15;

/** The quota day: Google resets daily limits at midnight Pacific time. */
export function pacificDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

export class DailyCapError extends Error {}

/** Per-model request counter persisted to disk, so the cap holds across runs on the same day. */
export class UsageCounter {
  constructor(private readonly file: string, private readonly cap = DEFAULT_DAILY_CAP, private readonly now = () => new Date()) {}

  used(): number {
    if (!existsSync(this.file)) return 0;
    const saved = JSON.parse(readFileSync(this.file, "utf8")) as { date: string; count: number };
    return saved.date === pacificDate(this.now()) ? saved.count : 0;
  }

  /** Record one request, or throw before sending if the cap is reached. */
  take(): number {
    const count = this.used();
    if (count >= this.cap) {
      throw new DailyCapError(`daily cap of ${this.cap} requests reached for ${pacificDate(this.now())} (Pacific); try after midnight Pacific`);
    }
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ date: pacificDate(this.now()), count: count + 1 }));
    return count + 1;
  }
}

export interface GenerateOptions {
  model: string;
  apiKey: string;
  usage: UsageCounter;
  fetchImpl?: typeof fetch;
}

/** Send one prompt and parse the model's JSON reply, constrained by `schema` (OpenAPI subset). */
export async function generateJson<T>(prompt: string, schema: object, opts: GenerateOptions): Promise<T> {
  opts.usage.take();
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
  };
  const data = await post(`${BASE}/${opts.model}:generateContent`, body, opts);
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) {
    throw new Error(`no text in Gemini reply (finishReason ${candidate?.finishReason ?? "none"}, ` +
      `blockReason ${data?.promptFeedback?.blockReason ?? "none"})`);
  }
  return JSON.parse(text) as T;
}
