(() => {
  if (window.__bookmarkAgentInjected) return;
  window.__bookmarkAgentInjected = true;

  console.log("[bookmark-agent] content script loaded on", window.location.href);

  // track last captured URL to avoid duplicates
  let lastCapturedUrl = null;
  let lastCapturedTime = 0;

  // strategy 1: listen for custom event from main world intercept script
  window.addEventListener("__bma_bookmark", () => {
    console.log("[bookmark-agent] received bookmark event from intercept");
    setTimeout(() => captureBookmarkedTweet(), 300);
  });

  // strategy 2: click listener on bookmark buttons as fallback
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-testid="bookmark"]');
    if (btn) {
      console.log("[bookmark-agent] bookmark button click detected");
      setTimeout(() => captureBookmarkedTweet(btn), 500);
    }
  }, true);

  function safeSendMessage(msg) {
    try {
      chrome.runtime.sendMessage(msg);
    } catch (err) {
      if (err.message?.includes("Extension context invalidated")) {
        // extension was reloaded - store in sessionStorage for retry after page refresh
        console.warn("[bookmark-agent] extension reloaded, queuing bookmark for retry");
        const queue = JSON.parse(sessionStorage.getItem("__bma_queue") || "[]");
        queue.push(msg.data);
        sessionStorage.setItem("__bma_queue", JSON.stringify(queue));
        // also visually notify the user
        showFallbackToast("extension reloaded - refresh page (Cmd+R) to send");
      } else {
        throw err;
      }
    }
  }

  // on load, check if there are queued bookmarks from before a page refresh
  try {
    const queue = JSON.parse(sessionStorage.getItem("__bma_queue") || "[]");
    if (queue.length > 0) {
      sessionStorage.removeItem("__bma_queue");
      queue.forEach((data) => {
        console.log("[bookmark-agent] sending queued bookmark:", data.tweet_url);
        chrome.runtime.sendMessage({ action: "bookmarkCaptured", data });
      });
    }
  } catch {}

  function captureBookmarkedTweet(clickedBtn) {
    try {
      let article;

      if (clickedBtn) {
        article = clickedBtn.closest('article[data-testid="tweet"]');
      }

      // if no article from button, try finding the tweet in view
      if (!article) {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        if (articles.length > 0) {
          // on detail page, first article is the main tweet
          // on timeline, find the one closest to viewport center
          if (window.location.pathname.match(/\/status\/\d+/)) {
            article = articles[0];
          } else {
            article = findMostVisibleArticle(articles);
          }
        }
      }

      if (!article) {
        console.log("[bookmark-agent] no tweet article found");
        return;
      }

      const data = extractTweetData(article);
      if (!data || !data.tweet_url) {
        console.log("[bookmark-agent] could not extract tweet data");
        return;
      }

      // dedupe: skip if same tweet captured in last 3 seconds
      if (data.tweet_url === lastCapturedUrl && Date.now() - lastCapturedTime < 3000) {
        console.log("[bookmark-agent] duplicate, skipping");
        return;
      }
      lastCapturedUrl = data.tweet_url;
      lastCapturedTime = Date.now();

      console.log("[bookmark-agent] sending bookmark:", data.tweet_url);

      safeSendMessage({ action: "bookmarkCaptured", data });
    } catch (err) {
      console.error("[bookmark-agent] capture error:", err);
    }
  }

  function findMostVisibleArticle(articles) {
    const viewportCenter = window.innerHeight / 2;
    let best = null;
    let bestDist = Infinity;
    articles.forEach((a) => {
      const rect = a.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const dist = Math.abs(center - viewportCenter);
      if (dist < bestDist) {
        bestDist = dist;
        best = a;
      }
    });
    return best;
  }

  function extractTweetData(article) {
    // tweet URL from the timestamp link
    let tweetUrl = "";
    const timeEl = article.querySelector("time[datetime]");
    if (timeEl) {
      const link = timeEl.closest("a");
      if (link) {
        tweetUrl = link.href;
      }
    }

    // if on a tweet detail page, use the current URL
    if (!tweetUrl && window.location.pathname.match(/\/status\/\d+/)) {
      tweetUrl = window.location.href;
    }

    if (!tweetUrl) return null;

    // clean the URL (remove query params)
    try {
      const u = new URL(tweetUrl);
      tweetUrl = u.origin + u.pathname;
    } catch {}

    // tweet text - get all text content including thread context
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const tweetText = textEl ? textEl.innerText : "";

    // author handle from the tweet URL
    const urlParts = tweetUrl.split("/");
    const authorHandle = urlParts[3] || "";

    // timestamp
    const timestamp = timeEl ? timeEl.getAttribute("datetime") : new Date().toISOString();

    // images
    const images = [];
    article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach((img) => {
      if (img.src && img.src.includes("pbs.twimg.com")) {
        images.push(img.src);
      }
    });

    // links in tweet text (external only)
    const links = [];
    const seenHrefs = new Set();
    if (textEl) {
      textEl.querySelectorAll("a").forEach((a) => {
        const href = a.href;
        if (href && !href.includes("x.com/") && !href.includes("twitter.com/") && !seenHrefs.has(href)) {
          seenHrefs.add(href);
          links.push({ display: a.textContent, href });
        }
      });
    }

    // card links (article previews, embedded links)
    article.querySelectorAll('[data-testid="card.wrapper"] a, [data-testid="card.layoutLarge.media"] a').forEach((a) => {
      if (a.href && !a.href.includes("x.com/") && !a.href.includes("twitter.com/") && !seenHrefs.has(a.href)) {
        seenHrefs.add(a.href);
        links.push({ display: a.textContent || a.href, href: a.href });
      }
    });

    // also grab any t.co links that might be article URLs
    article.querySelectorAll('a[href*="t.co"]').forEach((a) => {
      if (!seenHrefs.has(a.href)) {
        seenHrefs.add(a.href);
        // t.co links that aren't internal x.com links are external
        const display = a.textContent || "";
        if (display && !display.includes("x.com") && !display.includes("twitter.com") && !display.startsWith("@")) {
          links.push({ display, href: a.href });
        }
      }
    });

    // if on a thread detail page, capture thread context
    let threadContext = "";
    if (window.location.pathname.match(/\/status\/\d+/)) {
      const allArticles = document.querySelectorAll('article[data-testid="tweet"]');
      if (allArticles.length > 1) {
        // collect text from subsequent tweets in thread (same author)
        const threadParts = [];
        for (let i = 1; i < Math.min(allArticles.length, 10); i++) {
          const threadTextEl = allArticles[i].querySelector('[data-testid="tweetText"]');
          const threadTimeEl = allArticles[i].querySelector("time[datetime]");
          const threadLink = threadTimeEl?.closest("a");
          // only include if same author (it's part of the thread)
          if (threadLink && threadLink.href.includes(`/${authorHandle}/`)) {
            threadParts.push(threadTextEl?.innerText || "");
          }
        }
        if (threadParts.length > 0) {
          threadContext = threadParts.join("\n\n");
        }
      }
    }

    return {
      tweet_url: tweetUrl,
      tweet_text: tweetText,
      author_handle: authorHandle,
      timestamp,
      images,
      links,
      thread_context: threadContext || undefined,
      source: "extension"
    };
  }

  function showFallbackToast(msg) {
    const existing = document.getElementById("__bma-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "__bma-toast";
    toast.innerHTML = `
      <style>
        #__bma-toast {
          position: fixed; bottom: 20px; left: 20px; z-index: 2147483647;
          background: #0a0a0a; border: 1px solid rgba(255,180,0,0.3);
          font-family: 'SF Mono', Consolas, monospace;
          padding: 10px 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
          animation: __bma-in 0.15s ease;
          pointer-events: none;
          display: flex; align-items: center; gap: 8px;
        }
        @keyframes __bma-in { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes __bma-out { from { opacity:1 } to { opacity:0 } }
        .__bma-dot { width: 6px; height: 6px; border-radius: 50%; background: #fbbf24; }
        .__bma-msg { color: #999; font-size: 11px; }
      </style>
      <span class="__bma-dot"></span>
      <span class="__bma-msg">${msg}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = "__bma-out 0.15s ease forwards";
      setTimeout(() => toast.remove(), 150);
    }, 3000);
  }
})();
