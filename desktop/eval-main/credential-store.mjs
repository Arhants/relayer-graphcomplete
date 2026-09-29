import { spawn } from "node:child_process";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { createEncryptedCredentialStore } from "../main/providers/provider-definition-store.mjs";

const service = "app.relayer.eval.provider-master-key.v1";
const storageError = (code, message) => Object.assign(new Error(message), { code });
const unavailable = () => storageError("EVAL_CREDENTIAL_UNAVAILABLE", "Eval credential storage is unavailable. Unlock the macOS Keychain and try again.");
const corrupt = (message = "Eval credential data is invalid; existing data was preserved.") => storageError("EVAL_CREDENTIAL_CORRUPT", message);

// Command arguments contain only public identifiers. The new master key travels
// through stdin; neither subprocess output nor native errors enter diagnostics.
function runSecurity(args, input) {
  return new Promise((resolve, reject) => {
    const environment = Object.fromEntries(["HOME", "USER", "LOGNAME", "TMPDIR", "LANG"].flatMap((name) => typeof process.env[name] === "string" ? [[name, process.env[name]]] : []));
    const child = spawn("/usr/bin/security", args, { env: environment, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let failed = false;
    const timeout = setTimeout(() => { failed = true; child.kill(); }, 30_000);
    child.stdin.on("error", () => {});
    child.stdout.on("data", (bytes) => { stdout += bytes.toString(); if (stdout.length > 8192) { failed = true; child.kill(); } });
    child.stderr.on("data", () => {});
    child.on("error", () => { clearTimeout(timeout); reject(unavailable()); });
    child.on("close", (code) => { clearTimeout(timeout); if (failed || code === null) reject(unavailable()); else resolve({ code, stdout }); });
    child.stdin.end(input);
  });
}

export function createEvalCredentialStore({ userDataDirectory, platform = process.platform, security = runSecurity } = {}) {
  if (typeof userDataDirectory !== "string" || !userDataDirectory) throw new Error("An Eval profile directory is required.");
  const path = join(userDataDirectory, "provider-credentials.json");
  let keyPromise;
  let profile;
  const supported = () => { if (platform !== "darwin") throw storageError("EVAL_CREDENTIAL_UNSUPPORTED", "Persistent Eval API credentials currently require macOS Keychain."); };
  async function invoke(args, input) {
    try { return await security(args, input); } catch { throw unavailable(); }
  }
  async function readKey(account) {
    const result = await invoke(["find-generic-password", "-s", service, "-a", account, "-w"]);
    // security's errSecItemNotFound (-25300) maps to process exit status 44.
    if (result.code === 44) return null;
    if (result.code !== 0 || !/^[a-f0-9]{64}\n?$/.test(result.stdout)) throw unavailable();
    return Buffer.from(result.stdout.trim(), "hex");
  }
  async function loadKey() {
    supported();
    await mkdir(userDataDirectory, { recursive: true, mode: 0o700 });
    profile = createHash("sha256").update(await realpath(userDataDirectory)).digest("hex");
    const existing = await readKey(profile);
    if (existing) return existing;
    let entries;
    try { entries = JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw unavailable(); }
    if (entries && (entries.schemaVersion !== 1 || typeof entries.entries !== "object" || entries.entries === null || Object.keys(entries.entries).length)) {
      throw corrupt("The Keychain key for existing Eval credentials is missing. Existing credentials were preserved.");
    }
    const candidate = randomBytes(32).toString("hex");
    // Fixed service, hexadecimal account and key avoid interactive-parser quoting.
    // Never update a key: a concurrent creator's key is the authoritative winner.
    await invoke(["-i"], `add-generic-password -s ${service} -a ${profile} -w ${candidate}\n`);
    const stored = await readKey(profile);
    if (!stored) throw unavailable();
    return stored;
  }
  const key = () => keyPromise ??= loadKey().catch((error) => { keyPromise = undefined; throw error; });
  const aad = () => Buffer.from(`relayer-eval-credentials:v1:${profile}`);
  const store = createEncryptedCredentialStore({
    path,
    async encrypt(value) {
      const secret = await key();
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", secret, nonce, { authTagLength: 16 });
      cipher.setAAD(aad());
      const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return { version: 1, nonce: nonce.toString("hex"), tag: cipher.getAuthTag().toString("hex"), ciphertext: ciphertext.toString("hex") };
    },
    async decrypt(value) {
      supported();
      if (value?.version !== 1 || !/^[a-f0-9]{24}$/.test(value.nonce) || !/^[a-f0-9]{32}$/.test(value.tag) || typeof value.ciphertext !== "string" || !/^(?:[a-f0-9]{2})*$/.test(value.ciphertext)) throw corrupt();
      const secret = await key();
      try {
        const cipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(value.nonce, "hex"), { authTagLength: 16 });
        cipher.setAAD(aad());
        cipher.setAuthTag(Buffer.from(value.tag, "hex"));
        return Buffer.concat([cipher.update(Buffer.from(value.ciphertext, "hex")), cipher.final()]).toString("utf8");
      } catch { throw corrupt("Eval credentials could not be decrypted; existing data was preserved."); }
    },
  });
  return Object.freeze(Object.fromEntries(["set", "get", "delete", "listReferences"].map((operation) => [operation, async (...args) => {
    try { return await store[operation](...args); }
    catch (error) {
      if (["EVAL_CREDENTIAL_UNSUPPORTED", "EVAL_CREDENTIAL_UNAVAILABLE", "EVAL_CREDENTIAL_CORRUPT"].includes(error.code)) throw error;
      throw corrupt();
    }
  }])));
}
