CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  api_key_hash TEXT NOT NULL,
  telegram_chat_id TEXT,
  agent_type TEXT DEFAULT 'hosted',
  agent_url TEXT,
  agent_token TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tweet_url TEXT NOT NULL,
  tweet_text TEXT,
  author_handle TEXT,
  images TEXT,
  links TEXT,
  source TEXT DEFAULT 'extension',
  classification TEXT,
  summary TEXT,
  article_title TEXT,
  article_content TEXT,
  key_insights TEXT,
  action_items TEXT,
  topics TEXT,
  agent_status TEXT DEFAULT 'pending',
  agent_result TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_user_tweet ON bookmarks(user_id, tweet_url);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_status ON bookmarks(agent_status);
CREATE INDEX IF NOT EXISTS idx_bookmarks_classification ON bookmarks(classification);
