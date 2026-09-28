import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyDirectory, validateRuntime } from "../../desktop/packaging/build-cache.mjs";

export async function packagingRuntimeReady(root, identity) {
  if (!root || !/^[a-f0-9]{64}$/.test(identity ?? "")) return false;
  try {
    const payload = await verifyDirectory(join(root, "runtime", identity), identity);
    await validateRuntime(payload);
    return true;
  } catch { return false; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ready = await packagingRuntimeReady(process.env.PACKAGING_CACHE_ROOT, process.env.PACKAGING_RUNTIME_ID);
  console.log(`Packaging runtime preflight: ${ready ? "verified; compilation preparation can be skipped" : "missing/rejected; prepare fresh compilation"}`);
  try { await appendFile(process.env.GITHUB_OUTPUT, `ready=${ready}\n`); }
  catch { console.log("Packaging preflight output unavailable; prepare fresh compilation"); }
}
