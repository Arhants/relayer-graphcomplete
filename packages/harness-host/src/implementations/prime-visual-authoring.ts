import { z } from "zod";
import { assetRef, DetailCompilationError, css, detailCapability, html, LayerLayoutObject, LayerObject, NodeObject, RelayerGraphClient, type ActionObject, type GraphCapability } from "@relayer/graph-client";

const identity = z.string().min(1).max(128).refine((value) => value === value.trim() && !value.includes("\0") && Buffer.byteLength(value) <= 128, "Identity must be trimmed, NUL-free, and at most 128 UTF-8 bytes");
const layer = z.object({ clientKey: identity, nodes: z.array(identity).max(8) }).strict();
const presentation = { variant: z.enum(["chip", "pill", "wide", "card"]).optional(), icon: z.string().optional(), description: z.string().optional() };
const common = { clientKey: identity, label: z.string(), sourceLayer: layer, ...presentation };
const action = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("navigate"), sourceLayer: layer.optional(), relation: z.enum(["expand", "reference"]), target: z.union([z.number().int().positive(), layer]) }).strict(),
  z.object({ ...common, kind: z.literal("invoke"), interactionText: z.string() }).strict(),
  z.object({ ...common, kind: z.literal("input"), control: z.enum(["text", "single_select", "multi_select"]), prompt: z.string(), options: z.array(z.object({ key: z.string(), label: z.string() }).strict()).max(50).optional(), minimumSelections: z.number().int().optional() }).strict(),
]);
const binding = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("asset"), logicalId: identity }).strict(),
  z.object({ kind: z.literal("link"), key: identity, href: z.string() }).strict(),
  z.object({ kind: z.literal("action"), key: identity, action }).strict(),
]);
const template = z.object({ strings: z.array(z.string()).min(1).max(129), values: z.array(binding).max(128) }).strict()
  .refine((value) => value.strings.length === value.values.length + 1, "Template must have one more string than bindings");
const request = z.object({
  version: z.literal(1), objectId: identity, token: z.string(), nodeId: z.number().int().positive(),
  operation: z.enum(["checkpoint", "submit", "replace"]),
  replacement: z.object({ nodeId: z.number().int().positive(), expectedRevision: z.number().int().nonnegative() }).strict().optional(),
  node: z.object({ clientKey: identity, icon: z.string(), title: z.string(), detail: z.string(), kind: z.string() }).strict(),
  detail: z.object({ clear: z.boolean(), components: z.array(z.object({ id: identity, markup: template, styles: z.string() }).strict()).max(64) }).strict(),
}).strict();

interface Submission {
  readonly signature: string;
  readonly node: NodeObject;
  readonly client: RelayerGraphClient;
  locked: boolean;
  transport: { active: () => void; signal: AbortSignal };
  inFlight?: Promise<Record<string, unknown>>;
}
export class PrimeVisualAuthoring {
  private readonly submissions = new Map<string, Submission>();
  private bytes = 0;
  /** Only declarative authoring crosses this boundary. Graph core remains authoritative. */
  async execute(payload: unknown, capability: GraphCapability, active: () => void, signal: AbortSignal): Promise<Record<string, unknown>> {
    active();
    let input: z.infer<typeof request>;
    try {
      if (Buffer.byteLength(JSON.stringify(payload) ?? "", "utf8") > 1024 * 1024) throw new Error("Visual authoring request exceeds 1 MiB");
      input = request.parse(payload);
    } catch (error) {
      return authoringFailure(error, false);
    }
    if (input.token !== capability.token || input.nodeId !== capability.nodeId) throw new Error("The graph session belongs to another run");
    if ((input.operation === "replace") !== (input.replacement !== undefined)) return authoringFailure(new Error("Replacement target is required only for replacement operations"), false);
    const signature = JSON.stringify({ node: input.node, detail: input.detail });
    const existing = this.submissions.get(input.objectId);
    if (existing !== undefined && input.operation !== "replace") {
      if (existing.signature !== signature) throw new Error("detail_finalized: create a fresh NodeObject to replace a draft");
      if (input.operation === "checkpoint") {
        const value = await existing.client.checkpointNodeDetail(existing.node);
        active();
        return { ok: true, value, frozen: existing.locked };
      }
      return this.submit(existing, active, signal);
    }
    const node = new NodeObject(input.node.icon, input.node.title, input.node.detail, input.node.kind, input.node.clientKey);
    const makeLayer = (value: z.infer<typeof layer>): LayerObject => new LayerObject(
      value.nodes.map((key) => key === node.clientKey ? node : new NodeObject("", "", "", "concept", key)),
      [], new LayerLayoutObject([], "default"), value.clientKey,
    );
    const makeBinding = (value: z.infer<typeof binding>): unknown => {
      if (value.kind === "asset") return assetRef(value.logicalId);
      if (value.kind === "link") return detailCapability.externalLink(value.key, value.href);
      const declaration = value.action;
      const native = { ...declaration, ...(declaration.sourceLayer === undefined ? {} : { sourceLayer: makeLayer(declaration.sourceLayer) }),
        ...(declaration.kind === "navigate" ? { target: typeof declaration.target === "number" ? declaration.target : makeLayer(declaration.target) } : {}),
      } as ActionObject;
      if (native.kind === "invoke") return detailCapability.invoke(value.key, native);
      if (native.kind === "input") return detailCapability.input(value.key, native);
      return native.relation === "expand" ? detailCapability.expand(value.key, { ...native, relation: "expand" }) : detailCapability.reference(value.key, { ...native, relation: "reference" });
    };
    if (input.detail.clear) node.detailAuthoring.clear();
    for (const component of input.detail.components) {
      const strings = Object.assign([...component.markup.strings], { raw: [...component.markup.strings] });
      const styles = Object.assign([component.styles], { raw: [component.styles] });
      node.detailAuthoring.setComponent(component.id, html(strings, ...component.markup.values.map(makeBinding)), css(styles));
    }
    if (input.operation === "replace") {
      try {
        await new RelayerGraphClient(capability, { beforeRequest: active, signal }).replaceNodePresentation(input.replacement!.nodeId, input.replacement!.expectedRevision, node);
        active();
        return { ok: true, value: null, frozen: false };
      } catch (error) {
        return authoringFailure(error, false);
      }
    }
    if (input.operation === "checkpoint") {
      try {
        const value = await new RelayerGraphClient(capability, { beforeRequest: active, signal }).checkpointNodeDetail(node);
        active();
        return { ok: true, value, frozen: false };
      } catch (error) {
        return authoringFailure(error, false);
      }
    }
    const bytes = Buffer.byteLength(signature);
    if (this.submissions.size >= 256 || this.bytes + bytes > 16 * 1024 * 1024) throw new Error("Visual authoring run exceeds its bounded submission cache");
    const entry: Submission = {
      node, signature, locked: false, transport: { active, signal },
      client: new RelayerGraphClient(capability, { beforeRequest: (path) => {
        entry.transport.active();
        if (path === "/api/graph/nodes") entry.locked = true;
      }, get signal() { return entry.transport.signal; } }),
    };
    this.submissions.set(input.objectId, entry);
    this.bytes += bytes;
    const result = await this.submit(entry, active, signal);
    if (!entry.locked) {
      this.submissions.delete(input.objectId);
      this.bytes -= bytes;
    }
    return result;
  }

  private async submit(entry: Submission, active: () => void, signal: AbortSignal): Promise<Record<string, unknown>> {
    active();
    if (entry.inFlight !== undefined) return entry.inFlight;
    entry.transport = { active, signal };
    const work = this.submitOnce(entry, active);
    entry.inFlight = work;
    try { return await work; }
    finally { delete entry.inFlight; }
  }

  private async submitOnce(entry: Submission, active: () => void): Promise<Record<string, unknown>> {
    try {
      active();
      const value = await entry.client.submitNode(entry.node);
      active();
      return { ok: true, value, frozen: true };
    } catch (error) {
      return authoringFailure(error, entry.locked);
    }
  }
}

function authoringFailure(error: unknown, frozen: boolean): Record<string, unknown> {
  return { ok: false, frozen,
    message: error instanceof Error ? error.message : "Visual authoring failed",
    ...(error instanceof DetailCompilationError ? { issues: error.issues } : {}),
  };
}
