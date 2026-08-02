// ─── 显示宽度计算 ────────────────────────────────────────
//
// 前后端共享的唯一实现（RPD §9.1、§26.1）：禁止在客户端或服务端
// 各自复制近似算法。规则：
// - ASCII 与半角拉丁字符：1 个宽度单位
// - 中文、日文、韩文和全角字符：2 个宽度单位
// - 单个 Emoji 字素簇：2 个宽度单位
// - 组合 Emoji（ZWJ、修饰符）按一个可见字素簇计算
// - 带重音的拉丁字母按基础字符宽度（1）计算
// - 前后空格由提交方在写入前 trim（RPD §9.4）
// - 换行符计 2 个宽度单位，防止通过大量换行绕过限制

export const TITLE_MAX_WIDTH = 50;
export const DESCRIPTION_MAX_WIDTH = 1000;

/** 宽（W）与全角（F）区间的 Unicode 码点范围 */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // 谚文 Jamo
  [0x2e80, 0x303e], // CJK 部首、康熙部首、CJK 符号和标点
  [0x3041, 0x33ff], // 平假名、片假名、CJK 兼容
  [0x3400, 0x4dbf], // CJK 扩展 A
  [0x4e00, 0x9fff], // CJK 统一表意文字
  [0xa000, 0xa4cf], // 彝文
  [0xa960, 0xa97f], // 谚文 Jamo 扩展 A
  [0xac00, 0xd7a3], // 谚文音节
  [0xf900, 0xfaff], // CJK 兼容表意文字
  [0xfe10, 0xfe19], // 竖排形式
  [0xfe30, 0xfe4f], // CJK 兼容形式
  [0xff00, 0xff60], // 全角形式
  [0xffe0, 0xffe6], // 全角符号
  [0x1f004, 0x1f004], // 🀄
  [0x1f0cf, 0x1f0cf], // 🃏
  [0x1f18e, 0x1f18e], // 🆎
  [0x1f191, 0x1f19a], // 🆑-🆚
  [0x1f1e6, 0x1f1ff], // 区域指示符（国旗）
  [0x1f200, 0x1f202], // 🈀-🈂
  [0x1f210, 0x1f23b], // 🈐-🈻
  [0x1f240, 0x1f248], // 🉀-🉈
  [0x1f250, 0x1f251], // 🉐🉑
  [0x1f300, 0x1f64f], // 表情符号
  [0x1f680, 0x1f6ff], // 交通与地图符号
  [0x1f900, 0x1f9ff], // 补充符号和表情
  [0x1fa70, 0x1faff], // 符号扩展 A
  [0x2600, 0x27bf], // 杂项符号与箭头（Emoji 呈现）
  [0x20000, 0x2fffd], // CJK 扩展 B-F
  [0x30000, 0x3fffd], // CJK 扩展 G
];

function isWideCodePoint(codePoint: number): boolean {
  for (const [start, end] of WIDE_RANGES) {
    if (codePoint >= start && codePoint <= end) return true;
  }
  return false;
}

/** 组合标记：重音、肤色修饰符、变体选择符等，并入前一码点组成同一字素簇 */
function isCombiningMark(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) || // 组合附加符号
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) || // 组合扩展
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) || // 组合附加符号补充
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) || // 符号组合标记
    codePoint === 0xfe0e ||
    codePoint === 0xfe0f || // 变体选择符
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) // Emoji 肤色修饰符
  );
}

/**
 * 字素簇划分。
 *
 * 不依赖 Intl.Segmenter 的 ZWJ 行为（部分运行时会把 ZWJ 序列拆开且丢弃
 * U+200D），这里按码点遍历并合并：ZWJ 连接、组合标记、成对区域指示符。
 */
function splitClusters(value: string): string[] {
  const codePoints = Array.from(value, (c) => c.codePointAt(0) ?? 0);
  const clusters: string[] = [];
  let current = "";
  let prev = 0;
  for (const code of codePoints) {
    const isRegional = code >= 0x1f1e6 && code <= 0x1f1ff;
    if (current === "") {
      current = String.fromCodePoint(code);
    } else if (code === 0x200d) {
      current += String.fromCodePoint(code); // ZWJ 并入当前簇
    } else if (prev === 0x200d) {
      current += String.fromCodePoint(code); // ZWJ 序列视为一个可见字素
    } else if (isCombiningMark(code)) {
      current += String.fromCodePoint(code);
    } else if (isRegional && prev >= 0x1f1e6 && prev <= 0x1f1ff) {
      current += String.fromCodePoint(code); // 成对区域指示符（国旗）
    } else {
      clusters.push(current);
      current = String.fromCodePoint(code);
    }
    prev = code;
  }
  if (current !== "") clusters.push(current);
  return clusters;
}

/**
 * 计算字符串的显示宽度。
 *
 * 按字素簇遍历，取簇内首个码点判定宽度：宽字符计 2，其余计 1；
 * 换行符固定计 2。空字符串返回 0。
 */
export function measureDisplayWidth(value: string): number {
  let width = 0;
  for (const segment of splitClusters(value)) {
    const first = segment.codePointAt(0) ?? 0;
    if (first === 0x0a || first === 0x0d) {
      width += 2;
    } else if (isWideCodePoint(first)) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

export type DisplayWidthValidationResult =
  { ok: true } | { ok: false; width: number; maxWidth: number };

/** 校验字符串显示宽度不超过上限；失败时返回实际宽度供表单提示。 */
export function validateDisplayWidth(
  value: string,
  maxWidth: number,
): DisplayWidthValidationResult {
  const width = measureDisplayWidth(value);
  return width <= maxWidth ? { ok: true } : { ok: false, width, maxWidth };
}
