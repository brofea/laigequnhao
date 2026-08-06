import { describe, it, expect } from "vitest";
import {
  publicGroupDtoSchema,
  adminGroupDtoSchema,
  groupCreateSchema,
  groupUpdateSchema,
} from "./group";

const validPublicGroup = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "测试群聊",
  description: "测试描述",
  kind: "official" as const,
  platform: "qq",
  tags: ["游戏", "编程"],
  status: "published" as const,
  logoUrl: null,
  logoMeta: null,
  joinMethods: [{ type: "group_number" as const, value: "123456" }],
  likeCount: 42,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("publicGroupDtoSchema", () => {
  it("接受完整的公开群聊 DTO", () => {
    expect(() => publicGroupDtoSchema.parse(validPublicGroup)).not.toThrow();
  });

  it("拒绝包含 submissionContact 的 DTO", () => {
    expect(() =>
      publicGroupDtoSchema.parse({ ...validPublicGroup, submissionContact: "test@qq.com" }),
    ).toThrow();
  });

  it("拒绝包含 auditNotes 的 DTO", () => {
    expect(() =>
      publicGroupDtoSchema.parse({ ...validPublicGroup, auditNotes: "已审核" }),
    ).toThrow();
  });

  it("拒绝包含 deletedAt 的 DTO", () => {
    expect(() =>
      publicGroupDtoSchema.parse({
        ...validPublicGroup,
        deletedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("拒绝包含 version 的 DTO", () => {
    expect(() => publicGroupDtoSchema.parse({ ...validPublicGroup, version: 1 })).toThrow();
  });

  it("拒绝包含 logoR2Key 的 DTO", () => {
    expect(() =>
      publicGroupDtoSchema.parse({ ...validPublicGroup, logoR2Key: "logos/abc.png" }),
    ).toThrow();
  });
});

describe("adminGroupDtoSchema", () => {
  const validAdminGroup = {
    ...validPublicGroup,
    submissionContact: "admin@qq.com",
    auditNotes: "已审核通过",
    deletedAt: null,
    deleteProgress: null,
    logoR2Key: "logos/abc.png",
    version: 3,
    lastPublishedAt: null,
  };

  it("接受完整的管理员 DTO", () => {
    expect(() => adminGroupDtoSchema.parse(validAdminGroup)).not.toThrow();
  });

  it("需要 version 字段", () => {
    const { version: _version, ...rest } = validAdminGroup;
    expect(() => adminGroupDtoSchema.parse(rest)).toThrow();
  });

  it("需要 submissionContact 字段（可为 null）", () => {
    expect(() =>
      adminGroupDtoSchema.parse({ ...validAdminGroup, submissionContact: null }),
    ).not.toThrow();
  });
});

// ─── 创建/更新 Schema 测试 ────────────────────────────────

const validCreateInput = {
  title: "测试群",
  description: "测试简介",
  kind: "interest" as const,
  platform: "qq",
  status: "pending" as const,
  tags: ["游戏", "编程"],
  joinMethods: [{ type: "group_number" as const, value: "123456", sortOrder: 0 }],
  auditNotes: null,
};

describe("groupCreateSchema", () => {
  it("接受完整的创建输入", () => {
    expect(() => groupCreateSchema.parse(validCreateInput)).not.toThrow();
  });

  it("拒绝空标题", () => {
    expect(() => groupCreateSchema.parse({ ...validCreateInput, title: "" })).toThrow();
  });

  it("拒绝 0 个加群方式", () => {
    expect(() => groupCreateSchema.parse({ ...validCreateInput, joinMethods: [] })).toThrow();
  });

  it("拒绝超过 5 个标签", () => {
    expect(() =>
      groupCreateSchema.parse({
        ...validCreateInput,
        tags: ["a", "b", "c", "d", "e", "f"],
      }),
    ).toThrow();
  });

  it("拒绝重复标签（大小写不敏感）", () => {
    expect(() =>
      groupCreateSchema.parse({
        ...validCreateInput,
        tags: ["游戏", "游戏"],
      }),
    ).toThrow();
    expect(() =>
      groupCreateSchema.parse({
        ...validCreateInput,
        tags: ["Game", "game"],
      }),
    ).toThrow();
  });

  it("拒绝 url 类型非 HTTPS", () => {
    expect(() =>
      groupCreateSchema.parse({
        ...validCreateInput,
        joinMethods: [{ type: "url", url: "http://example.com", sortOrder: 0 }],
      }),
    ).toThrow();
  });

  it("拒绝 group_number 空值", () => {
    expect(() =>
      groupCreateSchema.parse({
        ...validCreateInput,
        joinMethods: [{ type: "group_number", value: "", sortOrder: 0 }],
      }),
    ).toThrow();
  });

  it("拒绝完全重复的加群方式", () => {
    expect(() =>
      groupCreateSchema.parse({
        ...validCreateInput,
        joinMethods: [
          { type: "group_number", value: "123", sortOrder: 0 },
          { type: "group_number", value: "123", sortOrder: 1 },
        ],
      }),
    ).toThrow();
  });

  it("接受 qr_code 类型", () => {
    expect(() =>
      groupCreateSchema.parse({
        ...validCreateInput,
        joinMethods: [
          { type: "qr_code", assetId: "550e8400-e29b-41d4-a716-446655440000", sortOrder: 0 },
        ],
      }),
    ).not.toThrow();
  });

  it("接受 0 个标签", () => {
    expect(() => groupCreateSchema.parse({ ...validCreateInput, tags: [] })).not.toThrow();
  });

  it("接受空平台（平台可为空）", () => {
    expect(() => groupCreateSchema.parse({ ...validCreateInput, platform: "" })).not.toThrow();
  });

  it("接受列表外的自定义平台值", () => {
    expect(() => groupCreateSchema.parse({ ...validCreateInput, platform: "OICQ" })).not.toThrow();
  });

  it("拒绝超过 50 字符的平台", () => {
    expect(() =>
      groupCreateSchema.parse({ ...validCreateInput, platform: "x".repeat(51) }),
    ).toThrow();
  });
});

describe("groupUpdateSchema", () => {
  const validUpdate = {
    title: "更新标题",
    version: 1,
  };

  it("接受部分更新", () => {
    expect(() => groupUpdateSchema.parse(validUpdate)).not.toThrow();
  });

  it("需要 version", () => {
    const { version: _v, ...rest } = validUpdate;
    expect(() => groupUpdateSchema.parse(rest)).toThrow();
  });

  it("拒绝负数 version", () => {
    expect(() => groupUpdateSchema.parse({ ...validUpdate, version: -1 })).toThrow();
  });

  it("接受全部字段更新", () => {
    expect(() =>
      groupUpdateSchema.parse({
        title: "新标题",
        description: "新简介",
        kind: "official" as const,
        platform: "qq",
        status: "published" as const,
        tags: ["标签"],
        joinMethods: [{ type: "group_number", value: "111", sortOrder: 0 }],
        auditNotes: "已审核",
        version: 2,
      }),
    ).not.toThrow();
  });

  it("接受空平台更新（平台可为空）", () => {
    expect(() => groupUpdateSchema.parse({ ...validUpdate, platform: "" })).not.toThrow();
  });

  it("拒绝超过 50 字符的平台更新", () => {
    expect(() => groupUpdateSchema.parse({ ...validUpdate, platform: "x".repeat(51) })).toThrow();
  });
});
