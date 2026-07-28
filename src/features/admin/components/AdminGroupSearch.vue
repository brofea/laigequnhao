<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  modelValue: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  search: [];
  clear: [];
}>();

const local = ref(props.modelValue);

watch(
  () => props.modelValue,
  (v) => {
    local.value = v;
  },
);

function onInput() {
  emit("update:modelValue", local.value);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    emit("search");
  }
}

function onClear() {
  local.value = "";
  emit("update:modelValue", "");
  emit("clear");
}
</script>

<template>
  <div class="relative">
    <input
      v-model="local"
      :disabled="disabled"
      type="search"
      placeholder="搜索标题、简介或标签..."
      class="w-full max-w-xs rounded-lg border border-gray-300 py-1.5 pl-8 pr-8 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-50"
      @input="onInput"
      @keydown="onKeydown"
    >
    <svg
      class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
    <button
      v-if="local"
      class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
      aria-label="清除搜索"
      @click="onClear"
    >
      <svg
        class="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  </div>
</template>
