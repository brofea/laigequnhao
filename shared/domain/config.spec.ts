import { describe, it, expect } from "vitest";
import { siteConfigSchema } from "./config";

const validConfig = {
  name: "测试大学",
  shortName: "测试",
  title: "测试站点",
  description: "测试描述",
  contactEmail: "admin@test.edu.cn",
  copyright: "© 2026",
  theme: { primaryColor: "#2563eb", accentColor: "#f59e0b", defaultMode: "light" as const },
  rotation: { timezone: "Asia/Shanghai", times: ["04:01", "16:01"] },
  platforms: [{ id: "qq", name: "QQ", allowedJoinMethods: ["group_number" as const] }],
  features: {},
};

describe("siteConfigSchema", () => {
  it("接受合法配置", () => {
    expect(() => siteConfigSchema.parse(validConfig)).not.toThrow();
  });

  it("拒绝空名称", () => {
    expect(() => siteConfigSchema.parse({ ...validConfig, name: "" })).toThrow();
  });

  it("拒绝无效邮箱", () => {
    expect(() => siteConfigSchema.parse({ ...validConfig, contactEmail: "not-email" })).toThrow();
  });

  it("拒绝重复平台 ID", () => {
    const config = {
      ...validConfig,
      platforms: [
        { id: "qq", name: "QQ", allowedJoinMethods: ["group_number"] },
        { id: "qq", name: "QQ 重复", allowedJoinMethods: ["qr_code"] },
      ],
    };
    expect(() => siteConfigSchema.parse(config)).toThrow();
  });

  it("拒绝无效时间格式", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        rotation: { timezone: "Asia/Shanghai", times: ["25:00"] },
      }),
    ).toThrow();
  });

  it("拒绝非升序时间", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        rotation: { timezone: "Asia/Shanghai", times: ["16:01", "04:01"] },
      }),
    ).toThrow();
  });

  it("拒绝重复时间点", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        rotation: { timezone: "Asia/Shanghai", times: ["04:01", "04:01"] },
      }),
    ).toThrow();
  });

  it("拒绝空时间列表", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        rotation: { timezone: "Asia/Shanghai", times: [] },
      }),
    ).toThrow();
  });

  it("拒绝非法 IANA 时区", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        rotation: { timezone: "Not/AReal/Zone", times: ["04:01"] },
      }),
    ).toThrow();
  });

  it("拒绝空平台列表", () => {
    expect(() => siteConfigSchema.parse({ ...validConfig, platforms: [] })).toThrow();
  });

  it("拒绝空的 allowedJoinMethods", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        platforms: [{ id: "qq", name: "QQ", allowedJoinMethods: [] }],
      }),
    ).toThrow();
  });
});
