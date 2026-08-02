import { Hono } from "hono";
import { publicBoardsResponseSchema } from "@shared/contracts/board";
import { apiSuccessSchema } from "@shared/contracts/api";
import type { AdminGroupDto } from "@shared/contracts/group";
import { createBoardRepository } from "../repositories/board-repository";
import { createGroupRepository } from "../repositories/group-repository";
import { toPublicGroupDto } from "../services/public-group-mapper";
import { computeHourlySlot, stableShuffle } from "../services/board-sort-service";
import type { Env } from "../env";

type Vars = { requestId: string };
export const boardsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

/** GET /boards — 启用板块及其已发布成员（RPD §15） */
boardsRoute.get("/", async (c) => {
  const requestId = c.get("requestId");

  const config = (await import("../../../site.config"))
    .default as import("@shared/domain").SiteConfig;
  const boardRepo = createBoardRepository(c.env.DB);
  const groupRepo = createGroupRepository(c.env.DB);

  const boards = await boardRepo.listEnabledBoards();
  if (boards.length === 0) {
    return c.json(
      apiSuccessSchema(publicBoardsResponseSchema).parse({
        ok: true,
        data: { boards: [] },
        requestId,
      }),
    );
  }

  // 批量取成员 + 批量取已发布群组，避免逐板块 N+1
  const members = await boardRepo.listMembersByBoards(boards.map((b) => b.id));
  const groupIds = [...new Set(members.map((m) => m.group_id))];
  const publishedGroups = await groupRepo.listPublishedByIds(groupIds);
  const groupById = new Map(publishedGroups.map((g) => [g.id, g]));

  const slot = computeHourlySlot(config.boards.timezone);
  const items = await Promise.all(
    boards.map(async (board) => {
      let ordered = members.filter((m) => m.board_id === board.id);
      if (board.sortMode === "manual_desc") {
        ordered = [...ordered].reverse();
      } else if (board.sortMode === "hourly_random") {
        ordered = stableShuffle(board.id, slot, ordered);
      }

      const groups = await Promise.all(
        ordered
          .map((m) => groupById.get(m.group_id))
          .filter((g): g is AdminGroupDto => g !== undefined)
          .map((g) => toPublicGroupDto(g, c.env)),
      );

      return { id: board.id, title: board.title, sortMode: board.sortMode, groups };
    }),
  );

  return c.json(
    apiSuccessSchema(publicBoardsResponseSchema).parse({
      ok: true,
      data: { boards: items },
      requestId,
    }),
  );
});
