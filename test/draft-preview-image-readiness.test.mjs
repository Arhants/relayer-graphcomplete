import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { createImageIcon } from '../desktop/renderer/src/product-workspace/image-icons.js';
import { waitForPreviewImages } from '../desktop/renderer/src/draft-preview/image-readiness.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  const window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('lucide', { Circle: {}, createElement: () => window.document.createElement('svg') });
  const root = window.document.createElement('section');
  window.document.body.append(root);
  return { window, root };
}
function imageLoaded(image) {
  image.decode = async () => {};
  Object.defineProperties(image, { complete: { configurable: true, value: true }, naturalWidth: { configurable: true, value: 96 } });
}

it('waits for the production icon mount and shadow Detail image before capture', async () => {
  const { window, root } = setup();
  let resolveAsset;
  const asset = new Promise(resolve => { resolveAsset = resolve; });
  let iconImage;
  const create = window.document.createElement.bind(window.document);
  vi.spyOn(window.document, 'createElement').mockImplementation(name => {
    const element = create(name);
    if (name === 'img') iconImage = element;
    return element;
  });
  const icon = createImageIcon({ kind: 'image', assetId: 'launch', digestSha256: 'pin', mediaType: 'image/png' }, {}, () => asset);
  root.append(icon);
  const detail = create('div'); root.append(detail);
  const shadow = detail.attachShadow({ mode: 'open' });
  const detailImage = create('img');
  Object.defineProperty(detailImage, 'complete', { configurable: true, value: true });
  // The Detail runtime has created its mount but has not assigned scoped bytes yet.
  shadow.append(detailImage);
  let captured = false;
  const ready = waitForPreviewImages(root).then(() => { captured = true; });
  resolveAsset({ url: 'blob:launch', digestSha256: 'pin', mediaType: 'image/png' });
  await Promise.resolve(); await Promise.resolve();
  expect(captured).toBe(false);
  await vi.waitFor(() => expect(iconImage).toBeDefined());
  imageLoaded(iconImage); iconImage.onload();
  await icon.readyIcon;
  expect(icon.querySelector('img')).toBe(iconImage);
  expect(captured).toBe(false);
  imageLoaded(detailImage);
  await ready;
  expect(captured).toBe(true);
});

it('settles neutral fallback and disposal without leaking a waiting preview', async () => {
  const { root } = setup();
  const release = vi.fn();
  const fallback = createImageIcon({ assetId: 'bad', digestSha256: 'pin', mediaType: 'image/png' }, {}, async () => ({ url: 'blob:bad', digestSha256: 'other', mediaType: 'image/png', release }));
  root.append(fallback);
  await expect(fallback.readyIcon).resolves.toBe('fallback');
  await waitForPreviewImages(root);
  expect(release).toHaveBeenCalledOnce();
  const disposed = createImageIcon({ assetId: 'late' }, {}, () => new Promise(() => {}));
  root.append(disposed); disposed.disposeIcon();
  await expect(disposed.readyIcon).resolves.toBe('disposed');
  await waitForPreviewImages(root);
});

it('refuses to certify a pending or broken Detail image', async () => {
  const { window, root } = setup();
  const image = window.document.createElement('img');
  Object.defineProperty(image, 'complete', { configurable: true, value: false });
  root.append(image);
  await expect(waitForPreviewImages(root, { timeoutMs: 5 })).rejects.toThrow('did not settle');
  image.src = 'blob:broken';
  Object.defineProperty(image, 'complete', { configurable: true, value: true });
  await expect(waitForPreviewImages(root)).rejects.toThrow('failed to load');
});
