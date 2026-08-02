<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: "neutral" | "accent" | "success" | "warning" | "danger";
    dot?: boolean;
  }>(),
  { tone: "neutral", dot: false },
);
</script>

<template>
  <span class="app-badge" :class="`app-badge--${tone}`">
    <span v-if="dot" class="app-badge__dot" aria-hidden="true"></span>
    <slot />
  </span>
</template>
