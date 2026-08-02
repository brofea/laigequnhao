<script setup lang="ts">
import { computed, onMounted } from "vue";
import Badge from "./Badge.vue";
import Icon from "./Icon.vue";
import { useDashboard } from "@/features/admin/composables/useDashboard";

const { dashboard, health, fetchDashboard, fetchHealth } = useDashboard();

onMounted(() => {
  void fetchDashboard();
  void fetchHealth();
});

const kpis = computed(() => {
  const counts = dashboard.value?.statusCounts;
  const total = counts ? counts.pending + counts.published + counts.rejected + counts.delisted : 0;
  return [
    { label: "总群组", value: String(total), note: "当前数据", tone: "accent" },
    { label: "已发布", value: String(counts?.published ?? 0), note: "公开可见", tone: "success" },
    { label: "待处理", value: String(counts?.pending ?? 0), note: "需要审核", tone: "warning" },
    {
      label: "累计点赞",
      value: String(dashboard.value?.totalLikes ?? 0),
      note: "实时统计",
      tone: "info",
    },
  ];
});

const topGroups = computed(() =>
  (dashboard.value?.topLiked ?? []).map((group) => ({
    title: group.title,
    likes: group.likeCount,
    trend: "—",
  })),
);

const statusCounts = computed(
  () =>
    dashboard.value?.statusCounts ?? {
      pending: 0,
      published: 0,
      rejected: 0,
      delisted: 0,
    },
);

const totalGroups = computed(
  () =>
    statusCounts.value.pending +
    statusCounts.value.published +
    statusCounts.value.rejected +
    statusCounts.value.delisted,
);

function statusWidth(value: number): string {
  return `${String(totalGroups.value ? Math.round((value / totalGroups.value) * 100) : 0)}%`;
}
</script>

<template>
  <div class="stats-page">
    <div class="stats-page__heading">
      <div>
        <p class="eyebrow">Dashboard / local fixture</p>
        <h2>运行数据</h2>
        <p class="stats-page__intro">读取现有运行数据接口，保留原型的信息密度与状态表达。</p>
      </div>
      <Badge :tone="health?.api === 'ok' ? 'success' : 'warning'" dot>{{
        health?.api === "ok" ? "服务正常" : "检查中"
      }}</Badge>
    </div>

    <section class="stats-kpis" aria-label="核心指标">
      <article v-for="item in kpis" :key="item.label" class="stats-kpi">
        <span class="stats-kpi__label">{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <span class="stats-kpi__note" :class="`stats-kpi__note--${item.tone}`">{{
          item.note
        }}</span>
      </article>
    </section>

    <section class="stats-grid stats-grid--middle">
      <article class="stats-panel">
        <div class="stats-panel__heading">
          <div>
            <p class="eyebrow">Distribution</p>
            <h3>群组状态</h3>
          </div>
          <Icon name="menu" size="16" />
        </div>
        <div class="stats-bars">
          <div class="stats-bar-row">
            <span>已发布</span>
            <div class="stats-bar">
              <i :style="{ width: statusWidth(statusCounts.published) }"></i>
            </div>
            <strong>{{ statusCounts.published }}</strong>
          </div>
          <div class="stats-bar-row">
            <span>待审核</span>
            <div class="stats-bar">
              <i
                class="stats-bar--warning"
                :style="{ width: statusWidth(statusCounts.pending) }"
              ></i>
            </div>
            <strong>{{ statusCounts.pending }}</strong>
          </div>
          <div class="stats-bar-row">
            <span>已下架</span>
            <div class="stats-bar">
              <i
                class="stats-bar--danger"
                :style="{ width: statusWidth(statusCounts.delisted) }"
              ></i>
            </div>
            <strong>{{ statusCounts.delisted }}</strong>
          </div>
          <div class="stats-bar-row">
            <span>已拒绝</span>
            <div class="stats-bar">
              <i
                class="stats-bar--danger"
                :style="{ width: statusWidth(statusCounts.rejected) }"
              ></i>
            </div>
            <strong>{{ statusCounts.rejected }}</strong>
          </div>
        </div>
      </article>
      <article class="stats-panel">
        <div class="stats-panel__heading">
          <div>
            <p class="eyebrow">Platforms</p>
            <h3>平台分布</h3>
          </div>
          <span class="table-muted">{{ totalGroups }} 个群</span>
        </div>
        <div class="platform-donut">
          <div class="platform-donut__center"><strong>4</strong><span>平台</span></div>
        </div>
        <div class="platform-legend">
          <span><i class="platform-dot platform-dot--qq"></i>QQ <b>42%</b></span
          ><span><i class="platform-dot platform-dot--wechat"></i>微信群 <b>31%</b></span
          ><span><i class="platform-dot platform-dot--telegram"></i>Telegram <b>18%</b></span
          ><span><i class="platform-dot platform-dot--other"></i>其他 <b>9%</b></span>
        </div>
      </article>
    </section>

    <section class="stats-grid stats-grid--lower">
      <article class="stats-panel stats-panel--traffic">
        <div class="stats-panel__heading">
          <div>
            <p class="eyebrow">Traffic trend</p>
            <h3>访问趋势</h3>
          </div>
          <div class="stats-segmented">
            <button type="button" class="is-active">24h</button><button type="button">7d</button
            ><button type="button">30d</button>
          </div>
        </div>
        <div class="traffic-chart" aria-label="近 24 小时访问趋势 Mock 图表">
          <div class="traffic-chart__grid">
            <span>160</span><span>120</span><span>80</span><span>40</span><span>0</span>
          </div>
          <svg
            viewBox="0 0 720 220"
            preserveAspectRatio="none"
            role="img"
            aria-label="访问量逐步上升折线"
          >
            <defs>
              <linearGradient id="traffic-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stop-color="var(--accent)" stop-opacity=".24" />
                <stop offset="1" stop-color="var(--accent)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path
              class="traffic-chart__area"
              d="M0 178 L31 164 L62 170 L93 145 L124 154 L155 131 L186 119 L217 129 L248 105 L279 114 L310 91 L341 101 L372 77 L403 84 L434 66 L465 74 L496 52 L527 59 L558 43 L589 48 L620 30 L651 38 L682 22 L720 26 L720 220 L0 220Z"
            />
            <path
              class="traffic-chart__line"
              d="M0 178 L31 164 L62 170 L93 145 L124 154 L155 131 L186 119 L217 129 L248 105 L279 114 L310 91 L341 101 L372 77 L403 84 L434 66 L465 74 L496 52 L527 59 L558 43 L589 48 L620 30 L651 38 L682 22 L720 26"
            />
          </svg>
          <div class="traffic-chart__labels">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span
            ><span>现在</span>
          </div>
        </div>
      </article>
      <article class="stats-panel">
        <div class="stats-panel__heading">
          <div>
            <p class="eyebrow">Top groups</p>
            <h3>热门群组</h3>
          </div>
          <span class="table-muted">按点赞</span>
        </div>
        <ol class="stats-top-list">
          <li v-for="(group, index) in topGroups" :key="group.title">
            <span class="stats-top-list__rank">0{{ index + 1 }}</span
            ><span class="stats-top-list__title">{{ group.title }}</span
            ><strong>{{ group.likes }}</strong
            ><small>{{ group.trend }}</small>
          </li>
        </ol>
      </article>
    </section>

    <section class="stats-health" aria-label="系统健康">
      <div>
        <p class="eyebrow">System health</p>
        <h3>系统健康</h3>
      </div>
      <div class="stats-health__items">
        <span
          ><i class="health-dot"></i>API 服务 <strong>{{ health?.api ?? "检查中" }}</strong></span
        ><span
          ><i class="health-dot"></i>图片存储 <strong>{{ health?.r2 ?? "检查中" }}</strong></span
        ><span
          ><i class="health-dot health-dot--warning"></i>待审核队列
          <strong>{{ statusCounts.pending }} 条</strong></span
        >
      </div>
    </section>
  </div>
</template>
