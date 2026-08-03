/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Turnstile Sitekey；公开值，由 Workers Builds Build variable 注入。 */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
