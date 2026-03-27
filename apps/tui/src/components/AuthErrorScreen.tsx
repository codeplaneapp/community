import React, { useRef, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import { detectColorCapability } from "../theme/detect.js";
import { createTheme, TextAttributes } from "../theme/tokens.js";
import type { AuthTokenSource } from "../../../cli/src/auth-state.js";

export interface AuthErrorScreenProps {
  variant: "no-token" | "expired";
  host: string;
  tokenSource: AuthTokenSource | null;
  onRetry: () => void;
}

export function AuthErrorScreen({ variant, host, tokenSource, onRetry }: AuthErrorScreenProps) {
  const theme = createTheme(detectColorCapability());

  const lastRetryRef = useRef(0);
  const handleRetry = useCallback(() => {
    const now = Date.now();
    if (now - lastRetryRef.current < 1000) return;
    lastRetryRef.current = now;
    onRetry();
  }, [onRetry]);

  useKeyboard((event) => {
    if (event.name === "q") {
      process.exit(0);
    }
    if (event.name === "r") {
      handleRetry();
    }
  });

  if (variant === "no-token") {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <box height={1} border={["bottom"]} borderStyle="single" borderColor={theme.border}>
          <text fg={theme.primary} attributes={TextAttributes.BOLD}>Codeplane</text>
        </box>
        <box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={2}>
          <text fg={theme.error} attributes={TextAttributes.BOLD}>✗ Not authenticated</text>
          <text />
          <text>{`No token found for ${host}.`}</text>
          <text />
          <text>Run the following command to log in:</text>
          <text />
          <text fg={theme.primary} attributes={TextAttributes.BOLD}>  codeplane auth login</text>
          <text />
          <text>Or set the CODEPLANE_TOKEN environment variable.</text>
        </box>
        <box height={1} border={["top"]} borderStyle="single" borderColor={theme.border}>
          <text fg={theme.muted}>q quit │ R retry │ Ctrl+C quit</text>
        </box>
      </box>
    );
  }

  const sourceLabel = tokenSource ?? "unknown";
  return (
    <box flexDirection="column" width="100%" height="100%">
      <box height={1} border={["bottom"]} borderStyle="single" borderColor={theme.border}>
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>Codeplane</text>
      </box>
      <box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={2}>
        <text fg={theme.error} attributes={TextAttributes.BOLD}>✗ Session expired</text>
        <text />
        <text>{`Stored token for ${host} from ${sourceLabel} is invalid or expired.`}</text>
        <text />
        <text>Run the following command to re-authenticate:</text>
        <text />
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>  codeplane auth login</text>
      </box>
      <box height={1} border={["top"]} borderStyle="single" borderColor={theme.border}>
        <text fg={theme.muted}>q quit │ R retry │ Ctrl+C quit</text>
      </box>
    </box>
  );
}
