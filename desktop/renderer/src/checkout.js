import { createWorktreeController, checkoutSharingThreads } from "./worktree-controller.js";
import { appState, desktop, viewState, productApiAvailable } from "./state.js";
import { $, escapeHtml, escapeHtmlAttribute } from "./ui.js";
import { persistPendingNewThreadDraftDurably } from "./composer-drafts.js";
import { request } from "./api.js";

let availabilityChanged = () => {};
let scopeChanged = () => {};
let submitting = false;
const activeStatuses = new Set(["not_started", "preparing", "running", "submitted", "waiting_for_approval"]);
async function refreshSharedCheckout(scope) {
  if (!productApiAvailable || !scope.path) return;
  const checkoutRoot = scope.checkoutRoot;
  const newWorktree = scope.checkout?.newWorktree;
  const results = await Promise.allSettled(checkoutSharingThreads(appState.threads, scope)
    .map((thread) => request(`/api/threads/${encodeURIComponent(thread.id)}`)));
  const state = checkoutController.state;
  if (state?.scope !== scope || scope.checkoutRoot !== checkoutRoot || scope.checkout?.newWorktree !== newWorktree) return;
  state.sharedActive = results.some((result) => result.status === "fulfilled"
    && result.value.interactions?.some((interaction) => activeStatuses.has(interaction.completionStatus)));
  renderCheckout();
}
export const checkoutController = createWorktreeController({
  service: desktop?.worktrees,
  changed: () => { renderCheckout(); scopeChanged(); availabilityChanged(); },
  persist: (scope) => scope ? persistPendingNewThreadDraftDurably($("#newThreadPrompt")?.value || "", scope) : undefined,
});
export const checkoutSelectionLocked = () => submitting || checkoutController.busy;
export function setCheckoutSubmitting(value) {
  submitting = value;
  if ($("#scopeButton")) $("#scopeButton").disabled = value;
  renderCheckout();
}
export async function selectCheckoutScope(scope) {
  const selected = await checkoutController.select(scope);
  if (selected) void refreshSharedCheckout(scope);
  if (selected && scope.git && productApiAvailable) {
    try {
      const result = await request("/api/projects/consolidate", { method: "POST" });
      // Preserve draft identity; grouping aliases are display-only.
      appState.projects = result.projects;
      scopeChanged();
    } catch (error) {
      const state = checkoutController.state;
      if (state?.scope === scope) { state.error = error; renderCheckout(); }
    }
  }
}
export function closeCheckoutMenu() {
  $("#checkoutMenu")?.classList.add("hidden");
  $("#checkoutButton")?.setAttribute("aria-expanded", "false");
}
const safely = (operation) => async () => {
  try { await operation(); }
  catch (error) {
    if (checkoutController.state) checkoutController.state.error = error;
    renderCheckout();
  }
};
export function initializeCheckout({ onAvailabilityChanged, onScopeChanged }) {
  availabilityChanged = onAvailabilityChanged;
  scopeChanged = onScopeChanged;
  $("#checkoutButton").onclick = () => {
    const menu = $("#checkoutMenu");
    const open = menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !open);
    $("#checkoutButton").setAttribute("aria-expanded", String(open));
    if (open) $("#scopeMenu")?.classList.add("hidden");
  };
  document.addEventListener("click", (event) => {
    if (!event.composedPath().includes($("#checkoutControl"))) closeCheckoutMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#checkoutMenu")?.classList.contains("hidden")) {
      closeCheckoutMenu(); $("#checkoutButton")?.focus();
    }
  });
}
export function renderCheckout() {
  const control = $("#checkoutControl");
  if (!control) return;
  const state = checkoutController.state;
  const visible = state && (state.status !== "ready" || state.inspection?.git);
  control.classList.toggle("hidden", !visible);
  const notice = $("#checkoutNotice");
  notice.classList.add("hidden");
  if (!visible) return;
  const loading = state.status === "loading";
  const pending = checkoutSelectionLocked();
  const button = $("#checkoutButton");
  button.disabled = loading || pending;
  button.setAttribute("aria-label", loading ? "Loading worktrees" : "Choose checkout");
  $("#checkoutLabel").textContent = loading ? "" : "Checkout";
  const status = $("#checkoutStatus");
  status.textContent = loading ? "" : "⌄";
  status.classList.toggle("checkout-spinner", loading);
  const { scope, inspection } = state;
  const menu = $("#checkoutMenu");
  if (state.status === "failed") {
    menu.innerHTML = '<button type="button" id="retryCheckout">Retry inspection</button>';
    $("#retryCheckout").onclick = safely(() => selectCheckoutScope(scope));
  } else if (inspection?.git) {
    const relative = scope.relativePath || "";
    const project = appState.projects.find((entry) => String(entry.id) === String(scope.projectId));
    const explicitSubfolder = scope.separateSubfolder || (relative && project?.path === scope.path);
    const items = inspection.worktrees.map((entry, index) => {
      const reason = entry.reason || (!entry.exists ? "Missing checkout" : !entry.accessible ? "Checkout unavailable" : "");
      const states = [entry.dirty ? "Uncommitted changes" : "", entry.detached ? "Detached HEAD" : "", entry.locked ? "Locked against removal" : "", reason].filter(Boolean);
      const label = entry.detached ? "Detached HEAD" : entry.branch || "Checkout";
      return `<button type="button" data-checkout-index="${index}" ${reason || pending ? "disabled" : ""}><span>${escapeHtml(label)}</span><small>${escapeHtml(entry.path)}</small>${states.length ? `<small>${escapeHtml(states.join(" · "))}</small>` : ""}</button>`;
    }).join("");
    const bases = inspection.bases.map((base) => `<option value="${escapeHtmlAttribute(base.ref || base.name)}" ${(base.ref || base.name) === scope.checkout?.base ? "selected" : ""}>${escapeHtml(base.name)}${base.remote ? " · cached" : ""}</option>`).join("");
    const planned = scope.checkout?.newWorktree;
    menu.innerHTML = `${items}<hr><label class="checkout-checkbox"><input type="checkbox" id="newWorktree" ${planned ? "checked" : ""} ${pending ? "disabled" : ""}>New worktree</label>${planned ? `<label class="checkout-base">Base<select id="worktreeBase" ${pending || scope.checkout.planId ? "disabled" : ""}><option value="" ${!scope.checkout.base ? "selected" : ""}>Choose a base…</option>${bases}</select></label>` : ""}${relative && !explicitSubfolder ? `<hr><button type="button" id="separateSubfolder" ${pending ? "disabled" : ""}>Save as separate project</button>` : ""}`;
    menu.querySelectorAll("[data-checkout-index]").forEach((item) => {
      item.onclick = safely(async () => { await checkoutController.pick(inspection.worktrees[Number(item.dataset.checkoutIndex)]); void refreshSharedCheckout(scope); closeCheckoutMenu(); });
    });
    $("#newWorktree").onchange = safely(() => checkoutController.setNewWorktree($("#newWorktree").checked));
    if ($("#worktreeBase")) $("#worktreeBase").onchange = safely(() => checkoutController.setBase($("#worktreeBase").value));
    if ($("#separateSubfolder")) $("#separateSubfolder").onclick = safely(async () => {
      scope.separateSubfolder = true;
      scope.kind = "folder";
      delete scope.projectId;
      scope.label = relative.split("/").pop();
      await persistPendingNewThreadDraftDurably($("#newThreadPrompt").value, scope);
      scopeChanged(); renderCheckout(); closeCheckoutMenu();
    });
  }
  const sharing = !scope.checkout?.newWorktree && (state.sharedActive || checkoutSharingThreads(appState.threads, scope).some((thread) => appState.interactions.some((interaction) => String(interaction.threadId) === String(thread.id) && activeStatuses.has(interaction.completionStatus))));
  if (state.error || sharing) {
    notice.classList.remove("hidden");
    notice.innerHTML = `${escapeHtml((state.error?.message ? state.error.message + (state.changedCheckout ? ` Now ${state.changedCheckout.branch || "Detached HEAD"} · ${state.changedCheckout.commit?.slice(0, 12) || "No commit"}.` : "") : null) || "Another thread is active here. Files and repository state are shared.")}${state.changedCheckout ? ' <button type="button" id="acknowledgeCheckout">Use changed checkout</button>' : state.status === "failed" ? ' <button type="button" id="retryCheckoutNotice">Retry</button>' : ""}`;
    if ($("#acknowledgeCheckout")) $("#acknowledgeCheckout").onclick = safely(() => checkoutController.acknowledgeChange());
    if ($("#retryCheckoutNotice")) $("#retryCheckoutNotice").onclick = safely(() => selectCheckoutScope(scope));
  }
}
