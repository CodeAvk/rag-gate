import { existsSync, readFileSync } from "node:fs";

/**
 * Read the Gemini key from the environment, or from a .env file that holds either
 * `GEMINI_API_KEY=...` or a bare key on its own line. The key is never logged.
 */
export function loadApiKey(envPath = ".env", env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.GEMINI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(envPath)) {
    for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) return line;
      if (line.slice(0, eq).trim() === "GEMINI_API_KEY") {
        const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (value) return value;
      }
    }
  }
  throw new Error("No Gemini API key found. Set GEMINI_API_KEY or add it to .env");
}
