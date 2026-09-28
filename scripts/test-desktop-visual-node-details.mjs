import { runEvidenceCleanup } from "./evidence-service-cleanup.mjs";
import { app, BrowserWindow, ipcMain } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { nodeDetailFixtureFactory } from "@relayer/eval-runner";

import { EvalService } from "../desktop/eval-main/eval-service.mjs";
import { ReviewSession } from "../desktop/eval-main/review-session.mjs";
import { loadReadyReviewWorkspace } from "../desktop/eval-main/review-workspace-readiness.mjs";
import { GraphCompleteRuntimeService } from "../desktop/main/services/graphcomplete-runtime.mjs";
import { RelayerAppServerService } from "../desktop/main/services/relayer-app-server.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const dataDirectory = mkdtempSync(join(tmpdir(), "relayer-visual-node-detail-"));
const evidenceRoot = resolve(
  process.env.RELAYER_VISUAL_NODE_DETAIL_EVIDENCE_DIR
    || join(repositoryRoot, ".relayer", "evidence", "visual-node-details"),
);
const artifactDirectory = join(
  evidenceRoot,
  `run-${new Date().toISOString().replaceAll(":", "-")}-${randomBytes(4).toString("hex")}`,
);
const stateFile = join(dataDirectory, "eval-data", "test-runs.json");
const configurationPath = join(repositoryRoot, "harnesses", "fixture-node-detail.yaml");
const resultFile = process.env.RELAYER_VISUAL_NODE_DETAIL_RESULT_FILE || null;
const services = [];
let evalService;
let productSession;
let reviewWindow;
let keepaliveWindow;

app.setName("Relayer Visual Node Detail Evidence");
app.setPath("userData", join(dataDirectory, "electron-profile"));
app.commandLine.appendSwitch("disable-gpu");
// The final window closes before asynchronous service cleanup and result output.
// Keep the process alive until the explicit success/failure exit below.
app.on("window-all-closed", () => {});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function productRequest(session, path, options = {}) {
  const response = await fetch(new URL(path, session.origin), {
    ...options,
    headers: {
      Accept: "application/json",
      ...options.headers,
      Cookie: `${session.cookie.name}=${session.cookie.value}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(value.error || value.message || `Product request failed (${response.status}).`);
    error.status = response.status;
    error.code = value.code;
    throw error;
  }
  return value;
}

async function waitForCompletedRun(runId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = evalService.getRun(runId);
    if (!["queued", "running"].includes(run.status)) {
      await evalService.persistTail;
      return run;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Visual Node Detail Eval run did not finish: ${JSON.stringify(evalService.getRun(runId))}`);
}

async function waitForRenderedAsset(window, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript(`(() => {
      const image = document.querySelector('.node-detail-runtime-host')?.shadowRoot?.querySelector('img');
      return image ? {
        alt: image.alt,
        assetState: image.dataset.assetState,
        sourceProtocol: image.src ? new URL(image.src).protocol : null,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
      } : null;
    })()`);
    if (result?.assetState === "available" && result.sourceProtocol === "blob:"
      && result.complete && result.naturalWidth > 0) return result;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error("Accepted visual asset did not load through the production Node Detail runtime.");
}

async function inspectTheme(window, theme, editable = false) {
  const result = await window.webContents.executeJavaScript(`(async () => {
    const { applyAppearance } = await import('./src/ui.js');
    const host = document.querySelector('.node-detail-runtime-host');
    const root = host.shadowRoot;
    const input = root.querySelector('input');
    const themeScope = root.querySelector('gc-detail-theme');
    const originalInput = input;
    const originalPage = root.querySelector('.summary');
    const beforeCss = root.adoptedStyleSheets.map(sheet => [...sheet.cssRules].map(rule => rule.cssText).join('')).join('');
    if (${editable}) {
      if (input.disabled) throw new Error('Product input is disabled');
      input.value = 'Keep energy for dinner and lights';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      input.setSelectionRange(5, 11);
    }
    const beforeValue = input.value;
    const scroll = document.querySelector("#detailContent");
    const beforeScroll = scroll.scrollTop;
    applyAppearance(${JSON.stringify(theme)});
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const color = element => getComputedStyle(element).color;
    const background = element => getComputedStyle(element).backgroundColor;
    const luminance = color => {
      const channels = color.match(/[\\d.]+/g).slice(0, 3).map(Number).map(n => {
        const c = n / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
      });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const contrast = (a, b) => { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
    const visible = [...root.querySelectorAll('img')].filter(image => getComputedStyle(image).display !== 'none');
    await Promise.all(visible.map(image => image.decode()));
    const text = root.querySelector('.summary');
    const bar = root.querySelector('.midday');
    const afterCss = root.adoptedStyleSheets.map(sheet => [...sheet.cssRules].map(rule => rule.cssText).join('')).join('');
    return {
      theme: themeScope.dataset.relayerTheme, value: input.value,
      sameInput: input === root.querySelector('input'), samePage: originalPage === root.querySelector('.summary'),
      scrollPreserved: scroll.scrollTop === beforeScroll,
      valuePreserved: beforeValue === input.value, cssPreserved: beforeCss === afterCss,
      focusPreserved: !${editable} || (root.activeElement === originalInput && input.selectionStart === 5 && input.selectionEnd === 11),
      disabled: input.disabled, textColor: color(text), surface: background(themeScope),
      contrast: { text: contrast(color(text), background(themeScope)),
        chartLabel: contrast(color(bar), background(bar)), control: contrast(color(input), background(input)) },
      visibleAssets: visible.map(image => ({ alt: image.alt, width: image.naturalWidth, source: new URL(image.src).protocol })),
    };
  })()`);
  invariant(result.theme === theme && result.sameInput && result.samePage && result.valuePreserved && result.focusPreserved && result.scrollPreserved && result.cssPreserved,
    `Theme switch reset authored state: ${JSON.stringify(result)}`);
  invariant(result.disabled === !editable, `Theme switch changed control authority: ${JSON.stringify(result)}`);
  invariant(Object.values(result.contrast).every(value => value >= 4.5), `Theme contrast failed: ${JSON.stringify(result)}`);
  invariant(result.visibleAssets.length === 1 && result.visibleAssets[0].width > 0 && result.visibleAssets[0].source === 'blob:'
    && result.visibleAssets[0].alt === `Accepted detail status illustration${theme === 'light' ? ' light' : ''}`,
    `Wrong theme asset: ${JSON.stringify(result)}`);
  return result;
}

async function captureReviewThemes(window, session, label) {
  const results = [];
  for (const theme of ['light', 'dark']) {
    const inspection = await inspectTheme(window, theme);
    const shot = await session.screenshot({ target: { kind: 'element', elementRef: 'node-detail' }, mode: 'full', label: `${label} ${theme}` });
    invariant(shot.screenshot.tileCount >= 1, 'Theme screenshot missing');
    results.push({ ...inspection, screenshot: shot.screenshot,
      screenshotDirectory: session.artifactDirectoryFor(shot.screenshot.screenshotId) });
  }
  return results;
}

async function captureProductThemes(threadId, turnId, nodeId) {
  const window = new BrowserWindow({ width: 1400, height: 1200, show: true,
    webPreferences: { partition: `theme-product-${randomBytes(8).toString('hex')}`, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  try {
    await window.webContents.session.cookies.set({ url: productSession.origin, name: productSession.cookie.name,
      value: productSession.cookie.value, httpOnly: true, sameSite: 'strict', secure: false });
    await window.loadURL(`${productSession.origin}/?threadId=${threadId}&interactionId=${turnId}`);
    const deadline = Date.now() + 15_000;
    let ready = false;
    let selected = false;
    while (Date.now() < deadline && !ready) {
      const found = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-node="${nodeId}"]'))`);
      if (found && !selected) {
        await window.webContents.executeJavaScript(`document.querySelector('[data-node="${nodeId}"]').click()`);
        selected = true;
      }
      ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.node-detail-runtime-host')?.shadowRoot?.querySelector('input:not(:disabled)'))`);
      if (!ready) await new Promise(resolveWait => setTimeout(resolveWait, 25));
    }
    invariant(ready, 'Mutable Product detail did not become ready');
    const results = [];
    for (const theme of ['light', 'dark', 'light']) {
      const inspection = await inspectTheme(window, theme, true);
      // Use the same paint-fenced tiled capture implementation as Eval, without
      // creating a read-only session or changing this Product window's authority.
      const plan = await window.webContents.executeJavaScript(`(async () => {
        const { createReviewPresentationAdapter } = await import('./src/review-tools.js');
        window.themeEvidenceCapture = createReviewPresentationAdapter({ executionId: 'theme-product',
          root: document, windowObject: window, getPresentationState: () => ({}), navigateHistory: async () => {} });
        return window.themeEvidenceCapture.capturePlan({ target: { kind: 'element', elementRef: 'node-detail' }, mode: 'full' });
      })()`);
      const screenshotPaths = [];
      try {
        for (const tile of plan.tiles) {
          const prepared = await window.webContents.executeJavaScript(`window.themeEvidenceCapture.prepareCaptureTile(${JSON.stringify(tile)})`);
          const path = join(artifactDirectory, `product-${results.length}-${theme}-${tile.index}.png`);
          await writeFile(path, (await window.webContents.capturePage(prepared.clip)).toPNG());
          screenshotPaths.push(path);
        }
      } finally { await window.webContents.executeJavaScript('window.themeEvidenceCapture.restoreCapture()'); }
      invariant(screenshotPaths.length > 0, 'Product screenshot tiles missing');
      results.push({ ...inspection, screenshotPaths });
    }
    return results;
  } finally { window.destroy(); }
}

function controlByName(state, name, kind) {
  return state.controls.find((control) => control.name === name && (!kind || control.kind === kind));
}

async function ensureReviewNodeSelected(session, control, targetNodeId) {
  invariant(control?.kind === "node" && !control.disabled,
    `The authored review node is not discoverable and enabled: ${JSON.stringify(control)}`);
  let state = await session.state();
  if (String(state.selectedNodeId) !== String(targetNodeId)) {
    await session.interact({ elementRef: control.elementRef, activate: true });
    state = await session.state();
  }
  invariant(String(state.selectedNodeId) === String(targetNodeId),
    `Review did not select the exact authored node ${String(targetNodeId)}: ${JSON.stringify(state)}`);
  return state;
}

async function openReview({ execution, threadId, turnId, rootLayerId }) {
  const context = evalService.reviewContext(execution.id);
  invariant(context.readOnly === true, "Eval review context is not server-enforced read-only.");
  const navigationToken = randomBytes(16).toString("hex");
  const partition = `relayer-visual-node-detail-${randomBytes(12).toString("hex")}`;
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    show: true,
    backgroundColor: "#0b0c0d",
    webPreferences: {
      preload: join(repositoryRoot, "desktop", "preload", "eval-review.cjs"),
      additionalArguments: [`--relayer-eval-execution=${execution.id}`],
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await window.webContents.session.cookies.set({
    url: productSession.origin,
    name: productSession.readOnlyCookie.name,
    value: productSession.readOnlyCookie.value,
    httpOnly: true,
    sameSite: "strict",
    secure: false,
  });
  try {
    await loadReadyReviewWorkspace({
      window,
      ipc: ipcMain,
      url: `${productSession.origin}/?threadId=${encodeURIComponent(threadId)}`
        + `&interactionId=${encodeURIComponent(turnId)}&review=1`
        + `&reviewSession=${encodeURIComponent(navigationToken)}`,
      expected: { executionId: execution.id, threadId, turnId, navigationToken },
    });
  } catch (error) {
    const diagnostic = await window.webContents.executeJavaScript(`({
      url: location.href,
      body: document.body?.innerText?.slice(0, 2000),
      toast: document.querySelector('#toast')?.textContent,
      hasReviewBridge: Boolean(window.relayerEvalReview),
    })`).catch(() => null);
    throw new Error(`${error.message} Diagnostic: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  const session = new ReviewSession({
    executionId: execution.id,
    readOnly: true,
    webContents: window.webContents,
    artifactDirectory,
    ipc: ipcMain,
    loadInputDraftRevision: async (selectedThreadId) => {
      const state = await productRequest(productSession, `/api/state?threadId=${encodeURIComponent(selectedThreadId)}`);
      return state.inputDraftRevision;
    },
  });
  const state = await session.open();
  invariant(String(state.layerId) === String(rootLayerId), "Review opened outside the accepted root layer.");
  return { window, session, state };
}

async function run() {
  keepaliveWindow = new BrowserWindow({ width: 1, height: 1, show: false });
  await mkdir(artifactDirectory, { recursive: true });
  const runtime = new GraphCompleteRuntimeService({
    userDataDirectory: dataDirectory,
    graphServerBinary: join(repositoryRoot, "target", "debug", "relayer-graph-server"),
    configurationPaths: [configurationPath],
    additionalImplementations: { "fixture.node-detail": nodeDetailFixtureFactory },
  });
  services.push(runtime);
  const runtimeSession = await runtime.start();
  const product = new RelayerAppServerService({
    userDataDirectory: dataDirectory,
    binaryPath: join(repositoryRoot, "target", "debug", "relayer-app-server"),
    webDirectory: join(repositoryRoot, "desktop", "renderer"),
    permissionCatalogPath: join(repositoryRoot, "permissions", "desktop.json"),
    runtimeSession,
    defaultHarnessConfiguration: "fixture-node-detail",
    allowHarnessOverride: true,
    allowConversationImport: true,
    enableReadOnlySession: true,
    exportProducer: {
      desktopVersion: "visual-node-detail-evidence",
      buildCommit: "0000000000000000000000000000000000000000",
      platform: process.platform,
      architecture: process.arch,
    },
  });
  services.push(product);
  productSession = await product.start();
  evalService = await new EvalService({
    stateFile,
    productSession,
    configurationPaths: [configurationPath],
    conversationImportEnabled: true,
  }).open();
  ipcMain.handle("relayer-eval:review-context", (_event, executionId) => evalService.reviewContext(executionId));

  const created = await evalService.createRun({
    testCaseIds: ["empty-project.visual-node-detail.single-turn"],
    harnessConfigurationNames: ["fixture-node-detail"],
    judgeConfigurationName: "deterministic-graph-contract",
  });
  const completed = await waitForCompletedRun(created.id);
  const execution = completed.executions[0];
  const threadId = execution.threadIds[0];
  const thread = await productRequest(productSession, `/api/threads/${encodeURIComponent(threadId)}`);
  invariant(completed.status === "passed", `Deterministic fixture failed: ${JSON.stringify({ completed, thread })}`);
  const turn = thread.interactions.find((interaction) => interaction.completionStatus === "accepted");
  invariant(turn?.completionOutput, "Fixture did not produce ordinary accepted product state.");
  const rootLayer = turn.completionOutput.rootLayer;
  const authoredNode = rootLayer.nodes.find((node) => node.title === "Accepted Visual Node Detail");
  invariant(authoredNode?.authoredDetail?.version === 1, "Accepted node is missing its canonical authored package.");
  invariant(JSON.stringify(authoredNode.authoredDetail.components.map(({ id }) => id))
    === JSON.stringify(["primary", "status", "facts", "visual", "navigation", "actions"]), "Authored component order drifted.");
  invariant(authoredNode.authoredDetail.assets.length === 2, "Accepted package did not retain its pinned visual asset.");
  const [acceptedAsset] = authoredNode.authoredDetail.assets;
  invariant(acceptedAsset.mediaType === "image/svg+xml" && /^[a-f0-9]{64}$/.test(acceptedAsset.digestSha256),
    "Accepted package visual asset pin is invalid.");

  const opened = await openReview({
    execution,
    threadId,
    turnId: turn.id,
    rootLayerId: rootLayer.layer.id,
  });
  reviewWindow = opened.window;
  let session = opened.session;
  let state = opened.state;
  const nodeControl = controlByName(state, "Open Accepted Visual Node Detail", "node");
  invariant(nodeControl, `Authored node is not discoverable: ${JSON.stringify(state.controls)}`);
  state = await ensureReviewNodeSelected(session, nodeControl, authoredNode.id);
  const renderedAsset = await waitForRenderedAsset(reviewWindow);
  invariant(renderedAsset.alt === "Accepted detail status illustration", "Rendered visual asset lost its accessible label.");
  const themeEvidence = { eval: await captureReviewThemes(reviewWindow, session, "Accepted Eval detail") };
  themeEvidence.product = await captureProductThemes(threadId, turn.id, authoredNode.id);
  const expectedControls = [
    ["Open implementation notes", "navigate-action", false],
    ["Open referenced evidence", "navigate-action", false],
    ["Open fixture documentation", "link", true],
    ["Investigate follow-up", "invoke-action", true],
    ["Review note", "input-action", true],
  ];
  for (const [name, kind, disabled] of expectedControls) {
    const control = controlByName(state, name, kind);
    invariant(control && control.disabled === disabled, `Unexpected review control ${name}: ${JSON.stringify(control)}`);
  }
  const screenshot = await session.screenshot({
    target: { kind: "element", elementRef: "node-detail" },
    mode: "full",
    label: "Accepted visual Node Detail in read-only Product workspace",
  });
  invariant(screenshot.screenshot.tileCount >= 1, "Full Node Detail screenshot produced no tiles.");
  const screenshotDirectory = session.artifactDirectoryFor(screenshot.screenshot.screenshotId);
  invariant(screenshotDirectory, "ReviewSession did not retain the screenshot artifact directory.");

  const expand = controlByName(state, "Open implementation notes", "navigate-action");
  await session.interact({ elementRef: expand.elementRef, activate: true });
  let expanded = await session.state();
  invariant(expanded.navigationPath.some((entry) => String(entry.viaActionId) === String(expand.actionId)), "Expand action is absent from the review path.");
  await session.history({ delta: -1 });
  state = await session.state();
  invariant(String(state.layerId) === String(rootLayer.layer.id), "Back history did not restore the root layer.");
  const reference = controlByName(state, "Open referenced evidence", "navigate-action");
  await session.interact({ elementRef: reference.elementRef, activate: true });
  const referenced = await session.state();
  invariant(referenced.navigationPath.some((entry) => String(entry.viaActionId) === String(reference.actionId)), "Reference action is absent from the review path.");
  await session.history({ delta: -1 });

  const readOnlySession = { ...productSession, cookie: productSession.readOnlyCookie };
  let rejected;
  try {
    await productRequest(readOnlySession, `/api/threads/${encodeURIComponent(threadId)}/interactions`, {
      method: "POST",
      body: JSON.stringify({ text: "Attempt a forbidden review mutation." }),
    });
  } catch (error) {
    rejected = error;
  }
  invariant(rejected?.status === 403 && rejected?.code === "read_only_session", "Read-only server authority accepted a mutation.");

  const beforeReopen = await session.state();
  reviewWindow.destroy();
  reviewWindow = undefined;
  const reopened = await openReview({ execution, threadId, turnId: turn.id, rootLayerId: rootLayer.layer.id });
  reviewWindow = reopened.window;
  session = reopened.session;
  state = reopened.state;
  invariant(String(state.layerId) === String(rootLayer.layer.id), "Reopened review did not restore accepted root state.");
  invariant(state.threadRevision === beforeReopen.threadRevision, "Reopened review observed a different immutable thread revision.");
  const reopenedNodeControl = controlByName(state, "Open Accepted Visual Node Detail", "node");
  state = await ensureReviewNodeSelected(session, reopenedNodeControl, authoredNode.id);
  const reopenedAsset = await waitForRenderedAsset(reviewWindow);
  themeEvidence.reopened = await captureReviewThemes(reviewWindow, session, "Reopened Eval detail");

  const exportPath = join(artifactDirectory, "conversation.jsonl");
  await writeFile(exportPath, await product.exportConversation(threadId), { mode: 0o600 });
  const importedRun = await evalService.importConversation(exportPath);
  const importedExecution = importedRun.executions[0];
  const importedThreadId = importedExecution.threadIds[0];
  const importedThread = await productRequest(productSession, `/api/threads/${encodeURIComponent(importedThreadId)}`);
  const importedTurn = importedThread.interactions.find((interaction) => interaction.completionStatus === "accepted");
  const importedRoot = importedTurn?.completionOutput?.rootLayer;
  const importedNode = importedRoot?.nodes.find((node) => node.title === "Accepted Visual Node Detail");
  invariant(importedNode?.authoredDetail?.assets?.[0]?.digestSha256 === acceptedAsset.digestSha256,
    "Conversation import did not preserve the accepted visual asset pin.");
  reviewWindow.destroy();
  reviewWindow = undefined;
  const importedReview = await openReview({
    execution: importedExecution,
    threadId: importedThreadId,
    turnId: importedTurn.id,
    rootLayerId: importedRoot.layer.id,
  });
  reviewWindow = importedReview.window;
  session = importedReview.session;
  state = importedReview.state;
  const importedNodeControl = controlByName(state, "Open Accepted Visual Node Detail", "node");
  state = await ensureReviewNodeSelected(session, importedNodeControl, importedNode.id);
  const importedAsset = await waitForRenderedAsset(reviewWindow);
  invariant(JSON.stringify(importedNode.authoredDetail) === JSON.stringify(authoredNode.authoredDetail), "Import changed the authored theme package");
  themeEvidence.imported = await captureReviewThemes(reviewWindow, session, "Imported Eval detail");
  const unchangedThread = await productRequest(productSession, `/api/threads/${encodeURIComponent(threadId)}`);
  const unchangedNode = unchangedThread.interactions.find(item => item.id === turn.id).completionOutput.rootLayer.nodes.find(item => item.id === authoredNode.id);
  invariant(JSON.stringify(unchangedNode.authoredDetail) === JSON.stringify(authoredNode.authoredDetail), "Theme switching changed accepted package bytes");
  const importedScreenshot = await session.screenshot({
    target: { kind: "element", elementRef: "node-detail" },
    mode: "full",
    label: "Imported accepted visual Node Detail with portable image bytes",
  });
  const importedScreenshotDirectory = session.artifactDirectoryFor(importedScreenshot.screenshot.screenshotId);
  invariant(importedScreenshotDirectory && importedScreenshot.screenshot.tileCount >= 1,
    "Imported image evidence was not retained by ReviewSession.");

  let primeVisual;
  if (process.env.RELAYER_PRIME_VISUAL_EXPORT) {
    const primeRun = await evalService.importConversation(process.env.RELAYER_PRIME_VISUAL_EXPORT);
    const primeExecution = primeRun.executions[0];
    const primeThreadId = primeExecution.threadIds[0];
    const primeThread = await productRequest(productSession, `/api/threads/${primeThreadId}`);
    const primeTurn = primeThread.interactions.find((item) => item.completionStatus === "accepted");
    const primeRoot = primeTurn.completionOutput.rootLayer;
    const primeNode = primeRoot.nodes.find((item) => item.title === "Prime visual answer");
    invariant(primeNode?.authoredDetail?.assets.length === 1, "Prime export lost its compiled image pin");
    reviewWindow.destroy();
    const primeReview = await openReview({ execution: primeExecution, threadId: primeThreadId, turnId: primeTurn.id, rootLayerId: primeRoot.layer.id });
    reviewWindow = primeReview.window;
    const primeControl = controlByName(primeReview.state, "Open Prime visual answer", "node");
    const primeState = await ensureReviewNodeSelected(primeReview.session, primeControl, primeNode.id);
    const primeAsset = await waitForRenderedAsset(reviewWindow);
    invariant(controlByName(primeState, "Continue", "invoke-action")?.disabled === true, "Prime invoke escaped review authority");
    const primeScreenshot = await primeReview.session.screenshot({ target: { kind: "element", elementRef: "node-detail" }, mode: "full", label: "Prime Python authored accepted visual detail" });
    primeVisual = { integritySha256: primeNode.authoredDetail.integritySha256, renderedAsset: primeAsset,
      screenshot: primeScreenshot.screenshot, screenshotDirectory: primeReview.session.artifactDirectoryFor(primeScreenshot.screenshot.screenshotId),
      importedFromPrimeFactoryPython: true };
  }

  const manifest = {
    schemaVersion: 1,
    paidInferenceCalls: 0,
    runId: completed.id,
    executionId: execution.id,
    threadId,
    turnId: turn.id,
    acceptedPackageIntegrity: authoredNode.authoredDetail.integritySha256,
    screenshot: screenshot.screenshot,
    screenshotDirectory,
    assertions: {
      ...(primeVisual === undefined ? {} : { primeVisual }),
      themes: { ...themeEvidence, acceptedPackageUnchanged: true },
      ordinaryEvalProductState: true,
      authoredLayoutMounted: true,
      controlsDiscovered: expectedControls.map(([name]) => name),
      expandAndReferenceNavigation: true,
      historyRestoration: true,
      invokeAndInputDisabled: true,
      serverMutationRejected: { status: rejected.status, code: rejected.code },
      reopened: true,
      visualAsset: { id: acceptedAsset.id, digestSha256: acceptedAsset.digestSha256, renderedAsset },
      visualAssetReopened: reopenedAsset,
      visualAssetExportImport: {
        exportPath,
        importedRunId: importedRun.id,
        importedExecutionId: importedExecution.id,
        importedThreadId,
        pinPreserved: true,
        renderedAsset: importedAsset,
        portabilityPending: false,
        screenshot: importedScreenshot.screenshot,
        screenshotDirectory: importedScreenshotDirectory,
      },
    },
  };
  const manifestPath = join(artifactDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  const persisted = JSON.parse(await readFile(manifestPath, "utf8"));
  persisted.manifestSha256 = createHash("sha256").update(JSON.stringify(persisted)).digest("hex");
  persisted.manifestPath = manifestPath;
  process.stdout.write(`${JSON.stringify(persisted, null, 2)}\n`);
  return {
    passed: true,
    paidInferenceCalls: 0,
    manifestPath,
    screenshotId: screenshot.screenshot.screenshotId,
    screenshotDirectory,
  };
}

async function stop() {
  await runEvidenceCleanup([
    () => ipcMain.removeHandler("relayer-eval:review-context"),
    () => { if (reviewWindow && !reviewWindow.isDestroyed()) reviewWindow.destroy(); },
    () => { if (keepaliveWindow && !keepaliveWindow.isDestroyed()) keepaliveWindow.destroy(); },
    ...services.splice(0).reverse().map((service) => () => service.close()),
    () => rm(dataDirectory, { recursive: true, force: true }),
  ]);
}

app.whenReady().then(run).then(async (result) => {
  await stop();
  if (resultFile) await writeFile(resultFile, `${JSON.stringify({ ...result, cleanupCompleted: true }, null, 2)}\n`, { mode: 0o600 });
  app.exit(0);
}).catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  if (resultFile) {
    await writeFile(resultFile, `${JSON.stringify({ passed: false, error: error?.stack || String(error) }, null, 2)}\n`, { mode: 0o600 })
      .catch(() => undefined);
  }
  await stop().catch((cleanupError) => console.error(cleanupError));
  app.exit(1);
});
