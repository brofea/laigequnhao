<script setup lang="ts">
import Icon from "./Icon.vue";

export interface ToastItem {
  id: number;
  tone: "success" | "info" | "warning" | "danger";
  message: string;
}

defineProps<{ items: ToastItem[] }>();
const emit = defineEmits<{ close: [id: number] }>();
</script>

<template>
  <div class="app-toasts" aria-live="polite" aria-atomic="true">
    <div
      v-for="item in items"
      :key="item.id"
      class="app-toast"
      :class="`app-toast--${item.tone}`"
      role="status"
    >
      <Icon
        :name="item.tone === 'danger' || item.tone === 'warning' ? 'warning' : 'check'"
        size="17"
      />
      <span>{{ item.message }}</span>
      <button type="button" aria-label="关闭提示" @click="emit('close', item.id)">
        <Icon name="close" size="15" />
      </button>
    </div>
  </div>
</template>
