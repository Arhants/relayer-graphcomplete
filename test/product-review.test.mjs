import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { createProductReview } from "../desktop/main/services/product-review.mjs";

it("registers an immutable product session, exposes only scoped browser authority, and revokes once", async () => {
  const calls = [];
  const context = { readOnly: true, cases: [{ threadIds: [7] }] };
  const options = { productSession: { origin: "http://127.0.0.1:1234", cookie: { name: "control", value: "secret" } }, context, threadId: 7,
    fetchImpl: async (url, options) => { calls.push({ url, ...options }); return new Response(null, { status: 204 }); } };
  const first = await createProductReview(options);
  context.cases[0].threadIds.push(8);
  const second = await createProductReview({ ...options, threadId: 8 });
  const firstToken = new URL(first.url).hash.slice(1);
  expect(firstToken).toMatch(/^[a-f0-9]{64}$/);
  expect(first.url).not.toContain("secret");
  expect(JSON.parse(calls[0].body).context.cases[0].threadIds).toEqual([7]);
  expect(JSON.parse(calls[1].body).context.cases[0].threadIds).toEqual([7, 8]);
  expect(() => first.read("https://other.invalid/api/state")).toThrow("local product");
  await first.read("/api/state?threadId=7");
  expect(calls[2].headers).toEqual({ Authorization: `Bearer ${firstToken}` });
  await Promise.all([first.close(), first.close()]);
  expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
  await second.close();
  await expect(createProductReview({ ...options, threadId: 9 })).rejects.toThrow("does not belong");
});

it("keeps review capabilities tab-local through reload and never attaches them to external fetches", async () => {
  const source = await readFile(new URL("../desktop/renderer/review-bootstrap.js", import.meta.url), "utf8");
  const createTab = (token) => {
    const storage = new Map();
    const seen = [];
    const location = new URL(`http://127.0.0.1:1234/?review=1&threadId=7#${token}`);
    const load = () => {
      const window = { fetch: async (input, options) => { seen.push({ input, options }); return Response.json({ cases: [] }); } };
      const globals = { window, location, URL, URLSearchParams, Request, Headers,
        sessionStorage: { setItem: (key, value) => storage.set(key, value), getItem: (key) => storage.get(key) },
        history: { replaceState: (_state, _title, url) => { location.href = new URL(url, location).href; } },
      };
      runInNewContext(source, globals);
      return window;
    };
    return { load, seen, location };
  };
  const first = createTab("a".repeat(64));
  const second = createTab("b".repeat(64));
  await first.load().fetch("/api/state?threadId=7");
  await second.load().fetch("/api/state?threadId=7");
  expect(first.location.hash).toBe("");
  const reloaded = first.load();
  await reloaded.fetch("/api/review-context");
  expect(first.seen.at(-1).options.headers.get("Authorization")).toBe(`Bearer ${"a".repeat(64)}`);
  expect(second.seen[0].options.headers.get("Authorization")).toBe(`Bearer ${"b".repeat(64)}`);
  expect(first.seen.at(-1).options.credentials).toBe("omit");
  await reloaded.fetch("https://other.invalid/api/state");
  expect(first.seen.at(-1).options).toEqual({});
});
