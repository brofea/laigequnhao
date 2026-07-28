/** 确定性轮换算法 — 唯一服务端实现 */

const EPOCH = new Date("2026-01-01T00:00:00+08:00");

interface RotationConfig {
  timezone: string;
  times: string[];
}

export interface RotationWindow {
  ordinal: number;
  windowId: string;
  startTime: Date;
}

/**
 * 计算当前轮换窗口
 * @param config 站点轮换配置
 * @param now 当前时间（可注入用于测试）
 */
export function computeRotation(config: RotationConfig, now: Date = new Date()): RotationWindow {
  // 将当前时间转换到目标时区
  const tzString = now.toLocaleString("en-US", { timeZone: config.timezone });
  const zoned = new Date(tzString);

  // 计算从纪元到现在的完整天数
  const epochLocal = new Date(EPOCH.toLocaleString("en-US", { timeZone: config.timezone }));
  const dayDiff = Math.floor((zoned.getTime() - epochLocal.getTime()) / (24 * 60 * 60 * 1000));

  // 找到最近已到达的时间点索引
  const hours = zoned.getHours();
  const minutes = zoned.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const timeMinutes = config.times.map((t) => {
    const [h, m] = t.split(":").map(Number);
    return h! * 60 + m!;
  });

  let slotIndex = -1;
  for (let i = timeMinutes.length - 1; i >= 0; i--) {
    if (currentMinutes >= timeMinutes[i]!) {
      slotIndex = i;
      break;
    }
  }
  // 未到达任何时间点（0:00 到第一个时间点之前），属于前一天最后一个窗口
  if (slotIndex === -1) {
    slotIndex = timeMinutes.length - 1;
  }

  const ordinal = dayDiff * config.times.length + slotIndex;

  return {
    ordinal,
    windowId: `${dayDiff}-${slotIndex}`,
    startTime: zoned,
  };
}
