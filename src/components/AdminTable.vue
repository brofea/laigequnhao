<script setup lang="ts">
import { groupStatusLabels, groupStatusTones, type DemoGroup } from "../data/fixtures";
import Badge from "./Badge.vue";
import Icon from "./Icon.vue";

export type AdminSortField = "title" | "status" | "tags" | "kind" | "likes" | "platform";
export type AdminSortDirection = "asc" | "desc" | null;

const props = defineProps<{
  groups: DemoGroup[];
  sortField: AdminSortField | null;
  sortDirection: AdminSortDirection;
}>();
const emit = defineEmits<{
  open: [group: DemoGroup];
  remove: [group: DemoGroup];
  sort: [field: AdminSortField];
}>();

const columns: Array<{ field: AdminSortField; label: string; className: string }> = [
  { field: "title", label: "标题", className: "admin-table__title" },
  { field: "status", label: "状态", className: "admin-table__status" },
  { field: "tags", label: "标签", className: "admin-table__tags" },
  { field: "kind", label: "性质", className: "admin-table__kind" },
  { field: "likes", label: "点赞", className: "admin-table__likes" },
  { field: "platform", label: "平台", className: "admin-table__platform" },
];

function ariaSort(field: AdminSortField) {
  if (props.sortField !== field || !props.sortDirection) return "none";
  return props.sortDirection === "asc" ? "ascending" : "descending";
}
</script>

<template>
  <div class="admin-table-wrap">
    <table class="admin-table">
      <caption class="app-sr-only">
        固定模拟数据的群组管理列表
      </caption>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.field"
            scope="col"
            :class="column.className"
            :aria-sort="ariaSort(column.field)"
          >
            <button
              type="button"
              class="admin-table__sort-button"
              @click="emit('sort', column.field)"
            >
              <span>{{ column.label }}</span>
              <Icon
                :name="
                  props.sortField !== column.field || !props.sortDirection
                    ? 'minus'
                    : props.sortDirection === 'desc'
                      ? 'chevron-up'
                      : 'chevron-down'
                "
                size="13"
              />
              <span class="app-sr-only">{{
                ariaSort(column.field) === "none"
                  ? "未排序"
                  : ariaSort(column.field) === "ascending"
                    ? "升序"
                    : "降序"
              }}</span>
            </button>
          </th>
          <th scope="col" class="admin-table__actions">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="group in props.groups" :key="group.id">
          <th scope="row" class="admin-table__title">
            <span class="admin-table__name">{{ group.title }}</span
            ><span class="admin-table__subline">{{ group.id }}</span>
          </th>
          <td class="admin-table__status">
            <Badge :tone="groupStatusTones[group.status]" dot>{{
              groupStatusLabels[group.status]
            }}</Badge>
          </td>
          <td class="admin-table__tags">
            <span class="table-muted">{{ group.tags.slice(0, 2).join("、") }}</span>
          </td>
          <td class="admin-table__kind">{{ group.kind }}</td>
          <td class="admin-table__likes">{{ group.likes }}</td>
          <td class="admin-table__platform">{{ group.platform }}</td>
          <td class="admin-table__actions">
            <button class="table-link-button" type="button" @click="emit('open', group)">
              <Icon name="edit" size="14" />编辑
            </button>
            <button
              class="table-link-button table-link-button--danger"
              type="button"
              @click="emit('remove', group)"
            >
              <Icon name="trash" size="14" />删除
            </button>
            <button
              class="table-more-button"
              type="button"
              aria-label="更多操作"
              @click="emit('open', group)"
            >
              <Icon name="more" size="17" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="admin-table-mobile-note">
      窄屏保留标题、状态和扁平三点操作，其他信息在编辑抽屉中查看。
    </div>
  </div>
</template>
