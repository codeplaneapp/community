import React from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useSpinner } from "../hooks/useSpinner.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateText } from "../util/text.js";

export interface AuthLoadingScreenProps {
  host: string;
}

export function AuthLoadingScreen({ host }: AuthLoadingScreenProps) {
  const { width } = useTerminalDimensions();
  const spinnerFrame = useSpinner();
  const theme = useTheme();

  const displayHost = truncateText(host, width - 4);

  useKeyboard((_event) => {
    // Consume all keys
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box height={1} borderBottom="single" borderColor={theme.border}>
        <text bold fg={theme.primary}>Codeplane</text>
      </box>

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

      <box height={1} borderTop="single" borderColor={theme.border} justifyContent="flex-end">
        <text fg={theme.muted}>Ctrl+C quit</text>
      </box>
    </box>
  );
}
