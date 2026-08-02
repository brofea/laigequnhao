import { Hono } from "hono";
import type { Context } from "hono";
import {
  adminBoardListResponseSchema,
  boardCreateSchema,
  boardMemberAddSchema,
  boardMemberListResponseSchema,
  boardMemberMoveSchema,
  boardReorderSchema,
  boardUpdateSchema,
} from "@shared/contracts/board";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createBoardRepository } from "../repositories/board-repository";
import { authRequired, csrfProtection } from "../middleware/auth";
import type { Env } from "../env";

type Vars = { requestId: string; sessionId: string };
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;
export const adminBoardsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

// 所有路由需要认证
adminBoardsRoute.use("*", authRequired());

function notFound(c: Ctx, requestId: string, message = "板块不存在。") {
  return c.json(
    apiErrorSchema.parse({
      ok: false,
      error: { code: "NOT_FOUND", message },
      requestId,
    }),
    404,
  );
}

function stateConflict(c: Ctx, requestId: string, message: string) {
  return c.json(
    apiErrorSchema.parse({
      ok: false,
      error: { code: "STATE_CONFLICT", message },
      requestId,
    }),
    409,
  );
}

/** GET /boards — 板块列表 */
adminBoardsRoute.get("/boards", async (c) => {
  const requestId = c.get("requestId");
  const repo = createBoardRepository(c.env.DB);
  const boards = await repo.listBoards();
  c.header("Cache-Control", "no-store");
  return c.json(
    apiSuccessSchema(adminBoardListResponseSchema).parse({
      ok: true,
      data: { boards },
      requestId,
    }),
  );
});

/** GET /boards/:id/members — 板块成员列表 */
adminBoardsRoute.get(
  "/boards/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/members",
  async (c) => {
    const requestId = c.get("requestId");
    const id = c.req.param("id");
    const repo = createBoardRepository(c.env.DB);
    const board = await repo.getBoard(id);
    if (!board) return notFound(c, requestId);
    const members = await repo.listMembers(id);
    c.header("Cache-Control", "no-store");
    return c.json(
      apiSuccessSchema(boardMemberListResponseSchema).parse({
        ok: true,
        data: { members },
        requestId,
      }),
    );
  },
);

/** POST /boards — 创建板块 */
adminBoardsRoute.post("/boards", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const body = await c.req.json<unknown>();
  const parsed = boardCreateSchema.safeParse(body);
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

  const repo = createBoardRepository(c.env.DB);
  const board = await repo.createBoard({ title: parsed.data.title });
  c.header("Cache-Control", "no-store");
  return c.json(
    apiSuccessSchema(adminBoardListResponseSchema).parse({
      ok: true,
      data: { boards: await repo.listBoards() },
      requestId,
    }),
    201,
  );
});

/** PATCH /boards/:id — 编辑标题/启停/排序模式 */
adminBoardsRoute.patch(
  "/boards/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}",
  csrfProtection(),
  async (c) => {
    const requestId = c.get("requestId");
    const id = c.req.param("id");
    const body = await c.req.json<unknown>();
    const parsed = boardUpdateSchema.safeParse(body);
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

    const repo = createBoardRepository(c.env.DB);
    const result = await repo.updateBoard(id, parsed.data);
    if (result.versionConflict) {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: {
            code: "VERSION_CONFLICT",
            message: "板块已被其他会话修改，请刷新后重试。",
          },
          requestId,
        }),
        409,
      );
    }
    if (!result.board) return notFound(c, requestId);

    c.header("Cache-Control", "no-store");
    return c.json(
      apiSuccessSchema(adminBoardListResponseSchema).parse({
        ok: true,
        data: { boards: await repo.listBoards() },
        requestId,
      }),
    );
  },
);

/** DELETE /boards/:id — 删除板块（级联删除成员关联） */
adminBoardsRoute.delete(
  "/boards/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}",
  csrfProtection(),
  async (c) => {
    const requestId = c.get("requestId");
    const id = c.req.param("id");
    const repo = createBoardRepository(c.env.DB);
    const board = await repo.getBoard(id);
    if (!board) return notFound(c, requestId);
    await repo.deleteBoard(id);
    c.header("Cache-Control", "no-store");
    return c.json(
      apiSuccessSchema(adminBoardListResponseSchema).parse({
        ok: true,
        data: { boards: await repo.listBoards() },
        requestId,
      }),
    );
  },
);

/** POST /boards/reorder — 批量更新板块顺序 */
adminBoardsRoute.post("/boards/reorder", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const body = await c.req.json<unknown>();
  const parsed = boardReorderSchema.safeParse(body);
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

  const repo = createBoardRepository(c.env.DB);
  const result = await repo.reorderBoards(parsed.data.boardIds);
  if (!result.ok) {
    return stateConflict(c, requestId, "板块列表已变化，请刷新后重试。");
  }

  c.header("Cache-Control", "no-store");
  return c.json(
    apiSuccessSchema(adminBoardListResponseSchema).parse({
      ok: true,
      data: { boards: await repo.listBoards() },
      requestId,
    }),
  );
});

/** POST /boards/:id/members — 添加成员 */
adminBoardsRoute.post(
  "/boards/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/members",
  csrfProtection(),
  async (c) => {
    const requestId = c.get("requestId");
    const id = c.req.param("id");
    const body = await c.req.json<unknown>();
    const parsed = boardMemberAddSchema.safeParse(body);
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

    const repo = createBoardRepository(c.env.DB);
    const result = await repo.addMember(id, parsed.data.groupId);
    if (result === "NOT_FOUND") {
      return notFound(c, requestId, "板块或群组不存在。");
    }
    if (result === "TRASH") {
      return stateConflict(c, requestId, "回收站群组不可添加。");
    }
    if (result === "INVALID_STATUS") {
      return stateConflict(c, requestId, "仅可添加已发布或已下架群组。");
    }
    if (result === "DUPLICATE") {
      return stateConflict(c, requestId, "该群组已在板块中。");
    }

    const members = await repo.listMembers(id);
    c.header("Cache-Control", "no-store");
    return c.json(
      apiSuccessSchema(boardMemberListResponseSchema).parse({
        ok: true,
        data: { members },
        requestId,
      }),
      201,
    );
  },
);

/** DELETE /boards/:id/members/:groupId — 移除成员关联（不删除群组） */
adminBoardsRoute.delete(
  "/boards/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/members/:groupId{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}",
  csrfProtection(),
  async (c) => {
    const requestId = c.get("requestId");
    const id = c.req.param("id");
    const groupId = c.req.param("groupId");
    const repo = createBoardRepository(c.env.DB);
    const removed = await repo.removeMember(id, groupId);
    if (!removed) return notFound(c, requestId, "板块成员不存在。");
    const members = await repo.listMembers(id);
    c.header("Cache-Control", "no-store");
    return c.json(
      apiSuccessSchema(boardMemberListResponseSchema).parse({
        ok: true,
        data: { members },
        requestId,
      }),
    );
  },
);

/** POST /boards/:id/members/:groupId/move — 上移/下移成员 */
adminBoardsRoute.post(
  "/boards/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/members/:groupId{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/move",
  csrfProtection(),
  async (c) => {
    const requestId = c.get("requestId");
    const id = c.req.param("id");
    const groupId = c.req.param("groupId");
    const body = await c.req.json<unknown>();
    const parsed = boardMemberMoveSchema.safeParse(body);
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

    const repo = createBoardRepository(c.env.DB);
    const result = await repo.moveMember(id, groupId, parsed.data.direction);
    if (result === "NOT_FOUND") {
      return notFound(c, requestId, "板块成员不存在。");
    }

    const members = await repo.listMembers(id);
    c.header("Cache-Control", "no-store");
    return c.json(
      apiSuccessSchema(boardMemberListResponseSchema).parse({
        ok: true,
        data: { members },
        requestId,
      }),
    );
  },
);
