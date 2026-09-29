import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildLayeredNavigationPrompt,
  CodexBasicHarness,
} from "../src/implementations/codex-basic.js";
import {
  EXPERIMENTAL_AUTHORING_STRATEGIES,
  javascriptExperimentalAuthoringGuidance,
  pythonExperimentalAuthoringGuidance,
} from "../src/implementations/experimental-authoring-guidance.js";
import type { GraphNode } from "@relayer/graph-client";
import type { HarnessConfiguration } from "../src/types.js";

const interaction = {
  id: 21,
  title: "Task",
  detail: "Do the work",
} as GraphNode;

const configuration: HarnessConfiguration = {
  schemaVersion: 1,
  name: "codex-experiment",
  implementation: "codex.basic",
  implementationVersion: 1,
  permissionBindings: {
    auto: {
      sandboxMode: "workspace-write",
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review",
      networkAccessEnabled: true,
    },
  },
  settings: {
    promptProfile: "layered-navigation-multi-agent-v1",
    experimentalAuthoringStrategy: "saved-module-v1",
  },
};

describe("experimental authoring guidance", () => {
  it("keeps the absent strategy byte-identical to the PR610 control prompt", () => {
    const control = buildLayeredNavigationPrompt(
      interaction,
      "file:///graph-client.js",
      undefined,
      "file:///complete.js",
      "Codex",
      false,
      false,
    );
    const explicitControl = buildLayeredNavigationPrompt(
      interaction,
      "file:///graph-client.js",
      undefined,
      "file:///complete.js",
      "Codex",
      false,
      false,
      undefined,
    );
    expect(explicitControl).toBe(control);
    expect(createHash("sha256").update(control).digest("hex")).toBe(
      "6ced0914937227824c76f475749a8d6e34a074981bb077e6f4989f2548ae8171",
    );
    expect(control).not.toContain("Experimental authoring strategy");
  });

  it.each(EXPERIMENTAL_AUTHORING_STRATEGIES)(
    "delivers one bounded JavaScript treatment for %s",
    (strategy) => {
      const prompt = buildLayeredNavigationPrompt(
        interaction,
        "@relayer/graph-client",
        undefined,
        false,
        "Codex",
        true,
        false,
        strategy,
      );
      expect(prompt).toContain("Experimental authoring strategy");
      expect(prompt).toContain(
        javascriptExperimentalAuthoringGuidance(strategy, 21),
      );
      expect(prompt).not.toContain("graph_helpers.py");
      expect(prompt).toContain(
        "final graph call must be await graph.submit(21)",
      );
    },
  );

  it("replaces the stdin-only restriction only in the isolated saved-module arm", () => {
    const prompt = buildLayeredNavigationPrompt(
      interaction,
      "@relayer/graph-client",
      undefined,
      false,
      "Codex",
      true,
      false,
      "saved-module-v1",
    );
    expect(prompt).toContain(
      "node --input-type=module < '.relayer/authoring-experiments/21/graph.mjs'",
    );
    expect(prompt).not.toContain(
      "do not create a script in either the project checkout or a temporary directory",
    );
    expect(prompt).toContain(
      "grants no additional filesystem, network, graph, or completion authority",
    );
  });

  it("refuses the saved-module arm at the trusted pinned-launcher boundary", () => {
    expect(
      () =>
        new CodexBasicHarness(
          {
            threadId: 1,
            permissionProfileId: "auto",
            permissionBinding: configuration.permissionBindings.auto!,
            workingDirectory: "/isolated/experiment",
            configuration,
          },
          {
            graphAuthoringLauncherPath:
              "/immutable/runtime/graph-authoring-launcher",
          },
        ),
    ).toThrow("cannot widen the trusted graph-authoring launcher contract");
  });

  it.each(EXPERIMENTAL_AUTHORING_STRATEGIES)(
    "keeps Prime guidance Python-specific for %s",
    (strategy) => {
      const guidance = pythonExperimentalAuthoringGuidance(strategy, 21);
      expect(guidance).toContain("Experimental authoring strategy");
      expect(guidance).not.toContain("graph.mjs");
      expect(guidance).not.toContain("Recursive JavaScript");
    },
  );

  it("distinguishes local functions, native helpers, and semantic Complete", () => {
    const js = javascriptExperimentalAuthoringGuidance(
      "decompose-publish-v1",
      21,
    );
    const python = pythonExperimentalAuthoringGuidance(
      "decompose-publish-v1",
      21,
    );
    for (const guidance of [js, python]) {
      expect(guidance).toContain("functions only structure local computation");
      expect(guidance).toContain(
        "native helpers remain inside this completion",
      );
      expect(guidance).toMatch(
        /only an explicit complete\(input(?:Graph|_graph)\) call creates a separately accepted semantic child/i,
      );
      expect(guidance).toContain("never publish empty placeholders");
      expect(guidance).toContain(
        "there is no required helper, child, node, call, or recursion count",
      );
    }
  });
});
