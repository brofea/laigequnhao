<script setup lang="ts">
import { ref, watch } from "vue";
import {
  groupStatusLabels,
  groupStatusTones,
  type DemoBoard,
  type DemoGroup,
} from "../data/fixtures";
import Badge from "./Badge.vue";
import Button from "./Button.vue";
import Icon from "./Icon.vue";

export type BoardManagementAction =
  "create" | "reorder" | "edit" | "delete" | "add-group" | "move-member" | "remove-member";

export interface BoardManagementPendingAction {
  boardId?: string;
  action: BoardManagementAction;
  groupId?: string;
  direction?: "up" | "down";
}

const props = withDefaults(
  defineProps<{
    boards: DemoBoard[];
    groups: DemoGroup[];
    /** 板块或成员的资源级 pending；不同板块/成员可以并行操作。 */
    pendingActions?: readonly BoardManagementPendingAction[];
    /** 板块列表读取中，阻止重复触发本地管理操作。 */
    loading?: boolean;
    /** 兼容上层统一的异步状态命名。 */
    busy?: boolean;
    /** 禁止整个板块管理区交互，但不表示组件正在执行异步动作。 */
    disabled?: boolean;
    /** 新增板块请求的独立 pending。 */
    createBusy?: boolean;
  }>(),
  {
    pendingActions: () => [],
    loading: false,
    busy: false,
    disabled: false,
    createBusy: false,
  },
);

const emit = defineEmits<{
  reorder: [boards: DemoBoard[]];
  edit: [board: DemoBoard];
  editGroup: [group: DemoGroup, board: DemoBoard];
  addBoard: [];
  addGroup: [board: DemoBoard];
  delete: [board: DemoBoard];
  moveMember: [board: DemoBoard, memberId: string, direction: "up" | "down"];
  removeMember: [board: DemoBoard, memberId: string];
  toast: [message: string];
}>();

const orderedBoards = ref<DemoBoard[]>([...props.boards]);
const expandedId = ref<string | null>(orderedBoards.value[0]?.id ?? null);
const confirmDeleteId = ref<string | null>(null);

watch(
  () => props.boards.map((board) => board.id),
  () => {
    orderedBoards.value = [...props.boards];
  },
);

function groupFor(id: string) {
  return props.groups.find((group) => group.id === id);
}

function memberStatusTone(memberId: string) {
  const group = groupFor(memberId);
  return group ? groupStatusTones[group.status] : "neutral";
}

function memberStatusLabel(memberId: string) {
  const group = groupFor(memberId);
  return group ? groupStatusLabels[group.status] : "未知状态";
}

function managerBusy() {
  return props.loading || props.busy;
}

function hasPending(action: BoardManagementAction, boardId?: string, groupId?: string) {
  return props.pendingActions.some(
    (pending) =>
      pending.action === action &&
      (boardId === undefined || pending.boardId === undefined || pending.boardId === boardId) &&
      (groupId === undefined || pending.groupId === undefined || pending.groupId === groupId),
  );
}

function isBoardBusy(boardId: string) {
  return props.pendingActions.some(
    (pending) =>
      pending.boardId === boardId ||
      (pending.action === "reorder" && pending.boardId === undefined),
  );
}

function isMemberBusy(boardId: string, memberId: string) {
  return (
    hasPending("move-member", boardId, memberId) || hasPending("remove-member", boardId, memberId)
  );
}

function memberMoveLoading(boardId: string, memberId: string, direction: "up" | "down") {
  return props.pendingActions.some(
    (pending) =>
      pending.action === "move-member" &&
      (pending.boardId === undefined || pending.boardId === boardId) &&
      (pending.groupId === undefined || pending.groupId === memberId) &&
      (pending.direction === undefined || pending.direction === direction),
  );
}

function isReorderBusy(boardId: string) {
  return managerBusy() || props.disabled || hasPending("reorder") || isBoardBusy(boardId);
}

function editMember(board: DemoBoard, memberId: string) {
  if (managerBusy() || props.disabled || isMemberBusy(board.id, memberId)) return;
  const group = groupFor(memberId);
  if (group) emit("editGroup", group, board);
}

function moveBoard(id: string, offset: number) {
  if (isReorderBusy(id)) return;
  const index = orderedBoards.value.findIndex((board) => board.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= orderedBoards.value.length) return;
  const next = [...orderedBoards.value];
  const [item] = next.splice(index, 1);
  if (!item) return;
  next.splice(target, 0, item);
  orderedBoards.value = next;
  emit("reorder", next);
}

function moveMember(board: DemoBoard, memberId: string, offset: number) {
  if (managerBusy() || props.disabled || isMemberBusy(board.id, memberId)) return;
  const direction = offset < 0 ? "up" : "down";
  emit("moveMember", board, memberId, direction);
}

function removeMember(board: DemoBoard, memberId: string) {
  if (managerBusy() || props.disabled || isMemberBusy(board.id, memberId)) return;
  emit("removeMember", board, memberId);
}

function confirmDelete(board: DemoBoard) {
  if (managerBusy() || props.disabled || isBoardBusy(board.id)) return;
  emit("delete", board);
}

function openBoardEditor(board: DemoBoard) {
  if (managerBusy() || props.disabled || isBoardBusy(board.id)) return;
  emit("edit", board);
}

function openAddGroup(board: DemoBoard) {
  if (managerBusy() || props.disabled || isBoardBusy(board.id)) return;
  emit("addGroup", board);
}

function createBoard() {
  if (managerBusy() || props.disabled || props.createBusy || hasPending("create")) return;
  emit("addBoard");
}
</script>

<template>
  <div
    class="board-manager"
    :aria-busy="managerBusy() || props.pendingActions.length > 0 || undefined"
  >
    <div class="board-manager__toolbar">
      <div>
        <p class="eyebrow">Boards / local fixture</p>
        <h2>板块排序与成员预览</h2>
      </div>
      <Button
        variant="normal"
        size="sm"
        icon="plus"
        :loading="props.createBusy || hasPending('create')"
        :disabled="props.disabled || managerBusy()"
        @click="createBoard"
      >
        添加板块
      </Button>
    </div>

    <div class="board-list">
      <article
        v-for="(board, index) in orderedBoards"
        :key="board.id"
        class="board-panel"
        :class="{
          'board-panel--disabled': !board.enabled,
        }"
      >
        <header class="board-panel__header">
          <button
            class="board-panel__toggle"
            type="button"
            :disabled="props.disabled || managerBusy() || isBoardBusy(board.id)"
            :aria-expanded="expandedId === board.id"
            @click="expandedId = expandedId === board.id ? null : board.id"
          >
            <span>
              <strong>{{ board.title }}</strong>
              <span class="board-panel__description">{{ board.description }}</span>
            </span>
            <Icon :name="expandedId === board.id ? 'chevron-up' : 'chevron-down'" size="18" />
          </button>
          <Badge :tone="board.enabled ? 'success' : 'neutral'" dot>
            {{ board.enabled ? "启用" : "未启用" }}
          </Badge>
          <span class="board-panel__count">{{ board.memberCount }} 个群组</span>
          <div class="board-panel__actions">
            <Button
              variant="normal"
              size="sm"
              icon="chevron-up"
              icon-only
              :loading="isReorderBusy(board.id) && hasPending('reorder', board.id)"
              :disabled="isReorderBusy(board.id) || index === 0"
              :aria-label="`上移 ${board.title}`"
              @click="moveBoard(board.id, -1)"
            />
            <Button
              variant="normal"
              size="sm"
              icon="chevron-down"
              icon-only
              :loading="isReorderBusy(board.id) && hasPending('reorder', board.id)"
              :disabled="isReorderBusy(board.id) || index === orderedBoards.length - 1"
              :aria-label="`下移 ${board.title}`"
              @click="moveBoard(board.id, 1)"
            />
            <Button
              variant="normal"
              size="sm"
              icon="edit"
              icon-only
              :disabled="props.disabled || managerBusy() || isBoardBusy(board.id)"
              :aria-label="`编辑 ${board.title}`"
              @click="openBoardEditor(board)"
            />
            <Button
              variant="normal"
              size="sm"
              icon="trash"
              icon-only
              :loading="hasPending('delete', board.id)"
              :disabled="props.disabled || managerBusy() || isBoardBusy(board.id)"
              :aria-label="`删除 ${board.title}`"
              @click="confirmDeleteId = board.id"
            />
          </div>
        </header>

        <div v-if="expandedId === board.id" class="board-panel__content">
          <div v-if="confirmDeleteId === board.id" class="delete-confirm" role="alert">
            <span><strong>确认删除这个板块？</strong> 这只是固定数据中的视觉演示。</span>
            <span class="delete-confirm__actions">
              <Button
                variant="normal"
                tone="danger"
                size="sm"
                :loading="hasPending('delete', board.id)"
                :disabled="props.disabled || managerBusy()"
                @click="confirmDelete(board)"
              >
                确认删除
              </Button>
              <Button
                variant="quiet"
                size="sm"
                :disabled="props.disabled || managerBusy() || hasPending('delete', board.id)"
                @click="confirmDeleteId = null"
                >取消</Button
              >
            </span>
          </div>
          <div v-else class="board-members-toolbar">
            <span class="table-muted">固定高度成员表 · 内部滚动</span>
            <Button
              variant="quiet"
              size="sm"
              icon="plus"
              :loading="hasPending('add-group', board.id)"
              :disabled="props.disabled || managerBusy() || isBoardBusy(board.id)"
              @click="openAddGroup(board)"
            >
              添加新群
            </Button>
          </div>
          <div v-if="board.members.length" class="board-members">
            <table>
              <caption class="app-sr-only">
                {{
                  board.title
                }}成员
              </caption>
              <thead>
                <tr>
                  <th scope="col">群组</th>
                  <th scope="col" class="board-members__status">状态</th>
                  <th scope="col" class="board-members__order">顺序</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="memberId in board.members" :key="memberId">
                  <th scope="row">{{ groupFor(memberId)?.title ?? memberId }}</th>
                  <td class="board-members__status">
                    <Badge :tone="memberStatusTone(memberId)" dot>
                      {{ memberStatusLabel(memberId) }}
                    </Badge>
                  </td>
                  <td>
                    <div class="board-member-order-actions">
                      <button
                        class="table-icon-button"
                        type="button"
                        :disabled="
                          props.disabled ||
                          managerBusy() ||
                          isMemberBusy(board.id, memberId) ||
                          board.members.indexOf(memberId) === 0
                        "
                        :aria-busy="memberMoveLoading(board.id, memberId, 'up') || undefined"
                        :aria-label="`上移 ${groupFor(memberId)?.title ?? memberId}`"
                        @click="moveMember(board, memberId, -1)"
                      >
                        <span
                          v-if="memberMoveLoading(board.id, memberId, 'up')"
                          class="app-button__spinner"
                          aria-hidden="true"
                        ></span
                        ><Icon v-else name="chevron-up" size="14" />
                      </button>
                      <button
                        class="table-icon-button"
                        type="button"
                        :disabled="
                          props.disabled ||
                          managerBusy() ||
                          isMemberBusy(board.id, memberId) ||
                          board.members.indexOf(memberId) === board.members.length - 1
                        "
                        :aria-busy="memberMoveLoading(board.id, memberId, 'down') || undefined"
                        :aria-label="`下移 ${groupFor(memberId)?.title ?? memberId}`"
                        @click="moveMember(board, memberId, 1)"
                      >
                        <span
                          v-if="memberMoveLoading(board.id, memberId, 'down')"
                          class="app-button__spinner"
                          aria-hidden="true"
                        ></span
                        ><Icon v-else name="chevron-down" size="14" />
                      </button>
                    </div>
                  </td>
                  <td>
                    <div class="board-member-actions">
                      <button
                        class="table-link-button"
                        type="button"
                        :disabled="
                          props.disabled || managerBusy() || isMemberBusy(board.id, memberId)
                        "
                        @click="editMember(board, memberId)"
                      >
                        <Icon name="edit" size="14" />编辑
                      </button>
                      <button
                        class="table-link-button table-link-button--danger"
                        type="button"
                        :disabled="
                          props.disabled || managerBusy() || isMemberBusy(board.id, memberId)
                        "
                        :aria-busy="hasPending('remove-member', board.id, memberId) || undefined"
                        @click="removeMember(board, memberId)"
                      >
                        <span
                          v-if="hasPending('remove-member', board.id, memberId)"
                          class="app-button__spinner"
                          aria-hidden="true"
                        ></span
                        ><Icon v-else name="arrow-right" size="14" />移除
                      </button>
                    </div>
                    <button
                      class="board-member-more"
                      type="button"
                      :disabled="
                        props.disabled || managerBusy() || isMemberBusy(board.id, memberId)
                      "
                      :aria-label="`更多操作 ${groupFor(memberId)?.title ?? memberId}`"
                      @click="editMember(board, memberId)"
                    >
                      <Icon name="more" size="18" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="app-empty app-empty--compact">
            <strong>这个板块还没有成员</strong><span>启用后可以从群组列表中添加。</span>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
