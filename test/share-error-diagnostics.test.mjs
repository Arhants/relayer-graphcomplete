import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareSnapshotExportError } from "../desktop/main/services/relayer-app-server.mjs";
import { captureShareErrorDiagnostics } from "../desktop/main/services/share-error-diagnostics.mjs";
import { createShareServiceClient } from "../desktop/main/services/share-service-client.mjs";
import { createSharePublishCoordinator } from "../desktop/main/services/share-publish-coordinator.mjs";
import { createAuthenticatedErrorGateway } from "../desktop/main/services/authenticated-error-gateway.mjs";
import { createSentryErrorTransport } from "../desktop/main/services/sentry-error-transport.mjs";

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });

async function journey(fetchImpl, { exportSnapshot, uploadFetchImpl } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "share-diagnostics-"));
  directories.push(directory);
  const events = [];
  const transport = createSentryErrorTransport({
    dsn: "https://public@example.test/1",
    createClient: (options) => ({
      captureEvent(event) {
        const accepted = options.beforeSend({ ...event, event_id: "a".repeat(32), timestamp: 1 });
        if (accepted) events.push(accepted);
      },
      flush: async () => true,
      close: async () => true,
    }),
  });
  const gateway = createAuthenticatedErrorGateway({
    queuePath: join(directory, "queue.json"),
    encrypt: async (text) => Buffer.from(text).toString("base64"),
    decrypt: async (text) => Buffer.from(text, "base64").toString(),
    transport, release: "ai.relayer.desktop@0.2.31+fixture", environment: "preview", os: "macos", architecture: "arm64",
  });
  await gateway.transitionIdentity({ generation: 1, subject: "auth0|synthetic" });
  const client = createShareServiceClient({ endpoint: "https://share.example.test", fetchImpl, uploadFetchImpl });
  const persisted = [];
  const snapshot = new TextEncoder().encode('{"recordType":"header","conversation":{}}\n');
  const coordinator = createSharePublishCoordinator({
    accountSession: async () => ({ generation: 1, ownerKey: "owner", authorization: "Bearer private-token" }),
    sourceThreadIdentity: async () => "thread:1", exportSnapshot: exportSnapshot ?? (async () => snapshot),
    publish: client.publish,
    issueHandledShareFailureReporter: (identity) => gateway.issueHandledShareFailureReporter(identity),
    attemptStore: { load: async () => [], save: async (record) => { persisted.push(structuredClone(record)); }, delete: async () => {} },
    createReferenceId: () => "SHR-DIAGNOST1",
  });
  return { coordinator, gateway, events, persisted };
}

describe("share failure diagnostics through the production reporting path", () => {
  it("retains the real service stack and HTTP status, deduplicates retries, and still publishes", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "private-response" }) })
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: "private-response" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ shareId: "synthetic", status: "published", url: "https://share.example.test/t/synthetic" }) });
    const state = await journey(fetchImpl);
    try {
      const failure = await state.coordinator.create({ threadId: 1, title: "Private title" });
      expect(failure).toMatchObject({ status: "failed", code: "share_service_failed" });
      expect(state.events).toHaveLength(1);
      expect(state.events[0].tags).toMatchObject({ http_status: "503", network_code: "none", failure_stage: "service" });
      const frames = state.events[0].exception.values[0].stacktrace.frames;
      expect(frames).toEqual(expect.arrayContaining([expect.objectContaining({ filename: "desktop/main/services/share-service-client.mjs" })]));
      expect(JSON.stringify(state.events)).not.toMatch(/private-response|private-token|Private title|https:\/\/share|\/Users\//);
      await state.coordinator.retry(failure.attemptReferenceId);
      expect(state.events).toHaveLength(1);
      expect(await state.coordinator.retry(failure.attemptReferenceId)).toMatchObject({ status: "created" });
      for (const record of state.persisted) {
        expect(record).not.toHaveProperty("frames");
        expect(record.lastFailure ?? {}).not.toHaveProperty("httpStatus");
      }
    } finally { await state.gateway.close(); }
  });

  it("extracts a closed network code from a wrapped fetch cause without leaking the cause", async () => {
    const cause = Object.assign(new Error("private-host:443"), { code: "ECONNRESET", address: "private-address" });
    const state = await journey(async () => { throw new TypeError("private-fetch-url", { cause }); });
    try {
      await state.coordinator.create({ threadId: 1, title: "Private title" });
      expect(state.events).toHaveLength(1);
      expect(state.events[0].tags).toMatchObject({ http_status: "none", network_code: "ECONNRESET" });
      expect(state.events[0].exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);
      expect(JSON.stringify(state.events)).not.toMatch(/private-host|private-address|private-fetch-url/);
    } finally { await state.gateway.close(); }
  });
});


describe("share diagnostic boundaries", () => {
  it("retains packaged app frames while excluding invented modules and inspecting bounded causes", () => {
    const cause = { code: "ECONNRESET" };
    cause.cause = cause;
    const error = {
      stack: [
        "Error: private message",
        " at f (/Applications/Relayer.app/Contents/Resources/app.asar/main/services/share-service-client.mjs:55:9)",
        " at fake (/repo/desktop/main/private-prompt.mjs:8:1)",
        " at native (/repo/node_modules/fetch/index.js:9:1)",
        " at caller (/repo/desktop/main/services/share-publish-coordinator.mjs:348:5)",
      ].join("\n"),
      cause,
      get status() { throw new Error("private getter"); },
    };
    expect(captureShareErrorDiagnostics(error)).toEqual({
      frames: [
        { module: "desktop/main/services/share-service-client.mjs", line: 55, column: 9 },
        { module: "desktop/main/services/share-publish-coordinator.mjs", line: 348, column: 5 },
      ],
      httpStatus: null, networkCode: "ECONNRESET",
    });
    expect(captureShareErrorDiagnostics({
      get stack() { throw new Error("private stack"); },
      get cause() { throw new Error("private cause"); },
      code: "private-code",
    })).toEqual({ frames: [], httpStatus: null, networkCode: null });
    let deep = { code: "ECONNRESET" };
    for (let i = 0; i < 4; i += 1) deep = { cause: deep };
    expect(captureShareErrorDiagnostics(deep).networkCode).toBeNull();
    expect(captureShareErrorDiagnostics(new DOMException("private timeout", "TimeoutError")).networkCode).toBe("TIMEOUT");
    const many = { stack: Array.from({ length: 40 }, (_, i) => ` at f (/repo/desktop/main/index.mjs:${i + 1}:1)`).join("\n") };
    expect(captureShareErrorDiagnostics(many).frames).toHaveLength(32);
  });

  it("captures S3 upload failures with their HTTP status and app stack", async () => {
    const state = await journey(async () => ({ ok: true, status: 200, json: async () => ({
      status: "reserved", shareId: "synthetic", upload: { method: "POST", url: "https://upload.example.test", key: "staged", fields: { key: "staged" } },
    }) }), { uploadFetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: "private-storage-response" }) }) });
    try {
      expect(await state.coordinator.create({ threadId: 1, title: "Public" })).toMatchObject({ status: "failed" });
      expect(state.events).toHaveLength(1);
      expect(state.events[0].tags).toMatchObject({ failure_code: "share.upload_failed", failure_stage: "upload", http_status: "403" });
      expect(state.events[0].exception.values[0].stacktrace.frames.at(-1).filename).toBe("desktop/main/services/share-service-client.mjs");
      expect(JSON.stringify(state.events)).not.toContain("private-storage-response");
    } finally { await state.gateway.close(); }
  });

  it("captures export diagnostics without invoking the service or persisting raw errors", async () => {
    const fetchImpl = vi.fn();
    const state = await journey(fetchImpl, { exportSnapshot: async () => {
      throw Object.assign(new ShareSnapshotExportError("share_export_failed"), {
        stack: "Error: private export content\n at exportSnapshot (/repo/desktop/main/services/relayer-app-server.mjs:55:3)",
      });
    } });
    try {
      expect(await state.coordinator.create({ threadId: 1, title: "Public" })).toMatchObject({ code: "share_export_failed" });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(state.events[0].tags).toMatchObject({ failure_stage: "export", failure_code: "share.export_failed" });
      expect(state.events[0].exception.values[0].stacktrace.frames).toEqual([
        { filename: "desktop/main/services/relayer-app-server.mjs", lineno: 55, colno: 3, in_app: true },
      ]);
      expect(JSON.stringify(state.persisted)).not.toMatch(/private export content|relayer-app-server.mjs/);
    } finally { await state.gateway.close(); }
  });

  it.each(["cancel", "sign-in", "quota"])("keeps expected %s outcomes out of diagnostic reporting", async (outcome) => {
    const state = await journey(async () => {
      if (outcome === "cancel") throw new DOMException("private cancel", "AbortError");
      return { ok: false, status: outcome === "sign-in" ? 401 : 429,
        json: async () => ({ error: outcome === "quota" ? "daily_quota_exhausted" : "unauthorized" }) };
    });
    try {
      expect(await state.coordinator.create({ threadId: 1, title: "Public" })).toMatchObject({ status: "failed" });
      expect(state.events).toEqual([]);
    } finally { await state.gateway.close(); }
  });
});
