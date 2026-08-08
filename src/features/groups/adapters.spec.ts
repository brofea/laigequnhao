import { describe, expect, it } from "vitest";
import { toDemoGroup } from "./adapters";

describe("群组适配器", () => {
  it("原样投影 API 返回的中文自定义性质", () => {
    const group = toDemoGroup(
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        title: "开发者社区",
        description: "测试群组",
        kind: "开发者社区",
        platform: "QQ",
        tags: [],
        status: "published",
        logoUrl: null,
        logoMeta: null,
        joinMethods: [{ type: "group_number", value: "123456" }],
        likeCount: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        get: () => undefined,
        isLiked: () => false,
      },
    );

    expect(group.kind).toBe("开发者社区");
  });
});
