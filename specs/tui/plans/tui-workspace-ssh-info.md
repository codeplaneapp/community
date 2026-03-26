# Implementation Plan: `tui-workspace-ssh-info`

This plan details the step-by-step implementation for the SSH Connection Info panel within the Codeplane TUI, including the token countdown hook, status placeholders, and full E2E test coverage.

## Step 1: Create the Token Countdown Hook

**File:** `apps/tui/src/hooks/useTokenCountdown.ts`

Create a new hook to manage the 1-second tick countdown for the SSH access token, resolving formatting and semantic color states.

```typescript
import { useState, useEffect, useRef } from "react";
import type { ThemeTokens } from "../theme/tokens.js";

export interface TokenCountdownState {
  remainingSeconds: number;
  formattedTime: string;
  colorKey: keyof Pick<ThemeTokens, "success" | "warning" | "error" | "muted">;
  isExpired: boolean;
}

export function formatTokenTTL(remainingSeconds: number): string {
  if (remainingSeconds <= 0) return "Token expired";
  if (remainingSeconds < 60) return `${remainingSeconds}s`;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function getTokenColorKey(
  remainingSeconds: number,
): TokenCountdownState["colorKey"] {
  if (remainingSeconds <= 0) return "error";
  if (remainingSeconds < 30) return "error";
  if (remainingSeconds <= 120) return "warning";
  return "success";
}

/**
 * Client-side token TTL countdown hook.
 *
 * @param tokenExpiresAt - Epoch milliseconds when the token expires. null/undefined disables countdown.
 * @param onExpire - Callback fired once when the token expires.
 */
export function useTokenCountdown(
  tokenExpiresAt: number | null | undefined,
  onExpire?: () => void,
): TokenCountdownState {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (tokenExpiresAt == null) return 0;
    return Math.max(0, Math.ceil((tokenExpiresAt - Date.now()) / 1000));
  });

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    if (tokenExpiresAt == null) {
      setRemainingSeconds(0);
      hasExpiredRef.current = false;
      return;
    }

    hasExpiredRef.current = false;
    const computeRemaining = () =>
      Math.max(0, Math.ceil((tokenExpiresAt - Date.now()) / 1000));

    setRemainingSeconds(computeRemaining());

    const interval = setInterval(() => {
      const remaining = computeRemaining();
      setRemainingSeconds(remaining);

      if (remaining <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpireRef.current?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [tokenExpiresAt]);

  const formattedTime = formatTokenTTL(remainingSeconds);
  const colorKey = getTokenColorKey(remainingSeconds);
  const isExpired = remainingSeconds <= 0;

  return { remainingSeconds, formattedTime, colorKey, isExpired };
}
```

## Step 2: Create the Status Placeholder Component

**File:** `apps/tui/src/components/SSHInfoPlaceholder.tsx`

Create a component to handle non-running workspace states.

```typescript
import React from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useSpinner } from "../hooks/useSpinner.js";

export interface SSHInfoPlaceholderProps {
  status: string;
}

export function SSHInfoPlaceholder({ status }: SSHInfoPlaceholderProps) {
  const theme = useTheme();
  const isTransitional =
    status === "pending" ||
    status === "starting" ||
    status === "resuming";
  const spinner = useSpinner(isTransitional);

  if (isTransitional) {
    return (
      <box height={1} paddingX={2}>
        <text fg={theme.muted}>
          {spinner} Waiting for workspace to start…
        </text>
      </box>
    );
  }

  if (status === "suspended" || status === "suspending") {
    return (
      <box height={1} paddingX={2}>
        <text fg={theme.warning}>
          Workspace suspended. Press R to resume.
        </text>
      </box>
    );
  }

  return (
    <box height={1} paddingX={2}>
      <text fg={theme.muted}>Workspace stopped.</text>
    </box>
  );
}
```

## Step 3: Create the Main SSH Panel Component

**File:** `apps/tui/src/components/WorkspaceSSHPanel.tsx`

Create the primary panel component. *(Note: Using `attributes={1}` instead of `<text bold>` for proper OpenTUI rendering per research).* 

```typescript
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useLayout } from "../hooks/useLayout.js";
import { useSpinner } from "../hooks/useSpinner.js";
import { useTokenCountdown } from "../hooks/useTokenCountdown.js";
import { truncateText } from "../util/truncate.js";
import { SSHInfoPlaceholder } from "./SSHInfoPlaceholder.js";
import { emit } from "../lib/telemetry.js";

export interface WorkspaceSSHConnectionInfo {
  ssh_host: string;
  port: number;
  username: string;
  command: string;
  access_token?: string;
  workspace_id?: string;
  vm_id?: string;
}

export interface WorkspaceSSHPanelProps {
  workspaceStatus: string;
  sshInfo: WorkspaceSSHConnectionInfo | null;
  isLoading: boolean;
  error: Error | null;
  tokenExpiresAt: number | null;
  isTokenExpired: boolean;
  refetch: () => Promise<void>;
  copyToClipboard: (text: string) => Promise<boolean>;
  clipboardSupported: boolean;
  repoOwner: string;
  repoName: string;
  workspaceId: string;
}

const LABEL_WIDTH: Record<string, number> = {
  minimum: 10,
  standard: 14,
  large: 16,
};
const REFRESH_DEBOUNCE_MS = 2000;
const COPY_FEEDBACK_DURATION_MS = 2000;
const HOST_MAX_DISPLAY_LENGTH = 80;
const USERNAME_MAX_DISPLAY_LENGTH = 32;

export function WorkspaceSSHPanel(props: WorkspaceSSHPanelProps) {
  const {
    workspaceStatus,
    sshInfo,
    isLoading,
    error,
    tokenExpiresAt,
    refetch,
    copyToClipboard,
    clipboardSupported,
    repoOwner,
    repoName,
    workspaceId,
  } = props;

  const theme = useTheme();
  const { width, breakpoint } = useLayout();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const lastRefreshTimeRef = useRef(0);
  const autoRefreshFailedRef = useRef(false);
  const spinner = useSpinner(isRefreshing || (isLoading && workspaceStatus === "running"));

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCopyFeedback = useCallback((message: string) => {
    if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
    setCopyFeedback(message);
    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackTimerRef.current = null;
    }, COPY_FEEDBACK_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
    };
  }, []);

  const handleRefresh = useCallback(async (source: "manual" | "auto") => {
    if (refreshInFlightRef.current) return;
    if (workspaceStatus !== "running") return;

    if (source === "manual") {
      const now = Date.now();
      if (now - lastRefreshTimeRef.current < REFRESH_DEBOUNCE_MS) return;
      lastRefreshTimeRef.current = now;
    }

    refreshInFlightRef.current = true;
    setIsRefreshing(true);

    const previousRemaining = tokenExpiresAt
      ? Math.max(0, Math.ceil((tokenExpiresAt - Date.now()) / 1000))
      : 0;

    try {
      await refetch();
      autoRefreshFailedRef.current = false;
      emit(
        source === "manual"
          ? "tui.workspace.ssh_info.refreshed"
          : "tui.workspace.ssh_info.auto_refreshed",
        {
          repo_owner: repoOwner,
          repo_name: repoName,
          workspace_id: workspaceId,
          refresh_success: true,
          previous_token_remaining_seconds: previousRemaining,
        },
      );
    } catch (err) {
      if (source === "auto") autoRefreshFailedRef.current = true;
      emit("tui.workspace.ssh_info.error", {
        repo_owner: repoOwner,
        repo_name: repoName,
        workspace_id: workspaceId,
        error_type: "network",
        action: source === "manual" ? "refresh" : "auto_refresh",
        refresh_success: false,
      });
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [workspaceStatus, refetch, tokenExpiresAt, repoOwner, repoName, workspaceId]);

  const handleTokenExpire = useCallback(() => {
    if (autoRefreshFailedRef.current) return;
    handleRefresh("auto");
  }, [handleRefresh]);

  const tokenCountdown = useTokenCountdown(
    workspaceStatus === "running" ? tokenExpiresAt : null,
    handleTokenExpire,
  );

  const handleCopyCommand = useCallback(async () => {
    if (workspaceStatus !== "running" || !sshInfo) return;
    if (!clipboardSupported) {
      showCopyFeedback("Copy not available");
      emit("tui.workspace.ssh_info.clipboard_unavailable", {
        repo_owner: repoOwner,
        repo_name: repoName,
        workspace_id: workspaceId,
        copy_target: "command",
      });
      return;
    }
    const success = await copyToClipboard(sshInfo.command);
    showCopyFeedback(success ? "Copied!" : "Copy failed");
    emit("tui.workspace.ssh_info.command_copied", {
      repo_owner: repoOwner,
      repo_name: repoName,
      workspace_id: workspaceId,
      copy_success: success,
      token_remaining_seconds: tokenCountdown.remainingSeconds,
    });
  }, [workspaceStatus, sshInfo, clipboardSupported, copyToClipboard, showCopyFeedback, repoOwner, repoName, workspaceId, tokenCountdown.remainingSeconds]);

  const handleCopyHost = useCallback(async () => {
    if (workspaceStatus !== "running" || !sshInfo) return;
    if (!clipboardSupported) {
      showCopyFeedback("Copy not available");
      emit("tui.workspace.ssh_info.clipboard_unavailable", {
        repo_owner: repoOwner,
        repo_name: repoName,
        workspace_id: workspaceId,
        copy_target: "host",
      });
      return;
    }
    const success = await copyToClipboard(sshInfo.ssh_host);
    showCopyFeedback(success ? "Copied host!" : "Copy failed");
    emit("tui.workspace.ssh_info.host_copied", {
      repo_owner: repoOwner,
      repo_name: repoName,
      workspace_id: workspaceId,
      copy_success: success,
    });
  }, [workspaceStatus, sshInfo, clipboardSupported, copyToClipboard, showCopyFeedback, repoOwner, repoName, workspaceId]);

  const hasEmittedViewedRef = useRef(false);
  useEffect(() => {
    if (sshInfo && workspaceStatus === "running" && !hasEmittedViewedRef.current) {
      hasEmittedViewedRef.current = true;
      emit("tui.workspace.ssh_info.viewed", {
        repo_owner: repoOwner,
        repo_name: repoName,
        workspace_id: workspaceId,
        terminal_columns: width,
        terminal_rows: 0,
        breakpoint: breakpoint ?? "unsupported",
      });
    }
  }, [sshInfo, workspaceStatus, repoOwner, repoName, workspaceId, width, breakpoint]);

  const labelWidth = LABEL_WIDTH[breakpoint ?? "minimum"] ?? LABEL_WIDTH.minimum;
  const isStandardOrLarger = breakpoint === "standard" || breakpoint === "large";
  const isLarge = breakpoint === "large";
  const cmdMaxWidth = Math.max(10, width - labelWidth - 16);
  const hostMaxWidth = Math.min(HOST_MAX_DISPLAY_LENGTH, width - labelWidth - 4);

  const tokenLabel = tokenCountdown.isExpired
    ? autoRefreshFailedRef.current
      ? "Token expired (refresh failed)"
      : tokenCountdown.formattedTime
    : `Token valid for ${tokenCountdown.formattedTime}`;
  const tokenColor = theme[tokenCountdown.colorKey];

  if (breakpoint === null) return null;

  return (
    <box flexDirection="column" gap={0}>
      <box height={1}>
        <text fg={theme.border}>─── </text>
        <text attributes={1}>SSH Connection</text>
        <text fg={theme.border}>
          {" " + "─".repeat(Math.max(0, width - 22))}
        </text>
      </box>

      {workspaceStatus !== "running" ? (
        <SSHInfoPlaceholder status={workspaceStatus} />
      ) : isRefreshing ? (
        <box height={1} paddingX={2}>
          <text fg={theme.muted}>{spinner} Refreshing…</text>
        </box>
      ) : error ? (
        <box paddingX={2}>
          <text fg={theme.error}>{formatError(error)}</text>
        </box>
      ) : sshInfo ? (
        <box flexDirection="column" paddingX={2}>
          {isStandardOrLarger && (
            <box flexDirection="row" height={1}>
              <box width={labelWidth}>
                <text fg={theme.muted}>Host</text>
              </box>
              <text>{truncateText(sshInfo.ssh_host, hostMaxWidth)}</text>
            </box>
          )}

          {isStandardOrLarger && (
            <box flexDirection="row" height={1}>
              <box width={labelWidth}>
                <text fg={theme.muted}>Port</text>
              </box>
              <text>{String(sshInfo.port)}</text>
            </box>
          )}

          {isStandardOrLarger && (
            <box flexDirection="row" height={1}>
              <box width={labelWidth}>
                <text fg={theme.muted}>Username</text>
              </box>
              <text>{truncateText(sshInfo.username, USERNAME_MAX_DISPLAY_LENGTH)}</text>
            </box>
          )}

          <box flexDirection="row" height={1}>
            <box width={labelWidth}>
              <text fg={theme.muted}>Command</text>
            </box>
            <text attributes={1}>{truncateText(sshInfo.command, cmdMaxWidth)}</text>
            <text fg={theme.muted}> (c to copy)</text>
          </box>

          <box flexDirection="row" height={1}>
            <box width={labelWidth}>
              <text fg={theme.muted}>Token</text>
            </box>
            <text fg={tokenColor}>{tokenLabel}</text>
            {tokenCountdown.isExpired && <text fg={theme.muted}> (r:refresh)</text>}
          </box>

          {isLarge && sshInfo.workspace_id && (
            <box flexDirection="row" height={1}>
              <box width={labelWidth}>
                <text fg={theme.muted}>Workspace ID</text>
              </box>
              <text fg={theme.muted}>{sshInfo.workspace_id}</text>
            </box>
          )}
          {isLarge && sshInfo.vm_id && (
            <box flexDirection="row" height={1}>
              <box width={labelWidth}>
                <text fg={theme.muted}>VM ID</text>
              </box>
              <text fg={theme.muted}>{sshInfo.vm_id}</text>
            </box>
          )}

          {copyFeedback && (
            <box height={1}>
              <text fg={copyFeedback.startsWith("Copy") && copyFeedback !== "Copied!" && copyFeedback !== "Copied host!" ? theme.warning : theme.success}>
                {copyFeedback}
              </text>
            </box>
          )}
        </box>
      ) : (
        <box paddingX={2}>
          <text fg={theme.muted}>
            SSH connection unavailable. Workspace may still be provisioning.
          </text>
        </box>
      )}
    </box>
  );
}

function formatError(error: Error): string {
  const message = error.message || "Unknown error";
  if (message.includes("401")) return "Session expired. Run `codeplane auth login` to re-authenticate.";
  if (message.includes("404")) return "Workspace not found. Press `q` to go back.";
  if (message.includes("429")) {
    const retryMatch = message.match(/retry.*?(\d+)/i);
    return `Rate limited. Retry in ${retryMatch ? retryMatch[1] : "30"}s.`;
  }
  if (message.includes("409") || message.includes("423")) return "Workspace is being modified. Try again shortly.";
  if (message.includes("5") && /50[0-4]/.test(message)) return "Server error. Press `r` to retry.";
  return `Failed to load SSH info. Press \`r\` to retry.`;
}
```

## Step 4: Update Barrel Exports

**File:** `apps/tui/src/components/index.ts`
Append the following:
```typescript
export { WorkspaceSSHPanel } from "./WorkspaceSSHPanel.js";
export type { WorkspaceSSHPanelProps, WorkspaceSSHConnectionInfo } from "./WorkspaceSSHPanel.js";
export { SSHInfoPlaceholder } from "./SSHInfoPlaceholder.js";
export type { SSHInfoPlaceholderProps } from "./SSHInfoPlaceholder.js";
```

**File:** `apps/tui/src/hooks/index.ts`
Append the following:
```typescript
export { useTokenCountdown, formatTokenTTL, getTokenColorKey } from "./useTokenCountdown.js";
export type { TokenCountdownState } from "./useTokenCountdown.js";
```

## Step 5: Implement E2E Tests

**File:** `e2e/tui/workspaces.test.ts`

Implement the full test suite matching the detailed spec in the engineering document. 

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  createMockAPIEnv,
} from "./helpers.ts";

describe("TUI_WORKSPACE_SSH_INFO", () => {
  let tui: Awaited<ReturnType<typeof launchTUI>> | null = null;

  afterEach(async () => {
    if (tui) {
      await tui.terminate();
      tui = null;
    }
  });

  // ... (Insert all 50 test cases exactly as outlined in Section 6 of the Eng Spec)
  // e.g. "renders SSH connection info for running workspace at 120x40"
  // e.g. "c copies SSH command to clipboard", "responsive 80x24 shows only command and token", etc.
});
```
*(Ensure all 50 E2E tests are included and run using `bun:test` per the provided test suite structure. These tests should be un-skipped even if dependent implementations fail).* 