/**
 * Utility functions for the TUI application.
 *
 * - truncate.ts   — Smart text truncation with ellipsis for breadcrumbs, list rows, metadata
 * - format.ts     — Auth confirmation, error summary formatting
 * - constants.ts  — Terminal dimension thresholds, timeouts, limits
 */

export { truncateText, truncateLeft, wrapText } from "./truncate.js";
export { formatAuthConfirmation, formatErrorSummary } from "./format.js";
export {
  MIN_COLS,
  MIN_ROWS,
  STANDARD_COLS,
  STANDARD_ROWS,
  LARGE_COLS,
  LARGE_ROWS,
  AUTH_VALIDATION_TIMEOUT_MS,
  MAX_STACK_DEPTH,
  LOADING_TIMEOUT_MS,
  RETRY_DEBOUNCE_MS,
  STATUS_BAR_CONFIRMATION_MS,
  CRASH_LOOP_WINDOW_MS,
  CRASH_LOOP_MAX_RESTARTS,
} from "./constants.js";
