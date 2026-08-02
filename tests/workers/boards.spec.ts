import { describe, expect, it, beforeAll } from "vitest";
import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";
import { env as testEnv } from "cloudflare:test";
import { loginAdmin, apiFetch, createGroup } from "./helpers";
import { computeHourlySlot, stableShuffle } from "../../functions/_lib/services/board-sort-service";

const env = testEnv as Env;
let auth: Record<string, string>;

beforeAll(async () => {
  auth = await loginAdmin();
});

function uniqueBoard(): { title: string; suffix: string } {
  const suffix = crypto.randomUUID().slice(0, 8);
  return { title: `板块-${suffix}`, suffix };
}

async function createBoard(title: string): Promise<{ id: string; version: number }> {
  const response = await apiFetch(auth, "POST", "/api/v1/admin/boards", { title });
  expect(response.status).toBe(201);
  const json = (await response.json()) as {
    data: { boards: Array<{ id: string; version: number; title: string }> };
  };
  const board = json.data.boards.find((b) => b.title === title)!;
  expect(board).toBeDefined();
  return { id: board.id, version: board.version };
}

async function listBoards(): Promise<
  Array<{ id: string; title: string; position: number; version: number; isEnabled: boolean }>
> {
  const response = await apiFetch(auth, "GET", "/api/v1/admin/boards");
  expect(response.status).toBe(200);
  const json = (await response.json()) as {
    data: {
      boards: Array<{
        id: string;
        title: string;
        position: number;
        version: number;
        isEnabled: boolean;
      }>;
    };
  };
  return json.data.boards;
}

async function createBoardWithMembers(
  titles: string[],
  statuses: string[],
): Promise<{ boardId: string; boardVersion: number; groupIds: string[] }> {
  const { title } = uniqueBoard();
  const board = await createBoard(title);
  const groupIds: string[] = [];
  for (let i = 0; i < titles.length; i++) {
    const group = await createGroup(auth, { status: statuses[i], title: `${titles[i]}-${title}` });
    groupIds.push(group.id);
    const add = await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, {
      groupId: group.id,
    });
    expect(add.status).toBe(201);
  }
  return { boardId: board.id, boardVersion: board.version, groupIds };
}

describe("小时槽位与稳定随机（纯函数）", () => {
  it("同一自然小时内槽位稳定，下一小时变化", () => {
    const tz = "Asia/Shanghai";
    const slot1 = computeHourlySlot(tz, new Date("2026-08-02T01:59:59Z")); // 09:59 CST
    const slot2 = computeHourlySlot(tz, new Date("2026-08-02T02:30:00Z")); // 10:30 CST
    const slot3 = computeHourlySlot(tz, new Date("2026-08-02T02:59:59Z")); // 10:59 CST
    const slot4 = computeHourlySlot(tz, new Date("2026-08-02T03:00:00Z")); // 11:00 CST
    expect(slot1).not.toBe(slot2);
    expect(slot2).toBe(slot3);
    expect(slot3).not.toBe(slot4);
  });

  it("同一 board+slot 顺序稳定，不同 slot 产生新顺序", () => {
    const members = ["a", "b", "c", "d", "e"];
    const s1 = stableShuffle("board-1", 1000, members);
    const s2 = stableShuffle("board-1", 1000, members);
    expect(s1).toEqual(s2);

    const s3 = stableShuffle("board-1", 1001, members);
    expect(s3).not.toEqual(s1);

    const other = stableShuffle("board-2", 1000, members);
    expect(other).toEqual(stableShuffle("board-2", 1000, members));

    expect([...s1].sort()).toEqual([...members].sort());
  });
});

describe("板块管理 API", () => {
  it("迁移后存在默认自定板块", async () => {
    const boards = await listBoards();
    expect(boards).toHaveLength(1);
    expect(boards[0]!.title).toBe("自定板块");
    expect(boards[0]!.isEnabled).toBe(true);
  });

  it("创建、编辑、启停、删除板块", async () => {
    const { title } = uniqueBoard();
    const board = await createBoard(title);

    const patch = await apiFetch(auth, "PATCH", `/api/v1/admin/boards/${board.id}`, {
      title: `${title}-改`,
      isEnabled: false,
      sortMode: "hourly_random",
      version: board.version,
    });
    expect(patch.status).toBe(200);
    const patched = (
      (await patch.json()) as {
        data: {
          boards: Array<{ id: string; title: string; isEnabled: boolean; sortMode: string }>;
        };
      }
    ).data.boards.find((b) => b.id === board.id);
    expect(patched).toMatchObject({
      title: `${title}-改`,
      isEnabled: false,
      sortMode: "hourly_random",
    });

    const del = await apiFetch(auth, "DELETE", `/api/v1/admin/boards/${board.id}`);
    expect(del.status).toBe(200);
    const after = ((await del.json()) as { data: { boards: Array<{ id: string }> } }).data.boards;
    expect(after.some((b) => b.id === board.id)).toBe(false);
  });

  it("板块版本冲突返回 409", async () => {
    const board = await createBoard("冲突板块");
    const r1 = await apiFetch(auth, "PATCH", `/api/v1/admin/boards/${board.id}`, {
      title: "第一次",
      version: board.version,
    });
    expect(r1.status).toBe(200);

    const stale = await apiFetch(auth, "PATCH", `/api/v1/admin/boards/${board.id}`, {
      title: "过期版本",
      version: board.version,
    });
    expect(stale.status).toBe(409);
    const json = (await stale.json()) as { error: { code: string } };
    expect(json.error.code).toBe("VERSION_CONFLICT");
  });

  it("板块拖拽排序原子更新且校验完整列表", async () => {
    const a = await createBoard("顺序A");
    const b = await createBoard("顺序B");
    const all = await listBoards();
    const rest = all.filter((x) => x.id !== a.id && x.id !== b.id).map((x) => x.id);

    const reorder = await apiFetch(auth, "POST", "/api/v1/admin/boards/reorder", {
      boardIds: [b.id, a.id, ...rest],
    });
    expect(reorder.status).toBe(200);
    const after = (
      (await reorder.json()) as { data: { boards: Array<{ id: string; position: number }> } }
    ).data.boards;
    expect(after.find((x) => x.id === b.id)!.position).toBe(0);
    expect(after.find((x) => x.id === a.id)!.position).toBe(1);

    // 缺少板块 id → 冲突，不产生部分写入
    const conflict = await apiFetch(auth, "POST", "/api/v1/admin/boards/reorder", {
      boardIds: [a.id],
    });
    expect(conflict.status).toBe(409);
    const afterConflict = await listBoards();
    expect(afterConflict.find((x) => x.id === b.id)!.position).toBe(0);
    expect(afterConflict.find((x) => x.id === a.id)!.position).toBe(1);
  });

  it("管理写操作需要认证与 CSRF", async () => {
    const noAuth = await apiFetch({}, "POST", "/api/v1/admin/boards", { title: "无认证" });
    expect(noAuth.status).toBe(401);

    const noCsrf = await apiFetch({ Cookie: auth.Cookie }, "POST", "/api/v1/admin/boards", {
      title: "无CSRF",
    });
    expect(noCsrf.status).toBe(403);
  });
});

describe("板块成员管理", () => {
  it("添加已发布与已下架群组，拒绝回收站与待审核", async () => {
    const board = await createBoard("成员规则板块");
    const published = await createGroup(auth, { status: "published" });
    const delisted = await createGroup(auth, { status: "delisted" });
    const pending = await createGroup(auth, { status: "pending" });

    expect(
      (
        await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, {
          groupId: published.id,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, {
          groupId: delisted.id,
        })
      ).status,
    ).toBe(201);

    const pendingResp = await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, {
      groupId: pending.id,
    });
    expect(pendingResp.status).toBe(409);
    expect(((await pendingResp.json()) as { error: { code: string } }).error.code).toBe(
      "STATE_CONFLICT",
    );

    await apiFetch(auth, "DELETE", `/api/v1/admin/${published.id}`);
    const trashResp = await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, {
      groupId: published.id,
    });
    expect(trashResp.status).toBe(409);
    expect(((await trashResp.json()) as { error: { code: string } }).error.code).toBe(
      "STATE_CONFLICT",
    );
  });

  it("拒绝重复成员", async () => {
    const { boardId, groupIds } = await createBoardWithMembers(["重复群"], ["published"]);
    const dup = await apiFetch(auth, "POST", `/api/v1/admin/boards/${boardId}/members`, {
      groupId: groupIds[0],
    });
    expect(dup.status).toBe(409);
    const json = (await dup.json()) as { error: { code: string } };
    expect(json.error.code).toBe("STATE_CONFLICT");
  });

  it("上移、下移、边界幂等、移除成员", async () => {
    const { boardId, groupIds } = await createBoardWithMembers(
      ["成员一", "成员二", "成员三"],
      ["published", "published", "published"],
    );

    // 下移第一项 → 第二项
    let resp = await apiFetch(
      auth,
      "POST",
      `/api/v1/admin/boards/${boardId}/members/${groupIds[0]}/move`,
      { direction: "down" },
    );
    expect(resp.status).toBe(200);
    let members = (
      (await resp.json()) as { data: { members: Array<{ groupId: string; position: number }> } }
    ).data.members;
    expect(members.find((m) => m.groupId === groupIds[0])!.position).toBe(1);

    // 第一项上移 → NOOP 幂等
    resp = await apiFetch(
      auth,
      "POST",
      `/api/v1/admin/boards/${boardId}/members/${groupIds[1]}/move`,
      { direction: "up" },
    );
    expect(resp.status).toBe(200);
    members = (
      (await resp.json()) as { data: { members: Array<{ groupId: string; position: number }> } }
    ).data.members;
    expect(members.find((m) => m.groupId === groupIds[1])!.position).toBe(0);
    expect(members.find((m) => m.groupId === groupIds[0])!.position).toBe(1);

    // 最后一项下移 → NOOP
    resp = await apiFetch(
      auth,
      "POST",
      `/api/v1/admin/boards/${boardId}/members/${groupIds[2]}/move`,
      { direction: "down" },
    );
    expect(resp.status).toBe(200);
    members = (
      (await resp.json()) as { data: { members: Array<{ groupId: string; position: number }> } }
    ).data.members;
    expect(members.find((m) => m.groupId === groupIds[2])!.position).toBe(2);

    // 移除成员不删除群组
    const remove = await apiFetch(
      auth,
      "DELETE",
      `/api/v1/admin/boards/${boardId}/members/${groupIds[0]}`,
    );
    expect(remove.status).toBe(200);
    members = ((await remove.json()) as { data: { members: Array<{ groupId: string }> } }).data
      .members;
    expect(members.some((m) => m.groupId === groupIds[0])).toBe(false);
    const group = await apiFetch(auth, "GET", `/api/v1/admin/${groupIds[0]}`);
    expect(group.status).toBe(200);
  });

  it("回收站原子移除全部板块关联，恢复不自动重建", async () => {
    const { boardId, groupIds } = await createBoardWithMembers(["回收关联"], ["published"]);

    await apiFetch(auth, "DELETE", `/api/v1/admin/${groupIds[0]}`);
    let members = (
      (await (await apiFetch(auth, "GET", `/api/v1/admin/boards/${boardId}/members`)).json()) as {
        data: { members: Array<{ groupId: string }> };
      }
    ).data.members;
    expect(members.some((m) => m.groupId === groupIds[0])).toBe(false);

    // 恢复后不自动重建关联
    await apiFetch(auth, "POST", `/api/v1/admin/${groupIds[0]}/restore`);
    members = (
      (await (await apiFetch(auth, "GET", `/api/v1/admin/boards/${boardId}/members`)).json()) as {
        data: { members: Array<{ groupId: string }> };
      }
    ).data.members;
    expect(members.some((m) => m.groupId === groupIds[0])).toBe(false);
  });

  it("永久删除清理板块关联", async () => {
    const { boardId, groupIds } = await createBoardWithMembers(["永久删除关联"], ["published"]);
    await apiFetch(auth, "DELETE", `/api/v1/admin/${groupIds[0]}`);
    await apiFetch(auth, "DELETE", `/api/v1/admin/trash/groups/${groupIds[0]}`);
    const after = (
      (await (await apiFetch(auth, "GET", `/api/v1/admin/boards/${boardId}/members`)).json()) as {
        data: { members: Array<{ groupId: string }> };
      }
    ).data.members;
    expect(after.some((m) => m.groupId === groupIds[0])).toBe(false);
  });
});

describe("公开板块 API", () => {
  it("只返回启用板块及其已发布成员；空板块返回空结果", async () => {
    const disabled = await createBoard("关闭板块");
    const disabledPatch = await apiFetch(auth, "PATCH", `/api/v1/admin/boards/${disabled.id}`, {
      isEnabled: false,
      version: disabled.version,
    });
    expect(disabledPatch.status).toBe(200);

    const board = await createBoard("公开板块");
    const published = await createGroup(auth, { status: "published", title: "公开成员" });
    const delisted = await createGroup(auth, { status: "delisted", title: "下架成员" });
    expect(
      (
        await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, {
          groupId: published.id,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, {
          groupId: delisted.id,
        })
      ).status,
    ).toBe(201);

    const response = await apiFetch({}, "GET", "/api/v1/boards");
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      data: { boards: Array<{ id: string; groups: Array<{ id: string }> }> };
    };
    expect(json.data.boards.some((b) => b.id === disabled.id)).toBe(false);

    const publicBoard = json.data.boards.find((b) => b.id === board.id)!;
    expect(publicBoard.groups.map((g) => g.id)).toEqual([published.id]);

    // 启用但无公开成员的板块 → 空 groups（前端可识别为空状态）
    const emptyBoard = await createBoard("空板块");
    const emptyResp = await apiFetch({}, "GET", "/api/v1/boards");
    const emptyJson = (await emptyResp.json()) as {
      data: { boards: Array<{ id: string; groups: unknown[] }> };
    };
    expect(emptyJson.data.boards.find((b) => b.id === emptyBoard.id)!.groups).toEqual([]);
  });

  it("manual_desc 反向展示成员", async () => {
    const board = await createBoard("倒序板块");
    const g1 = await createGroup(auth, { status: "published", title: "倒序一" });
    const g2 = await createGroup(auth, { status: "published", title: "倒序二" });
    expect(
      (await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, { groupId: g1.id }))
        .status,
    ).toBe(201);
    expect(
      (await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, { groupId: g2.id }))
        .status,
    ).toBe(201);
    const patch = await apiFetch(auth, "PATCH", `/api/v1/admin/boards/${board.id}`, {
      sortMode: "manual_desc",
      version: board.version,
    });
    expect(patch.status).toBe(200);

    const response = await apiFetch({}, "GET", "/api/v1/boards");
    const json = (await response.json()) as {
      data: { boards: Array<{ id: string; sortMode: string; groups: Array<{ id: string }> }> };
    };
    const b = json.data.boards.find((x) => x.id === board.id)!;
    expect(b.sortMode).toBe("manual_desc");
    expect(b.groups.map((g) => g.id)).toEqual([g2.id, g1.id]);
  });

  it("hourly_random 刷新顺序稳定", async () => {
    const board = await createBoard("随机板块");
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const g = await createGroup(auth, { status: "published", title: `随机成员-${i}` });
      ids.push(g.id);
      expect(
        (
          await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, {
            groupId: g.id,
          })
        ).status,
      ).toBe(201);
    }
    const patch = await apiFetch(auth, "PATCH", `/api/v1/admin/boards/${board.id}`, {
      sortMode: "hourly_random",
      version: board.version,
    });
    expect(patch.status).toBe(200);

    const fetchOrder = async () => {
      const r = await apiFetch({}, "GET", "/api/v1/boards");
      const json = (await r.json()) as {
        data: { boards: Array<{ id: string; groups: Array<{ id: string }> }> };
      };
      return json.data.boards.find((b) => b.id === board.id)!.groups.map((g) => g.id);
    };

    const first = await fetchOrder();
    const second = await fetchOrder();
    expect(first).toEqual(second);
    expect([...first].sort()).toEqual([...ids].sort());
  });

  it("未启用板块不在公开端显示但成员配置保留", async () => {
    const board = await createBoard("隐藏板块");
    const g = await createGroup(auth, { status: "published", title: "隐藏成员" });
    expect(
      (await apiFetch(auth, "POST", `/api/v1/admin/boards/${board.id}/members`, { groupId: g.id }))
        .status,
    ).toBe(201);
    const patch = await apiFetch(auth, "PATCH", `/api/v1/admin/boards/${board.id}`, {
      isEnabled: false,
      version: board.version,
    });
    expect(patch.status).toBe(200);

    const publicResp = await apiFetch({}, "GET", "/api/v1/boards");
    const json = (await publicResp.json()) as { data: { boards: Array<{ id: string }> } };
    expect(json.data.boards.some((b) => b.id === board.id)).toBe(false);

    const adminMembers = (
      (await (await apiFetch(auth, "GET", `/api/v1/admin/boards/${board.id}/members`)).json()) as {
        data: { members: Array<{ groupId: string }> };
      }
    ).data.members;
    expect(adminMembers.some((m) => m.groupId === g.id)).toBe(true);
  });
});
