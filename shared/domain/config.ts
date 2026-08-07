import { z } from "zod";

// ─── 首页 Hero 配置 ─────────────────────────────────────
export const heroConfigSchema = z.object({
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
});
export type HeroConfig = z.infer<typeof heroConfigSchema>;

// ─── 公共顶栏配置 ───────────────────────────────────────
// 这些字段只描述正式前端的品牌和入口，不承载业务状态。
const imageUrlSchema = z
  .string()
  .min(1)
  .refine(
    (v) => /^(\/|https?:\/\/)/i.test(v) && /\.(png|jpe?g|svg)$/i.test(v),
    "图片地址需以 / 或 http(s):// 开头，且扩展名为 png/jpg/svg",
  );

export const headerConfigSchema = z.object({
  logoUrl: imageUrlSchema,
  brandLabel: z.string().min(1),
  githubUrl: z.string().url(),
  githubLabel: z.string().min(1),
  addGroup: z.object({
    label: z.string().min(1),
  }),
});
export type HeaderConfig = z.infer<typeof headerConfigSchema>;

// ─── 页脚配置 ────────────────────────────────────────────
export const footerConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  contactEmail: z.string().email(),
  copyright: z.string().min(1),
});
export type FooterConfig = z.infer<typeof footerConfigSchema>;

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

// ─── 板块配置 ────────────────────────────────────────────
//
// hourly_random 的小时槽位使用站点配置时区（PRD §16.4），
// 不依赖服务器本地时区。
export const boardsConfigSchema = z.object({
  timezone: z
    .string()
    .min(1)
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "非法的 IANA 时区标识", path: ["timezone"] },
    ),
});
export type BoardsConfig = z.infer<typeof boardsConfigSchema>;

// ─── 站点配置 ────────────────────────────────────────────
export const siteConfigSchema = z.object({
  title: z.string().min(1),
  faviconUrl: imageUrlSchema,

  header: headerConfigSchema,
  hero: heroConfigSchema,
  footer: footerConfigSchema,
  rotation: rotationConfigSchema,
  boards: boardsConfigSchema,
  platforms: z
    .array(z.string().min(1))
    .min(1)
    .refine((p) => new Set(p).size === p.length, "平台名不可重复"),
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;
