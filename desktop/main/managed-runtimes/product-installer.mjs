import { createManagedRuntimeInstaller } from "./installer.mjs";
import { assemblePrimeManagedRuntime, createPrimeReviewedTreeCopier } from "../services/prime-managed-runtime.mjs";
import { PRIME_AGENT_ASSET_SHA256, selectPrimeAgentDependencyClosureSha256 } from "../services/prime-agent-runtime.mjs";

// Both hosts assemble the same reviewed runtime; each owns its profile and lifecycle.
export function createProductManagedRuntimeInstaller({ root, appRoot, pythonClientRoot, isPackaged }) {
  return createManagedRuntimeInstaller({
    root,
    assembleRecipe: async (context) => {
      if (context.recipe.runtimeId !== "prime") return;
      await assemblePrimeManagedRuntime(context, {
        copyReviewedTrees: createPrimeReviewedTreeCopier({
          appRoot,
          pythonClientRoot,
          expectedClosureSha256: selectPrimeAgentDependencyClosureSha256({
            isPackaged,
            javascriptContract: context.recipe.runtimeContract.javascript,
          }),
          expectedPythonClientSha256: PRIME_AGENT_ASSET_SHA256.pythonPackageTree,
        }),
      });
    },
  });
}
