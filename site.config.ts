import { siteConfigSchema } from "@shared/domain/config";
import type { SiteConfig, JoinMethod, GroupKind, GroupStatus } from "@shared/domain";

// Re-export for consumers
export type { SiteConfig, JoinMethod, GroupKind, GroupStatus };

/** 默认示例配置 — 部署时替换为实际机构 */
const rawConfig: SiteConfig = {
  name: "示例大学",
  shortName: "示例",
  title: "来个群号",
  description: "发现并加入校园群聊",
  contactEmail: "admin@example.edu.cn",
  copyright: "© 2026 示例大学",

  theme: {
    primaryColor: "#2563eb",
    accentColor: "#f59e0b",
    defaultMode: "system",
  },

  header: {
    brandLabel: "来个群号",
    brandMark: "群",
    githubUrl: "https://github.com/brofea/laigequnhao",
    githubLabel: "GitHub",
    addGroup: {
      label: "添加新群",
      target: "submission-dialog",
    },
  },

  rotation: {
    timezone: "Asia/Shanghai",
    times: ["04:01", "16:01"],
  },

  platforms: ["QQ", "微信", "钉钉", "飞书", "小红书", "抖音", "百度贴吧", "Telegram", "Discord"],

  features: {},
};

/** 经 Zod 校验的站点配置 */
const siteConfig = siteConfigSchema.parse(rawConfig);

export default siteConfig;
