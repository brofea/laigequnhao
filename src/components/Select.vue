<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon, { type IconName } from "./Icon.vue";

export interface SelectOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    /** 单选模式为 string；multiple=true 时为 string[]。 */
    modelValue: string | string[];
    label: string;
    options: SelectOption[];
    /** 多选模式：可同时勾选多个选项，点击选项切换选中态且菜单不收起。 */
    multiple?: boolean;
    description?: string;
    triggerLabel?: string;
    triggerIcon?: IconName;
    loading?: boolean;
    disabled?: boolean;
  }>(),
  { multiple: false, description: "", loading: false, disabled: false },
);

const emit = defineEmits<{ "update:modelValue": [value: string | string[]] }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

function selectedValues(): string[] {
  if (!props.multiple) return [props.modelValue as string];
  return Array.isArray(props.modelValue) ? props.modelValue : [];
}

function isOptionSelected(value: string): boolean {
  return selectedValues().includes(value);
}

function selectedLabel() {
  // 多选模式不展示"已选项文本"，由 triggerLabel 提供静态文案。
  if (props.multiple) return props.triggerLabel || "请选择";
  if (props.triggerLabel) return props.triggerLabel;
  return props.options.find((option) => option.value === props.modelValue)?.label ?? "请选择";
}

function toggle() {
  if (props.disabled || props.loading) return;
  open.value = !open.value;
  activeIndex.value = Math.max(
    0,
    props.options.findIndex((option) => isOptionSelected(option.value)),
  );
}

function choose(value: string) {
  if (props.disabled || props.loading) return;
  if (props.multiple) {
    const current = selectedValues();
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    emit("update:modelValue", next);
    // 多选模式：点击选项后保持菜单展开，由外部点击 / ESC 收起。
    return;
  }
  emit("update:modelValue", value);
  open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled || props.loading) return;
  if (!open.value && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
    event.preventDefault();
    toggle();
    return;
  }
  if (!open.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    open.value = false;
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, props.options.length - 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const option = props.options[activeIndex.value];
    if (option) choose(option.value);
  }
}

function closeOnOutside(event: PointerEvent) {
  if (root.value && event.target instanceof Node && !root.value.contains(event.target))
    open.value = false;
}

onMounted(() => {
  document.addEventListener("pointerdown", closeOnOutside);
});

watch(
  () => props.disabled || props.loading,
  (isUnavailable) => {
    if (isUnavailable) open.value = false;
  },
);

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutside);
});
</script>

<template>
  <div ref="root" class="app-select" :class="{ 'app-select--open': open }">
    <span class="app-select__label">{{ props.label }}</span>
    <button
      class="app-select__trigger"
      type="button"
      role="combobox"
      :aria-expanded="open && !props.disabled && !props.loading"
      :aria-label="props.label"
      :aria-busy="props.loading || undefined"
      :disabled="props.disabled || props.loading"
      @click="toggle"
      @keydown="onKeydown"
    >
      <Icon
        v-if="props.triggerIcon"
        class="app-select__trigger-icon"
        :name="props.triggerIcon"
        size="16"
      />
      <span>{{ selectedLabel() }}</span>
      <Icon name="chevron-down" size="16" />
    </button>
    <div v-if="open" class="app-select__menu" role="listbox" :aria-label="props.label">
      <button
        v-for="(option, index) in props.options"
        :key="option.value"
        type="button"
        role="option"
        class="app-select__option"
        :class="{
          'app-select__option--selected': isOptionSelected(option.value),
          'app-select__option--active': activeIndex === index,
        }"
        :aria-selected="isOptionSelected(option.value)"
        @mouseenter="activeIndex = index"
        @click="choose(option.value)"
      >
        <span>{{ option.label }}</span
        ><Icon
          v-if="isOptionSelected(option.value)"
          class="app-select__check"
          name="check"
          size="15"
        />
      </button>
    </div>
    <span v-if="props.description" class="app-select__description">{{ props.description }}</span>
  </div>
</template>
