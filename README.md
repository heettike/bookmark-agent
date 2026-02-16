# bookmark agent

your bookmarks should work for you. not just sit in a list.

**[website](https://bookmark-agent.pages.dev)** | **[demo video](https://bookmark-agent.pages.dev/demo.mp4)**

bookmark agent intercepts your x/twitter bookmarks, reads the linked articles, extracts structured knowledge (key insights, action items, topics), and makes everything searchable by meaning. get telegram notifications with the actual takeaway, not just "you bookmarked something."

## how it works

1. **capture** - chrome extension silently intercepts bookmark clicks on x.com. no twitter api needed.
2. **extract** - backend fetches linked articles, strips html, extracts the full content.
3. **classify** - ai categorizes each bookmark: `implement` / `remember` / `act` / `remind`
4. **learn** - extracts key insights, action items, and topic tags from the full article context.
5. **search** - semantic search across all bookmarks. find a concept from an article even if the tweet just said "must read."
6. **notify** - telegram message with the distilled insight, not just a link.

## architecture

```
extension (chrome mv3) -> cloudflare workers (hono)
                            |-> d1 (sqlite)
                            |-> vectorize (embeddings)
                            |-> workers ai (bge-base-en)
                            |-> anthropic (haiku 4.5)
                            |-> telegram bot api
```

## setup

### backend

```bash
cd backend
npm install

# create d1 database
npx wrangler d1 create bookmark-agent
# copy the database_id into wrangler.toml

# create vectorize index
npx wrangler vectorize create bookmark-embeddings --dimensions=768 --metric=cosine

# run migrations
npx wrangler d1 execute bookmark-agent --file=schema.sql

# set secrets
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put AUTH_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN

# deploy
npx wrangler deploy
```

### extension

1. go to `chrome://extensions`, enable developer mode
2. click "load unpacked", select the `extension/` folder
3. click the extension icon -> settings
4. enter your backend url and api key

### register

```bash
curl -X POST https://your-worker.workers.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```

save the returned `api_key` - paste it in the extension settings.

### telegram (optional)

1. create a bot via @BotFather, get the token
2. set as `TELEGRAM_BOT_TOKEN` secret
3. get your chat id by messaging the bot and checking `/getUpdates`
4. update your user record: set `telegram_chat_id` in the d1 database

## classification

| label | meaning | agent behavior |
|-------|---------|---------------|
| `implement` | buildable technique, code pattern, tutorial | extracts action items + key technical insights |
| `remember` | valuable insight, analysis, perspective | distills the core takeaway |
| `act` | time-sensitive: deadline, event, opportunity | highlights what to do and when |
| `remind` | tool, project, person to check later | saves with topic tags for future discovery |

## cost

~$0.10/user/month at scale. no twitter api fees.

- cloudflare workers: free tier covers most usage
- d1: free tier (5GB storage, 5M reads/day)
- vectorize: free tier (5M vectors)
- haiku 4.5: ~$0.001 per bookmark classification

## license

mit
