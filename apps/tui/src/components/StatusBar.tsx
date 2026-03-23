import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { statusToToken } from "../theme/tokens.js";
import { useAuth } from "../hooks/useAuth.js";
import { useLoading } from "../hooks/useLoading.js";
import { STATUS_BAR_ERROR_PADDING } from "../loading/constants.js";
import { truncateRight } from "../util/text.js";
import type { AuthStatus } from "../providers/AuthProvider.js";

export function StatusBar() {
  const { width, breakpoint } = useLayout();
  const theme = useTheme();
  const { status, user, tokenSource } = useAuth();
  const { statusBarError, currentScreenLoading } = useLoading();
  const showRetryHint =
    currentScreenLoading?.status === "error" ||
    currentScreenLoading?.status === "timeout";
  
  const [showAuthConfirm, setShowAuthConfirm] = useState(false);
  const prevStatusRef = useRef<AuthStatus | null>(null);

  useEffect(() => {
    if (status === "authenticated" && prevStatusRef.current === "loading") {
      setShowAuthConfirm(true);
      const timer = setTimeout(() => setShowAuthConfirm(false), 3000);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = status;
  }, [status]);

  const authConfirmText = useMemo(() => {
    if (!showAuthConfirm || !user || !tokenSource) return null;
    const MAX_TOTAL = 40;
    const prefix = "✓ ";
    const suffix = ` via ${tokenSource}`;
    const maxUsername = MAX_TOTAL - prefix.length - suffix.length;
    
    const cappedMax = Math.min(maxUsername, 20);
    const displayName = user.length > cappedMax
      ? user.slice(0, cappedMax - 1) + "…"
      : user;
    return `${prefix}${displayName}${suffix}`;
  }, [showAuthConfirm, user, tokenSource]);

  const offlineWarning = status === "offline" ? "⚠ offline — token not verified" : null;

  const syncState = "connected"; // placeholder
  const syncColor = theme[statusToToken(syncState)];
  const syncLabel = syncState === "connected" ? "synced" : syncState;

  const showFullHints = breakpoint !== "minimum";
  const maxErrorWidth = Math.max(10, width - STATUS_BAR_ERROR_PADDING);

  return (
    <box flexDirection="row" height={1} width="100%" borderColor={theme.border} border={["top"]} justifyContent="space-between">
      <box flexGrow={1} flexDirection="row">
        {statusBarError ? (
          <text fg={theme.error}>{truncateRight(statusBarError, maxErrorWidth)}</text>
        ) : (
          <>
            {showFullHints && (
              <>
                <text fg={theme.primary}>j/k</text>
                <text fg={theme.muted}>:navigate  </text>
                <text fg={theme.primary}>Enter</text>
                <text fg={theme.muted}>:select  </text>
              </>
            )}
            <text fg={theme.primary}>q</text>
            <text fg={theme.muted}>:back  </text>
            <text fg={theme.primary}>?</text>
            <text fg={theme.muted}>:help</text>
            {showRetryHint && (
              <>
                <text fg={theme.muted}>  </text>
                <text fg={theme.primary}>R</text>
                <text fg={theme.muted}>:retry</text>
              </>
            )}
          </>
        )}
      </box>
      <box>
        {authConfirmText && <text fg={theme.success}>{authConfirmText}</text>}
        {offlineWarning && <text fg={theme.warning}>{offlineWarning}</text>}
        {!authConfirmText && !offlineWarning && <text fg={syncColor}>{syncLabel}</text>}
      </box>
      <box>
        <text fg={theme.muted}>  </text>
        <text fg={theme.primary}>?</text>
        <text fg={theme.muted}> help</text>
      </box>
    </box>
  );
}
