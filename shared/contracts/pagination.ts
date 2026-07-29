import { z } from "zod";

// ─── 列表查询参数 ────────────────────────────────────────

export const listQuerySchema = z.object({
  q: z.string().optional(),
  cursor: z.string().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

// ─── 游标分页 ────────────────────────────────────────────

export const cursorPageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    rotationWindow: z.string(),
  });

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  rotationWindow: string;
};

/** 将包含中文等 Unicode 内容的游标编码为 URL-safe Base64。 */
export function encodeCursor(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

/** 解码 encodeCursor 生成的游标；格式错误时抛出，由调用方决定回退策略。 */
export function decodeCursor(cursor: string): unknown {
  const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
