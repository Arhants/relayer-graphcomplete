import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeObject, RelayerGraphClient, assetRef, css, html } from "../src/index.js";

const node = (key: string) => new NodeObject("info", key, "Fallback", "concept", key);
describe("node-owned HTML", () => {
  it("rejects the captured sibling loop before replacing a valid draft", () => {
    const answer = node("answer");
    const mechanism = node("mechanism");
    const page = html`<h2>The sky is blue</h2>`;
    const common = css`h2 { color: blue; }`;
    mechanism.detailAuthoring.setComponent("main", html`<p>Previous valid detail</p>`);
    answer.detailAuthoring.setComponent("main", page, common);
    const before = mechanism.detailAuthoring.checkpoint();
    expect(() => mechanism.detailAuthoring.setComponent("main", page, common)).toThrow(/detail_template_owner_mismatch/);
    expect(mechanism.detailAuthoring.checkpoint()).toEqual(before);
  });
});

describe("ownership lifetime and repair", () => {
  it("retains ownership through key changes, replacement, clear, copies, and wrappers", () => {
    const a = node("answer"), b = node("mechanism");
    const page = html`<p>Owned fragment</p>`;
    a.detailAuthoring.setComponent("main", page);
    a.detailAuthoring.setComponent("main", html`<p>Replacement</p>`);
    a.detailAuthoring.clear();
    expect(() => b.detailAuthoring.setComponent("other", page)).toThrow(/answer.*mechanism/);
    expect(() => b.detailAuthoring.setComponent("copy", { ...page })).toThrow(/detail_template_unrecognized/);
    expect(() => html`<section>${page}</section>`).toThrow(/detail_template_nested/);
    a.detailAuthoring.setComponent("restored", page);
    expect(a.detailAuthoring.checkpoint().components[0]?.html).toContain("Owned fragment");
  });

  it("permits shared resources and fresh helper output without comparing content", () => {
    const shared = css`p { color: blue; }`;
    const fresh = () => html`<p>Fresh markup</p>`;
    const asset = assetRef("shared-asset");
    for (const owner of [node("a"), node("b")]) {
      owner.detailAuthoring.setComponent("main", fresh(), shared);
      expect(owner.detailAuthoring.checkpoint().components[0]?.css).toContain("blue");
      expect(() => owner.detailAuthoring.setComponent("image", html`<img asset=${asset} alt="Shared illustration">`)).not.toThrow();
    }
  });
});

const graph = (nodeId = 1, url = "http://localhost:1234", token = "token") => new RelayerGraphClient({ url, nodeId, token });
describe("interaction-scoped replacement repair", () => {
  it("allows bound same-key replacement and replacement clients, but fences other scopes", async () => {
    const original = node("answer"), repair = node("answer");
    const page = html`<p>Reusable only by this logical node</p>`;
    original.detailAuthoring.setComponent("main", page);
    expect(() => repair.detailAuthoring.setComponent("main", page)).toThrow(/bindNode/);
    graph().bindNode(original);
    graph(1, "http://localhost:1234/", "rotated-token").bindNode(repair);
    repair.detailAuthoring.setComponent("main", page);
    expect(await graph().checkpointNodeDetail(repair)).toEqual(await graph().checkpointNodeDetail(original));
    for (const other of [graph(2), graph(1, "http://localhost:5678")]) {
      const stranger = other.bindNode(node("answer"));
      expect(() => stranger.detailAuthoring.setComponent("main", page)).toThrow(/detail_template_owner_mismatch/);
      await expect(other.checkpointNodeDetail(original)).rejects.toThrow(/detail_owner_scope_mismatch/);
    }
    Object.defineProperty(original, "clientKey", { value: "retargeted" });
    expect(() => graph().bindNode(original)).toThrow(/detail_owner_identity_changed/);
  });
});

describe("finalized ownership", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("checks scope before returning cached submit or checkpoint results", async () => {
    const owner = node("cached");
    owner.detailAuthoring.setComponent("main", html`<p>Cached result</p>`);
    const fetch = vi.fn(async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      return new Response(JSON.stringify({ node: { id: 2, kind: body.kind, icon: body.icon, title: body.title, detail: body.detail, state: "draft", authoredDetail: body.authoredDetail } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    const client = graph();
    await client.submitNode(owner);
    await client.submitNode(owner);
    await graph().checkpointNodeDetail(owner);
    await expect(graph(2).submitNode(owner)).rejects.toThrow(/scope_mismatch/);
    await expect(graph(2).checkpointNodeDetail(owner)).rejects.toThrow(/scope_mismatch/);
    // Even the original client's accepted promise cannot hide a changed subject.
    Object.assign(client.capability, { nodeId: 2 });
    await expect(client.submitNode(owner)).rejects.toThrow(/scope_mismatch/);
    await expect(client.checkpointNodeDetail(owner)).rejects.toThrow(/scope_mismatch/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
