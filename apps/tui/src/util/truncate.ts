/**
 * Ellipsis character used for truncation indicators.
 * Single Unicode character (U+2026), width = 1 column.
 */
const ELLIPSIS = "…";

/**
 * Truncate text from the right, appending "…" if truncated.
 *
 * - If `text.length <= maxWidth`, returns `text` unchanged.
 * - If `maxWidth < 1`, returns empty string.
 * - If `maxWidth === 1`, returns `ELLIPSIS`.
 * - Otherwise, returns `text.slice(0, maxWidth - 1) + ELLIPSIS`.
 *
 * @param text - The input string to truncate.
 * @param maxWidth - Maximum number of columns the result may occupy.
 * @returns The truncated string, guaranteed to have `.length <= maxWidth`.
 *
 * @example
 * truncateText("Hello, world!", 8) // "Hello, …"
 * truncateText("Short", 10)        // "Short"
 * truncateText("Hi", 2)            // "Hi"
 * truncateText("Hello", 1)         // "…"
 */
export function truncateText(text: string, maxWidth: number): string {
  if (maxWidth < 1) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return ELLIPSIS;
  return text.slice(0, maxWidth - 1) + ELLIPSIS;
}

/**
 * Truncate text from the left, prepending "…" if truncated.
 * Used for breadcrumb paths that overflow at minimum terminal widths.
 *
 * - If `text.length <= maxWidth`, returns `text` unchanged.
 * - If `maxWidth < 1`, returns empty string.
 * - If `maxWidth === 1`, returns `ELLIPSIS`.
 * - Otherwise, returns `ELLIPSIS + text.slice(-(maxWidth - 1))`.
 *
 * @param text - The input string to truncate.
 * @param maxWidth - Maximum number of columns the result may occupy.
 * @returns The left-truncated string, guaranteed to have `.length <= maxWidth`.
 *
 * @example
 * truncateLeft("Dashboard > acme/api > Issues > #42", 20)
 * // "…api > Issues > #42"
 * truncateLeft("Short", 10)  // "Short"
 */
export function truncateLeft(text: string, maxWidth: number): string {
  if (maxWidth < 1) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return ELLIPSIS;
  return ELLIPSIS + text.slice(-(maxWidth - 1));
}

/**
 * Wrap text into lines at word boundaries.
 *
 * Algorithm:
 * 1. Split input into words on whitespace.
 * 2. Greedily fill each line up to `maxWidth` columns.
 * 3. If a single word exceeds `maxWidth`, hard-break it at `maxWidth` columns
 *    (no ellipsis — the full word is preserved across lines).
 * 4. Empty input returns `[""]`.
 * 5. Leading/trailing whitespace is trimmed from each line.
 *
 * @param text - The input string to wrap.
 * @param maxWidth - Maximum columns per line. Must be >= 1.
 * @returns Array of lines, each with `.length <= maxWidth`.
 *
 * @example
 * wrapText("Hello world, this is a long sentence", 15)
 * // ["Hello world,", "this is a long", "sentence"]
 *
 * wrapText("Superlongword", 5)
 * // ["Super", "longw", "ord"]
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth < 1) return [""];
  if (text.length === 0) return [""];

  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    // Word fits on current line (with space separator if line is non-empty)
    if (currentLine.length === 0) {
      if (word.length <= maxWidth) {
        currentLine = word;
      } else {
        // Hard-break long word
        let remaining = word;
        while (remaining.length > maxWidth) {
          lines.push(remaining.slice(0, maxWidth));
          remaining = remaining.slice(maxWidth);
        }
        if (remaining.length > 0) {
          currentLine = remaining;
        }
      }
    } else if (currentLine.length + 1 + word.length <= maxWidth) {
      currentLine += " " + word;
    } else {
      // Current line is full, start new line
      lines.push(currentLine);
      currentLine = "";

      if (word.length <= maxWidth) {
        currentLine = word;
      } else {
        let remaining = word;
        while (remaining.length > maxWidth) {
          lines.push(remaining.slice(0, maxWidth));
          remaining = remaining.slice(maxWidth);
        }
        if (remaining.length > 0) {
          currentLine = remaining;
        }
      }
    }
  }

  // Push the last line
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length === 0 ? [""] : lines;
}
