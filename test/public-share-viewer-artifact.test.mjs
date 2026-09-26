import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");

describe("public share viewer artifact", () => {
  it("builds an immutable source-bound artifact for private hosting", async () => {
    const output = await mkdtemp(join(tmpdir(), "relayer-share-viewer-"));
    await execFileAsync(process.execPath, [
      "scripts/build-public-share-viewer-artifact.mjs",
      "--output",
      output,
    ], { cwd: repositoryRoot });

    const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      version: 1,
      contractVersion: 1,
      builder: "scripts/build-public-share-viewer-artifact.mjs@1",
      snapshotVersions: [1],
    });
    expect(manifest.productCommit).toMatch(/^[a-f0-9]{40}$/u);
    expect(manifest.artifactSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.csp).toContain("connect-src 'none'");
    for (const key of ["logo", "ogImage", "viewerScript", "viewerStyles", "workspaceStyles", "lucideScript", "markedScript"]) {
      expect(manifest.assets[key]).toMatch(new RegExp(`^assets/${manifest.productCommit}/`));
      expect(manifest.resources[key].sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(manifest.resources[key].bytes).toBeGreaterThan(0);
    }
    expect(manifest.files["server/template.js"].sha256).toMatch(/^[a-f0-9]{64}$/u);

    const prefix = `assets/${manifest.productCommit}`;
    const declared = new Set(Object.keys(manifest.files));
    for (const artifactPath of [...declared].filter((path) => path.startsWith(`${prefix}/`) && path.endsWith(".js"))) {
      const source = await readFile(join(output, artifactPath), "utf8");
      for (const match of source.matchAll(/(?:\bfrom\s+|\bimport\s*\()\s*["'](\.[^"']+)["']/gu)) {
        const dependency = posix.normalize(posix.join(posix.dirname(artifactPath), match[1]));
        expect(declared.has(dependency), `${artifactPath} imports missing ${dependency}`).toBe(true);
      }
    }
    for (const artifactPath of [...declared].filter((path) => path.startsWith(`${prefix}/`) && path.endsWith(".css"))) {
      const source = await readFile(join(output, artifactPath), "utf8");
      for (const match of source.matchAll(/url\(["']?(\.[^"')]+)["']?\)/gu)) {
        const dependency = posix.normalize(posix.join(posix.dirname(artifactPath), match[1]));
        expect(declared.has(dependency), `${artifactPath} references missing ${dependency}`).toBe(true);
      }
    }
  });
});
