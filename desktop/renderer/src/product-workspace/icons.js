/**
 * Curated Relayer icon rendering for the vanilla desktop workspace.
 *
 * The allowlist is the product grammar. Lucide is only the drawing library;
 * exposing its entire catalog here would silently broaden what authors can
 * persist. Unknown names can still occur in legacy accepted graphs and render
 * as a neutral circle rather than breaking replay.
 */
export const RELAYER_ICON_NAMES = Object.freeze([
  "alert-circle",
  "alert-triangle",
  "archive",
  "arrow-right-circle",
  "arrow-right-left",
  "bar-chart-3",
  "bell",
  "book-open",
  "book-open-text",
  "boxes",
  "brain",
  "blocks",
  "bolt",
  "bot",
  "box",
  "braces",
  "check-circle",
  "clipboard-check",
  "clipboard",
  "cloud",
  "code",
  "cog",
  "columns-3",
  "component",
  "compass",
  "copy",
  "credit-card",
  "cpu",
  "database-backup",
  "database",
  "file",
  "file-code-2",
  "file-code",
  "file-edit",
  "file-output",
  "file-search",
  "file-text",
  "folder-git-2",
  "folder-tree",
  "folder",
  "folders",
  "frame",
  "function-square",
  "git-branch",
  "git-branch-plus",
  "git-commit",
  "git-compare",
  "git-graph",
  "git-merge",
  "git-pull-request",
  "globe",
  "grid-3x3",
  "hard-drive",
  "heart",
  "help-circle",
  "info",
  "key",
  "layers",
  "library",
  "layout",
  "layout-panel-left",
  "layout-template",
  "layout-grid",
  "link-2",
  "link",
  "list-checks",
  "list-tree",
  "list",
  "list-ordered",
  "loader",
  "lock",
  "mail",
  "message-circle-question",
  "messages-square",
  "menu",
  "mic",
  "monitor",
  "network",
  "package",
  "palette",
  "panels-top-left",
  "pencil-line",
  "pie-chart",
  "play-circle",
  "plug",
  "puzzle",
  "radio",
  "rotate-ccw",
  "route",
  "rss",
  "satellite",
  "scroll-text",
  "search",
  "send",
  "server",
  "server-cog",
  "settings",
  "share-2",
  "shield-alert",
  "shield-check",
  "shield",
  "smartphone",
  "sprout",
  "square-dashed-kanban",
  "square",
  "star",
  "table",
  "terminal",
  "upload",
  "user",
  "users",
  "webhook",
  "wifi",
  "workflow",
  "wrench",
  "zap",
  // Temporary everyday icons until #613 settles the wider vocabulary.
  "wallet",
  "calendar",
  "clock",
  "plane",
  "train-front",
  "car",
  "map-pin",
  "landmark",
  "bed-double",
  "utensils",
  "coffee",
  "shopping-cart",
]);

export const RELAYER_ICON_ALIASES = Object.freeze({
  "circle-alert": "alert-circle",
  "circle-help": "help-circle",
  "file-pen": "file-edit",
  messagecirclequestion: "message-circle-question",
  messagessquare: "messages-square",
});

export const RELAYER_ICON_FALLBACK = "circle";

// Presentation-only node families (design brief §3.3, Appendix A); the disc colour comes from the design.
const RELAYER_ICON_FAMILY_MEMBERS = Object.freeze({
  f1: ["archive", "book-open", "book-open-text", "clipboard", "copy", "file", "file-edit", "file-output", "file-search", "file-text", "library", "pencil-line", "scroll-text"],
  f2: ["blocks", "braces", "code", "component", "file-code", "file-code-2", "folder-git-2", "function-square", "git-branch", "git-branch-plus", "git-commit", "git-compare", "git-graph", "git-merge", "git-pull-request", "package", "puzzle", "terminal"],
  f3: ["bar-chart-3", "box", "boxes", "columns-3", "database", "database-backup", "folder", "folder-tree", "folders", "frame", "grid-3x3", "layers", "layout", "layout-grid", "layout-panel-left", "layout-template", "list", "list-ordered", "list-tree", "panels-top-left", "pie-chart", "square-dashed-kanban", "table", "wallet", "calendar", "clock"],
  f4: ["cloud", "cog", "cpu", "globe", "hard-drive", "key", "lock", "monitor", "network", "plug", "radio", "rss", "satellite", "server", "server-cog", "settings", "shield", "smartphone", "webhook", "wifi", "wrench", "plane", "train-front", "car", "map-pin", "landmark"],
  f5: ["bot", "mail", "messages-square", "mic", "send", "share-2", "user", "users", "bed-double", "utensils", "coffee", "shopping-cart"],
  f6: ["bolt", "brain", "compass", "palette", "route", "search", "sprout", "star", "workflow", "zap"],
});
export const RELAYER_ICON_FAMILIES = Object.freeze(Object.fromEntries(
  Object.entries(RELAYER_ICON_FAMILY_MEMBERS).flatMap(([family, names]) => names.map((name) => [name, family])),
));

export function relayerIconFamily(name) {
  return RELAYER_ICON_FAMILIES[resolveRelayerIconName(name)] ?? "neutral";
}

const relayerIconNameSet = new Set(RELAYER_ICON_NAMES);

export function normalizeRelayerIconName(name) {
  return String(name ?? "").trim().toLowerCase().replace(/[-_\s]+/g, "-").replace(/^-|-$/g, "");
}

export function resolveRelayerIconName(name) {
  const normalized = normalizeRelayerIconName(name);
  if (relayerIconNameSet.has(normalized)) return normalized;
  return Object.hasOwn(RELAYER_ICON_ALIASES, normalized)
    ? RELAYER_ICON_ALIASES[normalized]
    : null;
}

export function relayerIconDescriptor(name) {
  const canonicalName = resolveRelayerIconName(name);
  const renderedName = canonicalName ?? RELAYER_ICON_FALLBACK;
  return Object.freeze({
    canonicalName,
    renderedName,
    lucideExportName: toPascalCase(renderedName),
    usesFallback: canonicalName === null,
  });
}

export function createRelayerIcon(name, attributes = {}) {
  const descriptor = relayerIconDescriptor(name);
  const lucide = assertRelayerIconRendererReady();
  const iconNode = lucide[descriptor.lucideExportName] ?? lucide.Circle;
  return lucide.createElement(iconNode, {
    "aria-hidden": "true",
    focusable: "false",
    ...attributes,
    "data-relayer-icon": descriptor.renderedName,
  });
}

// Fixed product glyphs (such as thread status marks) that are not node icons.
export function createLucideIcon(exportName, attributes = {}) {
  const lucide = assertRelayerIconRendererReady();
  return lucide.createElement(lucide[exportName] ?? lucide.Circle, { "aria-hidden": "true", focusable: "false", ...attributes });
}

export function assertRelayerIconRendererReady() {
  const lucide = globalThis.lucide;
  if (typeof lucide?.createElement !== "function" || !lucide.Circle) {
    throw new Error("The vendored Lucide renderer must load before Relayer icons are created.");
  }
  return lucide;
}

function toPascalCase(name) {
  return name.replace(/(\w)(\w*)(_|-|\s*)/g, (_match, first, rest) =>
    first.toUpperCase() + rest.toLowerCase());
}
