<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import siteConfig from "../../site.config";
import Button from "./Button.vue";
import Icon from "./Icon.vue";
import { useTheme, type ThemePreference } from "@/features/theme/useTheme";

withDefaults(
  defineProps<{
    showAddGroup?: boolean;
  }>(),
  { showAddGroup: true },
);

const emit = defineEmits<{ addGroup: [] }>();
defineSlots<{ actions?: () => unknown }>();

const { preference, setPreference } = useTheme();
const labels: Record<ThemePreference, string> = { system: "系统", light: "浅色", dark: "深色" };
const themeLabel = computed(() => labels[preference.value]);

function cycleTheme() {
  const order: ThemePreference[] = ["system", "light", "dark"];
  const index = order.indexOf(preference.value);
  setPreference(order[(index + 1) % order.length] ?? "system");
}
</script>

<template>
  <header class="app-header">
    <RouterLink class="app-brand" to="/" aria-label="回到公开首页">
      <span class="app-brand__mark" aria-hidden="true">{{ siteConfig.header.brandMark }}</span>
      <strong>{{ siteConfig.header.brandLabel }}</strong>
    </RouterLink>

    <div class="app-header__actions">
      <button
        type="button"
        class="theme-control"
        :aria-label="`主题：${themeLabel}，点击切换主题偏好`"
        @click="cycleTheme"
      >
        <Icon
          :name="preference === 'dark' ? 'moon' : preference === 'light' ? 'sun' : 'system'"
          size="16"
        />
        <span class="theme-control__label">{{ themeLabel }}</span>
      </button>
      <a
        class="github-control"
        :href="siteConfig.header.githubUrl"
        target="_blank"
        rel="noreferrer"
        :aria-label="siteConfig.header.githubLabel"
      >
        <Icon name="github" size="17" /><span>{{ siteConfig.header.githubLabel }}</span>
      </a>
      <Button v-if="showAddGroup" variant="normal" size="sm" icon="plus" @click="emit('addGroup')">
        {{ siteConfig.header.addGroup.label }}
      </Button>
      <slot name="actions" />
    </div>
  </header>
</template>
