/** Cloudflare Turnstile 验证适配器 */

import { isConfiguredSecret } from "../env";

export function createTurnstileAdapter(secretKey: string | undefined, skipVerification: boolean) {
  const configuredSecret = isConfiguredSecret(secretKey) ? secretKey : undefined;

  return {
    configured: configuredSecret !== undefined,

    async verify(token: string): Promise<boolean> {
      if (!configuredSecret) return false;
      if (skipVerification) return true;

      const formData = new FormData();
      formData.append("secret", configuredSecret);
      formData.append("response", token);

      const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: formData,
      });

      const json = (await result.json()) as { success: boolean };
      return json.success === true;
    },
  };
}
