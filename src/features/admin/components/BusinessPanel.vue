<script setup lang="ts">
defineProps<{
  dashboard: {
    statusCounts: { pending: number; published: number; rejected: number; delisted: number };
    totalLikes: number;
    recentSubmissions: number;
    topLiked: Array<{ id: string; title: string; likeCount: number }>;
  } | null;
  loading: boolean;
}>();
</script>

<template>
  <div class="rounded-lg border bg-white p-4">
    <h3 class="text-sm font-semibold text-gray-700">业务指标</h3>
    <div v-if="loading" class="mt-2 text-sm text-gray-400">加载中...</div>
    <div v-else-if="dashboard" class="mt-2 space-y-3 text-sm">
      <div class="grid grid-cols-2 gap-2">
        <div class="rounded bg-yellow-50 px-3 py-2">
          <span class="text-xs text-gray-500">待审核</span>
          <p class="text-lg font-bold text-yellow-700">{{ dashboard.statusCounts.pending }}</p>
        </div>
        <div class="rounded bg-green-50 px-3 py-2">
          <span class="text-xs text-gray-500">已发布</span>
          <p class="text-lg font-bold text-green-700">{{ dashboard.statusCounts.published }}</p>
        </div>
        <div class="rounded bg-red-50 px-3 py-2">
          <span class="text-xs text-gray-500">已拒绝</span>
          <p class="text-lg font-bold text-red-700">{{ dashboard.statusCounts.rejected }}</p>
        </div>
        <div class="rounded bg-gray-50 px-3 py-2">
          <span class="text-xs text-gray-500">已下架</span>
          <p class="text-lg font-bold text-gray-600">{{ dashboard.statusCounts.delisted }}</p>
        </div>
      </div>
      <p>
        总点赞: <strong>{{ dashboard.totalLikes }}</strong>
      </p>
      <p>
        近 7 天新增: <strong>{{ dashboard.recentSubmissions }}</strong> 个提交
      </p>
      <div v-if="dashboard.topLiked.length > 0">
        <p class="text-xs text-gray-500">热门群聊 Top 5:</p>
        <ol class="list-inside list-decimal text-xs">
          <li v-for="g in dashboard.topLiked.slice(0, 5)" :key="g.id">
            {{ g.title }} ({{ g.likeCount }} 赞)
          </li>
        </ol>
      </div>
    </div>
    <div v-else class="mt-2 text-sm text-red-400">无法获取业务数据</div>
  </div>
</template>
