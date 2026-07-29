<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAdminAuth } from "@/features/admin/composables/useAdminAuth";

const router = useRouter();
const { isAuthenticated, loading, error, check, doLogin, doLogout } = useAdminAuth();
const password = ref("");

onMounted(async () => {
  await check();
  if (isAuthenticated.value) {
    void router.replace("/admin");
  }
});

async function handleLogin() {
  const ok = await doLogin(password.value);
  if (ok) void router.replace("/admin");
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-gray-100">
    <div class="w-full max-w-sm rounded-xl border bg-white p-8 shadow-sm">
      <h1 class="mb-6 text-center text-xl font-bold text-gray-900">来个群号 — 管理后台</h1>

      <form class="space-y-4" @submit.prevent="handleLogin">
        <label class="block">
          <span class="text-sm font-medium text-gray-700">管理员密码</span>
          <input
            v-model="password"
            type="password"
            required
            autofocus
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            placeholder="请输入密码"
          />
        </label>
        <p v-if="error" class="text-sm text-red-500">
          {{ error }}
        </p>
        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {{ loading ? "登录中..." : "登录" }}
        </button>
      </form>

      <p v-if="isAuthenticated" class="mt-4 text-center text-sm">
        已登录，
        <button class="text-brand-primary hover:underline" @click="doLogout()">退出登录</button>
      </p>
    </div>
  </main>
</template>
