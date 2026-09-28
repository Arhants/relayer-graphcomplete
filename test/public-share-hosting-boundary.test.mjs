import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");

async function exists(path) {
  try {
    await access(resolve(repositoryRoot, path), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("public shared-thread hosting ownership", () => {
  it("keeps hosted implementation and deployment material out of the product repository", async () => {
    expect(await exists("packages/share-service/package.json")).toBe(false);
    expect(await exists("packages/share-service/src/index.ts")).toBe(false);
    expect(await exists("infra/aws/share-service/template.yaml")).toBe(false);

    const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
    expect(packageJson.scripts["build:packages"]).not.toContain("@relayer/share-service");
  });

  it("retains the public product and protocol seams", async () => {
    for (const path of [
      "contracts/share-service-v1/contract.json",
      "desktop/main/services/share-service-client.mjs",
      "desktop/renderer/src/public-share-viewer/main.js",
      "crates/relayer-app-server/src/conversation_export_service.rs",
    ]) {
      expect(await exists(path), path).toBe(true);
    }
  });

  it("admits V2 asset lines in addition to the complete turn inventory", async () => {
    const { snapshot } = JSON.parse(await readFile(resolve(repositoryRoot, "contracts/share-service-v1/contract.json"), "utf8"));
    // Every admitted JSONL record is an object plus a newline, at least 3 bytes.
    // The byte ceiling therefore bounds all V1/V2 lines without inventing an
    // asset-count restriction or spending the 10,000-turn budget on assets.
    // A canonical visualAssetContent record has a 64-byte digest plus its
    // typed envelope, so 110k admits every valid asset-heavy 16 MiB V2 stream
    // while rejecting millions of tiny JSON objects before browser parsing.
    expect(snapshot.maxLines).toBe(110_000);
    expect(snapshot.maxLines).toBeGreaterThanOrEqual(1 + 10_000 + 1);
  });
});
