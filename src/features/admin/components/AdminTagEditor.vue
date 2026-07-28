<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  tags: string[];
  error: string | null;
}>();

const emit = defineEmits<{
  add: [tag: string];
  remove: [index: number];
  "move-up": [index: number];
  "move-down": [index: number];
}>();

const newTag = ref("");

function handleAdd() {
  const trimmed = newTag.value.trim();
  if (!trimmed) return;
  if (props.tags.length >= 5) return;
  emit("add", trimmed);
  newTag.value = "";
}
</script>

<template>
  <fieldset class="space-y-3">
    <legend class="text-sm font-semibold text-gray-700">
      标签
      <span class="font-normal text-gray-400">（{{ tags.length }}/5）</span>
    </legend>

    <!-- 已有标签 -->
    <ul v-if="tags.length > 0" class="flex flex-wrap gap-2">
      <li
        v-for="(tag, i) in tags"
        :key="i"
        class="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-3 py-1 text-sm text-brand-primary"
      >
        <button
          v-if="i > 0"
          type="button"
          class="text-brand-primary/60 hover:text-brand-primary"
          title="上移"
          @click="emit('move-up', i)"
        >
          ↑
        </button>
        <span>{{ tag }}</span>
        <button
          v-if="i < tags.length - 1"
          type="button"
          class="text-brand-primary/60 hover:text-brand-primary"
          title="下移"
          @click="emit('move-down', i)"
        >
          ↓
        </button>
        <button
          type="button"
          class="ml-1 text-brand-primary/40 hover:text-red-500"
          title="删除"
          @click="emit('remove', i)"
        >
          ×
        </button>
      </li>
    </ul>

    <!-- 添加 -->
    <div v-if="tags.length < 5" class="flex gap-2">
      <input
        v-model="newTag"
        type="text"
        maxlength="30"
        placeholder="输入标签后回车"
        class="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        @keydown.enter.prevent="handleAdd"
      />
      <button
        type="button"
        class="rounded bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
        :disabled="!newTag.trim()"
        @click="handleAdd"
      >
        添加
      </button>
    </div>

    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
  </fieldset>
</template>
