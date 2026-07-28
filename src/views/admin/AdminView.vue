<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
  <main class="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
    <div class="max-w-4xl mx-auto px-4 py-16">
      <h1 class="text-2xl font-bold">管理后台</h1>
      <p class="mt-4 text-gray-600 dark:text-gray-400">管理员页面 — 建设中</p>
      <RouterView />
    </div>
  </main>
</template>
