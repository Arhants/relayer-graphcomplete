import { describe, expect, it, vi } from "vitest";

import { createLiveCredentialValidator } from "./live-credentials.mjs";

const reference = "connected-product-provider";

describe("live Eval credential validation", () => {
  it("checks the managed Codex account and always closes its temporary adapter", async () => {
    const close = vi.fn(async () => {});
    const account = vi.fn(async () => ({ status: "connected", account: { type: "chatgpt" } }));
    const createCredentials = vi.fn(() => ({ account, close }));
    const validate = createLiveCredentialValidator({
      resolveCodexRuntime: async () => ({ executable: "/managed/codex", environment: { CODEX_HOME: "/managed/home" } }),
      createCredentials,
    });

    await expect(validate({ name: "codex-basic", implementation: "codex.basic" }, reference)).resolves.toBeUndefined();
    expect(createCredentials).toHaveBeenCalledWith({ CODEX_HOME: "/managed/home", RELAYER_CODEX_BINARY: "/managed/codex" });
    expect(account).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(["disconnected", "unavailable"])("rejects a %s Codex account without exposing adapter details", async (status) => {
    const close = vi.fn(async () => {});
    const validate = createLiveCredentialValidator({
      resolveCodexRuntime: async () => ({ executable: "/managed/codex", environment: {} }),
      createCredentials: () => ({ account: async () => ({ status, error: "secret adapter detail" }), close }),
    });

    await expect(validate({ name: "codex-basic", implementation: "codex.basic" }, reference))
      .rejects.toThrow("Codex credential is not connected");
    expect(close).toHaveBeenCalledOnce();
  });

  it("refreshes and validates the configured Prime route", async () => {
    const selectPrimeModel = vi.fn(async () => ({ providerId: "eval-openrouter", modelId: "model" }));
    const validate = createLiveCredentialValidator({ selectPrimeModel });

    await expect(validate({ name: "prime-agent-deep", implementation: "prime.agent" }, reference)).resolves.toBeUndefined();
    expect(selectPrimeModel).toHaveBeenCalledWith("prime-agent-deep");
  });

  it("masks rejected Prime provider details", async () => {
    const validate = createLiveCredentialValidator({
      selectPrimeModel: async () => { throw new Error("secret provider detail"); },
    });

    await expect(validate({ name: "prime-agent-deep", implementation: "prime.agent" }, reference))
      .rejects.toThrow("Prime credential is not connected");
  });

  it("fails closed for invalid references, configuration identities, and unsupported implementations", async () => {
    const resolveCodexRuntime = vi.fn();
    const selectPrimeModel = vi.fn();
    const validate = createLiveCredentialValidator({ resolveCodexRuntime, selectPrimeModel });

    await expect(validate({ name: "codex-basic", implementation: "codex.basic" }, "raw-secret"))
      .rejects.toThrow("credential reference is unavailable");
    await expect(validate({ name: "", implementation: "codex.basic" }, reference))
      .rejects.toThrow("configuration is invalid");
    await expect(validate({ name: "fixture", implementation: "fixture.task-system" }, reference))
      .rejects.toThrow("no trusted credential validator");
    expect(resolveCodexRuntime).not.toHaveBeenCalled();
    expect(selectPrimeModel).not.toHaveBeenCalled();
  });
});
