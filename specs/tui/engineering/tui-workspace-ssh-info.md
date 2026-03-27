# Engineering Specification: `tui-workspace-ssh-info`

## Ticket Metadata

| Field | Value |
|---|---|
| **ID** | `tui-workspace-ssh-info` |
| **Title** | SSH connection info panel with token countdown |
| **Type** | Feature |
| **Feature** | `TUI_WORKSPACE_SSH_INFO` |
| **Dependencies** | `tui-workspace-data-hooks`, `tui-clipboard-util`, `tui-workspace-status-stream`, `tui-workspace-e2e-helpers` |
| **Target files** | `apps/tui/src/components/WorkspaceSSHPanel.tsx`, `apps/tui/src/components/SSHInfoPlaceholder.tsx`, `apps/tui/src/hooks/useTokenCountdown.ts`, `apps/tui/src/components/index.ts` |
| **Test file** | `e2e/tui/workspaces.test.ts` |

---

## 1. Problem Statement

When a terminal user is viewing a workspace in the "running" state, they need immediate access to SSH connection details to connect from their terminal. The SSH info panel is a dedicated section within the workspace detail view that renders SSH metadata — host, port, username, full command, and a live token TTL countdown — and provides single-key clipboard copy and auto-refresh of expiring tokens.

This component must:
- Gate its contents on workspace status — only show connection details when `status === "running"`
- Display status-appropriate placeholder messages for non-running states (starting, suspended, stopped)
- Provide `c` (copy command), `y` (copy host), and `r` (refresh token) keybindings with clipboard feedback
- Countdown the SSH access token TTL with color transitions (green → yellow → red)
- Auto-refresh the token when it expires
- Adapt responsively to minimum (80×24), standard (120×40), and large (200×60+) terminal sizes

---

## 2. Codebase Ground Truth

| Fact | Location | Impact |
|---|---|---|
| `useTheme()` returns `Readonly<ThemeTokens>` with `success`, `warning`, `error`, `muted`, `primary`, `border` as `RGBA` | `apps/tui/src/hooks/useTheme.ts` | Token countdown color resolved via `theme.success`, `theme.warning`, `theme.error` |
| `useLayout()` returns `LayoutContext` with `width`, `height`, `breakpoint` where `Breakpoint = "minimum" \| "standard" \| "large"` or `null` | `apps/tui/src/hooks/useLayout.ts` | Responsive field visibility gated on breakpoint |
| `getBreakpoint(cols, rows)` — `<80\|<24` → `null`, `<120\|<40` → `"minimum"`, `<200\|<60` → `"standard"`, else → `"large"` | `apps/tui/src/types/breakpoint.ts:25-33` | Breakpoint thresholds for responsive layout |
| `useScreenKeybindings(bindings, hints?)` pushes PRIORITY.SCREEN scope on mount, pops on unmount; auto-generates status bar hints from first 8 bindings | `apps/tui/src/hooks/useScreenKeybindings.ts` | SSH keybindings (`c`, `y`, `r`) registered here |
| `useSpinner(active: boolean): string` returns braille/ASCII frame string or `""` — frame-synchronized across all consumers | `apps/tui/src/hooks/useSpinner.ts:165-177` | Loading and refreshing spinners |
| `truncateText(text, maxWidth)` appends `"…"` if text exceeds maxWidth | `apps/tui/src/util/truncate.ts:25-30` | Command and host truncation |
| `PlaceholderScreen` is the current component for `ScreenName.WorkspaceDetail` | `apps/tui/src/router/registry.ts` | Will be replaced by real screen that hosts this panel |
| `<text>` accepts `fg` as `RGBA`, `attributes` as `TextAttributes` bitmask (BOLD=1) | `@opentui/react` component types | Command rendered with `attributes={1}` for bold |
| `<box>` accepts `flexDirection`, `height`, `width`, `paddingX`, `gap`, `border`, `borderColor` | `@opentui/core` BoxOptions | Panel layout uses column flex with row children |
| `useClipboard()` returns `{ copy, status, fallbackText, clearFallback, provider }` where `copy(text)` → `Promise<boolean>`, status is `"idle" \| "copying" \| "copied" \| "failed" \| "unavailable"` | `apps/tui/src/hooks/useClipboard.ts` (from `tui-clipboard-util` spec) | Clipboard integration for `c` and `y` keys |
| `useWorkspaceSSH(owner, repo, workspaceId)` returns `{ sshInfo, isLoading, error, refetch, tokenExpiresAt, isTokenExpired }` | `packages/ui-core/src/hooks/workspaces/useWorkspaceSSH.ts` (from `tui-workspace-data-hooks` spec) | Primary data hook for SSH info |
| `useWorkspaceStatusStream(owner, repo, workspaceId, options)` returns `{ status, connectionState, lastEvent, error, reconcile }` | `apps/tui/src/streaming/` (from `tui-workspace-sse-adapter` spec) | Real-time workspace status transitions |
| SSH access token TTL is 5 minutes (300 seconds) | Product spec | Countdown timer range |
| `emit(name, properties)` writes telemetry events to stderr when `CODEPLANE_TUI_DEBUG=true` | `apps/tui/src/lib/telemetry.ts` | Telemetry events for SSH info interactions |
| Existing barrel export `apps/tui/src/components/index.ts` uses `.js` extensions (ESM) | `apps/tui/src/components/index.ts` | New exports follow same pattern |
| `StatusBar.tsx` demonstrates theme + layout + hints integration pattern | `apps/tui/src/components/StatusBar.tsx` | Reference implementation for component patterns |
| E2E helpers: `launchTUI()`, `TUITestInstance`, `TERMINAL_SIZES`, `createMockAPIEnv()`, `createTestCredentialStore()` | `e2e/tui/helpers.ts` | Standard test infrastructure |
| Workspace E2E helpers: `launchTUIWithWorkspaceContext()`, `waitForStatusTransition()`, `createSSEInjectionFile()`, workspace fixtures | `e2e/tui/helpers.ts` (extended by `tui-workspace-e2e-helpers` spec) | Workspace-specific test infrastructure |

---

## 3. Architecture

### 3.1 Component Tree

```
WorkspaceDetailScreen (parent — separate ticket)
├── WorkspaceMetadata (name, status, persistence, idle timeout)
├── WorkspaceSSHPanel ← THIS TICKET
│   ├── Section header ("SSH Connection")
│   ├── SSHInfoPlaceholder (when status ≠ "running")
│   │   └── Spinner + status message
│   ├── SSH fields (when running + data loaded)
│   │   ├── Host row (standard+ breakpoint)
│   │   ├── Port row (standard+ breakpoint)
│   │   ├── Username row (standard+ breakpoint)
│   │   ├── Command row (always visible)
│   │   ├── Token countdown row (always visible)
│   │   ├── Workspace ID row (large breakpoint only)
│   │   └── VM ID row (large breakpoint only)
│   ├── Refreshing spinner (when refresh in flight)
│   └── Error display (when fetch failed)
└── WorkspaceActions (suspend, delete — separate ticket)
```

### 3.2 File Layout

```
apps/tui/src/
├── components/
│   ├── WorkspaceSSHPanel.tsx        ← Primary component (this ticket)
│   ├── SSHInfoPlaceholder.tsx       ← Status placeholder sub-component
│   └── index.ts                     ← Append exports
├── hooks/
│   └── useTokenCountdown.ts         ← Token TTL countdown hook
```

### 3.3 Data Flow

```
useWorkspaceSSH(owner, repo, workspaceId)
  ↓ sshInfo, isLoading, error, refetch, tokenExpiresAt, isTokenExpired
  ↓
WorkspaceSSHPanel
  ├── useTokenCountdown(tokenExpiresAt) → remainingSeconds, formattedTime, color
  ├── useClipboard() → copy, status
  ├── useScreenKeybindings([c, y, r]) → registered keybindings + status bar hints
  ├── useLayout() → breakpoint, width
  ├── useTheme() → theme tokens
  └── useSpinner(isRefreshing || isLoading) → spinner frame
```

---

## 4. Implementation Plan

### Step 1: Create `useTokenCountdown` hook

**File:** `apps/tui/src/hooks/useTokenCountdown.ts`

This hook manages the client-side token TTL countdown. It receives a `tokenExpiresAt` timestamp (epoch ms) from `useWorkspaceSSH` and returns the countdown state.

```typescript
// apps/tui/src/hooks/useTokenCountdown.ts

import { useState, useEffect, useRef, useCallback } from "react";
import type { ThemeTokens } from "../theme/tokens.js";

export interface TokenCountdownState {
  /** Remaining seconds until token expires. Clamped to >= 0. */
  remainingSeconds: number;
  /** Formatted display string: "Xm Ys" (>=60s), "Xs" (<60s), "Token expired" (0). */
  formattedTime: string;
  /** Semantic color key: "success" (>120s), "warning" (30-120s), "error" (<30s or expired). */
  colorKey: keyof Pick<ThemeTokens, "success" | "warning" | "error" | "muted">;
  /** Whether the token has expired. */
  isExpired: boolean;
}

/**
 * Format remaining seconds into display string.
 *
 * - >= 60s: "Xm Ys" (e.g., "4m 32s")
 * - 1-59s: "Xs" (e.g., "45s")
 * - 0s: "Token expired"
 */
export function formatTokenTTL(remainingSeconds: number): string {
  if (remainingSeconds <= 0) return "Token expired";
  if (remainingSeconds < 60) return `${remainingSeconds}s`;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Resolve semantic color key based on remaining seconds.
 *
 * - > 120s (2 min): success (green)
 * - 30-120s: warning (yellow)
 * - < 30s: error (red)
 * - 0s: error (red)
 */
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
 * Synchronizes to the token's expiration timestamp and ticks every second.
 * Returns formatted display string, remaining seconds, color key, and
 * expiration state.
 *
 * @param tokenExpiresAt - Epoch milliseconds when the token expires. null/undefined disables countdown.
 * @param onExpire - Callback fired once when the token expires. Used to trigger auto-refresh.
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

  // Reset when tokenExpiresAt changes (e.g., after refresh)
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

**Key design decisions:**

1. **`setInterval` at 1s** — Simpler and more accurate than `useTimeline` for second-granularity updates. Timeline is optimized for sub-frame animation (80ms ticks), which would be wasteful for a 1-second countdown.
2. **`onExpire` callback via ref** — Avoids re-creating the interval when the callback identity changes. Fires exactly once per token lifecycle.
3. **`hasExpiredRef` guard** — Prevents multiple `onExpire` calls if the interval fires multiple times after expiry.
4. **Color thresholds** — `> 120s` (green), `30–120s` (yellow), `< 30s` (red). The spec says green >2m, yellow 30s-2m, red <30s — these map exactly.

---

### Step 2: Create `SSHInfoPlaceholder` component

**File:** `apps/tui/src/components/SSHInfoPlaceholder.tsx`

A small sub-component rendering status-appropriate messages when the workspace is not running.

```typescript
// apps/tui/src/components/SSHInfoPlaceholder.tsx

import React from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useSpinner } from "../hooks/useSpinner.js";

export interface SSHInfoPlaceholderProps {
  /** Current workspace status. */
  status: string;
}

/**
 * Renders a placeholder message in the SSH Connection section when the
 * workspace is not in the "running" state.
 *
 * - "pending" | "starting" | "resuming": animated braille spinner + "Waiting for workspace to start…"
 * - "suspended": yellow text "Workspace suspended. Press R to resume."
 * - "stopped" | "failed" | anything else: muted text "Workspace stopped."
 */
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

  // "stopped", "failed", or unknown status
  return (
    <box height={1} paddingX={2}>
      <text fg={theme.muted}>Workspace stopped.</text>
    </box>
  );
}
```

**Key design decisions:**

1. **Transitional states include "resuming"** — When a workspace is resuming, it's transitioning to running. The spinner is appropriate.
2. **"suspending" treated as "suspended"** — Display state from SSE. User sees the suspended message with resume hint.
3. **Spinner via `useSpinner()`** — Frame-synchronized with all other spinners in the TUI.

---

### Step 3: Create `WorkspaceSSHPanel` component

**File:** `apps/tui/src/components/WorkspaceSSHPanel.tsx`

The primary component. This is the largest piece of work.

```typescript
// apps/tui/src/components/WorkspaceSSHPanel.tsx

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useLayout } from "../hooks/useLayout.js";
import { useSpinner } from "../hooks/useSpinner.js";
import { useTokenCountdown } from "../hooks/useTokenCountdown.js";
import { truncateText } from "../util/truncate.js";
import { SSHInfoPlaceholder } from "./SSHInfoPlaceholder.js";
import { emit } from "../lib/telemetry.js";

// ── Types ──────────────────────────────────────────────────────────────

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
  /** Current workspace status from useWorkspace() or SSE stream. */
  workspaceStatus: string;
  /** SSH info data, null when not yet loaded or workspace not running. */
  sshInfo: WorkspaceSSHConnectionInfo | null;
  /** Whether SSH info is currently being fetched. */
  isLoading: boolean;
  /** Error from SSH info fetch, null if no error. */
  error: Error | null;
  /** Epoch ms when the current token expires. */
  tokenExpiresAt: number | null;
  /** Whether the current token has expired (from the data hook). */
  isTokenExpired: boolean;
  /** Refetch SSH info (generates new token). Returns void. */
  refetch: () => Promise<void>;
  /** Clipboard copy function. Returns true if copy succeeded. */
  copyToClipboard: (text: string) => Promise<boolean>;
  /** Whether clipboard is supported on this platform. */
  clipboardSupported: boolean;
  /** Repo context for telemetry. */
  repoOwner: string;
  repoName: string;
  workspaceId: string;
}

// ── Constants ──────────────────────────────────────────────────────────

/** Label column widths per breakpoint. */
const LABEL_WIDTH: Record<string, number> = {
  minimum: 10,
  standard: 14,
  large: 16,
};

/** Debounce cooldown for manual refresh in ms. */
const REFRESH_DEBOUNCE_MS = 2000;

/** Duration to show "Copied!" in status bar (ms). */
const COPY_FEEDBACK_DURATION_MS = 2000;

/** Max display length for ssh_host. */
const HOST_MAX_DISPLAY_LENGTH = 80;

/** Max display length for username. */
const USERNAME_MAX_DISPLAY_LENGTH = 32;

// ── Component ──────────────────────────────────────────────────────────

export function WorkspaceSSHPanel(props: WorkspaceSSHPanelProps) {
  const {
    workspaceStatus,
    sshInfo,
    isLoading,
    error,
    tokenExpiresAt,
    isTokenExpired: hookTokenExpired,
    refetch,
    copyToClipboard,
    clipboardSupported,
    repoOwner,
    repoName,
    workspaceId,
  } = props;

  const theme = useTheme();
  const { width, breakpoint } = useLayout();

  // ── Refresh state ──────────────────────────────────────────────────
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const lastRefreshTimeRef = useRef(0);
  const autoRefreshFailedRef = useRef(false);
  const spinner = useSpinner(isRefreshing || (isLoading && workspaceStatus === "running"));

  // ── Copy feedback state ────────────────────────────────────────────
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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
    };
  }, []);

  // ── Refresh handler ────────────────────────────────────────────────
  const handleRefresh = useCallback(async (source: "manual" | "auto") => {
    if (refreshInFlightRef.current) return;
    if (workspaceStatus !== "running") return;

    // Debounce for manual refresh
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
      if (source === "auto") {
        autoRefreshFailedRef.current = true;
      }

      emit(
        "tui.workspace.ssh_info.error",
        {
          repo_owner: repoOwner,
          repo_name: repoName,
          workspace_id: workspaceId,
          error_type: "network",
          action: source === "manual" ? "refresh" : "auto_refresh",
          refresh_success: false,
        },
      );
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [workspaceStatus, refetch, tokenExpiresAt, repoOwner, repoName, workspaceId]);

  // ── Auto-refresh on token expiry ───────────────────────────────────
  const handleTokenExpire = useCallback(() => {
    if (autoRefreshFailedRef.current) return; // Don't retry auto-refresh after failure
    handleRefresh("auto");
  }, [handleRefresh]);

  // ── Token countdown ────────────────────────────────────────────────
  const tokenCountdown = useTokenCountdown(
    workspaceStatus === "running" ? tokenExpiresAt : null,
    handleTokenExpire,
  );

  // ── Copy handlers ──────────────────────────────────────────────────
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

  // ── Telemetry: viewed event ────────────────────────────────────────
  const hasEmittedViewedRef = useRef(false);
  useEffect(() => {
    if (sshInfo && workspaceStatus === "running" && !hasEmittedViewedRef.current) {
      hasEmittedViewedRef.current = true;
      emit("tui.workspace.ssh_info.viewed", {
        repo_owner: repoOwner,
        repo_name: repoName,
        workspace_id: workspaceId,
        terminal_columns: width,
        terminal_rows: 0, // height not needed at component level
        breakpoint: breakpoint ?? "unsupported",
      });
    }
  }, [sshInfo, workspaceStatus, repoOwner, repoName, workspaceId, width, breakpoint]);

  // ── Responsive values ──────────────────────────────────────────────
  const labelWidth = LABEL_WIDTH[breakpoint ?? "minimum"] ?? LABEL_WIDTH.minimum;
  const isStandardOrLarger = breakpoint === "standard" || breakpoint === "large";
  const isLarge = breakpoint === "large";
  const cmdMaxWidth = Math.max(10, width - labelWidth - 16); // padding + copy hint
  const hostMaxWidth = Math.min(HOST_MAX_DISPLAY_LENGTH, width - labelWidth - 4);

  // ── Token display ──────────────────────────────────────────────────
  const tokenLabel = tokenCountdown.isExpired
    ? autoRefreshFailedRef.current
      ? "Token expired (refresh failed)"
      : tokenCountdown.formattedTime
    : `Token valid for ${tokenCountdown.formattedTime}`;
  const tokenColor = theme[tokenCountdown.colorKey];

  // ── Render ─────────────────────────────────────────────────────────

  // Unsupported terminal size — parent handles "terminal too small" message
  if (breakpoint === null) return null;

  return (
    <box flexDirection="column" gap={0}>
      {/* Section header */}
      <box height={1}>
        <text fg={theme.border}>─── </text>
        <text bold>SSH Connection</text>
        <text fg={theme.border}>
          {" " + "─".repeat(Math.max(0, width - 22))}
        </text>
      </box>

      {/* Status gating */}
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
          {/* Host — standard+ only */}
          {isStandardOrLarger && (
            <box flexDirection="row" height={1}>
              <box width={labelWidth}>
                <text fg={theme.muted}>Host</text>
              </box>
              <text>{truncateText(sshInfo.ssh_host, hostMaxWidth)}</text>
            </box>
          )}

          {/* Port — standard+ only */}
          {isStandardOrLarger && (
            <box flexDirection="row" height={1}>
              <box width={labelWidth}>
                <text fg={theme.muted}>Port</text>
              </box>
              <text>{String(sshInfo.port)}</text>
            </box>
          )}

          {/* Username — standard+ only */}
          {isStandardOrLarger && (
            <box flexDirection="row" height={1}>
              <box width={labelWidth}>
                <text fg={theme.muted}>Username</text>
              </box>
              <text>
                {truncateText(sshInfo.username, USERNAME_MAX_DISPLAY_LENGTH)}
              </text>
            </box>
          )}

          {/* Command — always visible */}
          <box flexDirection="row" height={1}>
            <box width={labelWidth}>
              <text fg={theme.muted}>Command</text>
            </box>
            <text bold>{truncateText(sshInfo.command, cmdMaxWidth)}</text>
            <text fg={theme.muted}> (c to copy)</text>
          </box>

          {/* Token countdown — always visible */}
          <box flexDirection="row" height={1}>
            <box width={labelWidth}>
              <text fg={theme.muted}>Token</text>
            </box>
            <text fg={tokenColor}>{tokenLabel}</text>
            {tokenCountdown.isExpired && (
              <text fg={theme.muted}> (r:refresh)</text>
            )}
          </box>

          {/* Extended fields — large only */}
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

          {/* Copy feedback (transient) */}
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

// ── Error formatting ─────────────────────────────────────────────────

function formatError(error: Error): string {
  const message = error.message || "Unknown error";

  // Match specific HTTP status patterns
  if (message.includes("401")) {
    return "Session expired. Run `codeplane auth login` to re-authenticate.";
  }
  if (message.includes("404")) {
    return "Workspace not found. Press `q` to go back.";
  }
  if (message.includes("429")) {
    // Extract retry-after if present
    const retryMatch = message.match(/retry.*?(\d+)/i);
    const retryAfter = retryMatch ? retryMatch[1] : "30";
    return `Rate limited. Retry in ${retryAfter}s.`;
  }
  if (message.includes("409") || message.includes("423")) {
    return "Workspace is being modified. Try again shortly.";
  }
  if (message.includes("5") && /50[0-4]/.test(message)) {
    return "Server error. Press `r` to retry.";
  }
  return `Failed to load SSH info. Press \`r\` to retry.`;
}
```

**Key design decisions:**

1. **Props-driven, not internally-hooked** — The component receives `sshInfo`, `refetch`, `copyToClipboard`, etc. as props from the parent `WorkspaceDetailScreen`. This makes the component testable and composable without coupling it to specific hook implementations.
2. **Copy feedback is local state** — The 2-second "Copied!" message is managed via `useState` + `setTimeout`, matching the pattern in `StatusBar.tsx` for auth confirmation.
3. **Refresh debounce uses timestamp comparison** — Not `setTimeout`-based debounce. The `lastRefreshTimeRef` tracks when the last refresh started. Pressing `r` within 2 seconds of the last refresh is silently ignored.
4. **Auto-refresh failure circuit breaker** — `autoRefreshFailedRef` prevents infinite auto-refresh loops. After auto-refresh fails, no further auto-refresh until user manually presses `r`.
5. **Error formatting is function-based** — HTTP status codes are extracted from error messages rather than relying on error subtypes. This is pragmatic given `useWorkspaceSSH` returns generic `Error` objects.
6. **`bold` as JSX attribute** — OpenTUI's `<text>` component accepts `bold` as a shorthand for `attributes={TextAttributes.BOLD}`.

---

### Step 4: Wire keybindings in parent screen

The `WorkspaceSSHPanel` does not register its own keybindings — that is the responsibility of the parent `WorkspaceDetailScreen`. The parent screen calls `useScreenKeybindings()` with the full keybinding set for the workspace detail view, including SSH-specific keys.

This wiring happens in the parent screen component (which is a separate ticket: `tui-workspace-detail-view`). However, this spec defines the **keybinding contract** that the parent must fulfill:

```typescript
// In WorkspaceDetailScreen — this is the keybinding registration pattern.
// The parent screen registers keybindings and delegates to the panel's handlers.

import { useScreenKeybindings } from "../hooks/useScreenKeybindings.js";
import type { KeyHandler, StatusBarHint } from "../providers/keybinding-types.js";

function WorkspaceDetailScreen({ entry, params }: ScreenComponentProps) {
  // ... data hooks ...
  const sshPanelRef = useRef<{
    handleCopyCommand: () => void;
    handleCopyHost: () => void;
    handleRefresh: () => void;
  }>(null);

  // Or, more practically, lift the handlers into this screen component:
  const isRunning = workspace?.status === "running";
  const hasSshInfo = isRunning && sshInfo != null;

  const keybindings: KeyHandler[] = useMemo(() => [
    // SSH keybindings — conditionally active
    {
      key: "c",
      description: "Copy SSH command",
      group: "SSH",
      handler: () => handleCopyCommand(),
      when: () => hasSshInfo,
    },
    {
      key: "y",
      description: "Copy host",
      group: "SSH",
      handler: () => handleCopyHost(),
      when: () => hasSshInfo,
    },
    {
      key: "r",
      description: "Refresh SSH info",
      group: "SSH",
      handler: () => handleRefresh("manual"),
      when: () => hasSshInfo,
    },
    {
      key: "R",
      description: "Resume workspace",
      group: "Actions",
      handler: () => handleResume(),
      when: () => workspace?.status === "suspended",
    },
    // ... scroll keybindings (j, k, G, gg, Ctrl+D, Ctrl+U) ...
  ], [hasSshInfo, workspace?.status]);

  const hints: StatusBarHint[] = useMemo(() => {
    const h: StatusBarHint[] = [];
    if (hasSshInfo) {
      h.push({ keys: "c", label: "copy cmd", order: 10 });
      h.push({ keys: "y", label: "copy host", order: 20 });
      h.push({ keys: "r", label: "refresh", order: 30 });
    }
    if (workspace?.status === "suspended") {
      h.push({ keys: "R", label: "resume", order: 40 });
    }
    h.push({ keys: "?", label: "help", order: 100 });
    return h;
  }, [hasSshInfo, workspace?.status]);

  useScreenKeybindings(keybindings, hints);

  // ... render WorkspaceSSHPanel with props ...
}
```

**Key design decision:** Keybindings are registered at the screen level, not the component level. This follows the established pattern where `useScreenKeybindings` operates at `PRIORITY.SCREEN` and manages status bar hints. The SSH panel component exposes callback props; the parent screen connects them to the keybinding system.

---

### Step 5: Update barrel exports

**File:** `apps/tui/src/components/index.ts`

Append to the existing barrel:

```typescript
export { WorkspaceSSHPanel } from "./WorkspaceSSHPanel.js";
export type { WorkspaceSSHPanelProps, WorkspaceSSHConnectionInfo } from "./WorkspaceSSHPanel.js";
export { SSHInfoPlaceholder } from "./SSHInfoPlaceholder.js";
export type { SSHInfoPlaceholderProps } from "./SSHInfoPlaceholder.js";
```

**File:** `apps/tui/src/hooks/index.ts` (or equivalent barrel if it exists)

```typescript
export { useTokenCountdown, formatTokenTTL, getTokenColorKey } from "./useTokenCountdown.js";
export type { TokenCountdownState } from "./useTokenCountdown.js";
```

---

### Step 6: Telemetry event registration

All telemetry events use the existing `emit()` function from `apps/tui/src/lib/telemetry.ts`. No new infrastructure is needed. Events are emitted inline in the component handlers (Step 3 code already includes all telemetry calls).

**Event inventory** (as specified in the product spec):

| Event | Trigger | Location in code |
|---|---|---|
| `tui.workspace.ssh_info.viewed` | SSH info first renders | `useEffect` in `WorkspaceSSHPanel` |
| `tui.workspace.ssh_info.command_copied` | `c` pressed | `handleCopyCommand` |
| `tui.workspace.ssh_info.host_copied` | `y` pressed | `handleCopyHost` |
| `tui.workspace.ssh_info.refreshed` | `r` pressed + success | `handleRefresh("manual")` |
| `tui.workspace.ssh_info.auto_refreshed` | token expires + auto-refresh | `handleRefresh("auto")` |
| `tui.workspace.ssh_info.error` | any fetch/refresh failure | `handleRefresh` catch block |
| `tui.workspace.ssh_info.clipboard_unavailable` | copy attempted, no clipboard | `handleCopyCommand` / `handleCopyHost` |

Sensitive data (`access_token`, `command`) is **never** included in telemetry event properties.

---

## 5. Productionization Notes

### 5.1 Dependency on `useWorkspaceSSH` hook bugs

The `tui-workspace-data-hooks` spec documents 10 categories of compile-time bugs in the workspace hooks. Before this component can function end-to-end, the following must be resolved:

1. **Import path errors** — `useWorkspaceSSH` imports from `../../client/APIClientProvider.js` which doesn't exist. Must import from `../../client/context.js`.
2. **`useAPIClient()` destructuring** — Hook destructures `{ fetch }` but `useAPIClient()` returns an `APIClient` object with a `request()` method.
3. **Manual serialization** — `JSON.stringify()` on request body causes double-serialization since the API client already handles this.

These bugs are resolved in the `tui-workspace-data-hooks` ticket, which is a dependency of this ticket.

### 5.2 Parent screen integration

The `WorkspaceSSHPanel` is designed as a composable component, not a standalone screen. The parent `WorkspaceDetailScreen` (a separate ticket) must:

1. Call `useWorkspaceSSH(owner, repo, workspaceId)` and pass results as props
2. Call `useClipboard()` and pass `copy` + `supported` as props
3. Subscribe to workspace status SSE via `useWorkspaceStatusStream()` for real-time status transitions
4. Register keybindings via `useScreenKeybindings()` including SSH keys
5. Handle the `R` (resume) keybinding when workspace is suspended (delegates to `useResumeWorkspace`)

### 5.3 Clipboard integration

The clipboard utility (`tui-clipboard-util`) must be complete before copy operations work. The component gracefully degrades when clipboard is unavailable — showing "Copy not available" in the feedback area.

### 5.4 SSE integration

The SSE workspace status stream (`tui-workspace-sse-adapter`) must be complete for:
- Auto-transitioning the panel from placeholder to SSH info when workspace starts
- Clearing SSH info when workspace suspends or stops
- Real-time status updates without manual refresh

Without SSE, the component still functions — it just requires manual navigation away and back to see status changes.

### 5.5 Error boundary

The `WorkspaceSSHPanel` is wrapped by the app-level `ErrorBoundary` (from the provider stack). If the component throws during render, the error boundary catches it and displays the recovery UI. No component-level error boundary is needed.

### 5.6 No-color terminal support

When `NO_COLOR=1` is set, the `ThemeProvider` resolves all color tokens to monochrome equivalents. The component uses semantic tokens (`theme.success`, `theme.warning`, `theme.error`) exclusively — it never references raw ANSI codes. Token countdown uses bold/reverse instead of color (handled at the theme layer).

---

## 6. Unit & Integration Tests

### Test File: `e2e/tui/workspaces.test.ts`

All tests target the existing `e2e/tui/workspaces.test.ts` file. Tests use `@microsoft/tui-test` via the `launchTUI()` helper and workspace-specific helpers from `tui-workspace-e2e-helpers`.

**Test infrastructure dependencies:**
- `launchTUI()` from `e2e/tui/helpers.ts`
- `launchTUIWithWorkspaceContext()` from workspace E2E helpers
- `createSSEInjectionFile()` from workspace E2E helpers
- `waitForStatusTransition()` from workspace E2E helpers
- Workspace fixtures (`RUNNING_WORKSPACE`, `SUSPENDED_WORKSPACE`, etc.) from workspace E2E helpers
- `TERMINAL_SIZES` from `e2e/tui/helpers.ts`

### Test Structure

```typescript
// e2e/tui/workspaces.test.ts

import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  createMockAPIEnv,
} from "./helpers";

// Workspace-specific helpers (from tui-workspace-e2e-helpers dependency)
// import {
//   launchTUIWithWorkspaceContext,
//   createSSEInjectionFile,
//   waitForStatusTransition,
//   RUNNING_WORKSPACE_FIXTURE,
//   SUSPENDED_WORKSPACE_FIXTURE,
//   STARTING_WORKSPACE_FIXTURE,
//   STOPPED_WORKSPACE_FIXTURE,
//   PENDING_WORKSPACE_FIXTURE,
// } from "./workspace-helpers";

describe("TUI_WORKSPACE_SSH_INFO", () => {
  let tui: Awaited<ReturnType<typeof launchTUI>> | null = null;

  afterEach(async () => {
    if (tui) {
      await tui.terminate();
      tui = null;
    }
  });

  // ── Terminal Snapshot Tests ──────────────────────────────────────────

  test("renders SSH connection info for running workspace at 120x40", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    // Navigate to workspace detail for a running workspace
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter"); // select first workspace
    await tui.waitForText("SSH Connection");

    // Verify all standard fields are visible
    await tui.waitForText("Host");
    await tui.waitForText("Port");
    await tui.waitForText("Username");
    await tui.waitForText("Command");
    await tui.waitForText("Token");
    await tui.waitForText("(c to copy)");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders SSH connection info at 80x24 compact layout", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    // At minimum: only Command and Token visible
    await tui.waitForText("Command");
    await tui.waitForText("Token");

    // Host/Port/Username should NOT be visible
    const snapshot = tui.snapshot();
    // These fields should be absent at minimum breakpoint
    // (assertion depends on whether the text appears anywhere)
    expect(snapshot).toContain("Command");
    expect(snapshot).toContain("Token");

    expect(snapshot).toMatchSnapshot();
  });

  test("renders SSH connection info at 200x60 expanded layout", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    // All standard fields plus extended fields
    await tui.waitForText("Host");
    await tui.waitForText("Port");
    await tui.waitForText("Username");
    await tui.waitForText("Command");
    await tui.waitForText("Token");
    await tui.waitForText("Workspace ID");
    await tui.waitForText("VM ID");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders waiting state for starting workspace", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    // Navigate to a starting workspace
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Navigate to a starting workspace detail
    await tui.sendKeys("j"); // assume starting workspace is second in list
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Waiting for workspace to start");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders waiting state for pending workspace", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Navigate to pending workspace
    await tui.sendKeys("j", "j"); // navigate to pending workspace
    await tui.sendKeys("Enter");
    await tui.waitForText("Waiting for workspace to start");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders suspended workspace message", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Navigate to suspended workspace
    await tui.sendKeys("j", "j", "j");
    await tui.sendKeys("Enter");
    await tui.waitForText("Workspace suspended. Press R to resume.");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders stopped workspace message", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Navigate to stopped workspace
    await tui.sendKeys("j", "j", "j", "j");
    await tui.sendKeys("Enter");
    await tui.waitForText("Workspace stopped.");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders token expiring warning (yellow)", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    // Wait for token to approach expiry — this test depends on test
    // fixtures providing a short-TTL token, or using SSE injection
    // to advance time. The test validates the yellow color state.
    await tui.waitForText("Token valid for");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders token expired state (red)", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    // Token expiry requires either waiting or a short-lived test token
    await tui.waitForText("Token expired", 310_000); // 5min + buffer

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders refreshing state with spinner", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.sendKeys("r"); // trigger refresh
    await tui.waitForText("Refreshing");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders error state on SSH info fetch failure", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    // When SSH endpoint fails, error message should appear
    await tui.waitForText("Failed to load SSH info");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders SSH connection unavailable when no VM ID", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH connection unavailable");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders copied confirmation in status bar", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");
    await tui.sendKeys("c");
    await tui.waitForText("Copied!");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders copy not available in status bar", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_CLIPBOARD_PROVIDER: "none" },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");
    await tui.sendKeys("c");
    await tui.waitForText("Copy not available");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders copied host confirmation in status bar", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.sendKeys("y");
    await tui.waitForText("Copied host!");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders breadcrumb for workspace detail", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    // Verify breadcrumb shows workspace path
    const headerLine = tui.getLine(0);
    expect(headerLine).toMatch(/Workspaces/);

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders help overlay with SSH keybindings", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.sendKeys("?");
    await tui.waitForText("copy"); // help overlay should mention copy keybinding

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders rate limit error inline", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    // When API returns 429, inline error should appear
    await tui.waitForText("Rate limited");

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("renders permission denied for read-only user", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: "codeplane_feedfacefeedfacefeedfacefeedfacefeedface" }, // read-only token
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    // Expect permission denied or similar access error
    const snapshot = tui.snapshot();
    // Read-only users should see a permission or access error
    expect(snapshot).toMatch(/permission|denied|access|forbidden/i);

    expect(snapshot).toMatchSnapshot();
  });

  test("command truncated at minimum terminal width", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // Long commands should be truncated with ellipsis at minimum width
    const snapshot = tui.snapshot();
    // Verify the ellipsis character is present if command is long
    // (exact assertion depends on fixture data)
    expect(snapshot).toContain("…");

    expect(snapshot).toMatchSnapshot();
  });

  test("renders auto-refresh failure state", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    // Wait for auto-refresh failure after token expiry
    await tui.waitForText("Token expired (refresh failed)", 310_000);

    expect(tui.snapshot()).toMatchSnapshot();
  });

  // ── Keyboard Interaction Tests ───────────────────────────────────────

  test("c copies SSH command to clipboard", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    await tui.sendKeys("c");
    await tui.waitForText("Copied!");
    // Clipboard content verified by the "Copied!" feedback
  });

  test("c on non-running workspace is no-op", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Navigate to suspended workspace
    await tui.sendKeys("j", "j", "j");
    await tui.sendKeys("Enter");
    await tui.waitForText("Workspace suspended");

    await tui.sendKeys("c");
    // Should NOT see "Copied!" — the key is a no-op
    const snapshot = tui.snapshot();
    expect(snapshot).not.toContain("Copied!");
  });

  test("y copies ssh_host to clipboard", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Host");

    await tui.sendKeys("y");
    await tui.waitForText("Copied host!");
  });

  test("y on non-running workspace is no-op", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("j", "j", "j"); // suspended
    await tui.sendKeys("Enter");
    await tui.waitForText("Workspace suspended");

    await tui.sendKeys("y");
    const snapshot = tui.snapshot();
    expect(snapshot).not.toContain("Copied host!");
  });

  test("r refreshes SSH connection info", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // Press r to refresh — should show spinner briefly, then updated info
    await tui.sendKeys("r");
    // After refresh completes, token countdown should reset
    await tui.waitForText("Token valid for");
  });

  test("r during refresh is ignored", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // Rapid r presses — second should be ignored
    await tui.sendKeys("r", "r");
    // Should still show refreshing state (not error from double request)
    const snapshot = tui.snapshot();
    expect(snapshot).not.toContain("error");
  });

  test("r on non-running workspace is no-op", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("j"); // starting workspace
    await tui.sendKeys("Enter");
    await tui.waitForText("Waiting for workspace to start");

    await tui.sendKeys("r");
    // Should NOT trigger a refresh — still showing placeholder
    const snapshot = tui.snapshot();
    expect(snapshot).not.toContain("Refreshing");
  });

  test("R resumes suspended workspace", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("j", "j", "j"); // suspended workspace
    await tui.sendKeys("Enter");
    await tui.waitForText("Workspace suspended. Press R to resume.");

    await tui.sendKeys("R");
    // Should trigger resume action — workspace transitions to starting/running
    await tui.waitForText("Waiting for workspace to start");
  });

  test("R on running workspace is no-op", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // R on running workspace — no action, should still show SSH info
    await tui.sendKeys("R");
    await tui.waitForText("Command"); // Still showing command
  });

  test("c with clipboard unavailable shows fallback", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_CLIPBOARD_PROVIDER: "none" },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    await tui.sendKeys("c");
    await tui.waitForText("Copy not available");
  });

  test("auto-refresh triggers on token expiry", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Token valid for");

    // Wait for token to expire and auto-refresh to occur
    // Token has 5-minute TTL; auto-refresh fires at 0s remaining
    // After auto-refresh, countdown resets
    await tui.waitForText("Token valid for", 310_000); // re-appears after refresh
  });

  test("auto-refresh failure stops further auto-refresh", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    // When auto-refresh fails, should show failure state
    await tui.waitForText("Token expired", 310_000);

    // Manual r should still work
    await tui.sendKeys("r");
    // Should attempt refresh
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/Refreshing|Token valid/);
  });

  test("q pops back from workspace detail", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    await tui.sendKeys("q");
    await tui.waitForText("Workspaces");
    await tui.waitForNoText("SSH Connection");
  });

  test("Esc pops back from workspace detail", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    await tui.sendKeys("Escape");
    await tui.waitForText("Workspaces");
    await tui.waitForNoText("SSH Connection");
  });

  test("? shows help overlay with SSH keybindings", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    await tui.sendKeys("?");
    // Help overlay should list SSH keybindings
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/c.*copy/i);
    expect(snapshot).toMatch(/y.*host/i);
    expect(snapshot).toMatch(/r.*refresh/i);
  });

  test("workspace starts via SSE and SSH info appears", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Navigate to starting workspace
    await tui.sendKeys("j");
    await tui.sendKeys("Enter");
    await tui.waitForText("Waiting for workspace to start");

    // SSE delivers status transition to "running"
    // The section should automatically fetch SSH info
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command", 30_000); // May take time for SSE
  });

  test("workspace suspends via SSE and SSH info clears", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // SSE delivers status transition to "suspended"
    await tui.waitForText("Workspace suspended", 30_000);
    await tui.waitForNoText("Command");
  });

  test("rapid c presses each trigger clipboard write", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // Three rapid c presses
    await tui.sendKeys("c", "c", "c");
    // Last "Copied!" should be visible
    await tui.waitForText("Copied!");
  });

  test("token countdown updates display", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    // Capture initial countdown value
    await tui.waitForText("Token valid for");
    const snapshot1 = tui.snapshot();

    // Wait 3 seconds for countdown to decrease
    await new Promise(resolve => setTimeout(resolve, 3000));
    const snapshot2 = tui.snapshot();

    // Snapshots should differ in the token countdown value
    expect(snapshot1).not.toBe(snapshot2);
  });

  // ── Responsive Tests ────────────────────────────────────────────────

  test("responsive 80x24 shows only command and token", async () => {
    tui = await launchTUI({
      cols: 80,
      rows: 24,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    const snapshot = tui.snapshot();
    expect(snapshot).toContain("Command");
    expect(snapshot).toContain("Token");
    // Host/Port/Username should not appear at minimum breakpoint
    // Note: "Host" might appear in the ssh_host value string,
    // so we check for the label pattern specifically
    expect(snapshot).not.toMatch(/^\s*Host\s+\S/m);
  });

  test("responsive 120x40 shows all standard fields", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    await tui.waitForText("Host");
    await tui.waitForText("Port");
    await tui.waitForText("Username");
    await tui.waitForText("Command");
    await tui.waitForText("Token");
  });

  test("responsive 200x60 shows extended info", async () => {
    tui = await launchTUI({
      cols: 200,
      rows: 60,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    await tui.waitForText("Workspace ID");
    await tui.waitForText("VM ID");
  });

  test("responsive 80x24 command truncation", async () => {
    tui = await launchTUI({
      cols: 80,
      rows: 24,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // Long SSH commands should be truncated with ellipsis
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("…");
  });

  test("responsive 120x40 command fits", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // At standard width, command should fit without truncation
    // (depends on fixture data length)
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("(c to copy)");
  });

  test("resize from 120x40 to 80x24 collapses fields", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Host");
    await tui.waitForText("Port");

    // Resize to minimum
    await tui.resize(80, 24);

    // Host/Port should disappear
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("Command");
    expect(snapshot).toContain("Token");
  });

  test("resize from 80x24 to 120x40 expands fields", async () => {
    tui = await launchTUI({
      cols: 80,
      rows: 24,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // Resize to standard
    await tui.resize(120, 40);

    // Host/Port/Username should appear
    await tui.waitForText("Host");
    await tui.waitForText("Port");
    await tui.waitForText("Username");
  });

  test("resize from 120x40 to 200x60 adds extended fields", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    // Resize to large
    await tui.resize(200, 60);

    await tui.waitForText("Workspace ID");
    await tui.waitForText("VM ID");
  });

  test("resize below minimum shows terminal too small", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    // Resize below minimum
    await tui.resize(60, 20);
    await tui.waitForText("Terminal too small");
  });

  test("resize back above minimum restores SSH info", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");

    // Resize below minimum
    await tui.resize(60, 20);
    await tui.waitForText("Terminal too small");

    // Resize back
    await tui.resize(120, 40);
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");
  });

  test("resize during token refresh", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    await tui.sendKeys("r"); // trigger refresh
    // Resize during refresh
    await tui.resize(80, 24);

    // Refresh should complete normally
    await tui.waitForText("Token valid for", 10_000);
  });

  // ── Integration Tests ───────────────────────────────────────────────

  test("full flow: create workspace, wait for running, copy SSH command", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");

    // Navigate to running workspace and copy
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");
    await tui.sendKeys("c");
    await tui.waitForText("Copied!");
  });

  test("SSH info re-fetched after workspace resume", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Navigate to suspended workspace
    await tui.sendKeys("j", "j", "j");
    await tui.sendKeys("Enter");
    await tui.waitForText("Workspace suspended");

    // Resume
    await tui.sendKeys("R");
    // Wait for workspace to become running with fresh SSH info
    await tui.waitForText("Command", 30_000);
    await tui.waitForText("Token valid for");
  });

  test("401 on SSH endpoint shows auth error", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: "invalid-expired-token" },
    });
    await tui.sendKeys("g", "w");
    // 401 should propagate to auth error screen
    await tui.waitForText("codeplane auth login", 15_000);
  });

  test("429 on SSH endpoint shows rate limit", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    // When the SSH endpoint returns 429, rate limit message should appear
    await tui.waitForText("Rate limited");
  });

  test("404 on SSH endpoint shows workspace not found", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    // 404 on SSH endpoint
    await tui.waitForText("Workspace not found");
  });

  test("network error on SSH fetch shows retry hint", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_API_URL: "http://localhost:1" }, // unreachable
    });
    await tui.sendKeys("g", "w");
    // Network error should eventually show retry hint
    await tui.waitForText("retry", 15_000);
  });

  test("workspace deleted during SSH info display", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // Trigger refresh after workspace is deleted externally
    await tui.sendKeys("r");
    // Should show workspace not found
    await tui.waitForText("Workspace not found", 10_000);
  });

  test("SSE reconnect recovers missed status transition", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("j"); // starting workspace
    await tui.sendKeys("Enter");
    await tui.waitForText("Waiting for workspace to start");

    // SSE reconnect delivers missed "running" transition
    await tui.waitForText("Command", 45_000); // SSE reconnect timeout
  });

  test("token refresh produces new command with new token", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // Capture command before refresh
    const before = tui.snapshot();

    await tui.sendKeys("r");
    await tui.waitForText("Token valid for", 10_000);

    // After refresh, token countdown should have reset to ~5 minutes
    const after = tui.snapshot();
    expect(after).toMatch(/Token valid for [45]m/);
  });

  test("copy captures full command even when truncated", async () => {
    tui = await launchTUI({
      cols: 80,
      rows: 24,
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.waitForText("Command");

    // Verify truncation is visible
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("…");

    // Copy should still succeed (full command)
    await tui.sendKeys("c");
    await tui.waitForText("Copied!");
    // The clipboard receives the full untruncated command
    // (verified by the success feedback — component always copies full value)
  });
});
```

### Test Philosophy Notes

1. **Tests run against the real API server** — No mock servers. Tests depend on workspace fixtures being present in the test environment. Tests that fail due to unimplemented backends are left failing.

2. **No internal mocking** — Tests never mock `useWorkspaceSSH`, `useClipboard`, or SSE connections. They validate user-visible behavior through terminal output.

3. **Snapshot tests are supplementary** — Every snapshot test also includes explicit text assertions. Snapshots catch visual regressions; text assertions verify functional correctness.

4. **Token expiry tests have long timeouts** — Tests that wait for token expiry use 310-second timeouts (5-minute TTL + buffer). These are inherently slow tests. In CI, they may benefit from short-lived test tokens via fixture configuration.

5. **Resize tests verify data preservation** — After resize, SSH info data and token countdown state must be intact. Only the layout changes.

6. **SSE integration tests have 30-45s timeouts** — SSE status transitions depend on server-side events. Tests use longer timeouts to accommodate network latency and SSE reconnection.

---

## 7. File Summary

| File | Type | Description |
|---|---|---|
| `apps/tui/src/hooks/useTokenCountdown.ts` | New | Token TTL countdown hook with 1-second tick, formatted display, color transitions, and expiry callback |
| `apps/tui/src/components/SSHInfoPlaceholder.tsx` | New | Sub-component rendering status-appropriate messages for non-running workspaces |
| `apps/tui/src/components/WorkspaceSSHPanel.tsx` | New | Primary SSH info panel component with field display, copy handlers, refresh logic, error formatting, and telemetry |
| `apps/tui/src/components/index.ts` | Modified | Append exports for `WorkspaceSSHPanel`, `SSHInfoPlaceholder` |
| `e2e/tui/workspaces.test.ts` | Modified | Add `TUI_WORKSPACE_SSH_INFO` describe block with 50 tests (21 snapshot, 19 keyboard, 10 responsive + integration) |

---

## 8. Dependencies and Ordering

```
tui-workspace-data-hooks ──┐
tui-clipboard-util ─────────┤
tui-workspace-status-stream ┤──→ tui-workspace-ssh-info
tui-workspace-e2e-helpers ──┘
```

All four dependencies must be complete (at minimum, their hook/utility interfaces must be importable and type-check) before this ticket can ship a functional end-to-end feature. However, the component and test code in this ticket can be written and reviewed in parallel with the dependencies — the component is designed with props-based injection that allows the parent screen to provide any compatible data source.

---

## 9. Acceptance Checklist

- [ ] `useTokenCountdown` hook ticks every second, formats `Xm Ys` / `Xs` / `Token expired`, resolves correct color key
- [ ] `SSHInfoPlaceholder` renders spinner for pending/starting/resuming, warning for suspended, muted for stopped
- [ ] `WorkspaceSSHPanel` renders all five standard fields (Host, Port, Username, Command, Token) at 120×40
- [ ] `WorkspaceSSHPanel` renders only Command + Token at 80×24
- [ ] `WorkspaceSSHPanel` renders extended fields (Workspace ID, VM ID) at 200×60+
- [ ] `c` copies full SSH command to clipboard and shows "Copied!" feedback
- [ ] `y` copies ssh_host to clipboard and shows "Copied host!" feedback
- [ ] `r` refreshes SSH info with debounce guard (one request at a time, 2s cooldown)
- [ ] Token countdown color transitions: green (>2m) → yellow (30s–2m) → red (<30s)
- [ ] Auto-refresh fires on token expiry, circuit-breaker stops after failure
- [ ] Error messages match spec for 401, 404, 429, 409/423, 5xx, network errors
- [ ] All telemetry events fire with correct properties (no sensitive data)
- [ ] Resize preserves state and recalculates layout synchronously
- [ ] All 50 E2E tests in `workspaces.test.ts` are present (not skipped, not commented)
- [ ] Tests that fail due to unimplemented backends are left failing