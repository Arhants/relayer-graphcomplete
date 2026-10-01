import { request } from "./api.js";
import { appState, viewState, productApiAvailable, query } from "./state.js";
import { $, escapeHtml, escapeHtmlAttribute, toast } from "./ui.js";

let archivedThreads = [];
let loadRevision = 0;

export function threadActivityOrder(a, b) {
  return String(b.updatedAt).localeCompare(String(a.updatedAt)) || String(b.createdAt).localeCompare(String(a.createdAt)) || Number(b.id) - Number(a.id);
}

export function archiveBlocked(thread) {
  return thread?.archiveBlocked === true || ["running", "stopping", "needs_approval"].includes(thread?.activity);
}

export function sidebarArchiveMenu(thread) {
  return `<details class="thread-entry-menu"><summary aria-label="Chat menu for ${escapeHtmlAttribute(thread.title)}" title="Chat menu">•••</summary><div role="menu"><button type="button" role="menuitem" data-archive-thread="${escapeHtmlAttribute(thread.id)}" ${archiveBlocked(thread) ? 'disabled title="Available when work finishes."' : ""}>Archive</button></div></details>`;
}

// Preview/review reads never acquire product write authority.
export async function restoreArchivedForNavigation(thread) {
  if (!thread?.archivedAt || !productApiAvailable || viewState.evalContext || query.get("review") === "1") return thread;
  return request(`/api/threads/${encodeURIComponent(thread.id)}/archive`, { method: "POST", body: JSON.stringify({ archived: false }) });
}

export async function setThreadArchived(threadId, archived) {
  const thread = await request(`/api/threads/${encodeURIComponent(threadId)}/archive`, {
    method: "POST", body: JSON.stringify({ archived }),
  });
  appState.threads = appState.threads.filter((item) => String(item.id) !== String(threadId));
  if (!archived || String(viewState.currentThreadId) === String(threadId)) appState.threads.push(thread);
  appState.threads.sort(threadActivityOrder);
  const { renderSidebar } = await import("./navigation.js");
  renderSidebar();
  if (String(viewState.currentThreadId) === String(threadId)) {
    const { renderThread } = await import("./graph.js");
    renderThread();
  }
  return thread;
}

export async function archiveThread(threadId) {
  await setThreadArchived(threadId, true);
  toast("Chat archived.", { actionLabel: "Undo", onAction: async () => {
    try { await setThreadArchived(threadId, false); toast("Chat restored."); }
    catch (error) { toast(error.message); }
  } });
}

function renderArchivedChats() {
  const list = $("#archivedChatList");
  if (!list) return;
  const search = ($("#archivedChatSearch")?.value || "").trim().toLocaleLowerCase();
  const filtered = archivedThreads.filter((thread) => thread.title.toLocaleLowerCase().includes(search));
  list.innerHTML = filtered.length ? filtered.map((thread) => {
    const project = appState.projects.find((item) => String(item.id) === String(thread.groupedProjectId ?? thread.projectId));
    return `<div class="setting-row archived-chat-row"><div><strong>${escapeHtml(thread.title)}</strong><small>${escapeHtml(project?.name ?? (thread.projectId ? "Project" : "No folder"))}</small></div><span class="archived-chat-actions"><button type="button" data-thread="${escapeHtmlAttribute(thread.id)}">Open</button><button type="button" data-unarchive-thread="${escapeHtmlAttribute(thread.id)}">Unarchive</button></span></div>`;
  }).join("") : `<p class="archive-empty">${search ? "No matching archived chats." : "No archived chats."}</p>`;
}

export async function loadArchivedChats() {
  const list = $("#archivedChatList");
  if (!list) return;
  const revision = ++loadRevision;
  list.textContent = "Loading archived chats…";
  const search = $("#archivedChatSearch");
  if (search) search.oninput = renderArchivedChats;
  try {
    const result = await request("/api/threads/archived");
    if (revision !== loadRevision) return;
    archivedThreads = result.threads;
    renderArchivedChats();
  } catch (error) {
    if (revision === loadRevision) list.textContent = `Could not load archived chats: ${error.message}`;
  }
}

export function bindArchiveActions() {
  document.addEventListener("click", (event) => {
    const archive = event.target.closest("[data-archive-thread]");
    const restore = event.target.closest("[data-unarchive-thread]");
    if (!archive && !restore) return;
    event.preventDefault();
    if ((archive ?? restore).disabled) return;
    const button = archive ?? restore;
    button.disabled = true;
    button.closest("details")?.removeAttribute("open");
    void (async () => {
      if (archive) await archiveThread(archive.dataset.archiveThread);
      else { await setThreadArchived(restore.dataset.unarchiveThread, false); await loadArchivedChats(); }
    })().catch((error) => toast(error.message)).finally(() => { button.disabled = false; });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.querySelectorAll(".thread-entry-menu[open]").forEach((menu) => menu.removeAttribute("open"));
  });
  document.addEventListener("click", (event) => {
    document.querySelectorAll(".thread-entry-menu[open]").forEach((menu) => { if (!menu.contains(event.target)) menu.removeAttribute("open"); });
  });
}
