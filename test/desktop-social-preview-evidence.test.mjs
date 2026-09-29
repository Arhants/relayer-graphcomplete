import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = resolve(root, "docs/evidence/desktop-social-preview");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function servedRendererFiles(rendererDirectory, current = rendererDirectory) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    expect(entry.isSymbolicLink()).toBe(false);
    if (entry.isDirectory()) files.push(...await servedRendererFiles(rendererDirectory, path));
    else if (entry.isFile()) {
      const name = relative(rendererDirectory, path).split(sep).join("/");
      if (/^(src\/|vendor\/|assets\/|styles\.css$)/.test(name)) files.push(name);
    }
  }
  return files.sort();
}

describe("desktop social preview evidence", () => {
  it("binds every captured source, served renderer file, and PNG", async () => {
    const receipt = JSON.parse(await readFile(resolve(evidenceDirectory, "receipt.json"), "utf8"));
    for (const [path, expected] of Object.entries(receipt.sourceFiles)) {
      expect(sha256(await readFile(resolve(root, path))), path).toBe(expected);
    }

    const rendererDirectory = resolve(root, receipt.rendererArtifact.directory);
    const actualFiles = await servedRendererFiles(rendererDirectory);
    expect(Object.keys(receipt.rendererArtifact.files).sort()).toEqual(actualFiles);
    const canonical = [];
    for (const path of actualFiles) {
      const bytes = await readFile(resolve(rendererDirectory, path));
      const identity = receipt.rendererArtifact.files[path];
      expect(identity, path).toEqual({ bytes: bytes.length, sha256: sha256(bytes) });
      canonical.push(`${path}\0${identity.bytes}\0${identity.sha256}\n`);
    }
    expect(sha256(canonical.join(""))).toBe(receipt.rendererArtifact.digest);

    for (const capture of receipt.captures) {
      const bytes = await readFile(resolve(evidenceDirectory, `${capture.theme}.png`));
      expect({
        bytes: bytes.length,
        sha256: sha256(bytes),
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
      }).toEqual({ bytes: capture.bytes, sha256: capture.sha256, width: 1200, height: 630 });
    }
  });
});
