export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let toastTimer;
let appearance = "dark";
let systemAppearance;

// Light and Dark apply directly. System follows the operating system in place.
export function applyAppearance(value) {
  appearance = ["system", "light"].includes(value) ? value : "dark";
  if (!systemAppearance) {
    systemAppearance = matchMedia("(prefers-color-scheme: light)");
    systemAppearance.addEventListener("change", () => {
      if (appearance === "system") document.documentElement.dataset.theme = systemAppearance.matches ? "light" : "dark";
    });
  }
  const resolved = appearance === "system" ? (systemAppearance.matches ? "light" : "dark") : appearance;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem("relayerAppearance", resolved);
  $("#appearanceSelect").value = appearance;
}

export function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

export function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function toast(message, { actionLabel, onAction } = {}) {
  clearTimeout(toastTimer);
  const element = $("#toast");
  element.textContent = message;
  if (actionLabel && onAction) {
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = actionLabel;
    action.onclick = () => { clearTimeout(toastTimer); element.classList.add("hidden"); void onAction(); };
    element.append(action);
  }
  element.classList.remove("hidden");
  toastTimer = setTimeout(() => element.classList.add("hidden"), actionLabel ? 8_000 : 2_600);
}

export function threadTitle(prompt) {
  const firstLine = prompt.split("\n").find((line) => line.trim())?.trim() || "New thread";
  return firstLine.length > 54 ? `${firstLine.slice(0, 53)}…` : firstLine;
}
