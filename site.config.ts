/** 来个群号 — 机构级站点配置 */
export interface SiteConfig {
  /** 机构完整名称 */
  name: string;
  /** 机构简称 */
  shortName: string;
  /** 站点页面标题 */
  title: string;
  /** 站点介绍 */
  description: string;
  /** 联系邮箱 */
  contactEmail: string;
  /** 页脚版权行 */
  copyright: string;

  /** 主题 */
  theme: {
    /** 主色（CSS 合法颜色值） */
    primaryColor: string;
    /** 强调色 */
    accentColor: string;
    /** 默认颜色模式 */
    defaultMode: "light" | "dark";
  };

  /** 轮换排序 */
  rotation: {
    /** IANA 时区标识 */
    timezone: string;
    /** 每日轮换时间点（HH:mm，升序，不重复） */
    times: string[];
  };

  /** 支持的平台配置 */
  platforms: PlatformConfig[];

  /** 功能开关 */
  features: {
    /** 二维码公开展示 */
    qrCodePublic: boolean;
  };
}

export interface PlatformConfig {
  /** 平台唯一标识 */
  id: string;
  /** 平台显示名称 */
  name: string;
  /** 该平台允许的加群方式 */
  allowedJoinMethods: JoinMethod[];
}

/** 加群方式 */
export type JoinMethod = "group_number" | "url" | "qr_code";

/** 群聊性质 */
export type GroupKind = "official" | "interest";

/** 业务状态 */
export type GroupStatus = "pending" | "published" | "rejected" | "delisted";

/** 默认示例配置 — 部署时替换为实际机构 */
const siteConfig: SiteConfig = {
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
    { id: "qq", name: "QQ", allowedJoinMethods: ["group_number", "qr_code"] },
    { id: "wechat", name: "微信", allowedJoinMethods: ["qr_code"] },
    { id: "dingtalk", name: "钉钉", allowedJoinMethods: ["group_number", "qr_code"] },
    { id: "discord", name: "Discord", allowedJoinMethods: ["url"] },
    { id: "telegram", name: "Telegram", allowedJoinMethods: ["url"] },
  ],

  features: {
    qrCodePublic: false,
  },
};

export default siteConfig;
