import { app, BrowserWindow, ipcMain } from "electron";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createWindowFactory } from "../desktop/main/window.mjs";
import { stopRunFixture, waitFor } from "../test/support/stop-run-fixture.mjs";

// Native window proof: no device-metrics emulation or substitute BrowserWindow.
// Local IPC fixtures replace only account, OS preferences, and updater services.
const evidence = resolve(process.env.RELAYER_NARROW_EVIDENCE_DIR || ".relayer/evidence/issue-418-native");
const profile = await mkdtemp(join(tmpdir(), "relayer-narrow-native-"));
app.setPath("userData", profile);
app.setName("Relayer narrow-window verification");
// Keep the process alive through async fixture cleanup; the runner owns its
// final exit status even after destroying the last native window.
app.on("window-all-closed", () => {});
app.commandLine.appendSwitch("disable-gpu");
let window;
let fixture;
let exitCode = 1;
let appearance = "dark";
let channel = "stable";
let drafts = { pendingNewThread: null, threadFollowups: {} };
const results = [];
const rendererErrors = [];
const updateStatus = () => ({ phase: "idle", channel, currentVersion: "0.0.0-evidence" });
const account = { status: "signed-in", channel: "stable", subject: "auth0|native-evidence" };
const tutorial = { status: "dismissed", automaticEligible: false };
const handlers = {
  "account-read": () => account,
  "appearance-read": () => ({ appearance }),
  "appearance-set": (_, value) => ({ appearance: appearance = value }),
  "composer-drafts-read": () => drafts,
  "composer-drafts-write": (_, value) => drafts = value,
  "tutorial-read": () => tutorial,
  "tutorial-begin-automatic": () => ({ ...tutorial, started: false, source: "automatic" }),
  "model-catalog-settings-open": () => ({}),
  "model-catalog-refresh": () => ({ refreshed: true }),
  "update-status": updateStatus,
  "update-check": updateStatus,
  "update-channel": (_, value) => { channel = value; return updateStatus(); },
  "provider-status": () => ({
    hasCompletedOnboarding: true,
    adapters: [{ adapterId: "openai-api", implementationVersion: 2, label: "OpenAI API", accessContract: "secret@1", defaultEndpoint: "https://api.openai.com/v1", endpointEditableDuringCreation: true, connection: { mode: "secret-fields", fields: [{ id: "api-key", label: "API key", kind: "secret", required: true }] } }],
    definitions: [{ id: "fixture-openai", adapterId: "openai-api", adapterLabel: "OpenAI API", label: "Deterministic provider", endpoint: "https://api.openai.com/v1", accessContract: "secret@1", lifecycleState: "active", connected: true }],
  }),
};
for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(`relayer:${name}`, handler);
const evaluate = (source) => window.webContents.executeJavaScript(source);
async function settle() {
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
}
async function capture(name) {
  await settle();
  await writeFile(join(evidence, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}
async function resize(width) {
  window.setSize(width, 640);
  await waitFor(`native width ${width}`, () => evaluate(`innerWidth === ${width}`));
  await settle();
}
async function shell(name, expanded) {
  const state = await evaluate(`(() => {
    const box = s => { const e=document.querySelector(s),r=e?.getBoundingClientRect(); return r && {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,visible:e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})}; };
    return {inner:[innerWidth,innerHeight],collapsed:document.body.classList.contains('sidebar-collapsed'),sidebar:box('.sidebar'),main:box('.main-area'),toggle:box('#collapseSidebar'),account:box('#desktopAccountButton'),settings:box('#settingsButton'),scrollWidth:document.documentElement.scrollWidth};
  })()`);
  assert.equal(state.collapsed, !expanded, name);
  assert.equal(state.sidebar.width, expanded ? 210 : 58, name);
  assert.ok(Math.abs(state.main.left - state.sidebar.right) <= 1, `${name}: sidebar stays in flow`);
  assert.ok(Math.abs(state.main.width - (state.inner[0] - state.sidebar.width)) <= 1, `${name}: workspace shrinks`);
  for (const key of ["toggle", "account", "settings"]) {
    const r = state[key];
    assert.ok(r?.visible && r.width > 0 && r.height > 0 && r.left >= state.sidebar.left && r.right <= state.sidebar.right && r.top >= 0 && r.bottom <= state.inner[1], `${name}: ${key} visible and contained`);
  }
  assert.ok(state.scrollWidth <= state.inner[0], `${name}: horizontal document overflow`);
  results.push({ name, outer: window.getSize(), content: window.getContentSize(), minimum: window.getMinimumSize(), ...state });
  await capture(name);
  const composerControls=await evaluate(`(async()=>{
    const controls=[];
    for(const selector of ['#threadPrompt','#sendInteraction','#threadComposer [data-model-picker-trigger]']) {
      const e=document.querySelector(selector);
      if(!e) throw Error('Missing native composer control '+selector);
      e.scrollIntoView({block:'nearest',inline:'nearest'});
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const r=e.getBoundingClientRect(), container=document.querySelector('.workspace-layout').getBoundingClientRect();
      controls.push({selector,visible:e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),width:r.width,height:r.height,contained:r.left>=Math.max(0,container.left)-.5&&r.right<=Math.min(innerWidth,container.right)+.5&&r.top>=Math.max(0,container.top)-.5&&r.bottom<=Math.min(innerHeight,container.bottom)+.5});
    }
    return controls;
  })()`);
  assert.ok(composerControls.every(c=>c.visible&&c.width>0&&c.height>0&&c.contained), `${name}: native composer reachability ${JSON.stringify(composerControls)}`);
  results.at(-1).composerControls=composerControls;
  await capture(`${name}-composer-scrolled`);
  await evaluate("document.querySelector('.workspace-layout').scrollTop=0");
}
const panels = {
  account: ["#desktopAccountLogout"],
  providers: ["#refreshProviderCatalogs", "#newProviderDefinition", '[data-provider-rename="fixture-openai"]', '[data-provider-remove="fixture-openai"]'],
  models: ["#defaultHarnessSelect", "#defaultProviderSelect", "#previousFamily", ".current-family-button", "#nextFamily", "#newModelFamily"],
  harnesses: [".harness-configuration-card"],
  appearance: ["#appearanceSelect"],
  updates: ["#updateChannel", "#checkUpdates"],
  advanced: ["#startTutorial"],
};
async function settingsPanel(tab, label, familyEditing = false) {
  await evaluate(`(() => {if(innerWidth>760){document.querySelector('[data-settings-tab="${tab}"]').click();return;}const s=document.querySelector('#settingsCompactSelect');s.value=${JSON.stringify(tab)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`Settings ${tab}`, () => evaluate(`!document.querySelector('[data-settings-panel="${tab}"]').classList.contains('hidden')`));
  await settle();
  if (["providers", "models", "harnesses"].includes(tab)) {
    const expected = { providers: ".provider-definition-card", models: ".family-card", harnesses: ".harness-configuration-card" }[tab];
    await waitFor(`populated ${tab}`, () => evaluate(`Boolean(document.querySelector(${JSON.stringify(expected)}))`));
  }
  if(tab==="models") await waitFor("family carousel snapped",()=>evaluate(`(()=>{const c=document.querySelector('#familyCarousel');return c.clientWidth>0&&Math.abs(c.scrollLeft-Math.round(c.scrollLeft/c.clientWidth)*c.clientWidth)<.5;})()`));
  const audit = await evaluate(`(async () => {
    const panel=document.querySelector('[data-settings-panel="${tab}"]');
    const view=document.querySelector('#settingsView');
    view.scrollTop=0;
    const bounds=view.getBoundingClientRect();
    const positive=e=>e?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
    const horizontal=e=>{const r=e.getBoundingClientRect(), b=e.closest('.sidebar')?.getBoundingClientRect()||bounds;return r.left>=b.left-.5&&r.right<=b.right+.5;};
    const carousel=document.querySelector('#familyCarousel');
    const activeSlide=carousel?.children[Math.round(carousel.scrollLeft/carousel.clientWidth)];
    const active=e=>!e.closest('.family-slide')||e.closest('.family-slide')===activeSlide;
    // The existing family carousel intentionally scrolls between whole cards;
    // audit the selected card now, and select every other card through Next below.
    // Text fields and native selects scroll/clip their value inside the control;
    // require the control box to fit, not its unbounded user-entered text.
    const allowsInternalText=e=>e.matches('input,select,textarea')||(e.id==='currentFamilyName'&&getComputedStyle(e).textOverflow==='ellipsis');
    const overflow=[view,panel,...panel.querySelectorAll('*')].filter(positive).filter(active).filter(e=>!horizontal(e)||e.id!=='familyCarousel'&&!allowsInternalText(e)&&e.scrollWidth>e.clientWidth+1 && e.clientWidth>0).map(e=>({tag:e.tagName,id:e.id,class:e.className,scroll:e.scrollWidth,client:e.clientWidth}));
    const navigation=innerWidth<=760?['#settingsCompactBackButton','#settingsCompactSelect']:['#settingsBackButton','[data-settings-tab="${tab}"]'];
    const selectors=[...navigation,...${JSON.stringify(panels[tab])}];
    if(${JSON.stringify(tab)}==='models') {
      if(!activeSlide) throw Error('Missing selected family card');
      const index=Number(activeSlide.dataset.familySlide);
      if(![0,1].includes(index)) throw Error('Unexpected fixture family index');
      if(${JSON.stringify(familyEditing)}) {
        selectors.push('#familyNameInput','[data-member-provider="0"]','[data-member-model="0"]','[data-member-up="0"]','[data-member-down="0"]','[data-member-remove="0"]','#addFamilyModel','#cancelFamilyEdit','#saveFamilyEdit');
      } else {
        const actions=index===0?['enabled','left','right','copy']:['enabled','left','right','edit','delete'];
        for(const action of actions) selectors.push('[data-family-'+action+'="'+index+'"]');
      }
    }
    if(${JSON.stringify(tab)}==='harnesses') {
      const ids=[...panel.querySelectorAll('[data-harness-configuration]')].map(e=>e.dataset.harnessConfiguration).sort();
      if(JSON.stringify(ids)!==JSON.stringify(['fixture-stop-codex','fixture-stop-prime'])) throw Error('Expected both populated fixture harness cards: '+JSON.stringify(ids));
    }
    const controls=[];
    const extraControls=[...panel.querySelectorAll('button,input,select,textarea')].filter(positive).filter(active);
    const expected=selectors.flatMap(selector=>{
      const matches=[...document.querySelectorAll(selector)];
      if(!matches.length) throw Error('Missing expected Settings control '+selector);
      return matches.map(e=>({e,selector}));
    });
    for(const {e,selector} of [...expected,...extraControls.map(e=>({e,selector:e.id||e.getAttribute('aria-label')||e.tagName}))]) {
        e.scrollIntoView({block:'nearest',inline:'nearest'});
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const r=e.getBoundingClientRect();
        controls.push({selector,visible:positive(e),horizontal:horizontal(e),onscreen:r.top>=0&&r.bottom<=innerHeight,rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
    }
    view.scrollTop=0;
    return {tab:${JSON.stringify(tab)},text:panel.textContent.trim(),overflow,controls};
  })()`);
  assert.ok(audit.text.length > 10, `${tab} populated`);
  assert.deepEqual(audit.overflow, [], `${label}/${tab}: horizontal containment`);
  assert.ok(audit.controls.every(c => c.visible && c.horizontal && c.onscreen), `${label}/${tab}: controls ${JSON.stringify(audit.controls)}`);
  results.push({ name: `${label}-${tab}`, ...audit });
  await capture(`${label}-${tab}`);
}
async function main() {
  await mkdir(evidence, { recursive: true });
  fixture = await stopRunFixture();
  const projectDirectory = join(fixture.directory, 'Project "quoted" & names');
  await mkdir(projectDirectory);
  const project = await fixture.request("/api/projects", { method: "POST", body: JSON.stringify({ path: projectDirectory }) });
  const thread = await fixture.create("codex", 'accept native "sidebar" evidence');
  await waitFor("accepted graph", async () => (await fixture.request(`/api/threads/${thread.id}`)).interactions[0]?.completionStatus === "accepted");
  window = await createWindowFactory({ BrowserWindow, desktopDirectory: resolve("desktop"), getAppearance: () => appearance, updater: { status: () => ({ phase: "development" }) }, openExternal: async () => { throw new Error("Unexpected external navigation"); }, onWindowCreated: created => {
    window = created;
    window.webContents.on("console-message", (_event, level, message) => { if (level >= 3) rendererErrors.push(message); });
  } })(fixture.session);
  window.show(); window.focus();
  await waitFor("native shell ready", () => evaluate("document.querySelector('#appShell')?.checkVisibility() && !document.body.classList.contains('desktop-account-pending')"));
  await evaluate(`import('./src/threads.js').then(m=>m.loadThread(${thread.id}))`);
  assert.deepEqual(window.getMinimumSize(), [375, 640]);
  const preferences = window.webContents.getLastWebPreferences();
  assert.ok(preferences.sandbox && preferences.contextIsolation && !preferences.nodeIntegration);
  assert.deepEqual(await evaluate("window.relayerDesktop.account.read()"), account);
  for (const width of [760, 620, 375]) {
    await resize(width);
    await shell(`native-${width}-collapsed`, false);
    await evaluate("document.querySelector('#collapseSidebar').click()");
    await shell(`native-${width}-expanded`, true);
    await resize(width + 1);
    if (width < 760) await shell(`native-${width + 1}-preserved`, true);
    await resize(761);
    await shell(`native-761-after-${width}`, true);
  }
  await resize(375);
  await shell("native-375-reentry", false);
  window.webContents.debugger.attach("1.3");
  await window.webContents.debugger.sendCommand("Accessibility.enable");
  const ax = await window.webContents.debugger.sendCommand("Accessibility.getFullAXTree");
  const named = ax.nodes.find(n => !n.ignored && n.role?.value === "button" && n.name?.value === thread.title);
  assert.ok(named, `Collapsed native AX tree must expose thread title ${thread.title}`);
  assert.ok(ax.nodes.some(n => !n.ignored && n.role?.value === "button" && n.name?.value === project.name), "Collapsed project must retain its accessible name");
  await evaluate("document.querySelector('#newThread').click()");
  await waitFor("New Thread before named activation",()=>evaluate("!document.querySelector('#newThreadView').classList.contains('hidden')"));
  await evaluate(`document.querySelector('[data-thread="${thread.id}"]').click()`);
  await waitFor("named chat activation", () => evaluate(`import('./src/state.js').then(m=>m.viewState.mainView==='thread'&&String(m.viewState.currentThreadId)===${JSON.stringify(String(thread.id))})`));
  await writeFile(join(evidence, "accessibility.json"), JSON.stringify(ax, null, 2));
  window.webContents.debugger.detach();
  await evaluate("document.querySelector('#collapseSidebar').click();document.querySelector('#settingsButton').click()");
  for (const tab of Object.keys(panels)) {
    await settingsPanel(tab, "native-375-expanded");
    if(tab==="models") {
      const count=await evaluate("document.querySelector('#familyCarousel').children.length");
      assert.ok(count>=2, "Populated system and custom families required");
      for(let index=1;index<count;index++) {
        await evaluate("document.querySelector('#nextFamily').click()");
        await waitFor("family card selected",()=>evaluate(`Math.abs(document.querySelector('#familyCarousel').scrollLeft-${index}*document.querySelector('#familyCarousel').clientWidth)<1`));
        await settingsPanel(tab, `native-375-family-${index}`);
      }
      await evaluate("document.querySelector('[data-family-edit=\"1\"]').click()");
      await settingsPanel(tab, 'native-375-family-edit', true);
      await evaluate("document.querySelector('#cancelFamilyEdit').click()");
    }
  }
  await settingsPanel("appearance", "native-375-theme");
  await evaluate("document.querySelector('#appearanceSelect').value='light';document.querySelector('#appearanceSelect').dispatchEvent(new Event('change',{bubbles:true}))");
  await waitFor("light theme persisted", () => appearance === "light");
  await capture("native-375-light-appearance");
  await evaluate("document.querySelector('#settingsCompactBackButton').click()");
  assert.equal(await evaluate("document.activeElement.id"), "collapseSidebar");
  await evaluate("document.querySelector('#desktopAccountButton').click()");
  assert.equal(await evaluate("document.querySelector('#settingsCompactSelect').value"), "account");
  await resize(620);
  await evaluate("document.querySelector('#collapseSidebar').click()");
  for (const tab of Object.keys(panels)) await settingsPanel(tab, "native-620-collapsed");
  window.webContents.debugger.attach("1.3");
  await window.webContents.debugger.sendCommand("Accessibility.enable");
  const settingsAx=await window.webContents.debugger.sendCommand("Accessibility.getFullAXTree");
  for(const name of ["Account","Providers","Model families","Harnesses","Appearance","Application updates","Advanced"]) assert.ok(settingsAx.nodes.some(n=>!n.ignored&&n.role?.value==="tab"&&n.name?.value===name), `Collapsed Settings tab named ${name}`);
  await writeFile(join(evidence,"settings-accessibility.json"),JSON.stringify(settingsAx,null,2));
  window.webContents.debugger.detach();
  for (const [width, expanded] of [[375,false],[483,true],[620,true],[1280,true]]) {
    await resize(width);
    const collapsed=await evaluate("document.body.classList.contains('sidebar-collapsed')");
    if(collapsed===expanded) await evaluate("document.querySelector('#collapseSidebar').click()");
    for(const tab of Object.keys(panels)) await settingsPanel(tab, `native-${width}-${expanded?'expanded':'collapsed'}-boundary`);
  }
  await resize(620);
  if(!await evaluate("document.body.classList.contains('sidebar-collapsed')")) await evaluate("document.querySelector('#collapseSidebar').click()");
  await evaluate("document.querySelector('#settingsCompactBackButton').click()");
  const evalName = 'Eval "quoted" & <named>';
  await evaluate(`(async()=>{const {viewState}=await import('./src/state.js');viewState.evalContext={harnessConfigurationName:'native-fixture',cases:[{name:'Case',status:'passed',threads:[{id:${thread.id},name:${JSON.stringify(evalName)}}]}]};(await import('./src/navigation.js')).renderSidebar();})()`);
  window.webContents.debugger.attach("1.3");
  await window.webContents.debugger.sendCommand("Accessibility.enable");
  const evalAx = await window.webContents.debugger.sendCommand("Accessibility.getFullAXTree");
  assert.ok(evalAx.nodes.some(n => !n.ignored && n.role?.value === "button" && n.name?.value === evalName), "Collapsed Eval destinations retain their accessible name");
  await writeFile(join(evidence, "eval-accessibility.json"), JSON.stringify(evalAx, null, 2));
  window.webContents.debugger.detach();
  assert.deepEqual(rendererErrors, [], "No renderer error messages");
  await writeFile(join(evidence, "result.json"), JSON.stringify({ passed: true, platform: process.platform, inference: false, productionWindowFactory: true, results }, null, 2));
  console.log(JSON.stringify({ passed: true, evidence, scenarios: results.length }));
  exitCode = 0;
}
void app.whenReady().then(main).catch(async error => {
  console.error(error);
  await writeFile(join(evidence, "failure.json"), JSON.stringify({ error: String(error.stack || error), rendererErrors, results }, null, 2)).catch(() => {});
  if (window && !window.isDestroyed()) await capture("failure").catch(() => {});
}).finally(async () => {
  window?.destroy();
  await fixture?.close();
  await rm(profile, { recursive: true, force: true });
  app.exit(exitCode);
});
