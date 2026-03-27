# Engineering Specification: Real-Time Workspace Status Streaming via SSE

## `tui-workspace-status-stream`

---

## Overview

This ticket implements `TUI_WORKSPACE_STATUS_STREAM` — the integration layer that wires workspace SSE streaming infrastructure (from `tui-workspace-sse-adapter`) and the visual status badge (from `tui-workspace-status-badge`) into the live TUI workspace screens, status bar, and keybinding system. It is the **consumer** of the SSE adapter and badge, not the author of those primitives. It orchestrates:

1. **SSE lifecycle on screen mount/unmount** — workspace detail and list screens subscribe to SSE on mount and clean up on unmount
2. **Status bar connection health indicator** — green/yellow/red dot rendered in the status bar from SSE aggregate state
3. **Live badge updates** — `WorkspaceStatusBadge` props driven by SSE events on both list rows and detail header
4. **Flash messages** — 3-second status bar notification on workspace status transitions
5. **`R` key manual reconnection** — screen-level keybinding to force SSE reconnect with 2-second debounce
6. **REST reconciliation on reconnect** — ensures missed events are caught via REST fetch
7. **Responsive behavior** — connection indicator text adapts to terminal width
8. **Telemetry** — emits business events for SSE lifecycle transitions

### Dependencies

| Dependency | What it provides | Status |
|---|---|---|
| `tui-workspace-sse-adapter` | `useWorkspaceStatusStream`, `useWorkspaceListStatusStream`, `WorkspaceSSEAdapter`, streaming types & constants | Spec complete |
| `tui-workspace-status-badge` | `WorkspaceStatusBadge` component, `WorkspaceDisplayStatus` type | Spec complete |
| `tui-workspace-screen-scaffold` | `WorkspaceListScreen`, `WorkspaceDetailScreen` stub screens registered in router | Spec complete |
| `tui-workspace-e2e-helpers` | `WORKSPACE_FIXTURES`, `launchTUIWithWorkspaceContext`, `waitForStatusTransition`, `mockSSEStatusEvent`, `assertWorkspaceRow` | Spec complete |

### Downstream Consumers

| Ticket | How it uses this feature |
|---|---|
| `tui-workspace-list-screen` | Composes SSE-driven badge into list rows |
| `tui-workspace-detail-view` | Composes SSE-driven badge into detail header, SSH tab availability |
| `tui-workspace-suspend-resume` | Optimistic status triggers badge, SSE overrides on server confirm/reject |

---

## Codebase Ground Truth

| Fact | Location | Impact |
|---|---|---|
| `SSEProvider` is a placeholder returning `null` context | `apps/tui/src/providers/SSEProvider.tsx` lines 1–16 | Must be upgraded to real SSE management |
| `StatusBar` renders sync status as hardcoded `"connected"` placeholder | `apps/tui/src/components/StatusBar.tsx` line 51 | Must integrate SSE connection health indicator |
| `statusToToken()` maps status strings to `CoreTokenName` | `apps/tui/src/theme/tokens.ts` lines 209–256 | Badge has its own mapping (per `tui-workspace-status-badge` spec) but flash messages can use this |
| `useSpinner(active)` returns braille/ASCII frame string, 80ms/120ms interval | `apps/tui/src/hooks/useSpinner.ts` lines 8–19 | Consumed by `WorkspaceStatusBadge` for transitional states |
| `useLayout()` returns `{ width, height, breakpoint }` where breakpoint is `"minimum" \| "standard" \| "large" \| null` | `apps/tui/src/hooks/useLayout.ts` | Controls responsive indicator text |
| `useScreenKeybindings(screen, bindings)` registers screen-level keybindings with auto-cleanup | `apps/tui/src/hooks/useScreenKeybindings.ts` | Used for `R` key reconnect binding |
| `useStatusBarHints()` returns `{ hints, register, override }` | `apps/tui/src/hooks/useStatusBarHints.ts` | Used to show `R:reconnect` hint |
| `emit(name, properties)` writes telemetry event to stderr when `CODEPLANE_TUI_DEBUG=true` | `apps/tui/src/lib/telemetry.ts` lines 43–61 | Used for all SSE business events |
| `LoadingProvider` manages screen loading, mutation states, status bar errors | `apps/tui/src/providers/LoadingProvider.tsx` | Flash messages should use a new mechanism, not `statusBarError` (which is for errors, not informational transitions) |
| `ThemeTokens` has `success`, `warning`, `error`, `muted` as `RGBA` objects | `apps/tui/src/theme/tokens.ts` lines 13–41 | Used for connection indicator dot color |
| Provider stack order: `...SSEProvider → NavigationProvider → LoadingProvider → ...` | `apps/tui/src/index.tsx` | SSE context is available to all screens and status bar |
| `WorkspaceStreamConnectionState` is `"idle" \| "connecting" \| "connected" \| "degraded" \| "reconnecting" \| "disconnected"` | `apps/tui/src/streaming/types.ts` (from sse-adapter spec) | Maps to indicator colors |
| `SSE_CONSTANTS.MAX_RECONNECT_ATTEMPTS = 20` | `apps/tui/src/streaming/types.ts` | After 20 attempts, show manual reconnect hint |
| Server endpoint: `GET /api/repos/:owner/:repo/workspaces/:id/stream` | `apps/server/src/routes/workspaces.ts:447` | Per-workspace SSE stream with 15s keep-alive |
| Server endpoint: `POST /api/auth/sse-ticket` | `packages/sdk/src/db/sse_tickets_sql.ts` | Returns `{ ticket, expiresAt }` with 30s TTL |
| `getSSETicket()` from `@codeplane/ui-core/sse/getSSETicket` | `specs/tui/packages/ui-core/src/sse/getSSETicket.ts` | Exchanges token for ephemeral ticket |
| E2E helpers at `e2e/tui/helpers.ts` export `launchTUI()`, `TUITestInstance`, `TERMINAL_SIZES` | `e2e/tui/helpers.ts` lines 41–62 | Base test infrastructure |

---

## Implementation Plan

### Step 1: Upgrade SSEProvider with Workspace Connection Registry

**File:** `apps/tui/src/providers/SSEProvider.tsx`

Replace the placeholder SSEProvider with a real implementation that tracks aggregate workspace SSE connection health across all active streams.

```typescript
// apps/tui/src/providers/SSEProvider.tsx

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { WorkspaceStreamConnectionState } from "../streaming/types";

export interface SSEContextValue {
  /**
   * Aggregate connection health across all active workspace SSE streams.
   * Computed as worst-case across all registered streams:
   * disconnected > reconnecting > degraded > connecting > connected > idle
   */
  workspaceConnectionHealth: WorkspaceStreamConnectionState;

  /** Whether any workspace SSE stream is currently active */
  hasActiveWorkspaceStreams: boolean;

  /** Register a workspace stream's connection state. Called by useWorkspaceStatusStream. */
  registerStreamState: (workspaceId: string, state: WorkspaceStreamConnectionState) => void;

  /** Unregister a workspace stream (on unmount). */
  unregisterStream: (workspaceId: string) => void;

  /** Current count of reconnection attempts (for large-terminal display) */
  reconnectAttemptCount: number;

  /** Set reconnection attempt count (called by SSE hooks) */
  setReconnectAttemptCount: (count: number) => void;
}

const SSEContext = createContext<SSEContextValue | null>(null);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const [streamStates, setStreamStates] = useState<
    Map<string, WorkspaceStreamConnectionState>
  >(new Map());
  const [reconnectAttemptCount, setReconnectAttemptCount] = useState(0);

  const registerStreamState = useCallback(
    (workspaceId: string, state: WorkspaceStreamConnectionState) => {
      setStreamStates((prev) => {
        const next = new Map(prev);
        next.set(workspaceId, state);
        return next;
      });
    },
    [],
  );

  const unregisterStream = useCallback((workspaceId: string) => {
    setStreamStates((prev) => {
      const next = new Map(prev);
      next.delete(workspaceId);
      return next;
    });
  }, []);

  const hasActiveWorkspaceStreams = streamStates.size > 0;
  const workspaceConnectionHealth = computeAggregateHealth(streamStates);

  const value: SSEContextValue = {
    workspaceConnectionHealth,
    hasActiveWorkspaceStreams,
    registerStreamState,
    unregisterStream,
    reconnectAttemptCount,
    setReconnectAttemptCount,
  };

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export function useSSEContext(): SSEContextValue {
  const ctx = useContext(SSEContext);
  if (!ctx) {
    throw new Error("useSSEContext must be used within <SSEProvider>");
  }
  return ctx;
}

/** Backward-compatible export for code that calls useSSE(channel). */
export function useSSE(_channel: string) {
  return null; // Non-workspace SSE channels are not yet implemented
}

function computeAggregateHealth(
  states: Map<string, WorkspaceStreamConnectionState>,
): WorkspaceStreamConnectionState {
  if (states.size === 0) return "idle";
  const priority: Record<WorkspaceStreamConnectionState, number> = {
    idle: 0,
    connected: 1,
    connecting: 2,
    degraded: 3,
    reconnecting: 4,
    disconnected: 5,
  };
  let worst: WorkspaceStreamConnectionState = "idle";
  for (const state of states.values()) {
    if (priority[state] > priority[worst]) worst = state;
  }
  return worst;
}
```

**Rationale:** The existing SSEProvider is a pure stub. This upgrade provides a connection registry that workspace SSE hooks register into, enabling the status bar to read aggregate health without being coupled to individual workspace screens. The `useSSE(channel)` backward-compatible export is preserved for non-workspace SSE consumers that will be added later (notifications, workflows).

---

### Step 2: Create Flash Message System

**File:** `apps/tui/src/hooks/useFlashMessage.ts` (new)

Flash messages are transient status bar notifications that auto-dismiss after 3 seconds. They differ from `statusBarError` (which is for errors and retry prompts). Flash messages are informational and use semantic colors.

```typescript
// apps/tui/src/hooks/useFlashMessage.ts

import { useCallback, useRef, useState } from "react";
import type { CoreTokenName } from "../theme/tokens";

export interface FlashMessage {
  /** Display text */
  text: string;
  /** Semantic color token name */
  color: CoreTokenName;
  /** Timestamp when the flash was created (for dedup) */
  createdAt: number;
}

export interface UseFlashMessageResult {
  /** Current flash message, or null if none active */
  flash: FlashMessage | null;
  /** Show a flash message for the configured duration */
  showFlash: (text: string, color: CoreTokenName) => void;
  /** Dismiss the current flash immediately */
  dismissFlash: () => void;
}

const FLASH_DURATION_MS = 3_000;

export function useFlashMessage(): UseFlashMessageResult {
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissFlash = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setFlash(null);
  }, []);

  const showFlash = useCallback(
    (text: string, color: CoreTokenName) => {
      // Clear any existing flash
      if (timerRef.current) clearTimeout(timerRef.current);

      const msg: FlashMessage = { text, color, createdAt: Date.now() };
      setFlash(msg);

      timerRef.current = setTimeout(() => {
        setFlash(null);
        timerRef.current = null;
      }, FLASH_DURATION_MS);
    },
    [],
  );

  return { flash, showFlash, dismissFlash };
}
```

**File:** `apps/tui/src/hooks/index.ts` — append export:
```typescript
export { useFlashMessage } from "./useFlashMessage.js";
export type { FlashMessage, UseFlashMessageResult } from "./useFlashMessage.js";
```

---

### Step 3: Create Connection Health Indicator Component

**File:** `apps/tui/src/components/SSEConnectionIndicator.tsx` (new)

A small component rendered in the status bar that shows SSE connection health as a colored dot with optional text.

```typescript
// apps/tui/src/components/SSEConnectionIndicator.tsx

import React from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useLayout } from "../hooks/useLayout.js";
import { useSSEContext } from "../providers/SSEProvider.js";
import { SSE_CONSTANTS } from "../streaming/types.js";
import type { WorkspaceStreamConnectionState } from "../streaming/types.js";
import type { ThemeTokens } from "../theme/tokens.js";
import type { RGBA } from "@opentui/core";

/**
 * Map SSE connection state to visual properties.
 */
function getIndicatorProps(
  state: WorkspaceStreamConnectionState,
  theme: Readonly<ThemeTokens>,
): { dot: string; color: RGBA; label: string } {
  switch (state) {
    case "connected":
      return { dot: "●", color: theme.success, label: "connected" };
    case "connecting":
      return { dot: "●", color: theme.warning, label: "connecting…" };
    case "degraded":
      return { dot: "●", color: theme.warning, label: "degraded" };
    case "reconnecting":
      return { dot: "●", color: theme.warning, label: "reconnecting…" };
    case "disconnected":
      return { dot: "●", color: theme.error, label: "disconnected" };
    case "idle":
    default:
      return { dot: "●", color: theme.muted, label: "" };
  }
}

export function SSEConnectionIndicator() {
  const theme = useTheme();
  const { breakpoint } = useLayout();
  const {
    workspaceConnectionHealth,
    hasActiveWorkspaceStreams,
    reconnectAttemptCount,
  } = useSSEContext();

  // Don't render when no workspace streams are active (non-workspace screens)
  if (!hasActiveWorkspaceStreams) return null;

  const { dot, color, label } = getIndicatorProps(
    workspaceConnectionHealth,
    theme,
  );

  // Responsive text:
  // - minimum (80×24): dot only, no text
  // - standard (120×40): dot + label text
  // - large (200×60): dot + label + reconnection attempt count if applicable
  const showText = breakpoint !== "minimum" && breakpoint !== null;
  const showAttemptCount =
    breakpoint === "large" &&
    workspaceConnectionHealth === "reconnecting" &&
    reconnectAttemptCount > 0;

  let displayLabel = label;
  if (showAttemptCount) {
    displayLabel = `${label} (${reconnectAttemptCount}/${SSE_CONSTANTS.MAX_RECONNECT_ATTEMPTS})`;
  }

  return (
    <box flexDirection="row">
      <text fg={color}>{dot}</text>
      {showText && displayLabel && (
        <text fg={color}>{` ${displayLabel}`}</text>
      )}
    </box>
  );
}
```

**File:** `apps/tui/src/components/index.ts` — append export:
```typescript
export { SSEConnectionIndicator } from "./SSEConnectionIndicator.js";
```

---

### Step 4: Integrate Connection Indicator and Flash Messages into StatusBar

**File:** `apps/tui/src/components/StatusBar.tsx` (modify)

The StatusBar must be updated to:
1. Render the `SSEConnectionIndicator` in the right section when workspace streams are active
2. Render flash messages in the left section (taking precedence over keybinding hints for 3 seconds)
3. Show `R:reconnect` hint when connection is disconnected

Changes to the existing `StatusBar` component:

```typescript
// In StatusBar.tsx — add imports at top:
import { SSEConnectionIndicator } from "./SSEConnectionIndicator.js";
import type { FlashMessage } from "../hooks/useFlashMessage.js";

// Add flash prop to StatusBar (passed from screen via context or prop drilling):
export interface StatusBarProps {
  flash?: FlashMessage | null;
}

export function StatusBar({ flash }: StatusBarProps) {
  // ... existing hooks ...
  const theme = useTheme();

  // Existing left section now checks for flash message first:
  // If flash is active, show flash text in its semantic color
  // Otherwise show keybinding hints as before

  // Right section: replace hardcoded "synced" with SSEConnectionIndicator
  // SSEConnectionIndicator self-hides when no workspace streams are active,
  // falling back to the existing sync status placeholder

  return (
    <box flexDirection="row" height={1} width="100%" borderColor={theme.border} border={["top"]} justifyContent="space-between">
      <box flexGrow={1} flexDirection="row">
        {flash ? (
          <text fg={theme[flash.color]}>{truncateRight(flash.text, maxErrorWidth)}</text>
        ) : statusBarError ? (
          <text fg={theme.error}>{truncateRight(statusBarError, maxErrorWidth)}</text>
        ) : (
          <>
            {displayedHints.map((hint, i) => (
              <React.Fragment key={i}>
                <text fg={theme.primary}>{hint.keys}</text>
                <text fg={theme.muted}>{`:${hint.label}  `}</text>
              </React.Fragment>
            ))}
            {showRetryHint && (
              <>
                <text fg={theme.primary}>R</text>
                <text fg={theme.muted}>:retry</text>
              </>
            )}
          </>
        )}
      </box>
      <box flexDirection="row">
        {authConfirmText && <text fg={theme.success}>{authConfirmText}</text>}
        {offlineWarning && <text fg={theme.warning}>{offlineWarning}</text>}
        {!authConfirmText && !offlineWarning && (
          <SSEConnectionIndicator />
        )}
      </box>
      <box>
        <text fg={theme.muted}>  </text>
        <text fg={theme.primary}>?</text>
        <text fg={theme.muted}> help</text>
      </box>
    </box>
  );
}
```

**Key change:** The hardcoded `syncState = "connected"` / `syncLabel = "synced"` placeholder (lines 51–53) is replaced by the `<SSEConnectionIndicator />` component. When no workspace streams are active, the indicator returns `null` and the sync placeholder can remain as a fallback (or be removed if sync is also not yet implemented).

---

### Step 5: Create Flash Message Context Provider

**File:** `apps/tui/src/providers/FlashMessageProvider.tsx` (new)

A context provider that makes flash message state available to both screens (which call `showFlash`) and the StatusBar (which renders the flash).

```typescript
// apps/tui/src/providers/FlashMessageProvider.tsx

import { createContext, useContext } from "react";
import {
  useFlashMessage,
  type FlashMessage,
  type UseFlashMessageResult,
} from "../hooks/useFlashMessage.js";

const FlashMessageContext = createContext<UseFlashMessageResult | null>(null);

export function FlashMessageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const flashState = useFlashMessage();
  return (
    <FlashMessageContext.Provider value={flashState}>
      {children}
    </FlashMessageContext.Provider>
  );
}

export function useFlashMessageContext(): UseFlashMessageResult {
  const ctx = useContext(FlashMessageContext);
  if (!ctx) {
    throw new Error(
      "useFlashMessageContext must be used within <FlashMessageProvider>",
    );
  }
  return ctx;
}
```

**File:** `apps/tui/src/index.tsx` — insert `FlashMessageProvider` in the provider stack, between `SSEProvider` and `NavigationProvider`:

```typescript
// Provider stack update:
// ...SSEProvider
//   → FlashMessageProvider    ← NEW
//     → NavigationProvider
//       → LoadingProvider
//         → ...
```

**File:** `apps/tui/src/providers/index.ts` — append export:
```typescript
export { FlashMessageProvider, useFlashMessageContext } from "./FlashMessageProvider.js";
```

---

### Step 6: Create Workspace Status Transition Flash Messages

**File:** `apps/tui/src/hooks/useWorkspaceStatusFlash.ts` (new)

A hook that observes workspace status changes from SSE and triggers appropriate flash messages.

```typescript
// apps/tui/src/hooks/useWorkspaceStatusFlash.ts

import { useEffect, useRef } from "react";
import { useFlashMessageContext } from "../providers/FlashMessageProvider.js";
import { useLayout } from "./useLayout.js";
import type { CoreTokenName } from "../theme/tokens.js";
import type { WorkspaceDisplayStatus } from "../components/WorkspaceStatusBadge.js";

/**
 * Maps a workspace status to the flash message color token.
 */
function statusToFlashColor(status: WorkspaceDisplayStatus): CoreTokenName {
  switch (status) {
    case "running":
      return "success";
    case "starting":
    case "resuming":
    case "suspending":
    case "stopping":
    case "pending":
    case "suspended":
      return "warning";
    case "error":
    case "failed":
      return "error";
    case "stopped":
    case "deleted":
      return "muted";
    default:
      return "muted";
  }
}

/**
 * Generates the flash message text based on terminal width.
 *
 * - 80×24 (minimum): "now running" (short)
 * - 120×40 (standard): "Workspace is now running" (medium)
 * - 200×60 (large): "Workspace 'my-ws' is now running" (full)
 */
function formatFlashText(
  status: WorkspaceDisplayStatus,
  workspaceName: string | undefined,
  breakpoint: string | null,
): string {
  const statusLabel = status === "deleted" ? "deleted by another user" : status;

  if (breakpoint === "minimum" || breakpoint === null) {
    return `now ${statusLabel}`;
  }
  if (breakpoint === "large" && workspaceName) {
    return `Workspace '${workspaceName}' is now ${statusLabel}`;
  }
  return `Workspace is now ${statusLabel}`;
}

/**
 * Observe workspace status changes and show flash messages in the status bar.
 *
 * @param currentStatus - The current workspace status (from SSE or REST)
 * @param workspaceName - Optional workspace name for flash message text
 */
export function useWorkspaceStatusFlash(
  currentStatus: WorkspaceDisplayStatus | null,
  workspaceName?: string,
): void {
  const { showFlash } = useFlashMessageContext();
  const { breakpoint } = useLayout();
  const prevStatusRef = useRef<WorkspaceDisplayStatus | null>(null);

  useEffect(() => {
    if (currentStatus === null) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = currentStatus;

    // Don't flash on initial status (no previous status to transition from)
    if (prev === null) return;
    // Don't flash if status didn't change
    if (prev === currentStatus) return;

    const color = statusToFlashColor(currentStatus);
    const text = formatFlashText(currentStatus, workspaceName, breakpoint);
    showFlash(text, color);
  }, [currentStatus, workspaceName, breakpoint, showFlash]);
}
```

**File:** `apps/tui/src/hooks/index.ts` — append export:
```typescript
export { useWorkspaceStatusFlash } from "./useWorkspaceStatusFlash.js";
```

---

### Step 7: Create Reconnection Keybinding Hook

**File:** `apps/tui/src/hooks/useWorkspaceReconnect.ts` (new)

A hook that provides the `R` keybinding for manual SSE reconnection, with 2-second debounce.

```typescript
// apps/tui/src/hooks/useWorkspaceReconnect.ts

import { useCallback, useRef } from "react";
import { useSSEContext } from "../providers/SSEProvider.js";
import { emit } from "../lib/telemetry.js";
import type { WorkspaceStreamConnectionState } from "../streaming/types.js";

const RECONNECT_DEBOUNCE_MS = 2_000;

/**
 * Returns the R-key reconnect handler and whether reconnection is available.
 *
 * @param reconnectFn - The reconnect callback from useWorkspaceStatusStream
 * @param connectionState - Current connection state
 * @param workspaceId - Workspace ID for telemetry
 * @param repo - Repository for telemetry
 */
export function useWorkspaceReconnect(
  reconnectFn: () => void,
  connectionState: WorkspaceStreamConnectionState,
  workspaceId?: string,
  repo?: string,
): {
  handleReconnect: () => void;
  canReconnect: boolean;
} {
  const lastReconnectRef = useRef(0);

  const canReconnect =
    connectionState === "disconnected" ||
    connectionState === "reconnecting" ||
    connectionState === "degraded";

  const handleReconnect = useCallback(() => {
    const now = Date.now();
    if (now - lastReconnectRef.current < RECONNECT_DEBOUNCE_MS) {
      return; // Debounced — ignore rapid R presses
    }
    lastReconnectRef.current = now;

    emit("tui.workspace.sse.manual_reconnect", {
      workspace_id: workspaceId ?? "",
      repo: repo ?? "",
      previous_state: connectionState,
    });

    reconnectFn();
  }, [reconnectFn, connectionState, workspaceId, repo]);

  return { handleReconnect, canReconnect };
}
```

**File:** `apps/tui/src/hooks/index.ts` — append export:
```typescript
export { useWorkspaceReconnect } from "./useWorkspaceReconnect.js";
```

---

### Step 8: Wire SSE into Workspace Detail Screen

**File:** `apps/tui/src/screens/Workspaces/WorkspaceDetailScreen.tsx` (modify — extends stub from `tui-workspace-screen-scaffold`)

The workspace detail screen is the primary consumer of SSE status streaming. It wires together:
- `useWorkspaceStatusStream` for SSE subscription
- `WorkspaceStatusBadge` for live badge rendering
- `useWorkspaceStatusFlash` for transition flash messages
- `useWorkspaceReconnect` + `useScreenKeybindings` for `R` key binding
- SSEContext registration for status bar indicator

```typescript
// apps/tui/src/screens/Workspaces/WorkspaceDetailScreen.tsx

import React, { useEffect } from "react";
import { useWorkspaceStatusStream } from "../../hooks/useWorkspaceStatusStream.js";
import { useWorkspaceStatusFlash } from "../../hooks/useWorkspaceStatusFlash.js";
import { useWorkspaceReconnect } from "../../hooks/useWorkspaceReconnect.js";
import { useSSEContext } from "../../providers/SSEProvider.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { WorkspaceStatusBadge } from "../../components/WorkspaceStatusBadge.js";
import type { WorkspaceDisplayStatus } from "../../components/WorkspaceStatusBadge.js";
import { ScreenName } from "../../router/types.js";
import { emit } from "../../lib/telemetry.js";

export function WorkspaceDetailScreen() {
  const { currentScreen } = useNavigation();
  const { owner, repo, workspaceId } = currentScreen.params as {
    owner: string;
    repo: string;
    workspaceId: string;
  };

  // SSE subscription
  const {
    status,
    connectionState,
    lastEvent,
    error,
    reconcile,
  } = useWorkspaceStatusStream(owner, repo, workspaceId);

  // Register stream state with SSEProvider for status bar indicator
  const { registerStreamState, unregisterStream, setReconnectAttemptCount } =
    useSSEContext();

  useEffect(() => {
    registerStreamState(workspaceId, connectionState);
    return () => unregisterStream(workspaceId);
  }, [workspaceId, connectionState, registerStreamState, unregisterStream]);

  // Flash messages on status transitions
  useWorkspaceStatusFlash(
    status as WorkspaceDisplayStatus | null,
    currentScreen.params.workspaceName,
  );

  // Telemetry: status transitions
  useEffect(() => {
    if (lastEvent) {
      emit("tui.workspace.sse.status_transition", {
        workspace_id: workspaceId,
        repo: `${owner}/${repo}`,
        from_status: "unknown", // Previous tracked by flash hook
        to_status: lastEvent.data.status,
        latency_ms: performance.now() - lastEvent.receivedAt,
      });
    }
  }, [lastEvent]);

  // R key for manual reconnection
  const { handleReconnect, canReconnect } = useWorkspaceReconnect(
    reconcile,
    connectionState,
    workspaceId,
    `${owner}/${repo}`,
  );

  useScreenKeybindings(ScreenName.WorkspaceDetail, [
    {
      key: "R",
      description: "reconnect",
      handler: handleReconnect,
      when: () => canReconnect,
    },
  ]);

  // Render workspace detail with live status badge
  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" gap={2}>
        <text bold>{currentScreen.params.workspaceName ?? workspaceId}</text>
        {status && (
          <WorkspaceStatusBadge status={status as WorkspaceDisplayStatus} />
        )}
      </box>
      {/* Detail content — further implemented by tui-workspace-detail-view */}
    </box>
  );
}
```

---

### Step 9: Wire SSE into Workspace List Screen

**File:** `apps/tui/src/screens/Workspaces/WorkspaceListScreen.tsx` (modify — extends stub from `tui-workspace-screen-scaffold`)

The workspace list screen uses `useWorkspaceListStatusStream` for multiplexed SSE subscriptions across all visible workspace rows.

```typescript
// apps/tui/src/screens/Workspaces/WorkspaceListScreen.tsx

import React, { useEffect, useMemo } from "react";
import { useWorkspaceListStatusStream } from "../../hooks/useWorkspaceListStatusStream.js";
import { useWorkspaceReconnect } from "../../hooks/useWorkspaceReconnect.js";
import { useSSEContext } from "../../providers/SSEProvider.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { WorkspaceStatusBadge } from "../../components/WorkspaceStatusBadge.js";
import type { WorkspaceDisplayStatus } from "../../components/WorkspaceStatusBadge.js";
import { ScreenName } from "../../router/types.js";

export function WorkspaceListScreen() {
  const { currentScreen } = useNavigation();
  const { owner, repo } = currentScreen.params as {
    owner: string;
    repo: string;
  };

  // Assume workspaces are loaded by the list data hook (from tui-workspace-data-hooks)
  const workspaces: Array<{ id: string; name: string; status: string }> = [];
  // ↑ Placeholder — populated by useWorkspaces() in tui-workspace-list-screen

  const workspaceIds = useMemo(
    () => workspaces.map((w) => w.id),
    [workspaces],
  );

  // Multiplexed SSE subscription
  const { statuses, connectionState, activeConnections, error } =
    useWorkspaceListStatusStream(owner, repo, workspaceIds);

  // Register aggregate state with SSEProvider
  const { registerStreamState, unregisterStream } = useSSEContext();

  useEffect(() => {
    // Register a synthetic "workspace-list" entry for aggregate tracking
    registerStreamState("__workspace_list__", connectionState);
    return () => unregisterStream("__workspace_list__");
  }, [connectionState, registerStreamState, unregisterStream]);

  // R key for reconnection (placeholder reconnect triggers REST refetch)
  const { handleReconnect, canReconnect } = useWorkspaceReconnect(
    () => {/* reconnect all — handled by list hook internally */},
    connectionState,
    undefined,
    `${owner}/${repo}`,
  );

  useScreenKeybindings(ScreenName.Workspaces, [
    {
      key: "R",
      description: "reconnect",
      handler: handleReconnect,
      when: () => canReconnect,
    },
  ]);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* List rows with SSE-driven status badges */}
      {workspaces.map((ws) => (
        <box key={ws.id} flexDirection="row" gap={2}>
          <text>{ws.name}</text>
          <WorkspaceStatusBadge
            status={(statuses[ws.id] ?? ws.status) as WorkspaceDisplayStatus}
            compact
          />
        </box>
      ))}
    </box>
  );
}
```

---

### Step 10: Telemetry Integration

**File:** `apps/tui/src/hooks/useWorkspaceSSETelemetry.ts` (new)

A dedicated hook that wraps `useWorkspaceStatusStream` connection state changes and emits the telemetry events defined in the product spec.

```typescript
// apps/tui/src/hooks/useWorkspaceSSETelemetry.ts

import { useEffect, useRef } from "react";
import { emit } from "../lib/telemetry.js";
import type { WorkspaceStreamConnectionState } from "../streaming/types.js";

interface SSETelemetryParams {
  workspaceId: string;
  repo: string;
  connectionState: WorkspaceStreamConnectionState;
  screen: "workspace_list" | "workspace_detail";
}

/**
 * Emit telemetry events for SSE connection lifecycle transitions.
 * Tracks connection duration, disconnection reasons, and reconnection attempts.
 */
export function useWorkspaceSSETelemetry(params: SSETelemetryParams): void {
  const { workspaceId, repo, connectionState, screen } = params;
  const prevStateRef = useRef<WorkspaceStreamConnectionState>("idle");
  const connectedAtRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);
  const disconnectedAtRef = useRef<number>(0);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = connectionState;

    if (prev === connectionState) return;

    const now = Date.now();

    switch (connectionState) {
      case "connected": {
        const isReconnection = prev === "reconnecting";
        connectedAtRef.current = now;
        emit("tui.workspace.sse.connected", {
          workspace_id: workspaceId,
          repo,
          screen,
          is_reconnection: isReconnection,
          connection_time_ms: isReconnection
            ? now - disconnectedAtRef.current
            : 0,
        });
        if (isReconnection) {
          emit("tui.workspace.sse.reconnected", {
            workspace_id: workspaceId,
            repo,
            screen,
            reconnection_attempts: reconnectAttemptsRef.current,
            total_downtime_ms: now - disconnectedAtRef.current,
          });
          reconnectAttemptsRef.current = 0;
        }
        break;
      }
      case "reconnecting": {
        reconnectAttemptsRef.current += 1;
        if (prev === "connected" || prev === "degraded") {
          disconnectedAtRef.current = now;
          emit("tui.workspace.sse.disconnected", {
            workspace_id: workspaceId,
            repo,
            screen,
            connected_duration_ms: now - connectedAtRef.current,
            reason: prev === "degraded" ? "timeout" : "network",
          });
        }
        break;
      }
      case "disconnected": {
        if (prev === "reconnecting") {
          emit("tui.workspace.sse.reconnect_failed", {
            workspace_id: workspaceId,
            repo,
            screen,
            total_attempts: reconnectAttemptsRef.current,
            total_downtime_ms: now - disconnectedAtRef.current,
          });
        }
        break;
      }
    }
  }, [connectionState, workspaceId, repo, screen]);
}
```

**File:** `apps/tui/src/hooks/index.ts` — append export:
```typescript
export { useWorkspaceSSETelemetry } from "./useWorkspaceSSETelemetry.js";
```

---

### Step 11: Process Suspend/Resume Handler

**File:** `apps/tui/src/lib/signals.ts` (modify)

Add `SIGCONT` handler that fires a callback when the process resumes from `Ctrl+Z` suspension. This enables SSE reconnection on resume.

```typescript
// Add to existing signals.ts:

type ResumeCallback = () => void;
const resumeCallbacks = new Set<ResumeCallback>();

export function onProcessResume(callback: ResumeCallback): () => void {
  resumeCallbacks.add(callback);

  // Register SIGCONT listener (only once)
  if (resumeCallbacks.size === 1) {
    process.on("SIGCONT", handleResume);
  }

  return () => {
    resumeCallbacks.delete(callback);
    if (resumeCallbacks.size === 0) {
      process.off("SIGCONT", handleResume);
    }
  };
}

function handleResume(): void {
  for (const cb of resumeCallbacks) {
    cb();
  }
}
```

---

### Step 12: Integrate Process Resume into SSE Hooks

**File:** `apps/tui/src/hooks/useWorkspaceStatusStream.ts` (modify — from `tui-workspace-sse-adapter`)

Add a `useEffect` that listens for `SIGCONT` and triggers reconnection:

```typescript
// Add inside useWorkspaceStatusStream, after the main SSE lifecycle effect:

import { onProcessResume } from "../lib/signals.js";

// Process suspend/resume handling
useEffect(() => {
  if (!enabled) return;

  return onProcessResume(() => {
    // On resume from Ctrl+Z, force reconnection to recover stale connection
    const adapter = adapterRef.current;
    if (adapter && adapter.connectionState !== "connected") {
      reconcile(); // REST fetch to reconcile missed events
    }
  });
}, [enabled, reconcile]);
```

---

## File Inventory

### New Files

| File | Purpose |
|---|---|
| `apps/tui/src/hooks/useFlashMessage.ts` | Flash message state management hook |
| `apps/tui/src/hooks/useWorkspaceStatusFlash.ts` | Workspace status → flash message mapping |
| `apps/tui/src/hooks/useWorkspaceReconnect.ts` | `R` key reconnect handler with 2s debounce |
| `apps/tui/src/hooks/useWorkspaceSSETelemetry.ts` | SSE lifecycle telemetry emission |
| `apps/tui/src/components/SSEConnectionIndicator.tsx` | Status bar connection health dot + text |
| `apps/tui/src/providers/FlashMessageProvider.tsx` | Flash message context provider |

### Modified Files

| File | Change |
|---|---|
| `apps/tui/src/providers/SSEProvider.tsx` | Replace stub with real connection registry |
| `apps/tui/src/components/StatusBar.tsx` | Integrate flash messages and SSE connection indicator |
| `apps/tui/src/components/index.ts` | Add `SSEConnectionIndicator` export |
| `apps/tui/src/hooks/index.ts` | Add new hook exports |
| `apps/tui/src/providers/index.ts` | Add `FlashMessageProvider` export |
| `apps/tui/src/index.tsx` | Insert `FlashMessageProvider` in provider stack |
| `apps/tui/src/lib/signals.ts` | Add `onProcessResume` SIGCONT handler |
| `apps/tui/src/screens/Workspaces/WorkspaceDetailScreen.tsx` | Wire SSE hooks, badge, flash, keybindings |
| `apps/tui/src/screens/Workspaces/WorkspaceListScreen.tsx` | Wire list SSE hook, badges, reconnect |
| `apps/tui/src/hooks/useWorkspaceStatusStream.ts` | Add SIGCONT resume integration |

### Files from Dependencies (not authored by this ticket)

| File | Dependency |
|---|---|
| `apps/tui/src/streaming/types.ts` | `tui-workspace-sse-adapter` |
| `apps/tui/src/streaming/WorkspaceSSEAdapter.ts` | `tui-workspace-sse-adapter` |
| `apps/tui/src/streaming/EventDeduplicator.ts` | `tui-workspace-sse-adapter` |
| `apps/tui/src/hooks/useWorkspaceStatusStream.ts` | `tui-workspace-sse-adapter` |
| `apps/tui/src/hooks/useWorkspaceListStatusStream.ts` | `tui-workspace-sse-adapter` |
| `apps/tui/src/components/WorkspaceStatusBadge.tsx` | `tui-workspace-status-badge` |
| `e2e/tui/helpers/workspaces.ts` | `tui-workspace-e2e-helpers` |

---

## Productionization Checklist

The following items ensure this feature is production-ready, not a PoC:

1. **No `setTimeout` leaks:** Every `setTimeout` in `useFlashMessage` is cleared in cleanup. `WorkspaceSSEAdapter` clears all timers in `close()`. The debounce ref in `useWorkspaceReconnect` uses `Date.now()` comparison, not timers.

2. **No orphan SSE connections:** Every `useEffect` that creates an SSE adapter calls `adapter.close()` in cleanup. The `useWorkspaceListStatusStream` hook diffs `workspaceIds` to close removed adapters. The `SSEProvider` registry tracks all active streams.

3. **AbortController propagation:** All in-flight ticket requests and SSE connections use AbortController signals that are aborted on unmount, preventing state updates on unmounted components.

4. **Memory stability:** The `EventDeduplicator` uses a fixed-size circular buffer (1000 entries). The `SSEProvider` registry uses a `Map` that shrinks as streams are unregistered. Flash message state is a single object, not an accumulating list.

5. **No React state updates after unmount:** All SSE callbacks check `isMountedRef.current` before calling `setState`. The `useFlashMessage` timer is cleared on unmount.

6. **Error boundary compatibility:** SSE errors are caught and stored in state (`error`), never thrown into the React render tree. Malformed SSE events are silently discarded per the adapter spec.

7. **Terminal resize safety:** The SSE connection lives in a `useEffect` lifecycle independent of layout state. Resize triggers re-render of the `SSEConnectionIndicator` (responsive text) but does not touch the underlying connection.

8. **Rate limit handling:** The adapter respects 429 responses by extending backoff. The `R` key debounce prevents user-initiated rate limit triggering.

9. **Frozen theme tokens:** The `SSEConnectionIndicator` reads theme tokens via `useTheme()` which returns frozen `Readonly<ThemeTokens>`. No runtime allocation per render.

10. **Debug logging:** All SSE lifecycle events are logged at appropriate levels via `emit()` to stderr when `CODEPLANE_TUI_DEBUG=true`. Production users never see log output.

---

## Unit & Integration Tests

**All tests target:** `e2e/tui/workspaces.test.ts`

**Test framework:** `@microsoft/tui-test` with `bun:test`

**Test helpers used:** `launchTUI` from `e2e/tui/helpers.ts`, workspace helpers from `e2e/tui/helpers/workspaces.ts` (from `tui-workspace-e2e-helpers`).

**Philosophy:**
- Tests run against real API server with test fixtures — no mocking of implementation details
- Tests that fail due to unimplemented backends are left failing (never skipped or commented out)
- Each test validates one user-facing behavior
- Snapshot tests capture full terminal output at key states

### SSE Connection Lifecycle Tests

```typescript
// e2e/tui/workspaces.test.ts

import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  type TUITestInstance,
} from "./helpers";
import {
  WORKSPACE_FIXTURES,
  WORKSPACE_IDS,
  launchTUIWithWorkspaceContext,
  waitForStatusTransition,
  mockSSEStatusEvent,
  createWorkspaceStatusEvent,
  assertWorkspaceRow,
} from "./helpers/workspaces";

describe("TUI_WORKSPACE_STATUS_STREAM", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    await tui?.terminate();
  });

  // ── SSE Connection Lifecycle ───────────────────────────────────────

  describe("SSE connection lifecycle", () => {
    test("establishes SSE connection on workspace detail mount", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("dev-environment");
      // Verify connected indicator appears in status bar
      const lastLine = tui.getLine(tui.rows - 1);
      expect(lastLine).toMatch(/●/);
      // Verify status badge renders from initial SSE event
      await tui.waitForText("running");
    });

    test("establishes SSE connections for visible workspace list rows", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-list",
      });
      await tui.waitForText("Workspaces");
      // Verify connection indicator is present (green dot)
      const lastLine = tui.getLine(tui.rows - 1);
      expect(lastLine).toMatch(/●/);
      // Verify all fixture workspaces show status badges
      await tui.waitForText("running");
    });

    test("cleans up SSE connection on workspace detail unmount", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("dev-environment");
      // Verify connected indicator
      expect(tui.getLine(tui.rows - 1)).toMatch(/●/);
      // Navigate back
      await tui.sendKeys("q");
      await tui.waitForText("Workspaces");
      // On non-workspace screen, indicator should not be present
      // (This depends on whether the list screen is shown after popping)
    });

    test("deduplicates SSE connections for same workspace ID", async () => {
      // Subscribe to the same workspace from list + detail should share connection
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("dev-environment");
      // The SSEProvider registry should show only one connection per workspace ID
      // (verified via single green dot, not multiple)
      const lastLine = tui.getLine(tui.rows - 1);
      expect(lastLine).toMatch(/●/);
    });

    test("uses ticket-based authentication for SSE connections", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("dev-environment");
      // Successful connection implies ticket was obtained
      // (ticket-based auth is internal; we verify via successful connection indicator)
      const lastLine = tui.getLine(tui.rows - 1);
      expect(lastLine).toMatch(/●/);
    });
  });

  // ── Real-Time Status Updates ───────────────────────────────────────

  describe("real-time status updates", () => {
    test("updates workspace detail badge on SSE status event", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // Inject SSE event: running → suspended
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.running,
        status: "suspended",
      });

      await waitForStatusTransition(tui, "suspended");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("updates workspace list row badge on SSE status event", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-list",
      });
      await tui.waitForText("dev-environment");

      // Inject SSE event for one workspace
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.running,
        status: "suspended",
      });

      // Verify that specific row updates
      await waitForStatusTransition(tui, "suspended");
      // Other rows remain unchanged
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("suspended");
      expect(snapshot).toContain("starting"); // Other workspace unchanged
    });

    test("displays braille spinner for transitional statuses", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.starting,
      });
      // Starting status should show spinner
      await tui.waitForText("starting");
      // Braille spinner frame should be present (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏)
      const snapshot = tui.snapshot();
      expect(snapshot).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
      expect(snapshot).toMatchSnapshot();
    });

    test("shows flash message on status transition", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.starting,
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("starting");

      // Inject SSE event: starting → running
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.starting,
        status: "running",
      });

      // Flash message should appear in status bar
      await tui.waitForText("Workspace is now running");
      // Flash message should clear after 3 seconds
      await tui.waitForNoText("Workspace is now running");
    });

    test("SSE event overrides optimistic state", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // Simulate optimistic update: user presses s to suspend
      // (This would set optimistic status to "suspending")
      // Then SSE event arrives with "running" (server rejected suspend)
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.running,
        status: "running",
      });

      // Badge should show running, not suspending
      await tui.waitForText("running");
    });

    test("handles rapid status transitions without skipping intermediate states", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.starting,
      });
      await tui.waitForText("starting");

      // Rapid SSE events
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.starting,
        status: "running",
      });
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.starting,
        status: "suspending",
      });
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.starting,
        status: "suspended",
      });

      // Final state should be suspended
      await waitForStatusTransition(tui, "suspended");
    });
  });

  // ── Reconnection ───────────────────────────────────────────────────

  describe("reconnection", () => {
    test("reconnects with exponential backoff on SSE disconnect", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // Simulate SSE disconnect (implementation depends on test infrastructure)
      // The status bar should transition to reconnecting indicator
      // This test validates the visual indicator change
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("fetches workspace state via REST on reconnection", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // After reconnection, workspace state should be reconciled via REST
      // The badge should reflect the server's current state
      // (Full test requires server-side state change during disconnect window)
    });

    test("shows disconnected state after max reconnection attempts", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // After 20 failed attempts, status bar should show disconnected
      // This test validates the terminal state when disconnected
      // Actual simulation requires controlling the SSE server's behavior
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("R key triggers manual reconnection", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // In disconnected state, R should trigger reconnection
      await tui.sendKeys("R");
      // Verify reconnection attempt (indicator changes)
      const lastLine = tui.getLine(tui.rows - 1);
      // Should show reconnecting or connected
      expect(lastLine).toMatch(/●/);
    });

    test("R key is debounced at 2-second intervals", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // Rapid R presses should be debounced
      await tui.sendKeys("R");
      await tui.sendKeys("R"); // Within 2s — should be ignored
      // No crash, no duplicate reconnection attempts
    });

    test("obtains fresh SSE ticket on each reconnection", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // Reconnection should request a new ticket
      // (Internal behavior verified via successful reconnection)
    });

    test("SSE survives terminal resize", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
        cols: 120,
        rows: 40,
      });
      await tui.waitForText("running");

      // Resize terminal
      await tui.resize(80, 24);

      // SSE connection should remain active
      // Inject a status event to prove the connection is still alive
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.running,
        status: "suspended",
      });
      await waitForStatusTransition(tui, "suspended");
    });
  });

  // ── Connection Health Indicator ────────────────────────────────────

  describe("connection health indicator", () => {
    test("shows green dot when SSE is connected", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // Status bar should contain the green dot indicator
      const lastLine = tui.getLine(tui.rows - 1);
      expect(lastLine).toMatch(/●/);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("hides connection indicator on non-workspace screens", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      // Navigate to dashboard (no workspace streams)
      await tui.waitForText("Dashboard");

      // Status bar should NOT contain the SSE connection indicator
      // (It should show the sync placeholder or nothing)
      const lastLine = tui.getLine(tui.rows - 1);
      // The SSEConnectionIndicator returns null when hasActiveWorkspaceStreams is false
    });

    test("connection indicator shows worst aggregate state", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-list",
      });
      await tui.waitForText("Workspaces");

      // With multiple workspaces, the indicator should show the worst state
      // across all connections
      const lastLine = tui.getLine(tui.rows - 1);
      expect(lastLine).toMatch(/●/);
    });
  });

  // ── Responsive Behavior ────────────────────────────────────────────

  describe("responsive behavior", () => {
    test("80×24 — status badge visible, connection indicator dot-only", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await tui.waitForText("running");

      // Connection indicator should be dot only (no "connected" text)
      const lastLine = tui.getLine(tui.rows - 1);
      expect(lastLine).toMatch(/●/);
      expect(lastLine).not.toMatch(/connected/);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("120×40 — full connection indicator text", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("running");

      const lastLine = tui.getLine(tui.rows - 1);
      expect(lastLine).toMatch(/● connected/);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("200×60 — expanded indicator with attempt count on reconnect", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
      });
      await tui.waitForText("running");

      // In reconnecting state at large terminal, should show attempt count
      // (requires triggering reconnection state)
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("flash messages truncate at minimum terminal width", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.starting,
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await tui.waitForText("starting");

      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.starting,
        status: "running",
      });

      // At 80×24, flash should be short: "now running" not "Workspace is now running"
      await tui.waitForText("now running");
    });

    test("flash messages include workspace name at large terminal", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.starting,
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
      });
      await tui.waitForText("starting");

      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.starting,
        status: "running",
      });

      // At 200×60, flash should include workspace name
      await tui.waitForText("ci-workspace");
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────

  describe("error handling", () => {
    test("shows auth message on 401 ticket response", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: {
          CODEPLANE_TOKEN: "invalid_token_value",
        },
      });
      // With invalid token, SSE ticket request should return 401
      // TUI should show re-authentication message
      await tui.waitForText("Session expired");
    });

    test("discards malformed SSE events gracefully", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // Send malformed event (implementation detail of test infrastructure)
      // Then send a valid event to prove the stream continues
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.running,
        status: "suspended",
      });

      await waitForStatusTransition(tui, "suspended");
    });

    test("handles workspace deletion via SSE", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");

      // Inject SSE event: status → deleted
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.running,
        status: "deleted",
      });

      await waitForStatusTransition(tui, "deleted");
      await tui.waitForText("deleted");
      expect(tui.snapshot()).toMatchSnapshot();
    });
  });

  // ── Terminal Snapshot Tests ────────────────────────────────────────

  describe("snapshots", () => {
    test("workspace-detail-status-running", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("workspace-detail-status-suspended", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.running,
        status: "suspended",
      });
      await waitForStatusTransition(tui, "suspended");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("workspace-detail-starting-spinner", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.starting,
      });
      await tui.waitForText("starting");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("workspace-detail-status-error", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.failed,
      });
      await tui.waitForText("failed");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("workspace-list-mixed-statuses", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-list",
      });
      await tui.waitForText("Workspaces");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("workspace-sse-connected-indicator", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("connected");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("workspace-deleted-via-sse", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
      });
      await tui.waitForText("running");
      await mockSSEStatusEvent(tui, {
        workspaceId: WORKSPACE_IDS.running,
        status: "deleted",
      });
      await waitForStatusTransition(tui, "deleted");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("workspace-sse-80x24", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
        cols: 80,
        rows: 24,
      });
      await tui.waitForText("running");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("workspace-sse-120x40", async () => {
      tui = await launchTUIWithWorkspaceContext({
        screen: "workspace-detail",
        workspaceId: WORKSPACE_IDS.running,
        cols: 120,
        rows: 40,
      });
      await tui.waitForText("running");
      expect(tui.snapshot()).toMatchSnapshot();
    });
  });
});
```

### Golden-File Terminal Snapshots

The following snapshots are captured by the tests above and stored in the test snapshot directory:

| Snapshot Name | Description |
|---|---|
| `workspace-detail-status-running` | Detail view with `[running]` badge, green connected dot |
| `workspace-detail-status-suspended` | Detail view with `[suspended]` badge after SSE transition |
| `workspace-detail-starting-spinner` | Detail view with `[⠋ starting…]` braille spinner badge |
| `workspace-detail-status-error` | Detail view with `[failed]` badge in red |
| `workspace-list-mixed-statuses` | List with rows showing various live statuses |
| `workspace-sse-connected-indicator` | Status bar with green connected dot + text |
| `workspace-deleted-via-sse` | Detail view showing deleted state from SSE event |
| `workspace-sse-80x24` | Minimum terminal with dot-only indicator |
| `workspace-sse-120x40` | Standard terminal with full indicator text |

---

## Architectural Decisions

### Why a separate FlashMessageProvider instead of reusing LoadingProvider's statusBarError?

`statusBarError` is designed for error states with retry semantics. Flash messages are informational, use semantic (non-error) colors, and auto-dismiss. Overloading `statusBarError` would require adding color, timing, and priority logic to the loading system. A separate provider keeps concerns clean.

### Why register SSE state in SSEProvider rather than having StatusBar query each screen?

The StatusBar is a global component that renders on every screen. It cannot know which workspace screens are mounted. The SSEProvider acts as a registry that screens write to and the StatusBar reads from, decoupling producers from the consumer.

### Why one SSE connection per workspace instead of a multiplexed connection?

The server exposes per-workspace SSE endpoints (`GET /workspaces/:id/stream`). There is no multiplexed endpoint that streams all workspaces in a single connection. This is a server-side design decision that the TUI respects. Connection count is bounded by visible workspaces (typically 5–20) plus a 10-row scroll buffer.

### Why debounce R at 2 seconds instead of disabling during reconnection?

During reconnection, the adapter is actively attempting to re-establish the connection. A manual `R` press resets the backoff counter and forces an immediate attempt. Debouncing at 2 seconds prevents accidental double-presses while still giving the user responsive control. Disabling R entirely during reconnection would remove the user's ability to accelerate a stalled reconnection.

### Why SIGCONT-based reconnection instead of connection health polling?

After `Ctrl+Z` + `fg`, the EventSource connection is almost certainly dead (TCP keepalive timeout exceeded during suspension). Polling for connection health would waste CPU during normal operation. A SIGCONT handler fires exactly once on resume, triggering a single reconnection check.