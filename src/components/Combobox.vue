<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "./Icon.vue";

/** 选项结构，与 Select.vue 的 SelectOption 保持一致（组合输入框只读使用）。 */
export interface ComboboxOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    /** 当前值：可编辑输入，值即自定义内容，可为列表中不存在的项。 */
    modelValue: string;
    label?: string;
    options: ComboboxOption[];
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { label: "", placeholder: "", disabled: false },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

let menuSeq = 0;
const menuId = `app-combobox-menu-${String(++menuSeq)}`;

/** 过滤后展示的选项：输入非空时仅显示包含输入内容的选项；不匹配时允许输入任意值。 */
const visibleOptions = computed(() => {
  const keyword = props.modelValue.trim().toLowerCase();
  if (!keyword) return props.options;
  return props.options.filter((option) => option.label.toLowerCase().includes(keyword));
});

function openMenu() {
  if (props.disabled) return;
  open.value = true;
  activeIndex.value = 0;
}

function toggleMenu() {
  if (props.disabled) return;
  open.value = !open.value;
  activeIndex.value = 0;
}

function choose(value: string) {
  if (props.disabled) return;
  emit("update:modelValue", value);
  open.value = false;
}

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if (event.key === "Escape") {
    event.preventDefault();
    open.value = false;
    return;
  }
  if (!open.value) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeIndex.value = Math.min(
      activeIndex.value + 1,
      Math.max(visibleOptions.value.length - 1, 0),
    );
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const option = visibleOptions.value[activeIndex.value];
    if (option) choose(option.value);
  }
}

function closeOnOutside(event: PointerEvent) {
  if (root.value && event.target instanceof Node && !root.value.contains(event.target))
    open.value = false;
}

watch(
  () => props.disabled,
  (isDisabled) => {
    if (isDisabled) open.value = false;
  },
);

onMounted(() => {
  document.addEventListener("pointerdown", closeOnOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutside);
});
</script>

<template>
  <div
    ref="root"
    class="app-combobox"
    :class="{
      'app-combobox--open': open,
      'app-combobox--disabled': props.disabled,
    }"
  >
    <span v-if="props.label" class="app-combobox__label">{{ props.label }}</span>
    <div class="app-combobox__control">
      <input
        class="app-combobox__input"
        type="text"
        :value="props.modelValue"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        role="combobox"
        :aria-expanded="open && !props.disabled"
        :aria-label="props.label || undefined"
        :aria-controls="open ? menuId : undefined"
        @focus="openMenu"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button
        class="app-combobox__arrow"
        type="button"
        :aria-label="props.label ? `展开${props.label}选项` : '展开选项'"
        :disabled="props.disabled"
        @click="toggleMenu"
      >
        <Icon name="chevron-down" size="16" />
      </button>
    </div>
    <div
      v-if="open"
      :id="menuId"
      class="app-select__menu"
      role="listbox"
      :aria-label="props.label || undefined"
    >
      <button
        v-for="(option, index) in visibleOptions"
        :key="option.value"
        type="button"
        role="option"
        class="app-select__option"
        :class="{
          'app-select__option--selected': option.value === props.modelValue,
          'app-select__option--active': activeIndex === index,
        }"
        :aria-selected="option.value === props.modelValue"
        @mouseenter="activeIndex = index"
        @click="choose(option.value)"
      >
        <span>{{ option.label }}</span>
      </button>
      <p v-if="!visibleOptions.length" class="app-combobox__empty">没有匹配的选项</p>
    </div>
  </div>
</template>
