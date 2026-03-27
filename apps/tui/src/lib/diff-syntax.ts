import { RGBA, type StyleDefinition, SyntaxStyle, pathToFiletype } from "@opentui/core"

// Module-level RGBA constants (allocated once)
// Truecolor
const KEYWORD_TC = RGBA.fromHex("#FF7B72")
const STRING_TC = RGBA.fromHex("#A5D6FF")
const COMMENT_TC = RGBA.fromHex("#8B949E")
const NUMBER_TC = RGBA.fromHex("#79C0FF")
const BOOLEAN_TC = RGBA.fromHex("#79C0FF")
const CONSTANT_TC = RGBA.fromHex("#79C0FF")
const FUNCTION_TC = RGBA.fromHex("#D2A8FF")
const FUNCTION_CALL_TC = RGBA.fromHex("#D2A8FF")
const CONSTRUCTOR_TC = RGBA.fromHex("#FFA657")
const TYPE_TC = RGBA.fromHex("#FFA657")
const OPERATOR_TC = RGBA.fromHex("#FF7B72")
const VARIABLE_TC = RGBA.fromHex("#E6EDF3")
const PROPERTY_TC = RGBA.fromHex("#79C0FF")
const BRACKET_TC = RGBA.fromHex("#F0F6FC")
const PUNCTUATION_TC = RGBA.fromHex("#F0F6FC")
const DEFAULT_TC = RGBA.fromHex("#E6EDF3")

export const TRUECOLOR_PALETTE: Readonly<Record<string, StyleDefinition>> = Object.freeze({
  keyword: { fg: KEYWORD_TC, bold: true },
  "keyword.import": { fg: KEYWORD_TC, bold: true },
  string: { fg: STRING_TC },
  comment: { fg: COMMENT_TC, italic: true },
  number: { fg: NUMBER_TC },
  boolean: { fg: BOOLEAN_TC },
  constant: { fg: CONSTANT_TC },
  function: { fg: FUNCTION_TC },
  "function.call": { fg: FUNCTION_CALL_TC },
  constructor: { fg: CONSTRUCTOR_TC },
  type: { fg: TYPE_TC },
  operator: { fg: OPERATOR_TC },
  variable: { fg: VARIABLE_TC },
  property: { fg: PROPERTY_TC },
  bracket: { fg: BRACKET_TC },
  punctuation: { fg: PUNCTUATION_TC },
  default: { fg: DEFAULT_TC },
})

// ANSI 256
const KEYWORD_256 = RGBA.fromInts(255, 135, 95, 255) // 209
const STRING_256 = RGBA.fromInts(175, 215, 255, 255) // 153
const COMMENT_256 = RGBA.fromInts(168, 168, 168, 255) // 248
const NUMBER_256 = RGBA.fromInts(135, 215, 255, 255) // 117
const FUNCTION_256 = RGBA.fromInts(215, 175, 255, 255) // 183
const CONSTRUCTOR_256 = RGBA.fromInts(255, 175, 95, 255) // 215
const VARIABLE_BRACKET_PUNCTUATION_DEFAULT_256 = RGBA.fromInts(238, 238, 238, 255) // 255

export const ANSI256_PALETTE: Readonly<Record<string, StyleDefinition>> = Object.freeze({
  keyword: { fg: KEYWORD_256, bold: true },
  "keyword.import": { fg: KEYWORD_256, bold: true },
  string: { fg: STRING_256 },
  comment: { fg: COMMENT_256, italic: true },
  number: { fg: NUMBER_256 },
  boolean: { fg: NUMBER_256 },
  constant: { fg: NUMBER_256 },
  function: { fg: FUNCTION_256 },
  "function.call": { fg: FUNCTION_256 },
  constructor: { fg: CONSTRUCTOR_256 },
  type: { fg: CONSTRUCTOR_256 },
  operator: { fg: KEYWORD_256 },
  variable: { fg: VARIABLE_BRACKET_PUNCTUATION_DEFAULT_256 },
  property: { fg: NUMBER_256 },
  bracket: { fg: VARIABLE_BRACKET_PUNCTUATION_DEFAULT_256 },
  punctuation: { fg: VARIABLE_BRACKET_PUNCTUATION_DEFAULT_256 },
  default: { fg: VARIABLE_BRACKET_PUNCTUATION_DEFAULT_256 },
})

// ANSI 16
const RED_16 = RGBA.fromInts(255, 0, 0, 255)
const CYAN_16 = RGBA.fromInts(0, 255, 255, 255)
const GRAY_16 = RGBA.fromInts(192, 192, 192, 255)
const MAGENTA_16 = RGBA.fromInts(255, 0, 255, 255)
const YELLOW_16 = RGBA.fromInts(255, 255, 0, 255)
const WHITE_16 = RGBA.fromInts(255, 255, 255, 255)

export const ANSI16_PALETTE: Readonly<Record<string, StyleDefinition>> = Object.freeze({
  keyword: { fg: RED_16, bold: true },
  "keyword.import": { fg: RED_16, bold: true },
  string: { fg: CYAN_16 },
  comment: { fg: GRAY_16, dim: true },
  number: { fg: CYAN_16 },
  boolean: { fg: CYAN_16 },
  constant: { fg: CYAN_16 },
  function: { fg: MAGENTA_16 },
  "function.call": { fg: MAGENTA_16 },
  constructor: { fg: YELLOW_16 },
  type: { fg: YELLOW_16 },
  operator: { fg: RED_16 },
  variable: { fg: WHITE_16 },
  property: { fg: CYAN_16 },
  bracket: { fg: WHITE_16 },
  punctuation: { fg: WHITE_16 },
  default: { fg: WHITE_16 },
})

export const SYNTAX_TOKEN_COUNT = 17

import { detectColorCapability, type ColorTier } from "../theme/detect.js";
export const detectColorTier = detectColorCapability;
export type { ColorTier };

export function getPaletteForTier(tier: ColorTier): Record<string, StyleDefinition> {
  switch (tier) {
    case "truecolor": return TRUECOLOR_PALETTE
    case "ansi256": return ANSI256_PALETTE
    case "ansi16": return ANSI16_PALETTE
  }
}

const MAX_PATH_LENGTH = 4096

export function resolveFiletype(
  apiLanguage: string | null | undefined,
  filePath: string
): string | undefined {
  // 1. Prefer explicit API language field
  if (typeof apiLanguage === "string") {
    const trimmed = apiLanguage.trim()
    if (trimmed.length > 0) {
      return trimmed.toLowerCase()
    }
  }

  // 2. Fall back to path-based detection
  if (typeof filePath === "string" && filePath.length > 0 && filePath.length <= MAX_PATH_LENGTH) {
    return pathToFiletype(filePath)
  }

  // 3. No language detected — plain text
  return undefined
}

export function createDiffSyntaxStyle(tier: ColorTier): SyntaxStyle {
  const palette = getPaletteForTier(tier)
  return SyntaxStyle.fromStyles(palette)
}

// Re-exported for convenience (from @opentui/core)
export { pathToFiletype }
