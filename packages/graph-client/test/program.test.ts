import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { GraphProgramEditError, applyGraphProgramEdits } from "../src/index.js";

const execFileAsync = promisify(execFile);
const CLIENT = pathToFileURL(join(import.meta.dirname, "../dist/index.js")).href;
const ENVIRONMENT = { RELAYER_GRAPH_URL: "http://127.0.0.1:1", RELAYER_GRAPH_TOKEN: "token", RELAYER_NODE_ID: "1" };

const PROGRAM = `import { RelayerGraphClient } from "${CLIENT}";
const graph = RelayerGraphClient.fromEnv();
const title = "Edge writes are serial";
console.log("ran:" + title);
`;

/** Runs a program the way a harness does: node reading a heredoc from standard input. */
async function runStdinProgram(program: string, programDirectory: string | undefined) {
  const child = execFileAsync(process.execPath, ["--input-type=module"], {
    env: { ...process.env, ...ENVIRONMENT, ...(programDirectory === undefined ? {} : { RELAYER_GRAPH_PROGRAM_DIR: programDirectory }) },
  });
  child.child.stdin!.end(program);
  try {
    const { stdout } = await child;
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

describe("applyGraphProgramEdits", () => {
  it("applies edits in order and leaves the rest of the program alone", () => {
    const patched = applyGraphProgramEdits("a\nb\nc\n", [{ find: "b\n", replace: "B\n" }, { find: "B\nc", replace: "B\nC" }]);
    expect(patched).toBe("a\nB\nC\n");
  });

  it.each([
    ["no edits", [], "non-empty array"],
    ["an empty find", [{ find: "", replace: "x" }], "non-empty find string"],
    ["a missing match", [{ find: "zzz", replace: "x" }], "was not found in the last program"],
    ["an ambiguous match", [{ find: "a", replace: "x" }], "appears more than once"],
  ])("refuses %s with a clear error", (_case, edits, message) => {
    expect(() => applyGraphProgramEdits("a a\n", edits)).toThrow(GraphProgramEditError);
    expect(() => applyGraphProgramEdits("a a\n", edits)).toThrow(message);
  });
});

describe("rerunGraphProgram through node --input-type=module", () => {
  const folders: string[] = [];
  afterEach(async () => {
    for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
  });
  async function programFolder(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "relayer-client-program-"));
    folders.push(folder);
    return folder;
  }

  it("keeps the stdin program, then runs a patched copy with the same imports", async () => {
    const folder = await programFolder();
    const first = await runStdinProgram(PROGRAM, folder);
    expect(first).toMatchObject({ code: 0, stdout: "ran:Edge writes are serial\n" });
    expect(await readFile(join(folder, "program.mjs"), "utf8")).toBe(PROGRAM);

    const patch = `import { rerunGraphProgram } from "${CLIENT}";
await rerunGraphProgram([{ find: 'const title = "Edge writes are serial";', replace: 'const title = "Edge writes are batched";' }]);
`;
    const second = await runStdinProgram(patch, folder);
    expect(second).toMatchObject({ code: 0, stdout: "ran:Edge writes are batched\n" });
    // The patched program is the next base, and the patch itself never replaces it.
    expect(await readFile(join(folder, "program.mjs"), "utf8")).toBe(PROGRAM.replace("are serial", "are batched"));
  });

  it("fails before running anything when a find is missing, and the base stays intact", async () => {
    const folder = await programFolder();
    await runStdinProgram(PROGRAM, folder);
    const patch = `import { rerunGraphProgram } from "${CLIENT}";
await rerunGraphProgram([{ find: "not in the program", replace: "x" }]);
`;
    const result = await runStdinProgram(patch, folder);
    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("GraphProgramEditError");
    expect(result.stderr).toContain("was not found in the last program");
    expect(await readFile(join(folder, "program.mjs"), "utf8")).toBe(PROGRAM);
  });

  it("says to run the full program when there is no earlier program", async () => {
    const folder = await programFolder();
    const patch = `import { rerunGraphProgram } from "${CLIENT}";
await rerunGraphProgram([{ find: "a", replace: "b" }]);
`;
    const result = await runStdinProgram(patch, folder);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("no earlier program for this interaction");
    await expect(stat(join(folder, "program.mjs"))).rejects.toThrow();
  });

  it("runs a full program unchanged when the host granted no program folder", async () => {
    const result = await runStdinProgram(PROGRAM, undefined);
    expect(result).toMatchObject({ code: 0, stdout: "ran:Edge writes are serial\n" });
    const patch = `import { rerunGraphProgram } from "${CLIENT}";
await rerunGraphProgram([{ find: "a", replace: "b" }]);
`;
    expect((await runStdinProgram(patch, undefined)).stderr).toContain("not available in this run");
  });
});
