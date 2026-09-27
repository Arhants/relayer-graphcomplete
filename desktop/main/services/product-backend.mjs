import { RelayerAppServerService } from "./relayer-app-server.mjs";

// Own the graph -> product dependency and clean up either partial startup.
export function createProductBackend({ graphRuntime, productOptions, beforeProductStart,
  createServer = (options) => new RelayerAppServerService(options) }) {
  let productServer;
  let starting;
  let closing;
  const close = () => closing ??= (async () => {
    const errors = [];
    try { await productServer?.close(); } catch (error) { errors.push(error); }
    try { await graphRuntime.close(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, "Product backend did not stop cleanly.");
  })();
  return {
    start: () => starting ??= (async () => {
      try {
        if (closing) throw new Error("Product backend is stopping.");
        const runtimeSession = await graphRuntime.start();
        if (closing) throw new Error("Product backend is stopping.");
        await beforeProductStart?.(runtimeSession);
        if (closing) throw new Error("Product backend is stopping.");
        productServer = createServer({ ...productOptions, runtimeSession });
        const productSession = await productServer.start();
        if (closing) throw new Error("Product backend is stopping.");
        return { runtimeSession, productServer, productSession };
      } catch (error) {
        try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Product backend startup and cleanup failed."); }
        throw error;
      }
    })(),
    close,
  };
}
