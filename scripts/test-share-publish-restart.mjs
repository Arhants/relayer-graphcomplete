import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createSharePublishAttemptStore } from "../desktop/main/services/share-publish-attempt-store.mjs";
import { createSharePublishCoordinator } from "../desktop/main/services/share-publish-coordinator.mjs";

const execute = promisify(execFile);
const ATTEMPT_ID = "00112233445566778899aabbccddeeff";
const REFERENCE = "SHR-RESTART1";
const RECOVERED_URL = "https://share.example.test/t/restart-proof";
const SNAPSHOT = new TextEncoder().encode(`${JSON.stringify({
  recordType: "header",
  conversation: { projectName: "Synthetic restart proof" },
})}\n${JSON.stringify({ recordType: "turn", id: "synthetic-accepted-turn" })}\n`);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readServiceState(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeServiceState(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function child(phase, root) {
  const servicePath = join(root, "fake-share-service.json");
  const attemptStore = createSharePublishAttemptStore({ directory: join(root, "attempts") });
  const publish = async ({ attempt, snapshotBytes }) => {
    const snapshotSha256 = sha256(snapshotBytes);
    let state = await readServiceState(servicePath);
    if (!state) {
      state = {
        attemptId: attempt.attemptId,
        snapshotSha256,
        quotaCharges: 1,
        requests: 1,
        url: RECOVERED_URL,
      };
    } else {
      if (state.attemptId !== attempt.attemptId || state.snapshotSha256 !== snapshotSha256) {
        throw new Error("Restart changed the frozen share identity.");
      }
      state.requests += 1;
    }
    await writeServiceState(servicePath, state);
    if (phase === "create") {
      throw Object.assign(new Error("synthetic lost response after publication"), {
        code: "share_upload_failed",
        failureStage: "upload",
      });
    }
    return { url: state.url };
  };
  const coordinator = createSharePublishCoordinator({
    exportSnapshot: phase === "create"
      ? async () => SNAPSHOT
      : async () => { throw new Error("Recovery must not re-export the thread."); },
    accountSession: async () => ({
      ownerKey: "owner-restart-proof",
      authorization: `Bearer synthetic-${phase}`,
      generation: phase === "create" ? 1 : 2,
    }),
    sourceThreadIdentity: phase === "create"
      ? async (threadId) => `installation:restart-proof:thread:${threadId}`
      : async () => { throw new Error("Recovery must not recreate source identity."); },
    publish,
    attemptStore,
    createAttemptId: () => ATTEMPT_ID,
    createReferenceId: () => REFERENCE,
    now: () => 1_000,
  });

  if (phase === "create") {
    const result = await coordinator.create({ threadId: 42, title: "Synthetic restart proof" });
    if (result.status !== "failed" || result.attemptReferenceId !== REFERENCE || result.retryable !== true) {
      throw new Error("The first process did not retain the uncertain attempt.");
    }
    return;
  }
  const pending = await coordinator.pending({ threadId: 42 });
  if (pending?.attemptReferenceId !== REFERENCE || pending.retryable !== true) {
    throw new Error("The second process did not reopen the original attempt.");
  }
  const result = await coordinator.retry(REFERENCE);
  if (result.status !== "created" || result.url !== RECOVERED_URL) {
    throw new Error("The second process did not recover the published URL.");
  }
  const receipt = await coordinator.pending({ threadId: 42 });
  if (receipt?.status !== "created" || receipt.url !== RECOVERED_URL) {
    throw new Error("The recovered URL was not durable before renderer dismissal.");
  }
  const dismissed = await coordinator.dismiss(REFERENCE);
  if (dismissed.status !== "dismissed") throw new Error("The recovered receipt was not dismissed.");
}

async function parent() {
  const root = await mkdtemp(join(tmpdir(), "relayer-share-restart-proof-"));
  try {
    const environment = { ...process.env, RELAYER_SHARE_RESTART_ROOT: root };
    await execute(process.execPath, [process.argv[1], "--child", "create"], { env: environment, timeout: 5_000 });
    await execute(process.execPath, [process.argv[1], "--child", "recover"], { env: environment, timeout: 5_000 });
    const state = await readServiceState(join(root, "fake-share-service.json"));
    const remaining = await createSharePublishAttemptStore({ directory: join(root, "attempts") }).load();
    process.stdout.write(`${JSON.stringify({
      status: "passed",
      processes: 2,
      quotaCharges: state.quotaCharges,
      requests: state.requests,
      sameAttemptId: state.attemptId === ATTEMPT_ID,
      sameSnapshotSha256: state.snapshotSha256 === sha256(SNAPSHOT),
      recoveredUrl: state.url,
      attemptStoreEmpty: remaining.length === 0,
    })}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--child") {
    const root = process.env.RELAYER_SHARE_RESTART_ROOT;
    const phase = process.argv[3];
    if (!root || !["create", "recover"].includes(phase)) throw new Error("Invalid restart-proof child invocation.");
    await child(phase, root);
  } else await parent();
}
