<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  analytics: { range: string; data: unknown } | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  "range-change": [range: string];
}>();

const selectedRange = ref("7d");

function changeRange(r: string) {
  selectedRange.value = r;
  emit("range-change", r);
}
</script>

<template>
  <div class="rounded-lg border bg-white p-4">
    <h3 class="text-sm font-semibold text-gray-700">流量分析</h3>
    <div class="mt-2 flex gap-2">
      <button
        v-for="r in ['24h', '7d', '30d']"
        :key="r"
        class="rounded px-3 py-1 text-xs"
        :class="selectedRange === r ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600'"
        @click="changeRange(r)"
      >
        {{ r }}
      </button>
    </div>
    <div v-if="loading" class="mt-2 text-sm text-gray-400">加载中...</div>
    <div v-else-if="analytics?.data" class="mt-2 text-xs text-gray-500">
      Analytics 数据已加载 ({{ analytics.range }})
    </div>
    <div v-else class="mt-2 text-sm text-gray-400">暂无数据（需配置 Analytics Token）</div>
  </div>
</template>
