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

  // 为 QR 加群方式解析 asset URL
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  for (const item of items) {
    for (const jm of item.joinMethods) {
      if (jm.type === "qr_code" && jm.assetId) {
        const url = await assetService.getPublicUrl(jm.assetId);
        const meta = await assetService.getPublicMeta(jm.assetId);
        if (url) {
          jm.qrCodeUrl = url;
          jm.assetUrl = url;
        }
        if (meta) {
          jm.qrCodeMeta = { width: meta.width, height: meta.height, byteLength: meta.byteLength };
        }
      }
    }
  }

  c.header("Cache-Control", "no-store");
  return c.json(
    apiSuccessSchema(adminGroupListResponseSchema).parse({
      ok: true,
      data: { items, total, nextCursor },
      requestId,
    }),
  );
});

/** GET /admin/groups/:id — 单条查询（版本冲突重载等场景） */
adminGroupsRoute.get(
  "/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}",
  async (c) => {
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

    const repo = createGroupRepository(c.env.DB);
    const dto = await repo.getById(id);
    if (!dto) {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: { code: "NOT_FOUND", message: "群聊不存在。" },
          requestId,
        }),
        404,
      );
    }

    // 为 QR 加群方式解析 asset URL
    const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
    for (const jm of dto.joinMethods) {
      if (jm.type === "qr_code" && jm.assetId) {
        const url = await assetService.getPublicUrl(jm.assetId);
        const meta = await assetService.getPublicMeta(jm.assetId);
        if (url) {
          jm.qrCodeUrl = url;
          jm.assetUrl = url;
        }
        if (meta) {
          jm.qrCodeMeta = {
            width: meta.width,
            height: meta.height,
            byteLength: meta.byteLength,
          };
        }
      }
    }

    c.header("Cache-Control", "no-store");
    return c.json(apiSuccessSchema(adminGroupDtoSchema).parse({ ok: true, data: dto, requestId }));
  },
);

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

  // 收集需要 adopt 的 staged asset（仅 staged；ready 由 diff 逻辑处理 ref_count）
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const allQrAssetIds = input.joinMethods
    .filter((m) => m.type === "qr_code")
    .map((m) => (m as { assetId: string }).assetId);
  const adoptAssetIds: string[] = [];

  // 验证所有 asset 存在且可用
  for (const assetId of allQrAssetIds) {
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
    if (asset.status !== "staged") {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "二维码资源不可用。",
            fieldErrors: {
              joinMethods: [
                `Asset "${assetId}" 状态为 ${asset.status}，仅 staged 资源可用于创建。`,
              ],
            },
          },
          requestId,
        }),
        400,
      );
    }
    adoptAssetIds.push(assetId);
  }

  // 创建群聊（含 asset adoption，全部原子执行）
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
    adoptAssetIds: adoptAssetIds.length > 0 ? adoptAssetIds : undefined,
  });

  c.header("Cache-Control", "no-store");
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

  // 拒绝编辑已软删除的群聊
  const existing = await repo.getById(id);
  if (!existing) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "群聊不存在。" },
        requestId,
      }),
      404,
    );
  }
  if (existing.deletedAt) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "STATE_CONFLICT",
          message: "已删除的群聊无法编辑。请先恢复。",
        },
        requestId,
      }),
      409,
    );
  }

  // 平台校验（如果提供了 platform；joinMethods 兼容性检查需要 platform）
  const config = (await import("../../../site.config")).default as SiteConfig;
  const effectivePlatform = input.platform ?? existing.platform;
  const platformConfig = config.platforms.find((p) => p.id === effectivePlatform);

  if (input.platform && !platformConfig) {
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

  // 平台兼容检查：无论 joinMethods 是否提交，都需校验与 effectivePlatform 的兼容性
  if (platformConfig) {
    const methodsToCheck = input.joinMethods ?? (existing.joinMethods as { type: string }[]);
    if (methodsToCheck.length > 0) {
      const incompatibleMethods: number[] = [];
      for (let i = 0; i < methodsToCheck.length; i++) {
        const m = methodsToCheck[i]!;
        if (
          !platformConfig.allowedJoinMethods.includes(
            m.type as (typeof platformConfig.allowedJoinMethods)[number],
          )
        ) {
          incompatibleMethods.push(i);
        }
      }
      if (incompatibleMethods.length > 0) {
        return c.json(
          apiErrorSchema.parse({
            ok: false,
            error: {
              code: "VALIDATION_FAILED",
              message: `平台 "${platformConfig.name}" 不支持当前加群方式。`,
              fieldErrors: {
                joinMethods: incompatibleMethods.map(
                  (i) =>
                    `第 ${i + 1} 个加群方式类型 "${methodsToCheck[i]!.type}" 不兼容平台 "${platformConfig.name}"`,
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

  // 收集 qr_code asset IDs，区分 staged（需 adopt）和 ready（diff 处理 ref_count）
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const allPatchQrAssetIds = input.joinMethods
    ? input.joinMethods
        .filter((m) => m.type === "qr_code")
        .map((m) => (m as { assetId: string }).assetId)
    : [];
  const patchAdoptAssetIds: string[] = [];

  // 验证所有 asset 存在
  for (const assetId of allPatchQrAssetIds) {
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
    if (asset.status !== "staged" && asset.status !== "ready") {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "二维码资源不可用。",
            fieldErrors: {
              joinMethods: [`Asset "${assetId}" 状态为 ${asset.status}，不可用于编辑。`],
            },
          },
          requestId,
        }),
        400,
      );
    }
    if (asset.status === "staged") {
      patchAdoptAssetIds.push(assetId);
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
    adoptAssetIds: patchAdoptAssetIds.length > 0 ? patchAdoptAssetIds : undefined,
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

  // 清理因 joinMethods 移除而变成 delete_pending 的孤儿 asset
  if (input.joinMethods) {
    const orphanAssets = await c.env.DB.prepare(
      "SELECT id FROM assets WHERE status = 'delete_pending' AND id NOT IN (SELECT DISTINCT asset_id FROM join_methods WHERE asset_id IS NOT NULL)",
    ).all<{ id: string }>();
    for (const a of orphanAssets.results) {
      try {
        await assetService.deleteIfUnreferenced(a.id);
      } catch {
        /* 单独失败不阻塞 */
      }
    }
  }

  c.header("Cache-Control", "no-store");
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

/** DELETE /admin/trash/groups/:id — 永久删除（单次调用完成完整状态机） */
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

  // 循环推进状态机直到 DONE 或错误
  for (let i = 0; i < 10; i++) {
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
      // 刚进入 pending，继续循环执行下一步
      continue;
    }

    if (step.action === "R2_CLEANUP") {
      // 清理二维码 R2 对象 + 标记 delete_pending
      let qrCleanupOk = true;
      for (const assetId of step.qrAssetIds) {
        try {
          // 获取 r2_key 并删除 R2 对象
          const asset = await assetService.getById(assetId);
          if (asset) {
            // R2.delete() 幂等（对象不存在不抛异常）；网络错误会进入外层 catch
            await r2Adapter.delete(asset.r2Key);
            // 标记 asset 为 delete_pending（join_methods 删除后由清理任务回收 D1 行）
            await c.env.DB.prepare(
              "UPDATE assets SET status = 'delete_pending', ref_count = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
            )
              .bind(assetId)
              .run();
          }
        } catch {
          qrCleanupOk = false;
        }
      }

      // Logo：吞掉"对象不存在"错误
      let logoCleanupOk = true;
      if (step.logoR2Key) {
        try {
          await r2Adapter.delete(step.logoR2Key);
        } catch {
          // 仅对象不存在（404）视为成功
          logoCleanupOk = false;
        }
      }

      if (!qrCleanupOk || !logoCleanupOk) {
        await repo.markR2PurgeFailed(
          id,
          "R2_CLEANUP_FAILED",
          "Some R2 objects could not be deleted.",
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

      await repo.markR2PurgeDone(id);
      continue;
    }

    if (step.action === "DONE") {
      c.header("Cache-Control", "no-store");
      return c.json({ ok: true, data: { id, purgeState: "done" }, requestId });
    }
  }

  // 循环极限：不应该到达这里
  return c.json(
    apiErrorSchema.parse({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Purge state machine exceeded max iterations." },
      requestId,
    }),
    500,
  );
});
