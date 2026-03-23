/**
 * Theme system for the TUI application.
 *
 * Modules:
 *   detect.ts      — Terminal color capability detection (pure functions)
 *
 * Planned modules (see: specs/tui/engineering-architecture.md § Theme and Color Token System):
 *   tokens.ts      — 12 semantic color tokens: primary, success, warning, error, muted,
 *                    surface, border, diffAddedBg, diffRemovedBg, diffAddedText,
 *                    diffRemovedText, diffHunkHeader
 *   syntaxStyle.ts — Singleton SyntaxStyle for markdown and code rendering
 *   resolve.ts     — Token resolution: semantic token × color capability → concrete ANSI value
 *
 * Note: src/lib/diff-syntax.ts already implements ColorTier detection and palette
 * resolution for diff-specific syntax highlighting. The theme/detect.ts module is
 * the canonical detection source. A future migration ticket will update
 * lib/diff-syntax.ts and hooks/useDiffSyntaxStyle.ts to re-export from here.
 */

export { type ColorTier, detectColorCapability, isUnicodeSupported } from "./detect.js";
export {
  type ThemeTokens,
  type SemanticTokenName,
  type CoreTokenName,
  type TextAttribute,
  TextAttributes,
  createTheme,
  statusToToken,
  TRUECOLOR_TOKENS,
  ANSI256_TOKENS,
  ANSI16_TOKENS,
  THEME_TOKEN_COUNT,
} from "./tokens.js";
