# ios shortcut setup

## what it does

adds a "bookmark agent" option to your ios share sheet. when you share a tweet from x/twitter, it sends the URL to the backend for processing -- same pipeline as the chrome extension.

## setup instructions

1. open the shortcuts app on ios
2. create a new shortcut
3. add these actions in order:

### action 1: receive input
- accept: URLs, text
- from: share sheet

### action 2: get variable
- shortcut input

### action 3: get contents of url
- method: POST
- url: `https://bookmark-agent.YOUR-DOMAIN.workers.dev/api/bookmark`
- headers:
  - `Authorization`: `Bearer YOUR_API_KEY`
  - `Content-Type`: `application/json`
- request body (json):
  ```json
  {
    "tweet_url": "[Shortcut Input]",
    "tweet_text": "",
    "author_handle": "",
    "source": "ios-shortcut"
  }
  ```

### action 4: show notification
- title: "bookmark agent"
- body: "captured"

4. name the shortcut "bookmark agent"
5. enable "show in share sheet"

## usage

1. open a tweet in x app
2. tap share button
3. tap "bookmark agent" in the share sheet
4. done -- backend extracts tweet content server-side via oembed

## notes

- the backend will use twitter's oembed api (`publish.twitter.com/oembed?url=...`) to fetch tweet content when `tweet_text` is empty
- this means the shortcut only needs to send the URL, keeping it simple
- classification and agent processing happens identically to extension bookmarks

## alternative: telegram

if you already have openclaw with telegram set up, you can just forward tweets to your bot. the bookmark-agent skill will detect tweet URLs and process them automatically.

to forward: open tweet -> share -> telegram -> send to @simpleclaw_tk_bot
