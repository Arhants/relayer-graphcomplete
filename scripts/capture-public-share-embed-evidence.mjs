import { app, BrowserWindow, session, nativeTheme } from "electron";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startEmbedFixtureServer, repositoryRoot, sharePath } from "./fixtures/public-share-embed.mjs";

if (process.env.RELAYER_CAPTURE_PUBLIC_SHARE_EMBED_EVIDENCE !== "1") {
  throw new Error("Set RELAYER_CAPTURE_PUBLIC_SHARE_EMBED_EVIDENCE=1 to run the local iframe proof.");
}
const output = resolve(repositoryRoot, ".relayer/evidence/issue-558-embed-slice-one");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function waitFor(frame, expression) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await frame.executeJavaScript(expression)) return;
    await new Promise((done) => setTimeout(done, 40));
  }
  throw new Error(`Condition did not become true: ${expression}`);
}

async function main() {
  await mkdir(output, { recursive: true });
  const fixture = await startEmbedFixtureServer({ crossOrigin: true });
  const frameOrigin = fixture.origin.replace("127.0.0.1", "localhost");
  const requests = [];
  const errors = [];
  const knownDiagnostics = [];
  const assertions = {};
  const captures = [];
  const partition = "embed-slice-one-evidence";
  session.fromPartition(partition).webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    requests.push({ url: details.url, type: details.resourceType });
    callback({ cancel: ![fixture.origin, frameOrigin].includes(new URL(details.url).origin) });
  });
  const window = new BrowserWindow({ width: 1440, height: 1100, useContentSize: true, show: false,
    webPreferences: { partition, sandbox: true, nodeIntegration: false, contextIsolation: true } });
  window.webContents.on("console-message", (details) => {
    if (details.message === "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.") {
      knownDiagnostics.push(details.message); // Existing template; HTTP header owns framing.
    } else if (details.level === "error") errors.push(details.message);
  });
  let openedUrl;
  window.webContents.setWindowOpenHandler(({ url }) => { openedUrl = url; return { action: "deny" }; });
  try {
    await window.loadURL(`${fixture.origin}/`);
    const findFrame = async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const candidate = window.webContents.mainFrame.frames.find(frame => frame.url.endsWith("/embed"));
        if (candidate) { await waitFor(candidate, "Boolean(document.querySelector('.graph-node'))"); return candidate; }
        await new Promise(done => setTimeout(done, 40));
      }
      throw new Error("Viewer iframe did not load");
    };
    let frame = await findFrame();
    if (!frame) throw new Error("The production viewer did not load in an iframe.");
    const run = (expression) => frame.executeJavaScript(expression, true);
    const check = async (name, expression) => {
      const actual = await run(expression);
      if (actual !== true) throw new Error(`${name}: ${JSON.stringify(actual)}`);
      assertions[name] = true;
    };
    const click = async (selector) => run(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing rendered control'); element.click(); return true; })()`);
    const selected = async () => { await click('[data-node="node:root-1"]'); await waitFor(frame, "!document.querySelector('#inspector').classList.contains('hidden')"); };
    const capture = async (name) => {
      await run("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
      const bytes = (await window.webContents.capturePage()).toPNG();
      await writeFile(resolve(output, `${name}.png`), bytes);
      captures.push({ file: `${name}.png`, sha256: hash(bytes) });
    };
    await check("firstAcceptedTurn", "document.querySelector('#turnPickerButton').textContent.trim() === 'Turn 1 of 5'");
    await check("embedChromeOnly", "!document.querySelector('.public-share-download-card') && !document.querySelector('.environment-panel') && Boolean(document.querySelector('.public-share-embed-branding a'))");
    await capture("article-overview");
    await selected();
    await waitFor(frame, "Boolean(document.querySelector('[data-action-id=\"action:completed\"]'))");
    await run("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
    await check("graphRemainsVisibleAfterSplit", `(() => {
      const stage = document.querySelector('#graphStage').getBoundingClientRect();
      return [...document.querySelectorAll('.graph-node')].every(node => {
        const r = node.getBoundingClientRect();
        return r.left >= stage.left && r.right <= stage.right && r.top >= stage.top && r.bottom <= stage.bottom;
      });
    })()`);
    const geometry = await run(`(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
      return { graph:box('.graph-column'), details:box('#inspector'), viewport:{width:innerWidth,height:innerHeight} };
    })()`);
    if (Math.abs(geometry.graph.width - geometry.details.width) > 1 || geometry.graph.width < 300
      || geometry.graph.right > geometry.details.x || geometry.details.right > geometry.viewport.width
      || geometry.details.bottom > geometry.viewport.height + 1) throw new Error(`Invalid split: ${JSON.stringify(geometry)}`);
    assertions.equalVisibleColumns = true;
    await check("inputControlsDisabled", "document.querySelectorAll('#nodeInputActions button').length > 0 && [...document.querySelectorAll('#nodeInputActions button')].every(button => button.disabled)");
    await check("unexecutedInvokeDisabled", "document.querySelector('[data-action-id=\"action:unexecuted\"]').disabled");
    await capture("node-details-split");
    await click('#closeInspector');
    await waitFor(frame, "document.querySelector('#inspector').classList.contains('hidden')");
    await run("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
    await check("closingDetailsRestoresGraphWidth", `(() => {
      const graph=document.querySelector('.graph-column').getBoundingClientRect();
      const layout=document.querySelector('.workspace-layout');
      const workspace=layout.getBoundingClientRect();
      const style=getComputedStyle(layout);
      const available=workspace.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
      return Math.abs(graph.width-available)<1 && [...document.querySelectorAll('.graph-node')].every(node => {
        const r=node.getBoundingClientRect();return r.left>=graph.left && r.right<=graph.right && r.top>=graph.top && r.bottom<=graph.bottom;
      });
    })()`);
    await selected();
    await waitFor(frame, "Boolean(document.querySelector('[data-action-id=\"action:completed\"]'))");
    await click('[data-action-id="action:unexecuted"]');
    await check("unexecutedInvokeDidNotNavigate", "document.querySelector('#turnPickerButton').textContent.trim() === 'Turn 1 of 5'");
    await click('[data-action-id="action:details-1"]');
    await waitFor(frame, "Boolean(document.querySelector('[data-node=\"node:details-1\"]'))");
    assertions.expansionReachedNestedLayer = true;
    await run("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
    await check("nestedDestinationFitsSplit", `(() => {
      const stage=document.querySelector('#graphStage').getBoundingClientRect();
      return [...document.querySelectorAll('.graph-node')].every(n=>{const r=n.getBoundingClientRect();return r.left>=stage.left && r.right<=stage.right && r.top>=stage.top && r.bottom<=stage.bottom;});
    })()`);
    await capture("nested-layer-split");
    await click('#nextTurn');
    await waitFor(frame, "document.querySelector('#turnPickerButton').textContent.trim() === 'Turn 2 of 5'");
    await click('[data-node="node:root-2"]');
    await waitFor(frame, "Boolean(document.querySelector('[data-action-id=\"action:prior-reference\"]'))");
    await click('[data-action-id="action:prior-reference"]');
    await waitFor(frame, "Boolean(document.querySelector('[data-node=\"node:details-1\"]'))");
    await check("priorTurnReferenceWithinAcceptedClosure", "document.querySelector('#turnPickerButton').textContent.trim() === 'Turn 2 of 5'");
    await click('#previousTurn');
    await selected();
    await click('[data-action-id="action:completed"]');
    await waitFor(frame, "Boolean(document.querySelector('[data-node=\"node:root-2\"]')) && document.querySelector('#turnPickerButton').textContent.trim() === 'Turn 2 of 5'");
    assertions.completedInvokeOpenedAcceptedResult = true;
    await check("mutationControlsUnavailable", "['#threadComposerShell','#approvalDock','#annotationPanel','#nodeContextDock'].every(selector => {const e=document.querySelector(selector);return !e || getComputedStyle(e).display === 'none';})");
    await check("frameUrlUnchanged", `location.href === ${JSON.stringify(`${frameOrigin}${sharePath}/embed`)}`);
    if (window.webContents.getURL() !== `${fixture.origin}/`) throw new Error("Parent URL changed");
    assertions.parentUrlUnchanged = true;
    await check("fullGraphLinkSafe", `(() => {const a=document.querySelector('.public-share-embed-branding a');return a.getAttribute('href')===${JSON.stringify(sharePath)} && a.target==='_blank' && a.rel.includes('noopener') && a.rel.includes('noreferrer');})()`);
    await click('.public-share-embed-branding a');
    await waitFor(window.webContents.mainFrame, "true");
    if (openedUrl !== `${frameOrigin}${sharePath}`) throw new Error(`Full graph opened wrong destination: ${openedUrl}`);
    assertions.fullGraphRequestedNewWindow = true;
    await window.loadURL(`${fixture.origin}/`);
    frame = await findFrame();
    await waitFor(frame, "document.querySelector('#turnPickerButton')?.textContent.trim() === 'Turn 1 of 5'");
    assertions.reloadResetFirstTurn = true;
    // Browser input and cross-origin frames, not synthetic wheel dispatch.
    await click('#closeInspector');
    await waitFor(frame, "document.querySelector('#inspector').classList.contains('hidden')");
    await run("new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))");
    const zoomBefore = await run("document.querySelector('#graphZoomLevel').textContent");
    const frameBox = await window.webContents.mainFrame.executeJavaScript("(()=>{const r=document.querySelector('iframe').getBoundingClientRect();return {x:r.x,y:r.y};})()");
    await window.webContents.mainFrame.executeJavaScript("window.__scrollEnded=false;addEventListener('scrollend',()=>window.__scrollEnded=true,{once:true})");
    window.webContents.sendInputEvent({type:"mouseWheel",x:Math.round(frameBox.x+200),y:Math.round(frameBox.y+350),deltaY:-350,deltaX:0});
    await waitFor(window.webContents.mainFrame,"scrollY > 0 && window.__scrollEnded");
    if (await run("document.querySelector('#graphZoomLevel').textContent") !== zoomBefore) throw new Error("Article scroll zoomed the graph");
    assertions.ordinaryWheelScrollsArticle = true;
    await window.webContents.mainFrame.executeJavaScript("scrollTo(0,0)");
    await click('#zoomOutGraph');
    if (await run("document.querySelector('#graphZoomLevel').textContent") === zoomBefore) throw new Error("Explicit zoom control did not work");
    assertions.explicitZoomWorks = true;
    const beforePinch=await run("document.querySelector('#graphZoomLevel').textContent");
    const pinchPoint=await window.webContents.mainFrame.executeJavaScript("(()=>{const r=document.querySelector('iframe').getBoundingClientRect();return {x:Math.round(r.x+200),y:Math.round(r.y+350)};})()");
    window.webContents.sendInputEvent({type:'mouseMove',...pinchPoint});
    window.webContents.sendInputEvent({type:'mouseDown',...pinchPoint,button:'left',clickCount:1});
    window.webContents.sendInputEvent({type:'mouseUp',...pinchPoint,button:'left',clickCount:1});
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseWheel',...pinchPoint,deltaY:-150,deltaX:0,modifiers:2});
    window.webContents.debugger.detach();
    await run("new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))");
    await waitFor(frame,`document.querySelector('#graphZoomLevel').textContent!==${JSON.stringify(beforePinch)}`);
    assertions.explicitCtrlWheelZoomWorks=true;
    if (requests.some(r=>r.url.includes('theme=light'))) throw new Error("Distant lazy iframe loaded eagerly");
    assertions.distantFrameDeferred = true;
    await window.webContents.mainFrame.executeJavaScript("document.querySelectorAll('iframe')[1].scrollIntoView()");
    const secondDeadline=Date.now()+15000;
    let secondFrame;
    while(Date.now()<secondDeadline) {
      secondFrame=window.webContents.mainFrame.frames.find(f=>f.url.includes('theme=light'));
      if(secondFrame) break;
      await new Promise(done=>setTimeout(done,40));
    }
    if(!secondFrame) throw new Error("Near-viewport frame failed to load");
    await waitFor(secondFrame,"Boolean(document.querySelector('.graph-node'))");
    if(await secondFrame.executeJavaScript("document.documentElement.dataset.theme") !== 'light') throw new Error("Fixed theme was not applied");
    assertions.nearViewportLoadsFixedTheme = true;
    await window.webContents.mainFrame.executeJavaScript("scrollTo(0,0)");
    const themeSource=nativeTheme.themeSource;
    try {
      nativeTheme.themeSource='light';
      await waitFor(frame,"document.documentElement.dataset.theme==='light'");
      nativeTheme.themeSource='dark';
      await waitFor(frame,"document.documentElement.dataset.theme==='dark'");
      if(await secondFrame.executeJavaScript("document.documentElement.dataset.theme")!=='light') throw new Error('System preference replaced fixed theme');
      assertions.systemThemeChangesPreserveFixedTheme=true;
    } finally { nativeTheme.themeSource=themeSource; }
    await secondFrame.executeJavaScript("document.querySelector('#nextTurn').click()");
    await waitFor(secondFrame,"document.querySelector('#turnPickerButton').textContent.trim()==='Turn 2 of 5'");
    await check("independentEmbedNavigation","document.querySelector('#turnPickerButton').textContent.trim()==='Turn 1 of 5'");
    await window.webContents.mainFrame.executeJavaScript("scrollTo(0,0)");
    window.setContentSize(390,844);
    await selected();
    await run("new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))");
    await check("narrowDetailsReplaceGraph", `(()=>{const panel=document.querySelector('#inspector').getBoundingClientRect();return getComputedStyle(document.querySelector('.graph-column')).display==='none' && panel.width>innerWidth-60 && panel.bottom<=innerHeight+1;})()`);
    await window.webContents.mainFrame.executeJavaScript("document.querySelector('iframe').scrollIntoView()");
    await capture("mobile-details");
    await click('#closeInspector');
    await check("backRestoresKeyboardGraph", "document.activeElement===document.querySelector('#graphStage') && getComputedStyle(document.querySelector('.graph-column')).display!=='none'");
    await click('[data-node="node:reason"]');
    await waitFor(frame,"document.querySelector('#nodeTitle')?.textContent==='Reasoning' || document.querySelector('.node-heading')?.textContent.includes('Reasoning')");
    await check("longDetailsRemainBounded", `(()=>{const content=document.querySelector('.inspector-content');return content.scrollHeight>content.clientHeight && document.querySelector('#inspector').getBoundingClientRect().bottom<=innerHeight+1;})()`);
    await run("document.querySelector('.inspector-content').scrollTop=100000");
    await check("finalDetailReachable", `(()=>{const e=document.querySelector('.inspector-content');return e.textContent.includes('Final detail paragraph.') && e.scrollTop+e.clientHeight>=e.scrollHeight-1;})()`);
    await capture("mobile-long-details");
    window.show();
    window.focus();
    const nativeClick = async selector => {
      const rect = await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      const offset = await window.webContents.mainFrame.executeJavaScript("(()=>{const r=document.querySelector('iframe').getBoundingClientRect();return {x:r.x,y:r.y};})()");
      const point={x:Math.round(offset.x+rect.x),y:Math.round(offset.y+rect.y)};
      window.webContents.debugger.attach('1.3');
      for (const type of ['mouseMoved','mousePressed','mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
      window.webContents.debugger.detach();
    };
    await nativeClick('#closeInspector');
    await waitFor(frame,"document.querySelector('#inspector').classList.contains('hidden')");
    await run("new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))");
    await nativeClick('[data-node="node:reason"]');
    await waitFor(frame,"!document.querySelector('#inspector').classList.contains('hidden')");
    await run("document.querySelector('#closeInspector').focus()");
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    window.webContents.debugger.detach();
    await run("new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))");
    await waitFor(frame,"document.querySelector('#inspector').classList.contains('hidden') && document.activeElement===document.querySelector('#graphStage')");
    assertions.keyboardEscapeRestoresGraph=true;
    await run("new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))");
    await check("narrowBackFitsVisibleCanvas",`(()=>{const stage=document.querySelector('#graphStage').getBoundingClientRect();return [...document.querySelectorAll('.graph-node')].every(n=>{const r=n.getBoundingClientRect();return r.left>=stage.left && r.right<=stage.right && r.top>=stage.top && r.bottom<=stage.bottom;});})()`);
    await run("document.querySelector('#fitGraph').focus()");
    await check("keyboardTraversalStartsInsideFrame", "document.activeElement === document.querySelector('#fitGraph')");
    if (!await window.webContents.mainFrame.executeJavaScript("document.activeElement === document.querySelector('iframe')")) {
      throw new Error("Keyboard traversal must start inside the first iframe");
    }
    let exited=false;
    window.webContents.debugger.attach("1.3");
    for(let i=0;i<35;i++) {
      await window.webContents.debugger.sendCommand("Input.dispatchKeyEvent", {type:"keyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
      await window.webContents.debugger.sendCommand("Input.dispatchKeyEvent", {type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
      exited=await window.webContents.mainFrame.executeJavaScript("document.activeElement?.id==='after-first-graph'");
      if(exited) break;
    }
    window.webContents.debugger.detach();
    if(!exited) throw new Error('Keyboard could not exit iframe');
    assertions.keyboardExitsToArticle=true;
    await capture("mobile-graph");
    await window.webContents.mainFrame.executeJavaScript("document.querySelector('iframe').scrollIntoView()");
    const touchPoint=await window.webContents.mainFrame.executeJavaScript("(()=>{const r=document.querySelector('iframe').getBoundingClientRect();return {x:r.x+140,y:r.y+350};})()");
    const scrollBeforeTouch=await window.webContents.mainFrame.executeJavaScript("scrollY");
    const zoomBeforeTouch=await run("document.querySelector('#graphZoomLevel').textContent");
    window.webContents.debugger.attach('1.3');
    try {
      await window.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
      await window.webContents.debugger.sendCommand('Input.synthesizeScrollGesture',{...touchPoint,yDistance:-180,gestureSourceType:'touch',preventFling:true});
    } finally { window.webContents.debugger.detach(); }
    await waitFor(window.webContents.mainFrame,`scrollY>${scrollBeforeTouch}`);
    if(await run("document.querySelector('#graphZoomLevel').textContent")!==zoomBeforeTouch) throw new Error('Touch article scroll changed graph zoom');
    assertions.touchScrollContinuesArticle=true;
    const unexpected = requests.filter(({ url, type }) => ![fixture.origin, frameOrigin].includes(new URL(url).origin) || ["xhr", "webSocket", "ping"].includes(type));
    if (unexpected.length) throw new Error(`Unexpected requests: ${JSON.stringify(unexpected)}`);
    assertions.noOutboundOrApiRequests = true;
    if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
    const sourcePaths = [...new Set([...fixture.servedFiles, "desktop/renderer/src/public-share-viewer/template.js",
      "scripts/fixtures/public-share-embed.mjs", "scripts/capture-public-share-embed-evidence.mjs",
      "docs/evidence/issue-471-public-share-viewer/synthetic-snapshot.jsonl"])].sort();
    const sourceFiles = {};
    for (const path of sourcePaths) sourceFiles[path] = hash(await readFile(resolve(repositoryRoot, path)));
    const manifest = { schemaVersion: 1, evidence: "issue-558-embed-slice-one", scope: "Local cross-origin wide/mobile iframes; not hosted service proof",
      source: { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(), sourceFiles, digest: hash(JSON.stringify(sourceFiles)) },
      fixture: { sha256: hash(fixture.snapshot), kind: "synthetic" }, browser: { electron: process.versions.electron, viewport: { width:1440,height:1100 }, geometry, assertions, requests, errors, knownDiagnostics }, captures };
    await writeFile(resolve(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Passed ${Object.keys(assertions).length} iframe checkpoints. Evidence: ${output}`);
  } finally {
    window.destroy();
    await new Promise((done) => fixture.server.close(done));
  }
}
app.whenReady().then(main).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
