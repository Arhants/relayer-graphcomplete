import { createProviderDiagnosticsLog } from "../providers/provider-diagnostics-log.mjs";

// Updater exceptions may contain authenticated URLs, headers and response bodies.
// Only code-owned explanations and a closed set of diagnostic facts cross into
// renderer state or the local log. Handled updater failures are not telemetry.
const EXPLANATIONS = Object.freeze({
  ENOTFOUND: "The update server could not be found.",
  EAI_AGAIN: "The update server could not be found. Try again shortly.",
  ECONNREFUSED: "The update server refused the connection.",
  ECONNRESET: "The connection to the update server was interrupted.",
  ETIMEDOUT: "The update request timed out.",
  ERR_CONNECTION_TIMED_OUT: "The update request timed out.",
  ERR_NAME_NOT_RESOLVED: "The update server could not be found.",
  ERR_CONNECTION_RESET: "The connection to the update server was interrupted.",
  ERR_CONNECTION_REFUSED: "The update server refused the connection.",
  ERR_INTERNET_DISCONNECTED: "The network connection is offline.",
  ERR_NETWORK_CHANGED: "The network changed during the update request.",
  ERR_CERT_AUTHORITY_INVALID: "The update server certificate could not be verified.",
  CERT_HAS_EXPIRED: "The update server certificate has expired.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "The update server certificate could not be verified.",
  ERR_UPDATER_CHANNEL_FILE_NOT_FOUND: "The selected update channel is unavailable.",
  ERR_UPDATER_INVALID_RELEASE_FEED: "The update manifest could not be read.",
  ERR_UPDATER_INVALID_UPDATE_INFO: "The update manifest could not be read.",
  ERR_UPDATER_NO_CHECKSUM: "The update manifest is missing integrity information.",
  ERR_UPDATER_INVALID_VERSION: "The update manifest contains an invalid version.",
  ERR_UPDATER_NO_FILES_PROVIDED: "The update manifest contains no downloadable files.",
  ERR_UPDATER_ZIP_FILE_NOT_FOUND: "The macOS update archive is missing.",
  ERR_UPDATER_CHECKSUM_MISMATCH: "The downloaded update failed integrity verification.",
  ERR_CHECKSUM_MISMATCH: "The downloaded update failed integrity verification.",
  ERR_UPDATER_INVALID_SIGNATURE: "The update publisher signature could not be verified.",
});
const STAGES = new Set(["check", "download", "install", "update"]);
const PHASES = new Set(["idle", "development", "checking", "available", "downloading", "ready", "failed"]);
const safeVersion = (value) => typeof value === "string" && /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]{1,64})?$/.test(value) ? value : null;

export function updaterFailure(error, stage = "check") {
  // Electron networking often has no error.code, only a net::ERR_* message.
  const networkCode = typeof error?.message === "string" ? /^net::(ERR_[A-Z_]+)(?:\s|$)/.exec(error.message)?.[1] : null;
  const candidate = error?.code ?? networkCode;
  const code = Object.hasOwn(EXPLANATIONS, candidate) ? candidate : "UNKNOWN";
  const status = [error?.statusCode, error?.status].find((value) => Number.isInteger(value) && value >= 100 && value <= 599);
  const explanation = EXPLANATIONS[code] || (status ? `The update server returned HTTP ${status}.` : "The updater could not finish this operation.");
  return {
    error: `${explanation} (${code}${status ? `; HTTP ${status}` : ""})`,
    errorCode: code,
    errorStage: STAGES.has(stage) ? stage : "check",
    errorStatus: status ?? null,
  };
}

export function createUpdaterDiagnosticsLog({ path, maximumBytes, platform = process.platform, architecture = process.arch }) {
  const log = createProviderDiagnosticsLog({ path, maximumBytes });
  let pending = Promise.resolve();
  return Object.freeze({
    write(state, stage, event = "state") {
      // Project even our own state into a closed record, so adding a state field
      // later cannot accidentally persist arbitrary updater or user data.
      pending = log.write({
        event: event === "attempt" ? "attempt" : "state",
        phase: PHASES.has(state.phase) ? state.phase : "unknown",
        stage: event !== "attempt" && state.phase === "failed" && STAGES.has(state.errorStage) ? state.errorStage : STAGES.has(stage) ? stage : "check",
        channel: state.channel === "preview" ? "preview" : "stable",
        version: safeVersion(state.version),
        availableVersion: safeVersion(state.availableVersion),
        platform: ["darwin", "win32", "linux"].includes(platform) ? platform : "unknown",
        architecture: ["arm64", "x64"].includes(architecture) ? architecture : "unknown",
        ...(event !== "attempt" && state.phase === "failed" ? {
          code: Object.hasOwn(EXPLANATIONS, state.errorCode) ? state.errorCode : "UNKNOWN",
          status: Number.isInteger(state.errorStatus) && state.errorStatus >= 100 && state.errorStatus <= 599 ? state.errorStatus : null,
        } : {}),
      });
      return pending;
    },
    flush: () => pending,
  });
}
