import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { packagingIdentity } from "../../desktop/packaging/build-cache.mjs";
import { desktopTargetFromEnvironment } from "../../desktop/shared/target.mjs";
try {
  const repositoryRoot = process.cwd();
  const cacheRoot = resolve(repositoryRoot, ".relayer", "packaging-cache-v1");
  const identity = await packagingIdentity({ repositoryRoot, cacheRoot, target: desktopTargetFromEnvironment(process.env) });
  await appendFile(process.env.GITHUB_OUTPUT, `native=${identity.native}\nruntime=${identity.runtime}\nroot=${cacheRoot}\n`);
} catch (error) {
  console.log(`Packaging cache identity unavailable; build remains fresh: ${error.message}`);
}
