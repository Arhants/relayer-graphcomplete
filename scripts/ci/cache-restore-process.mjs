import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

export function restoreAttempt({ request, environment = process.env, worker = fileURLToPath(new URL("./cache-restore-worker.mjs", import.meta.url)), timeoutMs = 120_000, report = (data) => process.stdout.write(data) }) {
  return new Promise((resolve) => {
    const child = fork(worker, [], {
      env: { ...environment, RELAYER_CACHE_REQUEST: JSON.stringify(request) },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      detached: process.platform !== "win32",
    });
    let log = "";
    let result = null;
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => {
      try { report(data); } catch { /* telemetry is optional */ }
      log = (log + data.toString()).slice(-64 * 1024);
    });
    child.on("message", (message) => { result = typeof message.key === "string" ? message.key : null; });
    const timeout = setTimeout(() => {
      // Stop tar/download descendants too before falling back to a fresh build.
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* already exited */ }
    }, timeoutMs);
    child.on("error", () => { clearTimeout(timeout); resolve({ key: null, log }); });
    // close follows stream drain, so a final swallowed SDK warning is not lost.
    child.on("close", (code) => { clearTimeout(timeout); resolve({ key: code === 0 ? result : null, log }); });
  });
}
