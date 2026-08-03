<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { turnstileSiteKey } from "@/config/runtime";
import { loadTurnstile, type TurnstileApi } from "@/shared/turnstile";

const emit = defineEmits<{
  token: [value: string];
  error: [message: string];
}>();

const container = ref<HTMLElement | null>(null);
const message = ref("");
let api: TurnstileApi | undefined;
let widgetId: string | undefined;

function clearToken() {
  emit("token", "");
}

function handleError() {
  clearToken();
  message.value = "安全验证暂时不可用，请刷新页面后重试。";
  emit("error", message.value);
  return true;
}

onMounted(async () => {
  // 本地 Worker 配置 SKIP_TURNSTILE=true；没有生产 Sitekey 时不阻断本地开发。
  if (import.meta.env.DEV && !turnstileSiteKey) {
    emit("token", "local-dev-skip");
    return;
  }

  if (!turnstileSiteKey) {
    message.value = "投稿尚未配置 Turnstile Sitekey，请先设置 VITE_TURNSTILE_SITE_KEY。";
    emit("error", message.value);
    return;
  }

  message.value = "正在加载安全验证…";
  try {
    api = await loadTurnstile();
    if (!container.value) return;
    widgetId = api.render(container.value, {
      sitekey: turnstileSiteKey,
      appearance: "interaction-only",
      callback: (token) => {
        message.value = "";
        emit("token", token);
      },
      "expired-callback": () => {
        message.value = "安全验证已过期，请重新验证。";
        clearToken();
      },
      "error-callback": handleError,
    });
    message.value = "";
  } catch {
    handleError();
  }
});

onBeforeUnmount(() => {
  if (api && widgetId) api.remove(widgetId);
});
</script>

<template>
  <div class="turnstile-widget" aria-live="polite">
    <div ref="container"></div>
    <p v-if="message" class="app-field__help" role="status">{{ message }}</p>
  </div>
</template>
