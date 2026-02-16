import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware, handleRegister, handleLogin } from "./auth";
import { classifyAndSummarize } from "./classify";
import { extractArticleContent } from "./extract";

type Bindings = {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  ANTHROPIC_API_KEY: string;
  AUTH_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({
  origin: (origin) => origin || "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// health check
app.get("/api/health", (c) => {
  return c.json({ ok: true, service: "bookmark-agent" });
});

// auth routes
app.post("/api/auth/register", handleRegister);
app.post("/api/auth/login", handleLogin);

// protected routes
app.use("/api/bookmark", authMiddleware);
app.use("/api/bookmarks", authMiddleware);
app.use("/api/bookmarks/search", authMiddleware);
app.use("/api/bookmark/:id/reprocess", authMiddleware);
app.use("/api/agent/connect", authMiddleware);

// ingest a bookmark
app.post("/api/bookmark", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body = await c.req.json();

  let { tweet_url, tweet_text, author_handle, timestamp, images, links, source, thread_context } = body;

  if (!tweet_url) {
    return c.json({ ok: false, error: "tweet_url required" }, 400);
  }

  // if no tweet_text (mobile shortcut), try oEmbed extraction
  if (!tweet_text && tweet_url.match(/x\.com|twitter\.com/)) {
    try {
      const oembed = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweet_url)}&omit_script=true`
      );
      if (oembed.ok) {
        const data = await oembed.json() as any;
        tweet_text = (data.html || "").replace(/<[^>]+>/g, "").replace(/&mdash;.*$/, "").trim();
        author_handle = author_handle || (data.author_url || "").split("/").pop() || "";
      }
    } catch {}
  }

  const id = crypto.randomUUID();

  try {
    await c.env.DB.prepare(
      `INSERT INTO bookmarks (id, user_id, tweet_url, tweet_text, author_handle, images, links, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, userId, tweet_url, tweet_text || "", author_handle || "",
      JSON.stringify(images || []), JSON.stringify(links || []),
      source || "extension", Math.floor(Date.now() / 1000)
    ).run();
  } catch (e: any) {
    if (e.message?.includes("UNIQUE constraint")) {
      return c.json({ ok: true, duplicate: true }, 409);
    }
    throw e;
  }

  // process inline - extract, classify, embed, notify
  const result = await processBookmark({
    bookmarkId: id,
    userId,
    tweet_url,
    tweet_text: tweet_text || "",
    author_handle: author_handle || "",
    links: links || [],
    thread_context: thread_context || "",
  }, c.env);

  return c.json({ ok: true, id, ...result });
});

// list bookmarks
app.get("/api/bookmarks", async (c) => {
  const userId = c.get("userId" as never) as string;
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  const offset = parseInt(c.req.query("offset") || "0");
  const classification = c.req.query("classification");

  let query = "SELECT * FROM bookmarks WHERE user_id = ?";
  const params: any[] = [userId];

  if (classification) {
    query += " AND classification = ?";
    params.push(classification);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({ bookmarks: result.results, total: result.results.length });
});

// semantic search across bookmarks
app.get("/api/bookmarks/search", async (c) => {
  const userId = c.get("userId" as never) as string;
  const query = c.req.query("q");
  const limit = Math.min(parseInt(c.req.query("limit") || "10"), 50);

  if (!query) {
    return c.json({ ok: false, error: "q parameter required" }, 400);
  }

  // embed the search query
  const embedResult = await c.env.AI.run("@cf/baai/bge-base-en-v1.5", {
    text: [query],
  });

  const queryVector = embedResult.data[0];

  // search vectorize - try with filter first, fall back to unfiltered
  let matches = await c.env.VECTORIZE.query(queryVector, {
    topK: limit,
    filter: { userId },
    returnMetadata: "all",
  });

  // if filtered returns nothing, try unfiltered (metadata index may still be building)
  if (matches.matches.length === 0) {
    matches = await c.env.VECTORIZE.query(queryVector, {
      topK: limit,
      returnMetadata: "all",
    });
  }

  // fetch full bookmark data for matches
  if (matches.matches.length === 0) {
    return c.json({ bookmarks: [], total: 0 });
  }

  const ids = matches.matches.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(",");
  const result = await c.env.DB.prepare(
    `SELECT * FROM bookmarks WHERE id IN (${placeholders}) AND user_id = ?`
  ).bind(...ids, userId).all();

  // sort by vector similarity (preserve match order)
  const bookmarkMap = new Map(result.results.map((b: any) => [b.id, b]));
  const sorted = ids.map((id) => bookmarkMap.get(id)).filter(Boolean);

  return c.json({ bookmarks: sorted, total: sorted.length });
});

// debug: check vectorize for a bookmark
app.get("/api/debug/vectors/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const vectors = await c.env.VECTORIZE.getByIds([id]);
    return c.json({ vectors });
  } catch (e: any) {
    return c.json({ error: e.message });
  }
});

// debug: manually embed and upsert a bookmark (synchronous, returns errors)
app.post("/api/debug/embed/:id", async (c) => {
  const id = c.req.param("id");
  const bookmark = await c.env.DB.prepare("SELECT * FROM bookmarks WHERE id = ?").bind(id).first();
  if (!bookmark) return c.json({ error: "not found" }, 404);

  try {
    const textToEmbed = buildEmbeddingText(bookmark);
    const embedResult = await c.env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [textToEmbed] });

    const vector = embedResult.data[0];
    if (!vector || vector.length === 0) {
      return c.json({ error: "embedding returned empty", embedResult });
    }

    const upsertResult = await c.env.VECTORIZE.upsert([{
      id,
      values: vector,
      metadata: {
        userId: bookmark.user_id as string,
        classification: bookmark.classification as string,
        author: bookmark.author_handle as string,
        url: bookmark.tweet_url as string,
      },
    }]);

    return c.json({ ok: true, dims: vector.length, upsertResult });
  } catch (e: any) {
    return c.json({ error: e.message, stack: e.stack });
  }
});

// reprocess a bookmark (for fixing classification)
app.post("/api/bookmark/:id/reprocess", async (c) => {
  const userId = c.get("userId" as never) as string;
  const bookmarkId = c.req.param("id");

  const bookmark = await c.env.DB.prepare(
    "SELECT * FROM bookmarks WHERE id = ? AND user_id = ?"
  ).bind(bookmarkId, userId).first();

  if (!bookmark) return c.json({ ok: false, error: "not found" }, 404);

  const result = await processBookmark({
    bookmarkId,
    userId,
    tweet_url: bookmark.tweet_url as string,
    tweet_text: bookmark.tweet_text as string,
    author_handle: bookmark.author_handle as string,
    links: JSON.parse((bookmark.links as string) || "[]"),
    thread_context: "",
  }, c.env);

  return c.json({ ok: true, reprocessed: bookmarkId, ...result });
});

// connect self-hosted agent
app.post("/api/agent/connect", async (c) => {
  const userId = c.get("userId" as never) as string;
  const { agent_url, agent_token } = await c.req.json();

  await c.env.DB.prepare(
    "UPDATE users SET agent_type = 'self-hosted', agent_url = ?, agent_token = ? WHERE id = ?"
  ).bind(agent_url, agent_token, userId).run();

  return c.json({ ok: true });
});

export default app;

// ─── helpers ───────────────────────────────────────────────────

function buildEmbeddingText(bookmark: any): string {
  const parts = [bookmark.summary || ""];

  if (bookmark.article_content) {
    parts.push(bookmark.article_content);
  }

  if (bookmark.key_insights) {
    try {
      const insights = JSON.parse(bookmark.key_insights);
      if (Array.isArray(insights)) parts.push(insights.join(". "));
    } catch {}
  }

  if (bookmark.action_items) {
    try {
      const items = JSON.parse(bookmark.action_items);
      if (Array.isArray(items)) parts.push(items.join(". "));
    } catch {}
  }

  if (bookmark.topics) {
    try {
      const topics = JSON.parse(bookmark.topics);
      if (Array.isArray(topics)) parts.push(topics.join(", "));
    } catch {}
  }

  parts.push(bookmark.tweet_text || "");
  parts.push(`by @${bookmark.author_handle || ""}`);
  parts.push(bookmark.classification || "");

  return parts.filter(Boolean).join("\n\n");
}

// ─── processing pipeline ───────────────────────────────────────

async function processBookmark(data: any, env: Bindings): Promise<{ classification?: string; summary?: string }> {
  const { bookmarkId, userId, tweet_url, tweet_text, author_handle, links, thread_context } = data;

  // combine tweet + thread for richer context
  const fullText = thread_context ? `${tweet_text}\n\n[thread continues]\n${thread_context}` : tweet_text;

  try {
    // step 1: extract article content from linked URLs
    let articleTitle = "";
    let articleContent = "";

    try {
      const extracted = await extractArticleContent(links);
      if (extracted) {
        articleTitle = extracted.title;
        articleContent = extracted.content;
        console.log(`[pipeline] ${bookmarkId}: extracted article "${articleTitle}" (${articleContent.length} chars)`);
      }
    } catch (e) {
      console.error(`[pipeline] ${bookmarkId}: article extraction failed:`, e);
    }

    // step 2: classify with full context (tweet + article)
    const { classification, summary, key_insights, action_items, topics } = await classifyAndSummarize(
      fullText, author_handle, links, env.ANTHROPIC_API_KEY, articleContent || undefined
    );
    console.log(`[pipeline] ${bookmarkId}: classified as "${classification}"`);

    // step 3: update D1 with all extracted data
    await env.DB.prepare(
      `UPDATE bookmarks SET
        classification = ?,
        summary = ?,
        article_title = ?,
        article_content = ?,
        key_insights = ?,
        action_items = ?,
        topics = ?,
        agent_status = 'classified'
      WHERE id = ?`
    ).bind(
      classification,
      summary,
      articleTitle || null,
      articleContent || null,
      JSON.stringify(key_insights),
      JSON.stringify(action_items),
      JSON.stringify(topics),
      bookmarkId
    ).run();

    // step 4: embed with enriched content for better semantic search
    try {
      const textToEmbed = [
        summary,
        articleContent,
        key_insights.join(". "),
        action_items.join(". "),
        topics.join(", "),
        fullText,
        `by @${author_handle}`,
        classification,
      ].filter(Boolean).join("\n\n");

      const embedResult = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: [textToEmbed],
      });

      const vector = embedResult.data?.[0];
      if (vector && vector.length > 0) {
        await env.VECTORIZE.upsert([{
          id: bookmarkId,
          values: vector,
          metadata: {
            userId,
            classification,
            author: author_handle,
            url: tweet_url,
          },
        }]);
        console.log(`[pipeline] ${bookmarkId}: vectorized (${vector.length} dims)`);
      } else {
        console.error(`[pipeline] ${bookmarkId}: embedding returned empty`);
      }
    } catch (embedErr) {
      console.error(`[pipeline] ${bookmarkId}: vectorize failed:`, embedErr);
    }

    // step 5: send telegram notification with extracted insights
    const user = await env.DB.prepare(
      "SELECT telegram_chat_id FROM users WHERE id = ?"
    ).bind(userId).first();

    if (user?.telegram_chat_id && env.TELEGRAM_BOT_TOKEN) {
      try {
        const msg = formatTelegramMessage({
          classification,
          author_handle,
          summary,
          key_insights,
          action_items,
          tweet_url,
          article_title: articleTitle,
        });

        await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: user.telegram_chat_id,
            text: msg,
            disable_web_page_preview: true,
          }),
        });
      } catch (e) {
        console.error("telegram notification failed:", e);
      }
    }

    await env.DB.prepare(
      "UPDATE bookmarks SET agent_status = 'processed' WHERE id = ?"
    ).bind(bookmarkId).run();

    return { classification, summary };
  } catch (e) {
    console.error("bookmark processing error:", e);
    await env.DB.prepare(
      "UPDATE bookmarks SET agent_status = 'error' WHERE id = ?"
    ).bind(bookmarkId).run();
    return {};
  }
}

function formatTelegramMessage(data: {
  classification: string;
  author_handle: string;
  summary: string;
  key_insights: string[];
  action_items: string[];
  tweet_url: string;
  article_title: string;
}): string {
  const { classification, author_handle, summary, key_insights, action_items, tweet_url, article_title } = data;

  const topInsight = key_insights[0] || "";
  const topAction = action_items[0] || "";

  switch (classification) {
    case "implement":
      return [
        `implement from @${author_handle}:`,
        "",
        summary,
        topInsight ? `\nkey insight: ${topInsight}` : "",
        topAction ? `next step: ${topAction}` : "",
        "",
        tweet_url,
      ].filter(Boolean).join("\n");

    case "act":
      return [
        `ACTION NEEDED from @${author_handle}:`,
        "",
        summary,
        topAction ? `\ndo this: ${topAction}` : "",
        "",
        tweet_url,
      ].filter(Boolean).join("\n");

    case "remember":
      return [
        `@${author_handle}:`,
        "",
        summary,
        topInsight ? `\ntakeaway: ${topInsight}` : "",
        "",
        tweet_url,
      ].filter(Boolean).join("\n");

    case "remind":
      return [
        `saved for later from @${author_handle}:`,
        "",
        summary,
        "",
        tweet_url,
      ].join("\n");

    default:
      return `@${author_handle}: ${summary}\n\n${tweet_url}`;
  }
}
