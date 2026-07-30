import { z } from "zod";

// ─── 平台配置 ────────────────────────────────────────────
export const platformConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type PlatformConfig = z.infer<typeof platformConfigSchema>;
