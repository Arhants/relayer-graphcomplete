import { afterEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { createImageIcon } from "../desktop/renderer/src/product-workspace/image-icons.js";
import { actionPresentation } from "../desktop/renderer/src/product-workspace/workspace.js";

const pin = { kind: "image", assetId: "octopus", digestSha256: "a".repeat(64), mediaType: "image/png" };
describe("accepted image icon rendering", () => {
  afterEach(() => vi.unstubAllGlobals());
  function setup() {
    const document = new Window().document;
    vi.stubGlobal("lucide", { Circle: [], createElement: () => document.createElement("svg") });
    return document;
  }
  it("renders contain and transparency by default and releases pinned content on disposal", async () => {
    const document = setup();
    const release = vi.fn();
    const create = document.createElement.bind(document);
    let createdImage;
    vi.spyOn(document, "createElement").mockImplementation((tag, ...args) => {
      const element = create(tag, ...args);
      if (tag === "img") createdImage = element;
      return element;
    });
    const resolve = vi.fn(async () => ({ url: "blob:accepted", ...pin, release }));
    const host = createImageIcon(pin, { class: "relayer-node-icon" }, resolve, { document });
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledWith({ id: "octopus", digestSha256: pin.digestSha256, mediaType: "image/png" }));
    await new Promise(r => setTimeout(r, 0));
    // Model the browser's successful decode event, not a network image load.
    expect(createdImage.style.objectFit).toBe("contain");
    createdImage.onload();
    expect(host.querySelector("img")).toBe(createdImage);
    expect(host.dataset.iconFraming).toBe("none");
    host.disposeIcon();
    expect(release).toHaveBeenCalledOnce();
  });
  it("keeps a neutral fallback on unavailable content or pin mismatch", async () => {
    const document = setup();
    const release = vi.fn();
    const host = createImageIcon(pin, {}, async () => ({ url: "blob:wrong", digestSha256: "b".repeat(64), mediaType: pin.mediaType, release }), { document });
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
    expect(host.querySelector("svg")).not.toBeNull();
    const missing = createImageIcon(pin, {}, async () => { throw new Error("missing"); }, { document });
    await new Promise(r => setTimeout(r, 0));
    expect(missing.querySelector("svg")).not.toBeNull();
  });
  it("releases a late resolution after leaving the surface and preserves action image references", async () => {
    const document = setup();
    let complete;
    const release = vi.fn();
    const host = createImageIcon({ ...pin, fit: "cover", framing: "circle" }, {}, () => new Promise(r => { complete = r; }), { document });
    await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
    host.disposeIcon();
    complete({ url: "blob:accepted", ...pin, release });
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
    expect(host.dataset.iconFraming).toBe("circle");
    expect(actionPresentation({ icon: pin }).icon).toEqual(pin);
  });
});
