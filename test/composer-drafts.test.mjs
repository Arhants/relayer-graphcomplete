import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearThreadFollowupDraft,
  pendingNewThreadDraft,
  persistPendingNewThreadDraft,
  followupTextDigest,
  persistSentThreadFollowup,
  persistThreadFollowupDraft,
  sentThreadFollowup,
  threadFollowupDraft,
  threadFollowupRestoration,
} from "../desktop/renderer/src/composer-drafts.js";
import { normalizeComposerDrafts } from "../desktop/main/ipc/register-ipc.mjs";

describe("composer draft persistence", () => {
  let values;

  beforeEach(() => {
    values = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
    };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("retains failed-prompt tombstones without accumulating ordinary clears", () => {
    persistThreadFollowupDraft("failed:1", "retry this prompt");
    persistThreadFollowupDraft("failed:1", "", { preserveEmpty: true });

    for (let index = 0; index < 300; index += 1) {
      const key = `ordinary:${index}`;
      persistThreadFollowupDraft(key, "draft");
      persistThreadFollowupDraft(key, "");
    }

    expect(threadFollowupDraft("failed:1")).toBe("");
    expect(JSON.parse(values.get("relayerComposerDraftsV1")).threadFollowups)
      .toEqual({ "failed:1": "" });

    clearThreadFollowupDraft("failed:1");
    expect(threadFollowupDraft("failed:1")).toBeNull();

    for (let index = 0; index < 300; index += 1) {
      persistThreadFollowupDraft(`unsent:${index}`, `draft ${index}`);
    }
    const persisted = JSON.parse(values.get("relayerComposerDraftsV1")).threadFollowups;
    expect(Object.keys(persisted)).toHaveLength(256);
    expect(threadFollowupDraft("unsent:43")).toBeNull();
    expect(threadFollowupDraft("unsent:44")).toBe("draft 44");
    expect(threadFollowupDraft("unsent:299")).toBe("draft 299");
  });

  it("keeps a draft's restoration only with that draft, and a sent follow-up until it is cleared", () => {
    persistThreadFollowupDraft("t:1", "restored text", { restorationId: "1:7" });
    expect(threadFollowupRestoration("t:1")).toBe("1:7");
    // The user's own text in the scope replaces the provenance.
    persistThreadFollowupDraft("t:1", "restored text");
    expect(threadFollowupRestoration("t:1")).toBeNull();
    persistThreadFollowupDraft("t:1", "", { preserveEmpty: true, restorationId: "1:7" });
    expect(threadFollowupRestoration("t:1")).toBe("1:7");
    clearThreadFollowupDraft("t:1");
    expect(threadFollowupRestoration("t:1")).toBeNull();

    const record = { scopeKey: "3:5", originScopeKey: "3:5", textDigest: followupTextDigest(" sent "), edited: true, sends: 2 };
    persistSentThreadFollowup(3, record);
    expect(sentThreadFollowup(3)).toEqual(record);
    persistSentThreadFollowup(3, null);
    expect(sentThreadFollowup(3)).toBeNull();
  });

  it("evicts send records that protect no draft before one that does", () => {
    persistThreadFollowupDraft("t0:1", "retyped after Send");
    persistSentThreadFollowup("t0", { scopeKey: "t0:1", originScopeKey: "t0:1", textDigest: "1:a", edited: true });
    for (let index = 1; index <= 256; index += 1) {
      persistSentThreadFollowup(`t${index}`, { scopeKey: `t${index}:1`, originScopeKey: `t${index}:1`, textDigest: "1:a", edited: false });
    }
    expect(sentThreadFollowup("t0")).toMatchObject({ edited: true });
    expect(sentThreadFollowup("t1")).toBeNull();
    expect(sentThreadFollowup("t256")).not.toBeNull();

    const records = Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`t${index}`, {
      scopeKey: `t${index}:1`, originScopeKey: `t${index}:1`, textDigest: "1:a", edited: index === 0, sends: 1,
    }]));
    const normalized = normalizeComposerDrafts({ threadFollowups: { "t0:1": "retyped after Send" }, sentThreadFollowups: records });
    expect(normalized.sentThreadFollowups.t0).toBeDefined();
    expect(normalized.sentThreadFollowups.t1).toBeUndefined();
    expect(Object.keys(normalized.sentThreadFollowups)).toHaveLength(256);
  });

  it("digests the trimmed text, so a large sent message costs a few bytes", () => {
    expect(followupTextDigest(" sent ")).toBe(followupTextDigest("sent"));
    expect(followupTextDigest("sent")).not.toBe(followupTextDigest("sent!"));
    expect(followupTextDigest("x".repeat(600_000)).length).toBeLessThan(32);
  });

  it("keeps valid restorations and sent follow-ups through the desktop store, dropping the rest", () => {
    const normalized = normalizeComposerDrafts({
      pendingNewThread: null,
      threadFollowups: { "t:1": "restored", "t:2": "" },
      threadFollowupRestorations: { "t:1": "1:7", "t:2": "2:1", "t:9": "orphan", "t:3": 4 },
      sentThreadFollowups: {
        3: { scopeKey: "3:5", originScopeKey: "3:5", textDigest: "4:abc", edited: false, sends: 1, extra: true },
        4: { scopeKey: "4:1", originScopeKey: "4:1", textDigest: "4:abc", sends: 1 },
        5: { scopeKey: "5:1", originScopeKey: "5:1", text: "full text", edited: true, sends: 1 },
        6: { scopeKey: "6:1", originScopeKey: "6:1", textDigest: "4:abc", edited: true, sends: 0 },
      },
    });
    expect(normalized.threadFollowupRestorations).toEqual({ "t:1": "1:7", "t:2": "2:1" });
    expect(normalized.sentThreadFollowups).toEqual({
      3: { scopeKey: "3:5", originScopeKey: "3:5", textDigest: "4:abc", edited: false, sends: 1 },
    });
    expect(normalizeComposerDrafts(null)).toEqual({
      pendingNewThread: null, threadFollowups: {}, threadFollowupRestorations: {}, sentThreadFollowups: {},
    });
  });

  it("evicts oldest follow-ups by bytes and recovers after an oversized active draft", () => {
    for (let index = 0; index < 256; index += 1) {
      persistThreadFollowupDraft(`large:${index}`, `${index}:`.padEnd(4_096, "x"));
    }

    const persisted = JSON.parse(values.get("relayerComposerDraftsV1"));
    expect(new TextEncoder().encode(JSON.stringify(persisted)).byteLength).toBeLessThanOrEqual(1024 * 1024);
    expect(threadFollowupDraft("large:0")).toBeNull();
    expect(threadFollowupDraft("large:255")).toContain("255:");
    const normalized = normalizeComposerDrafts({
      pendingNewThread: null,
      threadFollowups: Object.fromEntries(Array.from({ length: 256 }, (_, index) => (
        [`main:${index}`, `${index}:`.padEnd(4_096, "x")]
      ))),
    });
    expect(new TextEncoder().encode(JSON.stringify(normalized)).byteLength).toBeLessThanOrEqual(1024 * 1024);
    expect(normalized.threadFollowups["main:0"]).toBeUndefined();
    expect(normalized.threadFollowups["main:255"]).toContain("255:");

    persistPendingNewThreadDraft("stable", null);
    persistPendingNewThreadDraft("x".repeat(1024 * 1024 + 1), null);
    expect(pendingNewThreadDraft()?.text).toBe("stable");
    persistPendingNewThreadDraft("recovered", null);
    expect(pendingNewThreadDraft()?.text).toBe("recovered");
  });
});
