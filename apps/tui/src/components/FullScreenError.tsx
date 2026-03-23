import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateRight } from "../util/text.js";
import type { LoadingError } from "../loading/types.js";

interface FullScreenErrorProps {
  /** Screen label for the error message (e.g., "issues"). */
  screenLabel: string;
  /** Structured error details. */
  error: LoadingError;
}

/**
 * Full-screen error display, centered in the content area.
 *
 * Shows:
 *   ✗ Failed to load {screenLabel}
 *   {error.summary}
 *
 * The status bar should show "R retry" hint when this is visible.
 */
export function FullScreenError({
  screenLabel,
  error,
}: FullScreenErrorProps) {
  const { width, contentHeight } = useLayout();
  const theme = useTheme();

  const errorLine = `✗ Failed to load ${screenLabel}`;
  const summaryLine = error.httpStatus
    ? `${error.summary} (${error.httpStatus})`
    : error.summary;

  const maxWidth = Math.max(10, width - 4);

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
      width="100%"
      height={contentHeight}
    >
      <text attributes={1} fg={theme.error}>
        {truncateRight(errorLine, maxWidth)}
      </text>
      <text />
      <text fg={theme.muted}>{truncateRight(summaryLine, maxWidth)}</text>
    </box>
  );
}
