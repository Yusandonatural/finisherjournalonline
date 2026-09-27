-- フィニッシャージャーナル 初期スキーマ
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE google_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_enc TEXT,
  access_token TEXT,
  access_expires_at INTEGER,
  scope TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  calendar_ids_json TEXT NOT NULL DEFAULT '["primary"]',
  missed_cutoff TEXT NOT NULL DEFAULT 'midnight' -- 'midnight' | 'noon'
);

CREATE TABLE terms (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_terms_user ON terms(user_id, start_date);

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('project', 'habit')),
  title TEXT NOT NULL,
  why TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  manual_progress INTEGER,
  status TEXT NOT NULL DEFAULT 'active', -- active | achieved | missed | cancelled
  habit_frequency TEXT, -- daily | weekly | weekdays
  habit_times_per_week INTEGER,
  habit_weekdays_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_goals_term ON goals(term_id, sort_order);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_milestones_goal ON milestones(goal_id, sort_order);

CREATE TABLE habit_logs (
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (goal_id, date)
);

CREATE TABLE daily_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  focus TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  goods_json TEXT NOT NULL DEFAULT '["","",""]',
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, date)
);

-- 「今日やるべきこと」。position 1〜3 が本枠、4 以上は Notion から入ってきた別枠
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo', -- todo | done | missed | carried | dropped
  done_at TEXT,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  carried_from_id TEXT,
  carry_count INTEGER NOT NULL DEFAULT 0,
  carry_over INTEGER NOT NULL DEFAULT 0, -- 次タームへ持ち越す印
  source TEXT NOT NULL DEFAULT 'app', -- app | notion
  notion_page_id TEXT,
  notion_synced_at TEXT,
  notion_dirty INTEGER NOT NULL DEFAULT 1,
  notion_error TEXT,
  notion_snapshot TEXT, -- 最後に Notion と一致していた値（自分の書き込みの跳ね返りを無視するため）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tasks_user_date ON tasks(user_id, date);
CREATE INDEX idx_tasks_notion ON tasks(notion_page_id);
CREATE INDEX idx_tasks_dirty ON tasks(notion_dirty);

CREATE TABLE notion_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  direction TEXT NOT NULL, -- push | pull
  result TEXT NOT NULL, -- ok | error
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 週間予定・月間予定と、週間レビュー・月間レビュー
CREATE TABLE period_notes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('week', 'month')),
  start_date TEXT NOT NULL, -- 週は月曜日、月は1日
  theme TEXT NOT NULL DEFAULT '',
  targets_json TEXT NOT NULL DEFAULT '[]', -- [{ "text": "...", "done": false }]
  plan_memo TEXT NOT NULL DEFAULT '',
  review_good TEXT NOT NULL DEFAULT '',
  review_bad TEXT NOT NULL DEFAULT '',
  review_learn TEXT NOT NULL DEFAULT '',
  review_next TEXT NOT NULL DEFAULT '',
  review_score INTEGER,
  reviewed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind, start_date)
);
