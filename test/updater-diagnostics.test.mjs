import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
import { afterEach, expect, it, vi } from "vitest";
import { createDesktopUpdater } from "../desktop/main/services/updater.mjs";
import { createUpdaterDiagnosticsLog, updaterFailure } from "../desktop/main/services/updater-diagnostics.mjs";
import { recoverAfterUpdateInstallFailure } from "../desktop/main/services/update-restart.mjs";

afterEach(() => vi.unstubAllGlobals());

it("shows a safe check failure in Settings and the update prompt, then clears it on retry", async () => {
  vi.resetModules();
  const window = new Window({ url: "file:///relayer/index.html" });
  window.document.write(await readFile(new URL("../desktop/renderer/index.html", import.meta.url), "utf8"));
  for (const key of ["window", "document", "location", "localStorage"]) vi.stubGlobal(key, key === "window" ? window : window[key]);
  const { renderUpdate } = await import("../desktop/renderer/src/updates.js");
  const autoUpdater = Object.assign(new EventEmitter(), {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(async () => { throw Object.assign(new Error("private https://user:password@host/?token=secret"), { code: "ENOTFOUND" }); }),
    downloadUpdate: vi.fn(async () => { throw Object.assign(new Error("private download response"), { statusCode: 403 }); }),
    quitAndInstall: vi.fn(() => { throw new Error("net::ERR_CONNECTION_RESET https://user:password@host"); }),
  });
  const updater = createDesktopUpdater({ autoUpdater, app: { isPackaged: true, getVersion: () => "0.2.35" }, emit: renderUpdate });
  await updater.check();
  for (const id of ["updateStatus", "updateDetail"]) {
    const text = window.document.getElementById(id).textContent;
    expect(text).toContain("ENOTFOUND");
    expect(text).not.toContain("password");
  }
  autoUpdater.checkForUpdates.mockImplementationOnce(async () => { autoUpdater.emit("checking-for-update"); autoUpdater.emit("update-not-available"); });
  await updater.check();
  expect(window.document.getElementById("updateStatus").textContent).toBe("Up to date");
  expect(window.document.getElementById("updateDetail").textContent).not.toContain("ENOTFOUND");
  autoUpdater.emit("update-available", { version: "0.2.36" });
  await expect(updater.download()).rejects.toThrow("HTTP 403");
  expect(window.document.getElementById("updateStatus").textContent).toContain("Couldn’t download the update");
  expect(window.document.getElementById("updateDetail").textContent).toContain("HTTP 403");
  autoUpdater.emit("update-downloaded", { version: "0.2.36" });
  expect(() => updater.install()).toThrow("ERR_CONNECTION_RESET");
  expect(window.document.getElementById("updateDetail").textContent).toContain("Couldn’t install the update");
  window.happyDOM.abort();
});

it("retains bounded, private updater history across reopen and deduplicates event plus rejection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relayer-updater-"));
  try {
    const path = join(directory, "logs", "updater.jsonl");
    const diagnostics = createUpdaterDiagnosticsLog({ path, maximumBytes: 2048 });
    const failure = Object.assign(new Error("https://user:password@host/?token=secret\nAuthorization: Bearer secret\nprivate response body /Users/private"), { code: "ENOTFOUND" });
    const autoUpdater = Object.assign(new EventEmitter(), {
      setFeedURL() {},
      async checkForUpdates() { autoUpdater.emit("error", failure); throw failure; },
      async downloadUpdate() { throw Object.assign(new Error("secret download"), { code: "ERR_UPDATER_CHECKSUM_MISMATCH" }); },
      quitAndInstall() { throw Object.assign(new Error("secret install"), { statusCode: 503 }); },
    });
    const updater = createDesktopUpdater({ autoUpdater, diagnostics, app: { isPackaged: true, getVersion: () => "0.2.35" }, emit() {} });
    updater.setChannel("preview");
    await updater.check();
    await diagnostics.flush();
    let records = (await readFile(path, "utf8")).trim().split("\n").map(JSON.parse);
    expect(records.filter((entry) => entry.code === "ENOTFOUND")).toHaveLength(1);
    expect(records.at(-1)).toMatchObject({ phase: "failed", stage: "check", channel: "preview", version: "0.2.35", code: "ENOTFOUND" });
    autoUpdater.emit("update-available", { version: "0.2.36" });
    await expect(updater.download()).rejects.toThrow("integrity verification");
    expect(updater.status()).toMatchObject({ errorStage: "download", errorCode: "ERR_UPDATER_CHECKSUM_MISMATCH" });
    autoUpdater.emit("update-downloaded", { version: "0.2.36" });
    expect(updater.status().error).toBeNull();
    expect(() => updater.install()).toThrow("HTTP 503");
    const order = [];
    await recoverAfterUpdateInstallFailure({ diagnostics, relaunch: () => order.push("relaunch"), exit: (code) => order.push(code) });
    expect(order).toEqual(["relaunch", 1]);
    records = (await readFile(path, "utf8")).trim().split("\n").map(JSON.parse);
    expect(records.at(-1)).toMatchObject({ stage: "install", code: "UNKNOWN", status: 503, availableVersion: "0.2.36" });
    const reopened = createUpdaterDiagnosticsLog({ path, maximumBytes: 2048 });
    await reopened.write({ phase: "idle", version: "0.2.36", raw: failure.message }, "check");
    expect((await readFile(path, "utf8"))).toContain('"stage":"install"');
    for (let index = 0; index < 25; index++) await reopened.write({ phase: "failed", version: "0.2.36", ...updaterFailure(failure), extra: failure.message }, "check");
    const bytes = await readFile(path, "utf8");
    expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(2048);
    expect(bytes).not.toMatch(/password|secret|https:|Authorization|Users|response body/);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(bytes.trim().split("\n").map(JSON.parse).at(-1).code).toBe("ENOTFOUND");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("attributes a late download error after manual discovery and an asynchronous install error", async () => {
  const autoUpdater = Object.assign(new EventEmitter(), {
    async checkForUpdates() { autoUpdater.emit("checking-for-update"); autoUpdater.emit("update-available", { version: "0.2.36" }); },
    async downloadUpdate() {},
    quitAndInstall() {},
  });
  const updater = createDesktopUpdater({ autoUpdater, app: { isPackaged: true, getVersion: () => "0.2.35" }, emit() {} });
  await updater.check();
  await updater.download();
  autoUpdater.emit("download-progress", { percent: 20 });
  await updater.check();
  autoUpdater.emit("error", Object.assign(new Error("private response"), { code: "ECONNRESET" }));
  expect(updater.status()).toMatchObject({ errorStage: "download", errorCode: "ECONNRESET" });
  autoUpdater.checkForUpdates = async () => autoUpdater.emit("error", Object.assign(new Error("private check"), { code: "ENOTFOUND" }));
  await updater.check();
  expect(updater.status()).toMatchObject({ errorStage: "check", errorCode: "ENOTFOUND" });
  autoUpdater.emit("update-downloaded", { version: "0.2.36" });
  updater.install();
  autoUpdater.emit("error", Object.assign(new Error("private native error"), { code: "ERR_UPDATER_INVALID_SIGNATURE" }));
  expect(updater.status()).toMatchObject({ errorStage: "install", errorCode: "ERR_UPDATER_INVALID_SIGNATURE" });
  await updater.check();
  expect(updater.status()).toMatchObject({ errorStage: "check", errorCode: "ENOTFOUND" });
});

it("storage failure cannot change updater results, and arbitrary codes and messages stay private", async () => {
  for (const write of [() => { throw new Error("disk full"); }, () => Promise.reject(new Error("disk full"))]) {
    const autoUpdater = Object.assign(new EventEmitter(), {
      async checkForUpdates() { autoUpdater.emit("checking-for-update"); autoUpdater.emit("update-not-available"); },
    });
    const updater = createDesktopUpdater({ autoUpdater, diagnostics: { write }, app: { isPackaged: true, getVersion: () => "0.2.35" }, emit() {} });
    await expect(updater.check()).resolves.toMatchObject({ phase: "idle", error: null });
  }
  expect(updaterFailure(Object.assign(new Error("Bearer secret"), { code: "private-user-data", status: 999 }))).toEqual({
    error: "The updater could not finish this operation. (UNKNOWN)", errorCode: "UNKNOWN", errorStage: "check", errorStatus: null,
  });
});
