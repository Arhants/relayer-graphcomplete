import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PrimeAgentHarness } from "../src/implementations/prime-agent.js";

type ContextFile = { path: string; content: string };

it.each([false, true])("confines native instruction discovery to the selected workspace (managed=%s)", async (managed) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "prime-context-")));
  const workspace = join(root, "app", "workspaces", "1");
  const privateStateRoot = join(root, "private-state", "fixture");
  const agentDir = join(privateStateRoot, "agent");
  let options: { agentsFilesOverride?: (input: { agentsFiles: ContextFile[] }) => { agentsFiles: ContextFile[] } } = {};
  const native = await import(new URL("./core/resource-loader.js", import.meta.resolve("@earendil-works/pi-coding-agent")).href);
  try {
    await mkdir(workspace, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, "AGENTS.md"), "Managed private instructions");
    const privateInstructions = managed ? ["Managed private instructions"] : [];
    await writeFile(join(root, "AGENTS.md"), "Unrelated development repository instructions");
    const harness = await PrimeAgentHarness.create({
      threadId: 1, workingDirectory: workspace, permissionProfileId: "full", permissionBinding: {},
      configuration: { schemaVersion: 1, name: "context-proof", implementation: "prime.agent", implementationVersion: 1, permissionBindings: { full: {} }, settings: {} },
    }, {
      ...(managed ? { resolvePrimeRuntime: async () => ({ runtimeId: "prime" as const, executable: "/fixture/python", moduleUrl: "file:///fixture/index.js", installationRoot: join(root, "installations", "fixture"), privateStateRoot }) } : {}),
      loadModule: async () => ({
      AGENT_RUN_MODEL_SCOPE_VERSION: 1,
      createAgentRunModelScope: (input: unknown) => input,
      createHostRequestHandler: (handler: unknown) => handler,
      SessionManager: { create: () => ({}), open: () => ({}) },
      createAgentSessionServices: async (input: { resourceLoaderOptions: typeof options }) => {
        options = input.resourceLoaderOptions; return {};
      },
      createAgentSessionFromServices: async () => ({ session: { promptAndWait: async () => undefined, waitForRlmQuiescence: async () => undefined, abort: async () => undefined, dispose() {} } }),
    }) as never });
    try {
      const discover = () => {
        const agentsFiles = native.loadProjectContextFiles({ cwd: workspace, agentDir });
        expect(agentsFiles.some((file: ContextFile) => file.path === join(root, "AGENTS.md"))).toBe(true);
        return options.agentsFilesOverride ? options.agentsFilesOverride({ agentsFiles }).agentsFiles : agentsFiles;
      };
      expect(discover().map((file: ContextFile) => file.content)).toEqual(privateInstructions);
      // A real selected project's own instructions still apply, also on reload.
      await writeFile(join(workspace, "AGENTS.md"), "Selected workspace instructions");
      expect(discover().map((file: ContextFile) => file.content)).toEqual([...privateInstructions, "Selected workspace instructions"]);
      await rm(join(workspace, "AGENTS.md"));
      await symlink(join(root, "AGENTS.md"), join(workspace, "AGENTS.md"));
      expect(discover().map((file: ContextFile) => file.content)).toEqual(privateInstructions);
    } finally { await harness.dispose(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
