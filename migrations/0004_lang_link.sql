-- 語学アプリ（90日フランス語・中国語）との連動
-- link_source: 'lang:fr' | 'lang:zh' | NULL（習慣 → 学習した日に ✓、プロジェクト → クリアした Day 数 ÷ 90 を進捗に）
ALTER TABLE goals ADD COLUMN link_source TEXT;
ALTER TABLE user_settings ADD COLUMN lang_sync_at TEXT;
ALTER TABLE user_settings ADD COLUMN lang_sync_error TEXT;
