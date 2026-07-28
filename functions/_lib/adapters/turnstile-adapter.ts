/** Cloudflare Turnstile 验证适配器 */

export function createTurnstileAdapter(secretKey: string, skipVerification: boolean) {
  return {
    async verify(token: string): Promise<boolean> {
      if (skipVerification) return true;

      const formData = new FormData();
      formData.append("secret", secretKey);
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
