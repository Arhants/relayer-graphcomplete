const TITLE_LIMIT = 120;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function truncateShareTitle(value) {
  return [...String(value ?? "")].slice(0, TITLE_LIMIT).join("");
}

export function shareEligibility({ thread, interactions }) {
  if (!thread || thread.imported === true) {
    return { eligible: false, acceptedTurnCount: 0, code: "share_imported_conversation" };
  }
  const acceptedTurnCount = (interactions ?? []).filter((interaction) => (
    String(interaction?.threadId) === String(thread.id)
      && interaction?.completionStatus === "accepted"
  )).length;
  return acceptedTurnCount > 0
    ? { eligible: true, acceptedTurnCount }
    : { eligible: false, acceptedTurnCount: 0, code: "share_no_accepted_completion" };
}

function normalizedAccount(value) {
  return value?.status === "signed-in" ? "signed-in"
    : value?.status === "signing-in" ? "signing-in"
      : "signed-out";
}

function localReset(resetAt) {
  const date = new Date(resetAt);
  return Number.isNaN(date.valueOf()) ? null : date.toLocaleString();
}

export function createSharePublishController({
  root = document,
  getThread,
  getInteractions,
  account,
  share,
  clipboard = globalThis.navigator?.clipboard,
}) {
  if (typeof getThread !== "function" || typeof getInteractions !== "function"
    || typeof account?.read !== "function" || typeof account?.login !== "function"
    || typeof share?.preflight !== "function" || typeof share?.create !== "function") {
    throw new TypeError("Share publication UI dependencies are invalid.");
  }
  const headerButton = root.querySelector("#shareConversation");
  const menuButton = root.querySelector("#shareConversationMenu");
  const host = root.querySelector("#shareDialog");
  if (!headerButton || !menuButton || !host) throw new Error("Share publication controls are missing.");

  let phase = "closed";
  let title = "";
  let result = null;
  let failureOrigin = null;
  let attemptResult = false;
  let accountSubject = null;
  let operationVersion = 0;
  let returnFocus = null;
  let disposed = false;
  let recoveryThreadKey = null;
  let dialogThreadKey = null;
  let dialogThreadId = null;

  const setBackgroundInert = (value) => {
    for (const child of host.parentElement?.children ?? []) {
      if (child !== host) child.inert = value;
    }
  };

  const focus = (selector) => queueMicrotask(() => host.querySelector(selector)?.focus());

  function close() {
    operationVersion += 1;
    phase = "closed";
    result = null;
    failureOrigin = null;
    attemptResult = false;
    title = "";
    dialogThreadKey = null;
    dialogThreadId = null;
    renderDialog();
  }

  async function dismissAndClose() {
    if (!attemptResult || typeof result?.attemptReferenceId !== "string"
      || typeof share.dismiss !== "function") return close();
    const dismissed = await share.dismiss(result.attemptReferenceId).catch(() => null);
    if (dismissed?.status === "dismissed" || dismissed?.code === "share_attempt_unavailable") close();
  }

  function renderDialog() {
    const open = phase !== "closed";
    host.classList.toggle("hidden", !open);
    setBackgroundInert(open);
    if (!open) {
      host.replaceChildren();
      if (returnFocus?.isConnected) returnFocus.focus();
      returnFocus = null;
      return;
    }
    if (phase === "blocked") {
      const imported = result?.code === "share_imported_conversation";
      host.innerHTML = `<section class="share-dialog-card" role="dialog" aria-modal="true" aria-labelledby="shareDialogTitle" tabindex="-1">
        <h2 id="shareDialogTitle">This thread can’t be shared yet</h2>
        <p>${imported ? "Imported conversations stay read-only and cannot be published as a new shared link." : "This thread needs an accepted response before it can be shared."}</p>
        <div class="share-dialog-actions"><button data-share-action="close" type="button">Close</button></div>
      </section>`;
      host.querySelector('[data-share-action="close"]').onclick = close;
      focus('[data-share-action="close"]');
      return;
    }
    if (phase === "preflighting") {
      host.innerHTML = `<section class="share-dialog-card" role="dialog" aria-modal="true" aria-labelledby="shareDialogTitle" tabindex="-1">
        <h2 id="shareDialogTitle">Checking this thread…</h2>
        <p>Confirming the accepted snapshot can be shared before asking for a title.</p>
        <div class="share-progress" aria-label="Checking share availability"><span></span></div>
      </section>`;
      focus(".share-dialog-card");
      return;
    }
    if (phase === "signin" || phase === "signing-in") {
      const pending = phase === "signing-in";
      host.innerHTML = `<section class="share-dialog-card" role="dialog" aria-modal="true" aria-labelledby="shareDialogTitle" tabindex="-1">
        <h2 id="shareDialogTitle">Share this thread</h2>
        <p>Anyone with the link can view a frozen, read-only copy.</p>
        <p class="share-dialog-note">${pending ? "Finish signing in in your browser. Nothing will be published yet." : "Sign in first. Signing in will not publish anything."}</p>
        <div class="share-dialog-actions"><button data-share-action="cancel" type="button">Cancel</button><button class="primary" data-share-action="sign-in" type="button" ${pending ? "disabled" : ""}>${pending ? "Signing in…" : "Sign in to share"}</button></div>
      </section>`;
      host.querySelector('[data-share-action="cancel"]').onclick = close;
      host.querySelector('[data-share-action="sign-in"]').onclick = async () => {
        const operation = ++operationVersion;
        phase = "signing-in";
        renderDialog();
        const next = await account.login().catch(() => ({ status: "signed-out" }));
        if (disposed || phase === "closed" || operation !== operationVersion) return;
        if (normalizedAccount(next) === "signed-in") {
          accountSubject = typeof next?.subject === "string" ? next.subject : accountSubject;
          return runPreflight();
        }
        else if (normalizedAccount(next) !== "signing-in") phase = "signin";
        renderDialog();
      };
      focus(pending ? ".share-dialog-card" : '[data-share-action="sign-in"]');
      return;
    }
    if (phase === "title") {
      const blank = !title.trim();
      host.innerHTML = `<section class="share-dialog-card" role="dialog" aria-modal="true" aria-labelledby="shareDialogTitle" tabindex="-1">
        <h2 id="shareDialogTitle">Share this thread</h2>
        <p>Choose the title people will see. Your local thread title will not change.</p>
        <label>Share title<input class="share-title-input" id="shareTitle" type="text" autocomplete="off" value="${escapeHtml(title)}" /></label>
        <div class="share-title-meta"><span data-share-title-message>Required</span><span data-share-title-count>${[...title].length}/${TITLE_LIMIT}</span></div>
        <p class="share-dialog-note">Create link freezes all turns accepted when you click it, including any response that finishes while this dialog is open. Known secrets and private paths are removed; review other sensitive content yourself.</p>
        <div class="share-dialog-actions"><button data-share-action="cancel" type="button">Cancel</button><button class="primary" data-share-action="create" type="button" ${blank ? "disabled" : ""}>Create link</button></div>
      </section>`;
      const input = host.querySelector("#shareTitle");
      const createButton = host.querySelector('[data-share-action="create"]');
      input.oninput = () => {
        const next = truncateShareTitle(input.value);
        if (input.value !== next) input.value = next;
        title = next;
        const empty = !title.trim();
        createButton.disabled = empty;
        host.querySelector("[data-share-title-message]").textContent = empty && title.length
          ? "Enter non-whitespace text"
          : "Required";
        host.querySelector("[data-share-title-count]").textContent = `${[...title].length}/${TITLE_LIMIT}`;
      };
      host.querySelector('[data-share-action="cancel"]').onclick = close;
      createButton.onclick = async () => {
        if (!title.trim()) return;
        if (String(getThread()?.id) !== dialogThreadKey) return close();
        const operation = ++operationVersion;
        const threadId = dialogThreadId;
        phase = "creating";
        renderDialog();
        const next = await share.create(threadId, title).catch(() => ({
          status: "failed",
          code: "share_service_failed",
          retryable: false,
          attemptReferenceId: "SHR-UNAVAILABLE",
        }));
        if (disposed || phase === "closed" || operation !== operationVersion) return;
        result = next;
        attemptResult = true;
        dialogThreadKey = String(threadId);
        failureOrigin = next?.status === "created" ? null : "attempt";
        if (next?.status === "created") phase = "ready";
        else if (next?.code === "share_cancelled") return close();
        else if (next?.code === "share_sign_in_required") phase = "signin";
        else phase = "error";
        renderDialog();
      };
      focus("#shareTitle");
      return;
    }
    if (phase === "creating") {
      host.innerHTML = `<section class="share-dialog-card" role="dialog" aria-modal="true" aria-labelledby="shareDialogTitle" tabindex="-1">
        <h2 id="shareDialogTitle">Creating link…</h2>
        <p>Freezing accepted history and publishing the read-only snapshot.</p>
        <div class="share-progress" aria-label="Creating link"><span></span></div>
        <p class="share-dialog-note">This step cannot be cancelled.</p>
      </section>`;
      focus(".share-dialog-card");
      return;
    }
    if (phase === "ready") {
      host.innerHTML = `<section class="share-dialog-card" role="dialog" aria-modal="true" aria-labelledby="shareDialogTitle" tabindex="-1">
        <div class="share-dialog-header"><h2 id="shareDialogTitle">Link ready</h2><button class="share-dialog-close" data-share-action="close" type="button" aria-label="Close">×</button></div>
        <div class="share-link-row"><input type="text" readonly value="${escapeHtml(result.url)}" aria-label="Share link" /><button class="primary" data-share-action="copy" type="button">Copy</button></div>
        <p class="share-dialog-note">Read-only snapshot · known secrets and paths removed</p>
      </section>`;
      host.querySelector('[data-share-action="close"]').onclick = dismissAndClose;
      host.querySelector('[data-share-action="copy"]').onclick = async () => {
        await clipboard?.writeText?.(result.url);
        host.querySelector('[data-share-action="copy"]').textContent = "Copied";
      };
      focus('[data-share-action="copy"]');
      return;
    }

    const quotaReset = result?.code === "daily_quota_exhausted" ? localReset(result.resetAt) : null;
    const generic = result?.code !== "daily_quota_exhausted";
    const canRetry = generic && result?.retryable === true && typeof share.retry === "function";
    host.innerHTML = `<section class="share-dialog-card" role="dialog" aria-modal="true" aria-labelledby="shareDialogTitle" tabindex="-1">
      <h2 id="shareDialogTitle">${generic ? "We couldn’t create the link" : "Daily share limit reached"}</h2>
      <p>${generic ? "Try again. If the problem continues, share the reference below with support." : `You can share again after ${escapeHtml(quotaReset ?? "the daily limit resets")}.`}</p>
      ${generic ? `<p class="share-dialog-note">Reference <span class="share-reference">${escapeHtml(result?.attemptReferenceId ?? "SHR-UNAVAILABLE")}</span></p>` : ""}
      <div class="share-dialog-actions"><button data-share-action="close" type="button">Close</button>${canRetry ? '<button class="primary" data-share-action="retry" type="button">Retry</button>' : ""}</div>
    </section>`;
    host.querySelector('[data-share-action="close"]').onclick = dismissAndClose;
    const retry = host.querySelector('[data-share-action="retry"]');
    if (retry) retry.onclick = async () => {
      phase = "creating";
      renderDialog();
      if (failureOrigin === "preflight") return runPreflight();
      const operation = ++operationVersion;
      const next = await share.retry(result.attemptReferenceId).catch(() => ({
        ...result,
        status: "failed",
        code: "share_service_failed",
      }));
      if (disposed || phase === "closed" || operation !== operationVersion) return;
      result = next;
      phase = next?.status === "created" ? "ready" : "error";
      renderDialog();
    };
    focus(canRetry ? '[data-share-action="retry"]' : '[data-share-action="close"]');
  }

  async function open(event) {
    const operation = ++operationVersion;
    const sourceThread = getThread();
    const eligibility = shareEligibility({ thread: sourceThread, interactions: getInteractions() });
    returnFocus = event?.currentTarget ?? root.activeElement;
    title = "";
    result = eligibility.eligible ? null : { code: eligibility.code };
    dialogThreadId = sourceThread?.id ?? null;
    dialogThreadKey = dialogThreadId == null ? null : String(dialogThreadId);
    if (!eligibility.eligible) {
      phase = "blocked";
      renderDialog();
      return;
    }
    const currentAccount = await account.read().catch(() => null);
    if (disposed || operation !== operationVersion) return;
    if (String(getThread()?.id) !== dialogThreadKey) return close();
    if (normalizedAccount(currentAccount) === "signed-in") {
      accountSubject = typeof currentAccount?.subject === "string" ? currentAccount.subject : null;
      return runPreflight();
    }
    phase = normalizedAccount(currentAccount) === "signing-in" ? "signing-in" : "signin";
    renderDialog();
  }

  async function runPreflight() {
    if (dialogThreadKey === null) {
      const sourceThread = getThread();
      if (!Number.isSafeInteger(sourceThread?.id) || sourceThread.id <= 0) return close();
      dialogThreadId = sourceThread.id;
      dialogThreadKey = String(sourceThread.id);
    }
    const operation = ++operationVersion;
    const sourceThreadKey = dialogThreadKey;
    const sourceThreadId = dialogThreadId;
    phase = "preflighting";
    renderDialog();
    const next = await share.preflight(sourceThreadId).catch(() => ({
      status: "failed",
      code: "share_service_failed",
      retryable: true,
      attemptReferenceId: "SHR-UNAVAILABLE",
    }));
    if (disposed || phase === "closed" || operation !== operationVersion
      || String(getThread()?.id) !== sourceThreadKey) return;
    result = next?.status === "ready" ? null : next;
    failureOrigin = next?.status === "ready" ? null : "preflight";
    // Export failures may have a main-owned durable failure receipt. Ask main
    // to dismiss any referenced preflight result on Close; an unavailable
    // reference is treated as already absent by dismissAndClose.
    attemptResult = next?.status === "failed"
      && typeof next?.attemptReferenceId === "string";
    phase = next?.status === "ready" ? "title"
      : next?.code === "share_sign_in_required" ? "signin"
        : "error";
    renderDialog();
  }

  async function recoverPending(accountValue = null) {
    if (disposed || phase !== "closed" || typeof share.pending !== "function") return "stale";
    const threadId = getThread()?.id;
    if (!Number.isSafeInteger(threadId) || threadId <= 0) return "stale";
    const threadKey = String(threadId);
    if (recoveryThreadKey === threadKey) return "stale";
    const operation = ++operationVersion;
    const currentAccount = accountValue ?? await account.read().catch(() => null);
    if (disposed || phase !== "closed" || operation !== operationVersion
      || normalizedAccount(currentAccount) !== "signed-in") return "stale";
    accountSubject = typeof currentAccount?.subject === "string" ? currentAccount.subject : null;
    recoveryThreadKey = threadKey;
    let pending;
    try {
      pending = await share.pending(threadId);
    } catch {
      // A failed lookup is not evidence that no durable attempt exists. Do
      // not cache the thread so a later render can retry recovery.
      recoveryThreadKey = null;
      return "failed";
    }
    if (disposed || phase !== "closed" || operation !== operationVersion
      || String(getThread()?.id) !== threadKey) return "stale";
    if (!pending) {
      // Main intentionally closes transient store/account failures to null.
      // Recheck on a later render rather than allowing a new publication to
      // bypass a durable attempt that was temporarily unavailable.
      recoveryThreadKey = null;
      return "absent";
    }
    result = pending;
    attemptResult = true;
    failureOrigin = "attempt";
    dialogThreadKey = threadKey;
    phase = pending.status === "created" ? "ready" : "error";
    renderDialog();
    return "recovered";
  }

  headerButton.onclick = open;
  menuButton.onclick = open;
  const unsubscribe = account.onChanged?.((value) => {
    if (disposed) return;
    if (phase === "closed") {
      operationVersion += 1;
      result = null;
      attemptResult = false;
      recoveryThreadKey = null;
      if (normalizedAccount(value) === "signed-in") void recoverPending(value);
      else accountSubject = null;
      return;
    }
    if (phase === "blocked") return;
    const status = normalizedAccount(value);
    const nextSubject = typeof value?.subject === "string" ? value.subject : null;
    const replaced = status === "signed-in" && accountSubject !== null && nextSubject !== accountSubject;
    if (status === "signed-in" && (phase === "signin" || phase === "signing-in" || replaced)) {
      operationVersion += 1;
      title = "";
      result = null;
      failureOrigin = null;
      attemptResult = false;
      accountSubject = nextSubject;
      phase = "closed";
      recoveryThreadKey = null;
      renderDialog();
      void recoverPending(value).then((outcome) => {
        if (outcome === "absent" && !disposed && phase === "closed") void runPreflight();
      });
      return;
    }
    else if (status !== "signed-in") {
      operationVersion += 1;
      title = "";
      result = null;
      failureOrigin = null;
      attemptResult = false;
      accountSubject = null;
      phase = status === "signing-in" ? "signing-in" : "signin";
    }
    renderDialog();
  });

  return Object.freeze({
    render() {
      const threadKey = getThread()?.id == null ? null : String(getThread().id);
      if (dialogThreadKey !== null && dialogThreadKey !== threadKey) {
        if (phase === "ready" && attemptResult && typeof share.dismiss === "function") {
          void share.dismiss(result.attemptReferenceId).catch(() => undefined);
        }
        close();
      }
      const eligibility = shareEligibility({ thread: getThread(), interactions: getInteractions() });
      headerButton.disabled = !getThread();
      menuButton.disabled = !getThread();
      headerButton.setAttribute("aria-disabled", String(!eligibility.eligible));
      menuButton.setAttribute("aria-disabled", String(!eligibility.eligible));
      headerButton.title = eligibility.eligible ? "Share" : "Share unavailable";
      if (phase === "closed" && eligibility.eligible && recoveryThreadKey !== threadKey) void recoverPending();
    },
    dispose() {
      disposed = true;
      operationVersion += 1;
      unsubscribe?.();
      setBackgroundInert(false);
      host.replaceChildren();
    },
  });
}
