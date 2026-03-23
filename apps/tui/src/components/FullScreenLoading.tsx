import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateRight } from "../util/text.js";
import { LOADING_LABEL_PADDING } from "../loading/constants.js";

interface FullScreenLoadingProps {
  /** Spinner frame character from shared context. */
  spinnerFrame: string;
  /** Loading label (e.g., "Loading issues…"). */
  label: string;
}

/**
 * Full-screen loading spinner, centered in the content area.
 *
 * Renders a single line: `{spinnerFrame} {label}`
 * centered both horizontally and vertically within the available
 * content height (total height minus header and status bar).
 *
 * The label is truncated to fit within `terminal_width - 6`.
 * The spinner character uses the `primary` theme color.
 */
export function FullScreenLoading({
  spinnerFrame,
  label,
}: FullScreenLoadingProps) {
  const { width, contentHeight } = useLayout();
  const theme = useTheme();

  const maxLabelWidth = Math.max(1, width - LOADING_LABEL_PADDING);
  const truncatedLabel = truncateRight(label, maxLabelWidth);

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
      width="100%"
      height={contentHeight}
    >
      <text>
        <span fg={theme.primary}>{spinnerFrame}</span>
        <span> {truncatedLabel}</span>
      </text>
    </box>
  );
}
