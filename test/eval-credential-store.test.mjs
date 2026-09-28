import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { createEvalCredentialStore } from "../desktop/eval-main/credential-store.mjs";

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "eval-credentials-")); directories.push(directory);
  const keys = new Map(); const calls = [];
  let denied = false;
  let winner;
  const security = async (args, input) => {
    calls.push({ args, input });
    if (denied) return { code: 36, stdout: "private native diagnostic" };
    if (args[0] === "-i") {
      const [, account, candidate] = input.match(/-a ([a-f0-9]{64}) -w ([a-f0-9]{64})\n$/);
      if (!keys.has(account)) keys.set(account, winner || candidate);
      return { code: 0, stdout: "security>" };
    }
    const value = keys.get(args[args.indexOf("-a") + 1]);
    return value ? { code: 0, stdout: value + "\n" } : { code: 44, stdout: "" };
  };
  const create = (path = directory, platform = "darwin") => createEvalCredentialStore({ userDataDirectory: path, platform, security });
  return { directory, keys, calls, create, deny: () => { denied = true; }, winner: (value) => { winner = value; } };
}

it("persists encrypted provider credentials across instances without secrets in argv or plaintext files", async () => {
  const f = await fixture();
  const value = { apiKey: "private-test-api-key" };
  await f.create().set("provider-1", value);
  const disk = await readFile(join(f.directory, "provider-credentials.json"), "utf8");
  expect(disk).not.toContain(value.apiKey);
  expect(f.calls.some(({ input }) => Boolean(input))).toBe(true);
  expect(JSON.stringify(f.calls.map(({ args }) => args))).not.toContain([...f.keys.values()][0]);
  expect(JSON.stringify(f.calls)).not.toContain(value.apiKey);
  const reopened = f.create();
  expect(await reopened.get("provider-1")).toEqual(value);
  expect(await reopened.listReferences()).toEqual(["provider-1"]);
  expect(await reopened.delete("provider-1")).toBe(true);
  expect(await reopened.get("provider-1")).toBeNull();
});

it("uses a concurrent creator's key and authenticates nonce, ciphertext, tag and profile", async () => {
  const f = await fixture(); f.winner("ab".repeat(32));
  await f.create().set("p", { apiKey: "secret" });
  expect(await f.create().get("p")).toEqual({ apiKey: "secret" });
  const path = join(f.directory, "provider-credentials.json");
  const source = await readFile(path, "utf8");
  for (const field of ["nonce", "tag", "ciphertext"]) {
    const changed = JSON.parse(source);
    changed.entries.p[field] = (changed.entries.p[field][0] === "0" ? "1" : "0") + changed.entries.p[field].slice(1);
    await writeFile(path, JSON.stringify(changed));
    await expect(f.create().get("p")).rejects.toThrow("could not be decrypted");
    expect(await readFile(path, "utf8")).toBe(JSON.stringify(changed));
  }
  const other = join(f.directory, "other");
  await f.create(other).set("p", { apiKey: "other" });
  await writeFile(join(other, "provider-credentials.json"), source);
  await expect(f.create(other).get("p")).rejects.toThrow("could not be decrypted");
});

it("does not replace missing, denied, or malformed keys when encrypted data exists", async () => {
  const f = await fixture(); await f.create().set("p", { apiKey: "secret" });
  const file = join(f.directory, "provider-credentials.json");
  const bytes = await readFile(file, "utf8");
  const writes = () => f.calls.filter(({ input }) => input).length;
  const initialWrites = writes();
  f.keys.set([...f.keys.keys()][0], "malformed-key");
  await expect(f.create().get("p")).rejects.toThrow("storage is unavailable");
  expect(writes()).toBe(initialWrites);
  f.keys.clear();
  await expect(f.create().get("p")).rejects.toThrow("key for existing Eval credentials is missing");
  expect(writes()).toBe(initialWrites);
  f.deny();
  await expect(f.create().set("new", { apiKey: "another" })).rejects.toThrow("storage is unavailable");
  expect(writes()).toBe(initialWrites);
  expect(await readFile(file, "utf8")).toBe(bytes);
});

it("rejects unsupported platforms explicitly and never invokes a secret backend", async () => {
  const f = await fixture();
  const store = f.create(f.directory, "linux");
  expect(await store.listReferences()).toEqual([]);
  expect(await store.get("missing")).toBeNull();
  expect(await store.delete("missing")).toBe(false);
  await expect(store.set("p", { apiKey: "secret" })).rejects.toMatchObject({ code: "EVAL_CREDENTIAL_UNSUPPORTED" });
  expect(f.calls).toEqual([]);
});

it("sanitizes malformed persisted data with a stable public error code", async () => {
  const f = await fixture();
  await writeFile(join(f.directory, "provider-credentials.json"), "private-corrupt-payload");
  await expect(f.create().listReferences()).rejects.toMatchObject({ code: "EVAL_CREDENTIAL_CORRUPT", message: "Eval credential data is invalid; existing data was preserved." });
});
