// A preview waits for the same async mounts Product uses before taking its PNG.
export async function waitForPreviewImages(root, { timeoutMs = 10_000 } = {}) {
  let stopped = false;
  let timeout;
  const elements = () => {
    const all = [];
    const visit = (scope) => {
      for (const element of scope.querySelectorAll('*')) {
        all.push(element);
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    visit(root);
    return all;
  };
  try {
    await Promise.race([
      (async () => {
        await Promise.all(elements().filter(element => element.readyIcon).map(element => element.readyIcon));
        while (!stopped) {
          const images = elements().filter(element => element.tagName === 'IMG');
          if (images.some(image => image.src && image.complete && !image.naturalWidth)) throw new Error('Draft preview image failed to load.');
          if (images.every(image => image.complete && image.naturalWidth > 0)) {
            await Promise.all(images.map(image => image.decode?.()));
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      })(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Draft preview images did not settle.')), timeoutMs); }),
    ]);
  } finally {
    stopped = true;
    clearTimeout(timeout);
  }
}
