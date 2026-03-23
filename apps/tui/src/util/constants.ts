/**
 * Terminal dimension breakpoint thresholds.
 * These match the ranges in src/types/breakpoint.ts and the design spec §8.1.
 */
export const MIN_COLS = 80;
export const MIN_ROWS = 24;
export const STANDARD_COLS = 120;
export const STANDARD_ROWS = 40;
export const LARGE_COLS = 200;
export const LARGE_ROWS = 60;

/**
 * Auth token validation timeout in milliseconds.
 * Bootstrap step 5: GET /api/user with this timeout.
 * On timeout, TUI proceeds optimistically with "offline" indicator.
 */
export const AUTH_VALIDATION_TIMEOUT_MS = 5_000;

/**
 * Maximum navigation stack depth.
 * Push beyond this limit drops the oldest (bottom) entry.
 * Matches the value in src/router/types.ts.
 */
export const MAX_STACK_DEPTH = 32;

/**
 * Full-screen loading timeout in milliseconds.
 * If initial screen data hasn't loaded after this duration,
 * show a timeout error instead of indefinite spinner.
 */
export const LOADING_TIMEOUT_MS = 30_000;

/**
 * Debounce interval for retry actions in milliseconds.
 * Prevents rapid-fire retries when user holds down 'R'.
 */
export const RETRY_DEBOUNCE_MS = 1_000;

/**
 * Duration in milliseconds that transient status bar confirmations
 * (e.g., "Authenticated as @user") remain visible before fading.
 */
export const STATUS_BAR_CONFIRMATION_MS = 3_000;

/**
 * Crash loop detection: time window in milliseconds.
 * If the TUI restarts more than CRASH_LOOP_MAX_RESTARTS times
 * within this window, show a persistent error instead of restarting.
 */
export const CRASH_LOOP_WINDOW_MS = 5_000;

/**
 * Crash loop detection: max restart count within the window.
 */
export const CRASH_LOOP_MAX_RESTARTS = 3;
