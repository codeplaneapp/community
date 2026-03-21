import { useMemo, useEffect, useRef } from "react"
import { type SyntaxStyle } from "@opentui/core"
import { createDiffSyntaxStyle, detectColorTier, type ColorTier } from "../lib/diff-syntax.js"

/**
 * Creates and memoizes a SyntaxStyle instance for the diff viewer.
 * 
 * The style is created once when the hook first runs and destroyed
 * when the component unmounts. It is NOT recreated on:
 * - View mode toggle (unified ↔ split)
 * - File navigation (]/[)
 * - Whitespace toggle (w)
 * - Terminal resize
 * - Scroll position changes
 * 
 * @param colorTier - Optional color tier override. If not provided,
 *   detects from environment variables. Pass from ThemeProvider context
 *   when available to avoid redundant detection.
 * @returns A stable SyntaxStyle instance, or null if creation failed.
 */
export function useDiffSyntaxStyle(colorTier?: ColorTier): SyntaxStyle | null {
  const tier = colorTier ?? detectColorTier()
  
  // Ref to track whether the style was created successfully
  const styleRef = useRef<SyntaxStyle | null>(null)

  const syntaxStyle = useMemo(() => {
    try {
      const style = createDiffSyntaxStyle(tier)
      styleRef.current = style
      return style
    } catch (err) {
      // SyntaxStyle.fromStyles() failed (e.g., native lib unavailable)
      // Log error; diff will render without syntax highlighting
      console.error("diff.syntax.style_create_failed", err)
      styleRef.current = null
      return null
    }
  }, [tier])

  // Cleanup: destroy native resources on unmount
  useEffect(() => {
    return () => {
      if (styleRef.current) {
        styleRef.current.destroy()
        styleRef.current = null
      }
    }
  }, [syntaxStyle])

  return syntaxStyle
}
