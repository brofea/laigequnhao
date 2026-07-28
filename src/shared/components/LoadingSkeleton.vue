<script setup lang="ts">
//
</script>

<template>
  <div class="animate-pulse space-y-4">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="n in 6" :key="n" class="rounded-lg border border-gray-200 p-4">
        <div class="h-4 w-3/4 rounded bg-gray-200" />
        <div class="mt-2 h-3 w-1/2 rounded bg-gray-100" />
        <div class="mt-4 h-8 w-full rounded bg-gray-100" />
      </div>
    </div>
  </div>
</template>
