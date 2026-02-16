const SYSTEM_PROMPT = `you process bookmarked tweets/articles. given content (tweet text + optionally the full article text), classify and extract structured knowledge.

CLASSIFY into exactly one category:
- implement: tutorial, guide, code, technique, actionable building instructions, or article explaining how to do something
- remember: interesting insight, analysis, opinion, knowledge, or article with valuable perspective
- act: time-sensitive - deadline, limited offer, event, requires action soon
- remind: references a project, tool, person, or resource to check out later

EXTRACT structured knowledge:
- summary: 1-3 sentence distillation of the core value. don't restate - extract the actual insight or actionable knowledge.
- key_insights: array of specific, concrete takeaways. not vague ("interesting approach") but precise ("ERC-1155 batching saves 40% gas"). max 5.
- action_items: array of specific things to do/build/try based on this. only for implement/act types. empty array for remember/remind.
- topics: array of topic tags (lowercase, hyphenated). e.g. ["solidity", "gas-optimization", "erc-1155"]. max 5.

respond ONLY with raw JSON, no markdown, no code blocks:
{"classification":"implement","summary":"...","key_insights":["..."],"action_items":["..."],"topics":["..."]}`;

export interface ClassificationResult {
  classification: string;
  summary: string;
  key_insights: string[];
  action_items: string[];
  topics: string[];
}

export async function classifyAndSummarize(
  tweetText: string,
  authorHandle: string,
  links: Array<{ display: string; href: string }>,
  apiKey: string,
  articleContent?: string
): Promise<ClassificationResult> {
  const fallback: ClassificationResult = {
    classification: "remember",
    summary: tweetText.slice(0, 200),
    key_insights: [],
    action_items: [],
    topics: [],
  };

  if (!apiKey) return fallback;

  const linksText = links.length > 0
    ? `\nlinks: ${links.map((l) => l.href).join(", ")}`
    : "";

  const articleText = articleContent
    ? `\n\n--- article content ---\n${articleContent}`
    : "";

  const userMessage = `tweet by @${authorHandle}: "${tweetText}"${linksText}${articleText}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!resp.ok) {
      console.error("classification API error:", resp.status);
      return fallback;
    }

    const data = await resp.json() as any;
    let text = data.content?.[0]?.text?.trim();

    if (!text) {
      console.error("classification: empty response from haiku");
      return fallback;
    }

    // haiku sometimes wraps JSON in markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1].trim();

    const parsed = JSON.parse(text);
    const classification = ["implement", "remember", "act", "remind"].includes(parsed.classification)
      ? parsed.classification
      : "remember";

    return {
      classification,
      summary: parsed.summary || tweetText.slice(0, 200),
      key_insights: Array.isArray(parsed.key_insights) ? parsed.key_insights.slice(0, 5) : [],
      action_items: Array.isArray(parsed.action_items) ? parsed.action_items.slice(0, 5) : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
    };
  } catch (e) {
    console.error("classification error:", e);
    return fallback;
  }
}

// keep backward compat
export async function handleClassify(
  tweetText: string,
  links: Array<{ display: string; href: string }>,
  apiKey: string
): Promise<string> {
  const result = await classifyAndSummarize(tweetText, "", links, apiKey);
  return result.classification;
}
