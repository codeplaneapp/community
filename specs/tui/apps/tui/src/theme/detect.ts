/**
 * Terminal color capability detection.
 *
 * Pure function module — no React dependencies, no API calls, no side effects.
 * Reads only environment variables. Used by ThemeProvider at startup.
 *
 * Detection cascade:
 *   1. NO_COLOR set or TERM=dumb  → ansi16 (most constrained)
 *   2. COLORTERM=truecolor|24bit  → truecolor (24-bit RGB)
 *   3. TERM contains '256color'   → ansi256 (256-color palette)
 *   4. Default fallback            → ansi256 (safe default)
 *
 * @see https://no-color.org/
 * @see specs/tui/design.md § Theme & Colors
 * @see specs/tui/engineering-architecture.md § Theme and Color Token System
 */

/**
 * Terminal color capability tiers, ordered from most capable to least.
 *
 * - `truecolor`: 24-bit RGB (16.7M colors). Detected via COLORTERM env var.
 * - `ansi256`:   256-color palette. Detected via TERM containing '256color'.
 * - `ansi16`:    Basic 16-color ANSI. Used for constrained/dumb terminals.
 */
export type ColorTier = "truecolor" | "ansi256" | "ansi16";

/**
 * Detect the terminal's color capability tier.
 *
 * The detection cascade is ordered by priority — first match wins:
 *
 * 1. `NO_COLOR` env var set (non-empty) or `TERM=dumb` → `ansi16`
 * 2. `COLORTERM` is `truecolor` or `24bit` → `truecolor`
 * 3. `TERM` contains `256color` → `ansi256`
 * 4. Default fallback → `ansi256`
 *
 * NO_COLOR is checked before COLORTERM because it represents explicit user
 * intent to constrain color output, which should override capability signals.
 *
 * @returns The detected color tier for the current terminal environment.
 */
export function detectColorCapability(): ColorTier {
  // Priority 1: Respect NO_COLOR standard and dumb terminals.
  // Checked first because they represent explicit user/environment intent
  // to constrain color output, overriding any capability signals.
  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== "") {
    return "ansi16";
  }

  const term = (process.env.TERM ?? "").toLowerCase();
  if (term === "dumb") {
    return "ansi16";
  }

  // Priority 2: Truecolor detection via COLORTERM.
  // Set by iTerm2, Ghostty, kitty, WezTerm, Windows Terminal, etc.
  const colorterm = (process.env.COLORTERM ?? "").toLowerCase();
  if (colorterm === "truecolor" || colorterm === "24bit") {
    return "truecolor";
  }

  // Priority 3: 256-color detection via TERM.
  // Matches xterm-256color, screen-256color, tmux-256color, etc.
  if (term.includes("256color")) {
    return "ansi256";
  }

  // Priority 4: Safe default for unknown terminals.
  // Most modern terminals support 256 colors even without explicit TERM.
  return "ansi256";
}

/**
 * Check if the terminal likely supports Unicode characters.
 *
 * Used for choosing between Unicode spinner/progress characters (braille,
 * box-drawing) and ASCII fallbacks.
 *
 * Returns false when:
 * - `TERM` is `dumb` (minimal terminal, often ASCII-only)
 * - `NO_COLOR` is set and non-empty (correlates with constrained environments)
 *
 * This is a heuristic — there is no reliable way to detect Unicode support
 * from environment variables alone.
 *
 * @returns true if Unicode characters are likely supported.
 */
export function isUnicodeSupported(): boolean {
  const term = (process.env.TERM ?? "").toLowerCase();
  if (term === "dumb") {
    return false;
  }

  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== "") {
    return false;
  }

  return true;
}
