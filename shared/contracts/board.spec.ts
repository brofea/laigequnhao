import { describe, expect, it } from "vitest";
import {
  boardCreateSchema,
  boardMemberAddSchema,
  boardMemberMoveSchema,
  boardReorderSchema,
  boardUpdateSchema,
  boardWithGroupsSchema,
} from "./board";
import { adminGroupPageQuerySchema, groupCreateSchema, groupUpdateSchema } from "./group";

describe("board contracts", () => {
  it("accepts a valid create input and trims the title", () => {
    const parsed = boardCreateSchema.parse({ title: "  自定板块  " });
    expect(parsed.title).toBe("自定板块");
  });

  it("rejects an empty board title", () => {
    expect(() => boardCreateSchema.parse({ title: "   " })).toThrow();
  });

  it("rejects a board title over 50 display width units", () => {
    expect(() => boardCreateSchema.parse({ title: "中".repeat(26) })).toThrow();
    expect(boardCreateSchema.safeParse({ title: "中".repeat(25) }).success).toBe(true);
  });

  it("accepts update with version and optional fields", () => {
    const parsed = boardUpdateSchema.parse({
      isEnabled: false,
      sortMode: "hourly_random",
      version: 2,
    });
    expect(parsed).toMatchObject({ isEnabled: false, sortMode: "hourly_random", version: 2 });
  });

  it("rejects update without version", () => {
    expect(() => boardUpdateSchema.parse({ title: "板块" })).toThrow();
  });

  it("accepts reorder with at least one board id", () => {
    const id = crypto.randomUUID();
    expect(boardReorderSchema.parse({ boardIds: [id] }).boardIds).toEqual([id]);
    expect(() => boardReorderSchema.parse({ boardIds: [] })).toThrow();
  });

  it("accepts member add/move inputs", () => {
    const groupId = crypto.randomUUID();
    expect(boardMemberAddSchema.parse({ groupId }).groupId).toBe(groupId);
    expect(boardMemberMoveSchema.parse({ direction: "up" }).direction).toBe("up");
    expect(() => boardMemberMoveSchema.parse({ direction: "left" })).toThrow();
  });

  it("accepts a public board with zero or more published groups", () => {
    const board = {
      id: crypto.randomUUID(),
      title: "自定板块",
      sortMode: "manual_asc",
      groups: [],
    };
    expect(boardWithGroupsSchema.parse(board).groups).toEqual([]);
  });
});

describe("admin page query contract", () => {
  it("parses statuses, deleted, sort and page", () => {
    const parsed = adminGroupPageQuerySchema.parse({
      statuses: ["published", "delisted"],
      deleted: false,
      q: "测试",
      sortBy: "title",
      sortDir: "desc",
      page: 3,
    });
    expect(parsed.page).toBe(3);
    expect(parsed.sortBy).toBe("title");
  });

  it("normalizes page to a positive integer", () => {
    expect(adminGroupPageQuerySchema.parse({ statuses: ["published"], page: "2" }).page).toBe(2);
    expect(() => adminGroupPageQuerySchema.parse({ statuses: ["published"], page: 0 })).toThrow();
  });

  it("rejects trash mode combined with statuses", () => {
    expect(() =>
      adminGroupPageQuerySchema.parse({ deleted: true, statuses: ["published"] }),
    ).toThrow();
  });

  it("requires at least one status in normal mode", () => {
    expect(() => adminGroupPageQuerySchema.parse({ deleted: false, statuses: [] })).toThrow();
  });
});

describe("group create/update display width validation", () => {
  const base = {
    kind: "interest",
    platform: "qq",
    status: "pending",
    joinMethods: [{ type: "group_number", value: "123456", sortOrder: 0 }],
  };

  it("trims title and description before width validation", () => {
    const parsed = groupCreateSchema.parse({
      ...base,
      title: "  测试群  ",
      description: "  简介  ",
    });
    expect(parsed.title).toBe("测试群");
    expect(parsed.description).toBe("简介");
  });

  it("rejects a title over 50 display width units", () => {
    const result = groupCreateSchema.safeParse({ ...base, title: "中".repeat(26) });
    expect(result.success).toBe(false);
  });

  it("rejects a description over 1000 display width units", () => {
    const result = groupCreateSchema.safeParse({
      ...base,
      title: "测试群",
      description: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
    expect(
      groupCreateSchema.safeParse({ ...base, title: "测试群", description: "a".repeat(1000) })
        .success,
    ).toBe(true);
  });

  it("rejects an over-width title on update", () => {
    const result = groupUpdateSchema.safeParse({ title: "中".repeat(26), version: 1 });
    expect(result.success).toBe(false);
  });
});
