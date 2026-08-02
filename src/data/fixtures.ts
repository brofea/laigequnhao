export type AvatarState = "ready" | "missing" | "error";
export type GroupStatus = "published" | "delisted" | "pending" | "rejected";
export type JoinMethodType = "link" | "qr" | "number";

export const groupStatusLabels: Record<GroupStatus, string> = {
  published: "已发布",
  delisted: "已下架",
  pending: "待审核",
  rejected: "已拒绝",
};

export const groupStatusTones: Record<GroupStatus, "success" | "danger" | "warning"> = {
  published: "success",
  delisted: "danger",
  pending: "warning",
  rejected: "danger",
};

export interface JoinMethod {
  id: string;
  type: JoinMethodType;
  label: string;
  value: string;
  imageData?: string;
  /** 服务端资源标识（qr_code 类型上传后由真实 API 返回） */
  assetId?: string;
}

export interface DemoGroup {
  id: string;
  title: string;
  platform: string;
  kind: "兴趣" | "工具" | "同城";
  description: string;
  tags: string[];
  likes: number;
  liked: boolean;
  avatarState: AvatarState;
  status: GroupStatus;
  inRecycleBin: boolean;
  joinMethods: JoinMethod[];
  /** Logo 资源标识（管理员编辑保存时提交） */
  logoR2Key?: string | null;
}

export interface DemoBoard {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  memberCount: number;
  members: string[];
}

const sampleQrImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='8' fill='%23f7f9fc'/%3E%3Cg fill='%232d5be8'%3E%3Crect x='12' y='12' width='28' height='28' rx='4'/%3E%3Crect x='80' y='12' width='28' height='28' rx='4'/%3E%3Crect x='12' y='80' width='28' height='28' rx='4'/%3E%3Cpath d='M52 14h12v12H52zm12 16h12v12H64zM48 48h14v14H48zm22 0h10v10H70zm16 14h14v14H86zM50 70h12v12H50zm18 18h12v12H68zm20 8h12v10H88z'/%3E%3C/g%3E%3Cg fill='%23fff'%3E%3Crect x='19' y='19' width='14' height='14' rx='2'/%3E%3Crect x='87' y='19' width='14' height='14' rx='2'/%3E%3Crect x='19' y='87' width='14' height='14' rx='2'/%3E%3C/g%3E%3C/svg%3E";

export const demoGroups: DemoGroup[] = [
  {
    id: "design-lab",
    title: "设计师交换站",
    platform: "QQ",
    kind: "兴趣",
    description:
      "分享界面灵感、产品拆解与设计资源。每周有一次轻量作品交流，适合想要持续练习和获得反馈的朋友。",
    tags: ["UI 设计", "作品交流", "资源分享"],
    likes: 328,
    liked: true,
    avatarState: "ready",
    status: "published",
    inRecycleBin: false,
    joinMethods: [
      {
        id: "design-link",
        type: "link",
        label: "邀请链接",
        value: "https://sample.invalid/design-lab",
      },
      { id: "design-number", type: "number", label: "群号", value: "472 108 639" },
    ],
  },
  {
    id: "city-walk",
    title: "周末城市漫游 · Weekend City Walkers",
    platform: "微信群",
    kind: "同城",
    description:
      "在城市里散步、拍照、寻找小店。标题特意保留中英文混排，观察长标题在卡片中的截断与详情页中的完整阅读体验。",
    tags: ["周末", "摄影", "同城活动", "生活方式"],
    likes: 192,
    liked: false,
    avatarState: "missing",
    status: "published",
    inRecycleBin: false,
    joinMethods: [
      {
        id: "walk-qr",
        type: "qr",
        label: "二维码",
        value: "sample-qr-city-walk",
        imageData: sampleQrImage,
      },
    ],
  },
  {
    id: "indie-makers",
    title: "Indie Makers ᵔᴥᵔ",
    platform: "Telegram",
    kind: "工具",
    description:
      "独立开发者的产品日志、工具测评和真实发布经验。可以讨论失败，也欢迎分享上线后的第一份用户反馈。",
    tags: ["独立开发", "产品", "效率工具"],
    likes: 87,
    liked: false,
    avatarState: "error",
    status: "published",
    inRecycleBin: false,
    joinMethods: [
      {
        id: "maker-link",
        type: "link",
        label: "公开链接",
        value: "https://sample.invalid/indie-makers",
      },
    ],
  },
  {
    id: "language-corner",
    title: "语言交换角",
    platform: "QQ",
    kind: "兴趣",
    description: "中文、English、日本語，找一个轻松的练习搭子。",
    tags: ["语言学习", "互助"],
    likes: 64,
    liked: false,
    avatarState: "ready",
    status: "published",
    inRecycleBin: false,
    joinMethods: [
      { id: "language-number", type: "number", label: "群号", value: "816 205 473" },
      { id: "language-qr", type: "qr", label: "二维码", value: "sample-qr-language" },
    ],
  },
  {
    id: "long-readers",
    title: "长文阅读与慢思考俱乐部",
    platform: "Discord",
    kind: "兴趣",
    description:
      "每周围绕一本书或一篇长文章展开讨论。这个描述故意比较长：它会超过卡片默认的四行限制，但在详情弹窗中完整展示，并让内容区承担滚动。欢迎带着问题来，也欢迎只安静阅读，不要求每天打卡或输出观点。",
    tags: ["阅读", "思考", "每周讨论"],
    likes: 41,
    liked: true,
    avatarState: "ready",
    status: "published",
    inRecycleBin: false,
    joinMethods: [
      {
        id: "reader-link",
        type: "link",
        label: "邀请链接",
        value: "https://sample.invalid/long-readers",
      },
    ],
  },
  {
    id: "gardeners",
    title: "阳台植物观察员",
    platform: "微信群",
    kind: "同城",
    description: "交换阳台种植经验，记录每一片新叶子。",
    tags: ["植物", "阳台", "生活记录"],
    likes: 26,
    liked: false,
    avatarState: "ready",
    status: "published",
    inRecycleBin: false,
    joinMethods: [{ id: "garden-qr", type: "qr", label: "二维码", value: "sample-qr-gardeners" }],
  },
  {
    id: "product-tea",
    title: "产品茶话会",
    platform: "QQ",
    kind: "工具",
    description: "聊产品策略、用户反馈和那些还没来得及写进复盘的真实细节。",
    tags: ["产品", "复盘", "用户研究"],
    likes: 54,
    liked: false,
    avatarState: "ready",
    status: "published",
    inRecycleBin: false,
    joinMethods: [{ id: "product-number", type: "number", label: "群号", value: "615 309 284" }],
  },
  {
    id: "morning-runners",
    title: "清晨跑步与城市散步小组",
    platform: "微信群",
    kind: "同城",
    description: "不追配速，记录每一次出门。欢迎在日出前后一起跑几公里。",
    tags: ["跑步", "城市散步", "同城活动"],
    likes: 39,
    liked: false,
    avatarState: "missing",
    status: "published",
    inRecycleBin: false,
    joinMethods: [{ id: "runners-qr", type: "qr", label: "二维码", value: "sample-qr-runners" }],
  },
  {
    id: "data-night",
    title: "数据夜航 · Data Night",
    platform: "Telegram",
    kind: "工具",
    description: "交换数据分析、可视化与自动化脚本，适合想把问题讲清楚的人。",
    tags: ["数据分析", "可视化", "自动化"],
    likes: 33,
    liked: false,
    avatarState: "ready",
    status: "published",
    inRecycleBin: false,
    joinMethods: [
      {
        id: "data-link",
        type: "link",
        label: "邀请链接",
        value: "https://sample.invalid/data-night",
      },
    ],
  },
  {
    id: "film-notes",
    title: "电影与城市观察笔记",
    platform: "Discord",
    kind: "兴趣",
    description: "从一部电影出发，聊镜头、城市和看完之后仍然留在心里的小事。",
    tags: ["电影", "城市", "观影笔记"],
    likes: 28,
    liked: true,
    avatarState: "error",
    status: "published",
    inRecycleBin: false,
    joinMethods: [
      {
        id: "film-link",
        type: "link",
        label: "公开链接",
        value: "https://sample.invalid/film-notes",
      },
    ],
  },
  {
    id: "pixel-garden",
    title: "像素花园与独立创作",
    platform: "QQ",
    kind: "兴趣",
    description: "分享像素画、动效练习和小型创作挑战，每周给彼此一个温和的反馈。",
    tags: ["像素画", "动效", "独立创作"],
    likes: 21,
    liked: false,
    avatarState: "ready",
    status: "published",
    inRecycleBin: false,
    joinMethods: [{ id: "pixel-number", type: "number", label: "群号", value: "731 842 506" }],
  },
  {
    id: "open-source-camp",
    title: "开源项目周末营",
    platform: "微信群",
    kind: "工具",
    description: "找搭档、看 issue、做发布，给正在维护中的开源项目留一块安静的工作台。",
    tags: ["开源", "协作", "项目管理"],
    likes: 17,
    liked: false,
    avatarState: "ready",
    status: "published",
    inRecycleBin: false,
    joinMethods: [{ id: "oss-qr", type: "qr", label: "二维码", value: "sample-qr-open-source" }],
  },
  {
    id: "review-queue",
    title: "待审核：周末手作交换",
    platform: "微信群",
    kind: "兴趣",
    description: "用于展示待审核状态的固定样例，不出现在公开页面。",
    tags: ["手作", "交换"],
    likes: 4,
    liked: false,
    avatarState: "missing",
    status: "pending",
    inRecycleBin: false,
    joinMethods: [],
  },
  {
    id: "rejected-promo",
    title: "已拒绝：促销信息示例",
    platform: "QQ",
    kind: "工具",
    description: "用于展示已拒绝状态的固定样例，只在管理端出现。",
    tags: ["审核示例"],
    likes: 2,
    liked: false,
    avatarState: "error",
    status: "rejected",
    inRecycleBin: false,
    joinMethods: [],
  },
  {
    id: "delisted-course",
    title: "已下架：线上课程讨论组",
    platform: "Discord",
    kind: "工具",
    description: "用于展示已下架状态的固定样例，仍可在管理端按状态查找。",
    tags: ["课程", "学习"],
    likes: 8,
    liked: false,
    avatarState: "ready",
    status: "delisted",
    inRecycleBin: false,
    joinMethods: [],
  },
  {
    id: "archived-group",
    title: "已下架示例 · 仅管理端可见",
    platform: "QQ",
    kind: "工具",
    description: "这个固定夹具只用于验证管理端状态，不会出现在公开页面。",
    tags: ["审核示例"],
    likes: 0,
    liked: false,
    avatarState: "missing",
    status: "delisted",
    inRecycleBin: false,
    joinMethods: [],
  },
  {
    id: "recycle-published",
    title: "回收站：旧活动群",
    platform: "微信群",
    kind: "同城",
    description: "用于证明回收站与发布状态独立的固定样例。",
    tags: ["旧活动"],
    likes: 0,
    liked: false,
    avatarState: "missing",
    status: "published",
    inRecycleBin: true,
    joinMethods: [],
  },
  {
    id: "recycle-pending",
    title: "回收站：待处理提交",
    platform: "QQ",
    kind: "兴趣",
    description: "用于证明待审核状态也可以独立出现在回收站中的固定样例。",
    tags: ["待处理"],
    likes: 0,
    liked: false,
    avatarState: "missing",
    status: "pending",
    inRecycleBin: true,
    joinMethods: [],
  },
];

export const demoTags = [
  { label: "UI 设计", count: 18 },
  { label: "独立开发", count: 12 },
  { label: "同城活动", count: 9 },
  { label: "语言学习", count: 8 },
  { label: "阅读", count: 6 },
  { label: "生活方式", count: 4 },
  { label: "摄影", count: 3 },
];

export const demoBoards: DemoBoard[] = [
  {
    id: "creative",
    title: "创意与设计",
    description: "把作品、灵感和可复用资源放在一起。",
    enabled: true,
    memberCount: 6,
    members: [
      "design-lab",
      "indie-makers",
      "long-readers",
      "product-tea",
      "pixel-garden",
      "review-queue",
    ],
  },
  {
    id: "city-life",
    title: "城市生活",
    description: "周末活动与日常生活的轻量集合。",
    enabled: true,
    memberCount: 5,
    members: ["city-walk", "gardeners", "morning-runners", "delisted-course", "rejected-promo"],
  },
  {
    id: "empty-board",
    title: "待整理板块",
    description: "暂未启用，等待补充首批群组。",
    enabled: false,
    memberCount: 0,
    members: [],
  },
];

export const getGroupById = (id: string): DemoGroup | undefined =>
  demoGroups.find((group) => group.id === id);
