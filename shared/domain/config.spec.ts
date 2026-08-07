import { describe, it, expect } from "vitest";
import { siteConfigSchema } from "./config";

const validConfig = {
  title: "测试站点",
  header: {
    brandLabel: "测试站点",
    brandMark: "测",
    githubUrl: "https://github.com/example/project",
    githubLabel: "GitHub",
    addGroup: { label: "添加新群" },
  },
  hero: {
    eyebrow: "Hero eyebrow",
    title: "Hero title",
    description: "Hero description",
  },
  footer: {
    name: "测试大学",
    description: "测试描述",
    contactEmail: "admin@test.edu.cn",
    copyright: "© 2026",
  },
  rotation: { timezone: "Asia/Shanghai", times: ["04:01", "16:01"] },
  boards: { timezone: "Asia/Shanghai" },
  platforms: ["QQ"],
};

describe("siteConfigSchema", () => {
  it("接受合法配置", () => {
    expect(() => siteConfigSchema.parse(validConfig)).not.toThrow();
  });

  it("拒绝空名称", () => {
    expect(() =>
      siteConfigSchema.parse({ ...validConfig, footer: { ...validConfig.footer, name: "" } }),
    ).toThrow();
  });

  it("拒绝无效邮箱", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        footer: { ...validConfig.footer, contactEmail: "not-email" },
      }),
    ).toThrow();
  });

  it("拒绝重复平台 ID", () => {
    const config = {
      ...validConfig,
      platforms: ["QQ", "QQ"],
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
        rotation: { timezone: "Mars/Olympus", times: ["04:01"] },
      }),
    ).toThrow();
  });

  it("拒绝非法板块时区", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        boards: { timezone: "Mars/Olympus" },
      }),
    ).toThrow();
  });

  it("拒绝空平台列表", () => {
    expect(() => siteConfigSchema.parse({ ...validConfig, platforms: [] })).toThrow();
  });
});
