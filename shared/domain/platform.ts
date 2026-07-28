import { z } from "zod";
import { joinMethodSchema } from "./group";

// ─── 平台配置 ────────────────────────────────────────────
export const platformConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  allowedJoinMethods: z.array(joinMethodSchema).min(1),
});
export type PlatformConfig = z.infer<typeof platformConfigSchema>;
