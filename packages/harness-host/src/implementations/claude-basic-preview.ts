import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { z } from "zod";
import type { HarnessTraceSink } from "../types.js";
import type { ClaudeBrowserSdk, ClaudeSdkToolResult } from "./claude-basic-browser.js";

export const CLAUDE_PREVIEW_SERVER_NAME = "relayer_graph_preview";
export const CLAUDE_PREVIEW_TOOL_NAME = "view_graph_preview";
export const CLAUDE_PREVIEW_TOOL = `mcp__${CLAUDE_PREVIEW_SERVER_NAME}__${CLAUDE_PREVIEW_TOOL_NAME}`;

/** Keeps the base64 image within the Anthropic API's 5 MiB per-image limit. */
const MAX_PREVIEW_BYTES = 3_932_160;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const requestSchema = { path: z.string().min(1).max(4_096) };

/**
 * The code-owned tool that shows Claude its draft previews (PRD §11.6, §11.10).
 * It reads only PNGs directly inside the running turn's preview folder and
 * grants no other file access. The trace records metadata, never the image.
 */
export function createClaudeBasicPreviewServer(
  sdk: ClaudeBrowserSdk,
  previewDirectory: string,
  trace: HarnessTraceSink,
): unknown {
  const tool = sdk.tool(
    CLAUDE_PREVIEW_TOOL_NAME,
    "Look at a draft preview image. Pass the preview.path that graph.submitLayer or graph.submitNode returned. Only PNG previews from this turn's preview folder can be opened.",
    requestSchema,
    async (input): Promise<ClaudeSdkToolResult> => {
      try {
        const png = await readPreview(previewDirectory, input.path);
        await trace.emit({
          type: "tool.call.completed",
          data: { tool: CLAUDE_PREVIEW_TOOL_NAME, outcome: "viewed", file: basename(input.path), byteLength: png.byteLength },
        });
        return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }] };
      } catch {
        // A refused path is model input, not a preview; the trace does not record it.
        await trace.emit({ type: "tool.call.completed", data: { tool: CLAUDE_PREVIEW_TOOL_NAME, outcome: "refused" } });
        return {
          content: [{ type: "text", text: "That file is not a draft preview from this turn. Pass the preview.path a graph write returned." }],
          isError: true,
        };
      }
    },
  );
  return sdk.createSdkMcpServer({
    name: CLAUDE_PREVIEW_SERVER_NAME,
    version: "1.0.0",
    instructions: "This server opens only PNG draft previews from the running turn's preview folder.",
    tools: [tool],
  });
}

async function readPreview(previewDirectory: string, requested: string): Promise<Buffer> {
  const folder = await realpath(previewDirectory);
  const target = await realpath(resolve(folder, requested));
  if (dirname(target) !== folder || extname(target).toLowerCase() !== ".png") throw new Error("outside preview folder");
  const checked = await lstat(target);
  // Open without following a final symlink, and without blocking on a FIFO, then
  // require the opened file to be the one checked and still inside the folder.
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > MAX_PREVIEW_BYTES
      || opened.dev !== checked.dev || opened.ino !== checked.ino) throw new Error("not the checked preview file");
    if (await realpath(previewDirectory) !== folder || await realpath(target) !== target) throw new Error("preview folder changed");
    const png = await handle.readFile();
    if (png.byteLength > MAX_PREVIEW_BYTES || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error("not a PNG");
    return png;
  } finally {
    await handle.close();
  }
}
