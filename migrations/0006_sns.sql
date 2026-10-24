-- SNS風の画面（設定で切り替え）・お気に入りの日・今日の1枚
ALTER TABLE user_settings ADD COLUMN ui_style TEXT NOT NULL DEFAULT 'note';
ALTER TABLE daily_entries ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;

-- 写真はスマホ側で長辺1080pxのJPEGに縮めてから保存する（1日1枚）
CREATE TABLE day_photos (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL, -- base64（D1 とデモの両方で同じ扱いにするため）
  width INTEGER,
  height INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date)
);
