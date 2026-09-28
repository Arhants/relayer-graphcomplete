import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";

import {
  createSharePublishController,
  shareEligibility,
  truncateShareTitle,
} from "../desktop/renderer/src/share-publish-ui.js";

function fixture({ accountStatus = "signed-in", preflightResult, result } = {}) {
  const window = new Window({ url: "http://127.0.0.1/thread" });
  window.document.body.innerHTML = `
    <main id="background"></main>
    <button id="shareConversation" type="button">Share</button>
    <button id="shareConversationMenu" type="button">Share…</button>
    <div id="shareDialog" class="hidden"></div>`;
  const thread = { id: 7, imported: false };
  const interactions = [
    { id: 1, threadId: 7, completionStatus: "accepted" },
    { id: 2, threadId: 7, completionStatus: "running" },
  ];
  let changed;
  const account = {
    read: vi.fn(async () => ({ status: accountStatus, channel: "stable" })),
    login: vi.fn(async () => ({ status: "signing-in", channel: "stable" })),
    onChanged: vi.fn((callback) => { changed = callback; return () => { changed = undefined; }; }),
  };
  const share = {
    preflight: vi.fn(async () => preflightResult ?? ({ status: "ready" })),
    create: vi.fn(async () => result ?? ({
      status: "created",
      attemptReferenceId: "SHR-ABC123",
      url: "https://share.example.test/t/abc",
    })),
    retry: vi.fn(),
    pending: vi.fn(async () => null),
    dismiss: vi.fn(async (attemptReferenceId) => ({ status: "dismissed", attemptReferenceId })),
  };
  const clipboard = { writeText: vi.fn(async () => {}) };
  const controller = createSharePublishController({
    root: window.document,
    getThread: () => thread,
    getInteractions: () => interactions,
    account,
    share,
    clipboard,
  });
  controller.render();
  return { window, thread, interactions, account, share, clipboard, controller, changed: (value) => changed?.(value) };
}

describe("share publish renderer boundary", () => {
  it("preserves an active sign-in when opening and receiving account events", async () => {
    const test = fixture({ accountStatus: "signing-in" });
    await test.window.document.querySelector("#shareConversation").onclick();
    expect(test.window.document.querySelector('[data-share-action="sign-in"]').disabled).toBe(true);
    test.changed({ status: "signing-in" });
    expect(test.window.document.querySelector('[data-share-action="sign-in"]').disabled).toBe(true);
    expect(test.account.login).not.toHaveBeenCalled();
  });

  it("discloses create-time acceptance and dismisses a completed receipt when navigating", async () => {
    const test = fixture();
    await test.window.document.querySelector("#shareConversation").onclick();
    expect(test.window.document.querySelector("#shareDialog").textContent).toContain("including any response that finishes while this dialog is open");
    test.interactions[1].completionStatus = "accepted";
    test.controller.render();
    const input = test.window.document.querySelector("#shareTitle");
    input.value = "Public";
    input.oninput();
    await test.window.document.querySelector('[data-share-action="create"]').onclick();
    test.thread.id = 8;
    test.controller.render();
    expect(test.share.dismiss).toHaveBeenCalledWith("SHR-ABC123");
    expect(test.window.document.querySelector("#shareDialog").classList.contains("hidden")).toBe(true);
  });
  it("allows accepted history while a later response runs and closes imported/no-accepted eligibility", () => {
    expect(shareEligibility({
      thread: { id: 7, imported: false },
      interactions: [
        { threadId: 7, completionStatus: "accepted" },
        { threadId: 7, completionStatus: "running" },
      ],
    })).toEqual({ eligible: true, acceptedTurnCount: 1 });
    expect(shareEligibility({ thread: { id: 7, imported: true }, interactions: [] }))
      .toEqual({ eligible: false, acceptedTurnCount: 0, code: "share_imported_conversation" });
    expect(shareEligibility({
      thread: { id: 7, imported: false },
      interactions: [{ threadId: 7, completionStatus: "stopped" }],
    })).toEqual({ eligible: false, acceptedTurnCount: 0, code: "share_no_accepted_completion" });
  });

  it("explains a local eligibility failure before account or title input", async () => {
    const test = fixture();
    test.interactions.splice(0);
    test.account.read.mockClear();
    test.share.pending.mockClear();
    test.controller.render();

    expect(test.window.document.querySelector("#shareConversation").getAttribute("aria-disabled")).toBe("true");
    await test.window.document.querySelector("#shareConversation").onclick();
    expect(test.window.document.querySelector("#shareDialog").textContent)
      .toContain("This thread needs an accepted response before it can be shared");
    expect(test.window.document.querySelector("#shareTitle")).toBeNull();
    expect(test.account.read).not.toHaveBeenCalled();
    expect(test.share.pending).not.toHaveBeenCalled();
  });

  it("caps titles by Unicode code points instead of splitting a surrogate pair", () => {
    expect([...truncateShareTitle(`${"a".repeat(119)}😀tail`)]).toHaveLength(120);
    expect(truncateShareTitle(`${"a".repeat(119)}😀tail`)).toBe(`${"a".repeat(119)}😀`);
  });

  it("requires sign-in first and never publishes automatically when the account changes", async () => {
    const test = fixture({ accountStatus: "signed-out" });
    await test.window.document.querySelector("#shareConversation").onclick();
    expect(test.window.document.querySelector("#shareDialog").textContent).toContain("Sign in to share");

    await test.window.document.querySelector('[data-share-action="sign-in"]').onclick();
    expect(test.account.login).toHaveBeenCalledOnce();
    expect(test.share.create).not.toHaveBeenCalled();

    test.changed({ status: "signed-in", channel: "stable" });
    await vi.waitFor(() => expect(test.window.document.querySelector("#shareTitle")).not.toBeNull());
    expect(test.window.document.querySelector("#shareTitle").value).toBe("");
    expect(test.window.document.querySelector('[data-share-action="create"]').disabled).toBe(true);
    expect(test.share.create).not.toHaveBeenCalled();
  });

  it("restores the original account's pending result after sign-in instead of collecting a new title", async () => {
    const test = fixture({ accountStatus: "signed-out" });
    await test.window.document.querySelector("#shareConversation").onclick();
    test.share.pending.mockResolvedValue({
      status: "created",
      attemptReferenceId: "SHR-RETURN01",
      url: "https://share.example.test/t/already-created",
    });

    test.changed({ status: "signed-in", channel: "stable", subject: "owner-a" });
    await vi.waitFor(() => expect(test.window.document.querySelector('[aria-label="Share link"]')?.value)
      .toBe("https://share.example.test/t/already-created"));
    expect(test.window.document.querySelector("#shareTitle")).toBeNull();
    expect(test.share.preflight).not.toHaveBeenCalled();
    expect(test.share.create).not.toHaveBeenCalled();
  });

  it("freezes through Main only after a nonblank title and presents the simplified success dialog", async () => {
    const test = fixture();
    await test.window.document.querySelector("#shareConversation").onclick();
    const title = test.window.document.querySelector("#shareTitle");
    title.value = "  Public investigation  ";
    title.oninput();
    const create = test.window.document.querySelector('[data-share-action="create"]');
    expect(create.disabled).toBe(false);

    const publishing = create.onclick();
    expect(test.window.document.querySelector("#shareDialog").textContent).toContain("Creating link…");
    expect(test.window.document.querySelector('[data-share-action="cancel"]')).toBeNull();
    await publishing;

    expect(test.share.create).toHaveBeenCalledWith(7, "  Public investigation  ");
    const dialog = test.window.document.querySelector("#shareDialog");
    expect(dialog.textContent).toContain("Link ready");
    expect(dialog.textContent).toContain("known secrets and paths removed");
    expect(dialog.querySelector('[aria-label="Share link"]').value).toBe("https://share.example.test/t/abc");
    await dialog.querySelector('[data-share-action="copy"]').onclick();
    expect(test.clipboard.writeText).toHaveBeenCalledWith("https://share.example.test/t/abc");
    await dialog.querySelector('[data-share-action="close"]').onclick();
    expect(test.share.dismiss).toHaveBeenCalledWith("SHR-ABC123");
  });

  it("shows only the closed reference and retry action for a generic failure", async () => {
    const test = fixture({ result: {
      status: "failed",
      code: "share_service_failed",
      retryable: true,
      attemptReferenceId: "SHR-SAFE123",
    } });
    await test.window.document.querySelector("#shareConversation").onclick();
    const title = test.window.document.querySelector("#shareTitle");
    title.value = "Public title";
    title.oninput();
    await test.window.document.querySelector('[data-share-action="create"]').onclick();

    const dialog = test.window.document.querySelector("#shareDialog");
    expect(dialog.textContent).toContain("We couldn’t create the link");
    expect(dialog.textContent).toContain("SHR-SAFE123");
    expect(dialog.textContent).not.toContain("share_service_failed");
    expect(dialog.querySelector('[data-share-action="retry"]')).not.toBeNull();
    await dialog.querySelector('[data-share-action="close"]').onclick();
    expect(test.share.dismiss).toHaveBeenCalledWith("SHR-SAFE123");
    expect(dialog.classList.contains("hidden")).toBe(true);
  });

  it("reopens Retry/Close only for the currently opened source thread", async () => {
    const test = fixture();
    test.controller.dispose();
    test.share.pending.mockResolvedValue({
      status: "failed",
      code: "share_upload_failed",
      retryable: true,
      attemptReferenceId: "SHR-RECOVER1",
    });
    const controller = createSharePublishController({
      root: test.window.document,
      getThread: () => test.thread,
      getInteractions: () => test.interactions,
      account: test.account,
      share: test.share,
      clipboard: test.clipboard,
    });

    controller.render();
    await vi.waitFor(() => expect(test.window.document.querySelector("#shareDialog").textContent)
      .toContain("SHR-RECOVER1"));
    expect(test.share.pending).toHaveBeenCalledWith(7);
    expect(test.window.document.querySelector('[data-share-action="retry"]')).not.toBeNull();
    expect(test.window.document.querySelector("#shareTitle")).toBeNull();
    expect(test.share.create).not.toHaveBeenCalled();
    await test.window.document.querySelector('[data-share-action="close"]').onclick();
    expect(test.share.dismiss).toHaveBeenCalledWith("SHR-RECOVER1");
    controller.dispose();
  });

  it("clears a recovered URL when the signed-in account is replaced", async () => {
    const test = fixture();
    test.controller.dispose();
    test.account.read.mockResolvedValue({ status: "signed-in", channel: "stable", subject: "owner-a" });
    test.share.pending
      .mockResolvedValueOnce({
        status: "created",
        attemptReferenceId: "SHR-OWNER-A",
        url: "https://share.example.test/t/owner-a",
      })
      .mockResolvedValueOnce(null);
    const controller = createSharePublishController({
      root: test.window.document,
      getThread: () => test.thread,
      getInteractions: () => test.interactions,
      account: test.account,
      share: test.share,
      clipboard: test.clipboard,
    });

    controller.render();
    await vi.waitFor(() => expect(test.window.document.querySelector('[aria-label="Share link"]')?.value)
      .toBe("https://share.example.test/t/owner-a"));
    test.changed({ status: "signed-in", channel: "stable", subject: "owner-b" });
    await vi.waitFor(() => expect(test.window.document.querySelector('[aria-label="Share link"]')).toBeNull());
    await vi.waitFor(() => expect(test.window.document.querySelector("#shareTitle")).not.toBeNull());
    controller.dispose();
  });

  it("ignores a pending recovery reply that arrives after sign-out", async () => {
    const test = fixture();
    test.controller.dispose();
    test.account.read.mockResolvedValue({ status: "signed-in", channel: "stable", subject: "owner-a" });
    let resolvePending;
    test.share.pending.mockImplementation(() => new Promise((resolve) => { resolvePending = resolve; }));
    const controller = createSharePublishController({
      root: test.window.document,
      getThread: () => test.thread,
      getInteractions: () => test.interactions,
      account: test.account,
      share: test.share,
      clipboard: test.clipboard,
    });

    controller.render();
    await vi.waitFor(() => expect(resolvePending).toBeTypeOf("function"));
    test.changed({ status: "signed-out", channel: "stable" });
    resolvePending({
      status: "created",
      attemptReferenceId: "SHR-STALE-A",
      url: "https://share.example.test/t/stale-owner-a",
    });
    await vi.waitFor(() => expect(test.window.document.querySelector('[aria-label="Share link"]')).toBeNull());
    expect(test.window.document.querySelector("#shareDialog").classList.contains("hidden")).toBe(true);
    controller.dispose();
  });

  it("does not preflight after a recovery lookup is invalidated by navigation", async () => {
    const test = fixture();
    test.controller.dispose();
    test.account.read.mockResolvedValue({ status: "signed-in", channel: "stable", subject: "owner-a" });
    let resolveReplacementPending;
    test.share.pending
      .mockResolvedValueOnce({
        status: "created",
        attemptReferenceId: "SHR-OWNER-A",
        url: "https://share.example.test/t/owner-a",
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveReplacementPending = resolve; }));
    const controller = createSharePublishController({
      root: test.window.document,
      getThread: () => test.thread.id === null ? null : test.thread,
      getInteractions: () => test.interactions,
      account: test.account,
      share: test.share,
      clipboard: test.clipboard,
    });

    controller.render();
    await vi.waitFor(() => expect(test.window.document.querySelector('[aria-label="Share link"]')?.value)
      .toBe("https://share.example.test/t/owner-a"));
    test.share.preflight.mockClear();
    test.changed({ status: "signed-in", channel: "stable", subject: "owner-b" });
    await vi.waitFor(() => expect(resolveReplacementPending).toBeTypeOf("function"));
    test.thread.id = null;
    controller.render();
    resolveReplacementPending(null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(test.share.preflight).not.toHaveBeenCalled();
    expect(test.window.document.querySelector("#shareDialog").classList.contains("hidden")).toBe(true);
    controller.dispose();
  });

  it("invalidates a fresh dialog preflight when navigation changes its source thread", async () => {
    let resolvePreflight;
    const test = fixture();
    test.share.preflight.mockImplementation(() => new Promise((resolve) => { resolvePreflight = resolve; }));

    const opening = test.window.document.querySelector("#shareConversation").onclick();
    await vi.waitFor(() => expect(resolvePreflight).toBeTypeOf("function"));
    expect(test.share.preflight).toHaveBeenCalledWith(7);
    test.thread.id = 8;
    test.interactions.push({ id: 3, threadId: 8, completionStatus: "accepted" });
    test.controller.render();
    resolvePreflight({ status: "ready" });
    await opening;

    expect(test.window.document.querySelector("#shareDialog").classList.contains("hidden")).toBe(true);
    expect(test.window.document.querySelector("#shareTitle")).toBeNull();
    expect(test.share.create).not.toHaveBeenCalled();
  });

  it("invalidates a fresh dialog when navigation changes its source during account lookup", async () => {
    let resolveAccount;
    const test = fixture();
    test.account.read.mockImplementation(() => new Promise((resolve) => { resolveAccount = resolve; }));

    const opening = test.window.document.querySelector("#shareConversation").onclick();
    await vi.waitFor(() => expect(resolveAccount).toBeTypeOf("function"));
    test.thread.id = 8;
    test.controller.render();
    resolveAccount({ status: "signed-in", channel: "stable", subject: "owner-a" });
    await opening;

    expect(test.share.preflight).not.toHaveBeenCalled();
    expect(test.window.document.querySelector("#shareDialog").classList.contains("hidden")).toBe(true);
    expect(test.window.document.querySelector("#shareDialog").textContent).toBe("");
  });

  it("re-runs preflight instead of retrying a nonexistent attempt after a preflight failure", async () => {
    const test = fixture({ preflightResult: {
      status: "failed",
      code: "share_service_failed",
      retryable: true,
      attemptReferenceId: "SHR-PREFLIGHT",
    } });
    test.share.preflight
      .mockResolvedValueOnce({
        status: "failed",
        code: "share_service_failed",
        retryable: true,
        attemptReferenceId: "SHR-PREFLIGHT",
      })
      .mockResolvedValueOnce({ status: "ready" });

    await test.window.document.querySelector("#shareConversation").onclick();
    await test.window.document.querySelector('[data-share-action="retry"]').onclick();

    expect(test.share.preflight).toHaveBeenCalledTimes(2);
    expect(test.share.retry).not.toHaveBeenCalled();
    expect(test.window.document.querySelector("#shareTitle")).not.toBeNull();
  });

  it("dismisses a referenced preflight failure when Close hides the dialog", async () => {
    const test = fixture({ preflightResult: {
      status: "failed",
      code: "share_export_failed",
      retryable: false,
      attemptReferenceId: "SHR-PREFLIGHT",
    } });
    await test.window.document.querySelector("#shareConversation").onclick();

    await test.window.document.querySelector('[data-share-action="close"]').onclick();

    expect(test.share.dismiss).toHaveBeenCalledWith("SHR-PREFLIGHT");
    expect(test.window.document.querySelector("#shareDialog").classList.contains("hidden")).toBe(true);
  });

  it("formats quota reset in local time without offering retry", async () => {
    const test = fixture({ preflightResult: {
      status: "failed",
      code: "daily_quota_exhausted",
      retryable: false,
      resetAt: "2026-09-27T00:00:00.000Z",
      attemptReferenceId: "SHR-QUOTA01",
    } });
    await test.window.document.querySelector("#shareConversation").onclick();

    const dialog = test.window.document.querySelector("#shareDialog");
    expect(dialog.textContent).toContain("share again after");
    expect(dialog.textContent).toContain(new Date("2026-09-27T00:00:00.000Z").toLocaleString());
    expect(dialog.querySelector('[data-share-action="retry"]')).toBeNull();
    expect(dialog.querySelector("#shareTitle")).toBeNull();
    expect(test.share.create).not.toHaveBeenCalled();
  });

  it("clears owner-bound results and ignores stale publication completion after an account transition", async () => {
    let resolveCreate;
    const test = fixture();
    test.share.create.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
    await test.window.document.querySelector("#shareConversation").onclick();
    const title = test.window.document.querySelector("#shareTitle");
    title.value = "Owner A title";
    title.oninput();
    const pending = test.window.document.querySelector('[data-share-action="create"]').onclick();

    test.changed({ status: "signed-out", channel: "stable" });
    expect(test.window.document.querySelector("#shareDialog").textContent).toContain("Sign in to share");
    expect(test.window.document.querySelector('[aria-label="Share link"]')).toBeNull();
    resolveCreate({
      status: "created",
      attemptReferenceId: "SHR-OWNER-A",
      url: "https://share.example.test/t/owner-a",
    });
    await pending;
    expect(test.window.document.querySelector('[aria-label="Share link"]')).toBeNull();
    expect(test.window.document.querySelector("#shareDialog").textContent).toContain("Sign in to share");
  });
});
