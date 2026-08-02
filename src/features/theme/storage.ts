import { THEME_STORAGE_KEY } from "./constants";
import { isThemePreference } from "./parser";
import type { ThemePreference } from "./types";

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getThemeStorage(): ThemeStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readThemePreference(
  storage: ThemeStorage | null | undefined = getThemeStorage(),
  key = THEME_STORAGE_KEY,
): ThemePreference {
  if (!storage) return "system";

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return "system";
  }

  if (raw === null) return "system";

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isThemePreference(parsed)) return parsed;
  } catch {
    // Invalid persisted data is handled below by resetting the key.
  }

  try {
    storage.removeItem(key);
  } catch {
    // Storage can be unavailable even after a successful read.
  }
  return "system";
}

export function writeThemePreference(
  preference: ThemePreference,
  storage: ThemeStorage | null | undefined = getThemeStorage(),
  key = THEME_STORAGE_KEY,
): boolean {
  if (!storage) return false;

  try {
    storage.setItem(key, JSON.stringify(preference));
    return true;
  } catch {
    return false;
  }
}
