import { siteConfigSchema } from "@shared/domain/config";
import type { SiteConfig, JoinMethod, GroupKind, GroupStatus } from "@shared/domain";

// Re-export for consumers
export type { SiteConfig, JoinMethod, GroupKind, GroupStatus };

/** 默认示例配置 — 部署时替换为实际机构 */
const rawConfig: SiteConfig = {
  name: "示例机构完整名称",
  title: "来个群号",
  description: "发现并加入群聊",
  contactEmail: "admin@example.com",
  copyright: "© 2026 示例机构",

  header: {
    brandLabel: "来个群号",
    brandMark: "群",
    githubUrl: "https://github.com/brofea/laigequnhao",
    githubLabel: "GitHub",
    addGroup: {
      label: "添加新群",
    },
  },

  rotation: {
    timezone: "Asia/Shanghai",
    times: ["04:01", "16:01"],
  },

  boards: {
    timezone: "Asia/Shanghai",
  },

  platforms: ["QQ", "微信", "钉钉", "飞书", "小红书", "抖音", "百度贴吧", "QQ频道", "Telegram", "Discord"],
};

/** 经 Zod 校验的站点配置 */
const siteConfig = siteConfigSchema.parse(rawConfig);

export default siteConfig;
