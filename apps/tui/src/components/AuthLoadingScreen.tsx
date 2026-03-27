import React from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useSpinner } from "../hooks/useSpinner.js";
import { detectColorCapability } from "../theme/detect.js";
import { createTheme, TextAttributes } from "../theme/tokens.js";
import { truncateText } from "../util/text.js";

export interface AuthLoadingScreenProps {
  host: string;
}

export function AuthLoadingScreen({ host }: AuthLoadingScreenProps) {
  const { width } = useTerminalDimensions();
  const spinnerFrame = useSpinner(true);
  const theme = createTheme(detectColorCapability());

  const displayHost = truncateText(host, width - 4);

  useKeyboard((_event) => {
    // Consume all keys
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box height={1} border={["bottom"]} borderStyle="single" borderColor={theme.border}>
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>Codeplane</text>
      </box>

      <box
        flexDirection="column"
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
      >
        <box flexDirection="row">
          <text fg={theme.primary}>{spinnerFrame}</text>
          <text> Authenticating…</text>
        </box>
        <text fg={theme.muted}>{displayHost}</text>
      </box>

      <box height={1} border={["top"]} borderStyle="single" borderColor={theme.border} justifyContent="flex-end">
        <text fg={theme.muted}>Ctrl+C quit</text>
      </box>
    </box>
  );
}
