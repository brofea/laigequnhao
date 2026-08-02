import { z } from "zod";
import { groupKindSchema } from "../domain/group";
import {
  DESCRIPTION_MAX_WIDTH,
  TITLE_MAX_WIDTH,
  measureDisplayWidth,
} from "../domain/display-width";

// ─── 访客提交请求 ────────────────────────────────────────

export const submissionRequestSchema = z
  .object({
    title: z
      .string()
      .transform((s) => s.trim())
      .pipe(
        z
          .string()
          .min(1, "标题不能为空")
          .max(100, "标题不能超过 100 个字符")
          .refine((s) => measureDisplayWidth(s) <= TITLE_MAX_WIDTH, {
            message: `标题显示宽度不能超过 ${String(TITLE_MAX_WIDTH)}`,
          }),
      ),
    kind: groupKindSchema,
    platform: z.string().min(1),
    /** 群号（纯文本） */
    groupNumber: z.string().min(1).max(50).optional(),
    /** HTTPS 加入链接 */
    url: z
      .string()
      .url()
      .refine((u) => u.startsWith("https://"), "仅允许 HTTPS 链接")
      .optional(),
    /** 标签 1–5 个 */
    tags: z.array(z.string().min(1).max(20)).min(1).max(5).optional(),
    /** 简介 */
    description: z
      .string()
      .transform((s) => s.trim())
      .pipe(
        z
          .string()
          .max(500, "简介不能超过 500 个字符")
          .refine((s) => measureDisplayWidth(s) <= DESCRIPTION_MAX_WIDTH, {
            message: `简介显示宽度不能超过 ${String(DESCRIPTION_MAX_WIDTH)}`,
          }),
      )
      .optional(),
    /** 补充说明（仅管理员可见） */
    notes: z.string().max(1000).optional(),
    /** 提交者联系方式（仅管理员可见） */
    contact: z.string().max(200).optional(),
    /** Turnstile token */
    turnstileToken: z.string().min(1),
  })
  .refine((data) => data.groupNumber || data.url, {
    message: "至少需要群号或 HTTPS 链接",
    path: ["groupNumber"],
  })
  .refine((data) => !data.url || data.url.startsWith("https://"), {
    message: "仅允许 HTTPS 链接",
    path: ["url"],
  });
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;

// ─── 提交受理回执 ────────────────────────────────────────

export const submissionReceiptSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.literal("pending"),
});
export type SubmissionReceipt = z.infer<typeof submissionReceiptSchema>;
