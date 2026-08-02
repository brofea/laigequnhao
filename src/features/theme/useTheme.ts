import { computed, onBeforeUnmount, onMounted, readonly, ref, watch } from "vue";
import { applyThemeToDocument } from "./dom";
import {
  getThemeMatchMedia,
  readSystemPrefersDark,
  subscribeToSystemTheme,
  type ThemeMatchMedia,
} from "./media";
import { parseThemePreference, resolveEffectiveTheme } from "./parser";
import {
  getThemeStorage,
  readThemePreference,
  writeThemePreference,
  type ThemeStorage,
} from "./storage";
import type { EffectiveTheme, ThemePreference } from "./types";

export type { EffectiveTheme, ThemePreference } from "./types";

const THEME_PREFERENCE_ORDER: readonly ThemePreference[] = ["system", "light", "dark"];

export interface UseThemeOptions {
  document?: Document | null;
  storage?: ThemeStorage | null;
  matchMedia?: ThemeMatchMedia | null;
  storageKey?: string;
}

export function useTheme(options: UseThemeOptions = {}) {
  const documentRef = options.document === undefined ? getDocument() : options.document;
  const storage = options.storage === undefined ? getThemeStorage() : options.storage;
  const matchMedia = options.matchMedia === undefined ? getThemeMatchMedia() : options.matchMedia;
  const storageKey = options.storageKey;

  const preference = ref<ThemePreference>(readThemePreference(storage, storageKey));
  const systemPrefersDark = ref(readSystemPrefersDark(matchMedia));
  const resolvedTheme = computed<EffectiveTheme>(() =>
    resolveEffectiveTheme(preference.value, systemPrefersDark.value),
  );

  let unsubscribeFromSystemTheme: () => void = () => {};

  function syncRoot(): void {
    applyThemeToDocument(resolvedTheme.value, documentRef);
  }

  function setPreference(nextPreference: ThemePreference): void {
    preference.value = parseThemePreference(nextPreference);
    writeThemePreference(preference.value, storage, storageKey);
    syncRoot();
  }

  function cyclePreference(): ThemePreference {
    const currentIndex = THEME_PREFERENCE_ORDER.indexOf(preference.value);
    const nextIndex = (currentIndex + 1) % THEME_PREFERENCE_ORDER.length;
    const nextPreference = THEME_PREFERENCE_ORDER[nextIndex] ?? "system";
    setPreference(nextPreference);
    return nextPreference;
  }

  watch(resolvedTheme, syncRoot, { immediate: true });

  onMounted(() => {
    unsubscribeFromSystemTheme = subscribeToSystemTheme((prefersDark) => {
      systemPrefersDark.value = prefersDark;
      if (preference.value === "system") syncRoot();
    }, matchMedia);
  });

  onBeforeUnmount(() => {
    unsubscribeFromSystemTheme();
    unsubscribeFromSystemTheme = () => undefined;
  });

  const readonlyPreference = readonly(preference);

  return {
    preference: readonlyPreference,
    themePreference: readonlyPreference,
    effectiveTheme: resolvedTheme,
    resolvedTheme,
    setPreference,
    setThemePreference: setPreference,
    cyclePreference,
  };
}

function getDocument(): Document | null {
  return typeof document === "undefined" ? null : document;
}
