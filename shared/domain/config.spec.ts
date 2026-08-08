import { describe, it, expect } from "vitest";
import { siteConfigSchema } from "./config";
import siteConfig from "../../site.config";

const validConfig = {
  title: "测试站点",
  faviconUrl: "/favicon.svg",
  header: {
    logoUrl: "/logo.svg",
    brandLabel: "测试站点",
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
  groupKinds: ["官方", "社区"],
  platforms: ["QQ"],
};

describe("siteConfigSchema", () => {
  it("默认站点配置提供五项群组性质候选", () => {
    expect(siteConfig.groupKinds).toEqual(["官方", "非官方", "社区", "活动", "关系"]);
  });

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

  it("接受自定义群组性质候选项", () => {
    expect(
      siteConfigSchema.parse({ ...validConfig, groupKinds: ["官方", "兴趣", "自定义性质"] }),
    ).toMatchObject({ groupKinds: ["官方", "兴趣", "自定义性质"] });
  });

  it("拒绝空、重复的群组性质候选项", () => {
    expect(() => siteConfigSchema.parse({ ...validConfig, groupKinds: [] })).toThrow();
    expect(() => siteConfigSchema.parse({ ...validConfig, groupKinds: ["官方", ""] })).toThrow();
    expect(() =>
      siteConfigSchema.parse({ ...validConfig, groupKinds: ["官方", "官方"] }),
    ).toThrow();
  });

  it("拒绝非图片扩展名", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        faviconUrl: "/favicon.gif",
      }),
    ).toThrow();
  });

  it("拒绝非绝对路径的图片地址", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        header: { ...validConfig.header, logoUrl: "logo.svg" },
      }),
    ).toThrow();
  });

  it("接受绝对 URL 图片地址", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...validConfig,
        faviconUrl: "https://cdn.example.com/favicon.png",
      }),
    ).not.toThrow();
  });
});
