import { createRelayerIcon } from "./icons.js";

export function imageIconReference(value) {
  if (typeof value === "string" && value.startsWith("{")) {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value?.kind === "image" && typeof value.assetId === "string" ? value : null;
}

// Only the accepted-content resolver supplies URLs. Authoring never supplies a URL.
export function createImageIcon(icon, attributes, resolveAsset, { document = globalThis.document } = {}) {
  const host = document.createElement("span");
  for (const [name, value] of Object.entries(attributes)) host.setAttribute(name, value);
  host.setAttribute("aria-hidden", "true");
  host.dataset.relayerIcon = "image";
  host.dataset.iconFraming = icon.framing ?? "none";
  host.classList.add("relayer-image-icon");
  host.replaceChildren(createRelayerIcon(null));
  let released = false;
  let content;
  const dispose = () => { released = true; content?.release?.(); content = undefined; };
  host.disposeIcon = dispose;
  Promise.resolve().then(() => resolveAsset({ id: icon.assetId, digestSha256: icon.digestSha256, mediaType: icon.mediaType })).then((resolved) => {
    if (released) { resolved?.release?.(); return; }
    if (!resolved?.url || resolved.digestSha256 !== icon.digestSha256 || resolved.mediaType !== icon.mediaType) {
      resolved?.release?.(); return;
    }
    content = resolved;
    const image = document.createElement("img");
    image.alt = "";
    image.style.objectFit = icon.fit === "cover" ? "cover" : "contain";
    image.onload = () => { if (!released) host.replaceChildren(image); };
    image.onerror = dispose;
    image.src = resolved.url;
  }).catch(() => {});
  return host;
}
