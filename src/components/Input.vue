<script setup lang="ts">
import Icon from "./Icon.vue";

type InputStatus = "default" | "error" | "loading";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    placeholder?: string;
    status?: InputStatus;
    helpText?: string;
    clearable?: boolean;
  }>(),
  { placeholder: "", status: "default", helpText: "", clearable: false },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  clear: [];
}>();
</script>

<template>
  <label class="app-field" :class="{ 'app-field--error': props.status === 'error' }">
    <span class="app-field__label">{{ props.label }}</span>
    <span class="app-field__control">
      <Icon name="search" size="18" />
      <input
        :value="props.modelValue"
        type="search"
        :placeholder="props.placeholder"
        :aria-invalid="props.status === 'error'"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <span
        v-if="props.status === 'loading'"
        class="app-field__spinner"
        aria-label="搜索中"
      ></span>
      <button
        v-else-if="props.clearable && props.modelValue"
        class="app-field__clear"
        type="button"
        aria-label="清除搜索"
        @click="emit('clear')"
      >
        <Icon name="close" size="16" />
      </button>
    </span>
    <span v-if="props.helpText" class="app-field__help">{{ props.helpText }}</span>
  </label>
</template>
