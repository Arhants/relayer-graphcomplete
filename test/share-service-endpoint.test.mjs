import { describe, expect, it } from "vitest";

import {
  PRODUCTION_SHARE_SERVICE_ENDPOINT,
  resolveShareServiceEndpoint,
} from "../desktop/main/services/share-service-endpoint.mjs";

describe("share-service endpoint authority", () => {
  it("rejects a packaged app with missing sealed metadata before environment overrides", () => {
    expect(() => resolveShareServiceEndpoint({
      isPackaged: true,
      packagedRelease: null,
      environment: { RELAYER_SHARE_SERVICE_ENDPOINT: "https://attacker.example" },
    })).toThrow(/metadata is invalid/);
  });
  it("pins stable releases to the production origin regardless of process environment", () => {
    expect(resolveShareServiceEndpoint({
      packagedRelease: { channel: "stable" },
      metadata: {},
      environment: { RELAYER_SHARE_SERVICE_ENDPOINT: "https://attacker.example" },
    })).toBe(PRODUCTION_SHARE_SERVICE_ENDPOINT);
  });

  it("keeps the production origin when identical Preview bytes are promoted to Stable", () => {
    expect(resolveShareServiceEndpoint({
      packagedRelease: { channel: "preview" },
      metadata: { relayerShareServiceEndpoint: "https://share-preview.relayerlabs.ai" },
      environment: { RELAYER_SHARE_SERVICE_ENDPOINT: "https://attacker.example" },
    })).toBe(PRODUCTION_SHARE_SERVICE_ENDPOINT);

    expect(resolveShareServiceEndpoint({
      packagedRelease: { channel: "preview" },
      metadata: {},
    })).toBe(PRODUCTION_SHARE_SERVICE_ENDPOINT);
  });

  it("allows an explicit loopback or HTTPS override only in development", () => {
    expect(resolveShareServiceEndpoint({
      isPackaged: false,
      packagedRelease: null,
      metadata: {},
      environment: { RELAYER_SHARE_SERVICE_ENDPOINT: "http://127.0.0.1:8787" },
    })).toBe("http://127.0.0.1:8787");
    expect(() => resolveShareServiceEndpoint({
      isPackaged: false,
      packagedRelease: null,
      metadata: {},
      environment: { RELAYER_SHARE_SERVICE_ENDPOINT: "http://preview.example" },
    })).toThrow(/HTTPS or loopback/i);
  });
});
