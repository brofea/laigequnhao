import { z } from "zod";

export function getItem<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return schema.parse(parsed);
  } catch {
    removeItem(key);
    return null;
  }
}

export function setItem(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeItem(key: string): void {
  localStorage.removeItem(key);
}
