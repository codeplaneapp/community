import type { Breakpoint } from "../types.js";

export function formatTimestamp(timestamp: string | null | undefined, breakpoint: Breakpoint): string {
  if (!timestamp) return "—";
  try {
    const d = new Date(timestamp);
    if (breakpoint === "large") {
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return "—";
  }
}
