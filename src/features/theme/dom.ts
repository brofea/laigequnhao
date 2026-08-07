import { THEME_COLOR_META_NAME, THEME_COLOR_META_VALUES, THEME_ROOT_ATTRIBUTE } from "./constants";
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
  syncThemeColorMeta(documentRef, theme);
}

function syncThemeColorMeta(documentRef: Document | null | undefined, theme: EffectiveTheme): void {
  if (!documentRef?.head) return;

  let meta = documentRef.head.querySelector<HTMLMetaElement>(
    `meta[name="${THEME_COLOR_META_NAME}"]`,
  );
  if (!meta) {
    meta = documentRef.createElement("meta");
    meta.name = THEME_COLOR_META_NAME;
    documentRef.head.appendChild(meta);
  }
  meta.content = THEME_COLOR_META_VALUES[theme];
}
