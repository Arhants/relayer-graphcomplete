import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execute = promisify(execFile);

describe("share publish restart evidence entry point", () => {
  it("restarts the production coordinator/store without changing identity or charging quota twice", async () => {
    const script = new URL("../scripts/test-share-publish-restart.mjs", import.meta.url);
    const { stdout, stderr } = await execute(process.execPath, [script.pathname], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      status: "passed",
      processes: 2,
      quotaCharges: 1,
      requests: 2,
      sameAttemptId: true,
      sameSnapshotSha256: true,
      recoveredUrl: "https://share.example.test/t/restart-proof",
      attemptStoreEmpty: true,
    });

    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    expect(packageJson.scripts["evidence:share-publish-restart"])
      .toBe("node scripts/test-share-publish-restart.mjs");
  });
});
