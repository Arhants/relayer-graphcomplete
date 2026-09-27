import { readFile, access } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { request as httpRequest } from "node:http";
import { createEvalDashboard } from "../desktop/eval-main/web-host.mjs";

const opened = [];
afterEach(async () => { await Promise.all(opened.splice(0).map((surface) => surface.close())); });
const authorized = (surface, extra = {}) => ({ Authorization: `Bearer ${new URL(surface.url).hash.slice(1)}`, ...extra });

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
