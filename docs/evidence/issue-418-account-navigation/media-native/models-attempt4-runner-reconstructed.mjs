import { app, BrowserWindow, ipcMain } from "electron";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";

import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createWindowFactory } from "file:///Volumes/2T-SSD/worktrees/factory-418/desktop/main/window.mjs";
import { stopRunFixture, waitFor } from "file:///Volumes/2T-SSD/worktrees/factory-418/test/support/stop-run-fixture.mjs";

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
  "share-pending": () => null,
  "share-preflight": () => ({ status: "ready" }),
  "share-create": () => { throw new Error("Native layout proof must not publish"); },
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
  const animationBounds=await evaluate(`(() => {
    const toggle=document.querySelector('#collapseSidebar');
    const samples=[];
    for(const animation of toggle.getAnimations({subtree:true})) {
      if(animation.transitionProperty!=='transform') continue;
      const time=animation.currentTime,playing=animation.playState==='running';
      animation.pause();
      for(const fraction of [0,.25,.5,.75,1]) {
        animation.currentTime=Number(animation.effect.getTiming().duration)*fraction;
        const r=toggle.getBoundingClientRect();
        samples.push({fraction,left:r.left,top:r.top,right:r.right,bottom:r.bottom});
      }
      animation.currentTime=time;
      if(playing) animation.play();
    }
    return samples;
  })()`);
  if(process.platform==='darwin') assert.ok(animationBounds.every(r=>r.left>=80||r.top>=40), `${name}: animated toggle clearance ${JSON.stringify(animationBounds)}`);
  state.animationBounds=animationBounds;
  assert.equal(state.collapsed, !expanded, name);
  assert.equal(state.sidebar.width, expanded ? 210 : 58, name);
  // hiddenInset reserves the top-left 80x40 region for native macOS controls.
  // A successful center click alone cannot prove the entire toggle is clear.
  if(process.platform==='darwin') assert.ok(state.toggle.left>=80 || state.toggle.top>=40, `${name}: complete toggle hit box clears native titlebar controls ${JSON.stringify(state.toggle)}`);
  assert.ok(Math.abs(state.main.left - state.sidebar.right) <= 1, `${name}: sidebar stays in flow`);
  assert.ok(Math.abs(state.main.width - (state.inner[0] - state.sidebar.width)) <= 1, `${name}: workspace shrinks`);
  for (const key of ["toggle", "account", "settings"]) {
    const r = state[key];
    assert.ok(r?.visible && r.width > 0 && r.height > 0 && r.left >= state.sidebar.left && r.right <= state.sidebar.right && r.top >= 0 && r.bottom <= state.inner[1], `${name}: ${key} visible and contained`);
  }
  assert.ok(state.scrollWidth <= state.inner[0], `${name}: horizontal document overflow`);
  results.push({ name, outer: window.getSize(), content: window.getContentSize(), minimum: window.getMinimumSize(), ...state });
  const auditHeader = async (selectors) => evaluate(`(() => {
    const header=document.querySelector('.thread-header').getBoundingClientRect();
    return ${JSON.stringify(selectors)}.map(selector=>{
      const e=document.querySelector(selector),r=e?.getBoundingClientRect();
      return {selector,visible:e?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),rect:r&&{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},contained:r&&r.left>=header.left-.5&&r.right<=header.right+.5&&r.top>=0&&r.bottom<=innerHeight};
    });
  })()`);
  const headerControls=await auditHeader(['#historyBack','#historyForward','#conversationSettingsButton','#shareConversation']);
  assert.ok(headerControls.every(c=>c.visible&&c.rect.width>0&&c.rect.height>0&&c.contained), `${name}: header controls ${JSON.stringify(headerControls)}`);
  for(let i=0;i<headerControls.length;i++) for(let j=i+1;j<headerControls.length;j++) {
    const a=headerControls[i].rect,b=headerControls[j].rect;
    assert.ok(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=.5 || Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=.5, `${name}: header controls must not overlap`);
  }
  await evaluate("document.querySelector('#conversationSettingsButton').click()");
  const menuControls=await auditHeader(['#conversationSettingsMenu','#shareConversationMenu','#exportConversation']);
  assert.ok(menuControls.every(c=>c.visible&&c.rect.width>0&&c.rect.height>0&&c.contained), `${name}: menu controls ${JSON.stringify(menuControls)}`);
  await capture(`${name}-conversation-menu`);
  await evaluate("document.querySelector('#conversationSettingsButton').click()");
  if([375,620].includes(state.inner[0])) {
    await evaluate("document.querySelector('#shareConversation').click()");
    await waitFor(`${name}: Share title`,()=>evaluate("Boolean(document.querySelector('#shareTitle'))"));
    const dialog=await evaluate(`(() => {
      const selectors=['.share-dialog-card','#shareTitle','[data-share-action="cancel"]','[data-share-action="create"]'];
      return selectors.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {selector,visible:e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),positive:r.width>0&&r.height>0,contained:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};});
    })()`);
    assert.ok(dialog.every(c=>c.visible&&c.positive&&c.contained),`${name}: Share dialog controls ${JSON.stringify(dialog)}`);
    assert.equal(await evaluate("document.querySelector('[data-share-action=\"create\"]').disabled"),true);
    await capture(`${name}-share-title`);
    await evaluate("document.querySelector('#shareTitle').value='Native layout evidence';document.querySelector('#shareTitle').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-share-action=\"cancel\"]').click()");
    assert.equal(await evaluate("document.querySelector('#shareDialog').classList.contains('hidden')"),true);
    results.at(-1).shareDialog=dialog;
  }
  results.at(-1).headerControls=headerControls;
  results.at(-1).menuControls=menuControls;
  await capture(name);
  const composerControls=await evaluate(`(async()=>{
    const selectors=['#threadPrompt','#sendInteraction','#threadComposer [data-model-picker-trigger]'];
    const controls=[];
    for(const selector of selectors) {
      const e=document.querySelector(selector);
      if(!e) throw Error('Missing native composer control '+selector);
      e.scrollIntoView({block:'nearest',inline:'nearest'});
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const r=e.getBoundingClientRect();
      let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
      for(let parent=e.parentElement;parent;parent=parent.parentElement) {
        const style=getComputedStyle(parent);
        const pr=parent.getBoundingClientRect();
        if(['auto','scroll','hidden','clip'].includes(style.overflowX)) {
          clip.left=Math.max(clip.left,pr.left+parent.clientLeft);
          clip.right=Math.min(clip.right,pr.left+parent.clientLeft+parent.clientWidth);
        }
        if(['auto','scroll','hidden','clip'].includes(style.overflowY)) {
          clip.top=Math.max(clip.top,pr.top+parent.clientTop);
          clip.bottom=Math.min(clip.bottom,pr.top+parent.clientTop+parent.clientHeight);
        }
      }
      controls.push({selector,visible:e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),width:r.width,height:r.height,contained:r.left>=clip.left-.5&&r.right<=clip.right+.5&&r.top>=clip.top-.5&&r.bottom<=clip.bottom+.5,clip});
    }
    return controls;
  })()`);
  assert.ok(composerControls.every(c=>c.visible&&c.width>0&&c.height>0&&c.contained), `${name}: native composer reachability ${JSON.stringify(composerControls)}`);
  results.at(-1).composerControls=composerControls;
  await capture(`${name}-composer-scrolled`);
  await evaluate("document.querySelector('.workspace-layout').scrollTop=0");
}

async function auditNewThreadComposer(name, threadId) {
  await evaluate("document.querySelector('#newThread').click()");
  await waitFor(`${name}: New Thread view`,()=>evaluate("!document.querySelector('#newThreadView').classList.contains('hidden')"));
  const controls=await evaluate(`(async()=>{
    const selectors=['#newThreadPrompt','#scopeButton','#permissionButton','#newModelControl [data-model-picker-trigger]','#createThread'];
    const result=[];
    for(const selector of selectors) {
      const e=document.querySelector(selector);
      if(!e) throw Error('Missing New Thread composer control '+selector);
      e.scrollIntoView({block:'nearest',inline:'nearest'});
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const r=e.getBoundingClientRect();
      let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
      for(let parent=e.parentElement;parent;parent=parent.parentElement) {
        const style=getComputedStyle(parent),pr=parent.getBoundingClientRect();
        if(['auto','scroll','hidden','clip'].includes(style.overflowX)) {clip.left=Math.max(clip.left,pr.left+parent.clientLeft);clip.right=Math.min(clip.right,pr.left+parent.clientLeft+parent.clientWidth);}
        if(['auto','scroll','hidden','clip'].includes(style.overflowY)) {clip.top=Math.max(clip.top,pr.top+parent.clientTop);clip.bottom=Math.min(clip.bottom,pr.top+parent.clientTop+parent.clientHeight);}
      }
      result.push({selector,visible:e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),enabled:!('disabled'in e)||!e.disabled,width:r.width,height:r.height,contained:r.left>=clip.left-.5&&r.right<=clip.right+.5&&r.top>=clip.top-.5&&r.bottom<=clip.bottom+.5,clip});
    }
    return result;
  })()`);
  assert.ok(controls.every(c=>c.visible&&c.width>0&&c.height>0&&c.contained),`${name}: New Thread composer reachability ${JSON.stringify(controls)}`);
  results.push({name,controls});
  await capture(name);
  await evaluate(`document.querySelector('[data-thread="${threadId}"]').click()`);
  await waitFor(`${name}: return to saved thread`,()=>evaluate(`import('./src/state.js').then(m=>m.viewState.mainView==='thread'&&String(m.viewState.currentThreadId)===${JSON.stringify(String(threadId))})`));
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

const modelProvider = (id, label) => ({
  id, adapterId: "openai-api", label, endpoint: "https://api.openai.com/v1",
  accessContract: "secret@1", credentialReference: `fixture-credential-${id}`, lifecycleState: "active", removedAt: null,
});
async function addSettingsProvider(id, label, models) {
  const store = fixture.product.providerDefinitionStore();
  const definitions = await store.load();
  await store.save([...definitions.filter(item => item.id !== id), modelProvider(id, label)]);
  await fixture.product.publishProviderCatalog({
    providerId: id, adapterId: "openai-api", adapterImplementationVersion: "2", accessContract: "secret@1",
    label, connected: true, models,
  });
}
async function denyModelForHarness(harnessId, modelId) {
  const settings=await actualSettings();
  const harness=settings.harnesses.find(item=>item.id===harnessId);
  assert.ok(harness, `Fixture harness ${harnessId} is available`);
  const session=fixture.session;
  const response=await fetch(new URL(`/api/harness-configurations/${harnessId}/model-rules`,session.origin),{
    method:'PUT',headers:{Cookie:`${session.cookie.name}=${session.cookie.value}`,'Content-Type':'application/json'},
    body:JSON.stringify({expectedRevision:harness.configurationRevision,allow:harness.modelRules?.allow??[],deny:[...(harness.modelRules?.deny??[]),{adapterId:'openai-api',modelIdExact:modelId}]})
  });
  assert.equal(response.status,204,`Fixture rule update ${harnessId}/${modelId}`);
}
async function effectiveBounds(selector) {
  return evaluate(`(async()=>{
    const e=document.querySelector(${JSON.stringify(selector)});
    if(!e) throw Error('Missing '+${JSON.stringify(selector)});
    e.scrollIntoView({block:'nearest',inline:'nearest'});
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const r=e.getBoundingClientRect();
    let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
    for(let p=e.parentElement;p;p=p.parentElement){
      const s=getComputedStyle(p),b=p.getBoundingClientRect();
      if(['auto','scroll','hidden','clip'].includes(s.overflowX)){clip.left=Math.max(clip.left,b.left+p.clientLeft);clip.right=Math.min(clip.right,b.left+p.clientLeft+p.clientWidth);}
      if(['auto','scroll','hidden','clip'].includes(s.overflowY)){clip.top=Math.max(clip.top,b.top+p.clientTop);clip.bottom=Math.min(clip.bottom,b.top+p.clientTop+p.clientHeight);}
    }
    return {text:e.textContent.trim(),visible:e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},clip,contained:r.left>=clip.left-.5&&r.right<=clip.right+.5&&r.top>=clip.top-.5&&r.bottom<=clip.bottom+.5};
  })()`);
}
async function selectModelSettings(width, expanded) {
  await resize(width);
  const collapsed=await evaluate("document.body.classList.contains('sidebar-collapsed')");
  if(collapsed===expanded) await evaluate("document.querySelector('#collapseSidebar').click()");
  await evaluate(`(()=>{const s=document.querySelector('#settingsCompactSelect');if(s){s.value='models';s.dispatchEvent(new Event('change',{bubbles:true}));}else document.querySelector('[data-settings-tab="models"]')?.click();})()`);
  await waitFor(`Models at ${width}/${expanded?'expanded':'collapsed'}`,()=>evaluate("!document.querySelector('[data-settings-panel=models]').classList.contains('hidden')"));
  await settle();
}
async function actualSettings() { return fixture.request('/api/model-settings'); }
async function assertHintState(name, expectedText) {
  const payload=await actualSettings();
  assert.ok(Array.isArray(payload.providers)&&Array.isArray(payload.families)&&Array.isArray(payload.harnesses), `${name}: actual model-settings response shape`);
  await evaluate("import('./src/model-family-settings.js').then(m=>m.refreshModelSettings())");
  await settle();
  const hint=await effectiveBounds('#defaultProviderHint');
  const providerControl=await effectiveBounds('#defaultProviderSelect');
  const harnessControl=await effectiveBounds('#defaultHarnessSelect');
  assert.ok(providerControl.visible&&providerControl.rect.width>0&&providerControl.rect.height>0&&providerControl.contained, `${name}: provider selector reachable ${JSON.stringify(providerControl)}`);
  assert.ok(harnessControl.visible&&harnessControl.rect.width>0&&harnessControl.rect.height>0&&harnessControl.contained, `${name}: harness selector reachable ${JSON.stringify(harnessControl)}`);
  if(expectedText===null){
    assert.equal(hint.text,'',`${name}: no provider eligibility hint`);
    assert.equal(await evaluate("document.querySelector('#defaultProviderHint').classList.contains('hidden')"),true,`${name}: hint is hidden for empty eligibility`);
  }else{
    assert.ok(hint.visible&&hint.rect.width>0&&hint.rect.height>0&&hint.contained,`${name}: visible hint within effective viewport clip ${JSON.stringify(hint)}`);
    assert.ok(hint.text.includes(expectedText),`${name}: expected ${JSON.stringify(expectedText)} in ${JSON.stringify(hint.text)}`);
  }
  return { payload, hint, providerControl, harnessControl };
}
async function auditF807ModelsSidebar() {
  const baseline=await actualSettings();
  assert.ok(baseline.defaults.providerId && baseline.families.length>0, 'Real initial Models settings are populated');
  await selectModelSettings(375,true);
  const noHint=await assertHintState('375 expanded baseline',null);
  await capture('models-375-expanded-no-hint');
  await addSettingsProvider('fixture-needs-refresh','Refresh eligibility fixture',[]);
  let response=await actualSettings();
  assert.ok(response.providers.some(p=>p.id==='fixture-needs-refresh'&&p.connected), 'Refresh fixture is connected in real model-settings response');
  assert.ok(!response.families.some(f=>f.managedPolicy?.providerId==='fixture-needs-refresh'), 'Empty catalog has no managed family');
  for(const [width,expanded] of [[375,true],[375,false],[620,true]]){
    await selectModelSettings(width,expanded);
    const proof=await assertHintState(`${width}/${expanded?'expanded':'collapsed'} refresh hint`,'Refresh eligibility fixture');
    assert.ok(proof.hint.text.includes('Refresh its models'), 'Production hint names the refresh remedy');
    await capture(`models-${width}-${expanded?'expanded':'collapsed'}-refresh-hint`);
  }
  await addSettingsProvider('fixture-no-harness','Harness eligibility fixture',[{id:'no-harness-model',label:'No harness model',order:0,visible:true,available:true,providerDefault:true,metadata:{}}]);
  await denyModelForHarness('fixture-stop-codex','no-harness-model');
  await denyModelForHarness('fixture-stop-prime','no-harness-model');
  response=await actualSettings();
  const noHarnessFamily=response.families.find(f=>f.managedPolicy?.providerId==='fixture-no-harness');
  assert.ok(noHarnessFamily,'Real response includes managed family for no-harness provider');
  assert.ok(response.harnesses.every(h=>!(h.usableFamilyIds??[]).some(id=>String(id)===String(noHarnessFamily.id))), 'No harness can use eligibility family');
  for(const [width,expanded] of [[375,true],[375,false],[620,true]]){
    await selectModelSettings(width,expanded);
    const proof=await assertHintState(`${width}/${expanded?'expanded':'collapsed'} no-harness hint`,'Harness eligibility fixture');
    assert.ok(proof.hint.text.includes('No available harness can run'), 'Production hint names the unavailable-harness remedy');
    await capture(`models-${width}-${expanded?'expanded':'collapsed'}-no-harness-hint`);
  }
  await addSettingsProvider('fixture-harness-move','Harness move fixture',[{id:'movable-model',label:'Movable model',order:0,visible:true,available:true,providerDefault:true,metadata:{}}]);
  await denyModelForHarness('fixture-stop-codex','movable-model');
  response=await actualSettings();
  const moveFamily=response.families.find(f=>f.managedPolicy?.providerId==='fixture-harness-move');
  assert.ok(moveFamily,'Real response includes the move provider managed family');
  assert.ok(response.harnesses.some(h=>h.id==='fixture-stop-prime'&&h.permissionAvailable&&h.usableFamilyIds.some(id=>String(id)===String(moveFamily.id))), 'Prime is permission-available and can run the move family');
  assert.ok(!response.harnesses.some(h=>h.id==='fixture-stop-codex'&&h.usableFamilyIds.some(id=>String(id)===String(moveFamily.id))), 'Current Codex harness cannot run the move family');
  await evaluate("import('./src/model-family-settings.js').then(m=>m.refreshModelSettings())");
  await waitFor('move provider option appears after production refresh',()=>evaluate("[...document.querySelector('#defaultProviderSelect').options].some(o=>o.value==='fixture-harness-move'&&!o.disabled)"));
  await selectModelSettings(375,true);
  const assignment=await evaluate("(()=>{const s=document.querySelector('#defaultProviderSelect');s.value='fixture-harness-move';return {value:s.value,exists:[...s.options].some(o=>o.value==='fixture-harness-move'&&!o.disabled)};})()");
  assert.ok(assignment.exists&&assignment.value==='fixture-harness-move',`Move provider option is selectable before dispatch ${JSON.stringify(assignment)}`);
  await evaluate("document.querySelector('#defaultProviderSelect').dispatchEvent(new Event('change',{bubbles:true}))");
  try { await waitFor('provider save commits moved harness',()=>evaluate("document.querySelector('#defaultProviderSelect').value==='fixture-harness-move'&&document.querySelector('#defaultHarnessSelect').value==='fixture-stop-prime'")); }
  catch(error){
    const diagnostic={error:String(error),actualSettings:await actualSettings(),dom:await evaluate("(()=>({provider:document.querySelector('#defaultProviderSelect')?.value,harness:document.querySelector('#defaultHarnessSelect')?.value,providerOptions:[...document.querySelector('#defaultProviderSelect')?.options??[]].map(o=>({value:o.value,disabled:o.disabled,text:o.textContent})),status:document.querySelector('#modelSettingsStatus')?.textContent, statusClass:document.querySelector('#modelSettingsStatus')?.className}))()")};
    await writeFile(join(evidence,'f807-move-save-diagnostic.json'),JSON.stringify(diagnostic,null,2));
    throw new Error(`Provider save diagnostic ${JSON.stringify(diagnostic)}`);
  }
  const committed=await actualSettings();
  assert.equal(committed.defaults.providerId,'fixture-harness-move');
  assert.equal(committed.defaults.harnessId,'fixture-stop-prime');
  assert.equal(String(committed.defaults.familyId),String(moveFamily.id));
  const status=await effectiveBounds('#modelSettingsStatus');
  assert.ok(status.visible&&status.contained&&status.text.includes('The default harness is now'),`Production move notice is reachable ${JSON.stringify(status)}`);
  assert.ok(status.text.includes('fixture-stop-prime')||status.text.includes('Prime'), 'Notice identifies committed destination harness');
  await capture('models-375-expanded-harness-move-notice');
  for(const [width,expanded] of [[375,false],[620,true]]){
    await selectModelSettings(width,expanded);
    const resizedStatus=await effectiveBounds('#modelSettingsStatus');
    assert.ok(resizedStatus.visible&&resizedStatus.rect.width>0&&resizedStatus.rect.height>0&&resizedStatus.contained&&resizedStatus.text.includes('The default harness is now'),`Move notice remains reachable at ${width}/${expanded?'expanded':'collapsed'} ${JSON.stringify(resizedStatus)}`);
    await capture(`models-${width}-${expanded?'expanded':'collapsed'}-harness-move-notice`);
  }
  await selectModelSettings(375,true);
  return {baseline:{providerId:noHint.payload.defaults.providerId,noHint:noHint.hint},hintVariants:['needsRefresh','noHarness'],move:{providerId:committed.defaults.providerId,familyId:committed.defaults.familyId,harnessId:committed.defaults.harnessId,notice:status.text},widths:[[375,true],[375,false],[620,true]]};
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
    if(width===375) await auditNewThreadComposer("native-375-expanded-new-thread",thread.id);
    await resize(width + 1);
    if (width < 760) await shell(`native-${width + 1}-preserved`, true);
    await resize(761);
    await shell(`native-761-after-${width}`, true);
  }
  assert.ok(results.some(r=>r.animationBounds?.length>=5), "At least one live toggle transform animation must be sampled");
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
  const f807ModelsProof = await auditF807ModelsSidebar();
  await writeFile(join(evidence, "f807-models-proof.json"), JSON.stringify(f807ModelsProof, null, 2));
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
