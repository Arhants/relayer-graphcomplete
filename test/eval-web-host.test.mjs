import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore } from "../desktop/main/services/settings-store.mjs";
import { readFile, access, mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, request as httpRequest } from "node:http";
import { createEvalDashboard, createReviewSurface, openHumanReview } from "../desktop/eval-main/web-host.mjs";

const opened = [];
afterEach(async () => { await Promise.all(opened.splice(0).map((surface) => surface.close())); });
const authorized = (surface, extra = {}) => ({ Authorization: `Bearer ${new URL(surface.url).hash.slice(1)}`, ...extra });
const context = { readOnly: true, executionId: "e1", cases: [{ executionId: "e1", threadIds: [7] }] };

describe("Eval localhost authority", () => {
  it("authenticates dashboard operations and rejects foreign origins, hosts and encoded API paths", async () => {
    const surface = await createEvalDashboard({ service: { listRuns: () => [{ id: "run" }] }, rendererDirectory: "desktop/eval-renderer" });
    opened.push(surface);
    const request = (headers = {}, path = "/eval-api/listRuns") => fetch(surface.origin + path, { method: "POST", headers, body: "[]" });
    expect((await request()).status).toBe(401);
    expect((await request(authorized(surface, { Origin: "https://example.com" }))).status).toBe(403);
    const hostileHostStatus = await new Promise((resolve, reject) => {
      const req = httpRequest(surface.origin + "/eval-api/listRuns", { method: "POST", headers: { Host: "attacker.example" } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on("error", reject); req.end("[]");
    });
    expect(hostileHostStatus).toBe(403);
    expect((await request(authorized(surface), "/%65val-api/listRuns")).status).toBe(400);
    expect(await (await request(authorized(surface))).json()).toEqual([{ id: "run" }]);
    expect((await request(authorized(surface), "/eval-api/constructor")).status).toBe(404);
    const html = await fetch(surface.origin).then((response) => response.text());
    expect(html).toContain('/eval-bridge.js');
    expect(html).not.toContain(new URL(surface.url).hash.slice(1));
  });

  it("keeps human capabilities separate and forwards only fixed read-only and scoped annotation credentials", async () => {
    const seen = [];
    const upstream = createServer((request, response) => {
      seen.push({ cookie: request.headers.cookie, authorization: request.headers.authorization, url: request.url });
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Set-Cookie", "control=must-not-escape");
      response.end('{"ok":true}');
    });
    await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    opened.push({ close: () => new Promise((resolve) => { upstream.close(resolve); upstream.closeAllConnections(); }) });
    const productSession = { origin: `http://127.0.0.1:${upstream.address().port}`, cookie: { name: "control", value: "secret" }, readOnlyCookie: { name: "read", value: "readonly" } };
    const human = await createReviewSurface({ productSession, context, annotationToken: "human-7" });
    const judge = await createReviewSurface({ productSession, context });
    opened.push(human, judge);
    expect((await fetch(judge.origin + "/eval-api/context", { headers: authorized(human) })).status).toBe(401);
    const send = (surface, path) => fetch(surface.origin + path, { method: "POST", headers: authorized(surface, { Cookie: "control=secret; relayer_annotation=forged" }), body: "{}" });
    expect((await send(judge, "/api/threads/7/annotations")).status).toBe(403);
    expect((await send(human, "/api/threads/8/annotations")).status).toBe(403);
    expect((await send(human, "/api/threads/7/interactions")).status).toBe(403);
    expect((await send(human, "/api/internal/annotation-sessions")).status).toBe(403);
    const response = await send(human, "/api/threads/7/annotations");
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(seen).toEqual([{ cookie: "read=readonly; relayer_annotation=human-7", authorization: undefined, url: "/api/threads/7/annotations" }]);
    await fetch(judge.origin + "/api/threads/7", { headers: authorized(judge, { Cookie: "control=secret" }) });
    expect(seen.at(-1).cookie).toBe("read=readonly");
  });
});

it("imports uploaded bytes through a private temporary file and removes it after parsing", async () => {
  let uploadedPath;
  const content = '{"kind":"conversation"}\n';
  const surface = await createEvalDashboard({ rendererDirectory: "desktop/eval-renderer", service: {
    importConversation: async (path) => { uploadedPath = path; return { content: await readFile(path, "utf8") }; },
  } });
  opened.push(surface);
  const response = await fetch(surface.origin + "/eval-api/import", { method: "POST", headers: authorized(surface), body: content });
  expect(await response.json()).toEqual({ content });
  // Cleanup finishes after the response has been written.
  await expect.poll(async () => {
    try { await access(uploadedPath); return true; }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
  }).toBe(false);
});

it("reopening a growing run snapshots a new roster without widening old review tabs", async () => {
  let roster = [7];
  const scopes = [];
  const options = {
    executionId: "e1", assertRunning: () => {},
    reviewContext: () => ({ readOnly: true, cases: [{ executionId: "e1", threadIds: [...roster] }] }),
    productSession: async () => ({ origin: "http://127.0.0.1:1", readOnlyCookie: { name: "read", value: "only" } }),
    registerAnnotations: async (_session, scope) => scopes.push(scope),
  };
  const first = await openHumanReview(options); opened.push(first);
  roster = [7, 8];
  const second = await openHumanReview(options); opened.push(second);
  const read = (surface) => fetch(surface.origin + "/eval-api/context", { headers: authorized(surface) }).then((response) => response.json());
  expect((await read(first)).cases[0].threadIds).toEqual([7]);
  expect((await read(second)).cases[0].threadIds).toEqual([7, 8]);
  expect(scopes.map(({ threadIds }) => threadIds)).toEqual([[7], [7, 8]]);
  expect(scopes[0].token).not.toBe(scopes[1].token);
  expect((await fetch(first.origin + "/api/threads/8/annotations", {
    method: "POST", headers: authorized(first), body: "{}",
  })).status).toBe(403);
});

it("does not create a review surface when shutdown starts during annotation registration", async () => {
  let stopping = false;
  let finish;
  let entered;
  const registering = new Promise((resolve) => { entered = resolve; });
  const pending = openHumanReview({
    executionId: "e1", reviewContext: () => context,
    productSession: async () => ({ origin: "http://127.0.0.1:1", readOnlyCookie: { name: "read", value: "only" } }),
    assertRunning: () => { if (stopping) throw new Error("Eval is stopping."); },
    registerAnnotations: () => { entered(); return new Promise((resolve) => { finish = resolve; }); },
  });
  await registering;
  stopping = true;
  finish();
  await expect(pending).rejects.toThrow("Eval is stopping.");
});

it("scopes review reads and state metadata to the opening roster, including Rust's missing-thread fallback", async () => {
  const seen = [];
  let missing = false;
  const surface = await createReviewSurface({
    context, productSession: { origin: "http://product.invalid", readOnlyCookie: { name: "read", value: "only" } },
    fetchImpl: async (url) => {
      seen.push(url.pathname + url.search);
      if (url.pathname === "/api/state") return Response.json({
        projects: [{ id: 1 }, { id: 2 }],
        threads: [...(missing ? [] : [{ id: 7, projectId: 1, active: true }]), { id: 8, projectId: 2, active: missing }],
        interactions: [{ id: 10, threadId: missing ? 8 : 7 }],
        currentProjection: { nodes: [missing ? "private" : "reviewed"] },
      });
      if (url.pathname.endsWith("/destination")) return Response.json({ threadId: 8 });
      return Response.json({ ok: true });
    },
  });
  opened.push(surface);
  const read = (path) => fetch(surface.origin + path, { headers: authorized(surface) });
  for (const path of ["/api/state", "/api/state?threadId=8", "/api/state?threadId=7&threadId=8", "/api/threads/8", "/api/threads/8/annotations", "/api/threads", "/api/projects", "/api/completions/7", "/api/internal/annotation-sessions", "/api/threads/7/unknown", "/api/projects/2/environment"]) {
    expect((await read(path)).status, path).toBe(403);
  }
  expect(seen).toEqual([]);
  const state = await (await read("/api/state?threadId=7")).json();
  expect(state).toEqual({ projects: [{ id: 1 }], threads: [{ id: 7, projectId: 1, active: true }], interactions: [{ id: 10, threadId: 7 }], currentProjection: { nodes: ["reviewed"] } });
  expect((await read("/api/projects/1/environment")).status).toBe(200);
  expect((await read("/api/projects/2/environment")).status).toBe(403);
  expect((await read("/api/threads/7/interactions/10/actions/11/destination")).status).toBe(403);
  missing = true;
  const fallback = await read("/api/state?threadId=7");
  expect(fallback.status).toBe(404);
  expect(await fallback.text()).not.toContain("private");
});

it("preserves encoded opaque asset IDs without allowing encoded structural paths or foreign threads", async () => {
  const seen = [];
  const surface = await createReviewSurface({ context,
    productSession: { origin: "http://product.invalid", readOnlyCookie: { name: "read", value: "only" } },
    fetchImpl: async (url) => { seen.push(url.pathname + url.search); return new Response("asset bytes"); },
  });
  opened.push(surface);
  for (const id of ["image one.png", "圖:1", "folder/asset%25"]) {
    const path = `/api/threads/7/interactions/10/nodes/11/detail-assets/${encodeURIComponent(id)}?layerId=12`;
    expect((await fetch(surface.origin + path)).status).toBe(401);
    const response = await fetch(surface.origin + path, { headers: authorized(surface) });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset bytes");
    expect(seen.at(-1)).toBe(path);
  }
  for (const path of ["/%61pi/threads/7", "/api/threads/%37", "/api/threads/7/interactions/10/nodes/11/detail-assets/%ZZ"]) {
    expect((await fetch(surface.origin + path, { headers: authorized(surface) })).status).toBe(400);
  }
  expect((await fetch(surface.origin + "/api/threads/8/interactions/10/nodes/11/detail-assets/secret%20asset", { headers: authorized(surface) })).status).toBe(403);
  expect(seen).toHaveLength(3);
});


it("persists Eval layout across origins while keeping preference writes authenticated and product writes forbidden", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relayer-eval-layout-"));
  const start = async () => {
    const surface = await createReviewSurface({ context,
      productSession: { origin: "http://product.invalid", readOnlyCookie: { name: "read", value: "only" } },
      presentationSettings: createSettingsStore(directory),
    });
    opened.push(surface);
    return surface;
  };
  const post = (surface, value, headers = authorized(surface)) => fetch(surface.origin + "/eval-api/workspace-layout", {
    method: "POST", headers, body: JSON.stringify(value),
  });
  try {
    const first = await start();
    expect(await (await fetch(first.origin + "/eval-api/workspace-layout", { headers: authorized(first) })).json()).toBe(0.5);
    expect((await post(first, 0.64, {})).status).toBe(401);
    expect((await post(first, 0.64, authorized(first, { Origin: "https://foreign.example" }))).status).toBe(403);
    expect((await post(first, 0.64)).status).toBe(200);
    expect((await post(first, "0.6")).status).toBe(400);
    expect((await post(first, 0.9)).status).toBe(400);
    const reopened = await start();
    expect(reopened.origin).not.toBe(first.origin);
    expect(await (await fetch(reopened.origin + "/eval-api/workspace-layout", { headers: authorized(reopened) })).json()).toBe(0.64);
    expect((await fetch(reopened.origin + "/api/threads/7/interactions", {
      method: "POST", headers: authorized(reopened), body: "{}",
    })).status).toBe(403);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
