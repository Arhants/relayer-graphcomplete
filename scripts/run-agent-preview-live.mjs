/**
 * PREV-005: opt-in live proof that a real model received a draft-preview image.
 *
 * This spends paid inference and needs the Eval profile's connected Codex
 * provider. It is excluded from `npm run check`. It runs `codex-basic` on one
 * layout-heavy built-in case through the real Eval host, then passes only when
 * the trace shows Codex viewed a `submitLayer` preview image (`imageView`) and
 * the turn was accepted. It makes no claim that previews improve quality.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OPT_IN = "RELAYER_AGENT_PREVIEW_LIVE";
if (process.env[OPT_IN] !== "1") {
  throw new Error(`The agent-preview live run spends real inference. Set ${OPT_IN}=1 to run it.`);
}
const root = resolve(import.meta.dirname, "..");
const userData = resolve(process.env.RELAYER_EVAL_USER_DATA_DIR || join(homedir(), ".relayer", "eval-web"));
const output = resolve(root, ".relayer/evidence/agent-preview-live");
const selection = {
  testCaseIds: ["empty-project.hierarchical-overview.single-turn"],
  harnessConfigurationNames: ["codex-basic"],
  judgeConfigurationName: "deterministic-graph-contract",
};

async function until(check, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  }
  throw new Error(`Timed out: ${label}`);
}

const scratch = await mkdtemp(join(tmpdir(), "relayer-agent-preview-live-"));
const shutdownShim = join(scratch, "shutdown-shim.mjs");
await writeFile(shutdownShim, 'process.on("message", (message) => { if (message === "shutdown") process.emit("SIGINT"); });\n');
const child = spawn(process.execPath, ["--import", pathToFileURL(shutdownShim).href, "desktop/eval-main/index.mjs"], {
  cwd: root,
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("RELAYER_EVAL_AUTORUN"))),
    RELAYER_EVAL_USER_DATA_DIR: userData,
  },
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});
let log = "";
child.stdout.on("data", (bytes) => { log += bytes; });
child.stderr.on("data", (bytes) => { log += bytes; });
const exited = once(child, "exit");
try {
  const url = await until(() => {
    if (child.exitCode !== null) throw new Error(`The Eval host exited:\n${log}`);
    return log.match(/Relayer Eval: (http:\/\/\S+)/)?.[1];
  }, "Eval host ready", 120_000);
  const rpc = async (operation, args = []) => {
    const response = await fetch(new URL(`/eval-api/${operation}`, url), {
      method: "POST",
      headers: { Authorization: `Bearer ${new URL(url).hash.slice(1)}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value;
  };
  const created = await rpc("createRun", [selection]);
  console.log(`Started live run ${created.id}`);
  const run = await until(async () => {
    const value = await rpc("getRun", [created.id]);
    return ["passed", "failed", "error", "interrupted"].includes(value.status) ? value : null;
  }, "live run", 45 * 60_000);
  const execution = run.executions[0];
  const turn = execution.turns[0];
  const turnDirectory = join(userData, "eval-data", "runs", encodeURIComponent(run.id), "executions",
    encodeURIComponent(execution.id), "turns", encodeURIComponent(String(turn.interactionId)));
  const events = (await readFile(join(turnDirectory, "candidate-trace", "events.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  const renderedLayers = events
    .filter((event) => event.type === "graph.preview" && event.data.outcome === "rendered" && event.data.target.kind === "layer")
    .map((event) => event.data.fingerprint.slice("sha256:".length, "sha256:".length + 16));
  const viewed = events
    .filter((event) => event.type === "provider.event" && event.data?.method === "item/completed"
      && event.data.params?.item?.type === "imageView")
    .map((event) => String(event.data.params.item.path ?? ""));
  // The model must see the image while it can still act on it: before the
  // successful graph.submit that ends graph access.
  const operations = (await readFile(join(turnDirectory, "candidate-trace", "graph-operations.jsonl"), "utf8").catch(() => ""))
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const submittedAt = operations.find((operation) => operation.path === "/api/graph/submit"
    && operation.status >= 200 && operation.status < 300)?.observedAt;
  const viewedLayerPreviews = events
    .filter((event) => event.type === "provider.event" && event.data?.method === "item/completed"
      && event.data.params?.item?.type === "imageView"
      && (submittedAt === undefined || event.observedAt < submittedAt))
    .map((event) => String(event.data.params.item.path ?? ""))
    .filter((path) => {
      const match = /^layer-\d+-([0-9a-f]{16})\.png$/.exec(basename(path));
      return match !== null && renderedLayers.includes(match[1]);
    });
  const accepted = turn.status === "accepted";
  const receipt = {
    runId: run.id,
    runStatus: run.status,
    case: selection.testCaseIds[0],
    harness: selection.harnessConfigurationNames[0],
    turnAccepted: accepted,
    renderedLayerPreviews: renderedLayers.length,
    previewEvents: events.filter((event) => event.type === "graph.preview").map((event) => event.data),
    imageViews: viewed.map((path) => basename(path)),
    submittedAt: submittedAt ?? null,
    viewedLayerPreviews: viewedLayerPreviews.map((path) => basename(path)),
    passed: accepted && viewedLayerPreviews.length > 0,
    qualityClaim: "none",
  };
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  const artifacts = join(turnDirectory, "candidate-trace", "draft-previews");
  for (const name of await readdir(artifacts).catch(() => [])) await cp(join(artifacts, name), join(output, name));
  console.log(JSON.stringify(receipt, null, 2));
  assert.ok(accepted, "The live turn was not accepted.");
  assert.ok(viewedLayerPreviews.length > 0, "No submitLayer preview image reached the model as image input before submit.");
  console.log(`PASS PREV-005 ${run.id}`);
} finally {
  if (child.exitCode === null) {
    child.send("shutdown");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 30_000);
    await exited;
    clearTimeout(timeout);
  }
  await rm(scratch, { recursive: true, force: true });
}
