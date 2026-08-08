# 实施计划

## 执行顺序

1. 更新共享 `groupKindSchema`、`SiteConfig` schema 和对应单元测试，建立文本性质与配置候选项的可执行契约。
2. 更新 `site.config.ts` 默认候选项，以及前端 `DemoGroup`、适配器、编辑表单和组件测试；搜索并替换所有仍假定三项中文或两项英文枚举的产品代码/测试夹具。
3. 更新 repository 的性质排序，使其适用于任意文本而非 `official` 优先。
4. 新增 `0005_group_kind_text.sql`，用表重建解除 D1 `CHECK` 约束，并迁移旧值；不得编辑现有 migration。迁移依赖 Wrangler 的已应用记录：初次升级执行，已迁移数据库跳过。
5. 扩展 Worker 路由和 migration 测试，重点验证空库建表、旧库升级、重复 apply 无操作、关联保留与中文性质的创建/更新/读取。
6. 核验 `scripts/deploy.mjs` 仍在 `wrangler deploy` 前执行远程 migration，且远程 migration 失败会阻断发布；如现有自动化未覆盖该顺序，则补充脚本级测试。
7. 运行格式化、静态检查、单元/Worker/E2E 测试与构建；若质量门禁揭示数据流或迁移问题，回到设计修订后再重跑。

## 验证命令

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
```

除完整门禁外，实施时先运行受影响的 `shared/domain/config.spec.ts`、`shared/contracts/group.spec.ts`、`src/components/AdminEditForm.spec.ts`、`tests/workers/migrations.spec.ts` 及相关管理/投稿 Worker 测试，以快速定位跨层回归。

## 高风险文件与检查点

| 区域 | 风险 | 检查点 |
| --- | --- | --- |
| `migrations/0005_group_kind_text.sql` | 漏列、索引或外键导致数据/关系丢失 | 升级夹具保留群组所有列、标签、加群方式和板块关联；插入新中文值成功。 |
| `scripts/deploy.mjs` | 先发布新 Worker 再迁移，或重复部署触发表重建 | 断言远程 migration 在 deploy 前运行；连续 apply 后 migration 记录和群组数据不变。 |
| `shared/domain/group.ts` 与 `shared/contracts/*` | 某条 API 仍拒绝新文本 | 契约、管理 CRUD 与投稿均断言中文性质往返。 |
| `src/features/groups/adapters.ts` | 旧显示映射静默改写性质 | 适配测试断言 API 值原样进入 `DemoGroup` 和公开卡片。 |
| `AdminEditForm.vue` | 配置未成为单一候选来源或意外可输入 | 组件测试断言选项来自 `siteConfig.groupKinds`，保留 Select 而不新增输入框。 |

## 回滚点

- 在执行 schema migration 前，按数据库规范对目标 D1 导出/备份；迁移失败不得手工编辑已应用 migration。
- 代码发布失败但 migration 已执行时，回退到能读取任意文本性质的版本，或另建经审查的补偿 migration；不可直接恢复旧 Worker，因为它会拒绝已迁移的中文数据。
