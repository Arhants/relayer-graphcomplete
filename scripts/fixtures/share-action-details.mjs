import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startEmbedFixtureServer } from "./public-share-embed.mjs";

export const actionShareId = "b".repeat(32);
export const actionEvidenceRoot = resolve(import.meta.dirname, "../../docs/evidence/issue-586-share-action-details");
export async function startShareActionFixture() {
  // Synthetic bytes captured from the real Rust share-export API by the joined
  // conversation-export test. Never substitute a real user's conversation here.
  const snapshot = await readFile(resolve(actionEvidenceRoot, "synthetic-snapshot.jsonl"), "utf8");
  return startEmbedFixtureServer({ editorialSnapshots: [{
    shareId: actionShareId, title: "Portable action card — synthetic review", snapshot,
  }] });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await startShareActionFixture();
  process.stdout.write(`Human review: ${fixture.origin}/t/${actionShareId}\nSelect Root evidence, inspect the styled card, then choose Compare tradeoffs.\n`);
}
