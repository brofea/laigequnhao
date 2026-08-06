import type { EffectiveTheme } from "./types";

export const THEME_STORAGE_KEY = "lgqh.theme-preference.v1";

export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export const THEME_ROOT_ATTRIBUTE = "data-theme";

export const THEME_COLOR_META_NAME = "theme-color";

export const THEME_COLOR_META_VALUES: Record<EffectiveTheme, string> = {
  light: "#f3f5f8",
  dark: "#15171c",
};
