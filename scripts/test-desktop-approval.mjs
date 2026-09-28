import { app, BrowserWindow, ipcMain } from "electron";
import { mkdirSync, mkdtempSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createApprovalFixtureFactory } from "@relayer/eval-runner";

import { GraphCompleteRuntimeService } from "../desktop/main/services/graphcomplete-runtime.mjs";
import { RelayerAppServerService } from "../desktop/main/services/relayer-app-server.mjs";
import { startModelCatalogRefreshServer } from "../desktop/main/models/model-catalog-refresh-server.mjs";
import { createWindowFactory } from "../desktop/main/window.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const dataDirectory = mkdtempSync(join(tmpdir(), "relayer-approval-smoke-"));
const longApprovalWorkspace = join(dataDirectory, ...Array.from({ length: 6 }, (_, index) => `native-approval-review-workspace-segment-${index}`));
const buildApprovalCommand = "npm run build --workspace=@relayer/eval-runner --if-present";
const approvalEvidenceDirectory = resolve(process.env.RELAYER_APPROVAL_EVIDENCE_DIR || ".relayer/evidence/factory-418-approval-repair");
mkdirSync(approvalEvidenceDirectory, { recursive: true });
const services = [];
const observations = [];
let window;
let exitCode = 1;

app.setName("Relayer Approval Smoke");
app.on("window-all-closed", () => {});
const electronProfileDirectory = join(dataDirectory, "electron-profile");
mkdirSync(electronProfileDirectory, { recursive: true });
app.setPath("userData", electronProfileDirectory);
app.commandLine.appendSwitch("disable-gpu");

function registerTestIpc() {
  let composerDrafts = { pendingNewThread: null, threadFollowups: {} };
  ipcMain.handle("relayer:account-read", () => ({
    status: "signed-in",
    channel: "stable",
    subject: "auth0|zero-inference-fixture",
  }));
  ipcMain.handle("relayer:composer-drafts-read", () => composerDrafts);
  ipcMain.handle("relayer:composer-drafts-write", (_event, value) => { composerDrafts = value; return composerDrafts; });
  ipcMain.handle("relayer:share-pending", () => null);
  ipcMain.handle("relayer:share-preflight", () => ({ status: "ready" }));
  ipcMain.handle("relayer:share-create", () => { throw new Error("Approval proof must not publish"); });
  ipcMain.handle("relayer:appearance-read", () => ({ appearance: "dark" }));
  ipcMain.handle("relayer:provider-status", () => ({
    adapters: [],
    definitions: [],
    hasCompletedOnboarding: true,
  }));
  ipcMain.handle("relayer:tutorial-read", () => ({ status: "never-shown", automaticEligible: false }));
  ipcMain.handle("relayer:tutorial-begin-automatic", () => ({ started: false }));
  ipcMain.handle("relayer:tutorial-begin-manual", () => ({ started: false }));
  ipcMain.handle("relayer:tutorial-dismiss", () => ({ status: "dismissed" }));
  ipcMain.handle("relayer:tutorial-complete", () => ({ status: "completed" }));
  ipcMain.handle("relayer:update-status", () => ({
    phase: "development",
    channel: "stable",
    version: "test",
    availableVersion: null,
    percent: null,
    error: null,
  }));
}

function unregisterTestIpc() {
  for (const channel of [
    "relayer:account-read",
    "relayer:composer-drafts-read",
    "relayer:composer-drafts-write",
    "relayer:share-pending",
    "relayer:share-preflight",
    "relayer:share-create",
    "relayer:appearance-read",
    "relayer:provider-status",
    "relayer:tutorial-read",
    "relayer:tutorial-begin-automatic",
    "relayer:tutorial-begin-manual",
    "relayer:tutorial-dismiss",
    "relayer:tutorial-complete",
    "relayer:update-status",
  ]) {
    ipcMain.removeHandler(channel);
  }
}

async function waitFor(label, check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function productRequest(session, path, init = {}) {
  const response = await fetch(new URL(path, session.origin), {
    ...init,
    headers: {
      Accept: "application/json",
      Cookie: `${session.cookie.name}=${session.cookie.value}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const value = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(value));
  return value;
}

async function threadDetail(session, threadId) {
  return productRequest(session, `/api/threads/${threadId}`);
}

async function waitForThread(session, threadId, check, label) {
  return waitFor(label, async () => {
    const detail = await threadDetail(session, threadId);
    return check(detail) ? detail : false;
  });
}

async function openThread(productSession, threadId) {
  window.show();
  window.focus();
  await window.loadURL(`${productSession.origin}/?threadId=${encodeURIComponent(threadId)}`);
  try {
    await waitFor("the ordinary product workspace", () => window.webContents.executeJavaScript(`(() => (
      !document.querySelector("#threadView")?.classList.contains("hidden")
      && Boolean(document.querySelector("#threadComposer"))
      && Boolean(document.querySelector("#turnPickerButton"))
    ))()`));
  } catch (error) {
    const state = await window.webContents.executeJavaScript(`(() => ({
      appHidden: document.querySelector("#appShell")?.classList.contains("hidden"),
      authHidden: document.querySelector("#authScreen")?.classList.contains("hidden"),
      threadHidden: document.querySelector("#threadView")?.classList.contains("hidden"),
      threadHtml: document.querySelector("#threadView")?.innerHTML,
      toast: document.querySelector("#toast")?.textContent,
    }))()`);
    throw new Error(`${error.message} state=${JSON.stringify(state)}`);
  }
}

async function approvalDockState() {
  return window.webContents.executeJavaScript(`(() => {
    const dock = document.querySelector("#approvalDock");
    if (!dock || dock.classList.contains("hidden") || dock.classList.contains("history-only")) return false;
    return {
      requestId: dock.dataset.requestId,
      activeElement: document.activeElement?.id,
      title: document.querySelector("#approvalTitle")?.textContent,
      action: document.querySelector("#approvalActionValue")?.textContent,
      scope: document.querySelector("#approvalScopeDescription")?.textContent,
      queue: document.querySelector("#approvalQueuePosition")?.textContent,
      queueLive: document.querySelector("#approvalQueuePosition")?.getAttribute("aria-live"),
      settingsLabel: document.querySelector("#conversationSettingsButton")?.getAttribute("aria-label"),
      runStateRemoved: !document.querySelector("#runState"),
      composerHidden: document.querySelector("#threadComposerShell")?.classList.contains("hidden"),
      buttons: ["denyApproval", "approveOnce", "approveAlways"].map((id) => ({
        id,
        text: document.getElementById(id)?.textContent?.replace(/\\s+/g, " ").trim(),
        disabled: document.getElementById(id)?.disabled,
      })),
    };
  })()`);
}

async function resizeNative(width) {
  window.setSize(width, 640);
  await waitFor(`native approval viewport ${width}`, () => window.webContents.executeJavaScript(`innerWidth===${width}`));
  await window.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
}

async function auditNativeApprovalLayout(name, width, expectedExpanded, expectedRequestId, productSession, threadId, exerciseQueue = false) {
  const layout = await window.webContents.executeJavaScript(`(async()=>{
    const visible=e=>Boolean(e?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
    const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const clipFor=e=>{
      const clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
      for(let parent=e.parentElement;parent;parent=parent.parentElement){
        const style=getComputedStyle(parent),r=parent.getBoundingClientRect();
        if(['auto','scroll','hidden','clip'].includes(style.overflowX)){clip.left=Math.max(clip.left,r.left+parent.clientLeft);clip.right=Math.min(clip.right,r.left+parent.clientLeft+parent.clientWidth);}
        if(['auto','scroll','hidden','clip'].includes(style.overflowY)){clip.top=Math.max(clip.top,r.top+parent.clientTop);clip.bottom=Math.min(clip.bottom,r.top+parent.clientTop+parent.clientHeight);}
      }
      return clip;
    };
    const within=(r,c)=>r.left>=c.left-.5&&r.right<=c.right+.5&&r.top>=c.top-.5&&r.bottom<=c.bottom+.5;
    const selectors=['#previousApproval','#nextApproval','#denyApproval','#approveOnce','#approveAlways'];
    const controls=[];
    for(const selector of selectors){
      const e=document.querySelector(selector);
      if(!e)throw Error('Missing native approval control '+selector);
      e.scrollIntoView({block:'nearest',inline:'nearest'});
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const r=box(e),dock=box(document.querySelector('#approvalDock')),clip=clipFor(e);
      controls.push({selector,visible:visible(e),disabled:e.disabled,text:e.textContent.replace(/\\s+/g,' ').trim(),rect:r,containedInDock:within(r,dock),containedInClip:within(r,clip),clip});
    }
    const details=[];
    for(const [label,value,labelSelector] of [['Approval reason','#approvalReason',null],['Requested command','#approvalActionValue','#approvalActionLabel'],['Working folder','#approvalWorkingDirectory','#approvalWorkingDirectoryRow dt'],['Approval scope','#approvalScopeDescription','.approval-metadata>div:last-child dt']]){
      const element=document.querySelector(value),labelNode=labelSelector?document.querySelector(labelSelector):null;
      if(!element)throw Error('Missing approval detail '+value);
      labelNode?.scrollIntoView({block:'nearest',inline:'nearest'});
      element.scrollIntoView({block:'nearest',inline:'nearest'});
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const r=box(element),clip=clipFor(element);
      const labelRect=labelNode?box(labelNode):null,labelClip=labelNode?clipFor(labelNode):null;
      details.push({label,value:element.textContent.trim(),visible:visible(element),rect:r,contained:within(r,clip),clip,labelText:labelNode?.textContent.trim()||label,labelVisible:labelNode?visible(labelNode):true,labelContained:labelNode?visible(labelNode)&&within(labelRect,labelClip):true});
    }
    const alwaysLabel=document.querySelector('#approveAlways span')?.textContent.trim();
    const alwaysQualifier=document.querySelector('#approveAlways small')?.textContent.trim();
    const qualifier=document.querySelector('#approveAlways small');
    qualifier?.scrollIntoView({block:'nearest',inline:'nearest'});
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const qualifierRect=qualifier?box(qualifier):null,qualifierClip=qualifier?clipFor(qualifier):null;
    const sidebar=box(document.querySelector('.sidebar'));
    const main=box(document.querySelector('.main-area'));
    const dock=box(document.querySelector('#approvalDock'));
    const detailsTarget=document.querySelector('#approvalTitle');
    detailsTarget.scrollIntoView({block:'center',inline:'nearest'});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const detailFrame={target:box(detailsTarget),visible:visible(detailsTarget),title:detailsTarget.textContent.trim(),reason:box(document.querySelector('#approvalReason'))};
    const actions=document.querySelector('.approval-actions');
    actions.scrollIntoView({block:'center',inline:'nearest'});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const actionGroup=box(actions),actionClip=clipFor(actions);
    const actionButtons=['#denyApproval','#approveOnce','#approveAlways'].map(selector=>{const element=document.querySelector(selector),rect=box(element);return {selector,rect,visible:visible(element),disabled:element.disabled,containedInGroup:within(rect,actionGroup),containedInClip:within(rect,clipFor(element))};});
    const overlapRects=selectors.map(selector=>({selector,rect:box(document.querySelector(selector))}));
    return {inner:[innerWidth,innerHeight],outer:window.outerWidth,collapsed:document.body.classList.contains('sidebar-collapsed'),sidebar,main,dock,controls,overlapRects,details,detailFrame,actionFrame:{group:actionGroup,clip:actionClip,contained:within(actionGroup,actionClip),buttons:actionButtons},alwaysLabel,alwaysQualifier,qualifierContained:qualifier&&visible(qualifier)&&qualifierRect.width>0&&qualifierRect.height>0&&within(qualifierRect,qualifierClip),documentScrollWidth:document.documentElement.scrollWidth};
  })()`);
  if (layout.collapsed === expectedExpanded) throw new Error(`${name}: unexpected sidebar state ${JSON.stringify(layout)}`);
  if (layout.documentScrollWidth > layout.inner[0]) throw new Error(`${name}: document horizontal overflow ${JSON.stringify(layout)}`);
  for (const control of layout.controls) {
    if (!control.visible || control.rect.width <= 0 || control.rect.height <= 0 || !control.containedInDock || !control.containedInClip) {
      throw new Error(`${name}: approval control is clipped or unreachable ${JSON.stringify(control)} layout=${JSON.stringify(layout)}`);
    }
  }
  if (!layout.detailFrame.visible || layout.detailFrame.target.width <= 0 || layout.detailFrame.target.height <= 0) {
    throw new Error(`${name}: approval queue/title context is not visible ${JSON.stringify(layout.detailFrame)}`);
  }
  if (!layout.actionFrame.contained || layout.actionFrame.buttons.some(button=>!button.visible||button.disabled||!button.containedInGroup||!button.containedInClip)) {
    throw new Error(`${name}: three decision controls are not simultaneously visible and usable ${JSON.stringify(layout.actionFrame)}`);
  }
  for (let left = 0; left < layout.overlapRects.length; left += 1) {
    for (let right = left + 1; right < layout.overlapRects.length; right += 1) {
      const a = layout.overlapRects[left].rect;
      const b = layout.overlapRects[right].rect;
      const overlaps = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      if (overlaps) throw new Error(`${name}: native approval controls overlap (${layout.overlapRects[left].selector}, ${layout.overlapRects[right].selector})`);
    }
  }
  if (layout.controls.some(control => control.rect.right - control.rect.left > layout.main.right - layout.main.left + 1)) {
    throw new Error(`${name}: approval control exceeds remaining workspace ${JSON.stringify(layout)}`);
  }
  if (layout.details.some(detail=>!detail.value||!detail.visible||detail.rect.width<=0||detail.rect.height<=0||!detail.contained||!detail.labelText||!detail.labelVisible||!detail.labelContained)) {
    throw new Error(`${name}: pending approval detail was not readable and reachable ${JSON.stringify(layout.details)}`);
  }
  if (layout.details[0].value.length < 150 || layout.details[1].value.length < 40 || layout.details[2].value.length < 100) {
    throw new Error(`${name}: the approval fixture must exercise long reason, command, and working-folder text ${JSON.stringify(layout.details.map(detail=>({label:detail.label,length:detail.value.length})))}`);
  }
  if (!layout.alwaysLabel?.includes('Approve always') || layout.alwaysQualifier!=='this session' || !layout.qualifierContained) {
    throw new Error(`${name}: the session grant qualifier was not visible and reachable ${JSON.stringify(layout)}`);
  }
  const initialDetail = await threadDetail(productSession, threadId);
  const initialPending = initialDetail.approvals.filter(receipt => receipt.resolution == null).map(receipt => receipt.request.requestId).sort();
  if (layout.inner[0] !== width) throw new Error(`${name}: unexpected viewport width ${layout.inner[0]}`);
  const dock = await approvalDockState();
  if (dock.requestId !== expectedRequestId) throw new Error(`${name}: selected approval changed during resize ${JSON.stringify({expectedRequestId,dock})}`);
  if (exerciseQueue) {
    await click('#nextApproval');
    const next = await waitFor(`${name}: next approval selected`, async()=>{
      const value=await approvalDockState();return value&&value.requestId!==expectedRequestId?value:false;
    });
    await click('#previousApproval');
    const previous = await waitFor(`${name}: previous approval restored`, async()=>{
      const value=await approvalDockState();return value?.requestId===expectedRequestId?value:false;
    });
    if(next.queue!=='2 of 3'||previous.queue!=='1 of 3') throw new Error(`${name}: approval queue controls did not return to the selected request`);
  }
  const finalDetail = await threadDetail(productSession, threadId);
  const finalPending = finalDetail.approvals.filter(receipt => receipt.resolution == null).map(receipt => receipt.request.requestId).sort();
  if (JSON.stringify(finalPending) !== JSON.stringify(initialPending) || finalPending.length !== 3) {
    throw new Error(`${name}: layout change or queue navigation altered pending authority ${JSON.stringify({initialPending,finalPending})}`);
  }
  await window.webContents.executeJavaScript(`document.querySelector('#approvalTitle').scrollIntoView({block:'center',inline:'nearest'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  await writeFile(join(approvalEvidenceDirectory, `${name}-details.png`), (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('.approval-actions').scrollIntoView({block:'center',inline:'nearest'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  await writeFile(join(approvalEvidenceDirectory, `${name}.png`), (await window.webContents.capturePage()).toPNG());
  return {...layout,pendingRequestIds:finalPending,selectedRequestId:expectedRequestId};
}

async function click(selector) {
  await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`);
}

async function holdNextDecision() {
  await window.webContents.executeJavaScript(`(() => {
    const original = window.fetch.bind(window);
    let held = false;
    window.__releaseApprovalDecision = null;
    window.fetch = (input, init) => {
      const target = typeof input === "string" ? input : input?.url || String(input);
      if (!held && target.includes("/approvals/") && target.endsWith("/decision")) {
        held = true;
        return new Promise((resolve, reject) => {
          window.__releaseApprovalDecision = () => original(input, init).then(resolve, reject);
        });
      }
      return original(input, init);
    };
  })()`);
}

async function releaseHeldDecision() {
  await window.webContents.executeJavaScript(`window.__releaseApprovalDecision?.()`);
}

async function createInteraction(productSession, threadId, text) {
  return productRequest(productSession, `/api/threads/${threadId}/interactions`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

async function run() {
  process.stdout.write("Electron application ready.\n");
  registerTestIpc();
  const configurationPath = join(repositoryRoot, "harnesses", "fixture-approval.yaml");
  const runtime = new GraphCompleteRuntimeService({
    userDataDirectory: dataDirectory,
    graphServerBinary: join(repositoryRoot, "target", "debug", "relayer-graph-server"),
    configurationPaths: [configurationPath],
    additionalImplementations: {
      "fixture.approval": createApprovalFixtureFactory({
        observe: (observation) => observations.push(observation),
      }),
    },
  });
  services.push(runtime);
  const runtimeSession = await runtime.start();
  const modelCatalogRefreshServer = await startModelCatalogRefreshServer({
    refresh: async () => undefined,
  });
  services.push(modelCatalogRefreshServer);
  const product = new RelayerAppServerService({
    userDataDirectory: dataDirectory,
    binaryPath: join(repositoryRoot, "target", "debug", "relayer-app-server"),
    webDirectory: join(repositoryRoot, "desktop", "renderer"),
    permissionCatalogPath: join(repositoryRoot, "permissions", "desktop.json"),
    runtimeSession,
    providerCatalogRefreshSession: modelCatalogRefreshServer.session,
    defaultHarnessConfiguration: "fixture-approval",
    allowHarnessOverride: true,
  });
  services.push(product);
  const productSession = await product.start();
  const createWindow = createWindowFactory({
    BrowserWindow,
    desktopDirectory: join(repositoryRoot, "desktop"),
    getAppearance: () => "dark",
    updater: { status: () => ({ phase: "development" }) },
    openExternal: async () => { throw new Error("Unexpected external navigation"); },
  });
  window = await createWindow(productSession);
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) console.error(`Renderer console: ${message}`);
  });
  window.show();

  mkdirSync(longApprovalWorkspace, { recursive: true });
  const approvalProject = await productRequest(productSession, "/api/projects", {
    method: "POST",
    body: JSON.stringify({ path: longApprovalWorkspace }),
  });
  const created = await productRequest(productSession, "/api/threads", {
    method: "POST",
    body: JSON.stringify({
      initialMessage: "Create the deterministic approval baseline.",
      permissionProfileId: "ask",
      projectId: approvalProject.id,
    }),
  });
  const threadId = created.id;
  await waitForThread(
    productSession,
    threadId,
    (detail) => detail.interactions[0]?.completionStatus === "accepted",
    "the baseline graph",
  );
  await openThread(productSession, threadId);

  const onceInteraction = await createInteraction(productSession, threadId, "Exercise approve once and denial adaptation.");
  await waitForThread(
    productSession,
    threadId,
    (detail) => detail.approvals?.filter((receipt) => receipt.resolution == null).length === 1,
    "the first approve-once request",
  );
  await window.webContents.executeJavaScript(`import('./src/threads.js').then(module=>module.refreshState(${JSON.stringify(String(threadId))}))`);
  let firstDock;
  try {
    firstDock = await waitFor("the focused approval dock", async () => {
      const state = await approvalDockState();
      return state?.activeElement === "approvalDock" ? state : false;
    });
  } catch (error) {
    const state = await window.webContents.executeJavaScript(`(() => ({
      activeElement: document.activeElement?.id || document.activeElement?.tagName,
      dockClass: document.querySelector('#approvalDock')?.className,
      dockText: document.querySelector('#approvalDock')?.textContent,
      toast: document.querySelector('#toast')?.textContent,
      thread: document.querySelector('#threadView')?.className,
    }))()`);
    throw new Error(`${error.message} state=${JSON.stringify(state)}`);
  }
  if (firstDock.action !== "npm test" || !firstDock.scope?.includes("this live harness session")) {
    throw new Error(`The dock did not show exact normalized authority: ${JSON.stringify(firstDock)}`);
  }
  if (!firstDock.composerHidden || firstDock.settingsLabel !== "Conversation settings" || !firstDock.runStateRemoved || firstDock.queueLive !== "polite") {
    throw new Error(`The approval waiting presentation was incomplete: ${JSON.stringify(firstDock)}`);
  }
  if (firstDock.buttons.map(({ text }) => text).join("|") !== "Deny|Approve once|Approve alwaysthis session") {
    throw new Error(`The three decisions were not discoverable: ${JSON.stringify(firstDock.buttons)}`);
  }

  await click("#previousTurn");
  const graphVisibleWhileWaiting = await waitFor("the prior graph while approval remains pending", () => (
    window.webContents.executeJavaScript(`(() => (
      !document.querySelector("#graphStage")?.classList.contains("hidden")
      && document.querySelectorAll(".graph-node").length > 0
      && !document.querySelector("#approvalDock")?.classList.contains("hidden")
    ))()`)
  ));

  await holdNextDecision();
  await click("#approveOnce");
  await waitFor("disabled approval buttons", () => window.webContents.executeJavaScript(`(() => (
    document.querySelector("#approvalDock")?.getAttribute("aria-busy") === "true"
    && ["denyApproval", "approveOnce", "approveAlways"].every((id) => document.getElementById(id)?.disabled)
  ))()`));
  await releaseHeldDecision();
  const repeatedDock = await waitFor("the repeated exact request after approve once", async () => {
    const state = await approvalDockState();
    return state && state.requestId !== firstDock.requestId && state.action === "npm test" ? state : false;
  });
  await click("#denyApproval");
  let onceAccepted;
  try {
    onceAccepted = await waitForThread(
      productSession,
      threadId,
      (detail) => detail.interactions.find((interaction) => String(interaction.id) === String(onceInteraction.id))?.completionStatus === "accepted",
      "the denial-adapted completion",
    );
  } catch (error) {
    const detail = await threadDetail(productSession, threadId);
    throw new Error(`${error.message} detail=${JSON.stringify(detail)}`);
  }
  await openThread(productSession, threadId);
  const resolvedPresentation = await waitFor("the restored composer and compact receipts", () => (
    window.webContents.executeJavaScript(`(() => {
      const dock = document.querySelector("#approvalDock");
      const composer = document.querySelector("#threadComposer");
      const history = [...document.querySelectorAll("#approvalHistoryList > li")].map((item) => item.textContent);
      const historyElement = document.querySelector("#approvalHistory");
      return dock?.classList.contains("history-only") && !composer?.classList.contains("hidden") && historyElement?.open && history.length >= 2
        ? { history, historyOpen: historyElement.open, focus: document.activeElement?.id }
        : false;
    })()`)
  ));

  const alwaysInteraction = await createInteraction(productSession, threadId, "Exercise session approval and an isolated near match.");
  await waitForThread(
    productSession,
    threadId,
    (detail) => detail.approvals?.filter((receipt) => receipt.resolution == null).length === 3,
    "three concurrent approval requests",
  );
  await openThread(productSession, threadId);
  const queuedDock = await waitFor("the three-request approval queue", async () => {
    const state = await approvalDockState();
    return state?.queue === "1 of 3" && state.action === buildApprovalCommand ? state : false;
  });
  await resizeNative(375);
  await waitFor("native 375px approval sidebar collapse",()=>window.webContents.executeJavaScript("document.body.classList.contains('sidebar-collapsed')"));
  const approvalLayoutEvidence = [];
  approvalLayoutEvidence.push(await auditNativeApprovalLayout("approval-layout-375-collapsed",375,false,queuedDock.requestId,productSession,threadId));
  await click("#collapseSidebar");
  await waitFor("native 375px approval sidebar expansion",()=>window.webContents.executeJavaScript("!document.body.classList.contains('sidebar-collapsed')"));
  approvalLayoutEvidence.push(await auditNativeApprovalLayout("approval-layout-375-expanded",375,true,queuedDock.requestId,productSession,threadId,true));
  await resizeNative(620);
  approvalLayoutEvidence.push(await auditNativeApprovalLayout("approval-layout-620-expanded",620,true,queuedDock.requestId,productSession,threadId));
  await click("#approveAlways");
  let nearDock;
  try {
    nearDock = await waitFor("the unmatched request after approve always", async () => {
      const state = await approvalDockState();
      return state?.action === "npm run deploy" && state.queue === "1 of 1" ? state : false;
    });
  } catch (error) {
    const dock = await approvalDockState();
    const detail = await threadDetail(productSession, threadId);
    throw new Error(`${error.message} dock=${JSON.stringify(dock)} approvals=${JSON.stringify(detail.approvals)}`);
  }
  await click("#denyApproval");
  await waitForThread(
    productSession,
    threadId,
    (detail) => detail.interactions.find((interaction) => String(interaction.id) === String(alwaysInteraction.id))?.completionStatus === "accepted",
    "the approve-always completion",
  );
  await resizeNative(1280);

  const futureInteraction = await createInteraction(productSession, threadId, "Consume the exact live-session grant in a later completion.");
  let futureAccepted;
  try {
    futureAccepted = await waitForThread(
      productSession,
      threadId,
      (detail) => detail.interactions.find((interaction) => String(interaction.id) === String(futureInteraction.id))?.completionStatus === "accepted",
      "the future exact request to auto-resolve",
    );
  } catch (error) {
    const detail = await threadDetail(productSession, threadId);
    throw new Error(`${error.message} detail=${JSON.stringify(detail)}`);
  }
  const futureReceipt = futureAccepted.approvals.find((receipt) => (
    String(receipt.request.correlation.interactionId) === String(futureInteraction.id)
  ));
  if (futureReceipt?.resolution?.actor !== "session_grant" || futureReceipt.resolution.decision !== "approve_once") {
    throw new Error(`The later completion did not consume the live-session grant: ${JSON.stringify(futureReceipt)}`);
  }
  await openThread(productSession, threadId);
  const scrollableHistory = await waitFor("fixed scrollable approval history", () => (
    window.webContents.executeJavaScript(`(() => {
      const list = document.querySelector("#approvalHistoryList");
      const history = document.querySelector("#approvalHistory");
      const dock = document.querySelector("#approvalDock");
      const initialHeight = list?.clientHeight;
      const initialDockRect = dock?.getBoundingClientRect();
      if (!history?.open || initialHeight !== 64 || list.scrollHeight <= initialHeight || getComputedStyle(list).overflowY !== "auto" || !initialDockRect) return false;
      list.scrollTop = list.scrollHeight;
      const scrolledDockRect = dock.getBoundingClientRect();
      return list.scrollTop > 0
        && list.clientHeight === initialHeight
        && scrolledDockRect.top === initialDockRect.top
        && scrolledDockRect.height === initialDockRect.height
        ? { clientHeight: list.clientHeight, scrollHeight: list.scrollHeight, scrollTop: list.scrollTop, dockTop: scrolledDockRect.top, dockHeight: scrolledDockRect.height }
        : false;
    })()`)
  ));

  const expectedObservations = [
    [2, "once-first", "approve_once", "user", true],
    [2, "once-repeated", "deny", "user", false],
    [3, "always-source", "approve_always", "user", true],
    [3, "always-exact-pending", "approve_once", "session_grant", true],
    [3, "always-near-pending", "deny", "user", false],
    [4, "always-exact-future", "approve_once", "session_grant", true],
  ];
  const observed = observations.map((entry) => [
    entry.completion,
    entry.step,
    entry.decision,
    entry.actor,
    entry.protectedActionExecuted,
  ]);
  if (JSON.stringify(observed) !== JSON.stringify(expectedObservations)) {
    throw new Error(`Unexpected provider observations: ${JSON.stringify(observed)}`);
  }

  const proof = {
    passed: true,
    harness: "fixture-approval",
    inferenceCalls: 0,
    threadId,
    graphVisibleWhileWaiting,
    onceRequestIds: [firstDock.requestId, repeatedDock.requestId],
    queue: queuedDock.queue,
    approvalLayoutEvidence,
    approvalEvidenceDirectory,
    unmatchedAction: nearDock.action,
    resolvedReceipts: resolvedPresentation.history.length,
    approvalHistoryOpen: resolvedPresentation.historyOpen,
    approvalHistoryViewport: scrollableHistory,
    finalStatus: futureAccepted.interactions.at(-1)?.completionStatus,
    observations: observed,
    approvalCount: onceAccepted.approvals.length,
  };
  await writeFile(join(approvalEvidenceDirectory, "approval-layout.json"), `${JSON.stringify(proof, null, 2)}\n`);
  process.stdout.write(`RELAYER_APPROVAL_SMOKE ${JSON.stringify(proof)}\n`);
  exitCode = 0;
}

async function shutdown() {
  window?.destroy();
  unregisterTestIpc();
  for (const service of services.reverse()) {
    try {
      await service.close();
    } catch (error) {
      process.stderr.write(`${error.stack || error.message}\n`);
      exitCode = 1;
    }
  }
  await rm(dataDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
  app.exit(exitCode);
}

process.stdout.write("Starting isolated Electron approval smoke test...\n");
void app.whenReady()
  .then(run)
  .catch((error) => process.stderr.write(`${error.stack || error.message}\n`))
  .finally(shutdown);
