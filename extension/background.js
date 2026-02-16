const DEFAULT_API_URL = "";
const DEFAULT_API_KEY = "";
let API_URL = DEFAULT_API_URL;
let API_KEY = DEFAULT_API_KEY;

// load config from storage (only override if actually set)
chrome.storage.local.get({ apiUrl: "", apiKey: "" }, (r) => {
  API_URL = r.apiUrl || DEFAULT_API_URL;
  API_KEY = r.apiKey || DEFAULT_API_KEY;
});

// listen for config changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiUrl) API_URL = changes.apiUrl.newValue || DEFAULT_API_URL;
  if (changes.apiKey) API_KEY = changes.apiKey.newValue || "";
});

// handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "bookmarkCaptured") {
    handleBookmark(msg.data, sender.tab?.id);
    return false;
  }
  if (msg.action === "getConfig") {
    sendResponse({ apiUrl: API_URL, apiKey: API_KEY });
    return false;
  }
  if (msg.action === "getBookmarks") {
    fetchBookmarks(msg.limit || 20).then(sendResponse).catch(() => sendResponse({ bookmarks: [] }));
    return true;
  }
  if (msg.action === "testConnection") {
    testConnection(msg.apiUrl, msg.apiKey).then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

async function handleBookmark(data, tabId) {
  if (!API_URL || !API_KEY) {
    showToast(tabId, "configure api key in extension settings", false);
    return;
  }

  try {
    const resp = await fetch(`${API_URL}/api/bookmark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify(data)
    });

    const result = await resp.json();

    if (resp.ok && result.ok) {
      showToast(tabId, "captured", true);
    } else if (resp.status === 409) {
      showToast(tabId, "already saved", true);
    } else {
      showToast(tabId, result.error || "failed to save", false);
    }
  } catch (err) {
    showToast(tabId, "network error", false);
  }
}

async function fetchBookmarks(limit) {
  if (!API_URL || !API_KEY) return { bookmarks: [] };

  const resp = await fetch(`${API_URL}/api/bookmarks?limit=${limit}`, {
    headers: { "Authorization": `Bearer ${API_KEY}` }
  });
  return resp.json();
}

async function testConnection(apiUrl, apiKey) {
  try {
    const resp = await fetch(`${apiUrl}/api/health`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const data = await resp.json();
    return { ok: resp.ok, ...data };
  } catch {
    return { ok: false, error: "connection failed" };
  }
}

async function showToast(tabId, message, success) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msg, ok) => {
        const existing = document.getElementById("__bma-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.id = "__bma-toast";
        toast.innerHTML = `
          <style>
            #__bma-toast {
              position: fixed; bottom: 20px; left: 20px; z-index: 2147483647;
              background: #0a0a0a; border: 1px solid ${ok ? "rgba(255,255,255,0.08)" : "rgba(255,80,80,0.2)"};
              font-family: 'SF Mono', Consolas, monospace;
              padding: 10px 16px;
              box-shadow: 0 4px 24px rgba(0,0,0,0.5);
              animation: __bma-in 0.15s ease;
              pointer-events: none;
              display: flex; align-items: center; gap: 8px;
            }
            @keyframes __bma-in { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
            @keyframes __bma-out { from { opacity:1 } to { opacity:0 } }
            .__bma-dot {
              width: 6px; height: 6px; border-radius: 50%;
              background: ${ok ? "#4ade80" : "#f87171"};
            }
            .__bma-msg { color: #999; font-size: 11px; }
          </style>
          <span class="__bma-dot"></span>
          <span class="__bma-msg">${msg}</span>
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.style.animation = "__bma-out 0.15s ease forwards";
          setTimeout(() => toast.remove(), 150);
        }, 2000);
      },
      args: [message, success]
    });
  } catch {}
}
