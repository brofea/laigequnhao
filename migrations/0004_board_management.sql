-- 0004_board_management.sql
-- 来个群号 板块管理 + 发布时间
--
-- 变更：
-- 1. groups 新增 last_published_at（可为空，现有数据保持 NULL，不回填）
-- 2. 新增 boards / board_groups 及索引、外键、级联
-- 3. 幂等创建默认"自定板块"
-- 4. 显式开启外键（D1 连接级 PRAGMA）

PRAGMA foreign_keys = ON;

-- ─── 群组发布时间 ────────────────────────────────────────
ALTER TABLE groups ADD COLUMN last_published_at TEXT;
CREATE INDEX IF NOT EXISTS idx_groups_last_published ON groups (last_published_at);

-- ─── 板块 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boards (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  position   INTEGER NOT NULL,
  sort_mode  TEXT NOT NULL DEFAULT 'manual_asc'
             CHECK (sort_mode IN ('manual_asc', 'manual_desc', 'hourly_random')),
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_boards_position ON boards (position);

-- ─── 板块成员 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_groups (
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (board_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_board_groups_board_position ON board_groups (board_id, position);
CREATE INDEX IF NOT EXISTS idx_board_groups_group ON board_groups (group_id);

-- ─── 默认板块（幂等）─────────────────────────────────────
-- 使用固定 UUID 作为可审计的幂等键；只有 boards 为空时才插入。
INSERT INTO boards (id, title, is_enabled, position, sort_mode, version)
SELECT '00000000-0000-4000-8000-000000000001', '自定板块', 1, 0, 'manual_asc', 1
WHERE NOT EXISTS (SELECT 1 FROM boards);
