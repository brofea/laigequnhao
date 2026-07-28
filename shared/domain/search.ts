// ─── 搜索 query 归一化 ──────────────────────────────────
//
// 主页（公开列表）和管理端使用同一函数处理搜索输入，
// 保证标题、简介、标签的匹配语义一致。

/**
 * 对搜索输入做归一化处理：
 * - 去除首尾空白
 * - 空字符串/仅空白 → null
 * - 保留中文原文（不做转换），拉丁字母转为小写
 *
 * 调用方负责把归一化后的结果拼入 SQL LIKE 的 % 通配符中。
 */
export function normalizeSearchQuery(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // 拉丁部分转小写，中文等 Unicode 保持原文
  return trimmed.toLocaleLowerCase("en");
}
