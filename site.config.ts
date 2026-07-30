import { siteConfigSchema } from "@shared/domain/config";
import type {
  SiteConfig,
  PlatformConfig,
  JoinMethod,
  GroupKind,
  GroupStatus,
} from "@shared/domain";

// Re-export for consumers
export type { SiteConfig, PlatformConfig, JoinMethod, GroupKind, GroupStatus };

/** 默认示例配置 — 部署时替换为实际机构 */
const rawConfig: SiteConfig = {
  name: "示例大学",
  shortName: "示例",
  title: "来个群号 — 示例大学",
  description: "发现并加入校园群聊",
  contactEmail: "admin@example.edu.cn",
  copyright: "© 2026 示例大学",

  theme: {
    primaryColor: "#2563eb",
    accentColor: "#f59e0b",
    defaultMode: "light",
  },

  rotation: {
    timezone: "Asia/Shanghai",
    times: ["04:01", "16:01"],
  },

  platforms: [
    { id: "qq", name: "QQ" },
    { id: "wechat", name: "微信" },
    { id: "dingtalk", name: "钉钉" },
    { id: "discord", name: "Discord" },
    { id: "telegram", name: "Telegram" },
  ],

  features: {},
};

/** 经 Zod 校验的站点配置 */
const siteConfig = siteConfigSchema.parse(rawConfig);

export default siteConfig;
