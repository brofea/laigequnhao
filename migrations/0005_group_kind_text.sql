-- 0005_group_kind_text.sql
-- 将 groups.kind 从旧英文枚举约束升级为可配置文本。
-- 不修改已应用 migration；Wrangler 仅执行尚未记录的 migration。

-- SQLite/D1 不支持直接删除列级 CHECK 约束，因此重建父表。
PRAGMA foreign_keys = OFF;

-- Wrangler/D1 可能在事务中执行 migration，事务内切换 foreign_keys 不会禁用
-- ON DELETE CASCADE。先把子表行放到无外键备份表，交换父表后原样写回，确保
-- 标签、加群方式、提交详情、点赞和板块成员关联不因重建父表而丢失。
CREATE TABLE _groups_child_backup_0005_group_tags AS
  SELECT id, group_id, tag, sort_order FROM group_tags;
CREATE TABLE _groups_child_backup_0005_join_methods AS
  SELECT id, group_id, type, value, sort_order, asset_id FROM join_methods;
CREATE TABLE _groups_child_backup_0005_submission_details AS
  SELECT id, group_id, contact, notes FROM submission_details;
CREATE TABLE _groups_child_backup_0005_likes AS
  SELECT group_id, voter_hash FROM likes;
CREATE TABLE _groups_child_backup_0005_board_groups AS
  SELECT board_id, group_id, position, created_at FROM board_groups;

DELETE FROM group_tags;
DELETE FROM join_methods;
DELETE FROM submission_details;
DELETE FROM likes;
DELETE FROM board_groups;

CREATE TABLE groups_new (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  kind              TEXT NOT NULL,
  platform          TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('pending', 'published', 'rejected', 'delisted')),
  rotation_key      TEXT NOT NULL,
  like_count        INTEGER NOT NULL DEFAULT 0,
  version           INTEGER NOT NULL DEFAULT 1,
  logo_r2_key       TEXT,
  logo_url          TEXT,
  logo_width        INTEGER,
  logo_height       INTEGER,
  logo_byte_length  INTEGER,
  deleted_at        TEXT,
  purge_state       TEXT CHECK (purge_state IN ('none', 'pending', 'r2_done')),
  purge_started_at  TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  purge_attempts    INTEGER NOT NULL DEFAULT 0,
  purge_last_error_code TEXT,
  mutation_token    TEXT,
  last_published_at TEXT
);

INSERT INTO groups_new (
  id, title, description, kind, platform, status, rotation_key, like_count,
  version, logo_r2_key, logo_url, logo_width, logo_height, logo_byte_length,
  deleted_at, purge_state, purge_started_at, created_at, updated_at,
  purge_attempts, purge_last_error_code, mutation_token, last_published_at
)
SELECT
  id, title, description,
  CASE kind
    WHEN 'official' THEN '官方'
    WHEN 'interest' THEN '兴趣'
    ELSE kind
  END,
  platform, status, rotation_key, like_count,
  version, logo_r2_key, logo_url, logo_width, logo_height, logo_byte_length,
  deleted_at, purge_state, purge_started_at, created_at, updated_at,
  purge_attempts, purge_last_error_code, mutation_token, last_published_at
FROM groups;

DROP TABLE groups;
ALTER TABLE groups_new RENAME TO groups;

CREATE INDEX IF NOT EXISTS idx_groups_status ON groups (status);
CREATE INDEX IF NOT EXISTS idx_groups_rotation ON groups (rotation_key, id);
CREATE INDEX IF NOT EXISTS idx_groups_deleted ON groups (deleted_at);
CREATE INDEX IF NOT EXISTS idx_groups_purge ON groups (purge_state);
CREATE INDEX IF NOT EXISTS idx_groups_last_published ON groups (last_published_at);

INSERT INTO group_tags (id, group_id, tag, sort_order)
  SELECT id, group_id, tag, sort_order FROM _groups_child_backup_0005_group_tags;
INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id)
  SELECT id, group_id, type, value, sort_order, asset_id FROM _groups_child_backup_0005_join_methods;
INSERT INTO submission_details (id, group_id, contact, notes)
  SELECT id, group_id, contact, notes FROM _groups_child_backup_0005_submission_details;
INSERT INTO likes (group_id, voter_hash)
  SELECT group_id, voter_hash FROM _groups_child_backup_0005_likes;
INSERT INTO board_groups (board_id, group_id, position, created_at)
  SELECT board_id, group_id, position, created_at FROM _groups_child_backup_0005_board_groups;

DROP TABLE _groups_child_backup_0005_group_tags;
DROP TABLE _groups_child_backup_0005_join_methods;
DROP TABLE _groups_child_backup_0005_submission_details;
DROP TABLE _groups_child_backup_0005_likes;
DROP TABLE _groups_child_backup_0005_board_groups;

PRAGMA foreign_keys = ON;
