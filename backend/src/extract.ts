// extract article content from linked URLs in bookmarks

const T_CO_PATTERN = /^https?:\/\/t\.co\//;
const MAX_CONTENT_LENGTH = 5000;

export async function extractArticleContent(
  links: Array<{ display: string; href: string }>
): Promise<{ title: string; content: string } | null> {
  if (!links || links.length === 0) return null;

  // try each link until one works
  for (const link of links) {
    let url = link.href;
    if (!url) continue;

    try {
      // resolve t.co redirects
      if (T_CO_PATTERN.test(url)) {
        const resolved = await resolveRedirect(url);
        if (resolved) url = resolved;
      }

      // skip x.com/twitter links - those are just tweet references
      if (/x\.com|twitter\.com/.test(url)) continue;

      // skip image/video/pdf URLs
      if (/\.(png|jpg|jpeg|gif|webp|mp4|webm|pdf)(\?|$)/i.test(url)) continue;

      const result = await fetchAndExtract(url);
      if (result && result.content.length > 100) {
        return result;
      }
    } catch (e) {
      console.error(`[extract] failed for ${url}:`, e);
      continue;
    }
  }

  return null;
}

async function resolveRedirect(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { redirect: "follow" });
    return resp.url || null;
  } catch {
    return null;
  }
}

async function fetchAndExtract(url: string): Promise<{ title: string; content: string } | null> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BookmarkAgent/1.0)",
      "Accept": "text/html",
    },
    cf: { cacheTtl: 3600 } as any,
  });

  if (!resp.ok) return null;

  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return null;

  const html = await resp.text();
  return parseHtml(html);
}

function parseHtml(html: string): { title: string; content: string } {
  // extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : "";

  // try structured content extraction in priority order
  let content = "";

  // 1. try <article> tag
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    content = extractText(articleMatch[1]);
  }

  // 2. try <main> tag
  if (!content || content.length < 100) {
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      content = extractText(mainMatch[1]);
    }
  }

  // 3. try meta description + all <p> tags
  if (!content || content.length < 100) {
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    const pText = paragraphs.map((p) => extractText(p)).filter((t) => t.length > 30).join("\n\n");
    content = metaDesc ? `${decodeEntities(metaDesc[1])}\n\n${pText}` : pText;
  }

  // cap content length
  if (content.length > MAX_CONTENT_LENGTH) {
    content = content.slice(0, MAX_CONTENT_LENGTH) + "...";
  }

  return { title, content };
}

function extractText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
