import { CodexCredentialAdapter } from "../main/credentials/codex-credential-adapter.mjs";

const CONNECTED_PRODUCT_PROVIDER = "connected-product-provider";

export function createLiveCredentialValidator({
  resolveCodexRuntime,
  createCredentials = (environment) => new CodexCredentialAdapter({ environment }),
  selectPrimeModel,
} = {}) {
  return async function validateLiveCredential(configuration, credentialReference) {
    if (credentialReference !== CONNECTED_PRODUCT_PROVIDER) {
      throw new Error("The live Eval credential reference is unavailable.");
    }
    if (!configuration || typeof configuration !== "object"
      || typeof configuration.name !== "string" || configuration.name.trim() === ""
      || typeof configuration.implementation !== "string" || configuration.implementation.trim() === "") {
      throw new Error("The live Eval harness configuration is invalid.");
    }

    if (configuration.implementation === "codex.basic") {
      if (typeof resolveCodexRuntime !== "function") {
        throw new Error("The live Eval Codex credential is unavailable.");
      }
      let credentials;
      try {
        const runtime = await resolveCodexRuntime();
        credentials = createCredentials({
          ...runtime.environment,
          RELAYER_CODEX_BINARY: runtime.executable,
        });
        const account = await credentials.account();
        if (account?.status !== "connected") {
          throw new Error("The live Eval Codex credential is not connected.");
        }
      } catch {
        throw new Error("The live Eval Codex credential is not connected.");
      } finally {
        await credentials?.close().catch(() => undefined);
      }
      return;
    }

    if (configuration.implementation === "prime.agent") {
      if (typeof selectPrimeModel !== "function") {
        throw new Error("The live Eval Prime credential is unavailable.");
      }
      try {
        await selectPrimeModel(configuration.name);
      } catch {
        throw new Error("The live Eval Prime credential is not connected.");
      }
      return;
    }

    throw new Error("The live Eval harness has no trusted credential validator.");
  };
}
