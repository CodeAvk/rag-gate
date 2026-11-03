import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadApiKey } from "../src/env.js";
import { syntheticSentences } from "../src/gate0/probe.js";

function envFile(content: string) {
  const path = join(mkdtempSync(join(tmpdir(), "rag-gate-")), ".env");
  writeFileSync(path, content);
  return path;
}

describe("loadApiKey", () => {
  it("prefers the environment variable", () => {
    expect(loadApiKey("missing.env", { GEMINI_API_KEY: " from-env " })).toBe("from-env");
  });

  it("reads a named key and skips comments and other keys", () => {
    const path = envFile("# comment\nGITHUB_TOKEN=x\nGEMINI_API_KEY=\"abc\"\n");
    expect(loadApiKey(path, {})).toBe("abc");
  });

  it("accepts a bare key on its own line", () => {
    expect(loadApiKey(envFile("barekey123\nGITHUB_TOKEN=x\n"), {})).toBe("barekey123");
  });

  it("fails clearly when there is no key", () => {
    expect(() => loadApiKey(envFile("GITHUB_TOKEN=x\n"), {})).toThrow(/No Gemini API key/);
  });
});

describe("syntheticSentences", () => {
  it("is deterministic and synthetic", () => {
    const a = syntheticSentences(3);
    expect(a).toEqual(syntheticSentences(3));
    expect(a).toHaveLength(3);
    expect(a.every((s) => s.startsWith("Synthetic note"))).toBe(true);
  });
});
