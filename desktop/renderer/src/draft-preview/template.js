import { publicViewerCsp, safeJsonScriptText } from "../public-share-viewer/template.js";

/**
 * The isolated page that renders one agent draft for a draft preview
 * (PRD §11.10). It reuses the public viewer shell and CSP: the snapshot is
 * inlined, and the page has no network, IPC or credentials.
 */
export function renderDraftPreviewTemplate({ snapshot, theme, assetBase }) {
  if (theme !== "light" && theme !== "dark") throw new TypeError("Invalid draft preview theme.");
  if (!/^\/[A-Za-z0-9-]+$/u.test(assetBase)) throw new TypeError("Invalid draft preview asset base.");
  return `<!doctype html>
<html lang="en" data-viewer-theme="${theme}" data-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${publicViewerCsp()}">
  <title>Draft preview</title>
  <link rel="stylesheet" href="${assetBase}/styles.css">
  <link rel="stylesheet" href="${assetBase}/src/public-share-viewer/viewer.css">
</head>
<body class="public-share-shell">
  <main class="public-share-main">
    <section id="draftPreviewHost" class="public-share-workspace-host" aria-label="Draft preview">
      <section class="thread-view" id="threadView"></section>
    </section>
  </main>
  <script type="application/json" id="relayerDraftSnapshot">${safeJsonScriptText(JSON.stringify(snapshot))}</script>
  <script src="${assetBase}/vendor/lucide.min.js"></script>
  <script src="${assetBase}/vendor/marked.umd.js"></script>
  <script type="module" src="${assetBase}/src/draft-preview/main.js"></script>
</body>
</html>`;
}
