<script setup lang="ts">
import PrototypeIcon, { type IconName } from "./PrototypeIcon.vue";

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
    class="proto-button"
    :class="[
      `proto-button--${props.variant}`,
      `proto-button--${props.size}`,
      `proto-button--tone-${props.tone}`,
      { 'proto-button--icon-only': props.iconOnly },
    ]"
    :type="props.type"
    :disabled="props.disabled || props.loading"
    :aria-busy="props.loading || undefined"
  >
    <span v-if="props.loading" class="proto-button__spinner" aria-hidden="true"></span>
    <PrototypeIcon
      v-else-if="props.icon"
      :name="props.icon"
      :size="props.size === 'sm' ? 16 : 18"
    />
    <span v-if="!props.iconOnly" class="proto-button__label"><slot /></span>
    <span v-if="props.loading" class="proto-button__sr-only">加载中</span>
  </button>
</template>
