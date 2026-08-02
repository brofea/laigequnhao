import { z } from "zod";

// ─── 主题偏好 ────────────────────────────────────────────

export const themePreferenceSchema = z.enum(["system", "light", "dark"]);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;
