import { z } from "zod";
import { groupKindSchema } from "../domain/group";
import { ASSET_UPLOAD_REQUEST_MAX_BYTES } from "./asset";
import {
  DESCRIPTION_MAX_WIDTH,
  TITLE_MAX_WIDTH,
  measureDisplayWidth,
} from "../domain/display-width";

/**
 * 公开投稿 multipart 请求的硬上限。
 *
 * 这是请求封装（JSON、边界和单张最终文件）的上限，不是原图选择上限；
 * 最终 PNG 的用途专属上限仍由图片校验器和资源契约分别执行。
 */
export const SUBMISSION_MULTIPART_MAX_BYTES = ASSET_UPLOAD_REQUEST_MAX_BYTES;

/**
 * 公开投稿最多接收两个文件：一个 Logo（PNG）与一个二维码（JPEG）。
 * 两个文件均为可选；至少存在一个文件时才走 multipart。
 */
export const SUBMISSION_LOGO_FORM_FIELD = "logo";
export const SUBMISSION_QR_FORM_FIELD = "qr";

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
    /**
     * 二维码上传标记（图片本体走 multipart 文件，不进入 JSON）。
     * 仅传二维码（无群号/链接）也可提交，二维码本身承载群信息。
     */
    qr: z.boolean().optional(),
  })
  .refine((data) => data.groupNumber || data.url || data.qr, {
    message: "至少需要群号、HTTPS 链接或二维码",
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
