import type { HarnessRunContext } from "../types.js";

/** Product eligibility only changes authoring guidance; graph and product own acceptance. */
export function threadIconGuidance(context: HarnessRunContext | undefined, language: "javascript" | "python"): string {
  if (context?.threadIconSelection?.eligible !== true) return "";
  const method = language === "javascript" ? "proposeThreadIcon" : "propose_thread_icon";
  return `This normal thread is eligible for its first topic icon. During ordinary graph authoring, choose the closest semantic name from the same supported Relayer icon library and guidance used for nodes, then call await graph.${method}("semantic-icon-name") before terminal graph.submit. Do not add a separate inference call for icon selection. The proposal commits only when this completion is accepted; drafts, failed or stopped work, and a model turn ending do not commit it. Once committed, the thread icon never changes. Missing or invalid selection keeps the default visible and permits a later execution to retry. Icon selection failure must not prevent otherwise valid graph work from being accepted.\n`;
}
