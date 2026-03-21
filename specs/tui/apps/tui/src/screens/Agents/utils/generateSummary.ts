import type { Breakpoint } from "../types.js";

export const SUMMARY_LIMIT: Record<Breakpoint, number | null> = {
  minimum: null,   // hidden at minimum breakpoint
  standard: 60,    // 60-char truncated summary
  large: 120,      // 120-char summary for wide terminals
};

/**
 * Generate a one-line summary of tool input/output content.
 * Returns null if summaries are hidden at the given breakpoint.
 * Replaces newlines with spaces and truncates with ellipsis.
 */
export function generateSummary(
  content: string,
  breakpoint: Breakpoint
): string | null {
  const limit = SUMMARY_LIMIT[breakpoint];
  if (limit === null) return null;
  const oneLine = content.replace(/\r?\n/g, " ").trim();
  if (oneLine.length === 0) return null;
  if (oneLine.length <= limit) return oneLine;
  return oneLine.slice(0, limit - 1) + "…";
}
