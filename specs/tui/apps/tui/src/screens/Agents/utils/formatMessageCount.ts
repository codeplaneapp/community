export function formatMessageCount(count: number | undefined | null): string {
  if (count === undefined || count === null) return "0 msgs";
  if (count >= 10000) return "9999+";
  return `${count} msgs`;
}
