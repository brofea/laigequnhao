export const adminHiddenColumnOrder = ["tags", "kind", "likes", "platform"] as const;

export function adminVisibleColumns(viewportWidth: number): string[] {
  if (viewportWidth < 600) return ["title", "status", "actions"];
  if (viewportWidth < 1100) return ["title", "status", "kind", "likes", "platform", "actions"];
  return ["title", "status", ...adminHiddenColumnOrder, "actions"];
}
