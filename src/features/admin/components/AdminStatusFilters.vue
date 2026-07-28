<script setup lang="ts">
/* eslint-disable no-useless-assignment */
import type { GroupStatus } from "@shared/domain";

defineProps<{
  statuses: GroupStatus[];
  deleted: boolean;
}>();

const emit = defineEmits<{
  toggleStatus: [status: GroupStatus];
  toggleDeleted: [];
}>();

const STATUS_ORDER: GroupStatus[] = ["pending", "published", "rejected", "delisted"];

const statusLabels: Record<GroupStatus, string> = {
  pending: "待审核",
  published: "已发布",
  rejected: "已拒绝",
  delisted: "已下架",
};

const statusColors: Record<GroupStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  published: "bg-green-100 text-green-800 border-green-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  delisted: "bg-gray-100 text-gray-600 border-gray-300",
};
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <button
      v-for="s in STATUS_ORDER"
      :key="s"
      :disabled="deleted"
      class="rounded-full border px-3 py-1 text-sm font-medium transition-colors"
      :class="[
        statuses.includes(s) && !deleted
          ? statusColors[s] + ' border-2'
          : 'border-gray-200 bg-white text-gray-400',
        deleted ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:border-gray-400',
      ]"
      @click="emit('toggleStatus', s)"
    >
      {{ statusLabels[s] }}
    </button>
    <button
      class="rounded-full border px-3 py-1 text-sm font-medium transition-colors"
      :class="
        deleted
          ? 'border-red-300 bg-red-100 text-red-800'
          : 'cursor-pointer border-gray-200 bg-white text-gray-500 hover:border-gray-400'
      "
      @click="emit('toggleDeleted')"
    >
      回收站
    </button>
  </div>
</template>
