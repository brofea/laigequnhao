export interface TurnstileRenderOptions {
  sitekey: string;
  appearance?: "always" | "execute" | "interaction-only";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": (errorCode: string) => boolean;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoadPromise: Promise<TurnstileApi> | undefined;

/** 按需加载 Turnstile 官方脚本，避免基础网站依赖投稿配置才能打开。 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        reject(new Error("Turnstile script loaded without an API."));
      }
    };
    script.onerror = () => {
      reject(new Error("Turnstile script could not be loaded."));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}
