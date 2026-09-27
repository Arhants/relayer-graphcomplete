import { chromium } from "playwright";
import { createProductReview } from "../main/services/product-review.mjs";
import { ReviewSession } from "./review-session.mjs";

// Every judge gets a fresh context: no dashboard or human annotation authority.
export async function openBrowserReview({ productSession, context, executionId, threadId, turnId,
  rootLayerId, artifactDirectory, inputOperatorAvailable = false, browser }) {
  const review = await createProductReview({ productSession, context, threadId, turnId, inputOperatorAvailable });
  let isolated;
  try {
    isolated = await browser.newContext({ viewport: { width: 1480, height: 920 }, deviceScaleFactor: 1 });
    const page = await isolated.newPage();
    await page.goto(review.url);
    await page.waitForFunction(({ executionId, threadId, turnId }) => {
      const state = window.__evalPresentation?.snapshot();
      return state?.executionId === executionId && String(state.threadId) === String(threadId) && String(state.turnId) === String(turnId);
    }, { executionId, threadId, turnId }, { timeout: 30_000 });
    const transport = {
      url: () => page.url(),
      isClosed: () => page.isClosed(),
      command: (command, payload) => page.evaluate(async ({ command, payload }) => {
        const adapter = window.__evalPresentation;
        if (!adapter || !Object.hasOwn(adapter, command) || typeof adapter[command] !== "function") throw new Error("Unknown review command.");
        return adapter[command](payload);
      }, { command, payload }),
      capture: async (clip) => {
        const bytes = await page.screenshot({ type: "png", clip });
        return { bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      },
    };
    const session = new ReviewSession({ executionId, readOnly: true, transport, artifactDirectory,
      loadInputDraftRevision: async (id) => {
        const response = await review.read(`/api/state?threadId=${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error("Could not read the input draft revision.");
        return (await response.json()).inputDraftRevision;
      },
    });
    const state = await session.open();
    if (String(state.layerId) !== String(rootLayerId)) throw new Error("Review did not open the accepted root layer.");
    return { session, state, release: async () => { try { await isolated.close(); } finally { await review.close(); } } };
  } catch (error) { try { await isolated?.close(); } finally { await review.close(); } throw error; }
}

export function createJudgeBrowser() {
  let pending;
  return {
    get: () => pending ??= chromium.launch({ headless: true }).catch((error) => { pending = undefined; throw error; }),
    close: async () => { if (pending) await (await pending).close(); },
  };
}
