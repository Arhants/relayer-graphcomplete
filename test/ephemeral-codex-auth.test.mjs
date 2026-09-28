import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  isEphemeralCodexApiKeyAuth,
  removeLeftoverEphemeralCodexAuthFiles,
} from "../desktop/main/providers/ephemeral-codex-auth.mjs";

const directories = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("leftover ephemeral Codex API-key auth", () => {
  it("recognizes only the secret-turn auth.json shape", () => {
    expect(isEphemeralCodexApiKeyAuth({ auth_mode: "apikey", OPENAI_API_KEY: "sk-test" })).toBe(true);
    expect(isEphemeralCodexApiKeyAuth({ tokens: { access_token: "session" } })).toBe(false);
    expect(isEphemeralCodexApiKeyAuth({ auth_mode: "chatgpt", OPENAI_API_KEY: "sk-test" })).toBe(false);
    expect(isEphemeralCodexApiKeyAuth("legacy-session")).toBe(false);
  });

  it("removes crash leftovers from isolated provider homes and leaves subscription sessions", async () => {
    const profile = await mkdtemp(join(tmpdir(), "relayer-ephemeral-auth-"));
    directories.push(profile);
    const runtimeRoot = join(profile, "provider-runtimes");
    const legacyHome = join(profile, "codex-home");
    const openaiHome = join(runtimeRoot, "openai-api", "codex-home");
    const openrouterHome = join(runtimeRoot, "openrouter", "codex-home");
    const subscriptionHome = join(runtimeRoot, "new-codex-connection", "codex-home");
    await mkdir(legacyHome, { recursive: true });
    await mkdir(openaiHome, { recursive: true });
    await mkdir(openrouterHome, { recursive: true });
    await mkdir(subscriptionHome, { recursive: true });
    await writeFile(join(legacyHome, "auth.json"), JSON.stringify({
      auth_mode: "apikey",
      OPENAI_API_KEY: "must-not-touch-legacy",
    }));
    await writeFile(join(openaiHome, "auth.json"), `${JSON.stringify({
      auth_mode: "apikey",
      OPENAI_API_KEY: "openai-leftover",
    })}\n`);
    await writeFile(join(openrouterHome, "auth.json"), JSON.stringify({
      auth_mode: "apikey",
      OPENAI_API_KEY: "openrouter-leftover",
    }));
    await writeFile(join(subscriptionHome, "auth.json"), JSON.stringify({
      tokens: { access_token: "isolated-subscription" },
    }));
    await writeFile(join(runtimeRoot, "openai-api", "unrelated.json"), "keep");

    const result = await removeLeftoverEphemeralCodexAuthFiles(runtimeRoot);
    expect(result.failures).toEqual([]);
    expect([...result.removed].sort()).toEqual(["openai-api", "openrouter"]);

    await expect(readFile(join(openaiHome, "auth.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(openrouterHome, "auth.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(legacyHome, "auth.json"), "utf8")).resolves.toContain("must-not-touch-legacy");
    await expect(readFile(join(subscriptionHome, "auth.json"), "utf8")).resolves.toContain("isolated-subscription");
    await expect(readFile(join(runtimeRoot, "openai-api", "unrelated.json"), "utf8")).resolves.toBe("keep");
  });

  it("removes API-key temp files a crash left between write and rename, and keeps everything else", async () => {
    const profile = await mkdtemp(join(tmpdir(), "relayer-ephemeral-auth-tmp-"));
    directories.push(profile);
    const runtimeRoot = join(profile, "provider-runtimes");
    const openaiHome = join(runtimeRoot, "openai-api", "codex-home");
    const openrouterHome = join(runtimeRoot, "openrouter", "codex-home");
    const subscriptionHome = join(runtimeRoot, "new-codex-connection", "codex-home");
    await mkdir(openaiHome, { recursive: true });
    await mkdir(openrouterHome, { recursive: true });
    await mkdir(subscriptionHome, { recursive: true });
    // The exact name and content codex.basic writes before renaming onto auth.json.
    const apiKeyTemp = ".auth.json.0b7c5a52-3f8e-4d0a-9f3e-6c1b2a4d5e6f.tmp";
    await writeFile(join(openaiHome, apiKeyTemp), `${JSON.stringify({
      auth_mode: "apikey",
      OPENAI_API_KEY: "temp-leftover",
    })}\n`);
    // A crash mid-write leaves a truncated secret that no longer parses.
    const partialTemp = ".auth.json.9d4e2f10-1a2b-4c3d-8e4f-5a6b7c8d9e0f.tmp";
    await writeFile(join(openrouterHome, partialTemp), "{\"auth_mode\":\"apikey\",\"OPENAI_API_KE");
    // Subscription auth.json, a non-API-key temp-shaped file, and unrelated files stay.
    await writeFile(join(subscriptionHome, "auth.json"), JSON.stringify({
      tokens: { access_token: "isolated-subscription" },
    }));
    const subscriptionTemp = ".auth.json.1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b.tmp";
    await writeFile(join(subscriptionHome, subscriptionTemp), JSON.stringify({
      tokens: { access_token: "not-an-api-key" },
    }));
    await writeFile(join(openaiHome, "config.toml"), "keep-config");
    await writeFile(join(openaiHome, "auth.json.bak"), JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "not-ours" }));

    const result = await removeLeftoverEphemeralCodexAuthFiles(runtimeRoot);
    expect(result.failures).toEqual([]);
    expect([...result.removed].sort()).toEqual(["openai-api", "openrouter"]);

    await expect(readFile(join(openaiHome, apiKeyTemp), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(openrouterHome, partialTemp), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(subscriptionHome, "auth.json"), "utf8")).resolves.toContain("isolated-subscription");
    await expect(readFile(join(subscriptionHome, subscriptionTemp), "utf8")).resolves.toContain("not-an-api-key");
    await expect(readFile(join(openaiHome, "config.toml"), "utf8")).resolves.toBe("keep-config");
    await expect(readFile(join(openaiHome, "auth.json.bak"), "utf8")).resolves.toContain("not-ours");
  });

  it("reports a provider once when both its auth.json and a temp file were leftovers", async () => {
    const profile = await mkdtemp(join(tmpdir(), "relayer-ephemeral-auth-both-"));
    directories.push(profile);
    const runtimeRoot = join(profile, "provider-runtimes");
    const openaiHome = join(runtimeRoot, "openai-api", "codex-home");
    await mkdir(openaiHome, { recursive: true });
    const secret = JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "leftover" });
    const temp = ".auth.json.2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d.tmp";
    await writeFile(join(openaiHome, "auth.json"), secret);
    await writeFile(join(openaiHome, temp), secret);

    const result = await removeLeftoverEphemeralCodexAuthFiles(runtimeRoot);
    expect(result).toEqual({ removed: ["openai-api"], failures: [] });
    await expect(readFile(join(openaiHome, "auth.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(openaiHome, temp), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("treats a missing provider-runtime root as already clean", async () => {
    await expect(removeLeftoverEphemeralCodexAuthFiles(join(tmpdir(), "relayer-missing-provider-runtimes")))
      .resolves.toEqual({ removed: [], failures: [] });
  });
});
