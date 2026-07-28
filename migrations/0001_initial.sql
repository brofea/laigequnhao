-- 0001_initial.sql
-- 来个群号 初始数据库 schema
-- 所有主键使用 crypto.randomUUID() TEXT

-- ─── 群聊主表 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  kind            TEXT NOT NULL CHECK (kind IN ('official', 'interest')),
  platform        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'published', 'rejected', 'delisted')),
  rotation_key    TEXT NOT NULL,
  like_count      INTEGER NOT NULL DEFAULT 0,
  version         INTEGER NOT NULL DEFAULT 1,
  logo_r2_key     TEXT,
  logo_url        TEXT,
  logo_width      INTEGER,
  logo_height     INTEGER,
  logo_byte_length INTEGER,
  deleted_at      TEXT,
  purge_state     TEXT CHECK (purge_state IN ('none', 'pending', 'r2_done')),
  purge_started_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_groups_status ON groups (status);
CREATE INDEX IF NOT EXISTS idx_groups_rotation ON groups (rotation_key, id);
CREATE INDEX IF NOT EXISTS idx_groups_deleted ON groups (deleted_at);
CREATE INDEX IF NOT EXISTS idx_groups_purge ON groups (purge_state);

-- ─── 群聊标签 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_tags (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL COLLATE NOCASE,
  sort_order INTEGER NOT NULL,
  UNIQUE(group_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_group_tags_group ON group_tags (group_id);
CREATE INDEX IF NOT EXISTS idx_group_tags_tag ON group_tags (tag);

-- ─── 加群方式 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS join_methods (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('group_number', 'url', 'qr_code')),
  value      TEXT,
  sort_order INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_join_methods_group ON join_methods (group_id);

-- ─── 提交详情（仅管理员可见） ─────────────────────────────
CREATE TABLE IF NOT EXISTS submission_details (
  id       TEXT PRIMARY KEY,
  group_id TEXT NOT NULL UNIQUE REFERENCES groups(id) ON DELETE CASCADE,
  contact  TEXT,
  notes    TEXT
);

-- ─── 点赞 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS likes (
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  UNIQUE(group_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_likes_group ON likes (group_id);

-- ─── 频率限制 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
