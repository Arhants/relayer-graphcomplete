import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parse } from "yaml";
import { runCommand } from "../scripts/ci/run-command.mjs";

test.skipIf(process.platform === "win32")("resource profiling observes real work and preserves failure without rerunning it", () => {
  const root = mkdtempSync(join(tmpdir(), "ci-profile-"));
  try {
    const marker = join(root, "executed");
    const profile = join(root, "profiles");
    const script = `require('node:fs').appendFileSync(process.argv[1], 'x'); let n=0; for(let i=0;i<1000000;i++) n+=Math.sqrt(i); process.exit(7);`;
    const args = ["-e", script, marker];
    expect(runCommand("fixture", process.execPath, args, { ...process.env, RELAYER_CI_PROFILE_DIR: profile }).status).toBe(7);
    expect(readFileSync(marker, "utf8")).toBe("x");
    const evidence = JSON.parse(readFileSync(join(profile, readdirSync(profile)[0]), "utf8"));
    expect(evidence).toMatchObject({ version: 1, label: "fixture", exitCode: 7, signal: null });
    expect(evidence.wallSeconds).toBeGreaterThan(0);
    expect(evidence.userSeconds + evidence.systemSeconds).toBeGreaterThan(0);
    expect(evidence.maxChildRssBytes).toBeGreaterThan(0);
    expect(JSON.stringify(evidence)).not.toContain(marker);
    // A regular file cannot be a report directory; the original result still wins.
    expect(runCommand("fixture", process.execPath, args, { ...process.env, RELAYER_CI_PROFILE_DIR: marker }).status).toBe(7);
    expect(readFileSync(marker, "utf8")).toBe("xx");
    // No interpreter was started, so direct execution is safe and happens once.
    expect(runCommand("fixture", process.execPath, args, { ...process.env, PATH: root, RELAYER_CI_PROFILE_DIR: profile }).status).toBe(7);
    expect(readFileSync(marker, "utf8")).toBe("xxx");
    writeFileSync(join(root, "python3"), "not executable", { mode: 0o600 });
    expect(runCommand("fixture", process.execPath, args, { ...process.env, PATH: root, RELAYER_CI_PROFILE_DIR: profile }).status).toBe(7);
    expect(readFileSync(marker, "utf8")).toBe("xxxx");
    const signaled = runCommand("signal fixture", process.execPath, ["-e", "process.kill(process.pid, 'SIGTERM')"], { ...process.env, RELAYER_CI_PROFILE_DIR: profile });
    expect(signaled.signal).toBe("SIGTERM");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("every profiled lane uploads optional evidence even after failures", () => {
  const workflow = parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
  for (const name of ["rust-clippy", "rust-tests", "rust-crash", "rust-runtime", "vitest", "packaging"]) {
    const job = workflow.jobs[name];
    expect(job.env.RELAYER_CI_PROFILE_DIR).toBe("${{ runner.temp }}/ci-resource-profiles");
    const upload = job.steps.find((step) => step.name === "Upload command resource profiles");
    expect(upload.if).toBe("${{ always() }}");
    expect(upload["continue-on-error"]).toBe(true);
    expect(upload.with["retention-days"]).toBe(14);
  }
});
