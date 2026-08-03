import { z } from "zod";

// ─── 公开运行配置 ────────────────────────────────────────
// 前端展示所需的非敏感配置（限流数量等），无鉴权可读。

export const publicConfigSchema = z.object({
  /** 单个 IP/设备每小时可提交新群组的数量 */
  submissionLimitPerHour: z.number().int().positive(),
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;
