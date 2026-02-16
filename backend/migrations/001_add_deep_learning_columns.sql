-- migration: add deep learning pipeline columns
-- run with: npx wrangler d1 execute bookmark-agent --file=migrations/001_add_deep_learning_columns.sql --remote

ALTER TABLE bookmarks ADD COLUMN article_title TEXT;
ALTER TABLE bookmarks ADD COLUMN article_content TEXT;
ALTER TABLE bookmarks ADD COLUMN key_insights TEXT;
ALTER TABLE bookmarks ADD COLUMN action_items TEXT;
ALTER TABLE bookmarks ADD COLUMN topics TEXT;

CREATE INDEX IF NOT EXISTS idx_bookmarks_classification ON bookmarks(classification);
