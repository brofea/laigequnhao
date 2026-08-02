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
let previousActiveElement: HTMLElement | null = null;

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

onMounted(() => {
  previousActiveElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", closeOnEscape);
  void nextTick(() => closeButton.value?.focus());
});

onBeforeUnmount(() => {
  document.body.style.overflow = "";
  document.removeEventListener("keydown", closeOnEscape);
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
