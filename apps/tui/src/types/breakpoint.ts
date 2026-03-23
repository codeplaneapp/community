/**
 * Terminal size breakpoint classification.
 *
 * Ranges (both cols AND rows must meet the threshold):
 * - minimum: 80×24 – 119×39
 * - standard: 120×40 – 199×59
 * - large: 200×60+
 *
 * Below 80×24 returns null (unsupported).
 */
export type Breakpoint = "minimum" | "standard" | "large";

/**
 * Compute the breakpoint from terminal dimensions.
 *
 * Returns null when the terminal is below the minimum supported size
 * (cols < 80 OR rows < 24). The caller is responsible for rendering
 * the "terminal too small" screen when this returns null.
 *
 * The threshold logic uses OR for downgrade: if EITHER dimension
 * is below the threshold for a breakpoint, the terminal falls to
 * the next lower breakpoint. This prevents usability issues where
 * a terminal is wide but very short (or vice versa).
 */
export function getBreakpoint(
  cols: number,
  rows: number,
): Breakpoint | null {
  if (cols < 80 || rows < 24) return null;
  if (cols < 120 || rows < 40) return "minimum";
  if (cols < 200 || rows < 60) return "standard";
  return "large";
}