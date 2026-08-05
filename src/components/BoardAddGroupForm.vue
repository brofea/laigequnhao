<script setup lang="ts">
import { computed, ref } from "vue";
import type { DemoBoard, DemoGroup } from "../data/fixtures";
import Button from "./Button.vue";
import Input from "./Input.vue";

const props = defineProps<{
  board: DemoBoard;
  groups: DemoGroup[];
  /** 当前正在提交到板块的群组 ID；同一动作期间禁止重复添加。 */
  addingGroupId?: string | null;
  /** 整个添加流程的忙碌状态，例如上层正在重新同步板块快照。 */
  busy?: boolean;
  /** 禁止添加表单交互，但不表示组件正在执行异步动作。 */
  disabled?: boolean;
}>();

const emit = defineEmits<{
  add: [group: DemoGroup];
  cancel: [];
}>();

const query = ref("");
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase());
const failedAvatarIds = ref(new Set<string>());
const results = computed(() => {
  if (!normalizedQuery.value) return [];
  return props.groups.filter(
    (group) =>
      !props.board.members.includes(group.id) &&
      group.title.toLocaleLowerCase().includes(normalizedQuery.value),
  );
});

function onAvatarError(groupId: string) {
  failedAvatarIds.value = new Set(failedAvatarIds.value).add(groupId);
}

function isAdding(groupId: string) {
  return props.addingGroupId === groupId;
}

function isFormBusy() {
  return Boolean(props.busy || props.addingGroupId);
}

function isActionDisabled(groupId?: string) {
  return Boolean(
    props.disabled || props.busy || (props.addingGroupId && groupId && !isAdding(groupId)),
  );
}

function addLabel(title: string) {
  return `添加群组 ${title}`;
}

function addGroup(group: DemoGroup) {
  if (isActionDisabled(group.id) || isAdding(group.id)) return;
  emit("add", group);
}

function cancel() {
  if (isFormBusy() || props.disabled) return;
  emit("cancel");
}
</script>

<template>
  <div class="board-add-group-form" :aria-busy="isFormBusy() || undefined">
    <div class="board-edit-form__intro">
      <p class="eyebrow">Add group to board</p>
      <p>输入群组名称后再查询，空搜索不会渲染结果，也不会触发任何数据请求。</p>
    </div>
    <Input
      v-model="query"
      label="搜索群组"
      placeholder="按群组名称查找"
      clearable
      @clear="query = ''"
    />
    <div v-if="normalizedQuery" class="board-group-search-results" role="listbox">
      <Button
        v-for="group in results"
        :key="group.id"
        class="board-group-search-result"
        type="button"
        role="option"
        :aria-label="addLabel(group.title)"
        :disabled="isActionDisabled(group.id)"
        variant="normal"
        size="sm"
        icon="plus"
        :loading="isAdding(group.id)"
        @click="addGroup(group)"
      >
        <span
          class="group-avatar group-avatar--mini"
          :class="`group-avatar--${group.avatarState}`"
          aria-hidden="true"
        >
          <img
            v-if="group.avatarState === 'ready' && group.logoUrl && !failedAvatarIds.has(group.id)"
            :src="group.logoUrl"
            :alt="group.title"
            loading="lazy"
            @error="onAvatarError(group.id)"
          />
          <span v-else-if="group.avatarState === 'ready'">{{ group.title.slice(0, 1) }}</span>
          <span v-else-if="group.avatarState === 'missing'">◎</span>
          <span v-else>!</span>
        </span>
        <strong>{{ group.title }}</strong>
      </Button>
      <div v-if="!results.length" class="app-empty app-empty--compact">
        <strong>没有匹配的群组</strong><span>换一个群组名称再试试。</span>
      </div>
    </div>
    <div class="admin-edit-form__footer">
      <span class="admin-edit-form__footer-spacer"></span>
      <Button
        variant="quiet"
        type="button"
        :disabled="isFormBusy() || props.disabled"
        :aria-busy="isFormBusy() ? 'true' : undefined"
        @click="cancel"
      >
        取消
      </Button>
    </div>
  </div>
</template>
