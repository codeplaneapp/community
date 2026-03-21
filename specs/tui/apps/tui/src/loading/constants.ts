/**
 * Loading state constants.
 */

/** Timeout for full-screen loading in milliseconds. */
export const LOADING_TIMEOUT_MS = 30_000;

/**
 * Minimum response time (ms) before showing spinner.
 * If data arrives before this threshold, skip the spinner entirely.
 */
export const SPINNER_SKIP_THRESHOLD_MS = 80;

/** Duration to display optimistic revert error in status bar (ms). */
export const STATUS_BAR_ERROR_DURATION_MS = 5_000;

/** Retry debounce interval in milliseconds. */
export const RETRY_DEBOUNCE_MS = 1_000;

/** Block character for skeleton rendering (Unicode). */
export const SKELETON_BLOCK_CHAR = "▓";

/** Dash character for skeleton rendering (ASCII/no-color). */
export const SKELETON_DASH_CHAR = "-";

/** Maximum characters for loading label (terminal_width - 6). */
export const LOADING_LABEL_PADDING = 6;

/** Maximum characters for error summary. */
export const ERROR_SUMMARY_MAX_LENGTH = 60;

/** Maximum characters for status bar error message (terminal_width - 20). */
export const STATUS_BAR_ERROR_PADDING = 20;

/** Maximum characters for pagination indicator (terminal_width - 4). */
export const PAGINATION_INDICATOR_PADDING = 4;

/** Minimum button width for action loading ("⠋ Saving…" = 10 chars). */
export const MIN_SAVING_BUTTON_WIDTH = 10;
