/** A registered image; fit defaults to contain and framing defaults to none. */
export interface ImageIcon {
  readonly kind: "image";
  readonly assetId: string;
  readonly fit?: "contain" | "cover";
  readonly framing?: "none" | "circle" | "rounded";
  readonly digestSha256?: string;
  readonly mediaType?: string;
}
export type GraphIcon = string | ImageIcon;
export function imageIcon(assetId: string, options: Pick<ImageIcon, "fit" | "framing"> = {}): ImageIcon {
  const icon = { kind: "image" as const, assetId, ...options };
  if (!isImageIcon(icon)) throw new TypeError("Use a registered asset ID and valid image fit/framing");
  return Object.freeze(icon);
}
export function isImageIcon(value: unknown): value is ImageIcon {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== "string" || !descriptors[key] || !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) return false;
  const v = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])) as Record<string, unknown>;
  return v.kind === "image" && typeof v.assetId === "string" && v.assetId.trim().length > 0
    && (v.fit === undefined || v.fit === "contain" || v.fit === "cover")
    && (v.framing === undefined || v.framing === "none" || v.framing === "circle" || v.framing === "rounded")
    && (v.digestSha256 === undefined || (typeof v.digestSha256 === "string" && /^[a-f0-9]{64}$/u.test(v.digestSha256)))
    && (v.mediaType === undefined || ["image/png", "image/jpeg", "image/svg+xml"].includes(String(v.mediaType)))
    && Object.keys(v).every(key => ["kind", "assetId", "fit", "framing", "digestSha256", "mediaType"].includes(key));
}
