import { THEME_MEDIA_QUERY } from "./constants";

type MediaChangeListener = (event: MediaQueryListEvent) => void;

export interface ThemeMediaQueryList {
  matches: boolean;
  addEventListener?: (type: "change", listener: MediaChangeListener) => void;
  removeEventListener?: (type: "change", listener: MediaChangeListener) => void;
  addListener?: (listener: MediaChangeListener) => void;
  removeListener?: (listener: MediaChangeListener) => void;
}

export type ThemeMatchMedia = (query: string) => ThemeMediaQueryList;

export function getThemeMatchMedia(): ThemeMatchMedia | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;

  return window.matchMedia.bind(window);
}

export function readSystemPrefersDark(matchMedia: ThemeMatchMedia | null | undefined): boolean {
  if (!matchMedia) return false;

  try {
    return matchMedia(THEME_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

export function subscribeToSystemTheme(
  onChange: (prefersDark: boolean) => void,
  matchMedia: ThemeMatchMedia | null | undefined = getThemeMatchMedia(),
): () => void {
  if (!matchMedia) {
    onChange(false);
    return () => {};
  }

  let mediaQuery: ThemeMediaQueryList;
  try {
    mediaQuery = matchMedia(THEME_MEDIA_QUERY);
  } catch {
    onChange(false);
    return () => {};
  }

  const listener: MediaChangeListener = (event) => {
    onChange(event.matches);
  };
  onChange(mediaQuery.matches);

  if (mediaQuery.addEventListener && mediaQuery.removeEventListener) {
    mediaQuery.addEventListener("change", listener);
    return () => {
      mediaQuery.removeEventListener?.("change", listener);
    };
  }

  if (mediaQuery.addListener && mediaQuery.removeListener) {
    mediaQuery.addListener(listener);
    return () => {
      mediaQuery.removeListener?.(listener);
    };
  }

  return () => {};
}
