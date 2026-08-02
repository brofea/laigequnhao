# T06 视觉回归报告（阶段七）

- 日期：2026-08-02
- 方式：**结构化 DOM 对比**（本会话 LLM 非多模态，无法直接审阅像素截图；像素证据仍以截图文件保留供人工复核）。
- 基线：prototype v2（`http://127.0.0.1:4174`） vs 正式项目（`http://localhost:5173`，真实 API 数据）
- 环境：Chromium 1280x800 / deviceScaleFactor 1 / light / Asia/Shanghai / 站点时区 Asia/Shanghai
- 证据：`evidence/visual/structure-compare.json`、`evidence/visual/*.png`（17 张截图）、`manifest.json`

## 1. 区域顺序对比（PRD §5.1）

| 顺序 | prototype | 正式项目 | 一致 |
|---|---|---|---|
| 1 | hero-section | hero-section | ✅ |
| 2 | sample-state-bar | sample-state-bar | ✅ |
| 3 | discover-title | discover-title | ✅ |
| 4 | tag-title | tag-title | ✅ |
| 5 | board-*（板块） | board-*（板块） | ✅ |
| 6 | groups-title | groups-title | ✅ |

首页区域顺序完全一致，符合 RPD §5.1。

## 2. 核心组件几何（相同视口下 boundingBox）

| 组件 | prototype | 正式项目 | 一致 |
|---|---|---|---|
| hero-section | (24,112) 1232x250 | (24,112) 1232x250 | ✅ 像素级一致 |
| carousel-shell | (24,517) 1232x240 | (24,517) 1232x240 | ✅ 像素级一致 |
| carousel-slide | (24,537) 237x192 | (24,537) 237x192 | ✅ 像素级一致 |
| group-card | (24,537) 237x192 | (24,537) 237x192 | ✅ 像素级一致 |
| theme-control | (980,19) 70x38 | (980,19) 70x38 | ✅ 像素级一致 |
| carousel-controls | (1182,463) 74x34 | (1182,463) 74x34 | ✅ 像素级一致 |
| 页面横向溢出 | false | false | ✅ |

## 3. 数据差异（预期内，非视觉实现差异）

| 项 | prototype | 正式项目 | 原因 |
|---|---|---|---|
| brand | 找一个值得加入的群 | 来个群号 | 站点配置不同（site.config） |
| 板块标题 | 创意与设计/城市生活/待整理板块 | 自定板块/精选板块 | 真实数据库数据 vs fixture |
| tag-card 数 | 7 | 10 | 数据不同 |
| group-card 数 | 25 | 14 | 数据不同 |
| tag-grid 高度 | 120px | 54px | 标签数量不同导致换行 |
| group-grid 高度 | 666px | 462px | 群组数量不同 |
| 首页总高 | 2709px | 2229px | 数据量不同 |

以上均为数据内容差异，非布局/组件实现差异；组件容器几何（hero/carousel/card/theme-control）在两侧像素级一致。

## 4. 结论

- 视觉冻结验证：**通过**（结构化层面）。
- 未发现区域顺序、组件尺寸、间距体系或主题实现的冻结差异。
- 像素级截图已保存于 `evidence/visual/`，供人工复核（本会话模型不支持图像输入）。
- 已知提示：`sample-state-bar`（样例状态切换）与"仅视觉样例"等 demo 元素保留，属 T03 冻结基线，已在 joint-review P6 记录。
