export const PRODUCTION_SHARE_SERVICE_ENDPOINT = "https://share.relayerlabs.ai";

function parseOrigin(value, { allowLoopbackHttp = false } = {}) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new TypeError("Share service endpoint must be an absolute HTTPS or loopback URL.");
  }
  const loopback = url.protocol === "http:"
    && allowLoopbackHttp
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]");
  if (url.protocol !== "https:" && !loopback) {
    throw new TypeError("Share service endpoint must use HTTPS or loopback HTTP in development.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new TypeError("Share service endpoint must be a credential-free origin without a path, query, or fragment.");
  }
  return url.origin;
}

export function resolveShareServiceEndpoint({
  packagedRelease,
  metadata,
  environment = process.env,
} = {}) {
  if (packagedRelease?.channel === "stable") return PRODUCTION_SHARE_SERVICE_ENDPOINT;
  if (packagedRelease?.channel === "preview") {
    const sealed = metadata?.relayerShareServiceEndpoint;
    if (!sealed) throw new TypeError("Preview desktop artifact must contain a build-sealed HTTPS origin.");
    return parseOrigin(sealed);
  }
  const developmentOverride = environment.RELAYER_SHARE_SERVICE_ENDPOINT;
  return developmentOverride
    ? parseOrigin(developmentOverride, { allowLoopbackHttp: true })
    : PRODUCTION_SHARE_SERVICE_ENDPOINT;
}
