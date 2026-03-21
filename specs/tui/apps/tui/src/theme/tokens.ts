import { RGBA } from "@opentui/core";
import type { ColorTier } from "./detect.js";

/**
 * Semantic color tokens for the TUI theme.
 *
 * Every color used in the TUI resolves to one of these tokens.
 * Components reference tokens by name via useTheme(), never raw ANSI codes.
 *
 * Token values are RGBA objects from @opentui/core (Float32Array-backed).
 * They are created once at startup and reused by identity — no per-render allocation.
 */
export interface ThemeTokens {
  // ── Core semantic tokens ────────────────────────────────────────────
  /** Focused items, links, active tabs, interactive highlights */
  readonly primary: RGBA;
  /** Open issues, passed checks, additions, connected status */
  readonly success: RGBA;
  /** Pending states, conflict indicators, syncing status */
  readonly warning: RGBA;
  /** Errors, failed checks, closed/rejected items, disconnected status */
  readonly error: RGBA;
  /** Secondary text, metadata, timestamps, disabled items */
  readonly muted: RGBA;
  /** Modal/overlay backgrounds, panel backgrounds */
  readonly surface: RGBA;
  /** Box borders, separators, dividers */
  readonly border: RGBA;

  // ── Diff-specific tokens ────────────────────────────────────────────
  /** Background for addition lines in diff view */
  readonly diffAddedBg: RGBA;
  /** Background for deletion lines in diff view */
  readonly diffRemovedBg: RGBA;
  /** Foreground for addition signs and inline highlights */
  readonly diffAddedText: RGBA;
  /** Foreground for deletion signs and inline highlights */
  readonly diffRemovedText: RGBA;
  /** Hunk header @@ ... @@ lines */
  readonly diffHunkHeader: RGBA;
}

// ── Truecolor RGBA constants (hex → RGBA, allocated once) ─────────────
const TC_PRIMARY        = RGBA.fromHex("#2563EB");
const TC_SUCCESS        = RGBA.fromHex("#16A34A");
const TC_WARNING        = RGBA.fromHex("#CA8A04");
const TC_ERROR          = RGBA.fromHex("#DC2626");
const TC_MUTED          = RGBA.fromHex("#A3A3A3");
const TC_SURFACE        = RGBA.fromHex("#262626");
const TC_BORDER         = RGBA.fromHex("#525252");
const TC_DIFF_ADDED_BG  = RGBA.fromHex("#1A4D1A");
const TC_DIFF_REMOVED_BG = RGBA.fromHex("#4D1A1A");
const TC_DIFF_ADDED_TEXT = RGBA.fromHex("#22C55E");
const TC_DIFF_REMOVED_TEXT = RGBA.fromHex("#EF4444");
const TC_DIFF_HUNK_HEADER = RGBA.fromHex("#06B6D4");

// ── ANSI 256 RGBA constants (index → RGB via standard xterm-256color table) ──
const A256_PRIMARY          = RGBA.fromInts(0, 95, 255, 255);     // index 33
const A256_SUCCESS          = RGBA.fromInts(0, 175, 0, 255);      // index 34
const A256_WARNING          = RGBA.fromInts(215, 175, 0, 255);    // index 178
const A256_ERROR            = RGBA.fromInts(255, 0, 0, 255);      // index 196
const A256_MUTED            = RGBA.fromInts(138, 138, 138, 255);  // index 245
const A256_SURFACE          = RGBA.fromInts(48, 48, 48, 255);     // index 236
const A256_BORDER           = RGBA.fromInts(88, 88, 88, 255);     // index 240
const A256_DIFF_ADDED_BG    = RGBA.fromInts(0, 95, 0, 255);       // index 22
const A256_DIFF_REMOVED_BG  = RGBA.fromInts(95, 0, 0, 255);       // index 52
const A256_DIFF_ADDED_TEXT   = RGBA.fromInts(0, 175, 0, 255);     // index 34
const A256_DIFF_REMOVED_TEXT = RGBA.fromInts(255, 0, 0, 255);     // index 196
const A256_DIFF_HUNK_HEADER  = RGBA.fromInts(0, 175, 175, 255);   // index 37

// ── ANSI 16 RGBA constants (basic terminal colors) ────────────────────
const A16_PRIMARY          = RGBA.fromInts(0, 0, 255, 255);      // Blue
const A16_SUCCESS          = RGBA.fromInts(0, 255, 0, 255);      // Green
const A16_WARNING          = RGBA.fromInts(255, 255, 0, 255);    // Yellow
const A16_ERROR            = RGBA.fromInts(255, 0, 0, 255);      // Red
const A16_MUTED            = RGBA.fromInts(192, 192, 192, 255);  // White (dim)
const A16_SURFACE          = RGBA.fromInts(64, 64, 64, 255);     // Black (bright)
const A16_BORDER           = RGBA.fromInts(192, 192, 192, 255);  // White (dim)
const A16_DIFF_ADDED_BG    = RGBA.fromInts(0, 128, 0, 255);      // Green (dark)
const A16_DIFF_REMOVED_BG  = RGBA.fromInts(128, 0, 0, 255);      // Red (dark)
const A16_DIFF_ADDED_TEXT   = RGBA.fromInts(0, 255, 0, 255);     // Green
const A16_DIFF_REMOVED_TEXT = RGBA.fromInts(255, 0, 0, 255);     // Red
const A16_DIFF_HUNK_HEADER  = RGBA.fromInts(0, 255, 255, 255);   // Cyan

/**
 * Truecolor (24-bit) theme tokens.
 * Used when COLORTERM=truecolor or COLORTERM=24bit.
 * Full hex fidelity — subtle background shading for diffs and overlays.
 */
const TRUECOLOR_TOKENS: Readonly<ThemeTokens> = Object.freeze({
  primary:         TC_PRIMARY,
  success:         TC_SUCCESS,
  warning:         TC_WARNING,
  error:           TC_ERROR,
  muted:           TC_MUTED,
  surface:         TC_SURFACE,
  border:          TC_BORDER,
  diffAddedBg:     TC_DIFF_ADDED_BG,
  diffRemovedBg:   TC_DIFF_REMOVED_BG,
  diffAddedText:   TC_DIFF_ADDED_TEXT,
  diffRemovedText: TC_DIFF_REMOVED_TEXT,
  diffHunkHeader:  TC_DIFF_HUNK_HEADER,
});

/**
 * ANSI 256-color theme tokens.
 * Used when TERM contains '256color' and COLORTERM is not truecolor.
 * Visual hierarchy preserved with closest palette indices.
 */
const ANSI256_TOKENS: Readonly<ThemeTokens> = Object.freeze({
  primary:         A256_PRIMARY,
  success:         A256_SUCCESS,
  warning:         A256_WARNING,
  error:           A256_ERROR,
  muted:           A256_MUTED,
  surface:         A256_SURFACE,
  border:          A256_BORDER,
  diffAddedBg:     A256_DIFF_ADDED_BG,
  diffRemovedBg:   A256_DIFF_REMOVED_BG,
  diffAddedText:   A256_DIFF_ADDED_TEXT,
  diffRemovedText: A256_DIFF_REMOVED_TEXT,
  diffHunkHeader:  A256_DIFF_HUNK_HEADER,
});

/**
 * ANSI 16-color theme tokens.
 * Used when TERM is basic (linux, xterm, dumb) or NO_COLOR is set.
 * Maps to the 8 standard + 8 bright ANSI colors.
 */
const ANSI16_TOKENS: Readonly<ThemeTokens> = Object.freeze({
  primary:         A16_PRIMARY,
  success:         A16_SUCCESS,
  warning:         A16_WARNING,
  error:           A16_ERROR,
  muted:           A16_MUTED,
  surface:         A16_SURFACE,
  border:          A16_BORDER,
  diffAddedBg:     A16_DIFF_ADDED_BG,
  diffRemovedBg:   A16_DIFF_REMOVED_BG,
  diffAddedText:   A16_DIFF_ADDED_TEXT,
  diffRemovedText: A16_DIFF_REMOVED_TEXT,
  diffHunkHeader:  A16_DIFF_HUNK_HEADER,
});

/**
 * Create a theme for the given color tier.
 *
 * Returns a frozen ThemeTokens object with pre-allocated RGBA instances.
 * The returned object is always the same identity for the same tier —
 * calling createTheme("truecolor") twice returns the same object.
 *
 * @param tier - The detected terminal color capability tier.
 * @returns A frozen ThemeTokens object. Never null.
 */
export function createTheme(tier: ColorTier): Readonly<ThemeTokens> {
  switch (tier) {
    case "truecolor":
      return TRUECOLOR_TOKENS;
    case "ansi256":
      return ANSI256_TOKENS;
    case "ansi16":
      return ANSI16_TOKENS;
  }
}

/**
 * Text attribute constants for semantic styling.
 *
 * These are terminal-capability-independent — all tiers support
 * bold, dim, underline, and reverse attributes via SGR sequences.
 *
 * Usage: pass to OpenTUI component `attributes` prop as bitwise OR.
 * Example: attributes={TextAttributes.BOLD | TextAttributes.UNDERLINE}
 */
export const TextAttributes = Object.freeze({
  /** Headings, focused item labels, strong emphasis */
  BOLD: 1 << 0,       // SGR 1
  /** Muted helper text, disabled items */
  DIM: 1 << 1,        // SGR 2
  /** Links in markdown content */
  UNDERLINE: 1 << 2,  // SGR 4
  /** Focused list row highlight (alternative to colored background) */
  REVERSE: 1 << 3,    // SGR 7
} as const);

/** Type for individual text attribute flags */
export type TextAttribute = (typeof TextAttributes)[keyof typeof TextAttributes];

/**
 * Semantic token names. Used as keys into ThemeTokens.
 */
export type SemanticTokenName = keyof ThemeTokens;

/**
 * Core token names (excluding diff tokens).
 * These are the tokens commonly resolved from entity status strings.
 */
export type CoreTokenName = "primary" | "success" | "warning" | "error" | "muted" | "surface" | "border";

/**
 * Map an entity state string to a semantic token name.
 *
 * Covers common states across issues, landings, checks, workspaces,
 * workflows, and sync status. Unknown states fall back to "muted".
 *
 * @param status - The entity state string from the API (case-insensitive).
 * @returns The semantic token name to use for coloring.
 */
export function statusToToken(status: string): CoreTokenName {
  switch (status.toLowerCase()) {
    // ── Success states ──────────────────────────────────────────────
    case "open":
    case "active":
    case "running":
    case "passed":
    case "success":
    case "connected":
    case "ready":
    case "merged":
    case "completed":
      return "success";

    // ── Warning states ──────────────────────────────────────────────
    case "pending":
    case "draft":
    case "queued":
    case "syncing":
    case "in_progress":
    case "waiting":
    case "conflict":
    case "suspended":
    case "paused":
      return "warning";

    // ── Error states ────────────────────────────────────────────────
    case "closed":
    case "rejected":
    case "failed":
    case "error":
    case "disconnected":
    case "cancelled":
    case "timed_out":
    case "stopped":
      return "error";

    // ── Primary states (informational/interactive) ──────────────────
    case "focused":
    case "selected":
    case "current":
      return "primary";

    // ── Default fallback ────────────────────────────────────────────
    default:
      return "muted";
  }
}

// ── Named constant exports for direct token access ────────────────────
export { TRUECOLOR_TOKENS, ANSI256_TOKENS, ANSI16_TOKENS };

/** Total number of semantic tokens in the theme */
export const THEME_TOKEN_COUNT = 12;
