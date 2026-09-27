import { randomUUID } from "node:crypto";

// Only native-product evidence needs Electron. ReviewSession itself is transport-neutral.
export function createElectronReviewTransport({ webContents, ipc, timeoutMs = 5000 }) {
  return {
    url: () => webContents.getURL(),
    isClosed: () => webContents.isDestroyed?.(),
    capture: async (clip) => {
      const image = await webContents.capturePage(clip);
      return { bytes: image.toPNG(), ...image.getSize() };
    },
    command: (command, payload) => new Promise((resolve, reject) => {
      if (webContents.isDestroyed?.()) return reject(new Error("The production review window is closed."));
      const responseChannel = `relayer-eval:review-response:${randomUUID()}`;
      const cleanup = () => { clearTimeout(timer); ipc.removeListener(responseChannel, onResponse); };
      const onResponse = (event, response) => {
        if (event.sender !== webContents) return;
        cleanup();
        if (response?.error) reject(new Error(response.error)); else resolve(response?.result);
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Production review command timed out: ${command}`)); }, timeoutMs);
      ipc.on(responseChannel, onResponse);
      webContents.send("relayer-eval:review-command", { responseChannel, command, payload });
    }),
  };
}
