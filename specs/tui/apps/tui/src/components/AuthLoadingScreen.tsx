import React from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useSpinner } from "../hooks/useSpinner.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateText } from "../util/text.js";

interface AuthLoadingScreenProps {
  host: string;
}

export function AuthLoadingScreen({ host }: AuthLoadingScreenProps) {
  const { width } = useTerminalDimensions();
  const spinnerFrame = useSpinner(true);
  const theme = useTheme();

  // Truncate host to terminal_width - 4 with ellipsis
  const displayHost = truncateText(host, width - 4);

  // Only Ctrl+C active during loading — handled by global signal handler
  // No other keybindings registered. Navigation keys are inactive.
  useKeyboard((event) => {
    // All key events are consumed (no-op) to prevent propagation
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box height={1}>
        <text fg={theme.primary}>Codeplane</text>
      </box>

      {/* Content area — centered */}
      <box
        flexDirection="column"
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
      >
        <text>
          <text fg={theme.primary}>{spinnerFrame}</text>
          <text> Authenticating…</text>
        </text>
        <text fg={theme.muted}>{displayHost}</text>
      </box>

      {/* Status bar */}
      <box height={1} justifyContent="flex-end">
        <text fg={theme.muted}>Ctrl+C quit</text>
      </box>
    </box>
  );
}
