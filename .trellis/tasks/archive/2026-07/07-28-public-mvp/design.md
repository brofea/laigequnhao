# public-mvp 技术设计

## 架构分层

```text
Vue 视图 (HomeView)
  → GroupList (容器)
    → GroupCard × N
    → SubmissionDialog
  → useGroupDirectory → api/client.ts → GET /api/v1/groups → groups-repository.ts → D1
  → useLikedGroups → api/client.ts → PUT/DELETE /api/v1/groups/:id/like → likes-repository.ts → D1
  → useClipboard → navigator.clipboard
```

前端禁止导入 `functions/`；API 客户端负责 HTTP + Zod 解析。

## D1 Schema

### `groups`
| 列 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | UUID |
| `title` | TEXT NOT NULL | |
| `description` | TEXT NOT NULL DEFAULT '' | |
| `kind` | TEXT NOT NULL | `official` / `interest` |
| `platform` | TEXT NOT NULL | 平台 ID |
| `status` | TEXT NOT NULL | `pending`/`published`/`rejected`/`delisted` |
| `rotation_key` | TEXT NOT NULL | `hex(randomblob(16))` |
| `like_count` | INTEGER NOT NULL DEFAULT 0 | 缓存投影 |
| `version` | INTEGER NOT NULL DEFAULT 1 | 乐观锁 |
| `logo_r2_key` | TEXT | 可选 |
| `logo_url` | TEXT | 可选，公开 URL |
| `logo_width` | INTEGER | |
| `logo_height` | INTEGER | |
| `logo_byte_length` | INTEGER | |
| `deleted_at` | TEXT | UTC ISO |
| `purge_state` | TEXT | `none`/`pending`/`r2_done` |
| `purge_started_at` | TEXT | |
| `created_at` | TEXT NOT NULL | UTC ISO |
| `updated_at` | TEXT NOT NULL | UTC ISO |

### `group_tags`
| 列 | 类型 |
|---|---|
| `id` | TEXT PK |
| `group_id` | TEXT NOT NULL FK → groups.id |
| `tag` | TEXT NOT NULL |
| `sort_order` | INTEGER NOT NULL |

### `join_methods`
| 列 | 类型 |
|---|---|
| `id` | TEXT PK |
| `group_id` | TEXT NOT NULL FK → groups.id |
| `type` | TEXT NOT NULL | `group_number`/`url`/`qr_code` |
| `value` | TEXT | 群号或 URL |
| `sort_order` | INTEGER NOT NULL |

### `submission_details`
| 列 | 类型 |
|---|---|
| `id` | TEXT PK |
| `group_id` | TEXT NOT NULL UNIQUE FK → groups.id |
| `contact` | TEXT | 提交者联系方式 |
| `notes` | TEXT | 补充说明 |

### `likes`
| 列 | 类型 |
|---|---|
| `group_id` | TEXT NOT NULL FK → groups.id |
| `voter_hash` | TEXT NOT NULL |
| UNIQUE(group_id, voter_hash) |

### `rate_limits`
| 列 | 类型 |
|---|---|
| `key` | TEXT PK |
| `count` | INTEGER NOT NULL |
| `window_start` | INTEGER NOT NULL | Unix ms |
| `expires_at` | INTEGER NOT NULL | Unix ms |

## API 设计

### `GET /groups?q=&cursor=&limit=24`

1. Zod 校验 query → `ListQuery`
2. `rotationService.getWindow()` → `{ ordinal, windowId, startTime }`
3. `groupRepository.listPublished({ q, cursor, limit, rotationOrdinal })`：
   ```sql
   -- 基础查询
   SELECT ... FROM groups
   WHERE status IN ('published','delisted') AND deleted_at IS NULL
     AND (title LIKE ? OR id IN (SELECT group_id FROM group_tags WHERE tag LIKE ?))
   ORDER BY rotation_key ASC, id ASC
   ```
4. 循环位移：`offset = rotationOrdinal % total`，取 `[offset, offset+limit)` 切片
5. 构造游标（加密/编码 rotationOrdinal + q + lastKey）
6. 返回 `CursorPage<PublicGroupDto>`

### `POST /submissions`

1. Zod 校验 body
2. 限流检查（submission key）
3. Turnstile 验证（调用 `https://challenges.cloudflare.com/turnstile/v0/siteverify`）
4. D1 batch 写入 groups + join_methods + group_tags + submission_details
5. 返回受理回执

### `PUT/DELETE /groups/:id/like`

1. 校验 X-Device-Id header（UUID 格式）
2. `voterHash = SHA256(deviceId + pepper)`
3. 限流检查（like key）
4. PUT：INSERT OR IGNORE into likes；DELETE：DELETE from likes
5. 按 group_id 重计 like_count 并原子更新 groups
6. 返回 `{ liked, likeCount }`

## 轮换算法实现

```ts
function computeRotation(config: RotationConfig): { ordinal: number; windowId: string } {
  const now = toZonedTime(new Date(), config.timezone);
  const dayIndex = differenceInCalendarDays(now, EPOCH); // EPOCH = 2026-01-01 in timezone
  const slotIndex = findLastIndex(config.times, t => now >= parseTime(t));
  const ordinal = dayIndex * config.times.length + slotIndex;
  const windowId = `${dayIndex}-${slotIndex}`;
  return { ordinal, windowId };
}
```

- 搜索只过滤基础序列，不改变排序
- 游标编码为 base64 JSON：`{ ordinal, q, lastKey }`，解码后校验一致性

## 前端数据流

```
HomeView
├─ 搜索框 (v-model → router.replace { q }) → useGroupDirectory.listen()
├─ GroupList
│   ├─ useGroupDirectory.groups → v-for → GroupCard
│   ├─ useGroupDirectory.loading → 骨架屏
│   ├─ useGroupDirectory.error → ErrorBanner
│   └─ IntersectionObserver → useGroupDirectory.loadMore()
├─ useLikedGroups
│   ├─ localStorage: deviceId, likedIds[]
│   ├─ GroupCard.toggleLike(id) → optimistic → API → commit/rollback
│   └─ likedIds 注入 GroupCard.liked prop
├─ useClipboard
│   ├─ copy(text) → navigator.clipboard.writeText()
│   └─ 反馈 toast（成功/失败）
└─ SubmissionDialog (v-model:open)
    └─ 表单 → 客户端校验 → api.submit() → 成功/错误反馈
```

## 文件清单

```
migrations/
└── 0001_initial.sql

functions/_lib/
├── app.ts                          (更新：注册 routes)
├── env.ts                          (新增：Env 类型)
├── middleware/
│   ├── request-id.ts               (已有)
│   ├── error-handler.ts            (已有)
│   └── rate-limit.ts               (新增)
├── routes/
│   ├── groups.ts                   (新增：GET)
│   ├── submissions.ts              (新增：POST)
│   └── likes.ts                    (新增：PUT/DELETE)
├── services/
│   ├── rotation-service.ts         (新增：轮换算法)
│   └── submission-service.ts       (新增：提交流程)
├── repositories/
│   ├── group-repository.ts         (新增：D1 查询 + 行映射)
│   ├── like-repository.ts          (新增：点赞 CRUD)
│   └── rate-limit-repository.ts    (新增：限流计数器)
└── adapters/
    ├── turnstile-adapter.ts        (新增：Turnstile 验证)
    └── hash-adapter.ts             (新增：pepper hash)

src/
├── features/groups/
│   ├── components/
│   │   ├── GroupCard.vue
│   │   ├── GroupList.vue
│   │   └── SubmissionDialog.vue
│   ├── composables/
│   │   ├── useGroupDirectory.ts
│   │   ├── useLikedGroups.ts
│   │   └── useClipboard.ts
│   └── api.ts                      (功能级 API 调用)
├── shared/
│   ├── api/
│   │   └── client.ts               (fetch 封装 + Zod)
│   ├── components/                 (可复用 UI)
│   │   ├── ErrorBanner.vue
│   │   ├── LoadingSkeleton.vue
│   │   └── Toast.vue
│   └── browser/
│       └── storage.ts              (localStorage 封装)
├── views/
│   └── HomeView.vue                (更新：完整首页)
└── app/
    └── router.ts                   (已有)
```

## 权衡

- **无 Pinia**：composable 各自管理状态，无全局 store。点赞状态由 `useLikedGroups` 通过 props 注入组件。
- **直接 SQL**：保持 Function bundle 小，但需要严格行映射和 migration 测试。
- **轮换算法单一实现**：只在服务端，客户端只按 API 返回顺序渲染，避免两端实现不一致。
- **游标编码**：base64 JSON 不透明给客户端，但服务端可解码校验。后续可迁移到加密游标。
- **Turnstile 本地跳过**：`wrangler.jsonc` 中配置 `SKIP_TURNSTILE=true`，本地开发无需 Turnstile key。
