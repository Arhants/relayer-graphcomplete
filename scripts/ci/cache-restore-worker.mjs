import { restoreCache } from "@actions/cache";
const { paths, key, restoreKeys } = JSON.parse(process.env.RELAYER_CACHE_REQUEST);
try {
  const matched = await restoreCache(paths, key, restoreKeys);
  process.send?.({ key: matched ?? null });
} catch {
  // The SDK emits service diagnostics itself. Do not expose arbitrary error payloads.
  process.send?.({ key: null });
} finally {
  process.disconnect?.();
}
