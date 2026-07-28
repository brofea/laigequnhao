<script setup lang="ts">
defineProps<{
  message: string;
  requestId?: string;
}>();
</script>

<template>
  <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
    <p>{{ message }}</p>
    <p v-if="requestId" class="mt-1 text-xs text-red-400">Request ID: {{ requestId }}</p>
  </div>
</template>
