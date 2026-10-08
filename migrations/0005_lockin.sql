-- グレート・ロックイン（タームごとに切り替える集中モード）
-- 1年後の10倍目標、90日目の「逃げ場のない」イベント、Day 0 の環境整備
ALTER TABLE terms ADD COLUMN lockin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE terms ADD COLUMN tenx_goal TEXT NOT NULL DEFAULT '';
ALTER TABLE terms ADD COLUMN commit_title TEXT NOT NULL DEFAULT '';
ALTER TABLE terms ADD COLUMN commit_date TEXT;
ALTER TABLE terms ADD COLUMN commit_proof TEXT NOT NULL DEFAULT '';
ALTER TABLE terms ADD COLUMN setup_json TEXT NOT NULL DEFAULT '{}';

-- 毎日のルール：共通3つ（運動・瞑想・禁酒）＋ 自分で決める1〜3つ（合計6つまで）
-- unit: 'min'（分。分けて足せる）| 'check'（守れたか）
CREATE TABLE lockin_rules (
  id TEXT PRIMARY KEY,
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('common', 'custom')),
  rule_key TEXT,
  title TEXT NOT NULL,
  target_value REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'check',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_lockin_rules_term ON lockin_rules(term_id, sort_order);

CREATE TABLE lockin_logs (
  rule_id TEXT NOT NULL REFERENCES lockin_rules(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (rule_id, date)
);

-- イベント（飲み会など）の日の例外モードと、その日の進み具合（例: 原稿 3,000字）
ALTER TABLE daily_entries ADD COLUMN event_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_entries ADD COLUMN event_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE daily_entries ADD COLUMN progress_metric TEXT NOT NULL DEFAULT '';
