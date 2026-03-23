/**
 * Library modules for the TUI application.
 */
export {
  TRUECOLOR_PALETTE,
  ANSI256_PALETTE,
  ANSI16_PALETTE,
  detectColorTier,
  getPaletteForTier,
  resolveFiletype,
  createDiffSyntaxStyle,
  pathToFiletype,
} from "./diff-syntax.js";

export type { ColorTier } from "./diff-syntax.js";
