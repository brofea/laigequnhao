<script setup lang="ts">
import { ref, watch, nextTick } from "vue";

const props = defineProps<{
  open: boolean;
  groupTitle: string;
  qrCodeUrl: string;
  qrCodeMeta?: { width: number; height: number; byteLength: number } | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
const imageLoaded = ref(false);
const imageError = ref(false);
const previousFocus = ref<HTMLElement | null>(null);

function close() {
  emit("update:open", false);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    close();
  }
  // Tab trap
  if (e.key === "Tab" && dialogRef.value) {
    const focusable = dialogRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

// 焦点管理
watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      previousFocus.value = document.activeElement as HTMLElement;
      await nextTick();
      closeButtonRef.value?.focus();
    } else {
      previousFocus.value?.focus();
      previousFocus.value = null;
    }
  },
);

// 重置懒加载状态
watch(
  () => props.qrCodeUrl,
  () => {
    imageLoaded.value = false;
    imageError.value = false;
  },
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="dialogRef"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      :aria-label="`${groupTitle} 的二维码`"
      @click.self="close"
      @keydown="onKeydown"
    >
      <div class="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <!-- 标题栏 -->
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold text-gray-900 truncate">
            {{ groupTitle }}
          </h3>
          <button
            ref="closeButtonRef"
            type="button"
            class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭二维码"
            @click="close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        <!-- 二维码图片 -->
        <div class="flex items-center justify-center rounded-lg bg-gray-50 p-4">
          <!-- 加载中 -->
          <div
            v-if="!imageLoaded && !imageError"
            class="flex h-48 w-48 items-center justify-center"
          >
            <div
              class="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-primary"
            />
          </div>

          <!-- 图片 -->
          <img
            v-show="imageLoaded && !imageError"
            :src="qrCodeUrl"
            :alt="`${groupTitle} 二维码`"
            :width="qrCodeMeta?.width ?? 256"
            :height="qrCodeMeta?.height ?? 256"
            class="max-h-64 max-w-full rounded object-contain"
            loading="lazy"
            decoding="async"
            @load="imageLoaded = true"
            @error="imageError = true"
          />

          <!-- 加载失败 -->
          <div
            v-if="imageError"
            class="flex h-48 w-48 flex-col items-center justify-center text-gray-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mb-2 h-10 w-10"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="text-sm">二维码加载失败</span>
          </div>
        </div>

        <!-- 提示文字 -->
        <p class="mt-3 text-center text-xs text-gray-400">
          使用 {{ groupTitle }} 的二维码扫码加群
        </p>
      </div>
    </div>
  </Teleport>
</template>
