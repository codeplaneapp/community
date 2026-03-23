/**
 * Terminal color capability tiers, ordered from most capable to least.
 *
 * - `truecolor`: 24-bit RGB (16.7M colors). Detected via COLORTERM env var.
 * - `ansi256`:   256-color palette. Detected via TERM containing '256color'.
 * - `ansi16`:    Basic 16-color ANSI. Used for constrained/dumb terminals.
 */
export type ColorTier = "truecolor" | "ansi256" | "ansi16";

/**
 * Detects the terminal's color capability tier based on environment variables.
 *
 * Follows a priority cascade:
 * 1. NO_COLOR standard (returns ansi16)
 * 2. TERM=dumb (returns ansi16)
 * 3. COLORTERM=truecolor|24bit (returns truecolor)
 * 4. TERM containing '256color' (returns ansi256)
 * 5. Default fallback (returns ansi256)
 *
 * @returns The detected ColorTier
 */
export function detectColorCapability(): ColorTier {
  // Priority 1: Respect NO_COLOR standard.
  // Checked first because it represents explicit user intent
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
 * Determines whether the terminal supports Unicode characters.
 * Used by spinner and progress indicator components to choose
 * between Unicode braille/box-drawing characters and ASCII fallbacks.
 *
 * @returns true if Unicode is likely supported, false otherwise
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
