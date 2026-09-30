// New-thread checkout state is separate from project identity and saved threads.
// All filesystem mutations live in Electron main; this controller owns only the
// draft and the receipt used to recover an interrupted first Send.
export function createWorktreeController({ service, changed = () => {}, persist = async () => {} }) {
  let revision = 0;
  let current = null;
  let busy = false;
  const publish = async () => { changed(current); await persist(current?.scope); };
  const call = async (method, input) => {
    const result = await service[method](input);
    if (result?.ok === false) {
      const error = new Error(result.error.message);
      Object.assign(error, result.error);
      throw error;
    }
    return result?.ok === true ? result.value : result;
  };
  const assertEditable = () => {
    if (busy) throw new Error("Wait for the pending operation to finish.");
    if (current?.status !== "ready") throw new Error("Checkout discovery must finish before sending.");
  };
  return {
    get state() { return current; },
    get busy() { return busy; },
    get ready() { return !current || current.status === "ready"; },
    async select(scope) {
      if (busy) return false;
      const token = ++revision;
      if (!scope?.path || !service) { current = null; changed(current); return true; }
      current = { scope, status: "loading", error: null, inspection: null };
      changed(current);
      try {
        const inspection = await call("inspect", scope.path);
        if (token !== revision) return false;
        Object.assign(scope, { git: inspection.git, branch: inspection.branch });
        if (inspection.git) {
          scope.repositoryId = inspection.repositoryId;
          scope.repositoryRoot = inspection.repositoryRoot;
          scope.relativePath = inspection.relativePath;
          scope.checkoutRoot = inspection.checkoutRoot;
          // A persisted expectation is never silently refreshed after an external
          // branch switch. It remains the Send revalidation checkpoint.
          scope.checkout ??= { branch: inspection.branch, commit: inspection.commit };
          if (!scope.checkout.base) scope.checkout.base = inspection.defaultBase ?? null;
        } else {
          delete scope.checkout;
        }
        current = { scope, status: "ready", error: null, inspection };
        await publish();
        return true;
      } catch (error) {
        if (token !== revision) return false;
        current.status = "failed";
        current.error = error;
        await publish();
        return false;
      }
    },
    async pick(target) {
      assertEditable();
      const { scope } = current;
      busy = true; changed(current);
      try {
        const selected = await call("validateSelection", {
          path: target.path, relativePath: scope.relativePath || "",
          repositoryId: scope.repositoryId,
        });
        const inspection = await call("inspect", selected.workingDirectory);
        current.inspection = inspection;
        Object.assign(scope, { path: selected.workingDirectory, checkoutRoot: selected.checkoutRoot, branch: selected.branch });
        scope.checkout = { branch: selected.branch, commit: selected.commit, base: inspection.defaultBase ?? null };
        delete scope.creationRequestId;
        current.error = null;
        delete current.changedCheckout;
        await publish();
      } finally { busy = false; changed(current); }
    },
    async setNewWorktree(value) {
      assertEditable();
      current.scope.checkout.newWorktree = Boolean(value);
      current.error = null;
      delete current.changedCheckout;
      delete current.scope.creationRequestId;
      delete current.scope.checkout.planId;
      delete current.scope.checkout.created;
      delete current.scope.checkout.planRequest;
      await publish();
    },
    async setBase(name) {
      assertEditable();
      if (current.scope.checkout.planId) throw new Error("Retry the retained creation plan, or choose a checkout to start another plan.");
      current.scope.checkout.base = name;
      current.error = null;
      delete current.scope.creationRequestId;
      await publish();
    },
    async prepareSend() {
      assertEditable();
      const { scope, inspection } = current;
      if (!inspection?.git) return { workingDirectory: scope.path };
      const choice = scope.checkout;
      busy = true;
      changed(current);
      try {
        if (choice.newWorktree) {
          if (!choice.planRequest) {
            const base = inspection.bases.find((entry) => (entry.ref || entry.name) === choice.base);
            if (!base) throw new Error("Choose an available base for the worktree.");
            // Stable caller ID is persisted before planning or creation. A lost
            // IPC reply can therefore recover the same receipt on the next Send.
            choice.planId = crypto.randomUUID().replaceAll("-", "");
            choice.planRequest = { repositoryPath: scope.path, relativePath: scope.relativePath || "", base: choice.base, expectedCommit: base.commit, planId: choice.planId };
            await publish();
          }
          await publish();
          await call("plan", choice.planRequest);
          const created = await call("create", { planId: choice.planId, acknowledgedState: choice.acknowledgedState });
          choice.created = created;
          await publish();
          return created;
        }
        const selected = await call("validateSelection", {
          path: scope.checkoutRoot, relativePath: scope.relativePath || "", repositoryId: scope.repositoryId,
          expectedBranch: choice.branch, expectedCommit: choice.commit,
        });
        return selected;
      } catch (error) {
        current.error = error;
        if (error.code === "checkout_changed") current.changedCheckout = error.details;
        if (["base-changed", "base-unavailable"].includes(error.code)) {
          delete choice.planId; delete choice.planRequest;
          current.inspection = await call("inspect", scope.path);
          choice.base = null;
        }
        await publish();
        throw error;
      } finally { busy = false; changed(current); }
    },
    async acknowledgeChange() {
      assertEditable();
      busy = true; changed(current);
      try {
        const fresh = await call("validateSelection", {
          path: current.scope.checkout.newWorktree ? (current.changedCheckout?.path || current.scope.checkout.created?.checkoutRoot || (await call("readPlan", current.scope.checkout.planId)).path) : current.scope.checkoutRoot, relativePath: current.scope.relativePath || "", repositoryId: current.scope.repositoryId,
        });
        Object.assign(current.scope.checkout, { branch: fresh.branch, commit: fresh.commit });
        if (current.scope.checkout.newWorktree) current.scope.checkout.acknowledgedState = { branch: fresh.branch, commit: fresh.commit };
        else current.scope.branch = fresh.branch;
        current.error = null;
        delete current.changedCheckout;
        await publish();
      } finally { busy = false; changed(current); }
    },
    reportSendError(error) {
      if (!current) return;
      current.error = error;
      if (error.code === "checkout_changed") {
        const snapshot = error.details?.currentCheckout;
        current.changedCheckout = snapshot ? { path: snapshot.checkoutRoot, branch: snapshot.branch, commit: snapshot.commit } : error.details;
      }
      changed(current);
    },
    clear() { if (busy) return; revision++; current = null; changed(current); },
  };
}


export function checkoutSharingThreads(threads, scope) {
  if (!scope?.checkoutRoot || scope.checkout?.newWorktree) return [];
  const normalized = (value) => String(value || "").replaceAll("\\", "/").replace(/\/$/, "");
  const root = normalized(scope.checkoutRoot);
  return threads.filter((thread) => {
    const context = thread.checkoutContext;
    if (context?.checkoutRoot) return normalized(context.checkoutRoot) === root;
    const cwd = normalized(thread.workingDirectory);
    return cwd === root || cwd.startsWith(root + "/");
  });
}
