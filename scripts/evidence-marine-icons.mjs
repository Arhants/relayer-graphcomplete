import { app, BrowserWindow, ipcMain } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { runEvidenceCleanup } from "./evidence-service-cleanup.mjs";

const root=resolve(import.meta.dirname,"..");
const evidenceRoot=resolve(process.env.RELAYER_MARINE_ICON_EVIDENCE_DIR??join(root,".relayer/evidence/marine-icons"));
const sourceDigestPolicy={algorithm:"sha256",encoding:"sorted git tracked and nonignored untracked path + NUL + exact bytes + NUL",excludedPaths:["docs/evidence/issue-624-icons/README.md","docs/evidence/issue-624-icons/reviews.json"],excludedPrefixes:["docs/evidence/issue-624-discoverable-icons/ux/"],reason:"Delivery receipts and generated evidence outputs cannot recursively certify their own bytes; product source and fixture inputs remain included."};
const output=join(evidenceRoot,`run-${new Date().toISOString().replaceAll(":","-")}-${randomBytes(4).toString("hex")}`);
const directory=await mkdtemp(join(tmpdir(),"marine-icons-electron-"));
const services=[];const windows=[];
let evalService;let productSession;let cleanupStarted=false;let cleanupCompleted=false;
let ReviewSession; let loadReadyReviewWorkspace;
const invariant=(value,message)=>{if(!value)throw Error(message);};
app.setName("Relayer Marine Icon Evidence");
app.setPath("userData",join(directory,"electron-profile"));
app.commandLine.appendSwitch("disable-gpu");
app.on("window-all-closed",()=>{});
process.env.RELAYER_MARINE_ICON_EVIDENCE_DIR=output;
const deadline=new Promise((_,reject)=>setTimeout(()=>reject(Error("Marine icon evidence exceeded 90 second deadline")),90_000).unref());
async function request(path,options={}){
 const response=await fetch(new URL(path,productSession.origin),{...options,headers:{Cookie:`${productSession.cookie.name}=${productSession.cookie.value}`,...(options.body?{"content-type":"application/json"}:{})}});
 const body=await response.json();if(!response.ok)throw Error(JSON.stringify(body));return body;
}
async function sourceDigest(){
 const exec=promisify(execFile);
 const paths=(await exec("git",["ls-files","-z","--cached","--others","--exclude-standard"],{cwd:root,maxBuffer:8e6})).stdout.split("\0").filter(Boolean).filter(path=>!sourceDigestPolicy.excludedPaths.includes(path)&&!sourceDigestPolicy.excludedPrefixes.some(prefix=>path.startsWith(prefix)));
 const hash=createHash("sha256");
 for(const path of [...new Set(paths)].sort()){hash.update(path);hash.update("\0");hash.update(await readFile(join(root,path)));hash.update("\0");}
 return hash.digest("hex");
}
async function nativeBinaryDigests(){
 const results={};
 for(const name of ["relayer-graph-server","relayer-app-server"]){
  const bytes=await readFile(join(root,"target/debug",name));
  results[name]={sha256:createHash("sha256").update(bytes).digest("hex"),byteLength:bytes.length};
 }
 return results;
}
async function readyImages(window,count){
 const stop=Date.now()+15_000;
 while(Date.now()<stop){
  const result=await window.webContents.executeJavaScript(`(() => {const hosts=[...document.querySelectorAll('[data-node] .relayer-image-icon')];return {hosts:hosts.length,images:hosts.map(host=>{const image=host.querySelector('img');const rect=host.getBoundingClientRect();return {loaded:Boolean(image?.complete&&image.naturalWidth>0),protocol:image?.src?new URL(image.src).protocol:null,width:rect.width,height:rect.height,fit:image?getComputedStyle(image).objectFit:null};})};})()`);
  if(result.hosts===count&&result.images.every(image=>image.loaded&&image.protocol==="blob:"))return result;
  await new Promise(done=>setTimeout(done,25));
 }
 throw Error("Production marine graph image icons did not load from accepted bytes");
}
async function openReview(execution,threadId,turn){
 const navigationToken=randomBytes(16).toString("hex");
 const window=new BrowserWindow({width:1480,height:920,show:true,webPreferences:{preload:join(root,"desktop/preload/eval-review.cjs"),additionalArguments:[`--relayer-eval-execution=${execution.id}`],partition:`marine-${randomBytes(8).toString("hex")}`,contextIsolation:true,nodeIntegration:false,sandbox:true}});windows.push(window);
 await window.webContents.session.cookies.set({url:productSession.origin,name:productSession.readOnlyCookie.name,value:productSession.readOnlyCookie.value,httpOnly:true,sameSite:"strict",secure:false});
 await loadReadyReviewWorkspace({window,ipc:ipcMain,url:`${productSession.origin}/?threadId=${threadId}&interactionId=${turn.id}&review=1&reviewSession=${navigationToken}`,expected:{executionId:execution.id,threadId,turnId:turn.id,navigationToken}});
 const session=new ReviewSession({executionId:execution.id,readOnly:true,webContents:window.webContents,artifactDirectory:output,ipc:ipcMain,loadInputDraftRevision:async(thread)=>(await request(`/api/state?threadId=${thread}`)).inputDraftRevision});
 const state=await session.open();invariant(String(state.layerId)===String(turn.completionOutput.rootLayer.layer.id),"Review must show accepted marine root");
 return {window,session};
}
async function run(){
 const [{marineEcologyFixtureFactory},{GraphCompleteRuntimeService},{RelayerAppServerService},{EvalService},review,readiness]=await Promise.all([
  import("./fixtures/marine-ecology-icons.mjs"),
  import("../desktop/main/services/graphcomplete-runtime.mjs"),
  import("../desktop/main/services/relayer-app-server.mjs"),
  import("../desktop/eval-main/eval-service.mjs"),
  import("../desktop/eval-main/review-session.mjs"),
  import("../desktop/eval-main/review-workspace-readiness.mjs"),
 ]);
 ReviewSession=review.ReviewSession; loadReadyReviewWorkspace=readiness.loadReadyReviewWorkspace;
 await mkdir(output,{recursive:true});
 const digest=await sourceDigest();
 const nativeBinaries=await nativeBinaryDigests();
 const config=join(directory,"marine.yaml");
 await writeFile(config,(await readFile(join(root,"harnesses/fixture-task-system.yaml"),"utf8")).replace("providerId: codex","providerId: openai-work").replace("managed-runtime@1","secret@1"));
 const runtime=new GraphCompleteRuntimeService({userDataDirectory:directory,graphServerBinary:join(root,"target/debug/relayer-graph-server"),configurationPaths:[config],additionalImplementations:{"fixture.task-system":marineEcologyFixtureFactory},acquireProviderExecution:async(providerId)=>({definition:{id:providerId,adapterId:"openai-api",accessContract:"secret@1",endpoint:"https://unused.invalid/v1"},descriptor:{adapterId:"openai-api",accessContract:"secret@1",implementationVersion:"2"},runtime:{async executionAccess(){return {kind:"secret",contract:"secret@1",providerId,adapterId:"openai-api",adapterImplementationVersion:"2",endpoint:"https://unused.invalid/v1",fields:{"api-key":"deterministic-unused"}};}},async release(){}})});services.push(runtime);
 const product=new RelayerAppServerService({userDataDirectory:directory,binaryPath:join(root,"target/debug/relayer-app-server"),webDirectory:join(root,"desktop/renderer"),permissionCatalogPath:join(root,"permissions/desktop.json"),runtimeSession:await runtime.start(),defaultHarnessConfiguration:"fixture-task-system",allowHarnessOverride:true,allowConversationImport:true,enableReadOnlySession:true,exportProducer:{desktopVersion:"marine-fixture",buildCommit:"0".repeat(40),platform:process.platform,architecture:process.arch}});services.push(product);productSession=await product.start();
 await product.providerDefinitionStore().save([{id:"openai-work",adapterId:"openai-api",label:"Fixture",endpoint:"https://unused.invalid/v1",accessContract:"secret@1",credentialReference:"fixture",lifecycleState:"active",removedAt:null}]);
 await product.seedProviderCatalog({providerId:"openai-work",label:"Fixture",connected:true,models:[{id:"fixture-model",label:"Fixture",order:0,visible:true,available:true,providerDefault:true,metadata:{}}],systemFamily:{key:"fixture",name:"Fixture",modelIds:["fixture-model"]}});
 const family=await request("/api/model-families",{method:"POST",body:JSON.stringify({name:"Fixture",enabled:true,members:[{providerId:"openai-work",modelId:"fixture-model"}]})});
 const thread=await request("/api/threads",{method:"POST",body:JSON.stringify({title:"Marine ecology",initialMessage:"Explain coral, jellyfish, octopus, sea turtles, plankton and reef monitoring.",permissionProfileId:"full",harnessId:"fixture-task-system",modelSelection:{familyId:family.id,providerId:"openai-work",modelId:"fixture-model"}})});
 let turn;const stop=Date.now()+30_000;
 while(Date.now()<stop){turn=(await request(`/api/threads/${thread.id}`)).interactions[0];if(turn?.completionStatus==="accepted")break;if(turn?.completionStatus==="failed")throw Error(JSON.stringify(turn));await new Promise(done=>setTimeout(done,25));}
 invariant(turn?.completionStatus==="accepted","Marine fixture did not accept");
 const nodes=turn.completionOutput.rootLayer.nodes;invariant(nodes.length===6&&nodes.filter(node=>node.icon?.kind==="image").length===5,"Marine fixture must contain five image icons and monitoring symbol");
 const exportPath=join(output,"conversation.jsonl");await writeFile(exportPath,await product.exportConversation(thread.id));
 evalService=await new EvalService({stateFile:join(directory,"eval/test-runs.json"),productSession,configurationPaths:[],conversationImportEnabled:true}).open();
 ipcMain.handle("relayer-eval:review-context",(_event,id)=>evalService.reviewContext(id));
 const imported=await evalService.importConversation(exportPath);const execution=imported.executions[0];const importedThread=await request(`/api/threads/${execution.threadIds[0]}`);const importedTurn=importedThread.interactions.find(turn=>turn.completionStatus==="accepted");
 const importedNodes=importedTurn.completionOutput.rootLayer.nodes;
 invariant(JSON.stringify(importedNodes.map(node=>node.icon))===JSON.stringify(nodes.map(node=>node.icon)),"Marine export/import must preserve exact icon pins");
 const {window,session}=await openReview(execution,importedThread.thread.id,importedTurn);
 const themes=[];
 for(const theme of ["light","dark"]){
  await window.webContents.executeJavaScript(`import('./src/ui.js').then(({applyAppearance})=>applyAppearance(${JSON.stringify(theme)}))`);
  const selection=await session.state();
  const control=selection.controls.find(control=>control.kind==="node"&&control.name==="Open Coral");invariant(control,"Coral must be discoverable in production graph");
  if(String(selection.selectedNodeId)!==String(importedNodes.find(node=>node.title==="Coral").id)) await session.interact({elementRef:control.elementRef,activate:true});
  const rendered=await readyImages(window,5);
  await window.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const detailStop=Date.now()+10_000;let detail;
  while(Date.now()<detailStop){detail=await window.webContents.executeJavaScript(`(() => {const root=document.querySelector('.node-detail-runtime-host')?.shadowRoot;const image=root?.querySelector('img');const symbols=[...root?.querySelectorAll('img')??[]];return {imageLoaded:Boolean(image?.complete&&image.naturalWidth>0),staticSymbolLoaded:symbols.length===2&&symbols.every(item=>item.complete&&item.naturalWidth>0)};})()`);if(detail.imageLoaded&&detail.staticSymbolLoaded)break;await new Promise(done=>setTimeout(done,25));}
  invariant(detail.imageLoaded&&detail.staticSymbolLoaded,"Imported Coral photo and static symbol must load");
  const shot=await session.screenshot({target:{kind:"viewport"},mode:"visible",label:`Marine ecology graph ${theme}`});
  const fullPath=join(output,`graph-${theme}.png`);await writeFile(fullPath,(await window.webContents.capturePage()).toPNG());
  const monitorState=await session.state();
  const monitorControl=monitorState.controls.find(control=>control.kind==="node"&&control.name==="Open Reef monitoring");invariant(monitorControl,"Monitoring node must be discoverable");
  if(String(monitorState.selectedNodeId)!==String(importedNodes.find(node=>node.title==="Reef monitoring").id))await session.interact({elementRef:monitorControl.elementRef,activate:true});
  const monitorStop=Date.now()+10_000;let monitor;
  while(Date.now()<monitorStop){monitor=await window.webContents.executeJavaScript(`(() => {const action=document.querySelector('#detailActions .relayer-image-icon img');return {actionImageLoaded:Boolean(action?.complete&&action.naturalWidth>0),actionFit:action?getComputedStyle(action).objectFit:null,actionFraming:action?.parentElement?.dataset.iconFraming};})()`);if(monitor.actionImageLoaded)break;await new Promise(done=>setTimeout(done,25));}
  invariant(monitor.actionImageLoaded&&monitor.actionFit==="cover"&&monitor.actionFraming==="rounded","Monitoring action image must render from pinned bytes with explicit crop/framing");
  const monitorPath=join(output,`monitoring-${theme}.png`);await writeFile(monitorPath,(await window.webContents.capturePage()).toPNG());
  themes.push({theme,rendered,detail,monitor,monitorPath,screenshot:shot.screenshot,screenshotDirectory:session.artifactDirectoryFor(shot.screenshot.screenshotId),fullPath});
 }
 const sources=JSON.parse(await readFile(join(root,"docs/evidence/issue-624-discoverable-icons/assets/sources.json"),"utf8"));
 const unchanged=await sourceDigest()===digest;
 const binariesUnchanged=JSON.stringify(await nativeBinaryDigests())===JSON.stringify(nativeBinaries);
 invariant(binariesUnchanged,"Native binaries changed during marine evidence capture; this run cannot certify those binaries");
 invariant(unchanged,"Source workspace changed during marine evidence capture; this run cannot certify the final source");
 const manifest={schemaVersion:1,passed:false,scenariosPassed:true,cleanupPassed:false,evidenceKind:"deterministic-authored-fixture",modelSelectionProven:false,paidInferenceCalls:0,sourceDigestPolicy,sourceDigest:digest,sourceDigestUnchanged:unchanged,nativeBinaries,nativeBinariesUnchanged:binariesUnchanged,registeredSources:sources.records,acceptedIconPins:nodes.map(node=>({title:node.title,icon:node.icon})),exportImportPinsPreserved:true,themes,exportPath};
 await writeFile(join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
 console.log(JSON.stringify({scenariosPassed:true,output,modelSelectionProven:false,paidInferenceCalls:0}));
}
async function cleanup(){cleanupStarted=true;await runEvidenceCleanup([()=>ipcMain.removeHandler("relayer-eval:review-context"),...windows.splice(0).map(window=>()=>{if(!window.isDestroyed())window.destroy();}),...services.splice(0).reverse().map(service=>()=>service.close()),()=>rm(directory,{recursive:true,force:true})]);cleanupCompleted=true;}
Promise.race([app.whenReady().then(run),deadline]).then(async()=>{await cleanup();const path=join(output,"manifest.json");const manifest=JSON.parse(await readFile(path,"utf8"));invariant(manifest.scenariosPassed===true,"Marine scenarios must pass before cleanup certification");manifest.cleanupPassed=true;manifest.passed=true;await writeFile(path,JSON.stringify(manifest,null,2)+"\n");console.log(JSON.stringify({passed:true,cleanupPassed:true,output}));app.exit(0);}).catch(async error=>{console.error(error);await mkdir(output,{recursive:true});await writeFile(join(output,"failure.json"),JSON.stringify({passed:false,error:error.stack,cleanupStarted,cleanupPassed:cleanupCompleted,paidInferenceCalls:0,modelSelectionProven:false},null,2));await cleanup().catch(console.error);app.exit(1);});
