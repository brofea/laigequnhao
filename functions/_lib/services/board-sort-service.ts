/** 每小时稳定随机排序 — 唯一服务端实现（RPD §16.4） */
//
// 规则：
// - 同一个自然小时内顺序稳定，刷新不改变顺序
// - 下一小时形成新顺序
// - 不写数据库位置、不覆盖管理员人工位置
// - 种子 = board_id + 小时槽位 + 成员（group_id 序列）
// - 小时槽位使用站点配置时区，不依赖服务器本地时区

const HOUR_EPOCH = Date.UTC(2026, 0, 1);

/** 取站点时区的年/月/日/时 */
function zonedParts(
  timezone: string,
  now: Date,
): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

/** 站点时区的自然小时槽位序号（自纪元起的小时数） */
export function computeHourlySlot(timezone: string, now: Date = new Date()): number {
  const { year, month, day, hour } = zonedParts(timezone, now);
  return Math.floor((Date.UTC(year, month - 1, day, hour) - HOUR_EPOCH) / 3_600_000);
}

/** FNV-1a 32 位哈希 → 确定性种子 */
function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 确定性 PRNG */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 对成员序列生成稳定随机排列。
 *
 * 同一 board_id + 小时槽位 + 相同成员集合 → 相同结果；不同的成员集合
 * 产生不同结果。不修改任何保存位置。
 */
export function stableShuffle<T>(boardId: string, slot: number, items: T[]): T[] {
  const prng = mulberry32(hashSeed(`${boardId}:${slot}`));
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [result[i]!, result[j]!] = [result[j]!, result[i]!];
  }
  return result;
}
