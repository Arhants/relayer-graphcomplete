import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { startIsolatedPageServer } from "../main/services/isolated-page-capture.mjs";
import {
  DRAFT_PREVIEW_MAX_BYTES,
  DRAFT_PREVIEW_START_VIEWPORT,
  DRAFT_PREVIEW_TEMPLATE,
  draftPreviewFrame,
  draftPreviewStepScript,
  frameDraftPreview,
} from "../main/services/draft-preview-renderer.mjs";

/**
 * Eval render bridge (PRD §11.10): the same isolated draft page in headless
 * Chromium. Eval renders dark, matching its review renderer's default.
 */
export function createPlaywrightDraftPreviewRenderer({ rendererDirectory, theme = "dark", launch = () => chromium.launch({ headless: true }) }) {
  let browser;
  let previous = Promise.resolve();
  const render = async ({ snapshot }) => {
      const frame = draftPreviewFrame(snapshot);
      browser ??= launch();
      const running = await browser;
      const root = await realpath(rendererDirectory);
      const { renderDraftPreviewTemplate } = await import(pathToFileURL(resolve(root, DRAFT_PREVIEW_TEMPLATE)).href);
      const prefix = `/${randomUUID()}/`;
      const server = await startIsolatedPageServer({
        root, prefix, html: renderDraftPreviewTemplate({ snapshot, theme, assetBase: prefix.slice(0, -1) }),
      });
      const context = await running.newContext({
        viewport: DRAFT_PREVIEW_START_VIEWPORT, deviceScaleFactor: 1, colorScheme: theme,
        serviceWorkers: "block", acceptDownloads: false,
      });
      try {
        await context.route("**/*", (route) => (
          route.request().url().startsWith(server.origin + prefix) ? route.continue() : route.abort()
        ));
        const page = await context.newPage();
        await page.goto(server.url);
        const clip = await frameDraftPreview({
          snapshot,
          call: (step) => page.evaluate(draftPreviewStepScript(step)),
          resize: (viewport) => page.setViewportSize(viewport),
        });
        const png = await page.screenshot({ type: "png", clip });
        if (png.byteLength > DRAFT_PREVIEW_MAX_BYTES) throw new Error("Preview too large");
        return { png: new Uint8Array(png), ...frame };
      } finally {
        await context.close();
        server.closeAllConnections();
        await server.close();
      }
  };
  return {
    // One render at a time, each bounded like the desktop capture.
    render(request) {
      const pending = previous.then(() => {
        let deadline;
        return Promise.race([
          render(request),
          new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Preview capture timed out")), 15_000); }),
        ]).finally(() => clearTimeout(deadline));
      });
      previous = pending.catch(() => {});
      return pending;
    },
    async close() {
      const running = await browser?.catch(() => undefined);
      browser = undefined;
      await running?.close();
    },
  };
}
