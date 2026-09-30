import { describe, expect, it, vi } from "vitest";
import { stableNewThreadRequest } from "../desktop/renderer/src/interaction-request-model.js";
import { createWorktreeController, checkoutSharingThreads } from "../desktop/renderer/src/worktree-controller.js";

const inspection = (path = "/repo") => ({
  path, git: true, repositoryId: "repo-1", repositoryRoot: "/repo", checkoutRoot: "/repo", relativePath: path === "/repo" ? "" : "frontend",
  branch: "main", commit: "aaa", bases: [{ ref: "refs/remotes/origin/main", name: "origin/main", commit: "aaa", remote: true }], defaultBase: "refs/remotes/origin/main",
});
function fixture(overrides = {}) {
  const service = {
    inspect: vi.fn(async (path) => inspection(path)),
    validateSelection: vi.fn(async ({ path, relativePath }) => ({ workingDirectory: path + (relativePath ? `/${relativePath}` : ""), checkoutRoot: path, branch: "feature", commit: "bbb" })),
    plan: vi.fn(async (input) => input),
    create: vi.fn(async ({ planId }) => ({ planId, workingDirectory: "/managed/frontend", checkoutRoot: "/managed" })),
    readPlan: vi.fn(async () => ({ path: "/managed" })),
    ...overrides,
  };
  const snapshots = [];
  const persist = vi.fn(async (scope) => snapshots.push(structuredClone(scope)));
  const controller = createWorktreeController({ service, persist });
  return { service, snapshots, persist, controller };
}
const scope = () => ({ kind: "folder", label: "repo", path: "/repo/frontend" });

describe("production new-thread checkout controller", () => {
  it("preserves relative working folder and old selection when unavailable targets fail", async () => {
    const { controller, service } = fixture();
    const draft = scope(); await controller.select(draft);
    await controller.pick({ path: "/feature" });
    expect(service.validateSelection).toHaveBeenLastCalledWith({ path: "/feature", relativePath: "frontend", repositoryId: "repo-1" });
    expect(draft.path).toBe("/feature/frontend");
    service.validateSelection.mockRejectedValueOnce(new Error("Missing frontend"));
    await expect(controller.pick({ path: "/missing" })).rejects.toThrow("Missing frontend");
    expect(draft.path).toBe("/feature/frontend");
  });
  it("refreshes the Checkout base to the chosen worktree's HEAD", async () => {
    const f = fixture({ inspect: async (path) => ({ ...inspection(path), bases: [{ ref: "checkout", name: "Checkout", commit: path.startsWith("/feature") ? "bbb" : "aaa" }] }) });
    await f.controller.select(scope());
    await f.controller.pick({ path: "/feature" });
    await f.controller.setNewWorktree(true); await f.controller.setBase("checkout");
    await f.controller.prepareSend();
    expect(f.service.plan).toHaveBeenCalledWith(expect.objectContaining({ expectedCommit: "bbb", repositoryPath: "/feature/frontend" }));
  });
  it("ignores stale discovery and blocks send on inspection failure", async () => {
    let settle;
    const { controller } = fixture({ inspect: vi.fn((path) => path === "/slow" ? new Promise((resolve) => { settle = resolve; }) : Promise.resolve({ path, git: false })) });
    const slow = controller.select({ path: "/slow" });
    expect(controller.ready).toBe(false);
    await controller.select({ path: "/notes" });
    settle(inspection()); await slow;
    expect(controller.state.scope.path).toBe("/notes");
    const failed = fixture({ inspect: async () => { throw new Error("Git failed"); } });
    await failed.controller.select(scope());
    await expect(failed.controller.prepareSend()).rejects.toThrow("discovery must finish");
  });
  it("persists one creation receipt before mutation and retries the same worktree after lost replies", async () => {
    const f = fixture(); const draft = scope(); await f.controller.select(draft);
    await f.controller.setNewWorktree(true);
    f.service.create.mockRejectedValueOnce(new Error("Lost reply"));
    await expect(f.controller.prepareSend()).rejects.toThrow("Lost reply");
    const id = draft.checkout.planId;
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(f.snapshots.some((saved) => saved.checkout?.planId === id)).toBe(true);
    await f.controller.prepareSend();
    expect(f.service.plan.mock.calls.map(([input]) => input.planId)).toEqual([id, id]);
    expect(f.service.create.mock.calls.map(([input]) => input.planId)).toEqual([id, id]);
    // Reopening the persisted draft keeps the receipt and never plans another target.
    const reopened = fixture(); await reopened.controller.select(structuredClone(draft));
    await reopened.controller.prepareSend();
    expect(reopened.service.create).toHaveBeenCalledWith({ planId: id, acknowledgedState: undefined });
  });
  it("does not create when abandoning choices and refuses mutation when receipt persistence fails", async () => {
    const f = fixture(); await f.controller.select(scope()); await f.controller.setNewWorktree(true); f.controller.clear();
    expect(f.service.plan).not.toHaveBeenCalled(); expect(f.service.create).not.toHaveBeenCalled();
    await f.controller.select(scope()); await f.controller.setNewWorktree(true);
    f.persist.mockRejectedValueOnce(new Error("Storage full"));
    await expect(f.controller.prepareSend()).rejects.toThrow("Storage full");
    expect(f.service.create).not.toHaveBeenCalled();
  });
  it("requires acknowledging a changed branch and commit before resending", async () => {
    const f = fixture(); const draft = scope(); await f.controller.select(draft);
    f.service.validateSelection.mockRejectedValueOnce(Object.assign(new Error("Changed"), { code: "checkout_changed", details: { branch: "feature", commit: "bbb" } }));
    await expect(f.controller.prepareSend()).rejects.toThrow("Changed");
    expect(draft.checkout.commit).toBe("aaa");
    await f.controller.acknowledgeChange(); await f.controller.prepareSend();
    expect(f.service.validateSelection).toHaveBeenLastCalledWith(expect.objectContaining({ expectedBranch: "feature", expectedCommit: "bbb" }));
  });
  it("protects an in-flight creation plan from selection changes", async () => {
    let settle;
    const f = fixture({ create: () => new Promise((resolve) => { settle = resolve; }) });
    await f.controller.select(scope()); await f.controller.setNewWorktree(true);
    const send = f.controller.prepareSend();
    while (!settle) await Promise.resolve();
    expect(await f.controller.select({ path: "/other" })).toBe(false);
    await expect(f.controller.setBase("other")).rejects.toThrow("pending operation");
    settle({ workingDirectory: "/managed/frontend" }); await send;
    expect(f.controller.state.scope.path).toBe("/repo/frontend");
  });
  it("acknowledges a server admission change at the checkout root, preserving subfolder scope", async () => {
    const f = fixture(); const draft = scope(); await f.controller.select(draft);
    await f.controller.setNewWorktree(true); await f.controller.prepareSend();
    f.controller.reportSendError({ code: "checkout_changed", details: { path: "/managed/frontend", currentCheckout: { checkoutRoot: "/managed", branch: "changed", commit: "ddd" } } });
    await f.controller.acknowledgeChange();
    expect(f.service.validateSelection).toHaveBeenLastCalledWith({ path: "/managed", relativePath: "frontend", repositoryId: "repo-1" });
    expect(draft.checkout.planId).toBeDefined();
  });
  it("locks selection while acknowledging an externally changed checkout", async () => {
    let settle;
    const f = fixture(); const draft = scope(); await f.controller.select(draft);
    f.service.validateSelection.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }));
    const acknowledging = f.controller.acknowledgeChange();
    expect(await f.controller.select({ path: "/other" })).toBe(false);
    await expect(f.controller.pick({ path: "/other" })).rejects.toThrow("pending operation");
    settle({ branch: "fresh", commit: "ccc" }); await acknowledging;
    expect(draft.checkout).toMatchObject({ branch: "fresh", commit: "ccc" });
  });
  it("drops an obsolete uncreated base receipt and requires a fresh committed base", async () => {
    const f = fixture(); const draft = scope(); await f.controller.select(draft);
    await f.controller.setNewWorktree(true);
    f.service.plan.mockRejectedValueOnce(Object.assign(new Error("Base moved"), { code: "base-changed" }));
    await expect(f.controller.prepareSend()).rejects.toThrow("Base moved");
    expect(draft.checkout.planId).toBeUndefined();
    expect(draft.checkout.base).toBeNull();
    await expect(f.controller.prepareSend()).rejects.toThrow("Choose an available base");
    expect(f.service.create).not.toHaveBeenCalled();
    await f.controller.setBase("refs/remotes/origin/main");
    await f.controller.prepareSend();
    expect(f.service.create).toHaveBeenCalledTimes(1);
  });

});


describe("first-thread retry identity", () => {
  it("reuses the same receipt across retries and renews it when permissions or model change", () => {
    const draft = { creationRequestId: "first", checkout: { planId: "retained-worktree" } };
    const input = { title: "Task", initialMessage: "Task", permissionProfileId: "ask", projectId: 1,
      workingDirectory: "/managed", pickerPayload: { harnessId: "fixture", modelSelection: { modelId: "a" } } };
    const first = stableNewThreadRequest(draft, input);
    expect(stableNewThreadRequest(draft, structuredClone(input))).toEqual(first);
    expect(stableNewThreadRequest(draft, { ...input, expectedCheckout: { commit: "acknowledged" } }).creationRequestId).toBe(first.creationRequestId);
    expect(stableNewThreadRequest(draft, { ...input, permissionProfileId: "full" }, () => "second").creationRequestId).toBe("second");
    expect(draft.checkout.planId).toBe("retained-worktree");
    expect(stableNewThreadRequest(draft, { ...input, pickerPayload: { harnessId: "fixture", modelSelection: { modelId: "b" } } }, () => "third").creationRequestId).toBe("third");
  });
});


it("warns across explicit subfolder projects in one checkout and excludes other worktrees", () => {
  const threads = [
    { id: 1, workingDirectory: "/repo/frontend", checkoutContext: { checkoutRoot: "/repo" } },
    { id: 2, workingDirectory: "/repo/backend" },
    { id: 3, workingDirectory: "/linked/frontend", checkoutContext: { checkoutRoot: "/linked" } },
    { id: 4, workingDirectory: "/repo/nested", checkoutContext: { checkoutRoot: "/repo/nested" } },
  ];
  const draft = { checkoutRoot: "/repo", path: "/repo/backend", checkout: {} };
  expect(checkoutSharingThreads(threads, draft).map((thread) => thread.id)).toEqual([1, 2]);
  draft.checkout.newWorktree = true;
  expect(checkoutSharingThreads(threads, draft)).toEqual([]);
});
