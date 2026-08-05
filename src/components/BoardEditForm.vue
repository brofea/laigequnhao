<script setup lang="ts">
import { computed, reactive } from "vue";
import type { DemoBoard } from "../data/fixtures";
import Button from "./Button.vue";
import Select from "./Select.vue";

const props = withDefaults(
  defineProps<{
    board: DemoBoard;
    createMode?: boolean;
    /** 保存/创建板块时的异步状态。 */
    busy?: boolean;
    /** 禁止表单交互，但不表示正在等待网络响应。 */
    disabled?: boolean;
  }>(),
  {
    createMode: false,
    busy: false,
    disabled: false,
  },
);
const emit = defineEmits<{
  save: [board: DemoBoard];
  cancel: [];
}>();

const draft = reactive({
  title: props.board.title,
  description: props.board.description,
  enabled: props.board.enabled ? "enabled" : "disabled",
});

const enabledOptions = [
  { value: "enabled", label: "启用" },
  { value: "disabled", label: "未启用" },
];

const isDisabled = computed(() => props.disabled || props.busy);

function save() {
  if (isDisabled.value) return;
  emit("save", {
    ...props.board,
    title: draft.title,
    description: draft.description,
    enabled: draft.enabled === "enabled",
  });
}
</script>

<template>
  <form class="board-edit-form" :aria-busy="props.busy || undefined" @submit.prevent="save">
    <div class="board-edit-form__intro">
      <p class="eyebrow">Board details</p>
      <p>
        {{
          props.createMode
            ? "创建一个新的公开板块，之后可以在板块表格中添加群组并调整成员顺序。"
            : "编辑板块的公开标题、说明和启用状态；成员顺序仍在板块表格中调整。"
        }}
      </p>
    </div>
    <label class="admin-edit-field">
      <span>板块标题</span>
      <span class="admin-edit-field__control">
        <input v-model="draft.title" type="text" maxlength="60" required :disabled="isDisabled" />
      </span>
    </label>
    <label class="admin-edit-field">
      <span>板块描述</span>
      <span class="admin-edit-field__control admin-edit-field__control--textarea">
        <textarea
          v-model="draft.description"
          rows="4"
          maxlength="200"
          :disabled="isDisabled"
        ></textarea>
      </span>
      <small>{{ draft.description.length }}/200</small>
    </label>
    <Select
      v-model="draft.enabled"
      label="状态"
      :options="enabledOptions"
      :loading="props.busy"
      :disabled="props.disabled"
    />
    <div class="board-edit-form__summary">
      <span>当前成员</span><strong>{{ props.board.members.length }} 个群组</strong>
    </div>
    <div class="admin-edit-form__footer">
      <Button
        variant="quiet"
        type="button"
        :disabled="props.disabled || props.busy"
        :aria-busy="props.busy ? 'true' : undefined"
        @click="emit('cancel')"
      >
        取消
      </Button>
      <Button
        variant="normal"
        type="submit"
        icon="check"
        :loading="props.busy"
        :disabled="props.disabled"
      >
        {{ props.createMode ? "创建板块" : "保存板块" }}
      </Button>
    </div>
  </form>
</template>
