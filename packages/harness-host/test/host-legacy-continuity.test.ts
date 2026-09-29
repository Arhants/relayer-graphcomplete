import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { HarnessHost } from "../src/host.js";
import { loadHarnessConfiguration } from "../src/configuration.js";
import { CodexBasicHarness } from "../src/implementations/codex-basic.js";

describe("legacy Codex host registration", () => {
  it.each([false, true])("preserves persisted legacy native identity across registration and reopen (malformed pin=%s)", async (malformed) => {
    const directory = await mkdtemp(join(tmpdir(), "relayer-legacy-host-"));
    const stateFile = join(directory, "sessions.json");
    const configuration = await loadHarnessConfiguration(fileURLToPath(new URL("../../../harnesses/codex-basic.yaml", import.meta.url)));
    const registration = { threadId: 1, permissionProfileId: "auto" as const, configuration, workingDirectory: directory };
    const state = { codexThreadId: "legacy-thread", ...(malformed ? { codexThreadPersonalPresentationVersionId: "invalid-pin" } : {}) };
    const original = JSON.stringify({ schemaVersion: 6, sessions: [{ ...registration, state }] });
    const execute = vi.fn(async () => { throw new Error("Registration must not execute a native turn"); });
    try {
      await writeFile(stateFile, original);
      // Both passes instantiate the production host and Codex adapter from persisted bytes.
      for (let pass = 0; pass < 2; pass += 1) {
        const host = new HarnessHost({ stateFile, controlToken: "fixture-control", implementations: {
          "codex.basic": (context) => new CodexBasicHarness(context, { codexPathOverride: "/managed/codex", runAppServerTurn: execute }),
        } });
        try {
          await host.initialize();
          const beforeRegistration = await readFile(stateFile, "utf8");
          if (malformed) {
            await expect(host.createSession(registration)).rejects.toThrow("saved state was preserved");
            expect(await readFile(stateFile, "utf8")).toBe(beforeRegistration);
          } else {
            await host.createSession(registration);
            expect(JSON.parse(await readFile(stateFile, "utf8")).sessions[0].state).toEqual(state);
          }
        } finally {
          await host.close();
        }
        expect(JSON.parse(await readFile(stateFile, "utf8")).sessions[0].state).toEqual(state);
      }
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
