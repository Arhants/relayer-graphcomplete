import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  GraphCompleteRuntimeService,
  createDesktopGraphRuntime,
  RECURSIVE_TEMPORAL_FEATURES,
  productTemporalFeatures,
} from "../desktop/main/services/graphcomplete-runtime.mjs";

const runtimeDirectories = [];

function spawnedGraphArguments(temporalFeatures, runtimeOptions = {}, createRuntime = (options) => new GraphCompleteRuntimeService(options)) {
  const spawned = [];
  const userDataDirectory = mkdtempSync(join(tmpdir(), "relayer-temporal-features-"));
  runtimeDirectories.push(userDataDirectory);
  const service = createRuntime({
    userDataDirectory,
    graphServerBinary: "/tmp/relayer-graph-server",
    configurationPaths: [],
    temporalFeatures,
    ...runtimeOptions,
    spawnProcess: (_binary, args) => {
      spawned.push(args);
      throw new Error("startup is not exercised by this test");
    },
  });
  return { service, spawned };
}

describe("product recursion enable path", () => {
  afterEach(() => {
    while (runtimeDirectories.length > 0) {
      rmSync(runtimeDirectories.pop(), { recursive: true, force: true });
    }
  });

  it("ships the whole chain enabled by default", () => {
    expect(productTemporalFeatures({})).toBe(RECURSIVE_TEMPORAL_FEATURES);
    expect(productTemporalFeatures({ RELAYER_DESKTOP_PROVIDER_RECURSION: "1" }))
      .toBe(RECURSIVE_TEMPORAL_FEATURES);
    expect(productTemporalFeatures({ RELAYER_DESKTOP_PROVIDER_RECURSION: "false" }))
      .toBe(RECURSIVE_TEMPORAL_FEATURES);
  });

  it("falls back to the all-off compatibility stage for diagnosis", () => {
    expect(productTemporalFeatures({ RELAYER_DESKTOP_PROVIDER_RECURSION: "0" })).toEqual({});
  });

  it("enables the whole persisted chain recursion depends on", () => {
    expect(RECURSIVE_TEMPORAL_FEATURES).toEqual({
      schemaRead: true,
      rootCurrentWrite: true,
      projectionUi: true,
      invokeResolution: true,
      providerRecursion: true,
    });
  });

  it("enables typed interaction preparation only for an explicit trusted runtime option", async () => {
    for (const [runtimeOptions, enabled] of [
      [{}, false],
      [{ interactionPermissions: "1" }, false],
      [{ interactionPermissions: true }, true],
    ]) {
      const { service, spawned } = spawnedGraphArguments({}, runtimeOptions);
      await expect(service.start()).rejects.toThrow("startup is not exercised");
      expect(spawned[0].includes("--interaction-permissions")).toBe(enabled);
    }
  });

  it("Desktop startup enables attached-node policy at the real process boundary", async () => {
    const { service, spawned } = spawnedGraphArguments({}, {}, createDesktopGraphRuntime);
    await expect(service.start()).rejects.toThrow("startup is not exercised");
    expect(spawned[0]).toContain("--interaction-permissions");
  });

  it("passes the enabled chain to the graph server it starts", async () => {
    const { service, spawned } = spawnedGraphArguments(
      RECURSIVE_TEMPORAL_FEATURES,
    );

    await expect(service.start()).rejects.toThrow("startup is not exercised");

    expect(spawned[0]).toEqual(expect.arrayContaining([
      "--temporal-schema-read",
      "--temporal-root-current-write",
      "--temporal-projection-ui",
      "--temporal-invoke-resolution",
      "--temporal-provider-recursion",
    ]));
  });

  it("starts the graph server with no temporal switch when the chain is disabled", async () => {
    const { service, spawned } = spawnedGraphArguments(
      productTemporalFeatures({ RELAYER_DESKTOP_PROVIDER_RECURSION: "0" }),
    );

    await expect(service.start()).rejects.toThrow("startup is not exercised");

    expect(spawned[0].filter((argument) => argument.startsWith("--temporal"))).toEqual([]);
  });
});
