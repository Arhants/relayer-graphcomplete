(() => {
  if (new URLSearchParams(location.search).get("review") !== "1" || window.relayerEvalReview) return;
  const key = "relayer-product-review";
  const supplied = location.hash.slice(1);
  if (/^[a-f0-9]{64}$/.test(supplied)) {
    sessionStorage.setItem(key, supplied);
    history.replaceState(null, "", location.pathname + location.search);
  }
  const token = sessionStorage.getItem(key);
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return nativeFetch(input, options);
    const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return nativeFetch(input, { ...options, headers, credentials: "omit" });
  };
  window.relayerEvalReview = {
    context: async () => {
      const response = await fetch("/api/review-context");
      if (!response.ok) throw new Error("This review session is unavailable.");
      return response.json();
    },
    registerPresentationAdapter: (adapter) => { window.__evalPresentation = adapter; },
  };
})();
