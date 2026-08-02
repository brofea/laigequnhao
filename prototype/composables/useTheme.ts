import { computed, onBeforeUnmount, onMounted, ref } from "vue";

export type ThemePreference = "system" | "light" | "dark";

export function useTheme() {
  const preference = ref<ThemePreference>("system");
  const systemDark = ref(false);
  let mediaQuery: MediaQueryList | null = null;

  const resolvedTheme = computed<"light" | "dark">(() => {
    if (preference.value === "system") return systemDark.value ? "dark" : "light";
    return preference.value;
  });

  function updateSystemTheme(event: MediaQueryListEvent | MediaQueryList) {
    systemDark.value = event.matches;
  }

  onMounted(() => {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    updateSystemTheme(mediaQuery);
    mediaQuery.addEventListener("change", updateSystemTheme);
  });

  onBeforeUnmount(() => mediaQuery?.removeEventListener("change", updateSystemTheme));

  return { preference, resolvedTheme };
}
