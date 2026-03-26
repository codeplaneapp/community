import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { TextAttributes } from "../theme/tokens.js";

/**
 * Props for {@link ListEmptyState}.
 */
export interface ListEmptyStateProps {
  /** Message shown in the center of the content area. */
  message?: string;
}

/**
 * Centered empty-state placeholder for list views.
 */
export function ListEmptyState({ message = "No items" }: ListEmptyStateProps) {
  const theme = useTheme();
  const { contentHeight } = useLayout();

  return (
    <box
      flexDirection="column"
      width="100%"
      height={contentHeight}
      justifyContent="center"
      alignItems="center"
    >
      <text fg={theme.muted} attributes={TextAttributes.DIM}>
        {message}
      </text>
    </box>
  );
}
