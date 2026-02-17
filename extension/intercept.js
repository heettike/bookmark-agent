// intercept.js - runs in the PAGE's main world (not isolated)
// overrides fetch to detect CreateBookmark GraphQL mutations
(() => {
  const originalFetch = window.fetch;

  window.fetch = function (...args) {
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      // only intercept GraphQL bookmark calls - let everything else pass through untouched
      if (url && url.includes("/graphql/") && args[1]?.body) {
        const body = typeof args[1].body === "string" ? args[1].body : null;
        if (body && body.includes("CreateBookmark")) {
          console.log("[bookmark-agent] bookmark detected via fetch intercept");
          window.dispatchEvent(new CustomEvent("__bma_bookmark", { detail: { action: "create" } }));
        }
      }
    } catch {}
    // always call original synchronously - no async wrapper
    return originalFetch.apply(this, args);
  };

  // also intercept XHR
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__bmaUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this.__bmaUrl && this.__bmaUrl.includes("/graphql/") && body) {
      const bodyStr = typeof body === "string" ? body : "";
      if (bodyStr.includes("CreateBookmark")) {
        console.log("[bookmark-agent] bookmark detected via XHR intercept");
        window.dispatchEvent(new CustomEvent("__bma_bookmark", { detail: { action: "create" } }));
      }
    }
    return originalSend.call(this, body);
  };

  console.log("[bookmark-agent] fetch/XHR intercept installed in main world");
})();
