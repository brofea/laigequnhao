import { Hono } from "hono";
import {
  listQuerySchema,
  cursorPageSchema,
  decodeCursor,
  encodeCursor,
} from "@shared/contracts/pagination";
import { publicGroupDtoSchema } from "@shared/contracts/group";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createGroupRepository } from "../repositories/group-repository";
import { computeRotation } from "../services/rotation-service";
import { toPublicGroupDto } from "../services/public-group-mapper";
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
      const decoded = decodeCursor(cursor) as { o: number; q: string; n: number };
      if (decoded.o === ordinal && (decoded.q ?? "") === (q ?? "")) {
        skip = decoded.n;
      }
    } catch {
      /* 无效游标，从头开始 */
    }
  }

  // 数据库查询（公开边界：只返回 published）
  const repo = createGroupRepository(c.env.DB);
  const { items, total } = await repo.listPublished({
    q,
    cursor: null,
    limit,
    rotationOrdinal: ordinal,
    skip,
  });

  const publicItems = await Promise.all(items.map((dto) => toPublicGroupDto(dto, c.env)));

  // 游标 — 当已遍历完所有结果时终止
  const newSkip = skip + items.length;
  const lastItem = items[items.length - 1];
  const nextCursor =
    items.length === limit && newSkip < total && lastItem
      ? encodeCursor({ o: ordinal, q: q ?? "", n: newSkip })
      : null;

  return c.json(
    apiSuccessSchema(cursorPageSchema(publicGroupDtoSchema)).parse({
      ok: true,
      data: { items: publicItems, nextCursor, rotationWindow: windowId },
      requestId,
    }),
  );
});

/** GET /groups/:id — 已发布群组详情（深链接 ?group=） */
groupsRoute.get(
  "/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}",
  async (c) => {
    const requestId = c.get("requestId");
    const id = c.req.param("id");

    const repo = createGroupRepository(c.env.DB);
    const dto = await repo.getPublishedById(id);
    if (!dto) {
      // 不存在、下架、回收站、删除统一为非敏感不可用结果（RPD §19.6）
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: { code: "NOT_FOUND", message: "群聊不存在或不可公开。" },
          requestId,
        }),
        404,
      );
    }

    const publicDto = await toPublicGroupDto(dto, c.env);
    return c.json(
      apiSuccessSchema(publicGroupDtoSchema).parse({ ok: true, data: publicDto, requestId }),
    );
  },
);
