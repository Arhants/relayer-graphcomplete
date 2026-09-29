import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { publicViewerCsp, renderPublicViewerTemplate } from "../../desktop/renderer/src/public-share-viewer/template.js";

export const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const sharePath = `/t/${"a".repeat(32)}`;
export const embedPath = `${sharePath}/embed`;

// Fixed synthetic accepted history only; never opens a user database or publishes.
export async function embedFixtureSnapshot() {
  const text = await readFile(resolve(repositoryRoot, "docs/evidence/issue-471-public-share-viewer/synthetic-snapshot.jsonl"), "utf8");
  const records = text.trim().split("\n").map(JSON.parse);
  const first = records[1];
  const root = first.acceptedView.layers[0];
  root.nodes[0].title = "A result you can inspect";
  root.nodes[0].detail = "## Follow the evidence\nThis is a synthetic accepted result rendered by the same workspace as Relayer.\n\nExpand the explanation, inspect its reference, or open an already completed follow-up. These controls browse frozen history; they cannot run an agent.";
  for (const [name, title, x, y] of [["reason", "Reasoning", .2, .75], ["evidence", "Supporting evidence", .8, .75]]) {
    const id = `node:${name}`;
    root.nodes.push({ id, kind: "concept", icon: "file-text", title, detail: name === "reason" ? "## Reasoning\n" + "A long accepted explanation remains readable within its own panel.\n\n".repeat(50) + "Final detail paragraph." : "Synthetic fixture content for local embed review.", state: "accepted" });
    root.layer.nodes.push(id);
    root.layer.layout.placements.push({ nodeId: id, x, y });
    const edge = { id: `edge:${name}`, endpoints: [root.nodes[0].id, id], state: "accepted" };
    root.edges.push(edge);
    root.layer.edges.push(edge.id);
  }
  root.layer.layout.placements[0].y = .25;
  root.actions.push({ id: "action:completed", sourceNodeId: root.nodes[0].id, sourceLayerId: root.layer.id,
    kind: "invoke", label: "Open completed follow-up", interactionText: "Inspect the result", variant: "pill", state: "accepted" },
  { id: "action:unexecuted", sourceNodeId: root.nodes[0].id, sourceLayerId: root.layer.id,
    kind: "invoke", label: "Unexecuted action", interactionText: "Do new work", variant: "pill", state: "accepted" },
  { id: "action:input", sourceNodeId: root.nodes[0].id, sourceLayerId: root.layer.id,
    kind: "input", label: "Choose a path", variant: "pill", state: "accepted",
    input: { control: "single_select", prompt: "Which path?", options: [{ key: "a", label: "Path A" }, { key: "b", label: "Path B" }] } });
  const second = records[2];
  second.origin = { kind: "action", sourceTurnId: first.id, sourceActionId: "action:completed" };
  // Include the earlier accepted layer in the second turn's frozen reference closure.
  const reference = structuredClone(first.acceptedView.layers[1]);
  second.acceptedView.layers.push(reference);
  second.acceptedView.layers[0].actions.push({ id: "action:prior-reference", sourceNodeId: second.acceptedView.layers[0].nodes[0].id,
    sourceLayerId: second.acceptedView.rootLayerId, targetLayerId: reference.layer.id,
    kind: "navigate", relation: "reference", label: "Read earlier evidence", variant: "pill", state: "accepted" });
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

const article = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relayer · Embedded graph review</title>
<style>html{color-scheme:light dark}body{margin:0;background:#f3f1ec;color:#202523;font:16px/1.6 system-ui,sans-serif}main{max-width:1320px;margin:0 auto;padding:42px 36px 70px}.eyebrow{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#536c61}h1{font-size:38px;line-height:1.15;letter-spacing:-.035em;margin:12px 0}p{max-width:750px;color:#59635c}iframe{display:block;box-sizing:border-box;width:100%;height:650px;border:1px solid #c7cec7;border-radius:14px;margin:28px 0 14px;background:#101214}.caption{font-size:13px}a{color:inherit}@media(prefers-color-scheme:dark){body{background:#121716;color:#e9eee8}p,.eyebrow{color:#a3b4a8}iframe{border-color:#33423a}}</style></head>
<body><main><div class="eyebrow">Relayer / Local design review</div><h1>Explore the work behind an answer.</h1><p>Select a node to read its details. Follow an explanation into a deeper layer, inspect earlier evidence, or browse a completed follow-up.</p>
<iframe loading="lazy" src="${embedPath}" title="Interactive synthetic graph and Node Details"></iframe>
<a id="after-first-graph" href="#">Back to article</a><p class="caption">Synthetic frozen history · Production Relayer viewer · No agent execution</p><p>Use the graph controls or Ctrl-scroll to zoom. Ordinary scrolling continues this article. On smaller screens, Back to graph closes the full-width details.</p><section style="margin-top:6000px"><h2>Compare another result</h2><p>This independent example uses a fixed light theme.</p><iframe loading="lazy" src="${embedPath}?theme=light" title="Second independent graph, light theme"></iframe><a href="#">Return to article start</a></section></main></body></html>`;

export async function startEmbedFixtureServer({ crossOrigin = false, editorialSnapshots = [], parentOrigin = null } = {}) {
  if (parentOrigin && !/^http:\/\/(?:127\.0\.0\.1|localhost):[0-9]{1,5}$/u.test(parentOrigin)) throw new TypeError("Only a loopback review parent is allowed.");
  const snapshot = await embedFixtureSnapshot();
  const rendererRoot = resolve(repositoryRoot, "desktop/renderer");
  const servedFiles = new Set();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const pathname = url.pathname;
      response.setHeader("Cache-Control", "no-store");
      if (pathname === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(crossOrigin ? article.replaceAll('src="/t/', `src="http://localhost:${server.address().port}/t/`) : article);
        return;
      }
      const editorial = editorialSnapshots.find(item => pathname === `/t/${item.shareId}` || pathname === `/t/${item.shareId}/embed`);
      if (pathname === sharePath || pathname === embedPath || editorial) {
        const embedded = pathname.endsWith("/embed");
        // Loopback fixture exception only. Production template/contract policy stays unchanged.
        const csp = embedded ? publicViewerCsp().replace("frame-ancestors 'none'", `frame-ancestors 'self' http://127.0.0.1:${server.address().port}${parentOrigin ? ` ${parentOrigin}` : ""}`) : publicViewerCsp();
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp });
        response.end(renderPublicViewerTemplate({ snapshot: editorial?.snapshot ?? snapshot, title: editorial?.title ?? "Inspect an accepted result", presentation: embedded ? "embed" : "standalone", sharePath: editorial ? `/t/${editorial.shareId}` : sharePath, theme: url.searchParams.get("theme") || "system" }));
        return;
      }
      const decoded = decodeURIComponent(pathname);
      const file = resolve(rendererRoot, `.${decoded}`);
      if (decoded.includes("\0") || !file.startsWith(`${rendererRoot}${sep}`)) throw new Error("Invalid asset path");
      const body = await readFile(file);
      servedFiles.add(relative(repositoryRoot, file));
      const mime = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
      response.writeHead(200, { "Content-Type": mime });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, origin: `http://127.0.0.1:${server.address().port}`, snapshot, servedFiles };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { origin } = await startEmbedFixtureServer();
  process.stdout.write(`Local embed review: ${origin}/\n`);
}
