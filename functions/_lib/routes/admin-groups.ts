import { Hono } from "hono";
import { adminGroupDtoSchema } from "@shared/contracts/group";
import { listQuerySchema, cursorPageSchema } from "@shared/contracts/pagination";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createGroupRepository } from "../repositories/group-repository";
import { authRequired, csrfProtection } from "../middleware/auth";
import type { Env } from "../env";

type Vars = { requestId: string; sessionId: string };
export const adminGroupsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

// 所有路由需要认证
adminGroupsRoute.use("*", authRequired());

/** GET /admin/groups — 管理员群聊列表 */
adminGroupsRoute.get("/", async (c) => {
  const requestId = c.get("requestId");
  const query = listQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Invalid query." },
        requestId,
      }),
      400,
    );
  }

  const status = c.req.query("status") ?? undefined;
  const deleted = c.req.query("deleted") === "true";

  const repo = createGroupRepository(c.env.DB);
  const { items, total } = await repo.listAll({
    status,
    deleted,
    cursor: query.data.cursor ?? undefined,
    limit: query.data.limit,
  });

  const lastItem = items[items.length - 1];
  const nextCursor =
    items.length === query.data.limit && lastItem ? btoa(JSON.stringify({ k: lastItem.id })) : null;

  return c.json(
    apiSuccessSchema(cursorPageSchema(adminGroupDtoSchema)).parse({
      ok: true,
      data: { items, nextCursor, rotationWindow: "" },
      requestId,
    }),
  );
});

/** POST /admin/groups — 新建群聊 */
adminGroupsRoute.post("/", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const body = await c.req.json<unknown>();
  const parsed = adminGroupDtoSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid data.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        requestId,
      }),
      400,
    );
  }

  const repo = createGroupRepository(c.env.DB);
  const result = await repo.create({
    title: parsed.data.title ?? "",
    kind: parsed.data.kind ?? "interest",
    platform: parsed.data.platform ?? "",
    tags: parsed.data.tags ?? [],
    joinMethods:
      parsed.data.joinMethods?.map((m) => ({ type: m.type, value: m.value ?? "" })) ?? [],
  });

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
        error: { code: "NOT_FOUND", message: "Group not found." },
        requestId,
      }),
      404,
    );
  }

  const body = await c.req.json<{ version?: number } & Record<string, unknown>>();
  const version = typeof body.version === "number" ? body.version : undefined;

  const repo = createGroupRepository(c.env.DB);
  const existing = await repo.getById(id);
  if (!existing) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "Group not found." },
        requestId,
      }),
      404,
    );
  }

  if (version !== undefined && version !== existing.version) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VERSION_CONFLICT", message: "Group was modified by another session." },
        requestId,
      }),
      409,
    );
  }

  const result = await repo.update(id, body as Record<string, unknown>);
  return c.json(apiSuccessSchema(adminGroupDtoSchema).parse({ ok: true, data: result, requestId }));
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

/** DELETE /admin/trash/groups/:id — 永久删除 */
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
  await repo.permanentDelete(id);

  return c.json({ ok: true, data: { id }, requestId });
});
