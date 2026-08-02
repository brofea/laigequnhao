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

const props = defineProps<{
  boards: DemoBoard[];
  groups: DemoGroup[];
}>();

const emit = defineEmits<{
  reorder: [boards: DemoBoard[]];
  edit: [board: DemoBoard];
  editGroup: [group: DemoGroup, board: DemoBoard];
  addBoard: [];
  addGroup: [board: DemoBoard];
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

function editMember(board: DemoBoard, memberId: string) {
  const group = groupFor(memberId);
  if (group) emit("editGroup", group, board);
}

function moveBoard(id: string, offset: number) {
  const index = orderedBoards.value.findIndex((board) => board.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= orderedBoards.value.length) return;
  const next = [...orderedBoards.value];
  const [item] = next.splice(index, 1);
  if (!item) return;
  next.splice(target, 0, item);
  orderedBoards.value = next;
  emit("reorder", next);
  emit("toast", "板块顺序已在样例中更新");
}

function moveMember(boardId: string, memberId: string, offset: number) {
  const boardIndex = orderedBoards.value.findIndex((board) => board.id === boardId);
  const board = orderedBoards.value[boardIndex];
  if (!board) return;
  const memberIndex = board.members.indexOf(memberId);
  const targetIndex = memberIndex + offset;
  if (memberIndex < 0 || targetIndex < 0 || targetIndex >= board.members.length) return;
  const nextMembers = [...board.members];
  const [member] = nextMembers.splice(memberIndex, 1);
  if (!member) return;
  nextMembers.splice(targetIndex, 0, member);
  const nextBoards = [...orderedBoards.value];
  nextBoards[boardIndex] = { ...board, members: nextMembers };
  orderedBoards.value = nextBoards;
  emit("reorder", nextBoards);
  emit("toast", "成员顺序已在样例中更新");
}

function deleteBoard(id: string) {
  const board = orderedBoards.value.find((item) => item.id === id);
  if (!board) return;
  orderedBoards.value = orderedBoards.value.filter((item) => item.id !== id);
  confirmDeleteId.value = null;
  emit("toast", `已模拟删除“${board.title}”，未产生真实变更`);
}
</script>

<template>
  <div class="board-manager">
    <div class="board-manager__toolbar">
      <div>
        <p class="eyebrow">Boards / local fixture</p>
        <h2>板块排序与成员预览</h2>
      </div>
      <Button variant="normal" size="sm" icon="plus" @click="emit('addBoard')"
        >添加板块</Button
      >
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
            :aria-expanded="expandedId === board.id"
            @click="expandedId = expandedId === board.id ? null : board.id"
          >
            <span>
              <strong>{{ board.title }}</strong>
              <span class="board-panel__description">{{ board.description }}</span>
            </span>
            <Icon
              :name="expandedId === board.id ? 'chevron-up' : 'chevron-down'"
              size="18"
            />
          </button>
          <Badge :tone="board.enabled ? 'success' : 'neutral'" dot>{{
            board.enabled ? "启用" : "未启用"
          }}</Badge>
          <span class="board-panel__count">{{ board.memberCount }} 个群组</span>
          <div class="board-panel__actions">
            <Button
              variant="normal"
              size="sm"
              icon="chevron-up"
              icon-only
              :disabled="index === 0"
              :aria-label="`上移 ${board.title}`"
              @click="moveBoard(board.id, -1)"
            />
            <Button
              variant="normal"
              size="sm"
              icon="chevron-down"
              icon-only
              :disabled="index === orderedBoards.length - 1"
              :aria-label="`下移 ${board.title}`"
              @click="moveBoard(board.id, 1)"
            />
            <Button
              variant="normal"
              size="sm"
              icon="edit"
              icon-only
              :aria-label="`编辑 ${board.title}`"
              @click="emit('edit', board)"
            />
            <Button
              variant="normal"
              size="sm"
              icon="trash"
              icon-only
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
                @click="deleteBoard(board.id)"
              >
                >确认删除</Button
              >
              <Button variant="quiet" size="sm" @click="confirmDeleteId = null"
                >取消</Button
              >
            </span>
          </div>
          <div v-else class="board-members-toolbar">
            <span class="table-muted">固定高度成员表 · 内部滚动</span>
            <Button variant="quiet" size="sm" icon="plus" @click="emit('addGroup', board)"
              >添加新群</Button
            >
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
                    <Badge :tone="memberStatusTone(memberId)" dot>{{
                      memberStatusLabel(memberId)
                    }}</Badge>
                  </td>
                  <td>
                    <div class="board-member-order-actions">
                      <button
                        class="table-icon-button"
                        type="button"
                        :disabled="board.members.indexOf(memberId) === 0"
                        :aria-label="`上移 ${groupFor(memberId)?.title ?? memberId}`"
                        @click="moveMember(board.id, memberId, -1)"
                      >
                        <Icon name="chevron-up" size="14" />
                      </button>
                      <button
                        class="table-icon-button"
                        type="button"
                        :disabled="board.members.indexOf(memberId) === board.members.length - 1"
                        :aria-label="`下移 ${groupFor(memberId)?.title ?? memberId}`"
                        @click="moveMember(board.id, memberId, 1)"
                      >
                        <Icon name="chevron-down" size="14" />
                      </button>
                    </div>
                  </td>
                  <td>
                    <div class="board-member-actions">
                      <button
                        class="table-link-button"
                        type="button"
                        @click="editMember(board, memberId)"
                      >
                        <Icon name="edit" size="14" />编辑
                      </button>
                      <button
                        class="table-link-button table-link-button--danger"
                        type="button"
                        @click="emit('toast', '已模拟移除成员')"
                      >
                        <Icon name="arrow-right" size="14" />移除
                      </button>
                    </div>
                    <button
                      class="board-member-more"
                      type="button"
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
