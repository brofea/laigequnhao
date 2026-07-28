-- 0002_admin_group_management.sql
-- 资源管理、二维码引用与可重试永久清理
-- 覆盖从 0001_initial 升级，不修改已应用的 migration

-- ─── 资源表 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id                   TEXT PRIMARY KEY,
  r2_key               TEXT NOT NULL,
  purpose              TEXT NOT NULL CHECK (purpose IN ('logo', 'qr_code')),
  content_type         TEXT NOT NULL DEFAULT 'image/webp',
  byte_length          INTEGER NOT NULL,
  width                INTEGER NOT NULL,
  height               INTEGER NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('staged', 'ready', 'delete_pending', 'delete_failed')) DEFAULT 'staged',
  ref_count            INTEGER NOT NULL DEFAULT 0,
  delete_attempts      INTEGER NOT NULL DEFAULT 0,
  delete_last_error    TEXT,
  delete_last_error_code TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_assets_status ON assets (status);
CREATE INDEX IF NOT EXISTS idx_assets_purpose ON assets (purpose);
CREATE INDEX IF NOT EXISTS idx_assets_r2_key ON assets (r2_key);

-- ─── 加群方式 → 资源引用 ─────────────────────────────────
-- 为 qr_code 类型的 join_methods 关联 asset
ALTER TABLE join_methods ADD COLUMN asset_id TEXT REFERENCES assets(id);
CREATE INDEX IF NOT EXISTS idx_join_methods_asset ON join_methods (asset_id);

-- ─── 群聊永久清理可重试字段 ──────────────────────────────
-- groups 表已有 purge_state 和 purge_started_at（来自 0001），
-- 补齐 attempts 和安全错误码
ALTER TABLE groups ADD COLUMN purge_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE groups ADD COLUMN purge_last_error_code TEXT;
