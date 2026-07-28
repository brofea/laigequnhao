import { Hono } from "hono";
import { listQuerySchema, cursorPageSchema } from "@shared/contracts/pagination";
import { publicGroupDtoSchema } from "@shared/contracts/group";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createGroupRepository } from "../repositories/group-repository";
import { createAssetService } from "../services/asset-service";
import { computeRotation } from "../services/rotation-service";
import type { Env } from "../env";
import type { SiteConfig } from "@shared/domain";

type Vars = { requestId: string };
export const groupsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

groupsRoute.get("/", async (c) => {
  const requestId = c.get("requestId");

  // 解析查询参数
  const queryParse = listQuerySchema.safeParse(c.req.query());
  if (!queryParse.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid query parameters.",
          fieldErrors: queryParse.error.flatten().fieldErrors,
        },
        requestId,
      }),
      400,
    );
  }
  const { q, cursor, limit } = queryParse.data;

  // 轮换计算 — 从站点根目录导入配置
  const config = (await import("../../../site.config"))
    .default as import("@shared/domain").SiteConfig;
  const { ordinal, windowId } = computeRotation(config.rotation);

  // 解码游标
  let skip = 0;
  if (cursor) {
    try {
      const decoded = JSON.parse(atob(cursor)) as { o: number; q: string; n: number };
      if (decoded.o === ordinal && (decoded.q ?? "") === (q ?? "")) {
        skip = decoded.n;
      }
    } catch { /* 无效游标，从头开始 */ }
  }

  // 数据库查询
  const repo = createGroupRepository(c.env.DB);
  const { items, total } = await repo.listPublished({ q, cursor: null, limit, rotationOrdinal: ordinal, skip });

  // 解析 QR asset URL
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);

  // 过滤 → PublicGroupDto
  const publicItems = await Promise.all(
    items.map(async (admin) => {
      // 解析 join methods 中 QR 的 asset URL
      const resolvedMethods = await Promise.all(
        admin.joinMethods.map(async (m) => {
          if (m.type === "qr_code" && m.assetId) {
            const url = await assetService.getPublicUrl(m.assetId);
            const meta = await assetService.getPublicMeta(m.assetId);
            return {
              ...m,
              qrCodeUrl: url ?? m.qrCodeUrl ?? undefined,
              qrCodeMeta: meta
                ? { width: meta.width, height: meta.height, byteLength: meta.byteLength }
                : m.qrCodeMeta,
            };
          }
          return m;
        }),
      );

      // 剔除管理端字段
      const {
        submissionContact: _sc,
        auditNotes: _an,
        deletedAt: _da,
        deleteProgress: _dp,
        logoR2Key: _lk,
        version: _v,
        joinMethods: _jm,
        ...rest
      } = admin;
      return publicGroupDtoSchema.parse({ ...rest, joinMethods: resolvedMethods });
    }),
  );

  // 游标
  const newSkip = skip + items.length;
  const lastItem = items[items.length - 1];
  const nextCursor =
    items.length === limit && lastItem
      ? btoa(JSON.stringify({ o: ordinal, q: q ?? "", n: newSkip }))
      : null;

  return c.json(
    apiSuccessSchema(cursorPageSchema(publicGroupDtoSchema)).parse({
      ok: true,
      data: { items: publicItems, nextCursor, rotationWindow: windowId },
      requestId,
    }),
  );
});
