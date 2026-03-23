import { useTheme } from "../hooks/useTheme.js";
import { useLoading } from "../hooks/useLoading.js";
import { MIN_SAVING_BUTTON_WIDTH } from "../loading/constants.js";

interface ActionButtonProps {
  /** Button label when not loading. */
  label: string;
  /** Whether the button is in loading state. */
  isLoading?: boolean;
  /** Custom loading label. Default: "Saving…" */
  loadingLabel?: string;
  /** Press handler. */
  onPress?: () => void;
  /** Whether the button is disabled. */
  disabled?: boolean;
}

/**
 * Button component with action loading support.
 *
 * When isLoading is true, displays a spinner + "Saving…" label
 * in place of the normal label. The button width expands if needed
 * to fit the loading label (minimum 10 characters).
 */
export function ActionButton({
  label,
  isLoading = false,
  loadingLabel = "Saving…",
  onPress,
  disabled,
}: ActionButtonProps) {
  const theme = useTheme();
  const loading = useLoading();

  const displayLabel = isLoading
    ? `${loading.spinnerFrame} ${loadingLabel}`
    : label;
  const minWidth = isLoading
    ? Math.max(label.length, MIN_SAVING_BUTTON_WIDTH)
    : label.length;

  return (
    <box
      height={1}
      minWidth={minWidth + 2}
      paddingX={1}
      border={true}
      borderColor={disabled || isLoading ? theme.muted : theme.primary}
    >
      <text
        fg={disabled || isLoading ? theme.muted : theme.primary}
        attributes={disabled ? 0 : 1}
      >
        {displayLabel}
      </text>
    </box>
  );
}
