import { harnessAllowsModel } from "@relayer/harness-host";

const READINESS_TRIGGERS = new Set(["connect", "reconnect", "explicit-repair", "recipe-update"]);

function unavailableReason(error) {
  const code = typeof error?.code === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(error.code)
    ? error.code
    : "harness_readiness_failed";
  return Object.freeze({
    code,
    message: "This execution configuration is currently unavailable.",
  });
}

function modelAvailable(model) {
  return model?.visible !== false
    && model?.available !== false
    && model?.availability !== "unavailable";
}

// #556: after startup, one background evaluation of the routes an upgrade left pending.
// It returns at once; startup never waits for the evaluation, and a failure only reports.
//
// A managed provider whose activation failed on a broken runtime publishes no models, so it
// has no route to evaluate. repairProviders first repairs such providers as Repair does,
// for the installed recipes this step would evaluate; a repair evaluates its own routes.
export function startPostUpgradeReadiness({
  readiness,
  updatesDue,
  recipeUpdates = [],
  routes,
  repairProviders = null,
  onError = () => {},
}) {
  const evaluation = Promise.resolve().then(async () => {
    let due = await updatesDue();
    let settled = [];
    if (repairProviders) {
      const { recipeIds } = await readiness.recipeUpdateTargets({ updatesDue: due, recipeUpdates });
      if (recipeIds.length > 0) {
        const mark = readiness.publicationMark();
        await repairProviders(recipeIds);
        // A harness a repair already published a result for has had its one evaluation,
        // whether a due mark or a newly activated recipe selected it.
        settled = readiness.publishedSince(mark);
        due = await updatesDue();
      }
    }
    const providers = await routes();
    return readiness.evaluateRecipeUpdate({ updatesDue: due, recipeUpdates, providers, skipHarnessIds: settled });
  }).catch((error) => {
    onError(error);
    return null;
  });
  return Object.freeze({ evaluation });
}

export function createHarnessReadinessCoordinator({
  configurations,
  digestConfiguration,
  runtimeRequirements,
  prepareRecipe,
  checkers,
  publishAvailability,
  // Whether a recipe has an installation on disk, valid or not (managedRecipeInstalled).
  // Only the post-upgrade evaluation asks, and it refuses to run without it.
  recipeInstalled = null,
  diagnostics = null,
}) {
  if (!(configurations instanceof Map) || typeof digestConfiguration !== "function"
    || typeof prepareRecipe !== "function" || typeof publishAvailability !== "function") {
    throw new Error("Harness readiness requires configurations, preparation, and publication.");
  }
  const implementations = new Set([...configurations.values()].map(({ implementation }) => implementation));
  for (const implementation of implementations) {
    if (typeof checkers?.[implementation] !== "function") {
      throw new Error(`${implementation} has no production readiness checker.`);
    }
  }
  let generation = 0;
  const harnessGenerations = new Map();
  let publication = Promise.resolve();
  // The generation of each harness's last result the app server accepted in this process.
  const publishedGenerations = new Map();

  function routeProvider(configuration, providers) {
    return providers.find(({ providerDefinition, models = [] }) => (
      configuration.executionAccessContracts?.includes(providerDefinition.accessContract)
      && models.some((model) => modelAvailable(model) && harnessAllowsModel(configuration.modelRules, {
        adapterId: providerDefinition.adapterId,
        modelId: model.id,
      }))
    ))?.providerDefinition ?? null;
  }

  // One evaluation with one generation. A provider trigger evaluates the routes of one
  // provider. The recipe-update trigger evaluates named harnesses once for every connected
  // provider that has a route through them (#556: ChatGPT and OpenRouter share codex-basic).
  async function evaluate({ trigger, providerDefinition, models = [], providers, harnessIds }) {
    if (!READINESS_TRIGGERS.has(trigger)) {
      return Object.freeze({ readyHarnessIds: [], routeResults: [] });
    }
    const routes = providers ?? [{ providerDefinition, models }];
    const named = harnessIds ? new Set(harnessIds) : null;
    const candidates = [];
    const candidateProviders = new Map();
    for (const configuration of configurations.values()) {
      if (named && !named.has(configuration.name)) continue;
      const provider = routeProvider(configuration, routes);
      if (!provider) continue;
      candidates.push(configuration);
      candidateProviders.set(configuration.name, provider);
    }
    if (candidates.length === 0) {
      return Object.freeze({ readyHarnessIds: [], routeResults: [] });
    }
    const currentGeneration = ++generation;
    const recipes = new Map();
    for (const configuration of candidates) {
      harnessGenerations.set(configuration.name, currentGeneration);
      const requirement = runtimeRequirements[configuration.implementation];
      if (requirement && !recipes.has(requirement.recipeId)) {
        recipes.set(requirement.recipeId, Promise.resolve().then(() => prepareRecipe(requirement.recipeId)));
      }
    }
    const routeResults = await Promise.all(candidates.map(async (configuration) => {
      const requirement = runtimeRequirements[configuration.implementation];
      let result;
      try {
        const runtime = requirement ? await recipes.get(requirement.recipeId) : null;
        result = await checkers[configuration.implementation]({
          configuration,
          runtime,
        });
        if (result?.available !== true && result?.available !== false) {
          throw new Error("Harness readiness checker returned an invalid result.");
        }
      } catch (error) {
        result = { available: false, reason: unavailableReason(error) };
        await diagnostics?.write({
          level: "error",
          category: "harness_readiness_failed",
          // A recipe-update result belongs to the harness, not to one of its providers.
          ...(trigger === "recipe-update"
            ? { trigger }
            : { providerId: candidateProviders.get(configuration.name).id }),
          harnessId: configuration.name,
          code: result.reason.code,
        }).catch(() => undefined);
      }
      return Object.freeze({
        harnessId: configuration.name,
        configurationDigest: digestConfiguration(configuration),
        generation: currentGeneration,
        available: result.available,
        unavailableReason: result.available ? null : (result.reason ?? unavailableReason()),
      });
    }));
    const currentRouteResults = routeResults.filter(({ harnessId }) => (
      harnessGenerations.get(harnessId) === currentGeneration
    ));
    if (currentRouteResults.length === 0) {
      return Object.freeze({ readyHarnessIds: [], routeResults: [] });
    }
    const publish = publication.catch(() => undefined).then(async () => {
      const publishable = currentRouteResults.filter(({ harnessId }) => (
        harnessGenerations.get(harnessId) === currentGeneration
      ));
      if (publishable.length === 0) return [];
      await publishAvailability(publishable);
      for (const { harnessId } of publishable) publishedGenerations.set(harnessId, currentGeneration);
      return publishable.filter(({ harnessId }) => harnessGenerations.get(harnessId) === currentGeneration);
    });
    publication = publish;
    const published = await publish;
    if (published.length === 0) {
      return Object.freeze({ readyHarnessIds: [], routeResults: [] });
    }
    return Object.freeze({
      readyHarnessIds: published.filter(({ available }) => available).map(({ harnessId }) => harnessId),
      routeResults: published,
    });
  }

  // #556: after an upgrade, one evaluation through the recipe-update trigger covers every
  // harness whose digest the app server marked due, and every harness whose runtime recipe
  // was newly activated. The app server clears its mark when the result commits.
  // It never makes a first installation: a harness whose runtime was never installed
  // waits for Connect or Repair, as on a first launch.
  // The harnesses the post-upgrade step evaluates, and the installed recipes they run.
  async function recipeUpdateTargets({ updatesDue = [], recipeUpdates = [] }) {
    if (typeof recipeInstalled !== "function") {
      throw new Error("The post-upgrade readiness evaluation requires an installed-recipe check.");
    }
    const due = new Set(updatesDue);
    const activated = new Set(recipeUpdates);
    const harnessIds = [];
    const recipeIds = new Set();
    for (const { name, implementation } of configurations.values()) {
      const recipeId = runtimeRequirements[implementation]?.recipeId;
      if (!due.has(name) && !activated.has(recipeId)) continue;
      if (recipeId && !await recipeInstalled(recipeId)) continue;
      harnessIds.push(name);
      if (recipeId) recipeIds.add(recipeId);
    }
    return Object.freeze({ harnessIds: Object.freeze(harnessIds), recipeIds: Object.freeze([...recipeIds]) });
  }

  async function evaluateRecipeUpdate({
    updatesDue = [], recipeUpdates = [], providers = [], skipHarnessIds = [],
  }) {
    const skipped = new Set(skipHarnessIds);
    const harnessIds = (await recipeUpdateTargets({ updatesDue, recipeUpdates })).harnessIds
      .filter((harnessId) => !skipped.has(harnessId));
    if (harnessIds.length === 0) return Object.freeze({ readyHarnessIds: [], routeResults: [] });
    return evaluate({ trigger: "recipe-update", providers, harnessIds });
  }

  // A point in evaluation order, and the harnesses published by evaluations started after it.
  const publicationMark = () => generation;
  const publishedSince = (mark) => [...publishedGenerations]
    .filter(([, published]) => published > mark)
    .map(([harnessId]) => harnessId);

  return Object.freeze({ evaluate, evaluateRecipeUpdate, recipeUpdateTargets, publicationMark, publishedSince });
}
