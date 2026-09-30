// Electron's nativeTheme.themeSource holds the preference; its resolved light or
// dark answer drives prefers-color-scheme in the renderer and the window colour.
export const APPEARANCE_PREFERENCES = Object.freeze(["system", "light", "dark"]);

// An install with no saved choice follows the operating system.
export function savedAppearance(value) {
  return APPEARANCE_PREFERENCES.includes(value) ? value : "system";
}

export function resolvedAppearance(nativeTheme) {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

export function windowBackgroundColor(mode) {
  return mode === "light" ? "#fafafa" : "#0b0c0d";
}

// Startup: apply the saved preference before any window exists, then keep the
// window colour in step with the operating system.
export function startAppearance(nativeTheme, saved, getWindow) {
  nativeTheme.themeSource = savedAppearance(saved);
  return followSystemAppearance(nativeTheme, getWindow);
}

function followSystemAppearance(nativeTheme, getWindow) {
  const update = () => getWindow()?.setBackgroundColor(windowBackgroundColor(resolvedAppearance(nativeTheme)));
  nativeTheme.on("updated", update);
  return () => nativeTheme.removeListener("updated", update);
}
