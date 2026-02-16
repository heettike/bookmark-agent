// injector.js - runs in content script world at document_start
// injects intercept.js into the page's MAIN world so it can override fetch
const script = document.createElement("script");
script.src = chrome.runtime.getURL("intercept.js");
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);
