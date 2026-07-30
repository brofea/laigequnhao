/** 管理端状态排序权重（待审核→已发布→已下架→已拒绝） */
export const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  published: 1,
  delisted: 2,
  rejected: 3,
};

/** 筛选按钮渲染顺序 */
export const STATUS_FILTER_ORDER = ["pending", "published", "delisted", "rejected"] as const;
