import { THEME_ROOT_ATTRIBUTE } from "./constants";
import type { EffectiveTheme } from "./types";

export function applyThemeToRoot(
  root: HTMLElement | null | undefined,
  theme: EffectiveTheme,
): void {
  if (!root) return;

  root.setAttribute(THEME_ROOT_ATTRIBUTE, theme);
  root.style.setProperty("color-scheme", theme);
}

export function applyThemeToDocument(
  theme: EffectiveTheme,
  documentRef: Document | null | undefined = typeof document === "undefined" ? null : document,
): void {
  applyThemeToRoot(documentRef?.documentElement, theme);
}
