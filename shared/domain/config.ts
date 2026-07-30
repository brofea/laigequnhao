import { z } from "zod";

// ─── 主题配置 ────────────────────────────────────────────
export const themeConfigSchema = z.object({
  primaryColor: z.string().min(1),
  accentColor: z.string().min(1),
  defaultMode: z.enum(["light", "dark"]),
});
export type ThemeConfig = z.infer<typeof themeConfigSchema>;

// ─── 轮换配置 ────────────────────────────────────────────
const timeRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const rotationConfigSchema = z
  .object({
    timezone: z.string().min(1),
    times: z
      .array(z.string().regex(timeRegex, "HH:mm 格式"))
      .min(1)
      .refine((times) => {
        const sorted = [...times].sort();
        return times.every((t, i) => t === sorted[i]);
      }, "时间点必须升序排列")
      .refine((times) => {
        return new Set(times).size === times.length;
      }, "时间点不可重复"),
  })
  .refine(
    (data) => {
      try {
        Intl.DateTimeFormat("en", { timeZone: data.timezone });
        return true;
      } catch {
        return false;
      }
    },
    { message: "非法的 IANA 时区标识", path: ["timezone"] },
  );
export type RotationConfig = z.infer<typeof rotationConfigSchema>;

// ─── 功能开关 ────────────────────────────────────────────
//
// 二维码与群号、URL 一样始终作为公开加群方式。
// features 保留为扩展点，当前为空。
export const featuresConfigSchema = z.object({}).strict();
export type FeaturesConfig = z.infer<typeof featuresConfigSchema>;

// ─── 站点配置 ────────────────────────────────────────────
export const siteConfigSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  contactEmail: z.string().email(),
  copyright: z.string().min(1),

  theme: themeConfigSchema,
  rotation: rotationConfigSchema,
  platforms: z.array(z.string().min(1)).min(1).refine((p) => new Set(p).size === p.length, "平台名不可重复"),

  features: featuresConfigSchema,
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;
