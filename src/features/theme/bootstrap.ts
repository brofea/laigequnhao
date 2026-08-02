import { applyThemeToDocument } from "./dom";
import { getThemeMatchMedia, readSystemPrefersDark, type ThemeMatchMedia } from "./media";
import { resolveEffectiveTheme } from "./parser";
import { getThemeStorage, readThemePreference, type ThemeStorage } from "./storage";
import type { EffectiveTheme, ThemePreference } from "./types";

export interface ThemeBootstrapOptions {
  document?: Document | null;
  storage?: ThemeStorage | null;
  matchMedia?: ThemeMatchMedia | null;
  storageKey?: string;
}

export interface ThemeBootstrapResult {
  preference: ThemePreference;
  effectiveTheme: EffectiveTheme;
}

export function bootstrapTheme(options: ThemeBootstrapOptions = {}): ThemeBootstrapResult {
  const documentRef = options.document === undefined ? getDocument() : options.document;
  const storage = options.storage === undefined ? getThemeStorage() : options.storage;
  const matchMedia = options.matchMedia === undefined ? getThemeMatchMedia() : options.matchMedia;
  const preference = readThemePreference(storage, options.storageKey);
  const effectiveTheme = resolveEffectiveTheme(preference, readSystemPrefersDark(matchMedia));

  applyThemeToDocument(effectiveTheme, documentRef);
  return { preference, effectiveTheme };
}

function getDocument(): Document | null {
  return typeof document === "undefined" ? null : document;
}

if (typeof document !== "undefined") {
  bootstrapTheme();
}
