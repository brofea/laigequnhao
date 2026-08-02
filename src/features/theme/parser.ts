import type { EffectiveTheme, ThemePreference } from "./types";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function parseThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): EffectiveTheme {
  if (preference === "light" || preference === "dark") return preference;
  return prefersDark ? "dark" : "light";
}
