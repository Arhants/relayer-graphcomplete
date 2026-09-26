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
});
