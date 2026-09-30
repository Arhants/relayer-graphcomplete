// PREV-003: the deterministic draft-preview loop through the real Eval host
// process and its real Playwright renderer. No paid inference.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const directory = await mkdtemp(join(tmpdir(), "relayer-eval-graph-preview-"));
const shutdownShim = join(directory, "shutdown-shim.mjs");
await writeFile(shutdownShim, 'process.on("message", (message) => { if (message === "shutdown") process.emit("SIGINT"); });\n');
const userData = join(directory, "host");
const selection = {
  testCaseIds: ["empty-project.task-system.single-turn"],
  harnessConfigurationNames: ["fixture-graph-preview"],
  judgeConfigurationName: "deterministic-graph-contract",
};

async function until(check, label, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`Timed out: ${label}`);
}

function pngSize(bytes) {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "preview is a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const child = spawn(process.execPath, ["--import", pathToFileURL(shutdownShim).href, "desktop/eval-main/index.mjs"], {
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("RELAYER_EVAL_AUTORUN"))),
    RELAYER_EVAL_USER_DATA_DIR: userData,
    RELAYER_EVAL_PRIME_PROFILE_FILE: "",
  },
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});
let log = "";
child.stdout.on("data", (bytes) => { log += bytes; });
child.stderr.on("data", (bytes) => { log += bytes; });
const exited = once(child, "exit");
try {
  const url = await until(() => {
    if (child.exitCode !== null) throw new Error(log);
    return log.match(/Relayer Eval: (http:\/\/\S+)/)?.[1];
  }, "Eval host ready");
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
  const run = await until(async () => {
    const value = await rpc("getRun", [created.id]);
    return ["passed", "failed", "error", "interrupted"].includes(value.status) ? value : null;
  }, "fixture run");
  const execution = run.executions[0];
  const turn = execution.turns[0];
  assert.equal(turn?.status, "accepted", `the fixture turn was accepted: ${JSON.stringify(run)}`);

  const turnDirectory = join(userData, "eval-data", "runs", encodeURIComponent(run.id), "executions",
    encodeURIComponent(execution.id), "turns", encodeURIComponent(String(turn.interactionId ?? turn.id)), "candidate-trace");
  const events = (await readFile(join(turnDirectory, "events.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  const previews = events.filter((event) => event.type === "graph.preview").map((event) => event.data);
  assert.deepEqual(previews.map(({ outcome, target }) => [outcome, target.kind]), [
    ["rendered", "node"], ["rendered", "layer"], ["rendered", "layer"],
  ], "the host rendered the authored node, the layer, and the moved layer; the unchanged layer was cached");
  const authored = events.find((event) => event.type === "tool.call.completed" && event.data.tool === "fixture.graph-preview");
  assert.deepEqual(authored.data.previews.map(({ step, status }) => [step, status]), [
    ["plain node", "none"], ["authored node", "rendered"], ["layer", "rendered"], ["moved layer", "rendered"], ["unchanged layer", "cached"],
  ]);
  assert.doesNotMatch(await readFile(join(turnDirectory, "events.jsonl"), "utf8"), /iVBORw0KGgo/, "the trace records metadata only");

  const images = (await readdir(join(turnDirectory, "draft-previews"))).sort();
  assert.equal(images.length, 3, `Eval keeps each rendered image as a run artifact: ${images}`);
  const sizes = await Promise.all(images.map(async (name) => pngSize(await readFile(join(turnDirectory, "draft-previews", name)))));
  assert.deepEqual(sizes, [{ width: 576, height: 844 }, { width: 1164, height: 703 }, { width: 1164, height: 703 }]);
  console.log(`PASS PREV-003 ${JSON.stringify({ runStatus: run.status, previews: authored.data.previews, images })}`);
} catch (error) {
  console.error(log.slice(-4000));
  throw error;
} finally {
  if (child.exitCode === null) {
    child.send("shutdown");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
    await exited;
    clearTimeout(timeout);
  }
  await rm(directory, { recursive: true, force: true });
}
