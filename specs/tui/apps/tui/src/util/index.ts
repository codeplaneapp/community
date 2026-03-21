/**
 * Utility functions for the TUI application.
 *
 * Planned modules:
 *   truncate.ts   — Smart text truncation with ellipsis for breadcrumbs, list rows, metadata
 *   format.ts     — Date (relative timestamps), number, status badge formatting
 *   constants.ts  — Max stack depth (32), timeouts (5s auth, 1500ms go-to, 30s SSE reconnect),
 *                   breakpoint thresholds (80x24 min, 120x40 std, 200x60 lg),
 *                   pagination (500 item memory cap, 80% scroll threshold)
 *
 * Note: src/screens/Agents/utils/formatTimestamp.ts already implements relative
 * timestamp formatting. This may be generalized and promoted to src/util/ in a
 * future ticket.
 */

export { truncateBreadcrumb, truncateRight, fitWidth } from "./text.js";
