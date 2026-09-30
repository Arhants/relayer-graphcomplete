import { z } from "zod";
import { GraphApiError, LayerLayoutObject, LayerObject, NodePlacementObject, RelayerGraphClient, type EdgeRouteObject, type EdgeShape, type GraphCapability, type NodeSide } from "@relayer/graph-client";

const id = z.number().int().positive();
const point = { x: z.number(), y: z.number() };
const route = z.object({
  edgeId: id,
  shape: z.string().optional(),
  ends: z.array(z.object({ nodeId: id, side: z.string().optional() }).strict()).max(2).optional(),
  waypoints: z.array(z.object(point).strict()).max(64).optional(),
}).strict();
const request = z.object({
  version: z.literal(1), token: z.string(), nodeId: id,
  layer: z.object({
    clientKey: z.string().min(1).max(512),
    nodes: z.array(id).max(64),
    defaultNodeId: id.nullable().optional(),
    edges: z.array(id).max(512),
    layout: z.object({
      version: z.literal(1),
      placements: z.array(z.object({ nodeId: id, ...point }).strict()).max(64),
      edgeShape: z.string(),
      edgeRoutes: z.array(route).max(512).optional(),
    }).strict(),
    sizeJustification: z.string().nullable().optional(),
  }).strict(),
}).strict();

/**
 * Submits a Prime layer through the host's graph client, which writes its
 * draft preview into the turn's preview folder (PRD §11.10). A bounded Prime
 * kernel can read that folder but not write it. The graph server stays
 * authoritative; its rejections return to Python as data for repair. Prime's
 * kernel owns a reply's `status` key, so the HTTP status travels as `httpStatus`.
 */
export async function submitPrimeLayer(
  payload: unknown,
  capability: GraphCapability,
  active: () => void,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  active();
  let input: z.infer<typeof request>;
  try {
    if (Buffer.byteLength(JSON.stringify(payload) ?? "", "utf8") > 1024 * 1024) throw new Error("Layer request exceeds 1 MiB");
    input = request.parse(payload);
  } catch (error) {
    const message = error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : "Invalid layer request";
    return { ok: false, httpStatus: 400, error: { code: "invalid_request", message } };
  }
  if (input.token !== capability.token || input.nodeId !== capability.nodeId) throw new Error("The graph session belongs to another run");
  const { layer } = input;
  const routes = (layer.layout.edgeRoutes ?? []).map((value): EdgeRouteObject => ({
    edge: value.edgeId,
    ...(value.shape === undefined ? {} : { shape: value.shape as EdgeShape }),
    ...(value.ends === undefined ? {} : {
      ends: value.ends.map((end) => ({ node: end.nodeId, ...(end.side === undefined ? {} : { side: end.side as NodeSide }) })) as unknown as NonNullable<EdgeRouteObject["ends"]>,
    }),
    ...(value.waypoints === undefined ? {} : { waypoints: value.waypoints }),
  }));
  const native = new LayerObject(
    layer.nodes,
    layer.edges,
    new LayerLayoutObject(
      layer.layout.placements.map((placement) => new NodePlacementObject(placement.nodeId, placement.x, placement.y)),
      layer.layout.edgeShape as EdgeShape,
      routes,
    ),
    layer.clientKey,
    layer.defaultNodeId ?? undefined,
  );
  try {
    const value = await new RelayerGraphClient(capability, { beforeRequest: active, signal })
      .submitLayer(native, layer.sizeJustification == null ? {} : { sizeJustification: layer.sizeJustification });
    active();
    return { ok: true, value };
  } catch (error) {
    if (!(error instanceof GraphApiError)) throw error;
    return {
      ok: false,
      httpStatus: error.status,
      error: { code: error.code, ...(error.path === undefined ? {} : { path: error.path }), message: error.message, issues: error.issues },
    };
  }
}
