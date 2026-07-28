import { Hono } from "hono";
import {
  adminGroupDtoSchema,
  adminGroupListQuerySchema,
  adminGroupListResponseSchema,
  groupCreateSchema,
  groupUpdateSchema,
} from "@shared/contracts/group";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createGroupRepository } from "../repositories/group-repository";
import { createAssetService } from "../services/asset-service";
import { createR2Adapter } from "../adapters/r2-adapter";
import { authRequired, csrfProtection } from "../middleware/auth";
import type { Env } from "../env";
import type { SiteConfig } from "@shared/domain";

type Vars = { requestId: string; sessionId: string };
export const adminGroupsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

// 所有路由需要认证
adminGroupsRoute.use("*", authRequired());

/** GET /admin/groups — 管理员群聊列表 */
adminGroupsRoute.get("/", async (c) => {
  const requestId = c.get("requestId");

  const parsed = {
    statuses: c.req.queries("status") ?? [],
    deleted: c.req.query("deleted") === "true",
    q: c.req.query("q") ?? undefined,
    sortBy: c.req.query("sortBy") ?? undefined,
    sortDir: (c.req.query("sortDir") as "asc" | "desc") ?? "desc",
    cursor: c.req.query("cursor") ?? null,
    limit: Number(c.req.query("limit")) || 50,
  };

  const query = adminGroupListQuerySchema.safeParse(parsed);
  if (!query.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid query.",
          fieldErrors: query.error.flatten().fieldErrors,
        },
        requestId,
      }),
      400,
    );
  }

  const repo = createGroupRepository(c.env.DB);
  const { items, total, nextCursor } = await repo.listAll({
    statuses: query.data.statuses,
    deleted: query.data.deleted,
    q: query.data.q,
    sortBy: query.data.sortBy,
    sortDir: query.data.sortDir,
    cursor: query.data.cursor,
    limit: query.data.limit,
  });

  return c.json(
    apiSuccessSchema(adminGroupListResponseSchema).parse({
      ok: true,
      data: { items, total, nextCursor },
      requestId,
    }),
  );
});

/** POST /admin/groups — 新建群聊 */
adminGroupsRoute.post("/", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const body = await c.req.json<unknown>();

  const parsed = groupCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "请求数据无效。",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        requestId,
      }),
      400,
    );
  }

  const input = parsed.data;

  // 平台校验
  const config = (await import("../../../site.config")).default as SiteConfig;
  const platformConfig = config.platforms.find((p) => p.id === input.platform);
  if (!platformConfig) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "无效的平台。",
          fieldErrors: { platform: [`平台 "${input.platform}" 不在配置中`] },
        },
        requestId,
      }),
      400,
    );
  }

  // 平台兼容性检查
  const incompatibleMethods: number[] = [];
  for (let i = 0; i < input.joinMethods.length; i++) {
    const m = input.joinMethods[i]!;
    if (!platformConfig.allowedJoinMethods.includes(m.type)) {
      incompatibleMethods.push(i);
    }
  }
  if (incompatibleMethods.length > 0) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: `平台 "${platformConfig.name}" 不支持所选加群方式。`,
          fieldErrors: {
            joinMethods: incompatibleMethods.map(
              (i) =>
                `第 ${i + 1} 个加群方式类型 "${input.joinMethods[i]!.type}" 不兼容平台 "${platformConfig.name}"`,
            ),
          },
        },
        requestId,
      }),
      400,
    );
  }

  const repo = createGroupRepository(c.env.DB);

  // 收集需要 adopt 的 staged asset（qr_code 引用）
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const qrAssetIds = input.joinMethods
    .filter((m) => m.type === "qr_code")
    .map((m) => (m as { assetId: string }).assetId);

  // 验证所有 asset 存在且为 staged
  for (const assetId of qrAssetIds) {
    const asset = await assetService.getById(assetId);
    if (!asset) {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "二维码资源不存在。",
            fieldErrors: { joinMethods: [`Asset "${assetId}" 不存在`] },
          },
          requestId,
        }),
        400,
      );
    }
    if (asset.purpose !== "qr_code") {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "资源用途不正确。",
            fieldErrors: { joinMethods: [`Asset "${assetId}" 用途不是 qr_code`] },
          },
          requestId,
        }),
        400,
      );
    }
  }

  // 创建群聊（含 asset adoption）
  const result = await repo.create({
    title: input.title,
    description: input.description,
    kind: input.kind,
    platform: input.platform,
    status: input.status,
    tags: input.tags,
    joinMethods: input.joinMethods.map((m, i) => ({
      type: m.type,
      value: m.type === "group_number" ? m.value : m.type === "url" ? m.url : undefined,
      assetId: m.type === "qr_code" ? m.assetId : undefined,
      sortOrder: i,
    })),
    auditNotes: input.auditNotes,
    logoR2Key: null,
  });

  // Adopt staged assets after successful creation
  for (const assetId of qrAssetIds) {
    try {
      await assetService.adopt(assetId);
    } catch {
      // Asset adoption failure after create: asset remains staged, cleanup will handle it
    }
  }

  return c.json(
    apiSuccessSchema(adminGroupDtoSchema).parse({ ok: true, data: result, requestId }),
    201,
  );
});

/** PATCH /admin/groups/:id — 编辑群聊 */
adminGroupsRoute.patch("/:id", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "群聊不存在。" },
        requestId,
      }),
      404,
    );
  }

  const body = await c.req.json<unknown>();
  const parsed = groupUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "请求数据无效。",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        requestId,
      }),
      400,
    );
  }

  const input = parsed.data;
  const repo = createGroupRepository(c.env.DB);

  // 平台校验（如果提供了 platform）
  if (input.platform) {
    const config = (await import("../../../site.config")).default as SiteConfig;
    const platformConfig = config.platforms.find((p) => p.id === input.platform);
    if (!platformConfig) {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "无效的平台。",
            fieldErrors: { platform: [`平台 "${input.platform}" 不在配置中`] },
          },
          requestId,
        }),
        400,
      );
    }

    // 平台兼容检查（如果提供了 joinMethods）
    if (input.joinMethods) {
      const incompatibleMethods: number[] = [];
      for (let i = 0; i < input.joinMethods.length; i++) {
        const m = input.joinMethods[i]!;
        if (!platformConfig.allowedJoinMethods.includes(m.type)) {
          incompatibleMethods.push(i);
        }
      }
      if (incompatibleMethods.length > 0) {
        return c.json(
          apiErrorSchema.parse({
            ok: false,
            error: {
              code: "VALIDATION_FAILED",
              message: `平台 "${platformConfig.name}" 不支持所选加群方式。`,
              fieldErrors: {
                joinMethods: incompatibleMethods.map(
                  (i) =>
                    `第 ${i + 1} 个加群方式类型 "${input.joinMethods![i]!.type}" 不兼容平台 "${platformConfig.name}"`,
                ),
              },
            },
            requestId,
          }),
          400,
        );
      }
    }
  }

  // 收集 qr_code asset IDs（用于 adopt）
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const qrAssetIds = input.joinMethods
    ? input.joinMethods
        .filter((m) => m.type === "qr_code")
        .map((m) => (m as { assetId: string }).assetId)
    : [];

  // 验证所有 asset 存在
  for (const assetId of qrAssetIds) {
    const asset = await assetService.getById(assetId);
    if (!asset) {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "二维码资源不存在。",
            fieldErrors: { joinMethods: [`Asset "${assetId}" 不存在`] },
          },
          requestId,
        }),
        400,
      );
    }
    if (asset.purpose !== "qr_code") {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "资源用途不正确。",
            fieldErrors: { joinMethods: [`Asset "${assetId}" 用途不是 qr_code`] },
          },
          requestId,
        }),
        400,
      );
    }
  }

  const result = await repo.update(id, {
    title: input.title,
    description: input.description,
    kind: input.kind,
    platform: input.platform,
    status: input.status,
    tags: input.tags,
    joinMethods: input.joinMethods?.map((m, i) => ({
      type: m.type,
      value: m.type === "group_number" ? m.value : m.type === "url" ? m.url : undefined,
      assetId: m.type === "qr_code" ? m.assetId : undefined,
      sortOrder: i,
    })),
    auditNotes: input.auditNotes,
    version: input.version,
    adoptAssetIds: qrAssetIds.length > 0 ? qrAssetIds : undefined,
  });

  if (result.versionConflict) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VERSION_CONFLICT",
          message: "群聊已被其他会话修改，请刷新后重试。",
        },
        requestId,
      }),
      409,
    );
  }

  if (!result.dto) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "群聊不存在。" },
        requestId,
      }),
      404,
    );
  }

  return c.json(
    apiSuccessSchema(adminGroupDtoSchema).parse({ ok: true, data: result.dto, requestId }),
  );
});

/** DELETE /admin/groups/:id — 软删除 */
adminGroupsRoute.delete("/:id", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "Group not found." },
        requestId,
      }),
      404,
    );
  }

  const repo = createGroupRepository(c.env.DB);
  await repo.softDelete(id);

  return c.json({ ok: true, data: { id }, requestId });
});

/** POST /admin/groups/:id/restore — 恢复 */
adminGroupsRoute.post("/:id/restore", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "Group not found." },
        requestId,
      }),
      404,
    );
  }

  const repo = createGroupRepository(c.env.DB);
  const result = await repo.restore(id);
  if (!result) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "Group not found or not deleted." },
        requestId,
      }),
      404,
    );
  }

  return c.json(apiSuccessSchema(adminGroupDtoSchema).parse({ ok: true, data: result, requestId }));
});

/** DELETE /admin/trash/groups/:id — 永久删除（状态机，可重试） */
adminGroupsRoute.delete("/trash/groups/:id", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "Group not found." },
        requestId,
      }),
      404,
    );
  }

  const repo = createGroupRepository(c.env.DB);
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const r2Adapter = createR2Adapter(c.env.R2, c.env);

  // 执行状态机步骤
  const step = await repo.permanentDelete(id);

  if (step.action === "STATE_CONFLICT") {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "STATE_CONFLICT",
          message: "Group must be soft-deleted before permanent deletion.",
        },
        requestId,
      }),
      409,
    );
  }

  if (step.action === "STARTED") {
    return c.json({
      ok: true,
      data: { id, purgeState: "pending", nextAction: "R2_CLEANUP" },
      requestId,
    });
  }

  if (step.action === "R2_CLEANUP") {
    // 清理 Logo R2 对象
    if (step.logoR2Key) {
      try {
        await r2Adapter.delete(step.logoR2Key);
      } catch {
        // 对象不存在 = 成功
      }
    }

    // 清理二维码 R2 对象
    for (const assetId of step.qrAssetIds) {
      try {
        await assetService.deleteIfUnreferenced(assetId);
      } catch {
        await repo.markR2PurgeFailed(
          id,
          "R2_DELETE_FAILED",
          `Failed to delete QR asset ${assetId}`,
        );
        return c.json(
          apiErrorSchema.parse({
            ok: false,
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              message: "R2 cleanup partially failed. Retry.",
            },
            requestId,
          }),
          502,
        );
      }
    }

    await repo.markR2PurgeDone(id);

    return c.json({
      ok: true,
      data: { id, purgeState: "r2_done", nextAction: "D1_BATCH" },
      requestId,
    });
  }

  if (step.action === "DONE") {
    return c.json({ ok: true, data: { id, purgeState: "done" }, requestId });
  }

  return c.json(
    apiErrorSchema.parse({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Unknown purge state." },
      requestId,
    }),
    500,
  );
});
