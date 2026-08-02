import { Hono } from "hono";
import {
  adminGroupDtoSchema,
  adminGroupPageQuerySchema,
  adminGroupPageResponseSchema,
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
import type { AdminGroupDto } from "@shared/contracts/group";

type Vars = { requestId: string; sessionId: string };
export const adminGroupsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

function resolveLogoUrl(
  dto: AdminGroupDto,
  r2Adapter: ReturnType<typeof createR2Adapter>,
): AdminGroupDto {
  dto.logoUrl = dto.logoR2Key ? r2Adapter.getPublicUrl(dto.logoR2Key) : null;
  return dto;
}

// 所有路由需要认证
adminGroupsRoute.use("*", authRequired());

/** GET /admin — 管理员页码分页列表（固定每页 50 条） */
adminGroupsRoute.get("/", async (c) => {
  const requestId = c.get("requestId");

  const parsed = {
    statuses: c.req.queries("status") ?? [],
    deleted: c.req.query("deleted") === "true",
    q: c.req.query("q") ?? undefined,
    sortBy: c.req.query("sortBy") ?? undefined,
    sortDir: (c.req.query("sortDir") as "asc" | "desc") ?? "desc",
    page: c.req.query("page") ?? "1",
  };

  const query = adminGroupPageQuerySchema.safeParse(parsed);
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
  const { items, totalItems, totalPages } = await repo.listPage({
    statuses: query.data.statuses,
    deleted: query.data.deleted,
    q: query.data.q,
    sortBy: query.data.sortBy,
    sortDir: query.data.sortDir,
    page: query.data.page,
  });

  // 为 QR 加群方式解析 asset URL
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const r2Adapter = createR2Adapter(c.env.R2, c.env);
  for (const item of items) {
    resolveLogoUrl(item, r2Adapter);
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
    apiSuccessSchema(adminGroupPageResponseSchema).parse({
      ok: true,
      data: {
        items,
        page: query.data.page,
        pageSize: 50,
        totalItems,
        totalPages,
      },
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
    resolveLogoUrl(dto, createR2Adapter(c.env.R2, c.env));
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

  const repo = createGroupRepository(c.env.DB);

  // 收集需要 adopt 的 staged asset（仅 staged；ready 由 diff 逻辑处理 ref_count）
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const allQrAssetIds = input.joinMethods
    .filter((m) => m.type === "qr_code")
    .map((m) => (m as { assetId: string }).assetId)
    .filter((id) => id); // skip empty assetId
  const adoptAssetIds: string[] = [];
  let createLogo:
    | { id: string; publicUrl: string; width: number; height: number; byteLength: number }
    | undefined;

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

  if (input.logoR2Key) {
    const logoAsset = await assetService.getByR2Key(input.logoR2Key);
    if (!logoAsset || logoAsset.purpose !== "logo" || logoAsset.status !== "staged") {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "Logo 资源不可用。",
            fieldErrors: { logoR2Key: ["Logo 必须引用刚上传的 staged Logo 资源。"] },
          },
          requestId,
        }),
        400,
      );
    }
    adoptAssetIds.push(logoAsset.id);
    createLogo = logoAsset;
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
    logoR2Key: input.logoR2Key ?? null,
    logoUrl: createLogo?.publicUrl ?? null,
    logoMeta: createLogo
      ? {
          width: createLogo.width,
          height: createLogo.height,
          byteLength: createLogo.byteLength,
        }
      : null,
    adoptAssetIds: adoptAssetIds.length > 0 ? adoptAssetIds : undefined,
  });
  resolveLogoUrl(result, createR2Adapter(c.env.R2, c.env));

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

  // 收集 qr_code asset IDs，区分 staged（需 adopt）和 ready（diff 处理 ref_count）
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const allPatchQrAssetIds = input.joinMethods
    ? input.joinMethods
        .filter((m) => m.type === "qr_code")
        .map((m) => (m as { assetId: string }).assetId)
        .filter((id) => id)
    : [];
  const patchAdoptAssetIds: string[] = [];
  let patchLogoAssetId: string | null | undefined;
  let patchLogo:
    { publicUrl: string; width: number; height: number; byteLength: number } | null | undefined;

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

  if (input.logoR2Key !== undefined) {
    if (input.logoR2Key === null) {
      patchLogoAssetId = null;
      patchLogo = null;
    } else {
      const logoAsset = await assetService.getByR2Key(input.logoR2Key);
      if (
        !logoAsset ||
        logoAsset.purpose !== "logo" ||
        (logoAsset.status !== "staged" && logoAsset.status !== "ready")
      ) {
        return c.json(
          apiErrorSchema.parse({
            ok: false,
            error: {
              code: "VALIDATION_FAILED",
              message: "Logo 资源不可用。",
              fieldErrors: { logoR2Key: ["Logo 必须引用可用的 Logo 资源。"] },
            },
            requestId,
          }),
          400,
        );
      }
      patchLogoAssetId = logoAsset.id;
      patchLogo = logoAsset;
      if (logoAsset.status === "staged") patchAdoptAssetIds.push(logoAsset.id);
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
    logoR2Key: input.logoR2Key,
    logoAssetId: patchLogoAssetId,
    logoUrl: patchLogo?.publicUrl ?? null,
    logoMeta: patchLogo
      ? {
          width: patchLogo.width,
          height: patchLogo.height,
          byteLength: patchLogo.byteLength,
        }
      : null,
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
  if (input.joinMethods || input.logoR2Key !== undefined) {
    const orphanAssets = await c.env.DB.prepare(
      `SELECT id
       FROM assets
       WHERE status = 'delete_pending'
         AND id NOT IN (
           SELECT DISTINCT asset_id FROM join_methods WHERE asset_id IS NOT NULL
         )
         AND r2_key NOT IN (
           SELECT logo_r2_key FROM groups WHERE logo_r2_key IS NOT NULL
         )`,
    ).all<{ id: string }>();
    for (const a of orphanAssets.results) {
      try {
        await assetService.deleteIfUnreferenced(a.id);
      } catch {
        /* 单独失败不阻塞 */
      }
    }
  }

  resolveLogoUrl(result.dto, createR2Adapter(c.env.R2, c.env));

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

  resolveLogoUrl(result, createR2Adapter(c.env.R2, c.env));

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
          const sharedLogo = await c.env.DB.prepare(
            "SELECT 1 FROM groups WHERE logo_r2_key = ? AND id != ? LIMIT 1",
          )
            .bind(step.logoR2Key, id)
            .first();
          if (!sharedLogo) {
            await r2Adapter.delete(step.logoR2Key);
          }
        } catch {
          logoCleanupOk = false;
        }
      }

      if (!qrCleanupOk || !logoCleanupOk) {
        await repo.markR2PurgeFailed(id, "R2_CLEANUP_FAILED", "部分图片资源删除失败。");
        return c.json(
          apiErrorSchema.parse({
            ok: false,
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              message: "图片存储清理未完成，请重试。",
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
