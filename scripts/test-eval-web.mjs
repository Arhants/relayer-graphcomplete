import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import { mkdtemp, rm, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { taskSystemFixtureFactory } from "@relayer/eval-runner";
import { GraphCompleteRuntimeService } from "../desktop/main/services/graphcomplete-runtime.mjs";
import { RelayerAppServerService } from "../desktop/main/services/relayer-app-server.mjs";
import { EvalService } from "../desktop/eval-main/eval-service.mjs";
import { createEvalDashboard, createSettingsSurface } from "../desktop/eval-main/web-host.mjs";
import { createEvalProviderSetup } from "../desktop/eval-main/provider-setup.mjs";
import { createProviderAdapterRegistry } from "../desktop/main/providers/provider-adapter-contract.mjs";
import { unavailableModelCatalogSnapshot } from "../desktop/main/models/model-catalog-adapter.mjs";
import { openBrowserReview } from "../desktop/eval-main/browser-review.mjs";

const directory = await mkdtemp(join(tmpdir(), "relayer-eval-web-proof-"));
const resources = [];
const shutdownShim = join(directory, "shutdown-shim.mjs");
await writeFile(shutdownShim, 'process.on("message", (message) => { if (message === "shutdown") process.emit("SIGINT"); });\n');
const { scripts } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(scripts["eval-app:dev"], "node desktop/eval-main/index.mjs", "Eval launch must not build or package");
assert.equal(scripts["eval:input-roundtrip:live"], "RELAYER_EVAL_AUTORUN_INPUT_ROUNDTRIP=1 node desktop/eval-main/index.mjs");
const hostArguments = ["--import", pathToFileURL(shutdownShim).href, scripts["eval-app:dev"].slice("node ".length)];
function requestShutdown(child) {
  // Windows kill(SIGINT) terminates rather than dispatching the Node handler.
  if (process.platform === "win32") child.send("shutdown");
  else child.kill("SIGINT");
}
const selection = { testCaseIds: ["empty-project.task-system.two-turn"], harnessConfigurationNames: ["fixture-task-system"], judgeConfigurationName: "deterministic-graph-contract" };
async function until(fn, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await new Promise((resolvePromise) => setTimeout(resolvePromise, 100)); }
  throw new Error(`Timed out: ${label}`);
}
async function launchHost() {
  const child = spawn(process.execPath, hostArguments, {
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("RELAYER_EVAL_AUTORUN"))), RELAYER_EVAL_USER_DATA_DIR: join(directory, "host"), RELAYER_EVAL_PRIME_PROFILE_FILE: "", RELAYER_EVAL_AUTORUN_INPUT_ROUNDTRIP: "" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let log = "";
  child.stdout.on("data", (bytes) => { log += bytes; });
  child.stderr.on("data", (bytes) => { log += bytes; });
  const exited = once(child, "exit");
  const close = async () => {
    if (child.exitCode !== null) return;
    requestShutdown(child);
    const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
    try { const [code, signal] = await exited; assert.equal(signal, null, "host required forced shutdown"); assert.equal(code, 0, log); }
    finally { clearTimeout(timeout); }
  };
  resources.push({ close });
  const url = await until(() => {
    if (child.exitCode !== null) throw new Error(log);
    return log.match(/Relayer Eval: (http:\/\/\S+)/)?.[1];
  }, "host ready");
  return { url, close };
}
async function rpc(url, operation, args = []) {
  const response = await fetch(new URL(`/eval-api/${operation}`, url), { method: "POST", headers: { Authorization: `Bearer ${new URL(url).hash.slice(1)}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value;
}
try {
  // A native child that never reports readiness exercises interruption during startup.
  const waitingBinary = join(directory, process.platform === "win32" ? "waiting-server.exe" : "waiting-server");
  const marker = join(directory, "waiting-server.pid");
  const waitingSource = join(directory, "waiting_server.rs");
  await writeFile(waitingSource, `fn main() {
    std::fs::write(std::env::var_os("RELAYER_EVAL_TEST_PID_FILE").unwrap(), std::process::id().to_string()).unwrap();
    loop { std::thread::sleep(std::time::Duration::from_secs(1)); }
  }`);
  execFileSync("rustc", [waitingSource, "-o", waitingBinary], { stdio: "pipe" });
  const interruptedProfile = join(directory, "interrupted");
  const pending = spawn(process.execPath, hostArguments, {
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("RELAYER_EVAL_AUTORUN"))), RELAYER_EVAL_USER_DATA_DIR: interruptedProfile, RELAYER_EVAL_PRIME_PROFILE_FILE: "", RELAYER_GRAPH_SERVER_BIN: waitingBinary, RELAYER_EVAL_TEST_PID_FILE: marker }, stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const pendingExit = once(pending, "exit");
  const timeout = setTimeout(() => pending.kill("SIGKILL"), 15_000);
  try {
    const pid = await until(async () => { try { return Number(await readFile(marker, "utf8")); } catch { return null; } }, "pending native startup", 10_000);
    requestShutdown(pending);
    const [code, signal] = await pendingExit;
    assert.equal(signal, null); assert.equal(code, 0);
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    await assert.rejects(access(join(interruptedProfile, "eval-web.lock")), { code: "ENOENT" });
  } finally { clearTimeout(timeout); if (pending.exitCode === null) pending.kill("SIGKILL"); }
  console.log("PASS interrupted startup: pending native child terminated and profile lock released");
  const browser = await chromium.launch(); resources.push(browser);
  const host = await launchHost();
  const duplicate = spawn(process.execPath, ["desktop/eval-main/index.mjs"], {
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("RELAYER_EVAL_AUTORUN"))), RELAYER_EVAL_USER_DATA_DIR: join(directory, "host"), RELAYER_EVAL_PRIME_PROFILE_FILE: "" }, stdio: "ignore",
  });
  const [duplicateCode] = await once(duplicate, "exit");
  assert.equal(duplicateCode, 1, "a second host must not open the same profile");
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(host.url);
  await page.locator("#emptyNewRun").click();
  await page.locator('input[name="cases"]').first().waitFor();
  const catalog = await rpc(host.url, "catalog", []);
  if (process.env.RELAYER_EVAL_REQUIRE_EXTERNAL_CATALOG === "1") {
    assert.ok(catalog.suites.length > 0, "configured external catalog exposes a suite");
    for (const suite of catalog.suites) {
      assert.equal(suite.available, true, `external suite unavailable: ${suite.unavailableReason}`);
      console.log(`EXTERNAL_SUITE ${JSON.stringify({ suiteId: suite.suiteId, suiteDigest: suite.suiteDigest, memberIds: suite.members.map(({ caseId }) => caseId) })}`);
      const selectedInput = page.locator(`input[name="suites"][value="${suite.suiteId}"]`);
      await selectedInput.waitFor();
      assert.equal(await selectedInput.isDisabled(), false);
      await selectedInput.check();
      const selectedCases = await page.locator('input[name="cases"]:checked').evaluateAll((inputs) => inputs.map(({ value }) => value));
      assert.deepEqual(selectedCases.sort(), suite.members.map(({ caseId }) => caseId).sort());
      await page.locator('input[name="cases"]').first().click();
      assert.equal(await selectedInput.isChecked(), false);
    }
  }
  await page.locator('input[name="cases"]').evaluateAll((inputs) => inputs.forEach((input) => { input.checked = input.value === "empty-project.task-system.two-turn"; }));
  await page.locator('input[name="harness"]').evaluateAll((inputs) => inputs.forEach((input) => { input.checked = input.value === "fixture-task-system"; }));
  // Execute only the deterministic fixture through the real dashboard transport.
  const observer = await browser.newPage(); await observer.goto(host.url);
  const created = await page.evaluate((selection) => window.relayerEval.createRun(selection), selection);
  assert.equal(created.status, "running");
  await page.close(); // Closing a tab while execution is pending must not cancel it.
  const run = await until(async () => { const value = await rpc(host.url, "getRun", [created.id]); return ["passed", "failed", "error", "interrupted"].includes(value.status) ? value : null; }, "fixture run");
  assert.equal(run.status, "passed", JSON.stringify(run));
  const execution = run.executions[0];
  assert.equal(execution.turns.length, 2);
  await observer.getByText(run.id, { exact: true }).first().waitFor(); // Polling updates an already-open dashboard.
  assert.equal((await rpc(host.url, "getRun", [run.id])).status, "passed");
  const reviewUrl = await rpc(host.url, "openReview", [execution.id]);
  const secondReviewUrl = await rpc(host.url, "openReview", [execution.id]);
  assert.notEqual(new URL(secondReviewUrl).origin, new URL(reviewUrl).origin);
  const secondContext = await fetch(new URL("/eval-api/context", secondReviewUrl), { headers: { Authorization: `Bearer ${new URL(secondReviewUrl).hash.slice(1)}` } });
  assert.equal(secondContext.status, 200);
  const crossed = await fetch(new URL("/eval-api/context", reviewUrl), { headers: { Authorization: `Bearer ${new URL(secondReviewUrl).hash.slice(1)}` } });
  assert.equal(crossed.status, 401);
  const review = await browser.newPage(); review.on("pageerror", (error) => pageErrors.push(error.message));
  await review.goto(reviewUrl);
  await review.waitForFunction(() => Boolean(window.__evalPresentation?.snapshot()?.turnId));
  const state = await review.evaluate(() => window.__evalPresentation.snapshot());
  assert.equal(state.executionId, execution.id);
  const writeStatus = await review.evaluate(async (threadId) => (await fetch(`/api/threads/${threadId}/interactions`, { method: "POST", body: '{}' })).status, execution.threadIds[0]);
  assert.equal(writeStatus, 403);
  const annotations = await review.evaluate(async (threadId) => { const response = await fetch(`/api/threads/${threadId}/annotations`); return { status: response.status, value: await response.json() }; }, execution.threadIds[0]);
  assert.equal(annotations.status, 200, JSON.stringify(annotations));
  const annotationResult = await review.evaluate(async (threadId) => {
    const request = async (path, body) => {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, value: await response.json() };
    };
    const base = `/api/threads/${threadId}/annotations`;
    const created = await request(base, { anchor: { kind: "thread" }, comment: "Browser proof", rating: 3 });
    if (created.status !== 201 && created.status !== 200) return { created };
    const annotation = created.value.annotation || created.value;
    const revised = await request(`${base}/${annotation.id}/revisions`, { expectedRevision: 1, comment: "Revised browser proof", rating: 4 });
    const retracted = await request(`${base}/${annotation.id}/retract`, { expectedRevision: 2 });
    return { created, revised, retracted };
  }, execution.threadIds[0]);
  for (const name of ["created", "revised", "retracted"]) assert.ok([200, 201].includes(annotationResult[name]?.status), JSON.stringify(annotationResult));
  const exported = await rpc(host.url, "exportAnnotations", [execution.id]);
  const bundle = await readFile(join(directory, "host", "eval-data", exported.bundleRef), "utf8");
  assert.ok(bundle.includes("Revised browser proof"));
  const fresh = await browser.newContext();
  const unauthorized = await fresh.newPage();
  await unauthorized.goto(new URL(reviewUrl).origin);
  assert.equal(await unauthorized.evaluate(async () => (await fetch('/eval-api/context')).status), 401);
  await fresh.close();
  const dashboard = await browser.newPage(); await dashboard.goto(host.url);
  const judgePopup = dashboard.context().waitForEvent("page");
  await dashboard.evaluate((id) => window.relayerEval.openJudgeReview(id), execution.id);
  const judgePage = await judgePopup;
  await judgePage.waitForLoadState();
  await until(async () => !(await judgePage.locator("#app").textContent()).includes("Loading"), "judge evidence");
  assert.ok(!(await judgePage.locator("#app").textContent()).includes("Could not open this analysis"));
  const tracePopup = dashboard.context().waitForEvent("page");
  await dashboard.evaluate(({ id, turn }) => window.relayerEval.openCandidateTrace(id, turn), { id: execution.id, turn: execution.turns[0].interactionId });
  const tracePage = await tracePopup; await tracePage.waitForLoadState();
  await until(async () => (await tracePage.locator("body").textContent()).includes("fixture-task-system"), "candidate trace");
  // Human task slice: the production composer remains writable under separate
  // scope; evidence is captured without paid inference or an alternate renderer.
  await dashboard.locator("#humanGrader").click();
  await dashboard.locator("#humanCase").selectOption("empty-project.task-system.two-turn");
  await dashboard.locator("#humanHarness").selectOption("fixture-human-task");
  await dashboard.locator('[name="maxCompletions"]').fill("2");
  await dashboard.locator("#humanEndpoint").fill("An explained task system and a refined response");
  await dashboard.locator("#humanCreate button").click();
  await dashboard.locator("#humanOpen").waitFor();
  const humanId = (await rpc(host.url, "humanTasks"))[0].id;
  // A completed matrix run continues polling while Human Grader is open.
  // Wait for an actual poll, rather than assuming a timer fired.
  await dashboard.waitForResponse((response) => response.url().endsWith("/eval-api/listRuns"));
  assert.equal(await dashboard.locator("#humanView").isVisible(), true);
  const taskPopup = dashboard.context().waitForEvent("page");
  await dashboard.locator("#humanOpen").click();
  const humanPage = await taskPopup;
  humanPage.on("pageerror", (error) => pageErrors.push(error.message));
  await humanPage.waitForLoadState();
  await until(async () => (await rpc(host.url, "humanTask", [humanId])).events.some((event) => event.kind === "presentation" && event.snapshot.graphVisible), "human first visible graph");
  assert.equal(await humanPage.evaluate(() => Boolean(window.relayerEvalReview)), false);
  await humanPage.evaluate(() => window.relayerHumanTask.workspaceLayout.set(0.64));
  const reopenedTask = await browser.newPage();
  await reopenedTask.goto(await rpc(host.url, "openHumanTask", [humanId]));
  assert.notEqual(new URL(reopenedTask.url()).origin, new URL(humanPage.url()).origin);
  await until(async () => (await reopenedTask.locator("#workspaceDivider").getAttribute("aria-valuenow")) === "64", "live task split restored across origins");
  assert.equal(await reopenedTask.evaluate(() => Boolean(window.relayerEvalReview)), false);
  await reopenedTask.close();

  for (const surface of [humanPage, review]) {
    assert.deepEqual(await surface.evaluate(async () => Promise.all([
      fetch("/api/model-settings/defaults", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" }).then((response) => response.status),
      fetch("/eval-api/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "[]" }).then((response) => response.status),
    ])), [403, 404], "task and review authority cannot change provider/model setup");
  }
  await humanPage.locator("#threadPrompt").fill("Explain how the workers coordinate.");
  try { await humanPage.locator("#sendInteraction:not([disabled])").click(); }
  catch (error) { console.error(await humanPage.locator("#sendInteraction").evaluate((element) => element.outerHTML)); throw error; }
  await until(async () => {
    const task = await rpc(host.url, "humanTask", [humanId]);
    return task.events.some((event) => event.kind === "presentation" && event.snapshot.completionStatus === "accepted" && String(event.snapshot.turnId) !== String(task.events.find((item) => item.kind === "thread_started").interactionId));
  }, "human follow-up accepted and observed");
  await humanPage.locator("#humanTaskGrading summary").click();
  await humanPage.locator('#humanTaskGrading [name="satisfaction"]').selectOption("3");
  await humanPage.locator('#humanTaskGrading [data-session-grade] [name="comment"]').fill("The follow-up helped.");
  await humanPage.getByRole("button", { name: "Save grade", exact: true }).click();
  await until(async () => (await humanPage.locator("[data-grade-status]").textContent()).includes("Grade saved"), "nonterminal grade saved");
  assert.equal((await rpc(host.url, "humanTask", [humanId])).status, "active");
  const liveMoment = (await rpc(host.url, "humanTask", [humanId])).events.find(event => event.kind === "presentation");
  await humanPage.locator('#humanTaskGrading [name="eventId"]').selectOption(liveMoment.id);
  await humanPage.locator('#humanTaskGrading form:not([data-session-grade]) [name="comment"]').fill("Live feedback");
  await humanPage.getByRole("button", { name: "Save moment annotation", exact: true }).click();
  await until(async () => (await humanPage.locator("[data-grade-status]").textContent()).includes("Moment annotation saved"), "live annotation saved");
  assert.equal((await rpc(host.url, "humanTask", [humanId])).status, "active");
  await humanPage.locator('#humanTaskGrading [name="reason"]').selectOption("endpoint_reached");
  await humanPage.getByRole("button", { name: "Finish task", exact: true }).click();
  await until(async () => (await humanPage.locator("[data-grade-status]").textContent()).includes("Task finished"), "workspace task finished");
  await until(async () => (await dashboard.locator("#humanOpen").textContent()).includes("Open graph review"), "dashboard switches to graph review after workspace finish");
  assert.equal(await dashboard.locator("#humanFinish").count(), 0);
  const humanFinished = await rpc(host.url, "humanTask", [humanId]);
  assert.equal(humanFinished.satisfaction.value, 3);
  assert.equal(humanFinished.satisfaction.comment, "The follow-up helped.");
  assert.equal(humanFinished.completions, 2);
  assert.equal(humanFinished.termination.success, null);
  assert.equal(humanFinished.responseTimings.length, 2);
  assert.equal(humanFinished.responseTimings[1].observerPresentBeforeSubmission, true);
  const humanMoment = humanFinished.events.find((event) => event.kind === "presentation" && event.snapshot.graphVisible);
  await humanPage.locator('#humanTaskGrading [name="eventId"]').selectOption(humanMoment.id);
  await humanPage.locator('#humanTaskGrading form:not([data-session-grade]) [name="comment"]').fill("First useful map.");
  await humanPage.getByRole("button", { name: "Save moment annotation", exact: true }).click();
  await until(async () => (await humanPage.locator("[data-grade-status]").textContent())  .includes("Moment annotation saved"), "workspace annotation saved");
  const humanReviewUrl = await rpc(host.url, "reviewHumanTask", [humanId]);
  const humanReview = await browser.newPage(); await humanReview.goto(humanReviewUrl);
  await humanReview.waitForFunction(() => Boolean(window.__evalPresentation?.snapshot()?.turnId));
  await humanReview.locator("#humanTaskGrading summary").first().click();
  await humanReview.locator('#humanTaskGrading [data-session-grade] [name="comment"]').fill("Reviewed inside the graph review page.");
  await humanReview.getByRole("button", { name: "Refresh session status", exact: true }).click();
  await until(async () => (await humanReview.locator("[data-grade-status]").textContent()) === "Session completed.", "review status refreshed");
  assert.equal(await humanReview.locator('#humanTaskGrading [data-session-grade] [name="comment"]').inputValue(), "Reviewed inside the graph review page.");
  await humanReview.route("**/eval-api/grade", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary grading failure" }) }));
  await humanReview.getByRole("button", { name: "Save grade", exact: true }).click();
  await until(async () => (await humanReview.locator("[data-grade-status]").textContent()) === "Temporary grading failure", "review save failure visible");
  assert.equal(await humanReview.locator('#humanTaskGrading [data-session-grade] [name="comment"]').inputValue(), "Reviewed inside the graph review page.");
  await humanReview.unroute("**/eval-api/grade");
  await humanReview.getByRole("button", { name: "Save grade", exact: true }).click();
  await until(async () => (await humanReview.locator("[data-grade-status]").textContent()).includes("Grade saved"), "archived graph review grade saved");
  assert.equal((await rpc(host.url, "humanTask", [humanId])).satisfaction.comment, "Reviewed inside the graph review page.");
  assert.equal(await humanReview.getByRole("button", { name: "Finish task", exact: true }).count(), 0);

  assert.equal(await humanReview.evaluate(async (threadId) => (await fetch(`/api/threads/${threadId}/interactions`, { method: "POST", body: '{}' })).status, humanFinished.threadIds[0]), 403);
  const humanExport = await rpc(host.url, "exportHumanTask", [humanId]);
  assert.equal(humanExport.bundle.session.annotations.at(-1).comment, "First useful map.");
  assert.equal(humanExport.bundle.session.conversations.length, 1);
  assert.ok(humanExport.sha256.startsWith("sha256:"));
  if (process.env.RELAYER_HUMAN_TASK_SCREENSHOT) {
    await dashboard.locator("#humanRefresh").click();
    await dashboard.locator("#humanExport").waitFor();
    await humanReview.screenshot({ path: process.env.RELAYER_HUMAN_TASK_SCREENSHOT, fullPage: true });
  }
  const discoveryTask = await rpc(host.url, "createHumanTask", [{ testCaseId: "interactive.planning.group-europe-trip", harnessConfigurationName: "fixture-human-task", maxCompletions: 3, endpoint: "An agreed itinerary" }]);
  const discoveryUrl = await rpc(host.url, "openHumanTask", [discoveryTask.id]);
  const discoveryPage = await browser.newPage();
  await discoveryPage.goto(discoveryUrl);
  await discoveryPage.locator("#humanTaskGrading summary").first().click();
  await discoveryPage.getByText("Private user brief · not sent to Relayer", { exact: true }).click();
  assert.ok((await discoveryPage.locator("#humanTaskGrading").innerText()).includes("$4,500"));
  assert.equal(await discoveryPage.getByRole("button", { name: "Finish task", exact: true }).isVisible(), true);
  await discoveryPage.close();
  console.log("PASS human task: live composer, recorded graph, two completions, finish, read-only review, annotation and export");
  assert.deepEqual(pageErrors, []);
  await host.close();
  await assert.rejects(fetch(new URL("/eval-api/context", reviewUrl)));
  const restarted = await launchHost();
  assert.equal((await rpc(restarted.url, "getRun", [run.id])).status, "passed");
  const reopenedHuman = await rpc(restarted.url, "humanTask", [humanId]);
  assert.equal(reopenedHuman.status, "completed");
  assert.equal(reopenedHuman.annotations.at(-1).comment, "First useful map.");
  await restarted.close();
  console.log("PASS host: real fixture, tab independence, review authority, judge/trace pages, shutdown and restart");

  // Exercise the actual judge adapter against the real product server, without inference.
  const root = resolve(".");
  const binaries = resolve(process.env.CARGO_TARGET_DIR || "target", "debug");
  const configurationPaths = [join(root, "harnesses/fixture-task-system.yaml"), join(root, "harnesses/codex-basic.yaml")];
  const data = join(directory, "judge");
  const runtime = new GraphCompleteRuntimeService({ userDataDirectory: data, graphServerBinary: join(binaries, "relayer-graph-server"), configurationPaths, additionalImplementations: { "fixture.task-system": taskSystemFixtureFactory } });
  resources.push(runtime);
  const product = new RelayerAppServerService({ userDataDirectory: data, binaryPath: join(binaries, "relayer-app-server"), webDirectory: join(root, "desktop/renderer"), permissionCatalogPath: join(root, "permissions/desktop.json"), runtimeSession: await runtime.start(), defaultHarnessConfiguration: "fixture-task-system", allowHarnessOverride: true, enableReadOnlySession: true });
  resources.push(product);
  const productSession = await product.start();
  await proveProductionSettings({ browser, product, productSession, runtime, data });
  const service = await new EvalService({ stateFile: join(data, "eval-data/test-runs.json"), productSession, configurationPaths }).open();
  const fixture = await service.createRun(selection);
  const completed = await until(() => { const value = service.getRun(fixture.id); return ["passed", "failed", "error", "interrupted"].includes(value.status) ? value : null; }, "judge fixture");
  assert.equal(completed.status, "passed");
  const candidate = completed.executions[0];
  const turn = candidate.turns[0];
  const opened = await openBrowserReview({ browser, productSession, context: service.reviewContext(candidate.id), executionId: candidate.id, threadId: candidate.threadIds[0], turnId: turn.interactionId, rootLayerId: turn.rootLayerId, artifactDirectory: join(directory, "screenshots") });
  const judgeContext = browser.contexts().find((context) => context.pages().some((page) => page.url().startsWith(productSession.origin)));
  assert.ok(judgeContext);
  assert.deepEqual((await judgeContext.cookies()).map(({ name }) => name), [productSession.readOnlyCookie.name]);
  const denied = await judgeContext.pages()[0].evaluate(async (id) => (await fetch(`/api/threads/${id}/annotations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anchor: { kind: "thread" }, comment: "forbidden" }) })).status, candidate.threadIds[0]);
  assert.equal(denied, 401);
  const shot = await opened.session.screenshot({ target: { kind: "viewport" }, label: "Fixture review" });
  assert.equal(shot.ok, true); assert.ok(shot.screenshot.tiles[0].width > 0);
  if (process.env.RELAYER_EVAL_WEB_SCREENSHOT) {
    await writeFile(process.env.RELAYER_EVAL_WEB_SCREENSHOT, await readFile(join(opened.session.artifactDirectoryFor(shot.screenshot.screenshotId), `${shot.screenshot.screenshotId}-001.png`)));
  }
  const initial = await opened.session.state();
  // Opening a layer may already select its default node (PRD NDT-003).
  const nodeControl = initial.controls.find((control) => control.kind === "node" && !control.disabled
    && control.elementRef !== `node-${initial.selectedNodeId}`);
  assert.ok(nodeControl, "The review fixture must expose a different selectable node");
  await opened.session.interact({ elementRef: nodeControl.elementRef, activate: true });
  const selected = await opened.session.state();
  assert.ok(selected.selectedNodeId);
  assert.notEqual(selected.selectedNodeId, initial.selectedNodeId);
  assert.equal(`node-${selected.selectedNodeId}`, nodeControl.elementRef);
  const nextTurn = (await opened.session.state()).controls.find((control) => control.kind === "turn" && !control.disabled);
  assert.ok(nextTurn);
  await opened.session.interact({ elementRef: nextTurn.elementRef, activate: true });
  assert.notEqual((await opened.session.state()).turnId, initial.turnId);
  await opened.session.history({ delta: -1 });
  assert.equal((await opened.session.state()).turnId, initial.turnId);
  await opened.session.history({ delta: 1 });
  assert.notEqual((await opened.session.state()).turnId, initial.turnId);
  await opened.session.history({ delta: -1 });
  const region = (await opened.session.state()).controls.find((control) => control.kind === "capture-region");
  assert.ok(region);
  const full = await opened.session.screenshot({ target: { kind: "element", elementRef: region.elementRef }, mode: "full", label: "Full review region" });
  assert.equal(full.ok, true);
  assert.equal((await opened.session.state()).layerId, String(turn.rootLayerId));
  const metadata = JSON.parse(await readFile(join(opened.session.artifactDirectoryFor(shot.screenshot.screenshotId), "metadata.json"), "utf8"));
  assert.equal(metadata.contentDigest, shot.screenshot.contentDigest);
  await opened.release({ close: true });
  console.log("PASS judge: isolated context, exact execution/turn readiness, viewport/full capture and restoration");
} finally {
  const errors = [];
  for (const resource of resources.reverse()) { try { await resource.close(); } catch (error) { errors.push(error); } }
  await rm(directory, { recursive: true, force: true });
  if (errors.length) throw new AggregateError(errors, "Eval browser proof cleanup failed");
}

async function proveProductionSettings({ browser, product, productSession, runtime, data }) {
  const connected = new Set();
  let pendingDefinitionId;
  let loginCount = 0;
  let closeCount = 0;
  let discoveryCount = 0;
  const registry = createProviderAdapterRegistry([{
    adapterId: "codex-subscription", implementationVersion: "1", label: "Fixture subscription",
    accessContract: "managed-runtime@1", connection: { mode: "managed-login" },
    create: ({ definition, environment }) => ({
      providerId: definition.id,
      credentials: {
        login: async () => { pendingDefinitionId = definition.id; loginCount++; return { authUrl: "https://provider.example/login" }; },
        account: async () => ({ status: connected.has(definition.id) ? "connected" : "disconnected" }),
        logout: async () => { connected.delete(definition.id); return { status: "disconnected" }; },
      },
      discover: async () => {
        discoveryCount++;
        if (!connected.has(definition.id)) return unavailableModelCatalogSnapshot({ providerId: definition.id, providerLabel: definition.label }, "Fixture subscription is disconnected.");
        return { provider: { id: definition.id, label: definition.label, status: "available" },
          systemFamily: { id: definition.id, label: definition.label, modelIds: ["fixture-model"] },
          models: [{ id: "fixture-model", executionModel: "fixture-model", label: "Fixture model", availability: "available", visible: true,
            description: "Deterministic settings fixture", unavailableReason: null, availabilityNotice: null, isDefault: true,
            replacementModelId: null, upgradeInfo: null, supportedEfforts: [], defaultEffort: null,
            inputModalities: ["text"], supportsPersonality: false, serviceTiers: [], defaultServiceTier: null }],
        };
      },
      executionAccess: async () => ({ kind: "managed-runtime", runtimeId: "codex", environment }),
      close: async () => { closeCount++; },
    }),
  }]);
  const descriptor = { runtimeId: "codex", version: "0.147.0", executable: "/fixture/codex" };
  const providerSetup = createEvalProviderSetup({ userDataDirectory: data, productServer: product, productSession,
    runtimeSession: await runtime.start(), graphRuntime: runtime, registry,
    runtimeResolver: { get: async () => descriptor, prepare: async () => descriptor },
  });
  resources.push(providerSetup);
  await providerSetup.start();
  const settingsSurface = await createSettingsSurface({ productSession, providerSetup });
  resources.push(settingsSurface);
  const dashboardSurface = await createEvalDashboard({ rendererDirectory: resolve("desktop/eval-renderer"),
    service: { catalog: () => ({ cases: [], harnessConfigurations: [], judges: [] }), listRuns: () => [] },
    openSettings: () => settingsSurface.url,
  });
  resources.push(dashboardSurface);
  const context = await browser.newContext();
  const pageErrors = [];
  context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.message)));
  await context.route("https://provider.example/**", (route) => route.fulfill({ contentType: "text/html", body: "Fixture authorization" }));
  const dashboard = await context.newPage(); await dashboard.goto(dashboardSurface.url);
  const popup = context.waitForEvent("page"); await dashboard.locator("#evalSettings").click();
  const page = await popup; await page.waitForLoadState();
  await page.waitForFunction(() => typeof document.querySelector("#newProviderDefinition")?.onclick === "function", null, { timeout: 10_000 }).catch(async (error) => { console.error(await page.locator("#settingsView").textContent(), pageErrors); throw error; });
  async function beginLogin() {
    await page.locator("#newProviderDefinition").click();
    await page.locator('[data-provider-adapter="codex-subscription"]').click();
    await page.locator("#providerField-label").fill("Eval fixture");
    await page.locator("[data-provider-dialog-connect]").click();
    await until(async () => (await page.locator("#providerDialogStatus").textContent()).includes("Complete sign-in"), "provider pending login");
  }
  const initialDefinitions = (await providerSetup.status()).definitions;
  await beginLogin();
  const cancelled = page.waitForResponse((response) => response.url().endsWith("/eval-api/cancelConnection"));
  await page.getByRole("button", { name: "Close provider dialog", exact: true }).click();
  assert.equal((await cancelled).status(), 200);
  await until(() => closeCount > 0, "provider login cancellation releases runtime");
  assert.deepEqual((await providerSetup.status()).definitions, initialDefinitions);
  await beginLogin();
  connected.add(pendingDefinitionId);
  await until(async () => (await page.locator("#providerSettingsStatus").textContent()).includes("Provider connected"), "provider login and discovery");
  assert.equal(loginCount, 2);
  const definition = (await providerSetup.status()).definitions.find((value) => value.label === "Eval fixture");
  assert.equal(definition.connected, true);
  const previousDiscoveryCount = discoveryCount;
  await page.locator("#refreshProviderCatalogs").click();
  await until(() => discoveryCount > previousDiscoveryCount, "provider refresh");
  await page.locator('[data-settings-tab="models"]').click();
  await page.locator("#newModelFamily").click();
  await page.locator("#familyNameInput").fill("My eval models");
  assert.equal(await page.locator('[data-member-model="0"]').inputValue(), "fixture-model");
  await page.locator("#saveFamilyEdit").click();
  await until(async () => (await productSettings()).families.some((family) => family.name === "My eval models"), "custom family persisted through production API");
  const customFamily = (await productSettings()).families.find((family) => family.name === "My eval models");
  assert.equal(customFamily.members[0].providerId, definition.id);
  await page.locator("#defaultHarnessSelect").selectOption("codex-basic");
  await until(async () => (await page.locator("#modelSettingsStatus").textContent()) === "Saved", "default harness saved");
  await page.locator("#defaultProviderSelect").selectOption(definition.id);
  await until(async () => { const settings = await productSettings(); return settings.defaults.harnessId === "codex-basic" && settings.defaults.providerId === definition.id; }, "model defaults persisted");
  await page.locator("#evalDefaultFamilySelect").selectOption(String(customFamily.id));
  await until(async () => (await productSettings()).defaults.familyId === customFamily.id, "default custom family persisted");
  await page.locator('[data-settings-tab="harnesses"]').click();
  await page.locator('[data-harness-configuration="codex-basic"]').waitFor({ state: "visible" });
  assert.ok((await page.locator('[data-harness-configuration="codex-basic"]').textContent()).includes("Default harness"));
  await page.reload();
  await page.locator('[data-settings-tab="models"]').click();
  await until(async () => (await page.locator("#defaultHarnessSelect").inputValue()) === "codex-basic", "settings reload default");
  await until(async () => (await page.locator("#defaultProviderSelect").inputValue()) === definition.id, "settings reload provider").catch(async (error) => { console.error(JSON.stringify(await productSettings())); throw error; });
  await until(async () => (await page.locator("#evalDefaultFamilySelect").inputValue()) === String(customFamily.id), "settings reload selected family");
  assert.equal((await productSettings()).defaults.familyId, customFamily.id);
  // Copy the visible URL into a separate browser session with no shared storage.
  const otherBrowser = await browser.newContext();
  try {
    const copiedPage = await otherBrowser.newPage();
    const rootSettingsUrl = new URL(page.url()); rootSettingsUrl.search = "";
    await copiedPage.goto(rootSettingsUrl.href);
    await copiedPage.locator("#newProviderDefinition").waitFor({ state: "visible" });
    await until(async () => await copiedPage.locator("#newProviderDefinition").isEnabled(), "copied settings link authorized");
    await copiedPage.locator("#newProviderDefinition").click();
    await copiedPage.locator("#providerDialog").waitFor({ state: "visible" });
    await copiedPage.getByRole("button", { name: "Close provider dialog", exact: true }).click();
    await copiedPage.locator('[data-settings-tab="models"]').click();
    await until(async () => (await copiedPage.locator("#evalDefaultFamilySelect").inputValue()) === String(customFamily.id), "copied settings family");
    await copiedPage.getByRole("button", { name: "Back to Eval", exact: true }).click();
    await copiedPage.locator("#emptyNewRun").waitFor({ state: "visible" });
    assert.equal(new URL(copiedPage.url()).origin, dashboardSurface.origin);
    const returnedRuns = await copiedPage.evaluate(() => window.relayerEval.listRuns());
    assert.deepEqual(returnedRuns, [], "return navigation retains dashboard authorization in fresh storage");
  } finally { await otherBrowser.close(); }
  const selected = await providerSetup.select("codex-basic");
  assert.equal(selected.familyId, customFamily.id);
  assert.equal(selected.providerId, definition.id);
  assert.equal(selected.modelId, "fixture-model");
  await page.locator('[data-settings-tab="providers"]').click();
  await page.locator(`[data-provider-logout="${definition.id}"]`).click();
  await until(async () => (await providerSetup.status()).definitions.find((value) => value.id === definition.id).connected === false, "provider logout");
  await page.locator(`[data-provider-reconnect="${definition.id}"]`).click();
  await until(() => loginCount === 3, "provider reconnect login");
  connected.add(pendingDefinitionId);
  await until(async () => (await providerSetup.status()).definitions.find((value) => value.id === definition.id).connected === true, "provider reconnect complete");
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log("PASS Eval Settings: production Providers, login/cancel/reconnect, model refresh, persisted families/defaults and Harnesses (fake provider; no inference)");
  async function productSettings() {
    const response = await fetch(new URL("/api/model-settings", productSession.origin), { headers: { Cookie: `${productSession.cookie.name}=${productSession.cookie.value}` } });
    assert.equal(response.status, 200); return response.json();
  }
}
