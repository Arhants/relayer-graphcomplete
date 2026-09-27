// Cache service failures are acceleration failures, never build verdicts.
export function transientRestoreFailure(log) {
  return /(?:Failed to restore:|Rate limited:)[^\n]*(?:\b429\b|\b5\d\d\b)/i.test(log);
}

export async function restoreWithRetry({ attempt, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), random = Math.random, report = () => {} }) {
  const emit = (value) => { try { report(value); } catch { /* telemetry is optional */ } };
  for (let number = 1; number <= 2; number++) {
    let result;
    try { result = await attempt(); } catch { result = { key: null, log: "unclassified restore failure" }; }
    emit({ attempt: number, hit: Boolean(result.key), transient: transientRestoreFailure(result.log ?? "") });
    if (result.key || number === 2 || !transientRestoreFailure(result.log ?? "")) return result.key ?? null;
    // Respect a longer service Retry-After by falling back, not retrying early.
    const retryAfter = /(?:retry.after|rate limit will reset in)[^\d]*(\d+)/i.exec(result.log ?? "");
    if (retryAfter && Number(retryAfter[1]) > 30) return null;
    await sleep(Math.max(5000 + Math.floor(random() * 5000), Number(retryAfter?.[1] ?? 0) * 1000));
  }
  return null;
}
