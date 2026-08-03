import { z } from "zod";
import { publicGroupDtoSchema } from "./group";

/** 发现新群最多返回条数（PRD §13.6） */
export const DISCOVER_LIMIT = 10;

export const discoverResponseSchema = z.object({
  items: z.array(publicGroupDtoSchema),
});
export type DiscoverResponse = z.infer<typeof discoverResponseSchema>;
