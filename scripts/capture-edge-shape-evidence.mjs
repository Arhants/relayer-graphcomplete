// Captures every layer edge shape, plus a layer accepted before edge shapes,
// in light and dark through the production ProductWorkspace (the public share
// viewer). The snapshot is synthetic and offline: no provider, account or paid
// inference is involved.
import { app, BrowserWindow, session } from "electron";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";

import { renderPublicViewerTemplate } from "../desktop/renderer/src/public-share-viewer/template.js";
import { resolveEdgeShape } from "../desktop/renderer/src/product-workspace/edge-shapes.js";

const OPT_IN = "RELAYER_CAPTURE_EDGE_SHAPE_EVIDENCE";
const repositoryRoot = resolve(import.meta.dirname, "..");
const rendererRoot = resolve(repositoryRoot, "desktop/renderer");
const evidenceRoot = resolve(repositoryRoot, "docs/evidence/issue-616-edge-shapes");
const routePath = `/t/${"e".repeat(32)}`;
const viewport = { width: 1280, height: 800 };

if (process.env[OPT_IN] !== "1") throw new Error(`Evidence capture is opt-in. Set ${OPT_IN}=1.`);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// One layer per shape, laid out the way the agent guidance recommends for it.
// Placement order is the reading order.
const HUB = [["Hub", "box", .5, .5], ["North", "info", .2, .2], ["East", "search", .8, .2], ["South", "database", .8, .8], ["West", "list", .2, .8]];
const HUB_EDGES = [[0, 1], [0, 2], [0, 3], [0, 4]];
const ring = Array.from({ length: 5 }, (_, index) => {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 5;
  return [`Peer ${index + 1}`, "users", .5 + .36 * Math.cos(angle), .5 + .4 * Math.sin(angle)];
});
const PIPELINE = [["Collect", "file-text", .08, .7], ["Clean", "workflow", .36, .7], ["Train", "layers", .64, .7], ["Evaluate", "check-circle", .92, .7]];
const PIPELINE_LOOP = [[0, 1], [1, 2], [2, 3], [3, 0]];
const SCENES = [
  { shape: "default", nodes: HUB, edges: HUB_EDGES },
  { shape: "arc-outward", nodes: HUB, edges: HUB_EDGES },
  { shape: "arc-circle", nodes: ring, edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
  {
    shape: "elbow-horizontal",
    nodes: [["Intake", "file-text", .08, .5], ["Parse", "workflow", .36, .25], ["Validate", "check-circle", .36, .75], ["Store", "database", .64, .5], ["Report", "layers", .92, .5]],
    edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]],
  },
  {
    shape: "elbow-vertical",
    nodes: [["Goal", "layers", .5, .08], ["Plan", "list", .18, .5], ["Build", "workflow", .5, .5], ["Ship", "check-circle", .82, .5], ["Verify", "search", .82, .92]],
    edges: [[0, 1], [0, 2], [0, 3], [3, 4]],
  },
  {
    shape: "straight",
    nodes: [["Option A", "box", .25, .25], ["Option B", "box", .75, .25], ["Cost A", "database", .25, .75], ["Cost B", "database", .75, .75]],
    edges: [[0, 1], [2, 3], [0, 2], [1, 3]],
  },
  { shape: null, label: "legacy", nodes: HUB, edges: HUB_EDGES },
  // Per-edge routes: `edge` is an index into edges; ends are [node index, side?].
  {
    shape: "elbow-horizontal", label: "loop-routed", nodes: PIPELINE, edges: PIPELINE_LOOP,
    routes: [{ edge: 3, ends: [[3, "top"], [0, "top"]], waypoints: [[.92, .15], [.08, .15]] }],
  },
  {
    shape: "straight", label: "loop-sides", nodes: PIPELINE, edges: PIPELINE_LOOP,
    routes: [{ edge: 3, shape: "arc-outward", ends: [[3, "top"], [0, "top"]] }],
  },
  {
    shape: "arc-circle", label: "chord-routed", nodes: ring, edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 2]],
    routes: [{ edge: 5, ends: [[0], [2]], waypoints: [[.56, .42]] }],
  },
];

function sceneTurn(scene, index) {
  const label = scene.label ?? scene.shape;
  const turnId = `turn:${label}`;
  const layerId = `layer:${label}`;
  const nodes = scene.nodes.map(([title, icon], nodeIndex) => ({
    id: `node:${label}-${nodeIndex}`, kind: "concept", icon, title, detail: `${title} in the ${label} scene.`, state: "accepted",
  }));
  const edges = scene.edges.map(([left, right]) => ({ id: `edge:${label}-${left}-${right}`, endpoints: [nodes[left].id, nodes[right].id], state: "accepted" }));
  const layout = { version: 1, placements: scene.nodes.map(([, , x, y], nodeIndex) => ({ nodeId: nodes[nodeIndex].id, x, y })) };
  if (scene.shape) layout.edgeShape = scene.shape;
  if (scene.routes) {
    layout.edgeRoutes = scene.routes.map((route) => ({
      edgeId: edges[route.edge].id,
      ...(route.shape ? { shape: route.shape } : {}),
      ends: route.ends.map(([node, side]) => ({ nodeId: nodes[node].id, ...(side ? { side } : {}) })),
      ...(route.waypoints ? { waypoints: route.waypoints.map(([x, y]) => ({ x, y })) } : {}),
    }));
  }
  const interactionNodeId = `node:interaction-${label}`;
  return {
    recordType: "turn",
    id: turnId,
    sequence: index + 1,
    createdAt: `2026-09-30T00:0${index}:00Z`,
    text: scene.shape ? `Edge shape: ${scene.shape}` : "A layer accepted before edge shapes",
    interactionNodeId,
    origin: { kind: "user" },
    completion: { status: "accepted", permissionProfileId: "auto", harnessConfigurationName: "synthetic-evidence", modelSelection: { providerId: "fixture", modelId: "fixture-model", modelFamilyId: 1 } },
    contexts: [],
    submittedInputs: [],
    acceptedView: {
      interactionNodeId,
      rootAction: { id: `action:response-${label}`, sourceNodeId: interactionNodeId, kind: "navigate", relation: "expand", label: "Response", variant: "pill", targetLayerId: layerId, state: "accepted" },
      rootLayerId: layerId,
      // Membership is reversed so the rendered order can only come from the placements.
      layers: [{ layer: { id: layerId, nodes: nodes.map((node) => node.id).reverse(), edges: edges.map((edge) => edge.id), layout, state: "accepted" }, nodes: [...nodes].reverse(), edges, actions: [] }],
    },
  };
}

function syntheticSnapshot() {
  const turns = SCENES.map(sceneTurn);
  const header = {
    recordType: "header",
    exportVersion: 1,
    exportedAt: "2026-09-30T00:00:00Z",
    producer: { desktopVersion: "synthetic-evidence", buildCommit: "synthetic-evidence", platform: "darwin", architecture: "arm64" },
    conversation: { id: "conversation:edge-shapes", title: "Edge shape evidence", createdAt: "2026-09-30T00:00:00Z", projectName: "Edge shapes", harnessConfigurationName: "synthetic-evidence", permissionProfileId: "auto" },
    turns: turns.map(({ id, sequence }) => ({ id, sequence })),
  };
  return `${[header, ...turns].map((record) => JSON.stringify(record)).join("\n")}\n`;
}

async function startFixtureServer(pages) {
  const servedFiles = new Set();
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
      const page = pages.get(pathname);
      if (page) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(page);
        return;
      }
      const decoded = decodeURIComponent(pathname);
      const file = resolve(rendererRoot, `.${decoded}`);
      if (decoded.includes("\0") || decoded.includes("..") || !file.startsWith(`${rendererRoot}${sep}`)) {
        response.writeHead(400);
        response.end("bad path");
        return;
      }
      const body = await readFile(file);
      servedFiles.add(relative(repositoryRoot, file));
      const type = pathname.endsWith(".css") ? "text/css" : pathname.endsWith(".js") ? "text/javascript" : pathname.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
      response.writeHead(200, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  return { server, origin: `http://127.0.0.1:${server.address().port}`, servedFiles };
}

async function waitFor(window, label, expression, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  const diagnostic = await window.webContents.executeJavaScript(`({
    nodes: [...document.querySelectorAll('[data-node]')].map((node) => node.dataset.node),
    edges: document.querySelectorAll('#edgeCanvas .graph-edge').length,
    text: document.body.innerText.slice(0, 300),
  })`).catch((error) => String(error));
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(diagnostic)}`);
}

async function capture(window, file) {
  window.showInactive();
  await window.webContents.executeJavaScript("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
  const image = await window.webContents.capturePage();
  const size = image.getSize();
  const bytes = (size.width === viewport.width ? image : image.resize(viewport)).toPNG();
  await writeFile(file, bytes);
  return { sha256: sha256(bytes), sourcePixelSize: size };
}

// Everything checked here is visible in the capture; a failure stops the run.
function checkScene(scene, observed, theme) {
  const expected = resolveEdgeShape(scene.shape ?? undefined);
  const label = scene.label ?? scene.shape;
  const order = scene.nodes.map((_, index) => `node:${label}-${index}`);
  // Commands each shape may draw (C for an arc through waypoints), and the bend it shows;
  // aligned nodes join straight.
  const drawing = { "arc-outward": ["MALC", /[AC]/], "arc-circle": ["MALC", /[AC]/], "elbow-horizontal": ["MLQ", /Q/], "elbow-vertical": ["MLQ", /Q/], straight: ["ML", null] };
  const commands = (path) => path.replace(/[^A-Za-z]/g, "");
  const failures = [];
  if (observed.theme !== theme) failures.push(`theme ${observed.theme}`);
  if (observed.shape !== expected) failures.push(`shape ${observed.shape}`);
  if (JSON.stringify(observed.nodeOrder) !== JSON.stringify(order)) failures.push(`node order ${observed.nodeOrder}`);
  if (observed.edges.length !== scene.edges.length) failures.push(`${observed.edges.length} edges`);
  const routes = new Map((scene.routes ?? []).map((route) => [route.edge, route]));
  observed.edges.forEach((edge, index) => {
    const edgeShape = resolveEdgeShape(routes.get(index)?.shape ?? scene.shape ?? undefined);
    if (edge.shape !== edgeShape) failures.push(`edge ${index} shape ${edge.shape}`);
    if (edge.routed !== routes.has(index)) failures.push(`edge ${index} routed ${edge.routed}`);
    if (edge.d.lastIndexOf("M") !== 0 || [...commands(edge.d)].some((letter) => !drawing[edgeShape][0].includes(letter))) failures.push(`edge ${index} path ${edge.d}`);
  });
  const bends = observed.edges.filter((edge) => drawing[edge.shape][1]?.test(edge.d));
  if (drawing[expected][1] && !bends.length) failures.push("no bend");
  for (const index of routes.keys()) {
    const edge = observed.edges[index];
    if (drawing[edge.shape][1] && !drawing[edge.shape][1].test(edge.d)) failures.push(`routed edge ${index} does not bend`);
  }
  if (observed.markers) failures.push(`${observed.markers} direction markers`);
  if (failures.length) throw new Error(`${theme} ${label}: ${failures.join("; ")}`);
  return { drawnShape: expected, routedEdges: routes.size, readingOrder: "placements", edges: observed.edges.length, directionMarkers: 0 };
}

async function main() {
  const snapshot = syntheticSnapshot();
  await mkdir(evidenceRoot, { recursive: true });
  const snapshotFile = join(evidenceRoot, "synthetic-snapshot.jsonl");
  await writeFile(snapshotFile, snapshot);
  const pages = new Map(["light", "dark"].map((theme) => [`${routePath}-${theme}`, renderPublicViewerTemplate({ snapshot, title: "Edge shape evidence", theme })]));
  const fixture = await startFixtureServer(pages);
  const captures = [];
  const blocked = [];
  const windows = [];
  try {
    for (const theme of ["light", "dark"]) {
      const partition = `relayer-edge-shape-evidence-${theme}`;
      session.fromPartition(partition).webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
        if (details.url.startsWith(fixture.origin)) return callback({});
        blocked.push(details.url);
        return callback({ cancel: true });
      });
      const window = new BrowserWindow({ ...viewport, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition } });
      windows.push(window);
      await window.loadURL(`${fixture.origin}${routePath}-${theme}`);
      // A window that was never shown gets no animation frames, and the graph draws in one.
      window.showInactive();
      await waitFor(window, "production ProductWorkspace", "Boolean(document.querySelector('.workspace-layout') && document.querySelector('.graph-node'))");
      for (const scene of SCENES) {
        const label = scene.label ?? scene.shape;
        await window.webContents.executeJavaScript(`(() => {
          const current = document.querySelector('.interaction-graph-node[aria-current="true"]')?.dataset.turnId;
          if (current !== ${JSON.stringify(`turn:${label}`)}) {
            document.querySelector('#turnPickerButton').click();
            document.querySelector('.interaction-graph-node[data-turn-id=${JSON.stringify(`turn:${label}`)}]').click();
          }
          return true;
        })()`);
        await waitFor(window, `${theme} ${label}`, `document.querySelector('[data-node]')?.dataset.node === ${JSON.stringify(`node:${label}-0`)} && document.querySelector('#turnPopover')?.classList.contains('hidden') && document.querySelectorAll('#edgeCanvas .graph-edge').length === ${scene.edges.length}`);
        const observed = await window.webContents.executeJavaScript(`(() => {
          const canvas = document.querySelector('#edgeCanvas');
          return {
            theme: document.documentElement.dataset.theme,
            shape: canvas.getAttribute('data-edge-shape'),
            nodeOrder: [...document.querySelectorAll('[data-node]')].map((node) => node.dataset.node),
            edges: [...canvas.querySelectorAll('.graph-edge-group')].map((group) => ({
              d: group.querySelector('.graph-edge').getAttribute('d'),
              shape: group.getAttribute('data-edge-shape'),
              routed: group.hasAttribute('data-edge-routed'),
            })),
            markers: canvas.querySelectorAll('marker, [marker-start], [marker-mid], [marker-end]').length,
          };
        })()`);
        const assertions = checkScene(scene, observed, theme);
        const file = join(evidenceRoot, `${label}-${theme}.png`);
        captures.push({ scene: label, authoredShape: scene.shape ?? null, theme, file: relative(repositoryRoot, file), viewport, assertions, ...(await capture(window, file)) });
      }
    }
    if (blocked.length) throw new Error(`Unexpected non-local requests: ${blocked.join(", ")}`);
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" });
    const sourceFiles = {};
    for (const file of [...fixture.servedFiles, "scripts/capture-edge-shape-evidence.mjs"].sort()) {
      sourceFiles[file] = sha256(await readFile(resolve(repositoryRoot, file)));
    }
    const manifest = {
      schemaVersion: 1,
      evidence: "issue-616-edge-shapes",
      fixture: { kind: "synthetic", file: relative(repositoryRoot, snapshotFile), sha256: sha256(snapshot) },
      source: {
        commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
        dirty: status.split("\n").some((line) => line.trim() && !line.includes("docs/evidence/issue-616-edge-shapes")),
        sourceFiles,
      },
      browser: { electron: process.versions.electron, networkRequests: blocked, paidInferenceCalls: 0 },
      captures,
    };
    await writeFile(join(evidenceRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`Wrote ${captures.length} edge shape captures to ${relative(repositoryRoot, evidenceRoot)}.\n`);
  } finally {
    for (const window of windows) window.close();
    await new Promise((resolveServer) => fixture.server.close(resolveServer));
  }
}

app.whenReady().then(main).then(() => app.quit()).catch((error) => {
  console.error(error);
  app.exit(1);
});
