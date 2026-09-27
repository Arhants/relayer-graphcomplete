import { describe, expect, it, vi } from "vitest";

const { installer, assemble, copier } = vi.hoisted(() => ({
  installer: vi.fn((options) => options),
  assemble: vi.fn(async () => {}),
  copier: vi.fn((options) => options),
}));
vi.mock("../desktop/main/managed-runtimes/installer.mjs", () => ({ createManagedRuntimeInstaller: installer }));
vi.mock("../desktop/main/services/prime-managed-runtime.mjs", () => ({
  assemblePrimeManagedRuntime: assemble,
  createPrimeReviewedTreeCopier: copier,
}));
import { createProductManagedRuntimeInstaller } from "../desktop/main/managed-runtimes/product-installer.mjs";
import { resolveManagedRuntimeRecipe } from "../desktop/main/managed-runtimes/recipes.mjs";
import { PRIME_AGENT_ASSET_SHA256 } from "../desktop/main/services/prime-agent-runtime.mjs";

const paths = { root: "/profile/managed-runtimes", appRoot: "/application", pythonClientRoot: "/python-client" };

describe("shared product runtime installer", () => {
  it.each([false, true])("binds Prime assembly to the correct reviewed closure (packaged=%s)", async (isPackaged) => {
    const recipe = resolveManagedRuntimeRecipe("prime@0.8.1", "macos-arm64");
    const context = { recipe, installationRoot: "/installation" };
    const runtime = createProductManagedRuntimeInstaller({ ...paths, isPackaged });
    await runtime.assembleRecipe(context);
    expect(runtime.root).toBe(paths.root);
    expect(assemble).toHaveBeenLastCalledWith(context, { copyReviewedTrees: {
      appRoot: paths.appRoot,
      pythonClientRoot: paths.pythonClientRoot,
      expectedClosureSha256: isPackaged
        ? recipe.runtimeContract.javascript.dependencyClosureSha256
        : recipe.runtimeContract.javascript.repositoryDependencyClosureSha256,
      expectedPythonClientSha256: PRIME_AGENT_ASSET_SHA256.pythonPackageTree,
    } });
  });

  it("leaves other recipes untouched and preserves assembly failures", async () => {
    assemble.mockClear(); copier.mockClear();
    const runtime = createProductManagedRuntimeInstaller({ ...paths, isPackaged: false });
    await runtime.assembleRecipe({ recipe: { runtimeId: "codex" } });
    expect(copier).not.toHaveBeenCalled();
    expect(assemble).not.toHaveBeenCalled();
    const failure = new Error("reviewed tree mismatch");
    assemble.mockRejectedValueOnce(failure);
    await expect(runtime.assembleRecipe({ recipe: resolveManagedRuntimeRecipe("prime@0.8.1", "macos-arm64") })).rejects.toBe(failure);
  });
});
