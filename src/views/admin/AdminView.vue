<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAdminAuth } from "@/features/admin/composables/useAdminAuth";
import VisualShell from "@/components/VisualShell.vue";

const router = useRouter();
const { isAuthenticated, csrfToken, check } = useAdminAuth();

onMounted(async () => {
  await check();
  if (!isAuthenticated.value) void router.replace("/admin/login");
});
</script>

<template>
  <VisualShell v-if="isAuthenticated" initial-view="admin" :csrf-token="csrfToken" />
  <main v-else class="app-shell" aria-busy="true">
    <div class="app-main app-empty"><strong>正在验证管理员会话</strong></div>
  </main>
</template>
