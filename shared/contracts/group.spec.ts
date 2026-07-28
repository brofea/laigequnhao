import { describe, it, expect } from "vitest";
import { publicGroupDtoSchema, adminGroupDtoSchema } from "./group";

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
      publicGroupDtoSchema.parse({ ...validPublicGroup, logoR2Key: "logos/abc.webp" }),
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
    logoR2Key: "logos/abc.webp",
    version: 3,
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
