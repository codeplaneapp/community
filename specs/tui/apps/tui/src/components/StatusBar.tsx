import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateRight } from "../util/text.js";
import { useAuth } from "../hooks/useAuth.js";
import type { AuthStatus } from "../providers/AuthProvider.js";
import { statusToToken } from "../theme/tokens.js";
import { useLoading } from "../hooks/useLoading.js";
import { STATUS_BAR_ERROR_PADDING } from "../loading/constants.js";
import { useStatusBarHints } from "../hooks/useStatusBarHints.js";

export function StatusBar() {
  const { width, breakpoint } = useLayout();
  const theme = useTheme();
  const { hints } = useStatusBarHints();
  
  const { status, user, tokenSource } = useAuth();
  const { statusBarError, currentScreenLoading } = useLoading();
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
    const maxTotal = 40;
    const suffix = ` via ${tokenSource}`;
    const prefix = "✓ ";
    const maxUsername = maxTotal - prefix.length - suffix.length;
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

  const maxErrorWidth = Math.max(10, width - STATUS_BAR_ERROR_PADDING);
  const showRetryHint =
    currentScreenLoading?.status === "error" ||
    currentScreenLoading?.status === "timeout";

  const renderHints = () => {
    if (breakpoint === "minimum") {
      const minHints = hints.slice(0, 4);
      return minHints.map((h, i) => (
        <React.Fragment key={i}>
          <text fg={theme.primary}>{h.keys}</text>
          <text fg={theme.muted}>:{h.label}{i < minHints.length - 1 ? "  " : ""}</text>
        </React.Fragment>
      ));
    }
    
    return hints.map((h, i) => (
      <React.Fragment key={i}>
        <text fg={theme.primary}>{h.keys}</text>
        <text fg={theme.muted}>:{h.label}{i < hints.length - 1 ? "  " : ""}</text>
      </React.Fragment>
    ));
  };

  return (
    <box flexDirection="row" height={1} width="100%" justifyContent="space-between" borderColor={theme.border} border={["top"]}>
      <box flexGrow={1}>
        {statusBarError ? (
          <text fg={theme.error}>{truncateRight(statusBarError, maxErrorWidth)}</text>
        ) : (
          <>
            {renderHints()}
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
