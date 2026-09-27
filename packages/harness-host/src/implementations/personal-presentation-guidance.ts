import type { ResolvedPersonalPresentation } from "@relayer/graph-client";
import type { HarnessRunContext } from "../types.js";

export function renderPersonalPresentationGuidance(
  presentation: ResolvedPersonalPresentation,
): string {
  if (presentation.attachment.versionInteractionNodeId !== presentation.graph.nodeId) {
    throw new Error("Personal presentation attachment does not match the resolved version interaction");
  }
  if (presentation.attachment.rootLayerId !== presentation.graph.rootLayerId) {
    throw new Error("Personal presentation attachment does not match the resolved root layer");
  }
  const seenLayers = new Set<number>();
  const seenNodes = new Set<number>();
  const preferences: string[] = [];
  for (const resolved of presentation.graph.layers) {
    if (resolved.layer.state !== "accepted" || !seenLayers.add(resolved.layer.id)) {
      throw new Error("Personal presentation contains a duplicate or non-accepted layer");
    }
    if (resolved.layer.nodes.length !== resolved.nodes.length
      || resolved.layer.nodes.some((id, index) => id !== resolved.nodes[index]?.id)) {
      throw new Error("Personal presentation layer membership is not canonical");
    }
    for (const node of resolved.nodes) {
      if (node.state !== "accepted" || !seenNodes.add(node.id)) {
        throw new Error("Personal presentation contains a duplicate or non-accepted node");
      }
      if (node.kind !== "presentation-preference") continue;
      const title = node.title.trim();
      const detail = renderedPreferenceDetail(node.title.trim(), node.detail.trim());
      if (title === "" || detail === "") {
        throw new Error("Personal presentation preference title and detail are required");
      }
      preferences.push(`${title}: ${detail}`);
    }
  }
  return preferences.length === 0
    ? ""
    : `Personal graph presentation preferences:\n\n${preferences.join("\n\n")}`;
}

export function personalPresentationPrompt(context: HarnessRunContext): string {
  if (context.personalPresentation === undefined) return "";
  const rendered = renderPersonalPresentationGuidance(context.personalPresentation);
  if (rendered === "") return "";
  return `\n\n${rendered}\n\n${personalPresentationAuthority}`;
}

export function personalPresentationNativeInstructions(context: HarnessRunContext): string {
  if (context.personalPresentation === undefined) return "";
  const rendered = renderPersonalPresentationGuidance(context.personalPresentation);
  if (rendered === "") return "";
  return `If you are the root agent, include the exact rendered Personal graph presentation preferences block from the current root task only when assigning a native child to author graph content. Include the available presentation capabilities, publication contract, public visual authoring reference, and relevant language-specific public API recipes from the current root task in that authoring handoff, including its supplied client module reference when present. Never include that block in an unrelated delegate's task. If you are a native child, apply personal presentation preferences only when that exact rendered block is present in your assigned task; otherwise do not infer, retrieve, or apply them. ${personalPresentationAuthority}`;
}

export function personalPresentationTraceValues(context: HarnessRunContext): {
  readonly exactBlock: string;
  readonly legacyBlocks: readonly string[];
  readonly fragments: readonly string[];
} | undefined {
  const presentation = context.personalPresentation;
  if (presentation === undefined) return undefined;
  const rendered = renderPersonalPresentationGuidance(presentation);
  if (rendered === "") return undefined;
  const fragments = new Set<string>();
  const legacyPreferences: string[] = [];
  for (const resolved of presentation.graph.layers) {
    for (const node of resolved.nodes) {
      if (node.kind !== "presentation-preference") continue;
      const title = node.title.trim();
      const detail = renderedPreferenceDetail(node.title.trim(), node.detail.trim());
      const rawDetail = node.detail.trim();
      legacyPreferences.push(`${title}: ${rawDetail}`);
      fragments.add(`${title}: ${rawDetail}`);
      fragments.add(rawDetail);
      fragments.add(`${title}: ${detail}`);
      fragments.add(title);
      fragments.add(detail);
    }
  }
  const legacyBlock = `Personal graph presentation preferences:\n\n${legacyPreferences.join("\n\n")}`;
  return {
    exactBlock: rendered,
    legacyBlocks: legacyBlock === rendered ? [] : [legacyBlock],
    fragments: [...fragments].filter((value) => value !== "")
      .sort((left, right) => right.length - left.length),
  };
}

const personalPresentationAuthority = "Graph integrity and authority remain mandatory. An explicit user presentation request takes precedence over these attached preferences, and these preferences take precedence over provider or model defaults. Apply the same pinned preferences to the root agent and every native child that can author graph content for this interaction. Do not pass them to unrelated delegated agents.";

// Published V3 records are immutable. Normalize only the exact built-in legacy
// text, leaving arbitrary user preferences untouched and the stored pin unchanged.
const legacyVisualPreference = "Author a compiled visual Node Detail for every node you create; do not leave any authored node on plain Markdown alone. Import the exported html, css, and detailCapability helpers. At minimum, call node.detailAuthoring.setComponent(\"main\", html`<section><h2>Summary</h2><p>Details</p></section>`, css`section { display: grid; gap: 0.75rem; }`), await graph.checkpointNodeDetail(node), and then await graph.submitNode(node). When a node has actions, create each stable action object with its sourceLayer before checkpointing, bind that same object in the page with the matching detailCapability helper, and pass it to graph.addAction after submitting the layer. Keep every authored page self-contained, keyboard operable, and accessible. Mount every action belonging to the node inside its detail page.";

function renderedPreferenceDetail(title: string, detail: string): string {
  return title === "Authored visual Node Details" && detail === legacyVisualPreference
    ? "Author a compiled visual Node Detail for every node you create; do not leave any authored node on plain Markdown alone. Use the active harness client to author and checkpoint components before submitting the node. When a node has actions, create each stable action object with its exact source layer before checkpointing, bind that same object in the page, and add it to the graph after submitting the layer. Keep every authored page self-contained, keyboard operable, and accessible. Mount every action belonging to the node inside its detail page."
    : detail;
}
