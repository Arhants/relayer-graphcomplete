import { desktop } from "./state.js";

let afterRefresh = async () => {};

// main.js reloads provider status and every model surface after a provider refresh.
export function setProviderModelsRefreshedHandler(handler) {
  afterRefresh = handler;
}

// Hosts without the desktop refresh bridge offer Open Settings instead of a Refresh action.
export function providerModelsRefreshAction() {
  return desktop?.models?.refresh ? refreshProviderModels : null;
}

// The exact-provider Refresh models action offered wherever the default family needs model
// setup (PROV-008). It uses the same provider refresh as the provider card.
export async function refreshProviderModels(providerId) {
  if (!desktop?.models?.refresh) throw new Error("Refreshing models is unavailable here.");
  try {
    await desktop.models.refresh(providerId);
  } finally {
    await afterRefresh();
  }
}
