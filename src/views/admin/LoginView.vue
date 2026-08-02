<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import siteConfig from "../../../site.config";
import { useAdminAuth } from "@/features/admin/composables/useAdminAuth";
import Button from "@/components/Button.vue";
import SiteHeader from "@/components/SiteHeader.vue";
import { useTheme } from "@/features/theme/useTheme";

const router = useRouter();
const { isAuthenticated, loading, error, check, doLogin } = useAdminAuth();
const { resolvedTheme } = useTheme();
const password = ref("");

onMounted(async () => {
  await check();
  if (isAuthenticated.value) void router.replace("/admin");
});

async function login() {
  if (await doLogin(password.value)) void router.replace("/admin");
}
</script>

<template>
  <main class="app-shell" :data-theme="resolvedTheme">
    <SiteHeader :show-add-group="false" />
    <div class="login-page">
      <div class="app-card login-card">
        <p class="eyebrow">Management access</p>
        <h1>{{ siteConfig.title }} · 管理后台</h1>
        <form @submit.prevent="login">
          <label class="admin-edit-field"
            ><span>管理员密码</span
            ><span class="admin-edit-field__control"
              ><input
                v-model="password"
                type="password"
                autocomplete="current-password"
                required
                autofocus
                placeholder="请输入密码" /></span
          ></label>
          <p v-if="error" class="app-alert app-alert--danger" role="alert">{{ error }}</p>
          <Button class="login-card__submit" type="submit" variant="normal" :loading="loading"
            >登录</Button
          >
        </form>
      </div>
    </div>
  </main>
</template>
