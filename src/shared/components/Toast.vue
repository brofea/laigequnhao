<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  message: string;
  type?: "success" | "error";
  duration?: number;
}>();

const visible = ref(false);

watch(
  () => props.message,
  (msg) => {
    if (msg) {
      visible.value = true;
      setTimeout(() => {
        visible.value = false;
      }, props.duration ?? 2000);
    }
  },
);
</script>

<template>
  <Transition name="toast">
    <div
      v-if="visible"
      class="fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg"
      :class="type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'"
      role="status"
      aria-live="polite"
    >
      {{ message }}
    </div>
  </Transition>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
