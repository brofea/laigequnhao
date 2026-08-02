<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import Icon, { type IconName } from "./Icon.vue";

export interface SelectOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    options: SelectOption[];
    description?: string;
    triggerLabel?: string;
    triggerIcon?: IconName;
  }>(),
  { description: "" },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

function selectedLabel() {
  if (props.triggerLabel) return props.triggerLabel;
  return props.options.find((option) => option.value === props.modelValue)?.label ?? "请选择";
}

function toggle() {
  open.value = !open.value;
  activeIndex.value = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.modelValue),
  );
}

function choose(value: string) {
  emit("update:modelValue", value);
  open.value = false;
}

function onKeydown(event: KeyboardEvent) {
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
      :aria-expanded="open"
      :aria-label="props.label"
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
          'app-select__option--selected': props.modelValue === option.value,
          'app-select__option--active': activeIndex === index,
        }"
        :aria-selected="props.modelValue === option.value"
        @mouseenter="activeIndex = index"
        @click="choose(option.value)"
      >
        <span>{{ option.label }}</span
        ><Icon v-if="props.modelValue === option.value" name="check" size="15" />
      </button>
    </div>
    <span v-if="props.description" class="app-select__description">{{ props.description }}</span>
  </div>
</template>
