<script setup lang="ts">
import { computed, ref } from "vue";
import type { DemoBoard, DemoGroup } from "../data/fixtures";
import PrototypeButton from "./PrototypeButton.vue";
import PrototypeIcon from "./PrototypeIcon.vue";
import PrototypeInput from "./PrototypeInput.vue";

const props = defineProps<{
  board: DemoBoard;
  groups: DemoGroup[];
}>();

const emit = defineEmits<{
  add: [group: DemoGroup];
  cancel: [];
}>();

const query = ref("");
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase());
const results = computed(() => {
  if (!normalizedQuery.value) return [];
  return props.groups.filter(
    (group) =>
      !props.board.members.includes(group.id) &&
      group.title.toLocaleLowerCase().includes(normalizedQuery.value),
  );
});
</script>

<template>
  <div class="board-add-group-form">
    <div class="board-edit-form__intro">
      <p class="eyebrow">Add group to board</p>
      <p>输入群组名称后再查询，空搜索不会渲染结果，也不会触发任何数据请求。</p>
    </div>
    <PrototypeInput
      v-model="query"
      label="搜索群组"
      placeholder="按群组名称查找"
      clearable
      @clear="query = ''"
    />
    <div v-if="normalizedQuery" class="board-group-search-results" role="listbox">
      <button
        v-for="group in results"
        :key="group.id"
        class="board-group-search-result"
        type="button"
        role="option"
        :aria-label="`添加群组 ${group.title}`"
        @click="emit('add', group)"
      >
        <span
          class="group-avatar group-avatar--mini"
          :class="`group-avatar--${group.avatarState}`"
          aria-hidden="true"
        >
          <span v-if="group.avatarState === 'ready'">{{ group.title.slice(0, 1) }}</span>
          <span v-else-if="group.avatarState === 'missing'">◎</span>
          <span v-else>!</span>
        </span>
        <strong>{{ group.title }}</strong>
        <PrototypeIcon name="plus" size="16" />
      </button>
      <div v-if="!results.length" class="proto-empty proto-empty--compact">
        <strong>没有匹配的群组</strong><span>换一个群组名称再试试。</span>
      </div>
    </div>
    <div class="admin-edit-form__footer">
      <span class="admin-edit-form__footer-spacer"></span>
      <PrototypeButton variant="quiet" type="button" @click="emit('cancel')">取消</PrototypeButton>
    </div>
  </div>
</template>
