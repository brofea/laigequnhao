<script setup lang="ts">
/* eslint-disable no-useless-assignment */
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAdminAuth } from "@/features/admin/composables/useAdminAuth";

const router = useRouter();
const { isAuthenticated, loading, error, check, doLogin } = useAdminAuth();
const password = ref("");

// Check existing session on mount
void check();

async function handleLogin() {
  const ok = await doLogin(password.value);
  if (ok) void router.push("/admin");
}
</script>

<template>
  <div class="flex min-h-[60vh] items-center justify-center">
    <div class="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm">
      <h2 class="text-xl font-semibold">管理员登录</h2>

      <form v-if="!isAuthenticated" class="mt-4 space-y-3" @submit.prevent="handleLogin">
        <label class="block">
          <span class="text-sm font-medium text-gray-700">密码</span>
          <input
            v-model="password"
            type="password"
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="请输入管理员密码"
          />
        </label>
        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {{ loading ? "登录中..." : "登录" }}
        </button>
      </form>

      <p v-else class="mt-4 text-sm text-green-600">已登录，正在跳转...</p>
    </div>
  </div>
</template>
