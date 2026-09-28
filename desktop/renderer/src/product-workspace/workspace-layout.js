const STORAGE_KEY = "relayerWorkspaceSplitV1";
export function validWorkspaceRatio(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.2 && value <= 0.8;
}

/** Presentation-only preference. Desktop's bridge survives random loopback ports. */
export function createWorkspaceLayout(root, owner) {
  const find = (selector) => root.querySelector(selector);
  const layout = find(".workspace-layout");
  const divider = find("#workspaceDivider");
  const panel = find("#environmentPanel");
  const toggle = find("#environmentToggle");
  const document = layout.ownerDocument;
  const bridge = owner?.relayerDesktop?.workspaceLayout ?? owner?.relayerEvalReview?.workspaceLayout;
  let ratio = 0.5;
  let edited = false;
  let disposed = false;
  let dragging = false;
  let pointerId = null;
  let writes = Promise.resolve();
  try {
    const saved = JSON.parse(owner?.localStorage?.getItem(STORAGE_KEY) ?? "null");
    if (validWorkspaceRatio(saved)) ratio = saved;
  } catch { /* Unavailable presentation storage retains the default. */ }
  function apply() {
    layout.style.setProperty("--graph-share", `${ratio * 100}%`);
    divider.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
  }
  apply();
  if (bridge) {
    Promise.resolve().then(() => bridge.read()).then((saved) => {
      if (!disposed && !edited && validWorkspaceRatio(saved)) { ratio = saved; apply(); }
    }).catch(() => {});
  }
  function setRatio(value) {
    const width = Math.max(1, layout.getBoundingClientRect().width - 12);
    const minimum = Math.min(0.5, Math.max(0.2, 280 / width));
    ratio = Math.max(minimum, Math.min(1 - minimum, value));
    edited = true;
    apply();
  }
  function persist() {
    const value = ratio;
    try { owner?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Best effort. */ }
    if (bridge) writes = writes.catch(() => {}).then(() => bridge.set(value)).catch(() => {});
  }
  divider.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    pointerId = event.pointerId;
    divider.setPointerCapture?.(event.pointerId);
  };
  divider.onpointermove = (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const rect = layout.getBoundingClientRect();
    setRatio((event.clientX - rect.left - 6) / Math.max(1, rect.width - 12));
  };
  const finishDrag = (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    persist();
  };
  // The divider moves under the pointer. End the gesture even when release is
  // retargeted outside it or capture is lost during a native window transition.
  divider.onpointerup = divider.onpointercancel = divider.onlostpointercapture = finishDrag;
  document.addEventListener("pointerup", finishDrag, true);
  document.addEventListener("pointercancel", finishDrag, true);
  divider.onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    setRatio(ratio + (event.key === "ArrowLeft" ? -0.02 : 0.02));
    persist();
  };
  function closeEnvironment({ focus = false } = {}) {
    panel?.classList.add("hidden");
    toggle?.setAttribute("aria-expanded", "false");
    if (focus) toggle?.focus();
  }
  if (toggle) toggle.onclick = () => {
    const open = panel?.classList.contains("hidden");
    panel?.classList.toggle("hidden", !open);
    toggle.setAttribute("aria-expanded", String(Boolean(open)));
    if (open) find("#closeEnvironment")?.focus();
  };
  if (find("#closeEnvironment")) find("#closeEnvironment").onclick = () => closeEnvironment({ focus: true });
  const escape = (event) => {
    if (event.key !== "Escape" || !panel || panel.classList.contains("hidden")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeEnvironment({ focus: true });
  };
  const outside = (event) => {
    if (!panel?.contains(event.target) && !toggle?.contains(event.target)) closeEnvironment();
  };
  document.addEventListener("keydown", escape, true);
  document.addEventListener("pointerdown", outside, true);
  return {
    closeEnvironment,
    dispose() {
      disposed = true;
      document.removeEventListener("pointerup", finishDrag, true);
      document.removeEventListener("pointercancel", finishDrag, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", outside, true);
      divider.onpointerdown = divider.onpointermove = divider.onpointerup = divider.onpointercancel = divider.onlostpointercapture = divider.onkeydown = null;
    },
  };
}
