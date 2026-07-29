-- Migration: 添加 mutation_token 列用于单 batch 原子聚合更新
-- 
-- mutation_token 是一次性随机 UUID，仅在当前 batch 内有效。
-- 第一条语句写入，最后一条语句清空。
-- 不进入任何公开或管理员 DTO。

ALTER TABLE groups ADD COLUMN mutation_token TEXT;
