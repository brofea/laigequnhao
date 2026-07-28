import { z } from "zod";

// ─── 群聊性质 ────────────────────────────────────────────
export const groupKindSchema = z.enum(["official", "interest"]);
export type GroupKind = z.infer<typeof groupKindSchema>;

// ─── 业务状态 ────────────────────────────────────────────
export const groupStatusSchema = z.enum(["pending", "published", "rejected", "delisted"]);
export type GroupStatus = z.infer<typeof groupStatusSchema>;

// ─── 加群方式 ────────────────────────────────────────────
export const joinMethodSchema = z.enum(["group_number", "url", "qr_code"]);
export type JoinMethod = z.infer<typeof joinMethodSchema>;

// ─── 资源用途 ────────────────────────────────────────────
export const assetPurposeSchema = z.enum(["logo", "qr_code"]);
export type AssetPurpose = z.infer<typeof assetPurposeSchema>;
