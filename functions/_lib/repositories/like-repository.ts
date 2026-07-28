export function createLikeRepository(db: D1Database) {
  return {
    /** 点赞或取消点赞，返回最终状态和计数 */
    async toggleLike(params: {
      groupId: string;
      voterHash: string;
      action: "like" | "unlike";
    }): Promise<{ liked: boolean; likeCount: number }> {
      const { groupId, voterHash, action } = params;

      const batch: D1PreparedStatement[] = [];

      if (action === "like") {
        // 幂等插入（UNIQUE 约束防止重复）
        batch.push(
          db
            .prepare("INSERT OR IGNORE INTO likes (group_id, voter_hash) VALUES (?, ?)")
            .bind(groupId, voterHash),
        );
      } else {
        // 删除
        batch.push(
          db
            .prepare("DELETE FROM likes WHERE group_id = ? AND voter_hash = ?")
            .bind(groupId, voterHash),
        );
      }

      // 重新计数并原子更新缓存
      batch.push(
        db
          .prepare(
            `UPDATE groups SET like_count = (SELECT COUNT(*) FROM likes WHERE group_id = ?) WHERE id = ?`,
          )
          .bind(groupId, groupId),
      );

      await db.batch(batch);

      // 读取最终状态
      const [countRow, likedRow] = await Promise.all([
        db
          .prepare("SELECT like_count FROM groups WHERE id = ?")
          .bind(groupId)
          .first<{ like_count: number }>(),
        db
          .prepare("SELECT 1 as exists_flag FROM likes WHERE group_id = ? AND voter_hash = ?")
          .bind(groupId, voterHash)
          .first<{ exists_flag: number }>(),
      ]);

      return {
        liked: likedRow !== null,
        likeCount: countRow?.like_count ?? 0,
      };
    },
  };
}

export type LikeRepository = ReturnType<typeof createLikeRepository>;
