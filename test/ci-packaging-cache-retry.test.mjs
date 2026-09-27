import { expect, test, vi } from "vitest";
import { restoreWithRetry, transientRestoreFailure } from "../scripts/ci/cache-restore-policy.mjs";

test("retries the observed SDK 429 once, then restores the matching archive", async () => {
  const attempt = vi.fn().mockResolvedValueOnce({ log: "::warning::Failed to restore: Failed to GetCacheEntryDownloadURL: Rate limited: Failed request: (429) Too Many Requests" }).mockResolvedValueOnce({ key: "exact" });
  const sleep = vi.fn();
  expect(await restoreWithRetry({ attempt, sleep, random: () => 0, report: () => { throw Error("telemetry"); } })).toBe("exact");
  expect(attempt).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledWith(5000);
});
test.each(["", "::warning::Failed to restore: (403) denied", "bad tar archive", "unclassified failure"])("does not retry an ordinary miss or unclassified failure: %s", async (log) => {
  const attempt = vi.fn(async () => ({ log }));
  expect(await restoreWithRetry({ attempt })).toBeNull();
  expect(attempt).toHaveBeenCalledTimes(1);
});
test("bounds repeated service failure and respects a long Retry-After", async () => {
  const attempt = vi.fn(async () => ({ log: "Failed to restore: (503) service unavailable" }));
  expect(await restoreWithRetry({ attempt, sleep: async () => {} })).toBeNull();
  expect(attempt).toHaveBeenCalledTimes(2);
  attempt.mockClear().mockResolvedValue({ log: "You've hit a rate limit, your rate limit will reset in 60 seconds\nFailed to restore: (429)" });
  expect(await restoreWithRetry({ attempt })).toBeNull();
  expect(attempt).toHaveBeenCalledTimes(1);
  expect(transientRestoreFailure("normal miss: key 529")).toBe(false);
});

test("the subprocess adapter preserves swallowed SDK diagnostics, result and timeout fallback", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { restoreAttempt } = await import("../scripts/ci/cache-restore-process.mjs");
  const directory = await mkdtemp(join(tmpdir(), "cache-sdk-adapter-"));
  try {
    const worker = join(directory, "worker.mjs");
    await writeFile(worker, `console.log("::warning::Failed to restore: Failed to GetCacheEntryDownloadURL: (429) Too Many Requests"); process.send({key:null}); process.disconnect();`);
    const miss = await restoreAttempt({ worker, request: {}, report: () => { throw Error("telemetry"); } });
    expect(miss.key).toBeNull();
    expect(transientRestoreFailure(miss.log)).toBe(true);
    await writeFile(worker, `process.send({key:JSON.parse(process.env.RELAYER_CACHE_REQUEST).key}); process.disconnect();`);
    expect((await restoreAttempt({ worker, request: { key: "exact" }, report: () => {} })).key).toBe("exact");
    await writeFile(worker, `setInterval(() => {}, 1000);`);
    expect((await restoreAttempt({ worker, request: {}, timeoutMs: 50, report: () => {} })).key).toBeNull();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("workflow retries the original Cargo archive and sealed caches without giving plan a dependency", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const start = source.indexOf("\n  packaging:\n");
  expect(source.slice(0, start)).not.toContain("uses: ./.github/actions/restore-packaging-cache");
  const chapter = source.slice(start, source.indexOf("\n  check:", start));
  expect(chapter.match(/uses: \.\/\.github\/actions\/restore-packaging-cache/g)).toHaveLength(3);
  expect(chapter).toContain("rust-packaging-${{ matrix.target }}");
  // Offline metadata needs the locked registry closure even on an empty runner.
  const fetchIndex = chapter.indexOf("Seed the locked Cargo dependency closure");
  const identityIndex = chapter.indexOf("Identify sealed packaging cache inputs");
  expect(fetchIndex).toBeGreaterThanOrEqual(0);
  expect(identityIndex).toBeGreaterThan(fetchIndex);
  expect(chapter).toContain("github.event_name == 'push' && success()");
  const action = await readFile(new URL("../.github/actions/restore-packaging-cache/action.yml", import.meta.url), "utf8");
  expect(action).toContain("using: node24");
  expect(action).toContain("main: index.mjs");
  expect(await readFile(new URL("../.github/actions/restore-packaging-cache/index.mjs", import.meta.url), "utf8")).toContain("../../../scripts/ci/restore-cache.mjs");
});
