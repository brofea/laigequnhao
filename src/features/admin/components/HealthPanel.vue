<script setup lang="ts">
defineProps<{
  health: { api: string; d1: string; r2: string; version: string; deployedAt: string } | null;
  loading: boolean;
}>();
</script>

<template>
  <div class="rounded-lg border bg-white p-4">
    <h3 class="text-sm font-semibold text-gray-700">系统健康</h3>
    <div v-if="loading" class="mt-2 text-sm text-gray-400">检查中...</div>
    <div v-else-if="health" class="mt-2 space-y-1 text-sm">
      <div class="flex items-center gap-2">
        <span
          class="h-2 w-2 rounded-full"
          :class="health.api === 'ok' ? 'bg-green-500' : 'bg-red-500'"
        />
        API: {{ health.api === "ok" ? "正常" : "异常" }}
      </div>
      <div class="flex items-center gap-2">
        <span
          class="h-2 w-2 rounded-full"
          :class="health.d1 === 'ok' ? 'bg-green-500' : 'bg-red-500'"
        />
        D1: {{ health.d1 === "ok" ? "正常" : "异常" }}
      </div>
      <div class="flex items-center gap-2">
        <span
          class="h-2 w-2 rounded-full"
          :class="health.r2 === 'ok' ? 'bg-green-500' : 'bg-red-500'"
        />
        R2: {{ health.r2 === "ok" ? "正常" : "异常" }}
      </div>
      <p class="text-xs text-gray-400">版本: {{ health.version || "N/A" }}</p>
    </div>
    <div v-else class="mt-2 text-sm text-red-400">无法获取健康状态</div>
  </div>
</template>
