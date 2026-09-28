import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSharePublishAttemptStore } from "../desktop/main/services/share-publish-attempt-store.mjs";

const roots = [];

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "relayer-share-attempts-"));
  roots.push(root);
  return root;
}

function record(reference = "SHR-DURABLE1") {
  return {
    reference,
    attemptId: "00112233445566778899aabbccddeeff",
    ownerKey: "owner-a",
    threadId: 42,
    sourceThreadId: "installation:test:thread:42",
    title: "Public title",
    snapshotBytes: [123, 34, 114, 101, 99, 111, 114, 100, 84, 121, 112, 101, 34, 58, 34, 104, 101, 97, 100, 101, 114, 34, 125, 10],
    createdAt: 1_000,
    lastFailure: {
      status: "failed",
      attemptReferenceId: reference,
      code: "share_upload_failed",
      retryable: true,
    },
    reportedFailures: ["upload:share.upload_failed"],
    publishedUrl: null,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("durable share publish attempt store", () => {
  it("preserves valid records across transient filesystem failures and visits sequentially", async () => {
    const root = await temporaryRoot();
    await createSharePublishAttemptStore({ directory: root }).save(record());
    let unavailable = true;
    const store = createSharePublishAttemptStore({ directory: root, readFileImpl: async (...args) => {
      if (unavailable) throw Object.assign(new Error("temporary"), { code: "EMFILE" });
      return readFile(...args);
    } });
    await expect(store.load()).rejects.toMatchObject({ code: "EMFILE" });
    expect(await readdir(root)).toHaveLength(1);
    unavailable = false;
    const visited = [];
    await expect(store.load({ visit: (value) => { visited.push(value.reference); } })).resolves.toEqual([]);
    expect(visited).toEqual(["SHR-DURABLE1"]);
    expect((await store.read("SHR-DURABLE1")).snapshotBytes).toEqual(Uint8Array.from(record().snapshotBytes));
  });
  it("atomically reopens the exact owner, identity, bytes, failure, and reporting keys", async () => {
    const root = await temporaryRoot();
    const first = createSharePublishAttemptStore({ directory: root });
    await first.save(record());

    const reopened = createSharePublishAttemptStore({ directory: root });
    const [loaded] = await reopened.load();
    expect({ ...loaded, snapshotBytes: [...loaded.snapshotBytes] }).toEqual(record());
    const [name] = await readdir(root);
    expect(name).toMatch(/^[a-f0-9]{64}\.json$/u);
    expect(await readFile(join(root, name), "utf8")).not.toContain("snapshotBytes");

    await expect(reopened.delete("SHR-DURABLE1")).resolves.toBe(true);
    await expect(reopened.load()).resolves.toEqual([]);
  });

  it("repairs an existing attempt directory to owner-only permissions before writing", async () => {
    const root = await temporaryRoot();
    await chmod(root, 0o777);
    const store = createSharePublishAttemptStore({ directory: root });

    await store.save(record());

    expect((await stat(root)).mode & 0o777).toBe(0o700);
  });

  it("deletes corrupt records instead of exposing partial recovery state", async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, `${"a".repeat(64)}.json`), "{not-json", { mode: 0o600 });
    const store = createSharePublishAttemptStore({ directory: root });

    await expect(store.load()).resolves.toEqual([]);
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("retains a lightweight published receipt without frozen conversation bytes", async () => {
    const root = await temporaryRoot();
    const store = createSharePublishAttemptStore({ directory: root });
    const published = {
      ...record("SHR-PUBLISH1"),
      snapshotBytes: [],
      lastFailure: null,
      publishedUrl: "https://share.example.test/t/published",
    };

    await store.save(published);
    const [loaded] = await store.load();
    expect([...loaded.snapshotBytes]).toEqual([]);
    expect(loaded.publishedUrl).toBe("https://share.example.test/t/published");
  });

  it("rejects records above the 16 MiB product boundary", async () => {
    const root = await temporaryRoot();
    const store = createSharePublishAttemptStore({ directory: root });
    const oversized = record();
    oversized.snapshotBytes = new Array((16 * 1024 * 1024) + 1).fill(0);

    await expect(store.save(oversized)).rejects.toThrow("invalid");
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("reopens a full 16 MiB snapshot without treating base64 validation limits as corruption", async () => {
    const root = await temporaryRoot();
    const store = createSharePublishAttemptStore({ directory: root });
    const bytes = Buffer.alloc(16 * 1024 * 1024, 42);
    await store.save({ ...record(), snapshotBytes: bytes });
    const [loaded] = await store.load();
    expect(loaded.snapshotBytes.byteLength).toBe(bytes.byteLength);
    expect(Buffer.from(loaded.snapshotBytes).equals(bytes)).toBe(true);
    expect(await readdir(root)).toHaveLength(1);
  });

  it("rejects a concurrent thirty-third attempt without evicting or freezing updates", async () => {
    const root = await temporaryRoot();
    const store = createSharePublishAttemptStore({ directory: root });
    const references = Array.from({ length: 32 }, (_, index) => `SHR-CAP${String(index).padStart(5, "0")}`);
    await Promise.all(references.map((reference) => store.save(record(reference))));

    await expect(store.save(record("SHR-CAP99999"))).rejects.toThrow("capacity");
    await store.save({ ...record(references[0]), title: "Updated existing attempt" });

    const loaded = await store.load();
    expect(loaded).toHaveLength(32);
    expect(loaded.find((value) => value.reference === references[0])?.title).toBe("Updated existing attempt");
    expect(loaded.some((value) => value.reference === "SHR-CAP99999")).toBe(false);
  });
});
