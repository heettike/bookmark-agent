document.getElementById("openSettings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function init() {
  const { apiUrl, apiKey } = await new Promise((resolve) => {
    chrome.storage.local.get({ apiUrl: "", apiKey: "" }, resolve);
  });

  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");

  if (!apiUrl || !apiKey) {
    dot.className = "status-dot err";
    text.textContent = "not configured - open settings";
    return;
  }

  // test connection
  try {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "testConnection", apiUrl, apiKey }, resolve);
    });

    if (result?.ok) {
      dot.className = "status-dot ok";
      text.textContent = "connected";
    } else {
      dot.className = "status-dot err";
      text.textContent = result?.error || "connection failed";
      return;
    }
  } catch {
    dot.className = "status-dot err";
    text.textContent = "connection error";
    return;
  }

  // load recent bookmarks
  try {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getBookmarks", limit: 20 }, resolve);
    });

    const container = document.getElementById("bookmarks");
    const bookmarks = result?.bookmarks || [];

    if (bookmarks.length === 0) return;

    container.innerHTML = bookmarks.map((bm) => {
      const classLabel = bm.classification || "pending";
      const time = bm.created_at ? timeAgo(bm.created_at) : "";
      const text = (bm.tweet_text || "").slice(0, 140);

      return `
        <div class="bookmark-item" data-url="${escHtml(bm.tweet_url)}">
          <div class="bm-author">@${escHtml(bm.author_handle)}</div>
          <div class="bm-text">${escHtml(text)}</div>
          <div class="bm-meta">
            <span class="bm-class ${classLabel}">${classLabel}</span>
            <span class="bm-time">${time}</span>
          </div>
        </div>
      `;
    }).join("");

    // click to open tweet
    container.querySelectorAll(".bookmark-item").forEach((el) => {
      el.addEventListener("click", () => {
        const url = el.dataset.url;
        if (url) chrome.tabs.create({ url });
      });
      el.style.cursor = "pointer";
    });
  } catch {}
}

function timeAgo(ts) {
  const seconds = Math.floor(Date.now() / 1000) - ts;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function escHtml(s) {
  const d = document.createElement("span");
  d.textContent = s || "";
  return d.innerHTML;
}

init();
