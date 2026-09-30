import type { RelayerIconName } from "./icons.js";
import type { VisualAssetFile, VisualAssetScope } from "./visual-assets.js";
import { decodedFile } from "./visual-assets.js";

export type DiscoverableIcon = RelayerIconName | { readonly kind: "image"; readonly assetId: string };
export interface IconDiscoveryItem {
  readonly id: string;
  readonly kind: "symbol" | "image";
  readonly name: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly categories: readonly string[];
  readonly tags: readonly string[];
  readonly useCases: readonly string[];
  readonly icon: DiscoverableIcon;
}
export interface IconDiscoveryRequest {
  readonly query: string;
  readonly kind?: "symbols" | "images" | "both";
  readonly limit?: number;
  readonly scope?: VisualAssetScope;
}
export class GraphIcons {
  constructor(private readonly send: (path: string, init: RequestInit) => Promise<unknown>) {}
  async discover(input: IconDiscoveryRequest): Promise<{ readonly items: readonly IconDiscoveryItem[]; readonly candidateSource: "catalog-text-v1" }> {
    return await this.send("/api/graph/icons/discover", { method: "POST", body: JSON.stringify(input) }) as { items: readonly IconDiscoveryItem[]; candidateSource: "catalog-text-v1" };
  }
  async inspect(icons: readonly DiscoverableIcon[], options: { readonly scope?: VisualAssetScope; readonly contactSheet?: boolean } = {}): Promise<{ readonly previews: readonly VisualAssetFile[]; readonly contactSheet: VisualAssetFile | null }> {
    const result = await this.send("/api/graph/icons/inspect", { method: "POST", body: JSON.stringify({ icons, ...options }) }) as { previews: unknown[]; contactSheet: unknown | null };
    return { previews: result.previews.map(decodedFile), contactSheet: result.contactSheet === null ? null : decodedFile(result.contactSheet) };
  }
}
