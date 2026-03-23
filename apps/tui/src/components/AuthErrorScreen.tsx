import React, { useRef, useCallback } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useTheme } from "../hooks/useTheme.js";
import type { AuthTokenSource } from "@codeplane/cli/auth-state";

export interface AuthErrorScreenProps {
  variant: "no-token" | "expired";
  host: string;
  tokenSource: AuthTokenSource | null;
  onRetry: () => void;
}

export function AuthErrorScreen({ variant, host, tokenSource, onRetry }: AuthErrorScreenProps) {
  const { width } = useTerminalDimensions();
  const theme = useTheme();
  
  const lastRetryRef = useRef(0);
  const handleRetry = useCallback(() => {
    const now = Date.now();
    if (now - lastRetryRef.current < 1000) return;
    lastRetryRef.current = now;
    onRetry();
  }, [onRetry]);
  
  useKeyboard((event) => {
    if (event.key === "q") {
      process.exit(0);
    }
    if (event.key === "r" || event.key === "R") {
      handleRetry();
    }
  });
  
  if (variant === "no-token") {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <box height={1} borderBottom="single" borderColor={theme.border}>
          <text bold fg={theme.primary}>Codeplane</text>
        </box>
        <box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={2}>
          <text bold fg={theme.error}>✗ Not authenticated</text>
          <text />
          <text>No token found for <text fg={theme.muted}>{host}</text>.</text>
          <text />
          <text>Run the following command to log in:</text>
          <text />
          <text fg={theme.primary} bold>  codeplane auth login</text>
          <text />
          <text>Or set the <text bold>CODEPLANE_TOKEN</text> environment variable.</text>
        </box>
        <box height={1} borderTop="single" borderColor={theme.border}>
          <text fg={theme.muted}>q quit │ R retry │ Ctrl+C quit</text>
        </box>
      </box>
    );
  }
  
  const sourceLabel = tokenSource ?? "unknown";
  return (
    <box flexDirection="column" width="100%" height="100%">
      <box height={1} borderBottom="single" borderColor={theme.border}>
        <text bold fg={theme.primary}>Codeplane</text>
      </box>
      <box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={2}>
        <text bold fg={theme.error}>✗ Session expired</text>
        <text />
        <text>Stored token for <text fg={theme.muted}>{host}</text> from {sourceLabel} is invalid or expired.</text>
        <text />
        <text>Run the following command to re-authenticate:</text>
        <text />
        <text fg={theme.primary} bold>  codeplane auth login</text>
      </box>
      <box height={1} borderTop="single" borderColor={theme.border}>
        <text fg={theme.muted}>q quit │ R retry │ Ctrl+C quit</text>
      </box>
    </box>
  );
}
