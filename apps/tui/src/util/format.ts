import { truncateText } from "./truncate.js";

/**
 * Format the auth confirmation message shown in the status bar
 * after successful token validation.
 *
 * Format: "Authenticated as @{username} ({source})"
 * Truncated to fit `maxWidth` if necessary.
 *
 * @param username - The authenticated user's username (e.g., "alice").
 * @param source - Token source identifier: "env", "keyring", or "config".
 * @param maxWidth - Maximum columns available for the message.
 * @returns Formatted and potentially truncated confirmation string.
 *
 * @example
 * formatAuthConfirmation("alice", "keyring", 40)
 * // "Authenticated as @alice (keyring)"
 *
 * formatAuthConfirmation("verylongusername", "env", 25)
 * // "Authenticated as @very…"
 */
export function formatAuthConfirmation(
  username: string,
  source: string,
  maxWidth: number,
): string {
  const full = `Authenticated as @${username} (${source})`;
  if (full.length <= maxWidth) return full;

  // Try without source
  const withoutSource = `Authenticated as @${username}`;
  if (withoutSource.length <= maxWidth) return withoutSource;

  // Truncate the whole message
  return truncateText(full, maxWidth);
}

/**
 * Format an error into a single-line summary string for display
 * in the error boundary or inline error indicators.
 *
 * Handles:
 * - `Error` instances: uses `.message`
 * - Strings: used directly
 * - Objects with `.message` property: uses `.message`
 * - Everything else: `"Unknown error"`
 *
 * The result is always a single line (newlines replaced with spaces)
 * and truncated to `maxChars`.
 *
 * @param error - The caught error value (can be anything).
 * @param maxChars - Maximum character count for the summary.
 * @returns A single-line, truncated error summary.
 *
 * @example
 * formatErrorSummary(new Error("Connection refused"), 30)
 * // "Connection refused"
 *
 * formatErrorSummary({ message: "timeout" }, 10)
 * // "timeout"
 *
 * formatErrorSummary(null, 50)
 * // "Unknown error"
 *
 * formatErrorSummary(new Error("Very long error message that goes on and on"), 20)
 * // "Very long error me…"
 */
export function formatErrorSummary(
  error: unknown,
  maxChars: number,
): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    message = (error as { message: string }).message;
  } else {
    message = "Unknown error";
  }

  // Normalize to single line
  const singleLine = message.replace(/\r?\n/g, " ").trim();

  if (singleLine.length === 0) {
    return truncateText("Unknown error", maxChars);
  }

  return truncateText(singleLine, maxChars);
}
