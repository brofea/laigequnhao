import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_MEDIA_QUERY, THEME_STORAGE_KEY } from "./constants";
import { bootstrapTheme } from "./bootstrap";
import {
  getThemeMatchMedia,
  readSystemPrefersDark,
  subscribeToSystemTheme,
  type ThemeMatchMedia,
  type ThemeMediaQueryList,
} from "./media";
import { isThemePreference, parseThemePreference, resolveEffectiveTheme } from "./parser";
import { readThemePreference, type ThemeStorage, writeThemePreference } from "./storage";
import type { ThemePreference } from "./types";

class MemoryThemeStorage implements ThemeStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("theme parser", () => {
  it("accepts only the three supported preferences and falls back to system", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(parseThemePreference("invalid")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  it("resolves system through the same light/dark rule", () => {
    expect(resolveEffectiveTheme("light", true)).toBe("light");
    expect(resolveEffectiveTheme("dark", false)).toBe("dark");
    expect(resolveEffectiveTheme("system", true)).toBe("dark");
    expect(resolveEffectiveTheme("system", false)).toBe("light");
  });
});

describe("theme storage", () => {
  it("persists valid preferences and safely resets malformed values", () => {
    const storage = new MemoryThemeStorage();

    expect(readThemePreference(storage)).toBe("system");
    expect(writeThemePreference("dark", storage)).toBe(true);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('"dark"');
    expect(readThemePreference(storage)).toBe("dark");

    storage.setItem(THEME_STORAGE_KEY, '"unknown"');
    expect(readThemePreference(storage)).toBe("system");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();

    storage.setItem(THEME_STORAGE_KEY, "not-json");
    expect(readThemePreference(storage)).toBe("system");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("does not throw when browser storage is unavailable", () => {
    const throwingStorage: ThemeStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readThemePreference(throwingStorage)).toBe("system");
    expect(writeThemePreference("light", throwingStorage)).toBe(false);
  });
});

describe("system theme media adapter", () => {
  it("reads the system preference and removes the change listener", () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    let removedListener: ((event: MediaQueryListEvent) => void) | undefined;
    const mediaQuery: ThemeMediaQueryList = {
      matches: true,
      addEventListener: (_type, nextListener) => {
        listener = nextListener;
      },
      removeEventListener: (_type, nextListener) => {
        removedListener = nextListener;
      },
    };
    const matchMedia: ThemeMatchMedia = (query) => {
      expect(query).toBe(THEME_MEDIA_QUERY);
      return mediaQuery;
    };
    const changes: boolean[] = [];

    expect(readSystemPrefersDark(matchMedia)).toBe(true);
    const unsubscribe = subscribeToSystemTheme(
      (prefersDark) => changes.push(prefersDark),
      matchMedia,
    );
    expect(changes).toEqual([true]);

    listener?.({ matches: false } as MediaQueryListEvent);
    expect(changes).toEqual([true, false]);
    unsubscribe();
    expect(removedListener).toBe(listener);
  });

  it("falls back to light when matchMedia is unavailable or fails", () => {
    expect(readSystemPrefersDark(null)).toBe(false);
    const failingMatchMedia: ThemeMatchMedia = () => {
      throw new Error("unsupported");
    };
    expect(readSystemPrefersDark(failingMatchMedia)).toBe(false);
    const changes: boolean[] = [];
    subscribeToSystemTheme((prefersDark) => changes.push(prefersDark), failingMatchMedia);
    expect(changes).toEqual([false]);
  });

  it("exposes the browser adapter only when matchMedia exists", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(getThemeMatchMedia()).toBeTypeOf("function");
  });
});

describe("theme bootstrap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
    vi.restoreAllMocks();
  });

  it("applies the stored preference to the unique document root", () => {
    const storage = new MemoryThemeStorage();
    writeThemePreference("system", storage);

    const result = bootstrapTheme({
      document,
      storage,
      matchMedia: () => ({ matches: true }),
    });

    expect(result).toEqual({ preference: "system", effectiveTheme: "dark" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("keeps bootstrap resolution in parity with the shared parser", () => {
    const preferences: ThemePreference[] = ["system", "light", "dark"];

    for (const preference of preferences) {
      const storage = new MemoryThemeStorage();
      writeThemePreference(preference, storage);
      const result = bootstrapTheme({
        document,
        storage,
        matchMedia: () => ({ matches: true }),
      });

      expect(result.effectiveTheme).toBe(resolveEffectiveTheme(preference, true));
    }
  });

  it("uses light as the safe system fallback", () => {
    const result = bootstrapTheme({
      document,
      storage: null,
      matchMedia: null,
    });

    expect(result).toEqual({ preference: "system", effectiveTheme: "light" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
