import { useState, useCallback, useRef } from "react"
import {
  copyToClipboard,
  type ClipboardResult,
  type ClipboardProvider,
} from "../lib/clipboard.js"

export type ClipboardStatus = "idle" | "copying" | "copied" | "failed" | "unavailable"

export interface UseClipboardReturn {
  /** Attempt to copy text to the system clipboard */
  copy: (text: string) => Promise<ClipboardResult>
  /** Current status of the last copy operation */
  status: ClipboardStatus
  /** The text that should be shown for manual copy (set when provider is "none") */
  fallbackText: string | null
  /** Clear the fallback text display */
  clearFallback: () => void
  /** The detected clipboard provider */
  provider: ClipboardProvider | null
}

const STATUS_RESET_DELAY_MS = 2000

/**
 * React hook for clipboard copy operations.
 *
 * Provides a copy function with status tracking and automatic
 * status reset after 2 seconds. When no clipboard provider is
 * available, sets fallbackText for the component to display.
 */
export function useClipboard(): UseClipboardReturn {
  const [status, setStatus] = useState<ClipboardStatus>("idle")
  const [fallbackText, setFallbackText] = useState<string | null>(null)
  const [provider, setProvider] = useState<ClipboardProvider | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearFallback = useCallback(() => {
    setFallbackText(null)
  }, [])

  const copy = useCallback(async (text: string): Promise<ClipboardResult> => {
    // Clear any pending status reset
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    setStatus("copying")
    setFallbackText(null)

    const result = await copyToClipboard(text)
    setProvider(result.provider)

    if (result.success) {
      setStatus("copied")
    } else if (result.provider === "none") {
      setStatus("unavailable")
      setFallbackText(text)
    } else {
      setStatus("failed")
    }

    // Auto-reset status after delay (except "unavailable" which persists
    // until the user dismisses the fallback)
    if (result.provider !== "none") {
      timeoutRef.current = setTimeout(() => {
        setStatus("idle")
        timeoutRef.current = null
      }, STATUS_RESET_DELAY_MS)
    }

    return result
  }, [])

  return { copy, status, fallbackText, clearFallback, provider }
}