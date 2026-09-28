const STORAGE_KEY = "relayerComposerDraftsV1";
const MAX_THREAD_FOLLOWUP_DRAFTS = 256;
const MAX_COMPOSER_DRAFT_BYTES = 1024 * 1024;
let desktopState = emptyState();
let desktopInitialized = false;

// Beside each follow-up draft: threadFollowupRestorations names the retry
// restoration a draft grew from, so a restart can tell restored text from
// a user's draft with the same text (SCP-020); settledThreadFollowups holds,
// per thread, a send that settled before its turn loaded, so text retyped
// after that Send is not taken for the sent text after a restart (SCP-018).
function emptyState() {
  return { pendingNewThread: null, threadFollowups: {}, threadFollowupRestorations: {}, settledThreadFollowups: {} };
}

function stringEntries(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === "string"))
    : {};
}

function settledEntries(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, record]) => typeof record?.scopeKey === "string"
      && typeof record.originScopeKey === "string" && typeof record.text === "string"))
    : {};
}

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readState() {
  if (window.relayerDesktop?.drafts && desktopInitialized) return structuredClone(desktopState);
  const target = storage();
  if (!target) return emptyState();
  try {
    const value = JSON.parse(target.getItem(STORAGE_KEY) || "null");
    if (!value || typeof value !== "object") return emptyState();
    return {
      pendingNewThread: value.pendingNewThread && typeof value.pendingNewThread === "object"
        ? value.pendingNewThread
        : null,
      threadFollowups: value.threadFollowups && typeof value.threadFollowups === "object"
        ? value.threadFollowups
        : {},
      threadFollowupRestorations: stringEntries(value.threadFollowupRestorations),
      settledThreadFollowups: settledEntries(value.settledThreadFollowups),
    };
  } catch {
    return emptyState();
  }
}

function writeState(value) {
  const bounded = boundedState(value);
  if (!bounded) return;
  if (window.relayerDesktop?.drafts) {
    desktopState = structuredClone(bounded);
    void window.relayerDesktop.drafts.write(desktopState).catch(() => undefined);
    return;
  }
  const target = storage();
  if (!target) return;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Draft persistence is best-effort; the composer remains usable without storage.
  }
}

function boundedState(value) {
  const bounded = structuredClone(value);
  const followupKeys = Object.keys(bounded.threadFollowups);
  for (const staleKey of followupKeys.slice(0, -MAX_THREAD_FOLLOWUP_DRAFTS)) {
    delete bounded.threadFollowups[staleKey];
  }
  const settledKeys = Object.keys(bounded.settledThreadFollowups ?? {});
  for (const staleKey of settledKeys.slice(0, -MAX_THREAD_FOLLOWUP_DRAFTS)) {
    delete bounded.settledThreadFollowups[staleKey];
  }
  const dropOrphanRestorations = () => {
    for (const scopeKey of Object.keys(bounded.threadFollowupRestorations ?? {})) {
      if (!(scopeKey in bounded.threadFollowups)) delete bounded.threadFollowupRestorations[scopeKey];
    }
  };
  dropOrphanRestorations();
  while (new TextEncoder().encode(JSON.stringify(bounded)).byteLength > MAX_COMPOSER_DRAFT_BYTES) {
    const [staleKey] = Object.keys(bounded.threadFollowups);
    if (!staleKey) return null;
    delete bounded.threadFollowups[staleKey];
    dropOrphanRestorations();
  }
  return bounded;
}

export async function initializeComposerDrafts() {
  if (!window.relayerDesktop?.drafts) return;
  try {
    const value = await window.relayerDesktop.drafts.read();
    desktopState = {
      pendingNewThread: value?.pendingNewThread ?? null,
      threadFollowups: value?.threadFollowups ?? {},
      threadFollowupRestorations: stringEntries(value?.threadFollowupRestorations),
      settledThreadFollowups: settledEntries(value?.settledThreadFollowups),
    };
  } finally {
    desktopInitialized = true;
  }
}

export function pendingNewThreadDraft() {
  const draft = readState().pendingNewThread;
  if (!draft || typeof draft.text !== "string") return null;
  return { text: draft.text, scope: draft.scope ?? null };
}

export function persistPendingNewThreadDraft(text, scope) {
  const state = readState();
  if (!text) state.pendingNewThread = null;
  else state.pendingNewThread = { text, scope };
  writeState(state);
}

export function clearPendingNewThreadDraft() {
  const state = readState();
  state.pendingNewThread = null;
  writeState(state);
}

export function threadFollowupDraft(scopeKey) {
  if (!scopeKey) return null;
  const value = readState().threadFollowups[scopeKey];
  return typeof value === "string" ? value : null;
}

export function threadFollowupRestoration(scopeKey) {
  if (!scopeKey) return null;
  const value = readState().threadFollowupRestorations[scopeKey];
  return typeof value === "string" ? value : null;
}

// restorationId: the retry restoration this draft grew from, if any.
export function persistThreadFollowupDraft(scopeKey, text, { preserveEmpty = false, restorationId = null } = {}) {
  if (!scopeKey) return;
  const state = readState();
  delete state.threadFollowups[scopeKey];
  delete state.threadFollowupRestorations[scopeKey];
  if (text || preserveEmpty) {
    state.threadFollowups[scopeKey] = text;
    if (restorationId != null) state.threadFollowupRestorations[scopeKey] = String(restorationId);
    const keys = Object.keys(state.threadFollowups);
    for (const staleKey of keys.slice(0, -MAX_THREAD_FOLLOWUP_DRAFTS)) {
      delete state.threadFollowups[staleKey];
    }
  }
  writeState(state);
}

export function clearThreadFollowupDraft(scopeKey) {
  if (!scopeKey) return;
  const state = readState();
  delete state.threadFollowups[scopeKey];
  delete state.threadFollowupRestorations[scopeKey];
  writeState(state);
}

export function settledThreadFollowup(threadId) {
  if (threadId == null) return null;
  return readState().settledThreadFollowups[String(threadId)] ?? null;
}

// record: { scopeKey, originScopeKey, text }, or null once the turn loaded.
export function persistSettledThreadFollowup(threadId, record) {
  if (threadId == null) return;
  const state = readState();
  delete state.settledThreadFollowups[String(threadId)];
  if (record) {
    state.settledThreadFollowups[String(threadId)] = {
      scopeKey: record.scopeKey,
      originScopeKey: record.originScopeKey,
      text: record.text,
    };
  }
  writeState(state);
}
