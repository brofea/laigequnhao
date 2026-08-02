<script setup lang="ts">
import Icon, { type IconName } from "./Icon.vue";

type ButtonVariant = "normal" | "quiet";
type ButtonSize = "sm" | "md" | "lg";
type ButtonTone = "default" | "danger";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    tone?: ButtonTone;
    size?: ButtonSize;
    loading?: boolean;
    icon?: IconName;
    iconOnly?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  {
    variant: "normal",
    tone: "default",
    size: "md",
    loading: false,
    iconOnly: false,
    disabled: false,
    type: "button",
  },
);
</script>

<template>
  <button
    class="app-button"
    :class="[
      `app-button--${props.variant}`,
      `app-button--${props.size}`,
      `app-button--tone-${props.tone}`,
      { 'app-button--icon-only': props.iconOnly },
    ]"
    :type="props.type"
    :disabled="props.disabled || props.loading"
    :aria-busy="props.loading || undefined"
  >
    <span v-if="props.loading" class="app-button__spinner" aria-hidden="true"></span>
    <Icon
      v-else-if="props.icon"
      :name="props.icon"
      :size="props.size === 'sm' ? 16 : 18"
    />
    <span v-if="!props.iconOnly" class="app-button__label"><slot /></span>
    <span v-if="props.loading" class="app-button__sr-only">加载中</span>
  </button>
</template>
