import type { TagStats } from "@shared/contracts/tags";

/** 标签聚合查询：单次聚合，只统计已发布群组（RPD §14.1、§14.5） */
export function createTagRepository(db: D1Database) {
  return {
    /** 已发布群组的标签计数，按 count DESC, tag ASC 稳定排序 */
    async aggregatePublished(): Promise<TagStats[]> {
      const rows = await db
        .prepare(
          `SELECT gt.tag AS tag, COUNT(*) AS count
           FROM group_tags gt
           JOIN groups g ON g.id = gt.group_id
           WHERE g.status = 'published' AND g.deleted_at IS NULL
           GROUP BY gt.tag COLLATE NOCASE
           ORDER BY count DESC, gt.tag COLLATE NOCASE ASC`,
        )
        .all<{ tag: string; count: number }>();
      return rows.results.map((r) => ({ tag: r.tag, count: r.count }));
    },
  };
}

export type TagRepository = ReturnType<typeof createTagRepository>;
