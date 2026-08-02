<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    labelledBy?: string;
    size?: "detail" | "submit" | "form";
    testId?: string;
  }>(),
  {
    size: "detail",
  },
);

const emit = defineEmits<{ close: [] }>();
const closeButton = ref<HTMLButtonElement | null>(null);
const dialogElement = ref<HTMLElement | null>(null);
let previousActiveElement: HTMLElement | null = null;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(): HTMLElement[] {
  const root = dialogElement.value;
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("hidden") && el.getClientRects().length > 0,
  );
}

/** 焦点锁定：Tab/Shift+Tab 在弹窗内循环，不逃逸到背景页面 */
function trapFocus(event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const focusable = focusableElements();
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  const root = dialogElement.value;
  const activeInDialog = active instanceof HTMLElement && Boolean(root?.contains(active));

  if (!activeInDialog) {
    // 焦点在弹窗外（遮罩/背景）：拉回弹窗内
    event.preventDefault();
    const target = event.shiftKey ? last : first;
    target.focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

onMounted(() => {
  previousActiveElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", closeOnEscape);
  document.addEventListener("keydown", trapFocus);
  void nextTick(() => closeButton.value?.focus());
});

onBeforeUnmount(() => {
  document.body.style.overflow = "";
  document.removeEventListener("keydown", closeOnEscape);
  document.removeEventListener("keydown", trapFocus);
  previousActiveElement?.focus();
});
</script>

<template>
  <div class="app-dialog-layer" role="presentation">
    <button
      class="app-dialog-backdrop"
      type="button"
      aria-label="关闭弹窗"
      @click="emit('close')"
    ></button>
    <section
      ref="dialogElement"
      class="app-dialog"
      :class="`app-dialog--${props.size ?? 'detail'}`"
      :data-dialog="props.testId"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="props.labelledBy"
      tabindex="-1"
    >
      <header class="app-dialog__header">
        <div>
          <p class="eyebrow">视觉样例 · 模拟数据</p>
          <h2 :id="props.labelledBy">{{ props.title }}</h2>
        </div>
        <button
          ref="closeButton"
          class="app-button app-button--quiet app-button--sm app-button--icon-only"
          type="button"
          aria-label="关闭弹窗"
          @click="emit('close')"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="app-dialog__body"><slot /></div>
      <footer v-if="$slots.footer" class="app-dialog__footer"><slot name="footer" /></footer>
    </section>
  </div>
</template>
