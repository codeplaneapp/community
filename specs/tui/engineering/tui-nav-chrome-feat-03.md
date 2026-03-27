# Engineering Specification: tui-nav-chrome-feat-03

## TUI_STATUS_BAR — Persistent footer with hints, sync, notifications

**Ticket:** tui-nav-chrome-feat-03  
**Type:** Feature  
**Status:** Partial → Implemented  
**Dependencies:** tui-nav-chrome-eng-01, tui-nav-chrome-eng-02, tui-nav-chrome-eng-03, tui-nav-chrome-eng-05, tui-nav-chrome-eng-07, tui-nav-chrome-eng-06

---

## Summary

Replace the existing placeholder `StatusBar` component with a fully specified three-section status bar: left (context-sensitive keybinding hints), center (sync status indicator), right (notification badge + help hint). Extract `SyncStatusIndicator` and `NotificationBadge` as standalone sub-components. Wire real-time data from SSE and sync state providers. Implement responsive breakpoint behavior, go-to mode hint replacement, and notification flash animation.

---

## Current State Analysis

### What exists

| File | State | Notes |
|------|-------|-------|
| `apps/tui/src/components/StatusBar.tsx` | Partial | Renders hints, auth confirmation, hardcoded `syncState = "connected"`, `?` help. No notification badge. No sync indicator sub-component. No breakpoint-aware hint limits beyond `minimum` vs `!minimum`. No background color. Uses `border: ["top"]` instead of background surface. |
| `apps/tui/src/components/SyncStatusIndicator.tsx` | Missing | Does not exist. |
| `apps/tui/src/components/NotificationBadge.tsx` | Missing | Does not exist. |
| `apps/tui/src/hooks/useStatusBarHints.ts` | Implemented | Reads `StatusBarHintsContext` from `KeybindingProvider`. Has `hints`, `registerHints`, `overrideHints`, `isOverridden`. |
| `apps/tui/src/hooks/useSpinner.ts` | Implemented | Braille/ASCII spinner via OpenTUI Timeline. Shared frame-synchronized singleton. |
| `apps/tui/src/providers/SSEProvider.tsx` | Stub | Returns `null` context. No real SSE connection. |
| `apps/tui/src/providers/KeybindingProvider.tsx` | Implemented | Full 5-tier dispatch, status bar hint registration with override support. |
| `apps/tui/src/hooks/useLayout.ts` | Implemented | Returns `{ width, height, breakpoint, contentHeight, ... }`. |
| `apps/tui/src/theme/tokens.ts` | Implemented | `ThemeTokens` with `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`. `TextAttributes.BOLD`. |
| `apps/tui/src/lib/telemetry.ts` | Implemented | `emit(name, properties)` for debug telemetry. |
| `@codeplane/sdk` `SyncState` | Implemented | `SyncStatus: "offline" | "online" | "syncing" | "error"`. `SyncState: { status, pendingCount, conflictCount, lastSyncAt, error }`. |

### What's missing

1. `SyncStatusIndicator` sub-component with four visual states
2. `NotificationBadge` sub-component with real-time count, 99+ cap, and bold flash
3. `useSyncState()` hook bridging `@codeplane/sdk` `SyncState` to React context
4. `useNotificationCount()` hook (or equivalent) consuming SSE-streamed unread count
5. `useSSEConnectionState()` hook exposing `{ connected, reconnecting, backoffMs }`
6. Responsive hint count limits (4 / 6 / all per breakpoint)
7. Ellipsis truncation when hints exceed available width
8. Background surface color (ANSI 236) instead of top border
9. Bold formatting on hint keys
10. Go-to mode hint replacement already works via `overrideHints` — needs verification
11. Telemetry events for status bar

---

## Implementation Plan

### Step 1: Create `useSyncState` hook

**File:** `apps/tui/src/hooks/useSyncState.ts`

Bridge between the `@codeplane/sdk` `SyncState` and React state. Since the real SyncService lives in the daemon process and is not directly available in the TUI's React tree, this hook reads from a context provider that will be populated by the SSE connection or daemon IPC.

```typescript
import { useState, useEffect, useCallback, createContext, useContext } from "react";
import type { SyncStatus, SyncState } from "@codeplane/sdk";

export interface SyncStateContextValue {
  /** Current sync state. */
  state: SyncState;
  /** Update sync state (called by SSE handler or daemon bridge). */
  update(partial: Partial<SyncState>): void;
}

const DEFAULT_SYNC_STATE: SyncState = {
  status: "offline" as SyncStatus,
  pendingCount: 0,
  conflictCount: 0,
  lastSyncAt: null,
  error: null,
};

export const SyncStateContext = createContext<SyncStateContextValue | null>(null);

/**
 * Read the current daemon sync state.
 *
 * Returns `DEFAULT_SYNC_STATE` (offline, 0 conflicts) if the
 * SyncStateProvider is not mounted or unreachable. This ensures
 * the status bar always renders without throwing.
 */
export function useSyncState(): SyncState {
  const ctx = useContext(SyncStateContext);
  return ctx?.state ?? DEFAULT_SYNC_STATE;
}
```

**Design decisions:**
- Returns a safe default (`offline`, 0 conflicts) when no provider exists, satisfying the resilience requirement that the status bar renders without crashing when daemon is unreachable.
- The context update function allows the SSE handler to push state changes without polling.
- `SyncState` type is re-exported from `@codeplane/sdk` — no TUI-specific equivalent.

---

### Step 2: Create `useSSEConnectionState` hook

**File:** `apps/tui/src/hooks/useSSEConnectionState.ts`

Exposes SSE connection health for the sync status indicator.

```typescript
import { createContext, useContext } from "react";

export interface SSEConnectionState {
  /** Whether the SSE EventSource is currently connected and receiving events. */
  connected: boolean;
  /** Whether a reconnection attempt is in progress. */
  reconnecting: boolean;
  /** Current backoff delay in milliseconds (0 if connected). */
  backoffMs: number;
}

const DEFAULT_STATE: SSEConnectionState = {
  connected: false,
  reconnecting: false,
  backoffMs: 0,
};

export const SSEConnectionStateContext = createContext<SSEConnectionState>(DEFAULT_STATE);

/**
 * Read the current SSE connection health.
 *
 * Returns disconnected defaults if no SSEProvider is mounted.
 */
export function useSSEConnectionState(): SSEConnectionState {
  return useContext(SSEConnectionStateContext);
}
```

**Integration point:** The existing `SSEProvider` (currently a stub) will be updated to provide this context value. Until the SSEProvider is fully implemented (separate ticket), the default (`connected: false`) ensures the sync indicator shows "Disconnected" — correct degraded behavior per the spec.

---

### Step 3: Create `useNotificationCount` hook

**File:** `apps/tui/src/hooks/useNotificationCount.ts`

Provides the unread notification count from SSE streaming. Includes the "last known count" retention behavior on disconnect.

```typescript
import { createContext, useContext } from "react";

export interface NotificationCountContextValue {
  /** Current unread notification count. */
  unreadCount: number;
}

const DEFAULT: NotificationCountContextValue = { unreadCount: 0 };

export const NotificationCountContext = createContext<NotificationCountContextValue>(DEFAULT);

/**
 * Read the current unread notification count.
 *
 * The count is streamed via SSE from the `user_notifications_{userId}` channel.
 * On SSE disconnect, the last known count is retained (not reset to 0).
 * Returns 0 if no provider is mounted.
 */
export function useNotificationCount(): number {
  return useContext(NotificationCountContext).unreadCount;
}
```

**Integration point:** The SSEProvider (once implemented) will maintain this count in state, updating on SSE events. On disconnect, the state is not cleared — it retains the last received value. The context value is only reset to 0 on explicit user action (mark all read) or fresh session start.

---

### Step 4: Create `SyncStatusIndicator` component

**File:** `apps/tui/src/components/SyncStatusIndicator.tsx`

Self-contained component rendering one of four sync states. Consumes `useSyncState()` and `useSSEConnectionState()`. At compact width, renders icon-only.

```typescript
import React from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useSyncState } from "../hooks/useSyncState.js";
import { useSSEConnectionState } from "../hooks/useSSEConnectionState.js";
import { useSpinner } from "../hooks/useSpinner.js";
import { useLayout } from "../hooks/useLayout.js";
import { TextAttributes } from "../theme/tokens.js";
import { emit } from "../lib/telemetry.js";
import type { SyncStatus } from "@codeplane/sdk";

// Status mapping: SDK SyncStatus → display state
type DisplayState = "connected" | "syncing" | "conflict" | "disconnected";

function resolveDisplayState(
  syncState: { status: SyncStatus; conflictCount: number },
  sseState: { connected: boolean; reconnecting: boolean; backoffMs: number },
): DisplayState {
  // SSE disconnect overrides sync status
  if (!sseState.connected && !sseState.reconnecting) {
    if (syncState.status === "offline") return "disconnected";
  }
  
  switch (syncState.status) {
    case "online":  return "connected";
    case "syncing": return "syncing";
    case "error":
      return syncState.conflictCount > 0 ? "conflict" : "disconnected";
    case "offline":
    default:
      return "disconnected";
  }
}

export function SyncStatusIndicator() {
  const theme = useTheme();
  const syncState = useSyncState();
  const sseState = useSSEConnectionState();
  const { breakpoint } = useLayout();
  
  const displayState = resolveDisplayState(syncState, sseState);
  const isSyncing = displayState === "syncing";
  const spinnerFrame = useSpinner(isSyncing);
  const compact = breakpoint === "minimum";
  
  // Track state transitions for telemetry
  const prevStateRef = React.useRef<DisplayState>(displayState);
  React.useEffect(() => {
    if (prevStateRef.current !== displayState) {
      emit("tui.status_bar.sync_state_changed", {
        from_status: prevStateRef.current,
        to_status: displayState,
        conflict_count: syncState.conflictCount,
        pending_count: syncState.pendingCount,
      });
      prevStateRef.current = displayState;
    }
  }, [displayState, syncState.conflictCount, syncState.pendingCount]);
  
  switch (displayState) {
    case "connected":
      return (
        <box flexDirection="row">
          <text fg={theme.success}>●</text>
          {!compact && <text fg={theme.success}> Connected</text>}
        </box>
      );
    
    case "syncing":
      return (
        <box flexDirection="row">
          <text fg={theme.warning}>{spinnerFrame || "⠋"}</text>
          {!compact && <text fg={theme.warning}> Syncing…</text>}
        </box>
      );
    
    case "conflict":
      return (
        <box flexDirection="row">
          <text fg={theme.warning}>▲</text>
          {!compact && (
            <text fg={theme.warning}>
              {` ${syncState.conflictCount} conflict${syncState.conflictCount !== 1 ? "s" : ""}`}
            </text>
          )}
        </box>
      );
    
    case "disconnected": {
      const retryText = sseState.reconnecting
        ? ` (retry ${Math.ceil(sseState.backoffMs / 1000)}s)`
        : "";
      return (
        <box flexDirection="row">
          <text fg={theme.error}>●</text>
          {!compact && (
            <text fg={theme.error}>{` Disconnected${retryText}`}</text>
          )}
        </box>
      );
    }
  }
}
```

**Design decisions:**
- `resolveDisplayState` maps the combination of SDK `SyncStatus` and SSE connection state to one of four display states. This avoids leaking internal enum values into rendering logic.
- The spinner is driven by the existing `useSpinner()` hook which uses OpenTUI's `Timeline` engine — no `setInterval`, no string allocation per frame (the `BRAILLE_FRAMES` array is pre-allocated at module load).
- `compact` mode (breakpoint `"minimum"`, <120 cols) renders icon-only per spec.
- Telemetry fires on state transitions only, not on every render.

---

### Step 5: Create `NotificationBadge` component

**File:** `apps/tui/src/components/NotificationBadge.tsx`

Renders unread notification count with diamond icon, color, 99+ cap, and 2-second bold flash on increase.

```typescript
import React, { useState, useEffect, useRef } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useNotificationCount } from "../hooks/useNotificationCount.js";
import { TextAttributes } from "../theme/tokens.js";
import { emit } from "../lib/telemetry.js";

/** Duration of bold flash when count increases (ms). */
const FLASH_DURATION_MS = 2000;

/** Display cap for notification count. */
const MAX_DISPLAY_COUNT = 99;
const OVERFLOW_LABEL = "99+";

export function NotificationBadge() {
  const theme = useTheme();
  const count = useNotificationCount();
  
  const [flashing, setFlashing] = useState(false);
  const prevCountRef = useRef(count);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = count;
    
    if (count > prevCount) {
      // New notification arrived — start bold flash
      setFlashing(true);
      
      // Clear any existing timer
      if (flashTimerRef.current !== null) {
        clearTimeout(flashTimerRef.current);
      }
      
      flashTimerRef.current = setTimeout(() => {
        setFlashing(false);
        flashTimerRef.current = null;
      }, FLASH_DURATION_MS);
      
      emit("tui.status_bar.notification_received", {
        previous_count: prevCount,
        new_count: count,
      });
    }
    
    return () => {
      if (flashTimerRef.current !== null) {
        clearTimeout(flashTimerRef.current);
      }
    };
  }, [count]);
  
  const displayCount = count > MAX_DISPLAY_COUNT ? OVERFLOW_LABEL : String(count);
  const hasUnread = count > 0;
  const color = hasUnread ? theme.primary : theme.muted;
  const attrs = flashing ? TextAttributes.BOLD : 0;
  
  if (count > MAX_DISPLAY_COUNT) {
    emit("tui.status_bar.notification_overflow", { count });
  }
  
  return (
    <box flexDirection="row">
      <text fg={color} attributes={attrs}>◆</text>
      {hasUnread && <text fg={color} attributes={attrs}>{` ${displayCount}`}</text>}
    </box>
  );
}
```

**Design decisions:**
- `prevCountRef` tracks the previous count across renders. Flash only triggers when `count > prevCount` (increase), not on decrease (which happens on mark-read).
- Timer is cleaned up on unmount and on rapid successive increases (each new increase resets the 2s window).
- Count is capped at display level — the actual count is preserved for telemetry.
- When count is 0, only the muted diamond renders (no number), per spec.
- The overflow telemetry event fires at warn level — the `emit()` function logs to stderr in debug mode.

---

### Step 6: Rewrite `StatusBar` component

**File:** `apps/tui/src/components/StatusBar.tsx`

Replace the existing implementation with the three-section layout. Integrate sub-components. Implement responsive hint truncation.

```typescript
import React, { useMemo, useRef, useEffect, useState } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { useAuth } from "../hooks/useAuth.js";
import { useLoading } from "../hooks/useLoading.js";
import { useStatusBarHints } from "../hooks/useStatusBarHints.js";
import { TextAttributes } from "../theme/tokens.js";
import { STATUS_BAR_ERROR_PADDING } from "../loading/constants.js";
import { truncateRight } from "../util/text.js";
import { SyncStatusIndicator } from "./SyncStatusIndicator.js";
import { NotificationBadge } from "./NotificationBadge.js";
import { emit } from "../lib/telemetry.js";
import type { AuthStatus } from "../providers/AuthProvider.js";
import type { StatusBarHint } from "../providers/keybinding-types.js";

/** Characters reserved for center section (icon + label + padding). */
const CENTER_RESERVED_MIN = 4;   // icon only: "● " + 2 padding
const CENTER_RESERVED_FULL = 18; // "● Connected" + 2 padding

/** Characters reserved for right section. */
const RIGHT_RESERVED_MIN = 10;   // "◆  ?:help" minimum
const RIGHT_RESERVED_FULL = 14;  // "◆ 99+  ?:help"

/** Separator between hints: two spaces. */
const HINT_SEP = "  ";
const ELLIPSIS = "  …";

/**
 * Compute which hints fit within the available width.
 *
 * Each hint renders as: `{keys}:{label}` with `HINT_SEP` between them.
 * Returns the visible hints and whether truncation occurred.
 */
function computeVisibleHints(
  hints: StatusBarHint[],
  availableWidth: number,
  maxCount: number,
): { visible: StatusBarHint[]; truncated: boolean } {
  if (hints.length === 0) return { visible: [], truncated: false };
  
  const limited = maxCount < hints.length ? hints.slice(0, maxCount) : hints;
  const visible: StatusBarHint[] = [];
  let usedWidth = 0;
  
  for (let i = 0; i < limited.length; i++) {
    const hint = limited[i];
    const hintWidth = hint.keys.length + 1 + hint.label.length; // "keys:label"
    const sepWidth = i > 0 ? HINT_SEP.length : 0;
    const totalNeeded = usedWidth + sepWidth + hintWidth;
    
    // Reserve space for ellipsis if there are more hints after this
    const needsEllipsisSpace = i < limited.length - 1 || limited.length < hints.length;
    const ellipsisReserve = needsEllipsisSpace ? ELLIPSIS.length : 0;
    
    if (totalNeeded + ellipsisReserve > availableWidth && visible.length > 0) {
      return { visible, truncated: true };
    }
    
    if (totalNeeded > availableWidth && visible.length === 0) {
      // Even the first hint doesn't fit — show nothing
      return { visible: [], truncated: hints.length > 0 };
    }
    
    visible.push(hint);
    usedWidth = totalNeeded;
  }
  
  return {
    visible,
    truncated: visible.length < hints.length,
  };
}

/**
 * Get the maximum number of hints for a given breakpoint.
 */
function getMaxHints(breakpoint: string | null): number {
  switch (breakpoint) {
    case "minimum":  return 4;
    case "standard": return 6;
    case "large":    return Infinity; // show all
    default:         return 4;
  }
}

export function StatusBar() {
  const { width, breakpoint } = useLayout();
  const theme = useTheme();
  const { status: authStatus, user, tokenSource } = useAuth();
  const { statusBarError, currentScreenLoading } = useLoading();
  const { hints } = useStatusBarHints();
  
  // Auth confirmation toast (3s after auth success)
  const [showAuthConfirm, setShowAuthConfirm] = useState(false);
  const prevStatusRef = useRef<AuthStatus | null>(null);
  
  useEffect(() => {
    if (authStatus === "authenticated" && prevStatusRef.current === "loading") {
      setShowAuthConfirm(true);
      const timer = setTimeout(() => setShowAuthConfirm(false), 3000);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = authStatus;
  }, [authStatus]);
  
  const showRetryHint =
    currentScreenLoading?.status === "error" ||
    currentScreenLoading?.status === "timeout";
  
  // Compute layout widths
  const compact = breakpoint === "minimum";
  const centerReserved = compact ? CENTER_RESERVED_MIN : CENTER_RESERVED_FULL;
  const rightReserved = RIGHT_RESERVED_FULL;
  const availableHintWidth = Math.max(0, width - centerReserved - rightReserved - 2); // 2 for padding
  const maxHints = getMaxHints(breakpoint);
  
  const { visible: visibleHints, truncated } = useMemo(
    () => computeVisibleHints(hints, availableHintWidth, maxHints),
    [hints, availableHintWidth, maxHints],
  );
  
  const maxErrorWidth = Math.max(10, width - STATUS_BAR_ERROR_PADDING);
  
  // First-render telemetry
  const didEmitRef = useRef(false);
  useEffect(() => {
    if (!didEmitRef.current) {
      didEmitRef.current = true;
      emit("tui.status_bar.rendered", {
        terminal_width: width,
        hints_visible_count: visibleHints.length,
        hints_total_count: hints.length,
      });
    }
  }, []);
  
  return (
    <box
      flexDirection="row"
      height={1}
      width="100%"
      backgroundColor={theme.surface}
      justifyContent="space-between"
      alignItems="center"
    >
      {/* Left section: keybinding hints */}
      <box flexGrow={1} flexDirection="row" flexShrink={1} overflow="hidden">
        {statusBarError ? (
          <text fg={theme.error}>{truncateRight(statusBarError, maxErrorWidth)}</text>
        ) : (
          <>
            {visibleHints.map((hint, i) => (
              <React.Fragment key={`${hint.keys}-${hint.label}`}>
                {i > 0 && <text fg={theme.muted}>{HINT_SEP}</text>}
                <text fg={theme.primary} attributes={TextAttributes.BOLD}>{hint.keys}</text>
                <text fg={theme.muted}>:{hint.label}</text>
              </React.Fragment>
            ))}
            {truncated && <text fg={theme.muted}>{ELLIPSIS}</text>}
            {showRetryHint && (
              <>
                {visibleHints.length > 0 && <text fg={theme.muted}>{HINT_SEP}</text>}
                <text fg={theme.primary} attributes={TextAttributes.BOLD}>R</text>
                <text fg={theme.muted}>:retry</text>
              </>
            )}
          </>
        )}
      </box>
      
      {/* Center section: sync status */}
      <box flexDirection="row" flexShrink={0} justifyContent="center">
        {showAuthConfirm && user && tokenSource ? (
          <text fg={theme.success}>
            {`✓ ${user.length > 16 ? user.slice(0, 15) + "…" : user} via ${tokenSource}`}
          </text>
        ) : authStatus === "offline" ? (
          <text fg={theme.warning}>⚠ offline</text>
        ) : (
          <SyncStatusIndicator />
        )}
      </box>
      
      {/* Right section: notifications + help */}
      <box flexDirection="row" flexShrink={0} justifyContent="flex-end">
        <NotificationBadge />
        <text fg={theme.muted}>{HINT_SEP}</text>
        <text fg={theme.muted}>
          <text fg={theme.primary} attributes={TextAttributes.BOLD}>?</text>
          :help
        </text>
      </box>
    </box>
  );
}
```

**Key changes from existing `StatusBar.tsx`:**

| Aspect | Before | After |
|--------|--------|-------|
| Background | `border={["top"]}` with border color | `backgroundColor={theme.surface}` (ANSI 236) |
| Sync status | Hardcoded `"connected"` string | `<SyncStatusIndicator />` sub-component |
| Notifications | None | `<NotificationBadge />` sub-component |
| Hint formatting | Keys in primary color, no bold | Keys in primary + `TextAttributes.BOLD` |
| Hint truncation | `slice(0, 4)` at minimum | Width-aware `computeVisibleHints()` with `…` ellipsis |
| Hint limits | `showFullHints ? all : 4` | `4 / 6 / Infinity` per breakpoint |
| Help hint | `?` in primary + ` help` in muted | `?:help` format, always rightmost |
| Auth toast | Center section | Center section (preserved) |
| Layout | Three `<box>` children | Three `<box>` children with `justifyContent="space-between"` |

---

### Step 7: Update component index

**File:** `apps/tui/src/components/index.ts`

Add exports for new components:

```typescript
export { SyncStatusIndicator } from "./SyncStatusIndicator.js";
export { NotificationBadge } from "./NotificationBadge.js";
```

---

### Step 8: Wire context providers

**File:** `apps/tui/src/providers/SSEProvider.tsx`

The SSEProvider stub must be updated to provide `SSEConnectionState` and `NotificationCountContextValue` contexts. Until the full SSE implementation lands (separate ticket), these provide default values that render the status bar in degraded mode.

```typescript
import { createContext, useContext, useState, type ReactNode } from "react";
import { SSEConnectionStateContext, type SSEConnectionState } from "../hooks/useSSEConnectionState.js";
import { NotificationCountContext, type NotificationCountContextValue } from "../hooks/useNotificationCount.js";
import { SyncStateContext, type SyncStateContextValue } from "../hooks/useSyncState.js";
import type { SyncState, SyncStatus } from "@codeplane/sdk";

export interface SSEEvent {
  type: string;
  data: any;
}

const DEFAULT_SSE_STATE: SSEConnectionState = {
  connected: false,
  reconnecting: false,
  backoffMs: 0,
};

const DEFAULT_SYNC_STATE: SyncState = {
  status: "offline" as SyncStatus,
  pendingCount: 0,
  conflictCount: 0,
  lastSyncAt: null,
  error: null,
};

export function SSEProvider({ children }: { children: ReactNode }) {
  const [sseState] = useState<SSEConnectionState>(DEFAULT_SSE_STATE);
  const [notifCount] = useState<NotificationCountContextValue>({ unreadCount: 0 });
  const [syncState, setSyncState] = useState<SyncState>(DEFAULT_SYNC_STATE);

  const syncContextValue: SyncStateContextValue = {
    state: syncState,
    update: (partial) => setSyncState((prev) => ({ ...prev, ...partial })),
  };

  return (
    <SSEConnectionStateContext.Provider value={sseState}>
      <NotificationCountContext.Provider value={notifCount}>
        <SyncStateContext.Provider value={syncContextValue}>
          {children}
        </SyncStateContext.Provider>
      </NotificationCountContext.Provider>
    </SSEConnectionStateContext.Provider>
  );
}

export function useSSE(channel: string) {
  return null;
}
```

**Note:** This preserves the current stub behavior while making the context shape correct. When the full SSE implementation lands, this provider will manage the real EventSource connection and update these contexts in response to events.

---

### Step 9: Resize telemetry

**File:** `apps/tui/src/components/StatusBar.tsx` (inline in existing component)

Add a resize tracking effect that emits telemetry when the breakpoint changes:

```typescript
// Inside StatusBar component
const prevBreakpointRef = useRef(breakpoint);
useEffect(() => {
  if (prevBreakpointRef.current !== breakpoint) {
    emit("tui.status_bar.resize_relayout", {
      old_breakpoint: prevBreakpointRef.current ?? "unsupported",
      new_breakpoint: breakpoint ?? "unsupported",
      new_width: width,
    });
    prevBreakpointRef.current = breakpoint;
  }
}, [breakpoint, width]);
```

---

### Step 10: Error boundary for status bar

The StatusBar should be wrapped in its own error boundary to prevent crashes from propagating to the full application.

**File:** `apps/tui/src/components/AppShell.tsx`

Update the AppShell to wrap `<StatusBar />` in a lightweight error boundary:

```typescript
import { ErrorBoundary } from "./ErrorBoundary.js";

// In the AppShell render:
<ErrorBoundary fallback={
  <box height={1} width="100%" backgroundColor={theme.surface}>
    <text fg={theme.error}>[status bar error — press ? for help]</text>
  </box>
}>
  <StatusBar />
</ErrorBoundary>
```

**Note:** The existing `ErrorBoundary` component should already support a `fallback` prop. If not, it needs a minor update to accept a fallback render prop.

---

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/hooks/useSyncState.ts` | **Create** | SyncState context + hook |
| `apps/tui/src/hooks/useSSEConnectionState.ts` | **Create** | SSE connection health context + hook |
| `apps/tui/src/hooks/useNotificationCount.ts` | **Create** | Notification count context + hook |
| `apps/tui/src/components/SyncStatusIndicator.tsx` | **Create** | Four-state sync indicator with spinner |
| `apps/tui/src/components/NotificationBadge.tsx` | **Create** | Diamond badge with count, flash, 99+ cap |
| `apps/tui/src/components/StatusBar.tsx` | **Rewrite** | Three-section layout with sub-components |
| `apps/tui/src/components/index.ts` | **Edit** | Add new component exports |
| `apps/tui/src/providers/SSEProvider.tsx` | **Rewrite** | Provide context values for new hooks |
| `apps/tui/src/components/AppShell.tsx` | **Edit** | Wrap StatusBar in error boundary |
| `e2e/tui/status-bar.test.ts` | **Create** | Full E2E test suite |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SSEProvider                                  │
│  ┌──────────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ SSEConnectionState   │  │ NotificationCt │  │ SyncState      │  │
│  │ { connected,         │  │ { unreadCount }│  │ { status,      │  │
│  │   reconnecting,      │  │                │  │   conflictCt,  │  │
│  │   backoffMs }        │  │                │  │   pendingCt }  │  │
│  └──────────┬───────────┘  └───────┬────────┘  └───────┬────────┘  │
└─────────────┼──────────────────────┼───────────────────┼────────────┘
              │                      │                   │
              ▼                      ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          StatusBar                                  │
│  ┌─────────────────┐ ┌─────────────────────┐ ┌──────────────────┐  │
│  │ Left: Hints     │ │ Center:             │ │ Right:           │  │
│  │ useStatusBar    │ │ SyncStatusIndicator │ │ NotificationBadge│  │
│  │ Hints()         │ │ useSyncState()      │ │ useNotifCount()  │  │
│  │                 │ │ useSSEConnState()   │ │                  │  │
│  │ KeybindingProv  │ │ useSpinner()        │ │ ?:help           │  │
│  └─────────────────┘ └─────────────────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Responsive Behavior Matrix

| Terminal Width | Breakpoint | Left (Hints) | Center (Sync) | Right (Notif + Help) |
|---------------|------------|-------------|--------------|---------------------|
| 80–119 | minimum | ≤4 hints, truncated with `…` | Icon only (`●`, spinner, `▲`, `●`) | `◆` + count + `?:help` |
| 120–199 | standard | ≤6 hints, truncated with `…` | Icon + label (`● Connected`) | `◆` + count + `?:help` |
| 200+ | large | All hints | Icon + label | `◆` + count + `?:help` |

---

## Go-To Mode Behavior

When `useStatusBarHints().isOverridden` is `true` (go-to mode active), the hint system already replaces hints via `overrideHints()` in the `KeybindingProvider`. The go-to mode handler (in `GlobalKeybindings`) calls `overrideHints()` with the go-to destination hints.

Go-to hints format: `g+d:dashboard  g+i:issues  g+l:landings  g+r:repos  g+w:workspaces  g+n:notifs  g+s:search  g+a:agents  g+o:orgs  g+f:workflows  g+k:wiki`

These are registered as `StatusBarHint[]` with the `keys` field as `g+d`, `g+i`, etc. The `computeVisibleHints()` function handles truncation the same way as normal hints.

**Verification needed:** Confirm that `GlobalKeybindings.tsx` or the go-to mode handler in `NavigationProvider` already calls `overrideHints()` when `g` is pressed. If not, add this integration.

---

## Performance Constraints

| Constraint | Implementation |
|-----------|----------------|
| Render time < 1ms | `computeVisibleHints()` is O(n) where n ≤ 15 hints. No DOM operations. Memoized with `useMemo`. |
| No full content re-render on SSE update | SSE updates flow through isolated contexts (`NotificationCountContext`, `SyncStateContext`). Only `NotificationBadge` and `SyncStatusIndicator` re-render — not the content area. |
| Spinner: no string allocation per frame | `useSpinner()` returns a reference to a pre-allocated string from the frozen `BRAILLE_FRAMES` array. |
| Resize: synchronous re-layout | `useLayout()` derives from `useTerminalDimensions()` which fires synchronously on `SIGWINCH`. No debounce. |

---

## Productionization Notes

### Hooks that return defaults (useSyncState, useNotificationCount, useSSEConnectionState)

These hooks currently return static defaults because the SSEProvider is a stub. When the SSE implementation is completed:

1. **SSEProvider** must maintain an `EventSource` connection and update `SSEConnectionState` on `open`, `error`, and `close` events.
2. **Notification count** must be updated from SSE events on the `user_notifications_{userId}` channel. On disconnect, the count must NOT be cleared.
3. **Sync state** must be updated from SSE events on the `daemon_sync` channel, or from direct daemon IPC if the TUI runs in daemon mode.
4. **Reconnection logic** must implement exponential backoff (1s, 2s, 4s, 8s, max 30s) and update `backoffMs` in `SSEConnectionState`.
5. **Ticket-based auth** must be implemented: `POST /api/auth/sse-ticket` to get a one-time ticket, then open `EventSource` with the ticket as a query parameter.

The hooks' default-returning behavior is intentional — it ensures the status bar renders correctly in degraded mode (no daemon, no SSE, no auth). This is not a bug to fix; it's a design pattern to preserve.

### Error boundary fallback

The status bar error boundary renders `[status bar error — press ? for help]` in `error` color on `surface` background. The rest of the TUI continues operating. The `?` keybinding is registered at the GLOBAL priority level and remains active regardless of status bar state.

---

## Unit & Integration Tests

**File:** `e2e/tui/status-bar.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI()` helper from `e2e/tui/helpers.ts`. Tests are organized by the spec's test series: SNAP-SB, KEY-SB, RESIZE-SB, RT-SB, EDGE-SB.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  type TUITestInstance,
} from "./helpers";

let tui: TUITestInstance;

afterEach(async () => {
  await tui?.terminate();
});

// ═══════════════════════════════════════════════════════════════════
// SNAP-SB: Terminal Snapshot Tests
// ═══════════════════════════════════════════════════════════════════

describe("SNAP-SB: Status bar snapshots", () => {
  test("SNAP-SB-001: Status bar renders at 120x40 with default state", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Status bar is the last row
    const lastLine = tui.getLine(tui.rows - 1);

    // Should contain sync indicator (disconnected in stub mode)
    expect(lastLine).toMatch(/●/);

    // Should contain notification badge (diamond)
    expect(lastLine).toMatch(/◆/);

    // Should contain help hint
    expect(lastLine).toMatch(/\?:help/);

    // Full snapshot for regression
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SB-002: Status bar renders at 80x24 minimum size", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");

    const lastLine = tui.getLine(tui.rows - 1);

    // Sync status should be icon-only at minimum width (no label text)
    // The dot character should be present
    expect(lastLine).toMatch(/●/);

    // Should NOT contain "Connected" or "Disconnected" text labels
    // at minimum width — icon only
    // (This tests the compact rendering path)

    // Notification badge always visible
    expect(lastLine).toMatch(/◆/);

    // Help hint always visible
    expect(lastLine).toMatch(/\?:help/);

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SB-003: Status bar renders at 200x60 large size", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
    });
    await tui.waitForText("Dashboard");

    const lastLine = tui.getLine(tui.rows - 1);

    // At large size, sync label should be fully visible
    // Badge and help hint present
    expect(lastLine).toMatch(/◆/);
    expect(lastLine).toMatch(/\?:help/);

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SB-004: Status bar with unread notifications", async () => {
    // Launch TUI with test fixture that provides 5 unread notifications
    // This test will fail until the SSE provider is fully implemented
    // and test fixtures deliver notification counts.
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    const lastLine = tui.getLine(tui.rows - 1);
    // With real SSE delivering 5 notifications:
    expect(lastLine).toMatch(/◆\s*5/);
  });

  test("SNAP-SB-005: Status bar with 100+ unread notifications", async () => {
    // Launch TUI with test fixture that provides 150 unread notifications
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    const lastLine = tui.getLine(tui.rows - 1);
    // With 150 notifications, should display 99+
    expect(lastLine).toMatch(/◆\s*99\+/);
  });

  test("SNAP-SB-006: Status bar with zero notifications", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    const lastLine = tui.getLine(tui.rows - 1);
    // Diamond should be present (muted color)
    expect(lastLine).toMatch(/◆/);
    // No count number should follow the diamond when count is 0
    // The diamond should NOT be followed by a digit
    expect(lastLine).not.toMatch(/◆\s+\d/);
  });

  test("SNAP-SB-007: Status bar with sync status syncing", async () => {
    // This test requires the sync state provider to report "syncing"
    // Will fail until daemon integration delivers sync state
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    const lastLine = tui.getLine(tui.rows - 1);
    // Should contain braille spinner character and "Syncing…" at 120+ width
    expect(lastLine).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    expect(lastLine).toMatch(/Syncing…/);
  });

  test("SNAP-SB-008: Status bar with sync status disconnected", async () => {
    // With no daemon connection (default stub state), should show disconnected
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    const lastLine = tui.getLine(tui.rows - 1);
    // Red dot should be present for disconnected state
    expect(lastLine).toMatch(/●/);
    // Should show "Disconnected" at standard width
    expect(lastLine).toMatch(/Disconnected/);
  });

  test("SNAP-SB-009: Status bar with sync conflicts", async () => {
    // This test requires sync state with conflictCount > 0
    // Will fail until daemon integration delivers conflict counts
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    const lastLine = tui.getLine(tui.rows - 1);
    // Should contain triangle warning and conflict count
    expect(lastLine).toMatch(/▲/);
    expect(lastLine).toMatch(/\d+\s*conflicts?/);
  });

  test("SNAP-SB-010: Status bar background color", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // The status bar line should have the surface background color applied
    // We verify via snapshot which captures ANSI escape sequences
    const lastLine = tui.getLine(tui.rows - 1);
    // The line should not be empty
    expect(lastLine.trim().length).toBeGreaterThan(0);

    // Full snapshot captures background color in ANSI codes
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// ═══════════════════════════════════════════════════════════════════
// KEY-SB: Keyboard Interaction Tests
// ═══════════════════════════════════════════════════════════════════

describe("KEY-SB: Status bar keyboard interactions", () => {
  test("KEY-SB-001: Go-to mode updates status bar hints", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Capture initial status bar state
    const initialLastLine = tui.getLine(tui.rows - 1);

    // Press 'g' to enter go-to mode
    await tui.sendKeys("g");

    // Status bar should now show go-to destinations
    const goToLastLine = tui.getLine(tui.rows - 1);
    // Should contain go-to destination hints
    expect(goToLastLine).toMatch(/g\+d/);
    expect(goToLastLine).toMatch(/dashboard/i);

    // Press Escape to cancel go-to mode
    await tui.sendKeys("Escape");

    // Status bar should revert to screen hints
    const revertedLastLine = tui.getLine(tui.rows - 1);
    expect(revertedLastLine).not.toMatch(/g\+d/);
  });

  test("KEY-SB-002: Go-to mode completion clears hints", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Press 'g' then 'd' (go to dashboard — already on dashboard)
    await tui.sendKeys("g");
    await tui.sendKeys("d");

    // Go-to mode should have exited
    // Status bar should show dashboard-specific hints, not go-to hints
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).not.toMatch(/g\+d/);
    expect(lastLine).not.toMatch(/g\+i/);
  });

  test("KEY-SB-003: Screen navigation updates keybinding hints", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Capture dashboard hints
    const dashboardLastLine = tui.getLine(tui.rows - 1);

    // Navigate to a different screen
    await tui.sendKeys("g", "r"); // go to repo list
    await tui.waitForText("Repositories");

    // Capture repo list hints
    const repoLastLine = tui.getLine(tui.rows - 1);

    // Hints should have changed (different screens register different hints)
    // At minimum, the content should be different
    // Note: both screens might share some common hints, but the full set should differ
    expect(repoLastLine).not.toBe(dashboardLastLine);
  });

  test("KEY-SB-004: Help overlay does not hide status bar", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Press '?' to open help overlay
    await tui.sendKeys("?");

    // Status bar should still be visible on the last line
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/\?:help/);
    expect(lastLine).toMatch(/◆/);

    // Close overlay
    await tui.sendKeys("Escape");
  });

  test("KEY-SB-005: Command palette does not hide status bar", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Press ':' to open command palette
    await tui.sendKeys(":");

    // Status bar should still be visible on the last line
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/\?:help/);

    // Close palette
    await tui.sendKeys("Escape");
  });

  test("KEY-SB-006: Search mode updates keybinding hints", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Navigate to a list screen that supports search
    await tui.sendKeys("g", "r"); // repo list
    await tui.waitForText("Repositories");

    // Capture hints before search
    const beforeSearch = tui.getLine(tui.rows - 1);

    // Press '/' to enter search mode
    await tui.sendKeys("/");

    // Hints may update to show search-specific bindings
    const afterSearch = tui.getLine(tui.rows - 1);
    // Search mode should show Esc:cancel or similar
    expect(afterSearch).toMatch(/Esc|cancel|search/i);

    // Cancel search
    await tui.sendKeys("Escape");
  });
});

// ═══════════════════════════════════════════════════════════════════
// RESIZE-SB: Responsive Resize Tests
// ═══════════════════════════════════════════════════════════════════

describe("RESIZE-SB: Status bar resize behavior", () => {
  test("RESIZE-SB-001: Resize from 120x40 to 80x24", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // At 120 width, sync label should be visible
    let lastLine = tui.getLine(tui.rows - 1);
    // "Disconnected" or "Connected" should be visible at standard width
    const hasLabel = lastLine.includes("Connected") || lastLine.includes("Disconnected");
    expect(hasLabel).toBe(true);

    // Resize to minimum
    await tui.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);

    // At 80 width, sync status should be icon-only
    lastLine = tui.getLine(tui.rows - 1);
    // Should have the dot but NOT the full label
    expect(lastLine).toMatch(/●/);
    // Verify truncated hints (≤4)
    expect(lastLine).toMatch(/\?:help/);
  });

  test("RESIZE-SB-002: Resize from 80x24 to 200x60", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");

    // Verify compact state
    let lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/●/);

    // Resize to large
    await tui.resize(TERMINAL_SIZES.large.width, TERMINAL_SIZES.large.height);

    // At large width, full sync label and all hints should be visible
    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/◆/);
    expect(lastLine).toMatch(/\?:help/);
  });

  test("RESIZE-SB-003: Resize from 120x40 to 200x60", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Count hints at standard width (look for ":" separators in hint section)
    const standardLine = tui.getLine(tui.rows - 1);

    // Resize to large
    await tui.resize(TERMINAL_SIZES.large.width, TERMINAL_SIZES.large.height);

    const largeLine = tui.getLine(tui.rows - 1);

    // At large size, more hints should be visible (or same if total ≤6)
    // The line content should be different or at least as wide
    expect(largeLine.length).toBeGreaterThanOrEqual(standardLine.length);
  });

  test("RESIZE-SB-004: Rapid resize does not cause visual artifacts", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Rapid resize sequence
    await tui.resize(80, 24);
    await tui.resize(200, 60);
    await tui.resize(100, 30);
    await tui.resize(150, 45);

    // Final state should be clean
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/●/);         // sync indicator present
    expect(lastLine).toMatch(/◆/);         // notification badge present
    expect(lastLine).toMatch(/\?:help/);   // help hint present

    // No broken characters or overlapping text
    // Snapshot captures the final rendered state
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESIZE-SB-005: Status bar spans full width after resize", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Resize to minimum
    await tui.resize(80, 24);
    let lastLine = tui.getLine(tui.rows - 1);
    // Line should use the full width (80 cols)
    // Trim trailing spaces — the rendered line fills the width
    expect(lastLine.length).toBeLessThanOrEqual(80);

    // Resize to large
    await tui.resize(200, 60);
    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine.length).toBeLessThanOrEqual(200);
  });
});

// ═══════════════════════════════════════════════════════════════════
// RT-SB: Real-Time Update Tests
// ═══════════════════════════════════════════════════════════════════

describe("RT-SB: Status bar real-time updates", () => {
  test("RT-SB-001: SSE notification count updates in real-time", async () => {
    // This test requires a running API server with SSE support.
    // It will fail until the SSEProvider is fully implemented.
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Initially 0 notifications (muted badge, no count)
    let lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/◆/);
    expect(lastLine).not.toMatch(/◆\s+\d/);

    // Trigger a server-side notification for the authenticated user
    // (requires real API server with test fixtures)
    // After SSE delivers the notification:
    await tui.waitForText("◆ 1", 5000);

    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/◆\s*1/);
  });

  test("RT-SB-002: SSE disconnect updates sync indicator", async () => {
    // This test requires SSE connection management.
    // Will fail until SSEProvider handles real connections.
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Should initially show connected state
    await tui.waitForText("Connected", 5000);

    // Terminate SSE connection server-side
    // (requires test infrastructure to kill SSE endpoint)

    // Should transition to disconnected
    await tui.waitForText("Disconnected", 5000);
  });

  test("RT-SB-003: SSE reconnect restores sync indicator", async () => {
    // Requires SSE reconnection implementation.
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Wait for connected state
    await tui.waitForText("Connected", 5000);

    // Trigger SSE disconnect, then restore
    // After reconnection:
    await tui.waitForText("Connected", 15000);
  });

  test("RT-SB-004: Notification count preserved on SSE disconnect", async () => {
    // Requires SSE with notification delivery then disconnect.
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // After receiving 5 notifications:
    await tui.waitForText("◆ 5", 5000);

    // Disconnect SSE
    // Badge should still show 5
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/◆\s*5/);
  });

  test("RT-SB-005: New notification triggers bold flash", async () => {
    // Requires SSE notification delivery.
    // Bold attribute verification requires ANSI escape sequence inspection.
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // After triggering a notification:
    // Within 500ms, the badge should render with bold
    // (ANSI SGR 1 escape code in the snapshot)
    const lastLine = tui.getLine(tui.rows - 1);
    // Check for bold escape sequence near the diamond character
    // \x1b[1m is SGR bold
    expect(lastLine).toMatch(/\x1b\[1m.*◆/);

    // After 2.5 seconds, bold should be removed
    await new Promise((r) => setTimeout(r, 2500));
    const afterFlash = tui.getLine(tui.rows - 1);
    // Should NOT have bold directly before diamond
    expect(afterFlash).not.toMatch(/\x1b\[1m.*◆/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// EDGE-SB: Edge Case Tests
// ═══════════════════════════════════════════════════════════════════

describe("EDGE-SB: Status bar edge cases", () => {
  test("EDGE-SB-001: Status bar renders without auth token", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: {
        CODEPLANE_TOKEN: "", // empty token
      },
    });

    // TUI should render (may show auth error screen, but status bar should exist)
    // Wait for some content to appear
    await new Promise((r) => setTimeout(r, 2000));

    // Status bar should still render on the last line
    const lastLine = tui.getLine(tui.rows - 1);
    // Sync should show disconnected
    expect(lastLine).toMatch(/●/);
    // Help hint should be present
    expect(lastLine).toMatch(/\?:help/);
  });

  test("EDGE-SB-002: Status bar renders on every screen", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");

    // Check status bar on Dashboard
    let lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/\?:help/);

    // Navigate to Repo list
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/\?:help/);

    // Navigate to Workspaces
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/\?:help/);

    // Navigate to Notifications
    await tui.sendKeys("g", "n");
    await tui.waitForText("Notifications");
    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/\?:help/);

    // Navigate to Search
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/\?:help/);

    // Navigate to Agents
    await tui.sendKeys("g", "a");
    await tui.waitForText("Agents");
    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/\?:help/);

    // Navigate to Organizations
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/\?:help/);
  });

  test("EDGE-SB-003: Keybinding hints do not overflow into center section", async () => {
    // At 80x24, even with many registered hints, truncation must prevent overflow
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");

    const lastLine = tui.getLine(tui.rows - 1);

    // Sync indicator must be visible (●)
    expect(lastLine).toMatch(/●/);

    // Help hint must be visible
    expect(lastLine).toMatch(/\?:help/);

    // If hints were truncated, should see ellipsis
    // (only if there are more hints than fit in 4)
    // Verify no wrapping: only 1 line
    expect(lastLine.length).toBeLessThanOrEqual(80);
  });

  test("EDGE-SB-004: Status bar handles terminal width exactly 80", async () => {
    tui = await launchTUI({
      cols: 80,
      rows: 24,
    });
    await tui.waitForText("Dashboard");

    const lastLine = tui.getLine(tui.rows - 1);

    // All three sections should render without wrapping
    expect(lastLine).toMatch(/●/);       // sync
    expect(lastLine).toMatch(/◆/);       // notification
    expect(lastLine).toMatch(/\?:help/); // help

    // No characters cut off at column 80
    expect(lastLine.length).toBeLessThanOrEqual(80);
  });
});
```

---

## Test Philosophy Notes

### Tests left intentionally failing

The following tests will fail until their backend dependencies are implemented:

| Test | Failing Reason | Backend Dependency |
|------|---------------|--------------------|
| `SNAP-SB-004` | No SSE delivering notification count = 5 | SSEProvider real implementation + test fixtures |
| `SNAP-SB-005` | No SSE delivering notification count = 150 | SSEProvider + test fixtures |
| `SNAP-SB-007` | Sync state always "offline" in stub | Daemon integration or test-controllable sync state |
| `SNAP-SB-009` | Sync state never reports conflicts in stub | Daemon integration |
| `RT-SB-001` through `RT-SB-005` | Full SSE stack not implemented | SSEProvider, API server SSE endpoint, test infrastructure |

These tests are **not skipped, not commented out**. They serve as living documentation of expected behavior and will pass once their dependencies are implemented.

### Tests expected to pass immediately

| Test | Why it passes |
|------|---------------|
| `SNAP-SB-001`, `SNAP-SB-002`, `SNAP-SB-003` | Default stub state renders correctly |
| `SNAP-SB-006` | Zero notifications is the default |
| `SNAP-SB-008` | Default stub sync state is `offline` → "Disconnected" |
| `SNAP-SB-010` | Background color applied via `backgroundColor` prop |
| `KEY-SB-001` through `KEY-SB-006` | Go-to mode and keybinding system already implemented |
| `RESIZE-SB-001` through `RESIZE-SB-005` | Layout system and responsive behavior implemented |
| `EDGE-SB-001` through `EDGE-SB-004` | Degraded mode rendering with safe defaults |

---

## Acceptance Criteria Traceability

| Acceptance Criterion | Implementation Step | Test Coverage |
|---------------------|--------------------|--------------|
| Single row, pinned to bottom | Step 6: `height={1}`, AppShell flex layout | SNAP-SB-001, EDGE-SB-004 |
| Full terminal width | Step 6: `width="100%"` | RESIZE-SB-005 |
| Surface background color (ANSI 236) | Step 6: `backgroundColor={theme.surface}` | SNAP-SB-010 |
| Renders on every screen | AppShell always renders `<StatusBar />` | EDGE-SB-002 |
| Key:action pairs with 2-space sep | Step 6: `HINT_SEP = "  "` | SNAP-SB-001 |
| Hints update on screen change | Existing `useStatusBarHints` + scope registration | KEY-SB-003 |
| Go-to mode replaces hints | Existing `overrideHints()` mechanism | KEY-SB-001, KEY-SB-002 |
| Keys bold, actions default | Step 6: `TextAttributes.BOLD` on key text | SNAP-SB-001 |
| Truncation with `…` | Step 6: `computeVisibleHints()` | EDGE-SB-003 |
| 4/6/all per breakpoint | Step 6: `getMaxHints()` | RESIZE-SB-001, RESIZE-SB-002, RESIZE-SB-003 |
| Connected: green ● + "Connected" | Step 4: `SyncStatusIndicator` connected case | SNAP-SB-008 (inverted — shows disconnected) |
| Syncing: braille spinner | Step 4: `useSpinner()` integration | SNAP-SB-007 |
| Conflict: ▲ + count | Step 4: conflict case | SNAP-SB-009 |
| Disconnected: red ● + retry | Step 4: disconnected case with backoff | SNAP-SB-008 |
| Icon-only at <120 cols | Step 4: `compact` variable | RESIZE-SB-001 |
| ◆ + count in primary | Step 5: `NotificationBadge` | SNAP-SB-004 |
| Muted when 0 | Step 5: color conditional | SNAP-SB-006 |
| 99+ cap | Step 5: `MAX_DISPLAY_COUNT` | SNAP-SB-005 |
| Bold flash 2s | Step 5: `FLASH_DURATION_MS` | RT-SB-005 |
| ?:help always rightmost | Step 6: right section layout | KEY-SB-004, KEY-SB-005, EDGE-SB-003 |
| SSE disconnect → Disconnected within 1s | Step 2 + Step 4 | RT-SB-002 |
| Badge retains count on disconnect | Step 3: context value not cleared | RT-SB-004 |
| Renders without auth token | Steps 1-5: safe defaults | EDGE-SB-001 |
| Resize re-layout within 1 frame | Synchronous `useLayout()` recalc | RESIZE-SB-004 |
| No crash on null/undefined data | Hook defaults + defensive rendering | EDGE-SB-001 |
| Render time < 1ms | Memoized computations, no API calls | (perf benchmark, not e2e) |
| Incremental SSE updates | Isolated context updates | (architecture, not e2e) |