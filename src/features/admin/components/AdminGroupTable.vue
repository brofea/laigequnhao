<script setup lang="ts">
/* eslint-disable no-useless-assignment */
import type { AdminGroupDto } from "@shared/contracts/group";

defineProps<{
  groups: AdminGroupDto[];
  loading: boolean;
  deletedFilter: boolean;
}>();

const emit = defineEmits<{
  edit: [group: AdminGroupDto];
  softDelete: [id: string];
  restore: [id: string];
  permanentDelete: [id: string];
}>();

const statusLabels: Record<string, string> = {
  pending: "待审核",
  published: "已发布",
  rejected: "已拒绝",
  delisted: "已下架",
};
const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  published: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  delisted: "bg-gray-100 text-gray-600",
};
</script>

<template>
  <div v-if="loading" class="py-8 text-center text-gray-400">加载中...</div>

  <div v-else-if="groups.length === 0" class="py-8 text-center text-gray-400">暂无群聊</div>

  <table v-else class="w-full text-sm">
    <thead>
      <tr class="border-b text-left text-gray-500">
        <th class="px-3 py-2">标题</th>
        <th class="px-3 py-2">性质</th>
        <th class="px-3 py-2">状态</th>
        <th class="px-3 py-2">平台</th>
        <th class="px-3 py-2">点赞</th>
        <th class="px-3 py-2">操作</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="group in groups" :key="group.id" class="border-b hover:bg-gray-50">
        <td class="px-3 py-2 font-medium">{{ group.title }}</td>
        <td class="px-3 py-2">{{ group.kind === "official" ? "官方群" : "同好群" }}</td>
        <td class="px-3 py-2">
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="statusColors[group.status]"
          >
            {{ statusLabels[group.status] ?? group.status }}
          </span>
        </td>
        <td class="px-3 py-2">{{ group.platform }}</td>
        <td class="px-3 py-2">{{ group.likeCount }}</td>
        <td class="px-3 py-2">
          <div class="flex gap-1">
            <button
              v-if="!deletedFilter"
              class="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
              @click="emit('edit', group)"
            >
              编辑
            </button>
            <button
              v-if="!deletedFilter"
              class="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              @click="emit('softDelete', group.id)"
            >
              删除
            </button>
            <button
              v-if="deletedFilter"
              class="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50"
              @click="emit('restore', group.id)"
            >
              恢复
            </button>
            <button
              v-if="deletedFilter"
              class="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              @click="emit('permanentDelete', group.id)"
            >
              永久删除
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
