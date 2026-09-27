-- A. 数値目標（開始値・現在値・目標値と単位）
ALTER TABLE goals ADD COLUMN metric_unit TEXT;
ALTER TABLE goals ADD COLUMN metric_start REAL;
ALTER TABLE goals ADD COLUMN metric_current REAL;
ALTER TABLE goals ADD COLUMN metric_target REAL;
-- B. 大きな障害と対策
ALTER TABLE goals ADD COLUMN obstacle TEXT;
ALTER TABLE goals ADD COLUMN obstacle_plan TEXT;
-- C. やるべきこと（must）と、時間があればやること（might）
ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'must';
CREATE INDEX idx_tasks_kind ON tasks(user_id, kind, date);
