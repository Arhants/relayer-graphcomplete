import { afterEach, describe, expect, it, vi } from "vitest";
import { PrimeVisualAuthoring } from "../src/implementations/prime-visual-authoring.js";

const capability = { url: "http://graph.test", token: "run-one", nodeId: 1 };
const request = () => ({ version: 1, objectId: "object-one", token: "run-one", nodeId: 1, operation: "submit",
  node: { clientKey: "answer", icon: "box", title: "Answer", detail: "Fallback", kind: "concept" },
  detail: { clear: false, components: [{ id: "main", markup: { strings: ["<h2>Answer</h2>"], values: [] }, styles: '[data-relayer-theme="light"] h2 { color: #182c34; } [data-relayer-theme="dark"] h2 { color: #edf2f3; }' }] },
});
const signal = () => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());
function graphTransport() {
  const bodies: Record<string, unknown>[] = [];
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    bodies.push(body);
    return Response.json({ node: { id: 2, state: "draft", ...body } });
  });
  vi.stubGlobal("fetch", fetch);
  return { bodies, fetch };
}
describe("Prime declarative visual authoring", () => {
  it("compiles canonically, shares concurrent submissions, and preserves frozen retries", async () => {
    const { bodies, fetch } = graphTransport();
    const bridge = new PrimeVisualAuthoring();
    const results = await Promise.all([bridge.execute(request(), capability, () => {}, signal()), bridge.execute(request(), capability, () => {}, signal())]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].ok).toBe(true);
    const checkpoint = await bridge.execute({ ...request(), operation: "checkpoint" }, capability, () => {}, signal());
    expect(checkpoint.value).toEqual(bodies[0]!.authoredDetail);
    expect(JSON.stringify(checkpoint.value)).toContain("data-relayer-theme");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodies[0]).toMatchObject({ authoredDetail: { version: 1, components: [{ id: "main", html: "<h2>Answer</h2>" }] } });
    const edited = request(); edited.node.title = "Changed";
    await expect(bridge.execute(edited, capability, () => {}, signal())).rejects.toThrow("detail_finalized");
  });
  it("rejects another run, unknown authority fields and oversized programs before transport", async () => {
    const { fetch } = graphTransport(); const bridge = new PrimeVisualAuthoring();
    await expect(bridge.execute({ ...request(), token: "old" }, capability, () => {}, signal())).rejects.toThrow("another run");
    expect(await bridge.execute({ ...request(), authoredDetail: {} }, capability, () => {}, signal())).toMatchObject({ ok: false, frozen: false });
    const huge = request(); huge.node.detail = "x".repeat(1024 * 1024);
    expect(await bridge.execute(huge, capability, () => {}, signal())).toMatchObject({ ok: false, frozen: false, message: "Visual authoring request exceeds 1 MiB" });
    expect(fetch).not.toHaveBeenCalled();
    expect(await bridge.execute(request(), capability, () => {}, signal())).toMatchObject({ ok: true });
  });
  it("retains, explicitly clears, or replaces a draft using fresh authored objects", async () => {
    const { bodies } = graphTransport(); const bridge = new PrimeVisualAuthoring();
    for (const clear of [false, true]) {
      const input = request(); input.objectId = String(clear); input.detail = { clear, components: [] };
      await bridge.execute(input, capability, () => {}, signal());
    }
    await bridge.execute(request(), capability, () => {}, signal());
    expect(Object.hasOwn(bodies[0]!, "authoredDetail")).toBe(false);
    expect(bodies[1]!.authoredDetail).toBe(null);
    expect(bodies[2]!.authoredDetail).toHaveProperty("integritySha256");
  });
  it("repairs compiler failure without freezing and rejects forged source membership", async () => {
    const { fetch } = graphTransport(); const bridge = new PrimeVisualAuthoring();
    const input = request(); input.detail.components[0]!.markup.strings = ["<script>alert(1)</script>"];
    expect(await bridge.execute(input, capability, () => {}, signal())).toMatchObject({ ok: false, frozen: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(await bridge.execute(request(), capability, () => {}, signal())).toMatchObject({ ok: true });
    const invalid = { ...request(), objectId: "wrong-owner", detail: { clear: false, components: [{ id: "main", styles: "", markup: { strings: ["<button gc=", ">Go</button>"], values: [{ kind: "action", key: "go", action: { kind: "invoke", label: "Go", interactionText: "Continue", clientKey: "go", sourceLayer: { clientKey: "root", nodes: ["other"] } } }] } }] } };
    expect(await bridge.execute(invalid, capability, () => {}, signal())).toMatchObject({ ok: false, frozen: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps a compiled package across transport failure and rejects edits", async () => {
    const { fetch, bodies } = graphTransport(); const bridge = new PrimeVisualAuthoring();
    fetch.mockRejectedValueOnce(new Error("lost response"));
    const first = new AbortController();
    expect(await bridge.execute(request(), capability, () => first.signal.throwIfAborted(), first.signal)).toMatchObject({ ok: false, frozen: true });
    first.abort("host request settled");
    expect(await bridge.execute(request(), capability, () => {}, signal())).toMatchObject({ ok: true, frozen: true });
    expect(fetch.mock.calls[1]![1].signal?.aborted).toBe(false);
    expect(bodies).toHaveLength(1);
  });
  it("fences authority again after asynchronous asset resolution and before node write", async () => {
    let active = true;
    vi.stubGlobal("fetch", vi.fn(async () => { active = false; return Response.json({ assets: [] }); }));
    const input = { ...request(), detail: { clear: false, components: [{ id: "main", styles: "", markup: { strings: ['<img asset=', ' alt="Proof">'], values: [{ kind: "asset", logicalId: "asset-one" }] } }] } };
    const result = await new PrimeVisualAuthoring().execute(input, capability, () => { if (!active) throw new Error("revoked"); }, signal());
    expect(result).toMatchObject({ ok: false, frozen: false, message: "revoked" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
