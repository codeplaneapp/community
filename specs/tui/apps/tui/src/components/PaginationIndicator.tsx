import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateRight } from "../util/text.js";
import type { PaginationStatus, LoadingError } from "../loading/types.js";
import { PAGINATION_INDICATOR_PADDING } from "../loading/constants.js";

interface PaginationIndicatorProps {
  /** Current pagination status. */
  status: PaginationStatus;
  /** Spinner frame from shared context. */
  spinnerFrame: string;
  /** Error details if pagination failed. */
  error?: LoadingError | null;
}

/**
 * Inline pagination loading indicator rendered at the bottom of a scrollbox.
 *
 * Shows:
 * - Loading: "{spinnerFrame} Loading more…" in muted color
 * - Error: "✗ Failed to load — R to retry" in error color
 *
 * Text is capped at terminal_width - 4 characters.
 */
export function PaginationIndicator({
  status,
  spinnerFrame,
  error,
}: PaginationIndicatorProps) {
  const { width } = useLayout();
  const theme = useTheme();
  const maxWidth = Math.max(10, width - PAGINATION_INDICATOR_PADDING);

  if (status === "idle") return null;

  if (status === "loading") {
    return (
      <box height={1} paddingX={1}>
        <text fg={theme.muted}>
          <span fg={theme.primary}>{spinnerFrame}</span>
          <span> {truncateRight("Loading more…", maxWidth - 2)}</span>
        </text>
      </box>
    );
  }

  // status === "error"
  const errorText =
    error?.type === "rate_limited"
      ? "Rate limited — try again later"
      : "Failed to load — R to retry";

  return (
    <box height={1} paddingX={1}>
      <text fg={theme.error}>
        {truncateRight(`✗ ${errorText}`, maxWidth)}
      </text>
    </box>
  );
}
