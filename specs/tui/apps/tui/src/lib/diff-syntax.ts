import { RGBA, type StyleDefinition, SyntaxStyle, pathToFiletype } from "@opentui/core"
import { detectColorCapability, type ColorTier } from "../theme/detect.js"

export const detectColorTier = detectColorCapability;
export type { ColorTier };

// Truecolor (24-bit RGB) Palette
const KEYWORD_TC = RGBA.fromHex("#FF7B72")
const STRING_TC = RGBA.fromHex("#A5D6FF")
const COMMENT_TC = RGBA.fromHex("#8B949E")
const NUMBER_TC = RGBA.fromHex("#79C0FF")
const FUNCTION_TC = RGBA.fromHex("#D2A8FF")
const CONSTRUCTOR_TC = RGBA.fromHex("#FFA657")
const VARIABLE_TC = RGBA.fromHex("#E6EDF3")
const BRACKET_TC = RGBA.fromHex("#F0F6FC")

export const TRUECOLOR_PALETTE: Readonly<Record<string, StyleDefinition>> = Object.freeze({
  keyword: { fg: KEYWORD_TC, bold: true },
  "keyword.import": { fg: KEYWORD_TC, bold: true },
  string: { fg: STRING_TC },
  comment: { fg: COMMENT_TC, italic: true },
  number: { fg: NUMBER_TC },
  boolean: { fg: NUMBER_TC },
  constant: { fg: NUMBER_TC },
  function: { fg: FUNCTION_TC },
  "function.call": { fg: FUNCTION_TC },
  constructor: { fg: CONSTRUCTOR_TC },
  type: { fg: CONSTRUCTOR_TC },
  operator: { fg: KEYWORD_TC },
  variable: { fg: VARIABLE_TC },
  property: { fg: NUMBER_TC },
  bracket: { fg: BRACKET_TC },
  punctuation: { fg: BRACKET_TC },
  default: { fg: VARIABLE_TC },
})

// ANSI 256 Palette
const KEYWORD_256 = RGBA.fromInts(255, 135, 95) // 209 #FF875F
const STRING_256 = RGBA.fromInts(175, 215, 255) // 153 #AFD7FF
const COMMENT_256 = RGBA.fromInts(168, 168, 168) // 248 #A8A8A8
const NUMBER_256 = RGBA.fromInts(135, 215, 255) // 117 #87D7FF
const FUNCTION_256 = RGBA.fromInts(215, 175, 255) // 183 #D7AFFF
const CONSTRUCTOR_256 = RGBA.fromInts(255, 175, 95) // 215 #FFAF5F
const VARIABLE_256 = RGBA.fromInts(238, 238, 238) // 255 #EEEEEE
const BRACKET_256 = RGBA.fromInts(238, 238, 238) // 255 #EEEEEE

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
  variable: { fg: VARIABLE_256 },
  property: { fg: NUMBER_256 },
  bracket: { fg: BRACKET_256 },
  punctuation: { fg: BRACKET_256 },
  default: { fg: VARIABLE_256 },
})

// ANSI 16 Palette
const RED_16 = RGBA.fromInts(255, 0, 0)
const CYAN_16 = RGBA.fromInts(0, 255, 255)
const WHITE_16 = RGBA.fromInts(255, 255, 255)
const DIM_WHITE_16 = RGBA.fromInts(192, 192, 192)
const MAGENTA_16 = RGBA.fromInts(255, 0, 255)
const YELLOW_16 = RGBA.fromInts(255, 255, 0)

export const ANSI16_PALETTE: Readonly<Record<string, StyleDefinition>> = Object.freeze({
  keyword: { fg: RED_16, bold: true },
  "keyword.import": { fg: RED_16, bold: true },
  string: { fg: CYAN_16 },
  comment: { fg: DIM_WHITE_16, dim: true },
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

export { pathToFiletype }
