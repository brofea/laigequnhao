<script setup lang="ts">
export type IconName =
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "chevron-down"
  | "chevron-up"
  | "close"
  | "copy"
  | "external"
  | "github"
  | "heart"
  | "info"
  | "menu"
  | "minus"
  | "moon"
  | "plus"
  | "search"
  | "sun"
  | "system"
  | "grip"
  | "trash"
  | "edit"
  | "more"
  | "warning"
  | "upload";

const props = withDefaults(
  defineProps<{
    name: IconName;
    size?: number | string;
  }>(),
  { size: 18 },
);
</script>

<template>
  <svg
    class="proto-icon"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-if="props.name === 'arrow-left'" d="m15 18-6-6 6-6" />
    <path v-else-if="props.name === 'arrow-right'" d="m9 18 6-6-6-6" />
    <path v-else-if="props.name === 'check'" d="m5 12 4 4L19 6" />
    <path v-else-if="props.name === 'chevron-down'" d="m6 9 6 6 6-6" />
    <path v-else-if="props.name === 'chevron-up'" d="m6 15 6-6 6 6" />
    <path v-else-if="props.name === 'close'" d="m6 6 12 12M18 6 6 18" />
    <path v-else-if="props.name === 'copy'" d="M8 8h8v10H8zM6 16H5V5h9v1" />
    <path v-else-if="props.name === 'external'" d="M14 5h5v5M19 5l-8 8M18 13v5H5V5h5" />
    <path
      v-else-if="props.name === 'github'"
      d="M9.2 19.2c-4.2 1.3-4.2-2.1-5.9-2.5m11.8 5v-3.1a2.7 2.7 0 0 0-.8-2.1c2.7-.3 5.5-1.3 5.5-5.9a4.6 4.6 0 0 0-1.2-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.3 1.2a11.3 11.3 0 0 0-6 0C7 3.9 6 4.2 6 4.2a4.3 4.3 0 0 0-.1 3.2 4.6 4.6 0 0 0-1.2 3.2c0 4.6 2.8 5.6 5.5 5.9a2.7 2.7 0 0 0-.8 2.1v3.1"
    />
    <path
      v-else-if="props.name === 'heart'"
      d="M20.8 8.7c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10A4.6 4.6 0 0 1 12 6.2a4.6 4.6 0 0 1 8.8 2.5Z"
    />
    <path
      v-else-if="props.name === 'info'"
      d="M12 10v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
    <path v-else-if="props.name === 'menu'" d="M4 7h16M4 12h16M4 17h16" />
    <path v-else-if="props.name === 'minus'" d="M5 12h14" />
    <path v-else-if="props.name === 'moon'" d="M20 15.2A8 8 0 0 1 8.8 4a8 8 0 1 0 11.2 11.2Z" />
    <path v-else-if="props.name === 'plus'" d="M12 5v14M5 12h14" />
    <path
      v-else-if="props.name === 'search'"
      d="m20 20-4.4-4.4M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"
    />
    <path
      v-else-if="props.name === 'sun'"
      d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
    />
    <path v-else-if="props.name === 'system'" d="M4 5h16v11H4zM8 20h8M12 16v4" />
    <path
      v-else-if="props.name === 'grip'"
      d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"
      stroke-width="3"
    />
    <path v-else-if="props.name === 'upload'" d="M12 15V4m0 0L8 8m4-4 4 4M5 14v5h14v-5" />
    <path v-else-if="props.name === 'trash'" d="M5 7h14M10 11v5M14 11v5M9 7V4h6v3l-1 13h-4L9 7Z" />
    <path
      v-else-if="props.name === 'edit'"
      d="m4 16.5-.8 3.3 3.3-.8L18.8 6.7a2.1 2.1 0 0 0-3-3L4 16.5Z"
    />
    <path v-else-if="props.name === 'more'" d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3" />
    <path v-else d="M12 4 20 20H4L12 4Zm0 5v5m0 3h.01" />
  </svg>
</template>
