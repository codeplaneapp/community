export function formatTotalCount(total: number): string {
  if (total > 9999) return "9999+";
  return String(total);
}
