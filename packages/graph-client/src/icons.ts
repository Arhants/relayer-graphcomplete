/**
 * The curated icon vocabulary accepted by GraphComplete.
 *
 * Keep this list aligned with `relayer-graph-core` and the renderer module.
 * It is intentionally smaller than Lucide's complete export surface.
 */
export const RELAYER_ICON_NAMES = [
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
] as const;

export type RelayerIconName = typeof RELAYER_ICON_NAMES[number];

export const RELAYER_ICON_ALIASES = Object.freeze({
  "circle-alert": "alert-circle",
  "circle-help": "help-circle",
  "file-pen": "file-edit",
  messagecirclequestion: "message-circle-question",
  messagessquare: "messages-square",
} satisfies Readonly<Record<string, RelayerIconName>>);

// Presentation-only node families (visual redesign brief §3.3, Appendix A). Each coloured family gives a
// node its disc colour; every other icon is a neutral signal icon (status, warning, confirmation, pointer).
export const RELAYER_ICON_FAMILY_GROUPS = Object.freeze([
  { family: "f1", label: "Documents and writing", icons: ["archive", "book-open", "book-open-text", "clipboard", "copy", "file", "file-edit", "file-output", "file-search", "file-text", "library", "pencil-line", "scroll-text"] },
  { family: "f2", label: "Code and components", icons: ["blocks", "braces", "code", "component", "file-code", "file-code-2", "folder-git-2", "function-square", "git-branch", "git-branch-plus", "git-commit", "git-compare", "git-graph", "git-merge", "git-pull-request", "package", "puzzle", "terminal"] },
  { family: "f3", label: "Data, structure and layouts", icons: ["bar-chart-3", "box", "boxes", "columns-3", "database", "database-backup", "folder", "folder-tree", "folders", "frame", "grid-3x3", "layers", "layout", "layout-grid", "layout-panel-left", "layout-template", "list", "list-ordered", "list-tree", "panels-top-left", "pie-chart", "square-dashed-kanban", "table"] },
  { family: "f4", label: "Systems, services and security", icons: ["cloud", "cog", "cpu", "globe", "hard-drive", "key", "lock", "monitor", "network", "plug", "radio", "rss", "satellite", "server", "server-cog", "settings", "shield", "smartphone", "webhook", "wifi", "wrench"] },
  { family: "f5", label: "People, agents and conversation", icons: ["bot", "mail", "messages-square", "mic", "send", "share-2", "user", "users"] },
  { family: "f6", label: "Reasoning, ideas and process", icons: ["bolt", "brain", "compass", "palette", "route", "search", "sprout", "star", "workflow", "zap"] },
] as const satisfies ReadonlyArray<{ family: string; label: string; icons: readonly RelayerIconName[] }>);

export type RelayerIconFamily = typeof RELAYER_ICON_FAMILY_GROUPS[number]["family"] | "neutral";

export const RELAYER_ICON_FAMILIES: Readonly<Record<string, RelayerIconFamily>> = Object.freeze(Object.fromEntries(
  RELAYER_ICON_FAMILY_GROUPS.flatMap(({ family, icons }) => icons.map((icon) => [icon, family])),
));

const relayerIconNameSet: ReadonlySet<string> = new Set(RELAYER_ICON_NAMES);

export function normalizeRelayerIconName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_\s]+/g, "-").replace(/^-|-$/g, "");
}

export function resolveRelayerIconName(name?: string | null): RelayerIconName | null {
  if (name === undefined || name === null) return null;
  const normalized = normalizeRelayerIconName(name);
  if (relayerIconNameSet.has(normalized)) return normalized as RelayerIconName;
  return Object.hasOwn(RELAYER_ICON_ALIASES, normalized)
    ? RELAYER_ICON_ALIASES[normalized as keyof typeof RELAYER_ICON_ALIASES]
    : null;
}

export function isRelayerIconName(name?: string | null): name is RelayerIconName {
  return name !== undefined && name !== null && relayerIconNameSet.has(name);
}

export function isSupportedRelayerIcon(name?: string | null): boolean {
  return resolveRelayerIconName(name) !== null;
}

export function relayerIconFamily(name?: string | null): RelayerIconFamily {
  const resolved = resolveRelayerIconName(name);
  return (resolved && RELAYER_ICON_FAMILIES[resolved]) || "neutral";
}
