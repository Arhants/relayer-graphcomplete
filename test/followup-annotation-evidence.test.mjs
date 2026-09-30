import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const evidence = new URL("docs/evidence/followup-node-annotations/", root);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

describe("follow-up annotation visual evidence", () => {
  it("binds the real A-to-B capture to its source, images, and durable occurrence", async () => {
    const receipt = JSON.parse(await readFile(new URL("receipt.json", evidence), "utf8"));
    expect(receipt.passed).toBe(true);
    expect(receipt.paidInferenceCalls).toBe(0);
    expect(hash(await readFile(new URL("scripts/capture-followup-node-annotations.mjs", root)))).toBe(receipt.captureScriptSha256);
    expect(hash(await readFile(new URL(receipt.renderer.path, root)))).toBe(receipt.renderer.fixedSha256);
    expect(receipt.renderer.fixedSha256).not.toBe(receipt.renderer.baselineSha256);
    expect(receipt.servedRendererSha256).toBe(receipt.renderer.fixedSha256);
    const [before, after, editor, confirmed, reload] = receipt.checkpoints;
    expect(before).toMatchObject({ name: "A-before-missing-plus", hidden: true, position: true });
    expect(after).toMatchObject({ name: "B-after-plus-visible", hidden: false, position: true });
    expect(editor.editableDuringGeneration).toBe(true);
    expect(confirmed.durableCanonicalConfirmation).toBe(true);
    expect(reload).toEqual({ name: "reload-restores-confirmation", passed: true });
    for (const checkpoint of [before, after, editor, confirmed]) {
      const png = await readFile(new URL(`${checkpoint.name}.png`, evidence));
      expect(hash(png)).toBe(checkpoint.imageSha256);
      expect(png.readUInt32BE(16)).toBe(2560);
      expect(png.readUInt32BE(20)).toBe(1640);
    }
    expect(receipt.fixture.mode).toBe("accepted-followup-while-next-followup-running");
    expect(receipt.state.pendingStatus).toBe("running");
    expect(receipt.state.pendingInteractionId).not.toBe(receipt.state.selectedFollowupInteractionId);
    expect(receipt.confirmedState.drafts).toEqual([]);
    expect(receipt.confirmedState.confirmations).toHaveLength(1);
    const confirmation = receipt.confirmedState.confirmations[0];
    expect(confirmation.target).toEqual({
      nodeId: confirmation.targetNode.id,
      sourceInteractionNodeId: receipt.sourceOccurrence.interactionNodeId,
      sourceLayerId: receipt.sourceOccurrence.acceptedRootLayerId,
    });
    expect(confirmation.targetNode.state).toBe("accepted");
    expect(confirmation.annotation).toBe("Keep worker capacity visible while prioritizing work.");
  });
});
