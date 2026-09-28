import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parse } from "yaml";

test.skipIf(process.platform === "win32")("read-policy diagnostic rejects drift and retains incomplete closure and history evidence", () => {
  const result = spawnSync("python3", ["-B", "-m", "unittest", "discover", "-s", "scripts/ci/compile-inputs", "-p", "test_*.py"], { encoding: "utf8" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

test("native dependency preparation fails closed without source compilation or unrelated uploads", () => {
  const workflow = parse(readFileSync(".github/workflows/compile-input-native-prep.yml", "utf8"));
  expect(workflow.on.push.branches).toEqual(["codex/compile-input-digest"]);
  expect(workflow.on.push.paths).toEqual([".github/workflows/compile-input-native-prep.yml"]);
  expect(workflow.on.pull_request).toBeUndefined();
  const steps = workflow.jobs.prepare.steps;
  expect(steps.find((s) => s.uses === "actions/cache/restore@v5").with["fail-on-cache-miss"]).toBe(true);
  const qualify = steps.find((s) => s.name === "Qualify dependency and seal short-lived export");
  expect(qualify.run).toContain("node scripts/ci/lbug-artifact.mjs verify");
  expect(qualify["continue-on-error"]).toBeUndefined();
  expect(steps.filter((s) => s.run).map((s) => s.run).join("\n")).not.toMatch(/cargo (?:build|test)|npm /u);
  expect(steps.at(-1).with["retention-days"]).toBe(1);
  expect(readFileSync(".github/workflows/ci.yml", "utf8")).not.toContain("compile-inputs");
});
