<script setup lang="ts">
import { groupStatusLabels, groupStatusTones, type DemoGroup } from "../data/fixtures";
import Badge from "./Badge.vue";
import Button from "./Button.vue";
import Icon from "./Icon.vue";

export type AdminSortField = "title" | "status" | "tags" | "kind" | "likes" | "platform";
export type AdminSortDirection = "asc" | "desc" | null;
export type AdminTableAction = "remove" | "restore" | "purge";
export interface AdminTablePendingAction {
  groupId: string;
  action: AdminTableAction;
}

const props = withDefaults(
  defineProps<{
    groups: DemoGroup[];
    sortField: AdminSortField | null;
    sortDirection: AdminSortDirection;
    /** 回收站模式：操作列显示"恢复/永久删除"而非"编辑/删除" */
    recycleBin?: boolean;
    /** 列表读取或排序请求进行中；用于禁用重复查询。 */
    loading?: boolean;
    /** 兼容上层统一的异步状态命名。 */
    busy?: boolean;
    /** 禁止所有表格交互，但不表示组件正在执行异步动作。 */
    disabled?: boolean;
    /** 可并行存在的行级操作；key 由群组和动作共同组成。 */
    pendingActions?: readonly AdminTablePendingAction[];
  }>(),
  {
    recycleBin: false,
    loading: false,
    busy: false,
    disabled: false,
    pendingActions: () => [],
  },
);
const emit = defineEmits<{
  open: [group: DemoGroup];
  remove: [group: DemoGroup];
  restore: [group: DemoGroup];
  purge: [group: DemoGroup];
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

function tableBusy() {
  return props.loading || props.busy;
}

function isPending(groupId: string, action: AdminTableAction) {
  return props.pendingActions.some(
    (pending) => pending.groupId === groupId && pending.action === action,
  );
}

function isGroupBusy(groupId: string) {
  return props.pendingActions.some((pending) => pending.groupId === groupId);
}

function isDisabled(groupId?: string) {
  return props.disabled || (groupId ? isGroupBusy(groupId) : false);
}

function isActionDisabled(groupId: string, action: AdminTableAction) {
  return props.disabled || (isGroupBusy(groupId) && !isPending(groupId, action));
}

function sort(field: AdminSortField) {
  if (isDisabled()) return;
  emit("sort", field);
}

function open(group: DemoGroup) {
  if (isDisabled(group.id)) return;
  emit("open", group);
}

function runAction(action: AdminTableAction, group: DemoGroup) {
  if (isDisabled(group.id)) return;
  switch (action) {
    case "remove":
      emit("remove", group);
      break;
    case "restore":
      emit("restore", group);
      break;
    case "purge":
      emit("purge", group);
      break;
    default: {
      const exhaustiveAction: never = action;
      return exhaustiveAction;
    }
  }
}
</script>

<template>
  <div class="admin-table-wrap" :aria-busy="tableBusy() || undefined">
    <table class="admin-table" :class="{ 'admin-table--recycle-bin': props.recycleBin }">
      <caption class="app-sr-only">
        群组管理列表
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
            <Button
              type="button"
              variant="quiet"
              size="sm"
              class="admin-table__sort-button"
              :disabled="props.disabled"
              @click="sort(column.field)"
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
            </Button>
          </th>
          <th scope="col" class="admin-table__actions">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="group in props.groups"
          :key="group.id"
          :aria-busy="isGroupBusy(group.id) || undefined"
        >
          <th scope="row" class="admin-table__title">
            <span class="admin-table__name">{{ group.title }}</span
            ><span class="admin-table__subline">{{ group.id }}</span>
          </th>
          <td class="admin-table__status">
            <Badge :tone="groupStatusTones[group.status]" dot>
              {{ groupStatusLabels[group.status] }}
            </Badge>
          </td>
          <td class="admin-table__tags">
            <span class="table-muted">{{ group.tags.slice(0, 2).join("、") }}</span>
          </td>
          <td class="admin-table__kind">{{ group.kind }}</td>
          <td class="admin-table__likes">{{ group.likes }}</td>
          <td class="admin-table__platform">{{ group.platform }}</td>
          <td class="admin-table__actions">
            <template v-if="props.recycleBin">
              <Button
                class="table-link-button table-link-button--success"
                type="button"
                variant="quiet"
                size="sm"
                :disabled="isActionDisabled(group.id, 'restore')"
                :loading="isPending(group.id, 'restore')"
                @click="runAction('restore', group)"
              >
                <Icon name="check" size="14" />恢复
              </Button>
              <Button
                class="table-link-button table-link-button--danger"
                type="button"
                variant="quiet"
                size="sm"
                :disabled="isActionDisabled(group.id, 'purge')"
                :loading="isPending(group.id, 'purge')"
                @click="runAction('purge', group)"
              >
                <Icon name="trash" size="14" />永久删除
              </Button>
              <Button
                variant="quiet"
                size="sm"
                class="table-more-button"
                type="button"
                aria-label="更多操作"
                :disabled="isDisabled(group.id)"
                @click="open(group)"
              >
                <Icon name="more" size="17" />
              </Button>
            </template>
            <template v-else>
              <Button
                variant="quiet"
                size="sm"
                class="table-link-button"
                type="button"
                :disabled="isDisabled(group.id)"
                @click="open(group)"
              >
                <Icon name="edit" size="14" />编辑
              </Button>
              <Button
                class="table-link-button table-link-button--danger"
                type="button"
                variant="quiet"
                size="sm"
                :disabled="isActionDisabled(group.id, 'remove')"
                :loading="isPending(group.id, 'remove')"
                @click="runAction('remove', group)"
              >
                <Icon name="trash" size="14" />删除
              </Button>
              <Button
                variant="quiet"
                size="sm"
                class="table-more-button"
                type="button"
                aria-label="更多操作"
                :disabled="isDisabled(group.id)"
                @click="open(group)"
              >
                <Icon name="more" size="17" />
              </Button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="admin-table-mobile-note">
      窄屏保留标题、状态和扁平三点操作，其他信息在编辑抽屉中查看。
    </div>
  </div>
</template>
