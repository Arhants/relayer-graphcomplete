import { describe, expect, it } from "vitest";
import { createProductBackend } from "../desktop/main/services/product-backend.mjs";

describe("product backend lifecycle", () => {
  it("publishes host readiness before product startup and shares a single owned session", async () => {
    const calls = [];
    const runtimeSession = { configurations: new Map() };
    const product = { start: async () => { calls.push("product-start"); return { origin: "local" }; }, close: async () => calls.push("product-close") };
    const backend = createProductBackend({ graphRuntime: { start: async () => { calls.push("graph-start"); return runtimeSession; }, close: async () => calls.push("graph-close") },
      productOptions: { allowHarnessOverride: true }, beforeProductStart: async () => calls.push("readiness"),
      createServer: (options) => { expect(options).toEqual({ allowHarnessOverride: true, runtimeSession }); return product; },
    });
    const [first, second] = await Promise.all([backend.start(), backend.start()]);
    expect(first).toBe(second);
    expect(calls).toEqual(["graph-start", "readiness", "product-start"]);
    await Promise.all([backend.close(), backend.close()]);
    expect(calls.slice(3).sort()).toEqual(["graph-close", "product-close"]);
  });
  it("cleans up both services after partial startup failure and retains cleanup failures", async () => {
    const calls = [];
    const backend = createProductBackend({ graphRuntime: { start: async () => ({}), close: async () => calls.push("graph-close") },
      createServer: () => ({ start: async () => { throw new Error("start failed"); }, close: async () => { calls.push("product-close"); throw new Error("close failed"); } }),
    });
    await expect(backend.start()).rejects.toMatchObject({ errors: [expect.objectContaining({ message: "start failed" }), expect.any(AggregateError)] });
    expect(calls.sort()).toEqual(["graph-close", "product-close"]);
  });
  it("never starts product after cancellation while graph startup is pending", async () => {
    let finish;
    let starts = 0;
    const backend = createProductBackend({ graphRuntime: { start: () => new Promise((resolve) => { finish = resolve; }), close: async () => {} },
      createServer: () => { starts++; throw new Error("must not start"); },
    });
    const pending = backend.start();
    await backend.close(); finish({});
    await expect(pending).rejects.toThrow("stopping");
    expect(starts).toBe(0);
  });
});

it("keeps graph authority alive until product teardown has settled", async () => {
  let release;
  let graphClosed = false;
  const backend = createProductBackend({ graphRuntime: { start: async () => ({}), close: async () => { graphClosed = true; } },
    createServer: () => ({ start: async () => ({}), close: () => new Promise((resolve) => { release = resolve; }) }),
  });
  await backend.start();
  const closing = backend.close();
  expect(graphClosed).toBe(false);
  release(); await closing;
  expect(graphClosed).toBe(true);
});
