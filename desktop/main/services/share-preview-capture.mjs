import { createIsolatedPageCapture } from "./isolated-page-capture.mjs";

const SIZE = { width: 1200, height: 630 };

/** Capture only the frozen redacted publication, never the live desktop window. */
export function createSharePreviewCapture({
  BrowserWindow,
  session,
  rendererDirectory,
}) {
  const isolatedCapture = createIsolatedPageCapture({
    BrowserWindow,
    session,
    rendererDirectory,
    partition: "share-preview-capture",
  });
  return function capture({ snapshotBytes, title, theme, signal }) {
    // Normalize the entire lifecycle, including cleanup failures from finally.
    return (async () => {
      if (!["light", "dark"].includes(theme))
        throw new TypeError("Invalid capture theme");
      const { png } = await isolatedCapture({
        template: "src/public-share-viewer/template.js",
        render: ({ renderPublicViewerTemplate }, assetBase) =>
          renderPublicViewerTemplate({ snapshot: snapshotBytes, title, theme, assetBase }),
        size: SIZE,
        maxBytes: 4 * 1024 * 1024,
        signal,
        prepare: async (window) => {
          await window.webContents.executeJavaScript(`(async()=>{
      const until=Date.now()+10000;
      while(!document.querySelector('#nodeLayer .graph-node')){if(Date.now()>until)throw new Error('Graph unavailable');await new Promise(r=>setTimeout(r,25));}
      await document.fonts.ready;
      const close=document.querySelector('#closeInspector');if(close&&close.getClientRects().length)close.click();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      document.querySelector('#fitGraph').click();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    })()`);
          return { clip: { x: 0, y: 0, ...SIZE }, output: SIZE };
        },
      });
      signal?.throwIfAborted();
      return png;
    })().catch((error) => {
      signal?.throwIfAborted();
      throw Object.assign(new Error("Share preview capture failed"), {
        code: "share_export_failed",
        failureStage: "export",
        cause: error,
      });
    });
  };
}
