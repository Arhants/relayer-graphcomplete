import { assetRef, css, html } from "./detail.js";
import { isImageIcon, type ImageIcon } from "./image-icons.js";
/** Static Node Details recipe using the same registered image reference as graph icons. */
export function imageIconDetail(icon: ImageIcon) {
  if (!isImageIcon(icon)) throw new TypeError("Expected a registered image icon");
  const fit = icon.fit ?? "contain";
  const framing = icon.framing ?? "none";
  const styles = {
    contain: {
      none: css`img { width: 100%; height: 100%; object-fit: contain; border-radius: 0; }`,
      circle: css`img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }`,
      rounded: css`img { width: 100%; height: 100%; object-fit: contain; border-radius: 25%; }`,
    },
    cover: {
      none: css`img { width: 100%; height: 100%; object-fit: cover; border-radius: 0; }`,
      circle: css`img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }`,
      rounded: css`img { width: 100%; height: 100%; object-fit: cover; border-radius: 25%; }`,
    },
  };
  return Object.freeze({ html: html`<img asset=${assetRef(icon.assetId)} alt="">`, css: styles[fit][framing] });
}

/** Register the pinned Lucide preview and author it through the ordinary asset compiler. */
export async function symbolIconDetail(
  graph: { readonly icons: import("./icon-discovery.js").GraphIcons; readonly visualAssets: import("./visual-assets.js").GraphVisualAssets },
  name: import("./icons.js").RelayerIconName,
) {
  const scope = await graph.visualAssets.scope();
  const inspected = await graph.icons.inspect([name], { scope });
  const file = inspected.previews[0];
  if (!file || file.mediaType !== "image/svg+xml") throw new Error("Pinned symbol preview unavailable");
  // A standalone SVG image cannot inherit the surrounding text colour.
  // Neutral gray keeps the pinned geometry legible on light and dark surfaces.
  const bytes = new TextEncoder().encode(new TextDecoder("utf-8", { fatal: true }).decode(await file.read()).replace(/currentColor/g, "#767676"));
  const staticFile = { name: file.name, mediaType: file.mediaType, async read() { return bytes.slice(); } };
  const asset = await graph.visualAssets.add({ file: staticFile, scope, name: `Lucide ${name}`, description: `Pinned Lucide symbol ${name}.` });
  return imageIconDetail({ kind: "image", assetId: asset.id });
}
