<script setup lang="ts">
/* eslint-disable no-useless-assignment */
import type { AdminGroupDto } from "@shared/contracts/group";
import type { AdminSortField, AdminSortDir } from "@shared/contracts/group";

defineProps<{
  groups: AdminGroupDto[];
  loading: boolean;
  deletedFilter: boolean;
  total: number;
  nextCursor: string | null;
  sortBy: AdminSortField | undefined;
  sortDir: AdminSortDir;
}>();

const emit = defineEmits<{
  edit: [group: AdminGroupDto];
  softDelete: [id: string];
  restore: [id: string];
  permanentDelete: [id: string];
  sort: [field: AdminSortField];
  loadMore: [];
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
  <div v-if="loading && groups.length === 0" class="py-8 text-center text-gray-400">加载中...</div>

  <div v-else-if="groups.length === 0" class="py-8 text-center text-gray-400">暂无群聊</div>

  <template v-else>
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b text-left text-gray-500">
          <th class="px-3 py-2" :aria-sort="sortBy === 'title' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
            <button
              class="inline-flex items-center gap-1 font-medium hover:text-gray-700"
              @click="emit('sort', 'title')"
            >
              标题
              <span v-if="sortBy === 'title'" class="text-xs">{{ sortDir === 'asc' ? '\u2191' : '\u2193' }}</span>
            </button>
          </th>
          <th class="px-3 py-2" :aria-sort="sortBy === 'kind' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
            <button
              class="inline-flex items-center gap-1 font-medium hover:text-gray-700"
              @click="emit('sort', 'kind')"
            >
              性质
              <span v-if="sortBy === 'kind'" class="text-xs">{{ sortDir === 'asc' ? '\u2191' : '\u2193' }}</span>
            </button>
          </th>
          <th class="px-3 py-2" :aria-sort="sortBy === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
            <button
              class="inline-flex items-center gap-1 font-medium hover:text-gray-700"
              @click="emit('sort', 'status')"
            >
              状态
              <span v-if="sortBy === 'status'" class="text-xs">{{ sortDir === 'asc' ? '\u2191' : '\u2193' }}</span>
            </button>
          </th>
          <th class="px-3 py-2" :aria-sort="sortBy === 'platform' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
            <button
              class="inline-flex items-center gap-1 font-medium hover:text-gray-700"
              @click="emit('sort', 'platform')"
            >
              平台
              <span v-if="sortBy === 'platform'" class="text-xs">{{ sortDir === 'asc' ? '\u2191' : '\u2193' }}</span>
            </button>
          </th>
          <th class="px-3 py-2" :aria-sort="sortBy === 'tags' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
            <button
              class="inline-flex items-center gap-1 font-medium hover:text-gray-700"
              @click="emit('sort', 'tags')"
            >
              标签
              <span v-if="sortBy === 'tags'" class="text-xs">{{ sortDir === 'asc' ? '\u2191' : '\u2193' }}</span>
            </button>
          </th>
          <th class="px-3 py-2" :aria-sort="sortBy === 'likeCount' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
            <button
              class="inline-flex items-center gap-1 font-medium hover:text-gray-700"
              @click="emit('sort', 'likeCount')"
            >
              点赞
              <span v-if="sortBy === 'likeCount'" class="text-xs">{{ sortDir === 'asc' ? '\u2191' : '\u2193' }}</span>
            </button>
          </th>
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
          <td class="px-3 py-2">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(tag, i) in group.tags"
                :key="i"
                class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
              >{{ tag }}</span>
              <span v-if="group.tags.length === 0" class="text-xs text-gray-400">&mdash;</span>
            </div>
          </td>
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

    <!-- Pagination footer -->
    <div v-if="total > 0" class="flex items-center justify-between px-3 py-3 text-sm text-gray-500">
      <span>共 {{ total }} 条</span>
      <button
        v-if="nextCursor"
        class="rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200 disabled:opacity-50"
        :disabled="loading"
        @click="emit('loadMore')"
      >
        加载更多
      </button>
    </div>
  </template>
</template>
