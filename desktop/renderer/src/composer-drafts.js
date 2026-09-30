const STORAGE_KEY = "relayerComposerDraftsV1";
const MAX_THREAD_FOLLOWUP_DRAFTS = 256;
const MAX_COMPOSER_DRAFT_BYTES = 1024 * 1024;
let desktopState = emptyState();
let desktopInitialized = false;

// Beside each follow-up draft: threadFollowupRestorations names the retry
// restoration a draft grew from, so a restart can tell restored text from
// a user's draft with the same text (SCP-020); sentThreadFollowups holds,
// per thread, a send whose turn has not loaded yet (written when its POST
// starts), so text retyped after that Send is not taken for the sent text
// after a restart (SCP-018). A record keeps a digest of the sent text, not
// the text, so it stays small beside the drafts it protects.
function emptyState() {
  return { pendingNewThread: null, threadFollowups: {}, threadFollowupRestorations: {}, sentThreadFollowups: {} };
}

// A short, stable digest of a follow-up's trimmed text (cyrb53).
export function followupTextDigest(text) {
  const value = String(text ?? "").trim();
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${value.length}:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)}`;
}

function stringEntries(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === "string"))
    : {};
}

function sentEntries(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, record]) => typeof record?.scopeKey === "string"
      && typeof record.originScopeKey === "string" && typeof record.textDigest === "string"
      && typeof record.edited === "boolean" && Number.isSafeInteger(record.sends) && record.sends >= 1))
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
      sentThreadFollowups: sentEntries(value.sentThreadFollowups),
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
  bounded.sentThreadFollowups = boundedSentRecords(bounded.sentThreadFollowups ?? {}, bounded.threadFollowups);
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

// Over the cap, records that protect no draft go first, oldest first.
function boundedSentRecords(records, followups, max = MAX_THREAD_FOLLOWUP_DRAFTS) {
  const keys = Object.keys(records);
  if (keys.length <= max) return records;
  const protects = (key) => records[key].edited && Object.hasOwn(followups, records[key].scopeKey);
  const evicted = new Set([...keys.filter((key) => !protects(key)), ...keys.filter(protects)]
    .slice(0, keys.length - max));
  return Object.fromEntries(keys.filter((key) => !evicted.has(key)).map((key) => [key, records[key]]));
}

export async function initializeComposerDrafts() {
  if (!window.relayerDesktop?.drafts) return;
  try {
    const value = await window.relayerDesktop.drafts.read();
    desktopState = {
      pendingNewThread: value?.pendingNewThread ?? null,
      threadFollowups: value?.threadFollowups ?? {},
      threadFollowupRestorations: stringEntries(value?.threadFollowupRestorations),
      sentThreadFollowups: sentEntries(value?.sentThreadFollowups),
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

export function sentThreadFollowup(threadId) {
  if (threadId == null) return null;
  return readState().sentThreadFollowups[String(threadId)] ?? null;
}

// record: { scopeKey (where its text is now), originScopeKey, textDigest,
// edited (the scope's draft was typed after Send), sends (how many Sends of
// that text from that scope it waits for) }, or null.
export function persistSentThreadFollowup(threadId, record) {
  if (threadId == null) return;
  const state = readState();
  delete state.sentThreadFollowups[String(threadId)];
  if (record) {
    state.sentThreadFollowups[String(threadId)] = {
      scopeKey: record.scopeKey,
      originScopeKey: record.originScopeKey,
      textDigest: record.textDigest,
      edited: Boolean(record.edited),
      sends: record.sends ?? 1,
    };
  }
  writeState(state);
}

// Worktree receipt identity must be durable before filesystem creation. Ordinary
// typing remains best-effort, but this boundary reports persistence failures.
export async function persistPendingNewThreadDraftDurably(text, scope) {
  const next = readState();
  next.pendingNewThread = text ? { text, scope } : null;
  const bounded = boundedState(next);
  if (!bounded) throw new Error("The draft exceeds the local persistence limit.");
  if (window.relayerDesktop?.drafts) {
    if (!desktopInitialized) throw new Error("Draft storage is still initializing.");
    await window.relayerDesktop.drafts.write(structuredClone(bounded));
    desktopState = structuredClone(bounded);
  } else {
    const target = storage();
    if (!target) throw new Error("Draft storage is unavailable.");
    target.setItem(STORAGE_KEY, JSON.stringify(bounded));
  }
}
