import { sanitizeJavaScriptErrorFrames } from "../../shared/error-stack-sanitizer.mjs";
import { isApprovedTelemetryModule } from "../../shared/telemetry-module-inventory.mjs";

// Closed vocabulary: neither hostnames nor arbitrary native messages enter telemetry.
const NETWORK_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT",
  "ENETUNREACH", "EHOSTUNREACH", "EPIPE", "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET", "TIMEOUT",
]);

export function validShareHttpStatus(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 100 && value <= 599);
}

export function validShareNetworkCode(value) {
  return value === null || NETWORK_CODES.has(value);
}

function read(error, key) {
  try { return error?.[key]; } catch { return undefined; }
}

export function captureShareErrorDiagnostics(error) {
  let frames = [];
  let httpStatus = null;
  let networkCode = null;
  const seen = new Set();
  // Fetch wraps native errors in causes. Bound inspection and tolerate cycles/getters.
  for (let depth = 0; depth < 4 && error && !seen.has(error); depth += 1) {
    seen.add(error);
    if (frames.length === 0) {
      frames = sanitizeJavaScriptErrorFrames({ component: "electron-main", error })
        .filter((frame) => isApprovedTelemetryModule("electron-main", frame.module));
    }
    const status = read(error, "status");
    if (httpStatus === null && validShareHttpStatus(status)) httpStatus = status;
    const code = read(error, "code");
    if (networkCode === null && NETWORK_CODES.has(code)) networkCode = code;
    if (networkCode === null && read(error, "name") === "TimeoutError") networkCode = "TIMEOUT";
    error = read(error, "cause");
  }
  return Object.freeze({ frames: Object.freeze(frames), httpStatus, networkCode });
}
