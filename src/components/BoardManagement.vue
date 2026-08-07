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
    /** 板块列表读取中，仅标记管理区忙碌语义；独立操作由 pendingActions 锁定。 */
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
    // 板块为异步加载：首次填充前 setup 时 boards 为空，expandedId 仍为 null。
    // 只在首次填充时自动展开首个板块；后续重新加载不打断用户手动折叠状态。
    const firstLoad = orderedBoards.value.length === 0;
    orderedBoards.value = [...props.boards];
    if (firstLoad && expandedId.value === null && orderedBoards.value[0]?.id) {
      expandedId.value = orderedBoards.value[0].id;
    }
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

function hasGlobalReorderPending() {
  return props.pendingActions.some((pending) => pending.action === "reorder");
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
  return (
    hasGlobalReorderPending() || props.pendingActions.some((pending) => pending.boardId === boardId)
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
  return hasPending("reorder", boardId);
}

function isBoardActionDisabled(boardId: string, action?: BoardManagementAction) {
  const actionPending = action ? hasPending(action, boardId) : false;
  return props.disabled || (isBoardBusy(boardId) && !actionPending);
}

function isMemberActionDisabled(
  boardId: string,
  memberId: string,
  action: "move-member" | "remove-member",
  direction?: "up" | "down",
) {
  const actionPending =
    action === "move-member" && direction
      ? memberMoveLoading(boardId, memberId, direction)
      : hasPending(action, boardId, memberId);
  return props.disabled || (isMemberBusy(boardId, memberId) && !actionPending);
}

function editMember(board: DemoBoard, memberId: string) {
  if (props.disabled || isMemberBusy(board.id, memberId)) return;
  const group = groupFor(memberId);
  if (group) emit("editGroup", group, board);
}

function moveBoard(id: string, offset: number) {
  if (isBoardBusy(id)) return;
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
  if (props.disabled || isMemberBusy(board.id, memberId)) return;
  const direction = offset < 0 ? "up" : "down";
  emit("moveMember", board, memberId, direction);
}

function removeMember(board: DemoBoard, memberId: string) {
  if (props.disabled || isMemberBusy(board.id, memberId)) return;
  emit("removeMember", board, memberId);
}

function confirmDelete(board: DemoBoard) {
  if (props.disabled || isBoardBusy(board.id)) return;
  emit("delete", board);
}

function openBoardEditor(board: DemoBoard) {
  if (props.disabled || isBoardBusy(board.id)) return;
  emit("edit", board);
}

function openAddGroup(board: DemoBoard) {
  if (props.disabled || isBoardBusy(board.id)) return;
  emit("addGroup", board);
}

function createBoard() {
  if (props.disabled || props.createBusy || hasPending("create")) return;
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
        :disabled="props.disabled"
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
        :aria-busy="isBoardBusy(board.id) || undefined"
      >
        <header class="board-panel__header">
          <button
            class="board-panel__toggle"
            type="button"
            :disabled="props.disabled || isBoardBusy(board.id)"
            :aria-busy="isBoardBusy(board.id) || undefined"
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
              :loading="isReorderBusy(board.id)"
              :disabled="
                props.disabled || (isBoardBusy(board.id) && !isReorderBusy(board.id)) || index === 0
              "
              :aria-label="`上移 ${board.title}`"
              @click="moveBoard(board.id, -1)"
            />
            <Button
              variant="normal"
              size="sm"
              icon="chevron-down"
              icon-only
              :loading="isReorderBusy(board.id)"
              :disabled="
                props.disabled ||
                (isBoardBusy(board.id) && !isReorderBusy(board.id)) ||
                index === orderedBoards.length - 1
              "
              :aria-label="`下移 ${board.title}`"
              @click="moveBoard(board.id, 1)"
            />
            <Button
              variant="normal"
              size="sm"
              icon="edit"
              icon-only
              :disabled="isBoardActionDisabled(board.id)"
              :aria-label="`编辑 ${board.title}`"
              @click="openBoardEditor(board)"
            />
            <Button
              variant="normal"
              size="sm"
              icon="trash"
              icon-only
              :disabled="isBoardActionDisabled(board.id)"
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
                :disabled="isBoardActionDisabled(board.id, 'delete')"
                @click="confirmDelete(board)"
              >
                确认删除
              </Button>
              <Button
                variant="quiet"
                size="sm"
                :disabled="props.disabled || hasPending('delete', board.id)"
                :aria-busy="hasPending('delete', board.id) ? 'true' : undefined"
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
              :disabled="isBoardActionDisabled(board.id, 'add-group')"
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
                <tr
                  v-for="memberId in board.members"
                  :key="memberId"
                  :aria-busy="isMemberBusy(board.id, memberId) || undefined"
                >
                  <th scope="row">{{ groupFor(memberId)?.title ?? memberId }}</th>
                  <td class="board-members__status">
                    <Badge :tone="memberStatusTone(memberId)" dot>
                      {{ memberStatusLabel(memberId) }}
                    </Badge>
                  </td>
                  <td>
                    <div class="board-member-order-actions">
                      <Button
                        class="table-icon-button"
                        type="button"
                        variant="quiet"
                        size="sm"
                        icon="chevron-up"
                        icon-only
                        :loading="memberMoveLoading(board.id, memberId, 'up')"
                        :disabled="
                          isMemberActionDisabled(board.id, memberId, 'move-member', 'up') ||
                          board.members.indexOf(memberId) === 0
                        "
                        :aria-label="`上移 ${groupFor(memberId)?.title ?? memberId}`"
                        @click="moveMember(board, memberId, -1)"
                      />
                      <Button
                        class="table-icon-button"
                        type="button"
                        variant="quiet"
                        size="sm"
                        icon="chevron-down"
                        icon-only
                        :loading="memberMoveLoading(board.id, memberId, 'down')"
                        :disabled="
                          isMemberActionDisabled(board.id, memberId, 'move-member', 'down') ||
                          board.members.indexOf(memberId) === board.members.length - 1
                        "
                        :aria-label="`下移 ${groupFor(memberId)?.title ?? memberId}`"
                        @click="moveMember(board, memberId, 1)"
                      />
                    </div>
                  </td>
                  <td>
                    <div class="board-member-actions">
                      <Button
                        class="table-link-button"
                        type="button"
                        variant="quiet"
                        size="sm"
                        :disabled="isMemberActionDisabled(board.id, memberId, 'move-member')"
                        @click="editMember(board, memberId)"
                      >
                        <Icon name="edit" size="14" />编辑
                      </Button>
                      <Button
                        class="table-link-button table-link-button--danger"
                        type="button"
                        variant="quiet"
                        size="sm"
                        :loading="hasPending('remove-member', board.id, memberId)"
                        :disabled="isMemberActionDisabled(board.id, memberId, 'remove-member')"
                        @click="removeMember(board, memberId)"
                      >
                        <Icon name="arrow-right" size="14" />移除
                      </Button>
                    </div>
                    <Button
                      variant="quiet"
                      size="sm"
                      class="board-member-more"
                      type="button"
                      :disabled="isMemberActionDisabled(board.id, memberId, 'move-member')"
                      :aria-label="`更多操作 ${groupFor(memberId)?.title ?? memberId}`"
                      @click="editMember(board, memberId)"
                    >
                      <Icon name="more" size="18" />
                    </Button>
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
