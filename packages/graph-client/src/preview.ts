import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Advisory image of a draft write (PRD §11.10). It never affects acceptance. */
export interface GraphPreview {
  readonly status: "rendered" | "cached" | "failed" | "limit_reached";
  readonly path?: string;
  readonly width?: number;
  readonly height?: number;
}

const FAILED: GraphPreview = Object.freeze({ status: "failed" });

/**
 * Writes the PNG a graph write returned into the host's per-turn preview
 * folder and describes it for the agent. A malformed preview, or no folder
 * (the host deletes it when the turn ends), degrades to `failed`; the write
 * itself has already committed.
 */
export async function materializeGraphPreview(
  value: unknown,
  directory: string | undefined,
  target: string,
): Promise<GraphPreview | undefined> {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) return FAILED;
  const preview = value as Record<string, unknown>;
  if (preview.status === "failed" || preview.status === "limit_reached") return Object.freeze({ status: preview.status });
  if (preview.status !== "rendered" && preview.status !== "cached") return FAILED;
  const { pngBase64, width, height, fingerprint } = preview;
  if (typeof pngBase64 !== "string" || typeof fingerprint !== "string"
    || !positiveInteger(width) || !positiveInteger(height)) return FAILED;
  const digest = /^sha256:([0-9a-f]{16})/.exec(fingerprint)?.[1];
  if (digest === undefined || directory === undefined) return FAILED;
  try {
    const path = join(directory, `${target}-${digest}.png`);
    await writeFile(path, Buffer.from(pngBase64, "base64"), { mode: 0o600 });
    return Object.freeze({ status: preview.status, path, width, height });
  } catch {
    return FAILED;
  }
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
