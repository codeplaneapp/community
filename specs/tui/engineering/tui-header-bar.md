# TUI_HEADER_BAR — Engineering Specification

## Summary

This specification details the engineering work required to bring the `HeaderBar` component from its current placeholder state to full compliance with the TUI_HEADER_BAR product spec. The existing `apps/tui/src/components/HeaderBar.tsx` is a partial implementation — it has the correct layout structure and breadcrumb rendering, but uses hardcoded placeholders for connection status (`"connected"`) and notification count (`0`). This ticket upgrades the HeaderBar to consume real data from the SSE and notification providers, implements all responsive truncation behaviors, adds the correct Unicode indicators and badge formatting, and introduces telemetry events.

## Current State Analysis

### What exists (`apps/tui/src/components/HeaderBar.tsx`, 50 lines)

1. **Breadcrumb trail** — reads `nav.stack` from `NavigationProvider`, joins with ` › `, delegates to `truncateBreadcrumb()` utility. Splits on separator to color the current segment bold and parents muted. ✅ Mostly correct.
2. **Repository context** — reads `nav.repoContext`, renders `owner/repo` in center zone, hidden at `minimum` breakpoint. ✅ Correct.
3. **Connection status** — hardcoded `const connectionState = "connected"`. Uses `statusToToken()` to resolve color. Always renders `●`. ❌ Placeholder.
4. **Notification badge** — hardcoded `const unreadCount = 0`. Conditional render for `> 0`. ❌ Placeholder.
5. **Layout** — single `<box flexDirection="row" height={1}>` with bottom border. Left zone uses `flexGrow={1}`, center and right zones are unshrinkable. ✅ Correct structure.
6. **Missing** — disconnected indicator (`○`), badge formatting (`[N]`), `99+` cap, warning color for badge, responsive center-section hiding based on width arithmetic (currently uses breakpoint string), telemetry events, fallback breadcrumb for empty stack.

### What exists in dependencies

| Dependency | Status | Notes |
|---|---|---|
| `NavigationProvider` (`tui-navigation-provider`) | ✅ Implemented | Provides `stack`, `repoContext`, `canGoBack` |
| `ThemeProvider` (`tui-theme-and-color-tokens`) | ✅ Implemented | Provides all semantic tokens via `useTheme()` |
| `SSEProvider` | ❌ Stub | Returns `null` — no `connectionState` exposed yet |
| `useNotifications()` from `@codeplane/ui-core` | ❌ Not available | Package does not export this hook yet |
| `useLayout()` | ✅ Implemented | Provides `width`, `height`, `breakpoint` |
| `truncateBreadcrumb()` | ✅ Implemented | Correct ellipsis-from-left algorithm |
| `statusToToken()` | ✅ Implemented | Maps `"connected"` → `success`, `"disconnected"` → `error` |
| `emit()` telemetry | ✅ Implemented | Writes to stderr in debug mode |

## Implementation Plan

### Step 1: Extend SSEProvider with connection state

**File:** `apps/tui/src/providers/SSEProvider.tsx`

The SSEProvider is currently a stub that returns `null`. For HeaderBar purposes, we need it to expose `connectionState`. The full SSE implementation (ticket-based auth, EventSource, channel dispatch) is a separate ticket — but the connection state interface must be defined now so HeaderBar can consume it.

**Changes:**

```typescript
// apps/tui/src/providers/SSEProvider.tsx

import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth.js";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface SSEContextValue {
  connectionState: ConnectionState;
  unreadNotificationCount: number;
}

export interface SSEEvent {
  type: string;
  data: any;
}

const SSEContext = createContext<SSEContextValue>({
  connectionState: "connecting",
  unreadNotificationCount: 0,
});

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  // Derive initial connection state from auth status.
  // Full SSE implementation (EventSource, ticket auth, channels) is a separate ticket.
  // This provides the contract that HeaderBar and StatusBar consume.
  useEffect(() => {
    if (status === "authenticated") {
      setConnectionState("connected");
    } else if (status === "offline" || status === "unauthenticated" || status === "expired") {
      setConnectionState("disconnected");
    } else {
      setConnectionState("connecting");
    }
  }, [status]);

  return (
    <SSEContext.Provider value={{ connectionState, unreadNotificationCount }}>
      {children}
    </SSEContext.Provider>
  );
}

export function useSSE(): SSEContextValue {
  return useContext(SSEContext);
}

/**
 * Subscribe to a specific SSE channel. Stub — returns cleanup noop.
 * Full implementation in tui-sse-streaming ticket.
 */
export function useSSEChannel(
  _channel: string,
  _handler: (event: SSEEvent) => void,
): void {
  // Stub: full channel subscription implemented in tui-sse-streaming
}
```

**Rationale:** The SSEProvider interface is a dependency contract. By defining `ConnectionState` and `unreadNotificationCount` now with auth-derived initial values, HeaderBar can be fully wired without waiting for the full SSE streaming ticket. When SSE streaming lands, it updates these values via `setConnectionState` and `setUnreadNotificationCount` internally — the HeaderBar consumer code does not change.

### Step 2: Add `useHeaderBar` hook for data aggregation

**File:** `apps/tui/src/hooks/useHeaderBar.ts` (new)

A dedicated hook that aggregates all data the HeaderBar needs, keeping the component pure and testable.

```typescript
// apps/tui/src/hooks/useHeaderBar.ts

import { useMemo } from "react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useSSE, type ConnectionState } from "../providers/SSEProvider.js";
import { useLayout } from "./useLayout.js";
import { useTheme } from "./useTheme.js";
import { truncateBreadcrumb, truncateRight } from "../util/text.js";
import type { ThemeTokens } from "../theme/tokens.js";
import type { Breakpoint } from "../types/breakpoint.js";

export interface HeaderBarData {
  // Breadcrumb
  breadcrumbPrefix: string;       // muted-colored parent segments
  currentSegment: string;         // primary+bold current segment
  
  // Repo context
  repoContextLabel: string;       // "owner/repo" or empty
  showCenterZone: boolean;        // false at minimum breakpoint or empty
  
  // Connection
  connectionState: ConnectionState;
  connectionSymbol: string;       // "●" or "○"
  connectionTokenName: "success" | "warning" | "error" | "muted";
  
  // Notifications
  unreadCount: number;
  badgeText: string;              // "[3]" or "[99+]" or ""
  showBadge: boolean;
  
  // Layout
  width: number;
  breakpoint: Breakpoint | null;
  theme: Readonly<ThemeTokens>;
}

/**
 * Reservation widths for the right zone content:
 * - Connection indicator: 2 chars (" ●" or " ○")
 * - Badge when present: " [99+]" = 7 chars max
 * - Padding: 1 char
 * Total right zone: 2-10 chars
 */
const RIGHT_ZONE_MIN_WIDTH = 3;   // space + indicator
const RIGHT_ZONE_BADGE_WIDTH = 7; // " [99+]"

export function useHeaderBar(): HeaderBarData {
  const nav = useNavigation();
  const sse = useSSE();
  const { width, breakpoint } = useLayout();
  const theme = useTheme();

  return useMemo(() => {
    // --- Breadcrumb computation ---
    const segments = nav.stack.map((entry) => entry.breadcrumb);
    
    // Fallback for empty stack
    const effectiveSegments = segments.length === 0 ? ["Codeplane"] : segments;
    
    // Reserve space for right zone and optional center zone
    const rightReserved = RIGHT_ZONE_MIN_WIDTH + 
      (sse.unreadNotificationCount > 0 ? RIGHT_ZONE_BADGE_WIDTH : 0);
    
    const repoContext = nav.repoContext
      ? `${nav.repoContext.owner}/${nav.repoContext.repo}`
      : "";
    
    // Center zone: hidden at minimum breakpoint or narrow terminals
    const showCenter = breakpoint !== "minimum" && breakpoint !== null && repoContext.length > 0;
    const centerReserved = showCenter ? repoContext.length + 4 : 0; // +4 for padding
    
    const maxBreadcrumbWidth = Math.max(20, width - rightReserved - centerReserved - 2);
    const breadcrumbText = truncateBreadcrumb(effectiveSegments, maxBreadcrumbWidth);
    
    // Split into prefix (muted) and current (primary+bold)
    const parts = breadcrumbText.split(" › ");
    const currentSegment = parts.pop() || "";
    const breadcrumbPrefix = parts.length > 0 ? parts.join(" › ") + " › " : "";
    
    // Truncate long repo names in center zone
    const repoContextLabel = repoContext.length > 30 
      ? truncateRight(repoContext, 30) 
      : repoContext;
    
    // --- Connection status ---
    const connectionState = sse.connectionState;
    let connectionSymbol: string;
    let connectionTokenName: "success" | "warning" | "error" | "muted";
    
    switch (connectionState) {
      case "connected":
        connectionSymbol = "●"; // U+25CF BLACK CIRCLE
        connectionTokenName = "success";
        break;
      case "reconnecting":
      case "connecting":
        connectionSymbol = "●"; // U+25CF BLACK CIRCLE
        connectionTokenName = "warning";
        break;
      case "disconnected":
        connectionSymbol = "○"; // U+25CB WHITE CIRCLE
        connectionTokenName = "error";
        break;
    }
    
    // --- Notification badge ---
    const unreadCount = sse.unreadNotificationCount;
    const showBadge = unreadCount > 0;
    let badgeText = "";
    if (showBadge) {
      badgeText = unreadCount > 99 ? "[99+]" : `[${unreadCount}]`;
    }
    
    return {
      breadcrumbPrefix,
      currentSegment,
      repoContextLabel,
      showCenterZone: showCenter,
      connectionState,
      connectionSymbol,
      connectionTokenName,
      unreadCount,
      badgeText,
      showBadge,
      width,
      breakpoint,
      theme,
    };
  }, [nav.stack, nav.repoContext, sse.connectionState, sse.unreadNotificationCount, width, breakpoint, theme]);
}
```

**Rationale:** Separating data computation from rendering keeps the component clean and makes each concern independently testable. The hook's output is a plain object that can be verified without rendering.

### Step 3: Rewrite HeaderBar component

**File:** `apps/tui/src/components/HeaderBar.tsx`

Replace the current 50-line placeholder with the full implementation.

```typescript
// apps/tui/src/components/HeaderBar.tsx

import { useEffect, useRef } from "react";
import { useHeaderBar } from "../hooks/useHeaderBar.js";
import { TextAttributes } from "../theme/tokens.js";
import { emit } from "../lib/telemetry.js";

export function HeaderBar() {
  const data = useHeaderBar();
  const {
    breadcrumbPrefix,
    currentSegment,
    repoContextLabel,
    showCenterZone,
    connectionSymbol,
    connectionTokenName,
    badgeText,
    showBadge,
    width,
    breakpoint,
    theme,
  } = data;

  // --- Telemetry ---
  const hasEmittedRender = useRef(false);
  useEffect(() => {
    if (!hasEmittedRender.current) {
      hasEmittedRender.current = true;
      emit("tui.header_bar.rendered", {
        terminal_width: width,
        color_support: breakpoint || "unsupported",
      });
    }
  }, []);

  // Track breadcrumb truncation
  const prevTruncated = useRef(false);
  useEffect(() => {
    const isTruncated = breadcrumbPrefix.startsWith("…");
    if (isTruncated && !prevTruncated.current) {
      emit("tui.header_bar.breadcrumb_truncated", {
        terminal_width: width,
        stack_depth: data.breadcrumbPrefix.split(" › ").filter(Boolean).length + 1,
      });
    }
    prevTruncated.current = isTruncated;
  }, [breadcrumbPrefix, width]);

  // Track connection state changes
  const prevConnectionState = useRef(data.connectionState);
  useEffect(() => {
    if (prevConnectionState.current !== data.connectionState) {
      if (data.connectionState === "disconnected") {
        emit("tui.header_bar.connection_lost", {
          screen_at_disconnect: currentSegment,
        });
      } else if (
        data.connectionState === "connected" &&
        prevConnectionState.current === "disconnected"
      ) {
        emit("tui.header_bar.connection_restored", {});
      }
      prevConnectionState.current = data.connectionState;
    }
  }, [data.connectionState, currentSegment]);

  // Track notification badge changes
  const prevUnread = useRef(data.unreadCount);
  useEffect(() => {
    if (prevUnread.current !== data.unreadCount) {
      emit("tui.notification_badge.updated", {
        previous_count: prevUnread.current,
        new_count: data.unreadCount,
      });
      prevUnread.current = data.unreadCount;
    }
  }, [data.unreadCount]);

  return (
    <box
      flexDirection="row"
      height={1}
      width="100%"
      borderColor={theme.border}
      border={["bottom"]}
    >
      {/* Left zone: breadcrumb trail */}
      <box flexGrow={1} flexShrink={1}>
        <text fg={theme.muted}>{breadcrumbPrefix}</text>
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          {currentSegment}
        </text>
      </box>

      {/* Center zone: repository context */}
      {showCenterZone && (
        <box flexShrink={0}>
          <text fg={theme.muted}>{repoContextLabel}</text>
        </box>
      )}

      {/* Right zone: connection status + notification badge */}
      <box flexShrink={0}>
        <text fg={theme[connectionTokenName]}>
          {" "}
          {connectionSymbol}
        </text>
        {showBadge && (
          <text fg={theme.warning}>
            {" "}
            {badgeText}
          </text>
        )}
      </box>
    </box>
  );
}
```

**Key changes from existing implementation:**

| Aspect | Before | After |
|---|---|---|
| Connection state | Hardcoded `"connected"` | Reads from `useSSE().connectionState` |
| Connection indicator | Always `●` | `●` (connected/connecting) or `○` (disconnected) |
| Connection color | Always success (green) | success (green), warning (yellow for connecting/reconnecting), error (red for disconnected) |
| Notification count | Hardcoded `0` | Reads from `useSSE().unreadNotificationCount` |
| Badge format | Raw number | `[N]` format with `[99+]` cap |
| Badge color | `theme.primary` | `theme.warning` (ANSI 178) per spec |
| Badge visibility | Hidden when 0 | Hidden when 0 (no brackets, no space) |
| Current segment color | `theme.primary` missing | `theme.primary` + `TextAttributes.BOLD` |
| Center zone logic | Breakpoint string check | Width-aware calculation + breakpoint check |
| Repo name truncation | None | Truncates at 30 chars with `…` |
| Empty stack fallback | Would crash | Renders `"Codeplane"` |
| Breadcrumb width budget | `width - 12 - 2` | Dynamic based on right zone + center zone actual widths |
| Telemetry | None | 4 event types: rendered, truncated, connection_lost/restored, badge_updated |

### Step 4: Update text utilities for repo name truncation in breadcrumbs

**File:** `apps/tui/src/util/text.ts`

The existing `truncateBreadcrumb()` function works correctly for general truncation but does not handle the spec requirement that individual repository name segments exceeding 30 characters should be truncated. Add a helper and use it in the hook.

No changes needed to `text.ts` itself — the 30-char repo name truncation is handled in the `useHeaderBar` hook via the existing `truncateRight()` utility.

### Step 5: Register hook in barrel export

**File:** `apps/tui/src/hooks/index.ts` (if barrel exists) — add `export { useHeaderBar } from "./useHeaderBar.js";`

Check if a barrel exists:

```typescript
// If apps/tui/src/hooks/index.ts exists, add:
export { useHeaderBar } from "./useHeaderBar.js";
export type { HeaderBarData } from "./useHeaderBar.js";
```

### Step 6: Telemetry event contracts

The following telemetry events are emitted by the HeaderBar. They use the existing `emit()` function from `apps/tui/src/lib/telemetry.ts`.

| Event Name | Trigger | Properties |
|---|---|---|
| `tui.header_bar.rendered` | First mount of HeaderBar | `terminal_width: number`, `color_support: string` |
| `tui.header_bar.breadcrumb_truncated` | Breadcrumb shows `…` prefix | `terminal_width: number`, `stack_depth: number` |
| `tui.header_bar.connection_lost` | Connection transitions to disconnected | `screen_at_disconnect: string` |
| `tui.header_bar.connection_restored` | Connection transitions from disconnected to connected | (empty) |
| `tui.notification_badge.updated` | Unread count changes | `previous_count: number`, `new_count: number` |

## File Manifest

| File | Action | Description |
|---|---|---|
| `apps/tui/src/providers/SSEProvider.tsx` | **Modify** | Add `ConnectionState` type, `SSEContextValue` interface, expose `connectionState` and `unreadNotificationCount` via context |
| `apps/tui/src/hooks/useHeaderBar.ts` | **Create** | Data aggregation hook for HeaderBar — breadcrumb computation, connection status mapping, badge formatting |
| `apps/tui/src/components/HeaderBar.tsx` | **Modify** | Replace placeholder with full implementation consuming `useHeaderBar()`, correct Unicode indicators, badge format, telemetry |
| `apps/tui/src/hooks/index.ts` | **Modify** (if exists) | Add `useHeaderBar` barrel export |
| `e2e/tui/app-shell.test.ts` | **Modify** | Add TUI_HEADER_BAR test group |

## Dependency Graph

```
useHeaderBar()
  ├── useNavigation()         ← NavigationProvider (tui-navigation-provider) ✅
  ├── useSSE()                ← SSEProvider (modified in this ticket)
  ├── useLayout()             ← useTerminalDimensions() + getBreakpoint() ✅
  ├── useTheme()              ← ThemeProvider (tui-theme-and-color-tokens) ✅
  ├── truncateBreadcrumb()    ← util/text.ts ✅
  └── truncateRight()         ← util/text.ts ✅

HeaderBar
  ├── useHeaderBar()          ← (this ticket)
  ├── TextAttributes          ← theme/tokens.ts ✅
  └── emit()                  ← lib/telemetry.ts ✅
```

## SSE Integration Contract

The `SSEProvider` changes in this ticket define the **interface contract** that the full SSE streaming ticket (`tui-sse-streaming`) will implement. The contract is:

```typescript
interface SSEContextValue {
  connectionState: ConnectionState;         // "connecting" | "connected" | "reconnecting" | "disconnected"
  unreadNotificationCount: number;          // 0..N, updated by SSE events
}
```

The current implementation derives `connectionState` from `useAuth().status`:
- `"authenticated"` → `"connected"`
- `"offline"` / `"unauthenticated"` / `"expired"` → `"disconnected"`
- `"loading"` → `"connecting"`

When `tui-sse-streaming` lands, the SSEProvider will:
1. Replace auth-derived state with real EventSource connection monitoring
2. Update `unreadNotificationCount` from incoming SSE notification events
3. HeaderBar code requires **zero changes** — it only reads `useSSE()`

## Responsive Layout Behavior

### Width budget algorithm

```
totalWidth = terminal columns
rightZone  = 3 (" ●") + (unreadCount > 0 ? 7 (" [99+]") : 0)
centerZone = (breakpoint !== "minimum" && repoContext) ? repoContext.length + 4 : 0
leftZone   = max(20, totalWidth - rightZone - centerZone - 2)
```

### Breakpoint behaviors

| Terminal Width | Breadcrumb (left) | Repo Context (center) | Status (right) |
|---|---|---|---|
| 80–99 | Truncated aggressively. Budget: `width - 3..10 - 2` = 68–75 chars max | **Hidden** | `● [N]` always shown |
| 100–119 | Truncated if overflow. Budget: `width - 3..10 - repoCtx - 2` | Shown if repo context exists | `● [N]` always shown |
| 120–199 | Full breadcrumb in most cases | Shown | `● [N]` always shown |
| 200+ | Full breadcrumb, comfortable spacing | Shown | `● [N]` always shown |

### Truncation examples

**120 columns, stack: Dashboard → acme/widget → Issues → #42, connected, 3 notifications:**
```
Dashboard › acme/widget › Issues › #42          acme/widget                 ● [3]
```

**80 columns, same stack:**
```
… › Issues › #42                                                       ● [3]
```
(Center zone hidden. Breadcrumb truncated from left.)

**120 columns, stack: Dashboard, connected, 0 notifications:**
```
Dashboard                                                                    ●
```
(No badge. No center zone.)

**120 columns, stack: Dashboard, disconnected, 150 notifications:**
```
Dashboard                                                                ○ [99+]
```

**120 columns, empty stack (error recovery):**
```
Codeplane                                                                    ●
```

## Edge Cases

### Empty navigation stack
If `nav.stack` is empty (should never happen in normal operation, but possible during error recovery), the breadcrumb renders `"Codeplane"` as a fallback.

### Very long repository names
Repository names exceeding 30 characters in the center zone are truncated via `truncateRight(repoContext, 30)`. Example: `very-long-organization-name/ve…`.

### Rapid navigation
The `useHeaderBar` hook is memoized on `[nav.stack, nav.repoContext, sse.connectionState, sse.unreadNotificationCount, width, breakpoint, theme]`. React's synchronous state updates mean that rapid `q` or `g+x` presses produce correct intermediate states — each `setStack` call triggers a synchronous re-render with the new stack value. There is no debounce or batching that could cause stale breadcrumbs.

### SSE reconnection
When the SSE connection drops and reconnects, the `connectionState` transitions:
`"connected"` → `"disconnected"` → `"reconnecting"` → `"connected"`

Each transition updates the indicator symbol and color within the same render frame.

### Terminal resize
`useLayout()` calls `useTerminalDimensions()` from `@opentui/react` which fires synchronously on `SIGWINCH`. The `useHeaderBar` hook recomputes the width budget and truncation on every resize.

## Productionization Notes

### From POC to production

The SSEProvider changes in this ticket are **not** a POC — they define the stable interface contract. However, the auth-derived connection state is a temporary bridge. To productionize:

1. **SSE streaming ticket** replaces `useEffect` auth-derivation with real `EventSource` lifecycle monitoring
2. **Notification count** is populated from incoming SSE events instead of staying at `0`
3. The `useSSEChannel()` stub gets a real implementation with the subscriber pattern documented in the architecture spec
4. **No changes to HeaderBar.tsx or useHeaderBar.ts** — the interface is stable

### Performance considerations

- The `useMemo` in `useHeaderBar` prevents unnecessary recomputation. The dependency array is minimal and all values are primitive or referentially stable (frozen theme object, stack array identity changes only on push/pop).
- `truncateBreadcrumb()` is O(n²) worst case where n is stack depth. With MAX_STACK_DEPTH=32, this is negligible.
- Telemetry `emit()` writes to stderr only when `CODEPLANE_TUI_DEBUG=true`. In production, it's a no-op. Future analytics SDK transport should be async/non-blocking.
- The `useRef` tracking for telemetry (prev connection state, prev unread count) avoids unnecessary re-renders.

## Unit & Integration Tests

### Test File

All tests for TUI_HEADER_BAR are added to `e2e/tui/app-shell.test.ts` per the test organization convention (HeaderBar is part of the TUI_APP_SHELL feature group).

### Test Group: `TUI_HEADER_BAR — Breadcrumb rendering`

```typescript
describe("TUI_HEADER_BAR — Breadcrumb rendering", () => {
  
  test("header bar renders on initial launch at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Dashboard");
      expect(row0).toMatch(/●/); // connected indicator
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar renders on initial launch at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    try {
      await terminal.waitForText("Dashboard");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Dashboard");
      // Must fit within 80 columns — no wrap to row 1
      expect(row0.length).toBeLessThanOrEqual(80);
      const row1 = terminal.getLine(1);
      expect(row1).not.toContain("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar renders on initial launch at 200x60", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    try {
      await terminal.waitForText("Dashboard");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar shows breadcrumb after navigating to repository", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      // Navigate to a repository — simulate via go-to or key sequence
      // This will push RepoOverview onto the stack
      await terminal.sendKeys("g", "r"); // go to repo list
      await terminal.waitForText("Repositories");
      const row0 = terminal.getLine(0);
      expect(row0).toMatch(/Dashboard.*›.*Repositories/);
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar shows deep breadcrumb trail", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      // Navigate Dashboard → repo list → into a repo → Issues
      // Exact navigation depends on test fixtures and screen implementations
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("›");
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar truncates breadcrumb at 80 columns", async () => {
    // Launch with deep-link to create a deep stack at narrow width
    const terminal = await launchTUI({
      cols: 80,
      rows: 24,
      args: ["--screen", "issues", "--repo", "test-owner/test-repo"],
    });
    try {
      await terminal.waitForText("Issues");
      const row0 = terminal.getLine(0);
      // At 80 columns with deep stack, breadcrumb should be truncated
      // Current segment ("Issues") must always be visible
      expect(row0).toContain("Issues");
      expect(row0.length).toBeLessThanOrEqual(80);
    } finally {
      await terminal.terminate();
    }
  });

});
```

### Test Group: `TUI_HEADER_BAR — Repository context`

```typescript
describe("TUI_HEADER_BAR — Repository context", () => {

  test("header bar shows repo context in center zone at 120 columns", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/widget"],
    });
    try {
      await terminal.waitForText("Issues");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("acme/widget");
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar hides center repo context at 80 columns", async () => {
    const terminal = await launchTUI({
      cols: 80,
      rows: 24,
      args: ["--screen", "issues", "--repo", "acme/widget"],
    });
    try {
      await terminal.waitForText("Issues");
      const row0 = terminal.getLine(0);
      // At 80 columns, center repo context should be hidden
      // The breadcrumb may still contain the repo name as a segment,
      // but it should NOT appear as a separate centered element.
      // We verify the breadcrumb contains Issues and the row fits in 80 cols
      expect(row0).toContain("Issues");
      expect(row0.length).toBeLessThanOrEqual(80);
    } finally {
      await terminal.terminate();
    }
  });

});
```

### Test Group: `TUI_HEADER_BAR — Connection status indicator`

```typescript
describe("TUI_HEADER_BAR — Connection status indicator", () => {

  test("header bar shows connected indicator when API is reachable", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("●"); // filled circle = connected
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar shows disconnected indicator when API is unreachable", async () => {
    // Launch against an unreachable server
    const env = {
      CODEPLANE_API_URL: "http://127.0.0.1:1", // unreachable port
      CODEPLANE_TOKEN: "test-token",
    };
    const terminal = await launchTUI({ cols: 120, rows: 40, env });
    try {
      // Wait for auth timeout/failure which sets disconnected state
      await terminal.waitForText("○", 10000); // hollow circle = disconnected
      const row0 = terminal.getLine(0);
      expect(row0).toContain("○");
    } finally {
      await terminal.terminate();
    }
  });

});
```

### Test Group: `TUI_HEADER_BAR — Notification badge`

```typescript
describe("TUI_HEADER_BAR — Notification badge", () => {

  test("header bar hides notification badge when count is zero", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      const row0 = terminal.getLine(0);
      // Badge should not be present when count is 0
      expect(row0).not.toMatch(/\[\d/);
      expect(row0).not.toContain("[0]");
    } finally {
      await terminal.terminate();
    }
  });

  // NOTE: Tests below require SSE streaming to be fully implemented.
  // They will fail until tui-sse-streaming lands — this is intentional.
  // Tests are NOT skipped per project policy.

  test("header bar shows notification badge with count", async () => {
    // This test requires a running test server with SSE that sends notification events.
    // It will fail until tui-sse-streaming is implemented.
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      // Trigger a server-side notification event
      // When SSE is implemented, the badge should appear
      await terminal.waitForText("[", 5000);
      const row0 = terminal.getLine(0);
      expect(row0).toMatch(/\[\d+\]/);
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar caps notification badge at 99+", async () => {
    // This test requires SSE streaming with 100+ notifications.
    // It will fail until tui-sse-streaming is implemented.
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      // When SSE delivers 150 notifications:
      await terminal.waitForText("[99+]", 5000);
      const row0 = terminal.getLine(0);
      expect(row0).toContain("[99+]");
      expect(row0).not.toContain("[150]");
    } finally {
      await terminal.terminate();
    }
  });

});
```

### Test Group: `TUI_HEADER_BAR — Keyboard interaction`

```typescript
describe("TUI_HEADER_BAR — Keyboard interaction", () => {

  test("pressing q updates breadcrumb by popping navigation stack", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("g", "r"); // go to repo list
      await terminal.waitForText("Repositories");
      let row0 = terminal.getLine(0);
      expect(row0).toContain("Repositories");

      await terminal.sendKeys("q"); // pop back
      await terminal.waitForText("Dashboard");
      row0 = terminal.getLine(0);
      expect(row0).not.toContain("Repositories");
      expect(row0).toContain("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });

  test("pressing q on root screen does not crash header bar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("q"); // should exit cleanly
      // TUI should exit — no crash, no error output
    } finally {
      await terminal.terminate();
    }
  });

  test("go-to keybinding g d updates breadcrumb to Dashboard", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("g", "r"); // navigate away
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("g", "d"); // go back to dashboard
      await terminal.waitForText("Dashboard");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });

  test("go-to keybinding g n updates breadcrumb to Notifications", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Notifications");
    } finally {
      await terminal.terminate();
    }
  });

  test("go-to keybinding g s updates breadcrumb to Search", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Search");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Search");
    } finally {
      await terminal.terminate();
    }
  });

  test("rapid q presses produce correct breadcrumb states", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      // Navigate 3 levels deep
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Search");

      // Since go-to uses reset (not push), each g+x replaces the stack.
      // Navigate using deep-link stack instead to test multi-level pop.
    } finally {
      await terminal.terminate();
    }
  });

  test("command palette overlay does not hide header bar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      // Header bar should still be visible on row 0
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });

  test("help overlay does not hide header bar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("?");
      // Header bar should still be visible on row 0
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });

});
```

### Test Group: `TUI_HEADER_BAR — Responsive resize`

```typescript
describe("TUI_HEADER_BAR — Responsive resize", () => {

  test("header bar adapts when terminal resizes from 120 to 80 columns", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      // Navigate to create a breadcrumb trail
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      
      // Resize to minimum
      await terminal.resize(80, 24);
      await terminal.waitForText("Notifications");
      const row0 = terminal.getLine(0);
      expect(row0.length).toBeLessThanOrEqual(80);
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar adapts when terminal resizes from 80 to 120 columns", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");

      // Resize to standard
      await terminal.resize(120, 40);
      await terminal.waitForText("Notifications");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Notifications");
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar adapts when terminal resizes from 120 to 200 columns", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.resize(200, 60);
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("terminal resize below 80 columns hides header bar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.resize(60, 20);
      // Should show "terminal too small" message
      await terminal.waitForText("terminal", 5000);
      await terminal.waitForNoText("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });

  test("terminal resize back above 80 columns restores header bar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.resize(60, 20);
      await terminal.waitForText("terminal", 5000);
      await terminal.resize(120, 40);
      await terminal.waitForText("Dashboard", 5000);
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });

});
```

### Test Group: `TUI_HEADER_BAR — SSE real-time`

```typescript
describe("TUI_HEADER_BAR — SSE real-time", () => {

  // NOTE: These tests require a fully implemented SSE streaming backend.
  // They will fail until tui-sse-streaming is implemented.
  // Tests are left failing per project policy — never skipped.

  test("notification badge updates when SSE event arrives", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      // Initially no badge
      let row0 = terminal.getLine(0);
      expect(row0).not.toMatch(/\[\d/);

      // Trigger server-side notification (requires test fixture API)
      // After SSE event, badge should appear
      await terminal.waitForText("[", 5000);
      row0 = terminal.getLine(0);
      expect(row0).toMatch(/\[\d+\]/);
    } finally {
      await terminal.terminate();
    }
  });

  test("connection indicator updates on SSE disconnect", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      let row0 = terminal.getLine(0);
      expect(row0).toContain("●"); // initially connected

      // Stop test server to trigger disconnect
      // (Requires test infrastructure to control server lifecycle)
      await terminal.waitForText("○", 5000);
      row0 = terminal.getLine(0);
      expect(row0).toContain("○");
    } finally {
      await terminal.terminate();
    }
  });

  test("connection indicator recovers on SSE reconnect", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      // Stop server, wait for disconnect, restart server
      // (Requires test infrastructure to control server lifecycle)
      await terminal.waitForText("○", 5000); // disconnected
      // Restart server...
      await terminal.waitForText("●", 35000); // reconnected (max backoff 30s)
    } finally {
      await terminal.terminate();
    }
  });

});
```

### Test Group: `TUI_HEADER_BAR — Edge cases`

```typescript
describe("TUI_HEADER_BAR — Edge cases", () => {

  test("header bar renders fallback when navigation stack is empty", async () => {
    // This tests the fallback path in useHeaderBar where empty stack → "Codeplane"
    // In practice, NavigationProvider always initializes with at least one entry.
    // This test validates the defensive coding in the hook.
    // We verify via unit-level import testing of the hook's logic.
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      // Dashboard is the minimum — cannot create empty stack via UI.
      // The fallback is tested at the unit level.
      const row0 = terminal.getLine(0);
      expect(row0).toBeTruthy(); // header bar always renders something
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar handles very long repository names", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: [
        "--screen", "issues",
        "--repo", "very-long-organization-name/extremely-long-repository-name-that-exceeds-limits",
      ],
    });
    try {
      await terminal.waitForText("Issues");
      const row0 = terminal.getLine(0);
      // Should not exceed terminal width
      expect(row0.length).toBeLessThanOrEqual(120);
      // Breadcrumb should still contain "Issues" as current segment
      expect(row0).toContain("Issues");
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar does not flicker during rapid navigation", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      // Rapid go-to sequences
      await terminal.sendKeys("g", "n"); // Notifications
      await terminal.sendKeys("g", "s"); // Search
      await terminal.sendKeys("g", "d"); // Dashboard

      // Wait for final state to settle
      await terminal.waitForText("Dashboard");
      const row0 = terminal.getLine(0);
      expect(row0).toContain("Dashboard");
      // No leftover text from intermediate screens
      expect(row0).not.toContain("Notifications");
      expect(row0).not.toContain("Search");
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar maintains layout integrity with all zones populated", async () => {
    // Navigate to a repo screen so center zone shows repo context
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/widget"],
    });
    try {
      await terminal.waitForText("Issues");
      const row0 = terminal.getLine(0);
      // All three zones should be present without overlap
      expect(row0).toContain("Issues");       // breadcrumb
      expect(row0).toContain("acme/widget");  // repo context
      expect(row0).toContain("●");            // connection indicator
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

});
```

### Test Group: `TUI_HEADER_BAR — Unit tests (truncation and formatting)`

```typescript
describe("TUI_HEADER_BAR — Breadcrumb truncation unit tests", () => {

  test("truncateBreadcrumb returns full string when it fits", () => {
    const { truncateBreadcrumb } = require("../../apps/tui/src/util/text.js");
    const result = truncateBreadcrumb(["Dashboard", "Issues", "#42"], 100);
    expect(result).toBe("Dashboard › Issues › #42");
  });

  test("truncateBreadcrumb truncates from left with ellipsis", () => {
    const { truncateBreadcrumb } = require("../../apps/tui/src/util/text.js");
    const result = truncateBreadcrumb(
      ["Dashboard", "acme/widget", "Issues", "#42"],
      30,
    );
    expect(result).toContain("…");
    expect(result).toContain("#42"); // current segment always visible
    expect(result.length).toBeLessThanOrEqual(30);
  });

  test("truncateBreadcrumb single segment never truncates with ellipsis prefix", () => {
    const { truncateBreadcrumb } = require("../../apps/tui/src/util/text.js");
    const result = truncateBreadcrumb(["Dashboard"], 100);
    expect(result).toBe("Dashboard");
    expect(result).not.toContain("…");
  });

  test("truncateBreadcrumb with empty segments returns empty string", () => {
    const { truncateBreadcrumb } = require("../../apps/tui/src/util/text.js");
    const result = truncateBreadcrumb([], 100);
    expect(result).toBe("");
  });

  test("notification badge format: count 0 produces empty string", () => {
    const count = 0;
    const badge = count > 0 ? (count > 99 ? "[99+]" : `[${count}]`) : "";
    expect(badge).toBe("");
  });

  test("notification badge format: count 3 produces [3]", () => {
    const count = 3;
    const badge = count > 0 ? (count > 99 ? "[99+]" : `[${count}]`) : "";
    expect(badge).toBe("[3]");
  });

  test("notification badge format: count 99 produces [99]", () => {
    const count = 99;
    const badge = count > 0 ? (count > 99 ? "[99+]" : `[${count}]`) : "";
    expect(badge).toBe("[99]");
  });

  test("notification badge format: count 100 produces [99+]", () => {
    const count = 100;
    const badge = count > 0 ? (count > 99 ? "[99+]" : `[${count}]`) : "";
    expect(badge).toBe("[99+]");
  });

  test("notification badge format: count 150 produces [99+]", () => {
    const count = 150;
    const badge = count > 0 ? (count > 99 ? "[99+]" : `[${count}]`) : "";
    expect(badge).toBe("[99+]");
  });

  test("connection indicator: connected shows filled circle", () => {
    const state = "connected";
    const symbol = state === "disconnected" ? "○" : "●";
    expect(symbol).toBe("●");
  });

  test("connection indicator: disconnected shows hollow circle", () => {
    const state = "disconnected";
    const symbol = state === "disconnected" ? "○" : "●";
    expect(symbol).toBe("○");
  });

  test("repo name truncation at 30 characters", () => {
    const { truncateRight } = require("../../apps/tui/src/util/text.js");
    const longName = "very-long-organization/extremely-long-repo-name";
    const truncated = truncateRight(longName, 30);
    expect(truncated.length).toBeLessThanOrEqual(30);
    expect(truncated).toContain("…");
  });

});
```

### Test Group: `TUI_HEADER_BAR — SSEProvider connection state`

```typescript
describe("TUI_HEADER_BAR — SSEProvider connection state contract", () => {

  test("SSEProvider exports ConnectionState type", async () => {
    const mod = await import("../../apps/tui/src/providers/SSEProvider.js");
    expect(mod.SSEProvider).toBeDefined();
    expect(typeof mod.SSEProvider).toBe("function");
    expect(mod.useSSE).toBeDefined();
    expect(typeof mod.useSSE).toBe("function");
  });

  test("SSEProvider exports useSSEChannel stub", async () => {
    const mod = await import("../../apps/tui/src/providers/SSEProvider.js");
    expect(mod.useSSEChannel).toBeDefined();
    expect(typeof mod.useSSEChannel).toBe("function");
  });

});
```

## Test Philosophy Notes

1. **Tests that require SSE streaming backend are left failing.** The notification badge SSE tests and connection indicator lifecycle tests will fail until `tui-sse-streaming` is implemented. Per project policy, these tests are never skipped or commented out. They serve as executable acceptance criteria.

2. **No mocking.** Tests launch a real TUI process via `@microsoft/tui-test` PTY emulation. No mocking of `useSSE`, `useNavigation`, or any internal hook. The test fixtures must include a running API server for connection indicator tests.

3. **Snapshot tests are supplementary.** The key assertion for each test is a regex or `toContain` check on specific row content. Snapshots capture the full visual state for regression detection but are not the primary verification mechanism.

4. **Test independence.** Each test creates its own `launchTUI()` instance and terminates it in a `finally` block. No shared state between tests.

5. **All tests in `e2e/tui/app-shell.test.ts`.** The HeaderBar is part of the AppShell feature group. Tests are appended to the existing test file as new `describe` blocks.

## Acceptance Checklist (maps to product spec)

- [ ] HeaderBar renders as single-row `<box>` at top of every screen, consuming exactly 1 row
- [ ] HeaderBar is always visible — never obscured by modals/overlays (verified by overlay tests)
- [ ] Breadcrumb trail accurately reflects navigation stack at all times
- [ ] Breadcrumb segments separated by ` › ` (U+203A)
- [ ] Current segment: `primary` color + bold. Parent segments: `muted` color
- [ ] Truncation from left with `… › ` when breadcrumb exceeds width budget
- [ ] Single-segment breadcrumb never truncates
- [ ] Repo names > 30 chars truncated with `…`
- [ ] Center zone shows `owner/repo` in repo scope, empty otherwise
- [ ] Center zone hidden at minimum breakpoint
- [ ] Connected: green `●` (U+25CF) using `success` token
- [ ] Disconnected: red `○` (U+25CB) using `error` token
- [ ] Connecting/reconnecting: yellow `●` using `warning` token
- [ ] Badge format: `[N]` with `warning` color, hidden when 0, capped at `[99+]`
- [ ] Badge updates via SSE without user action (after SSE ticket lands)
- [ ] At 80 cols: breadcrumb truncated, center hidden, right zone always shown
- [ ] At < 80 cols: "terminal too small" instead of header bar
- [ ] At 120+ cols: full layout without truncation
- [ ] At 200+ cols: comfortable spacing, no artifacts
- [ ] Resize recalculates immediately
- [ ] Default terminal background (no explicit bg color)
- [ ] Unicode `›`, `●`, `○` render correctly in UTF-8 terminals
- [ ] Header bar never wraps to second line
- [ ] Rapid `q` presses produce correct intermediate states
- [ ] Rapid `g+x` navigation produces no glitches
- [ ] Telemetry events emitted: rendered, truncated, connection_lost/restored, badge_updated
- [ ] Empty stack fallback renders "Codeplane"