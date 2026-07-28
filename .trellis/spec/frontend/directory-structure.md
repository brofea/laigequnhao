# 前端目录结构

## 目标结构

```text
src/
├── app/
│   ├── App.vue
│   ├── main.ts
│   └── router.ts
├── features/
│   ├── groups/
│   ├── submissions/
│   ├── admin/
│   ├── analytics/
│   └── theme/
├── shared/
│   ├── api/
│   ├── components/
│   ├── composables/
│   ├── browser/
│   └── styles/
└── views/
    ├── HomeView.vue
    └── admin/
shared/
├── contracts/
├── domain/
└── config/
site.config.ts
```

仓库根目录下的 `shared/` 与运行时无关，可同时被 Vue 应用和 Pages Functions 导入。`src/shared/` 仅供前端使用。

## 功能职责

功能目录可以包含 `api.ts`、`components/`、`composables/`、`schemas.ts` 和功能私有类型。文件在第二个功能确实需要之前保持局部。可复用 UI 提升到 `src/shared/components/`，浏览器适配器提升到 `src/shared/browser/`。

视图不得演变成服务层。数据库行结构的归一化、fetch 包装器、存储访问和图片转换不属于视图职责。

## 命名

- Vue 组件和视图：`PascalCase.vue`
- Composable：`useThing.ts`
- 其他 TypeScript 模块：`kebab-case.ts`
- 测试：`*.spec.ts` 或 `*.spec.tsx`；组件测试与组件放在一起
- E2E 测试：`tests/e2e/*.spec.ts`
- 领域常量和 schema 使用具名导出；除 Vue SFC 编译器生成的行为外，避免默认导出

## 首批参考路径

初次实现应建立以下参考模块：

- `src/features/groups/components/GroupCard.vue`
- `src/features/groups/composables/useGroupDirectory.ts`
- `src/shared/api/client.ts`
- `shared/contracts/group.ts`
- `site.config.ts`

如果实际实现因有文档记录的理由使用了不同结构，应使用真实路径更新本规范。
