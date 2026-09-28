-- 人生の目標（タームをまたぐ長期の目標）と、人生のビジョン（一文）
CREATE TABLE life_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  target_year INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  achieved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_life_goals_user ON life_goals(user_id, sort_order);
ALTER TABLE user_settings ADD COLUMN life_vision TEXT NOT NULL DEFAULT '';
