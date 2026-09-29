(() => {
  // Desktop main applies the saved preference to nativeTheme before the window
  // exists, so the media query already reports the resolved appearance.
  // Browser-hosted review keeps its saved or dark appearance.
  const light = window.relayerDesktop
    ? matchMedia("(prefers-color-scheme: light)").matches
    : localStorage.getItem("relayerAppearance") === "light";
  document.documentElement.dataset.theme = light ? "light" : "dark";
})();
