import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSharePublishAttemptStore } from "../desktop/main/services/share-publish-attempt-store.mjs";
import { createSharePublishCoordinator } from "../desktop/main/services/share-publish-coordinator.mjs";
import { createShareServiceClient } from "../desktop/main/services/share-service-client.mjs";
const snapshot = new TextEncoder().encode(
  '{"recordType":"header","conversation":{}}\n{"recordType":"turn"}\n',
);
describe("desktop-owned share preview", () => {
  it("freezes theme and PNG across a failed upload and process reopen, and clears both after success", async () => {
    const directory = await mkdtemp(join(tmpdir(), "share-preview-"));
    let theme = "light";
    let owner = "owner";
    const capture = vi.fn(async (input) => {
      expect(input.theme).toBe("light");
      expect(input.snapshotBytes).toEqual(snapshot);
      return new Uint8Array([1, 2, 3]);
    });
    const publish = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("upload"), { code: "share_upload_failed" }),
      )
      .mockResolvedValue({ url: "https://share.example/t/test" });
    const dependencies = {
      exportSnapshot: async () => {
        theme = "dark";
        return snapshot;
      },
      getTheme: () => theme,
      capturePreview: capture,
      accountSession: async () => ({
        ownerKey: owner,
        authorization: "Bearer test",
        generation: 1,
      }),
      sourceThreadIdentity: async () => "source",
      publish,
    };
    try {
      const first = createSharePublishCoordinator({
        ...dependencies,
        attemptStore: createSharePublishAttemptStore({ directory }),
      });
      const failed = await first.create({ threadId: 1, title: "Public" });
      expect(failed.code).toBe("share_upload_failed");
      const store=createSharePublishAttemptStore({directory});
      const changed=createSharePublishCoordinator({...dependencies,attemptStore:{...store,read:async reference=>{const value=await store.read(reference);return {...value,preview:{...value.preview,theme:"dark"}};}}});
      expect(await changed.retry(failed.attemptReferenceId)).toMatchObject({code:"share_attempt_unavailable"});
      expect(publish).toHaveBeenCalledOnce();
      const reopened = createSharePublishCoordinator({
        ...dependencies,
        attemptStore: createSharePublishAttemptStore({ directory }),
      });
      expect(await reopened.retry(failed.attemptReferenceId)).toMatchObject({
        status: "created",
      });
      expect(capture).toHaveBeenCalledOnce();
      expect(publish.mock.calls[1][0].previewBytes).toEqual(
        new Uint8Array([1, 2, 3]),
      );
      expect(publish.mock.calls[1][0].attempt).toEqual(
        publish.mock.calls[0][0].attempt,
      );
      const [saved] = await createSharePublishAttemptStore({
        directory,
      }).load();
      expect(saved.snapshotBytes.length).toBe(0);
      expect(saved.previewBytes.length).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("does not publish after account changes while capturing", async () => {
    let generation = 1;
    const publish = vi.fn();
    const coordinator = createSharePublishCoordinator({
      exportSnapshot: async () => snapshot,
      capturePreview: async () => {
        generation = 2;
        return new Uint8Array([1]);
      },
      getTheme: () => "dark",
      accountSession: async () => ({
        ownerKey: "owner",
        authorization: "Bearer a",
        generation,
      }),
      sourceThreadIdentity: async () => "source",
      publish,
    });
    expect(
      await coordinator.create({ threadId: 1, title: "Public" }),
    ).toMatchObject({ code: "share_sign_in_required" });
    expect(publish).not.toHaveBeenCalled();
  });
  it("uploads both bodies without bearer credentials before finalizing", async () => {
    const uploads = [];
    const requests = [];
    const policy = (key) => ({
      method: "POST",
      url: "https://storage.example",
      key,
      fields: { key },
    });
    const client = createShareServiceClient({
      endpoint: "https://share.example",
      fetchImpl: async (url, options) => {
        requests.push(url);
        return {
          ok: true,
          json: async () =>
            url.endsWith("/shares")
              ? {
                  status: "reserved",
                  shareId: "test",
                  upload: policy("snapshot"),
                  previewUpload: policy("png"),
                }
              : { url: "https://share.example/t/test" },
        };
      },
      uploadFetchImpl: async (_url, options) => {
        expect(options.headers).toBeUndefined();
        uploads.push(options.body.get("file"));
        return { ok: true };
      },
    });
    await client.publish({
      authorization: "Bearer a",
      attempt: { attemptId: "a", preview: { byteLength: 3 } },
      snapshotBytes: snapshot,
      previewBytes: new Uint8Array([1, 2, 3]),
    });
    expect(uploads.map((x) => x.type)).toEqual([
      "application/x-ndjson",
      "image/png",
    ]);
    expect(requests[1]).toContain("/finalize");
  });
});
