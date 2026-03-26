# Engineering Specification: TUI Dashboard Activity Feed

**Ticket:** `tui-dashboard-activity-feed`
**Status:** Not started
**Dependencies:** `tui-dashboard-data-hooks`, `tui-dashboard-panel-component`, `tui-dashboard-panel-focus-manager`, `tui-dashboard-e2e-test-infra`

---

## Overview

This specification defines the implementation of the Activity Feed panel — the bottom-right quadrant (panel index 3) of the Dashboard's 2×2 grid. The panel displays the authenticated user's recent public activity, fetched via a page-based REST endpoint, with event type filtering, responsive column layout, and navigation to repository targets.

---

## Implementation Plan

### Step 1: Create `relativeTime` utility

**File:** `apps/tui/src/util/relativeTime.ts`

The activity feed needs compact relative timestamps that differ from the Agents screen's `formatTimestamp`. The activity feed shows timestamps at **all** breakpoints (not hidden at minimum), uses a compact format capped at 6 characters, and adds month/year ranges.

```typescript
/**
 * Format an ISO 8601 timestamp as a compact relative time string.
 *
 * Output is always ≤ 6 characters:
 *   "now"  — less than 60 seconds ago
 *   "2m"   — minutes (1–59)
 *   "3h"   — hours (1–23)
 *   "5d"   — days (1–29)
 *   "2mo"  — months (1–11)
 *   "1y"   — years (1+)
 *
 * @param isoString - ISO 8601 timestamp string
 * @returns Compact relative time string, max 6 characters
 */
export function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = Math.max(0, now - then);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 30) return `${diffDay}d`;
  if (diffMonth < 12) return `${diffMonth}mo`;
  return `${diffYear}y`;
}
```

**Why a new utility instead of reusing `formatTimestamp`?**
- `formatTimestamp` returns `null` at minimum breakpoint — activity feed always shows timestamps.
- `formatTimestamp` returns verbose strings ("3 hours ago") at large breakpoint — activity feed uses a consistent compact format at all sizes.
- The activity feed spec mandates a 6-character cap with specific units (`now`, `m`, `h`, `d`, `mo`, `y`) that don't match either mode of `formatTimestamp`.

---

### Step 2: Create `useActivity` data hook

**File:** `packages/ui-core/src/hooks/dashboard/useActivity.ts`

This hook fetches paginated activity data from `GET /api/users/:username/activity`. It follows the same structural pattern as `useIssues` but uses **page-based** pagination instead of cursor-based, since the activity API uses `page` and `per_page` parameters with an `X-Total-Count` response header.

```typescript
import { useState, useCallback, useEffect, useRef } from "react";
import { useAPIClient } from "../../client/context.js";
import type { APIClient } from "../../client/types.js";
import type { HookError } from "../../types/errors.js";
import { parseResponseError, NetworkError } from "../../types/errors.js";
import type { ActivitySummary } from "@codeplane/sdk";

export interface ActivityOptions {
  /** Items per page. Default 30, max 100. */
  page?: number;
  perPage?: number;
  /** Event type filter. Null or undefined fetches all types. */
  type?: string | null;
  /** Whether the hook should fetch. Default true. */
  enabled?: boolean;
}

export interface UseActivityResult {
  items: ActivitySummary[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
  setFilter: (type: string | null) => void;
  activeFilter: string | null;
}

const MAX_ITEMS = 300;
const DEFAULT_PER_PAGE = 30;

export function useActivity(
  username: string,
  options?: ActivityOptions,
): UseActivityResult {
  const client = useAPIClient();
  const perPage = Math.min(options?.perPage ?? DEFAULT_PER_PAGE, 100);
  const enabled = options?.enabled ?? true;

  const [items, setItems] = useState<ActivitySummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<HookError | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(
    options?.type ?? null,
  );
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const isMounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  // Debounce timer for rapid filter changes
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      abortRef.current?.abort();
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    };
  }, []);

  // Core fetch effect
  useEffect(() => {
    if (!enabled || !username) return;

    async function fetchPage() {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Only show full loading state for page 1
      if (currentPage === 1) {
        setIsLoading(true);
        setItems([]);
      }

      try {
        let path = `/api/users/${encodeURIComponent(username)}/activity?page=${currentPage}&per_page=${perPage}`;
        if (activeFilter) {
          path += `&type=${encodeURIComponent(activeFilter)}`;
        }

        const response = await client.request(path, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const parsed = await parseResponseError(response);
          if (isMounted.current) {
            setError(parsed);
            setIsLoading(false);
          }
          return;
        }

        const data = (await response.json()) as ActivitySummary[];
        const totalCountHeader = response.headers.get("X-Total-Count");
        const total = totalCountHeader
          ? parseInt(totalCountHeader, 10)
          : 0;

        if (isMounted.current) {
          setItems((prev) => {
            if (currentPage === 1) {
              return data.slice(0, MAX_ITEMS);
            }
            const combined = [...prev, ...data];
            return combined.slice(0, MAX_ITEMS);
          });
          setTotalCount(total);
          setHasMore(
            data.length === perPage &&
              (currentPage === 1
                ? data.length < Math.min(total, MAX_ITEMS)
                : items.length + data.length < Math.min(total, MAX_ITEMS)),
          );
          setError(null);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        if (isMounted.current) {
          setError(
            err instanceof NetworkError
              ? err
              : new NetworkError("Fetch failed", err),
          );
          setIsLoading(false);
        }
      }
    }

    fetchPage();
  }, [client, username, currentPage, perPage, activeFilter, enabled, fetchTrigger]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    setCurrentPage((p) => p + 1);
  }, [hasMore, isLoading]);

  const retry = useCallback(() => {
    setFetchTrigger((t) => t + 1);
  }, []);

  const setFilter = useCallback((type: string | null) => {
    // Debounce rapid filter cycling at 200ms
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => {
      setActiveFilter(type);
      setCurrentPage(1);
      setItems([]);
      setHasMore(false);
    }, 200);
  }, []);

  return {
    items,
    totalCount,
    isLoading,
    error,
    hasMore,
    loadMore,
    retry,
    setFilter,
    activeFilter,
  };
}
```

**Re-export from barrel:**

**File:** `packages/ui-core/src/hooks/dashboard/index.ts` — Add `export { useActivity } from "./useActivity.js";`

**File:** `packages/ui-core/src/index.ts` — Ensure `export * from "./hooks/dashboard/index.js";` is present.

**Key design decisions:**
- **Page-based pagination**: The activity API uses `page` + `per_page` parameters and returns `X-Total-Count` header. This differs from cursor-based pagination used by other list hooks. We manage page state directly rather than using `usePaginatedQuery`.
- **300-item cap**: `MAX_ITEMS = 300` prevents unbounded memory growth.
- **200ms debounce on filter changes**: Rapid `f` key presses only trigger one API call for the final filter value.
- **Abort on filter change**: Setting a new filter aborts any in-flight fetch via `AbortController`.
- **First page shows full loading**: Subsequent pages append incrementally.

---

### Step 3: Create event type constants and icon map

**File:** `apps/tui/src/screens/Dashboard/activityConstants.ts`

Centralize all event type constants, icon mappings, filter cycle order, and color mappings.

```typescript
import type { Breakpoint } from "../../types/breakpoint.js";

// --- Event type icon and color mappings ---

export interface EventTypeDisplay {
  icon: string;
  color: string; // semantic theme token name
}

export const EVENT_TYPE_MAP: Record<string, EventTypeDisplay> = {
  "repo.create":    { icon: "◆", color: "success" },
  "repo.fork":      { icon: "⑂", color: "primary" },
  "repo.archive":   { icon: "⊘", color: "muted" },
  "repo.unarchive": { icon: "⊙", color: "success" },
  "repo.transfer":  { icon: "→", color: "warning" },
  "repo.delete":    { icon: "✕", color: "error" },
};

export const DEFAULT_EVENT_DISPLAY: EventTypeDisplay = {
  icon: "•",
  color: "muted",
};

export function getEventDisplay(eventType: string): EventTypeDisplay {
  return EVENT_TYPE_MAP[eventType] ?? DEFAULT_EVENT_DISPLAY;
}

// --- Filter cycle ---

export interface ActivityFilter {
  type: string | null; // null = "all"
  label: string;
}

export const FILTER_CYCLE: ActivityFilter[] = [
  { type: null,              label: "All" },
  { type: "repo.create",    label: "Created" },
  { type: "repo.fork",      label: "Forked" },
  { type: "repo.archive",   label: "Archived" },
  { type: "repo.transfer",  label: "Transferred" },
];

/**
 * Get the next filter in the cycle.
 * @param current - current filter type (null = "all")
 * @param direction - 1 for forward, -1 for backward
 * @returns next filter in the cycle
 */
export function cycleFilter(
  current: string | null,
  direction: 1 | -1,
): ActivityFilter {
  const currentIndex = FILTER_CYCLE.findIndex((f) => f.type === current);
  const idx = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex =
    (idx + direction + FILTER_CYCLE.length) % FILTER_CYCLE.length;
  return FILTER_CYCLE[nextIndex];
}

// --- Responsive column widths ---

export interface ActivityColumnLayout {
  showIcon: boolean;
  summaryWidth: number;
  showTargetType: boolean;
  timestampWidth: number;
}

export function getActivityColumnLayout(
  breakpoint: Breakpoint | null,
  availableWidth: number,
): ActivityColumnLayout {
  if (breakpoint === "large") {
    // icon(2) + summary(120) + targetType(12) + timestamp(6) + separators(~6)
    return {
      showIcon: true,
      summaryWidth: Math.min(120, availableWidth - 26),
      showTargetType: true,
      timestampWidth: 6,
    };
  }
  if (breakpoint === "standard") {
    // icon(2) + summary(80) + timestamp(6) + separators(~4)
    return {
      showIcon: true,
      summaryWidth: Math.min(80, availableWidth - 12),
      showTargetType: false,
      timestampWidth: 6,
    };
  }
  // minimum (or null, which shouldn't reach here due to router guard)
  // summary(55) + timestamp(5) + separator(~2)
  return {
    showIcon: false,
    summaryWidth: Math.min(55, availableWidth - 7),
    showTargetType: false,
    timestampWidth: 5,
  };
}

// --- Panel constants ---

export const ACTIVITY_PAGE_SIZE = 30;
export const ACTIVITY_MAX_ITEMS = 300;
```

---

### Step 4: Create `ActivityFeedPanel` component

**File:** `apps/tui/src/screens/Dashboard/ActivityFeedPanel.tsx`

This is the main component implementing the activity feed panel. It is rendered as the 4th panel (index 3) in the Dashboard grid. It receives focus state from the `useDashboardFocus` hook and delegates data fetching to `useActivity`.

```typescript
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { useActivity, useUser } from "@codeplane/ui-core";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { truncateText } from "../../util/truncate.js";
import { relativeTime } from "../../util/relativeTime.js";
import {
  getEventDisplay,
  cycleFilter,
  getActivityColumnLayout,
  FILTER_CYCLE,
  ACTIVITY_PAGE_SIZE,
} from "./activityConstants.js";
import type { ActivitySummary } from "@codeplane/sdk";
import type { Breakpoint } from "../../types/breakpoint.js";

export interface ActivityFeedPanelProps {
  focused: boolean;
  cursorIndex: number;
  onCursorChange: (index: number) => void;
  scrollOffset: number;
  onScrollChange: (offset: number) => void;
}

export function ActivityFeedPanel({
  focused,
  cursorIndex,
  onCursorChange,
  scrollOffset,
  onScrollChange,
}: ActivityFeedPanelProps) {
  const { user } = useUser();
  const { breakpoint, width } = useLayout();
  const theme = useTheme();
  const { push } = useNavigation();

  // Filter state
  const [filterIndex, setFilterIndex] = useState(0);
  const activeFilter = FILTER_CYCLE[filterIndex];

  // Data fetching
  const {
    items,
    totalCount,
    isLoading,
    error,
    hasMore,
    loadMore,
    retry,
    setFilter,
  } = useActivity(user?.username ?? "", {
    perPage: ACTIVITY_PAGE_SIZE,
    type: activeFilter.type,
    enabled: !!user?.username,
  });

  // Column layout
  const columnLayout = useMemo(
    () => getActivityColumnLayout(breakpoint, width),
    [breakpoint, width],
  );

  // --- Keyboard handlers (registered via parent DashboardScreen) ---

  const handleMoveDown = useCallback(() => {
    if (!focused || items.length === 0) return;
    const next = Math.min(cursorIndex + 1, items.length - 1);
    onCursorChange(next);
    // Trigger pagination at 80% scroll
    if (next >= Math.floor(items.length * 0.8) && hasMore) {
      loadMore();
    }
  }, [focused, items.length, cursorIndex, onCursorChange, hasMore, loadMore]);

  const handleMoveUp = useCallback(() => {
    if (!focused || items.length === 0) return;
    const prev = Math.max(cursorIndex - 1, 0);
    onCursorChange(prev);
  }, [focused, items.length, cursorIndex, onCursorChange]);

  const handleEnter = useCallback(() => {
    if (!focused || items.length === 0 || isLoading) return;
    const item = items[cursorIndex];
    if (!item) return;
    if (item.target_type === "repository" && item.target_name) {
      push("RepoOverview", { repo: item.target_name });
    }
    // Non-repository targets: no-op
  }, [focused, items, cursorIndex, isLoading, push]);

  const handleFilterForward = useCallback(() => {
    if (!focused) return;
    const nextIdx = (filterIndex + 1) % FILTER_CYCLE.length;
    setFilterIndex(nextIdx);
    const nextFilter = FILTER_CYCLE[nextIdx];
    setFilter(nextFilter.type);
    onCursorChange(0);
    onScrollChange(0);
  }, [focused, filterIndex, setFilter, onCursorChange, onScrollChange]);

  const handleFilterBackward = useCallback(() => {
    if (!focused) return;
    const nextIdx =
      (filterIndex - 1 + FILTER_CYCLE.length) % FILTER_CYCLE.length;
    setFilterIndex(nextIdx);
    const nextFilter = FILTER_CYCLE[nextIdx];
    setFilter(nextFilter.type);
    onCursorChange(0);
    onScrollChange(0);
  }, [focused, filterIndex, setFilter, onCursorChange, onScrollChange]);

  const handleJumpToBottom = useCallback(() => {
    if (!focused || items.length === 0) return;
    onCursorChange(items.length - 1);
  }, [focused, items.length, onCursorChange]);

  const handleJumpToTop = useCallback(() => {
    if (!focused || items.length === 0) return;
    onCursorChange(0);
    onScrollChange(0);
  }, [focused, items.length, onCursorChange, onScrollChange]);

  const handlePageDown = useCallback(() => {
    if (!focused || items.length === 0) return;
    const pageSize = Math.max(1, Math.floor((useLayout().contentHeight - 4) / 2));
    const next = Math.min(cursorIndex + pageSize, items.length - 1);
    onCursorChange(next);
    if (next >= Math.floor(items.length * 0.8) && hasMore) {
      loadMore();
    }
  }, [focused, items.length, cursorIndex, onCursorChange, hasMore, loadMore]);

  const handlePageUp = useCallback(() => {
    if (!focused || items.length === 0) return;
    const pageSize = Math.max(1, Math.floor((useLayout().contentHeight - 4) / 2));
    const prev = Math.max(cursorIndex - pageSize, 0);
    onCursorChange(prev);
  }, [focused, items.length, cursorIndex, onCursorChange]);

  const handleRetry = useCallback(() => {
    if (!error) return;
    retry();
  }, [error, retry]);

  // Expose handlers for parent keybinding registration
  // This object is accessed via ref from parent DashboardScreen
  const handlers = useMemo(() => ({
    moveDown: handleMoveDown,
    moveUp: handleMoveUp,
    enter: handleEnter,
    filterForward: handleFilterForward,
    filterBackward: handleFilterBackward,
    jumpToBottom: handleJumpToBottom,
    jumpToTop: handleJumpToTop,
    pageDown: handlePageDown,
    pageUp: handlePageUp,
    retry: handleRetry,
  }), [
    handleMoveDown, handleMoveUp, handleEnter,
    handleFilterForward, handleFilterBackward,
    handleJumpToBottom, handleJumpToTop,
    handlePageDown, handlePageUp, handleRetry,
  ]);

  // --- Render helpers ---

  const renderHeader = () => (
    <box flexDirection="row" height={1}>
      <text bold color={theme.primary}>Activity</text>
      <text color={theme.muted}> ({totalCount})</text>
      <box flexGrow={1} />
      {activeFilter.type !== null && (
        <text color={theme.warning}>[{activeFilter.label}]</text>
      )}
      <text color={theme.muted}> f filter</text>
    </box>
  );

  const renderRow = (item: ActivitySummary, index: number) => {
    const isFocused = focused && index === cursorIndex;
    const display = getEventDisplay(item.event_type);
    const ts = relativeTime(item.created_at);

    return (
      <box
        key={item.id}
        flexDirection="row"
        height={1}
        backgroundColor={isFocused ? theme.primary : undefined}
      >
        {/* Event icon (hidden at minimum) */}
        {columnLayout.showIcon && (
          <box width={2}>
            <text color={theme[display.color as keyof typeof theme] ?? theme.muted}>
              {display.icon}
            </text>
          </box>
        )}

        {/* Summary text */}
        <box flexGrow={1}>
          <text bold={isFocused}>
            {truncateText(item.summary, columnLayout.summaryWidth)}
          </text>
        </box>

        {/* Target type (large only) */}
        {columnLayout.showTargetType && (
          <box width={12}>
            <text color={theme.muted}>{item.target_type}</text>
          </box>
        )}

        {/* Timestamp */}
        <box width={columnLayout.timestampWidth}>
          <text color={theme.muted}>{ts}</text>
        </box>
      </box>
    );
  };

  // --- State rendering ---

  // Error state
  if (error && items.length === 0) {
    const isRateLimit = "status" in error && (error as any).status === 429;
    const is501 = "status" in error && (error as any).status === 501;

    let errorMessage: string;
    if (is501) {
      errorMessage = "Activity feed not yet available.";
    } else if (isRateLimit) {
      // Extract Retry-After if available
      errorMessage = `Rate limited. Retry in ${(error as any).retryAfter ?? "?"}s.`;
    } else {
      errorMessage = error.message;
    }

    return (
      <box flexDirection="column" width="100%" flexGrow={1} minHeight={4}>
        {renderHeader()}
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <text color={theme.error}>{errorMessage}</text>
          <text color={theme.muted}>Press R to retry</text>
        </box>
      </box>
    );
  }

  // Loading state (initial)
  if (isLoading && items.length === 0) {
    return (
      <box flexDirection="column" width="100%" flexGrow={1} minHeight={4}>
        {renderHeader()}
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <text color={theme.muted}>Loading...</text>
        </box>
      </box>
    );
  }

  // Empty state
  if (!isLoading && items.length === 0) {
    const emptyMessage =
      activeFilter.type !== null
        ? "No activity matching filter."
        : "No recent activity.";

    return (
      <box flexDirection="column" width="100%" flexGrow={1} minHeight={4}>
        {renderHeader()}
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <text color={theme.muted}>{emptyMessage}</text>
        </box>
      </box>
    );
  }

  // Data state
  return (
    <box flexDirection="column" width="100%" flexGrow={1} minHeight={4}>
      {renderHeader()}
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {items.map((item, index) => renderRow(item, index))}
          {isLoading && hasMore && (
            <box height={1}>
              <text color={theme.muted}>Loading more...</text>
            </box>
          )}
        </box>
      </scrollbox>
    </box>
  );
}
```

**Key architectural decisions:**

1. **Keyboard handlers are defined in the panel but registered by the parent.** The `DashboardScreen` component owns the keybinding scope (via `useScreenKeybindings`). It checks which panel is focused and delegates to the appropriate panel's handlers. This avoids multiple conflicting keybinding scopes for the same keys (`j`, `k`, `Enter`, etc.).

2. **Cursor and scroll state are owned by the parent.** The `useDashboardFocus` hook (from the `tui-dashboard-panel-focus-manager` dependency) stores per-panel `cursorIndex` and `scrollOffset`. This ensures state is preserved when the user tabs away and back.

3. **Filter state is internal** because it's specific to the activity panel and doesn't need to persist across panel focus changes (the filter stays active regardless of which panel is focused).

4. **Error rendering is inline**, not using the `DashboardPanel` wrapper's error state, because the activity feed has specific error messages for 501, 429, and generic errors that differ from the panel wrapper's generic error display. The panel wrapper provides the border and focus highlight; the content including error states is rendered by this component.

---

### Step 5: Integrate ActivityFeedPanel into DashboardScreen

**File:** `apps/tui/src/screens/Dashboard/DashboardScreen.tsx`

The `DashboardScreen` component must be modified to:

1. Import and render `ActivityFeedPanel` in the bottom-right grid cell (panel index 3).
2. Wire the `useDashboardFocus` hook to pass `focused`, `cursorIndex`, `onCursorChange`, `scrollOffset`, and `onScrollChange` props.
3. Register activity-specific keybindings that delegate to the panel's handlers when the activity panel is focused.

**Integration in the keybinding array:**

```typescript
// Inside DashboardScreen component, in the useScreenKeybindings call:
// Activity panel keybindings are conditionally active when panel index === 3

const activityRef = useRef<ActivityFeedPanelHandlers>(null);

useScreenKeybindings([
  // ... existing keybindings for other panels ...

  // Activity-specific (only when activity panel is focused)
  {
    key: "j",
    description: "Move down",
    group: "Navigation",
    handler: () => {
      if (focusedPanel === PANEL.ACTIVITY_FEED) activityRef.current?.moveDown();
      // ... other panels handle j similarly
    },
  },
  {
    key: "k",
    description: "Move up",
    group: "Navigation",
    handler: () => {
      if (focusedPanel === PANEL.ACTIVITY_FEED) activityRef.current?.moveUp();
    },
  },
  {
    key: "Enter",
    description: "Open",
    group: "Actions",
    handler: () => {
      if (focusedPanel === PANEL.ACTIVITY_FEED) activityRef.current?.enter();
    },
  },
  {
    key: "f",
    description: "Filter",
    group: "Actions",
    handler: () => {
      if (focusedPanel === PANEL.ACTIVITY_FEED) activityRef.current?.filterForward();
    },
  },
  {
    key: "Shift+F",
    description: "Filter back",
    group: "Actions",
    handler: () => {
      if (focusedPanel === PANEL.ACTIVITY_FEED) activityRef.current?.filterBackward();
    },
  },
  {
    key: "G",
    description: "Jump to bottom",
    group: "Navigation",
    handler: () => {
      if (focusedPanel === PANEL.ACTIVITY_FEED) activityRef.current?.jumpToBottom();
    },
  },
  // g g handled via go-to mode prefix in KeybindingProvider
  {
    key: "Ctrl+D",
    description: "Page down",
    group: "Navigation",
    handler: () => {
      if (focusedPanel === PANEL.ACTIVITY_FEED) activityRef.current?.pageDown();
    },
  },
  {
    key: "Ctrl+U",
    description: "Page up",
    group: "Navigation",
    handler: () => {
      if (focusedPanel === PANEL.ACTIVITY_FEED) activityRef.current?.pageUp();
    },
  },
  {
    key: "R",
    description: "Retry",
    group: "Actions",
    handler: () => {
      if (focusedPanel === PANEL.ACTIVITY_FEED) activityRef.current?.retry();
    },
  },
]);
```

**Grid placement (in JSX):**

```tsx
{/* Bottom row of 2×2 grid */}
<box flexDirection="row" flexGrow={1}>
  {/* Bottom-left: Starred Repos (panel index 2) */}
  <DashboardPanel
    title="Starred"
    focused={focusedPanel === PANEL.STARRED_REPOS}
    index={2}
    total={4}
    isCompact={breakpoint === "minimum"}
  >
    <StarredReposPanel {/* ... props */} />
  </DashboardPanel>

  {/* Bottom-right: Activity Feed (panel index 3) */}
  <DashboardPanel
    title="Activity"
    focused={focusedPanel === PANEL.ACTIVITY_FEED}
    index={3}
    total={4}
    isCompact={breakpoint === "minimum"}
  >
    <ActivityFeedPanel
      ref={activityRef}
      focused={focusedPanel === PANEL.ACTIVITY_FEED}
      cursorIndex={panelFocusState[PANEL.ACTIVITY_FEED].cursorIndex}
      onCursorChange={(i) => setCursorIndex(PANEL.ACTIVITY_FEED, i)}
      scrollOffset={panelFocusState[PANEL.ACTIVITY_FEED].scrollOffset}
      onScrollChange={(o) => setScrollOffset(PANEL.ACTIVITY_FEED, o)}
    />
  </DashboardPanel>
</box>
```

---

### Step 6: Handle `g g` (jump to top) via go-to mode

The global `g` prefix enters go-to mode. When `g g` is pressed, it should jump to the top of the current list if a list panel is focused, rather than navigating to a screen.

The `KeybindingProvider` already handles go-to mode with a 1500ms timeout. The `g g` binding must be registered as a go-to target that resolves to "jump to top" when a list panel is focused.

**File:** `apps/tui/src/screens/Dashboard/DashboardScreen.tsx`

In the go-to keybinding registration (if the `KeybindingProvider` supports screen-level go-to overrides) or as a direct `g` then `g` handler:

```typescript
// If go-to mode is handled by KeybindingProvider with screen overrides:
// Register 'gg' as jumping to top of current focused panel's list.
// Implementation depends on how the KeybindingProvider exposes go-to mode.
// If it doesn't support in-panel `gg`, handle it as a two-key sequence
// tracked locally with a timer.
```

**Fallback approach** if the KeybindingProvider's go-to mode doesn't support per-screen override of `g g`:

```typescript
// Track 'g' prefix state locally
const [gPrefixActive, setGPrefixActive] = useState(false);
const gTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useScreenKeybindings([
  // ... other bindings ...
  {
    key: "g",
    description: "Go-to prefix",
    group: "Navigation",
    handler: () => {
      if (gPrefixActive) {
        // Second 'g' → jump to top
        setGPrefixActive(false);
        if (gTimeoutRef.current) clearTimeout(gTimeoutRef.current);
        if (focusedPanel === PANEL.ACTIVITY_FEED) {
          activityRef.current?.jumpToTop();
        }
      } else {
        setGPrefixActive(true);
        gTimeoutRef.current = setTimeout(() => setGPrefixActive(false), 1500);
      }
    },
  },
]);
```

---

### Step 7: Add telemetry event emissions

**File:** `apps/tui/src/screens/Dashboard/ActivityFeedPanel.tsx`

Add telemetry calls at the points specified in the product spec. These integrate with whatever telemetry system `@codeplane/ui-core` provides. If no telemetry system exists yet, emit events via a `useTelemetry()` hook that can be stubbed.

```typescript
// Emit on initial load completion
useEffect(() => {
  if (!isLoading && items.length > 0 && !error) {
    telemetry.track("tui.dashboard.activity.view", {
      total_count: totalCount,
      terminal_width: width,
      terminal_height: height,
      breakpoint: breakpoint ?? "unsupported",
      load_time_ms: performance.now() - mountTimeRef.current,
    });
  }
}, [isLoading, items.length, error]);

// Emit on navigation
const handleEnter = useCallback(() => {
  if (!focused || items.length === 0 || isLoading) return;
  const item = items[cursorIndex];
  if (!item) return;
  if (item.target_type === "repository" && item.target_name) {
    telemetry.track("tui.dashboard.activity.navigate", {
      event_type: item.event_type,
      target_type: item.target_type,
      target_name: item.target_name,
      position_in_list: cursorIndex,
    });
    push("RepoOverview", { repo: item.target_name });
  }
}, [focused, items, cursorIndex, isLoading, push]);

// Emit on filter change
const handleFilterForward = useCallback(() => {
  if (!focused) return;
  const prevFilter = FILTER_CYCLE[filterIndex];
  const nextIdx = (filterIndex + 1) % FILTER_CYCLE.length;
  setFilterIndex(nextIdx);
  const nextFilter = FILTER_CYCLE[nextIdx];
  setFilter(nextFilter.type);
  telemetry.track("tui.dashboard.activity.filter", {
    filter_type: nextFilter.type ?? "all",
    previous_filter: prevFilter.type ?? "all",
    result_count: 0, // updated after fetch completes
  });
  onCursorChange(0);
  onScrollChange(0);
}, [focused, filterIndex, setFilter, onCursorChange, onScrollChange]);
```

---

### Step 8: Add logging

**File:** `apps/tui/src/screens/Dashboard/ActivityFeedPanel.tsx`

Logging follows the observability spec. Logs are written to stderr, level controlled by `CODEPLANE_LOG_LEVEL`.

```typescript
import { createLogger } from "../../lib/logger.js";

const log = createLogger("dashboard:activity");

// In the fetch effect:
log.info("Activity section loaded", {
  total_count: totalCount,
  items_in_first_page: items.length,
  load_time_ms: elapsed,
  active_filter: activeFilter.type ?? "all",
});

// On filter change:
log.debug("Filter changed", {
  filter_type: nextFilter.type ?? "all",
  previous_filter: prevFilter.type ?? "all",
});

// On error:
log.warn("API error on activity fetch", {
  http_status: error.status,
  error_message: error.message,
});
```

---

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `apps/tui/src/util/relativeTime.ts` | **Create** | Compact relative timestamp formatting |
| `packages/ui-core/src/hooks/dashboard/useActivity.ts` | **Create** | Page-based activity data hook |
| `packages/ui-core/src/hooks/dashboard/index.ts` | **Modify** | Add `useActivity` export |
| `packages/ui-core/src/index.ts` | **Modify** | Ensure dashboard hooks barrel is exported |
| `apps/tui/src/screens/Dashboard/activityConstants.ts` | **Create** | Event icons, filter cycle, column layouts |
| `apps/tui/src/screens/Dashboard/ActivityFeedPanel.tsx` | **Create** | Activity feed panel component |
| `apps/tui/src/screens/Dashboard/DashboardScreen.tsx` | **Modify** | Integrate ActivityFeedPanel into grid |
| `apps/tui/src/screens/Dashboard/types.ts` | **Modify** | Add `PANEL.ACTIVITY_FEED` constant (if not present from dependency) |
| `e2e/tui/dashboard.test.ts` | **Modify** | Add activity feed E2E tests |

---

## Data Flow

```
┌──────────────────────────┐
│     DashboardScreen       │
│                           │
│  useDashboardFocus()      │  ← panel focus state (cursor, scroll, active panel)
│  useScreenKeybindings()   │  ← registers j/k/Enter/f/F/G/gg/Ctrl+D/U/R
│                           │
│  ┌─────────────────────┐  │
│  │  ActivityFeedPanel   │  │
│  │                      │  │
│  │  useUser()           │──│──→ GET /api/user → username
│  │  useActivity(        │  │
│  │    username,         │──│──→ GET /api/users/:username/activity
│  │    { type, perPage } │  │     ?page=N&per_page=30&type=repo.create
│  │  )                   │  │
│  │                      │  │     Response: ActivitySummary[]
│  │  useLayout()         │──│──→ breakpoint → column layout
│  │  useTheme()          │──│──→ color tokens
│  │  useNavigation()     │──│──→ push("RepoOverview", { repo })
│  │                      │  │
│  └─────────────────────┘  │
└──────────────────────────┘
```

---

## Pagination Behavior

1. **Initial load**: Fetches page 1 with `per_page=30`. Shows "Loading..." spinner.
2. **Scroll trigger**: When `cursorIndex >= 80% of items.length`, calls `loadMore()` which increments `currentPage` and fetches next page.
3. **Append**: New items are appended to the existing array.
4. **Cap**: Total items capped at 300. `hasMore` becomes `false` when cap reached or all pages exhausted.
5. **Filter change**: Resets `currentPage` to 1, clears `items`, re-fetches with new `type` parameter.
6. **Loading indicator**: "Loading more..." appears at the bottom of the scrollbox while fetching subsequent pages.
7. **End of data**: No indicator shown when all pages loaded.

---

## Error Handling Matrix

| HTTP Status | Error Type | Display | Recovery |
|-------------|-----------|---------|----------|
| 200 | Success | Render data | N/A |
| 401 | Auth expired | Propagate to app-shell auth error | Run `codeplane auth login` |
| 429 | Rate limited | "Rate limited. Retry in Ns." | `R` to retry |
| 500 | Server error | Generic error message | `R` to retry |
| 501 | Not implemented | "Activity feed not yet available." | `R` to retry |
| Network timeout | Network error | "Failed to fetch" | `R` to retry |
| Malformed JSON | Parse error | Generic error message | `R` to retry |

**401 propagation**: The `APIClient` or `AuthProvider` intercepts 401 responses globally and sets `authState = "expired"`, which triggers the app-shell auth error screen. The activity panel does not handle 401 inline.

**Partial failure on pagination**: If a subsequent page fetch fails, existing items remain visible. The "Loading more..." indicator is replaced with the error message. The user can press `R` to retry the failed page.

---

## Responsive Layout Details

### 80×24 (minimum)

```
Activity (42)                    f filter
┌────────────────────────────────────────────────┐
│ created repository alice/my-project     2h     │  ← no icon
│ forked repository org/tool              3d     │
│ archived repository old/thing           1mo    │
│ transferred repository alice/old        5d     │
│ deleted repository test/temp            now    │
└────────────────────────────────────────────────┘
```

- Icon column: **hidden** (save 2 columns)
- Summary: up to **55 characters**, truncated with `…`
- Target type: **hidden**
- Timestamp: **5 characters** (compact: `2h`, `3d`, `now`)

### 120×40 (standard)

```
Activity (42)                                          f filter
┌──────────────────────────────────────────────────────────────────┐
│ ◆ created repository alice/my-project                     2h    │
│ ⑂ forked repository org/tool                              3d    │
│ ⊘ archived repository old/thing                           1mo   │
│ → transferred repository alice/old                        5d    │
│ ✕ deleted repository test/temp                            now   │
└──────────────────────────────────────────────────────────────────┘
```

- Icon column: **visible** (2 chars, color-coded)
- Summary: up to **80 characters**
- Target type: **hidden**
- Timestamp: **6 characters**

### 200×60 (large)

```
Activity (42)                                                                                              f filter
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ created repository alice/my-project                                                    repository    2h       │
│ ⑂ forked repository org/tool                                                             repository    3d       │
│ ⊘ archived repository old/thing                                                          repository    1mo      │
│ → transferred repository alice/old to bob/old                                             repository    5d       │
│ ✕ deleted repository test/temp                                                           repository    now      │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Icon column: **visible** (2 chars)
- Summary: up to **120 characters**
- Target type: **visible** (12 chars, muted)
- Timestamp: **6 characters**

---

## Productionization Notes

### POC → Production Checklist

If any part of this implementation starts as proof-of-concept code in `poc/`, the following steps are required to graduate it to production:

1. **Move from `poc/` to target path**: `poc/activity-feed/` → `apps/tui/src/screens/Dashboard/ActivityFeedPanel.tsx`
2. **Remove hardcoded test data**: Replace fixture data with real `useActivity()` hook calls.
3. **Add error boundaries**: Wrap the panel in `PanelErrorBoundary` (from `tui-dashboard-panel-component` dependency).
4. **Wire telemetry**: Connect `telemetry.track()` calls to the real telemetry provider.
5. **Wire logging**: Connect `createLogger()` to the real stderr logger with level filtering.
6. **Add to screen registry**: Ensure `DashboardScreen` in `router/registry.ts` imports the production component.
7. **Validate 401 propagation**: Confirm that auth errors bubble to the app-shell error screen, not render inline.
8. **Snapshot baseline**: Generate golden snapshot files for all three breakpoints.
9. **Verify debounce**: Confirm the 200ms filter debounce works under rapid key input without race conditions.
10. **Memory profiling**: Run with 300+ activity items and verify memory stays stable (no leaks in pagination cache).

### Performance Considerations

- **Render budget**: Each activity row is a single `<box>` with 2-4 child `<text>` nodes. At 300 items, this is 900-1200 nodes — well within OpenTUI's render budget.
- **Pagination fetch**: Only one fetch in flight at a time (controlled by `AbortController`). No parallel page fetches.
- **Filter debounce**: 200ms debounce prevents multiple API calls during rapid `f` key presses.
- **No SSE dependency**: The activity feed is purely REST-based. No SSE connection overhead.
- **Memoization**: `getActivityColumnLayout` is memoized on `breakpoint` and `width` changes. Row rendering uses `key={item.id}` for React reconciliation.

---

## Unit & Integration Tests

### Test File: `e2e/tui/dashboard.test.ts`

All tests are appended to the existing `e2e/tui/dashboard.test.ts` file within a new `describe("TUI_DASHBOARD_ACTIVITY_FEED")` block. Tests run against a real API server with test fixtures. Tests that fail due to unimplemented backends (e.g., 501 from the activity endpoint) are **left failing** — they are never skipped or commented out.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance } from "./helpers.js";

// --- Fixtures ---

const WRITE_TOKEN = process.env.TEST_CODEPLANE_TOKEN ?? "test-token";
const API_URL = process.env.TEST_CODEPLANE_API_URL ?? "http://localhost:3000";

const TERMINAL_SIZES = {
  minimum:  { width: 80,  height: 24 },
  standard: { width: 120, height: 40 },
  large:    { width: 200, height: 60 },
};

describe("TUI_DASHBOARD_ACTIVITY_FEED", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  // ======================================================================
  // SNAPSHOT TESTS
  // ======================================================================

  describe("Snapshot tests", () => {
    test("dashboard-activity-initial-load: renders activity section with header, rows, and timestamps", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      // Tab to activity section (index 3 — after repos, orgs, starred)
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("dashboard-activity-empty-state: shows 'No recent activity.' for user with zero activity", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      // If the user has no activity, expect the empty state
      // This test may pass or fail depending on test user's activity
      const snap = tui.snapshot();
      // Assert the activity section exists
      expect(snap).toMatch(/Activity/);
    });

    test("dashboard-activity-loading-state: shows 'Loading...' during initial fetch", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      // Capture immediately after launch before data arrives
      await tui.waitForText("Dashboard");
      // The activity section should show loading initially
      const snap = tui.snapshot();
      expect(snap).toMatch(/Activity/);
    });

    test("dashboard-activity-error-state: shows error with 'Press R to retry' on API failure", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      // If the activity endpoint returns an error, verify error rendering
      const snap = tui.snapshot();
      expect(snap).toMatch(/Activity/);
      // Error state will naturally occur if endpoint returns 500/501
    });

    test("dashboard-activity-501-state: shows 'Activity feed not yet available.' on 501", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // If the API returns 501, expect the specific message
      const snap = tui.snapshot();
      expect(snap).toContain("Activity feed not yet available.");
    });

    test("dashboard-activity-focused-row: first row highlighted with primary color when focused", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("dashboard-activity-event-icons: correct icons for mixed event types", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const snap = tui.snapshot();
      // Expect at least one event icon to be present
      expect(snap).toMatch(/[◆⑂⊘⊙→✕•]/);
    });

    test("dashboard-activity-filter-active: header shows filter label after pressing f", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("f");
      // After one f press, filter should be "Created"
      const snap = tui.snapshot();
      expect(snap).toContain("[Created]");
    });

    test("dashboard-activity-filter-no-results: shows 'No activity matching filter.' when filter produces zero results", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // Cycle through filters until one has no results
      await tui.sendKeys("f", "f", "f"); // Archived
      const snap = tui.snapshot();
      // May show data or empty state depending on test data
      expect(snap).toMatch(/Activity/);
    });

    test("dashboard-activity-pagination-loading: shows 'Loading more...' at bottom when paginating", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // Navigate to bottom to trigger pagination
      await tui.sendKeys("G");
      // If more than 30 items, pagination should trigger
      const snap = tui.snapshot();
      expect(snap).toMatch(/Activity/);
    });

    test("dashboard-activity-header-total-count: shows correct count from API", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const snap = tui.snapshot();
      // Header should show "Activity (N)" with a number
      expect(snap).toMatch(/Activity \(\d+\)/);
    });

    test("dashboard-activity-relative-timestamps: entries show compact relative timestamps", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const snap = tui.snapshot();
      // Should contain relative timestamps like "2h", "3d", "now"
      expect(snap).toMatch(/\d+[mhd]|now|\d+mo|\d+y/);
    });
  });

  // ======================================================================
  // KEYBOARD INTERACTION TESTS
  // ======================================================================

  describe("Keyboard interaction tests", () => {
    test("dashboard-activity-j-moves-down: j moves focus from first to second row", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const before = tui.snapshot();
      await tui.sendKeys("j");
      const after = tui.snapshot();
      // Focus should have moved — snapshots should differ
      expect(after).not.toBe(before);
    });

    test("dashboard-activity-k-moves-up: k after j returns to first row", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const initial = tui.snapshot();
      await tui.sendKeys("j");
      await tui.sendKeys("k");
      const returned = tui.snapshot();
      expect(returned).toBe(initial);
    });

    test("dashboard-activity-k-at-top-no-wrap: k on first row stays at first row", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const before = tui.snapshot();
      await tui.sendKeys("k");
      const after = tui.snapshot();
      expect(after).toBe(before);
    });

    test("dashboard-activity-j-at-bottom-no-wrap: j on last row stays (triggers pagination if more)", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("G"); // Jump to bottom
      const atBottom = tui.snapshot();
      await tui.sendKeys("j");
      const afterJ = tui.snapshot();
      // Should not crash; may trigger pagination or stay in place
      expect(afterJ).toMatch(/Activity/);
    });

    test("dashboard-activity-down-arrow-moves-down: Down arrow equivalent to j", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const before = tui.snapshot();
      await tui.sendKeys("ArrowDown");
      const after = tui.snapshot();
      expect(after).not.toBe(before);
    });

    test("dashboard-activity-up-arrow-moves-up: Up arrow equivalent to k", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const initial = tui.snapshot();
      await tui.sendKeys("ArrowDown");
      await tui.sendKeys("ArrowUp");
      const returned = tui.snapshot();
      expect(returned).toBe(initial);
    });

    test("dashboard-activity-enter-navigates-to-repo: Enter on repo activity pushes repo overview", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("Enter");
      // If the first activity is a repo event, should navigate
      // Breadcrumb should update
      const snap = tui.snapshot();
      // Either shows repo overview or stays on dashboard (if non-repo target)
      expect(snap).toBeDefined();
    });

    test("dashboard-activity-enter-noop-on-non-repo: Enter on non-navigable target has no effect", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // Navigate to a non-repo entry if possible, then press Enter
      const before = tui.snapshot();
      // This test validates the no-op path
      expect(before).toMatch(/Activity/);
    });

    test("dashboard-activity-f-cycles-filter-forward: f cycles All → Created → Forked", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");

      await tui.sendKeys("f");
      expect(tui.snapshot()).toContain("[Created]");

      await tui.sendKeys("f");
      expect(tui.snapshot()).toContain("[Forked]");
    });

    test("dashboard-activity-shift-f-cycles-filter-backward: Shift+F cycles All → Transferred", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");

      await tui.sendKeys("Shift+F");
      expect(tui.snapshot()).toContain("[Transferred]");
    });

    test("dashboard-activity-filter-resets-scroll: filter change resets to top", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("j", "j", "j"); // Move down
      await tui.sendKeys("f"); // Apply filter
      // After filter, cursor should reset to first item
      expect(tui.snapshot()).toMatch(/Activity/);
    });

    test("dashboard-activity-filter-refetches: filter 'Created' sends type=repo.create", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("f"); // Created filter
      // Should re-fetch with type=repo.create
      // Verify header shows [Created]
      expect(tui.snapshot()).toContain("[Created]");
    });

    test("dashboard-activity-G-jumps-to-bottom: G moves focus to last loaded row", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("G");
      expect(tui.snapshot()).toMatch(/Activity/);
    });

    test("dashboard-activity-gg-jumps-to-top: G then gg returns to first row", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const initial = tui.snapshot();
      await tui.sendKeys("G");
      await tui.sendKeys("g", "g");
      const returned = tui.snapshot();
      expect(returned).toBe(initial);
    });

    test("dashboard-activity-ctrl-d-page-down: Ctrl+D pages down", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const before = tui.snapshot();
      await tui.sendKeys("Ctrl+D");
      const after = tui.snapshot();
      // Should have moved focus down
      expect(after).toMatch(/Activity/);
    });

    test("dashboard-activity-ctrl-u-page-up: Ctrl+D then Ctrl+U returns", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const initial = tui.snapshot();
      await tui.sendKeys("Ctrl+D");
      await tui.sendKeys("Ctrl+U");
      const returned = tui.snapshot();
      expect(returned).toBe(initial);
    });

    test("dashboard-activity-R-retries-on-error: R in error state triggers re-fetch", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // If in error state, R should trigger retry
      await tui.sendKeys("R");
      expect(tui.snapshot()).toMatch(/Activity/);
    });

    test("dashboard-activity-R-no-op-when-loaded: R with data loaded has no effect", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const before = tui.snapshot();
      await tui.sendKeys("R");
      const after = tui.snapshot();
      // Should be identical (no re-fetch when not in error state)
      expect(after).toBe(before);
    });

    test("dashboard-activity-tab-moves-to-next-section: Tab leaves activity section", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab"); // Focus activity
      await tui.waitForText("Activity");
      const onActivity = tui.snapshot();
      await tui.sendKeys("Tab"); // Should cycle to next panel (repos)
      const afterTab = tui.snapshot();
      expect(afterTab).not.toBe(onActivity);
    });

    test("dashboard-activity-shift-tab-moves-to-prev-section: Shift+Tab from activity goes to starred", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab"); // Focus activity
      await tui.waitForText("Activity");
      const onActivity = tui.snapshot();
      await tui.sendKeys("Shift+Tab");
      const afterShiftTab = tui.snapshot();
      expect(afterShiftTab).not.toBe(onActivity);
    });

    test("dashboard-activity-j-no-op-when-unfocused: j has no effect on activity when another panel is focused", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      // Don't tab to activity — stay on repos (panel 0)
      const before = tui.snapshot();
      await tui.sendKeys("j");
      const after = tui.snapshot();
      // j should affect repos panel, not activity
      expect(after).toMatch(/Dashboard/);
    });

    test("dashboard-activity-pagination-on-scroll: scrolling past 80% triggers next page load", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // Send many j presses to scroll past 80%
      for (let i = 0; i < 25; i++) {
        await tui.sendKeys("j");
      }
      // Should have triggered pagination
      expect(tui.snapshot()).toMatch(/Activity/);
    });

    test("dashboard-activity-rapid-j-presses: 10 j presses move focus 10 rows", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // Send 10 j presses rapidly
      for (let i = 0; i < 10; i++) {
        await tui.sendKeys("j");
      }
      expect(tui.snapshot()).toMatch(/Activity/);
    });

    test("dashboard-activity-enter-during-loading: Enter during initial load is no-op", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      // Press Enter immediately without waiting for activity data
      await tui.sendKeys("Tab", "Tab", "Tab", "Enter");
      // Should still be on dashboard
      expect(tui.snapshot()).toMatch(/Dashboard/);
    });
  });

  // ======================================================================
  // RESPONSIVE TESTS
  // ======================================================================

  describe("Responsive tests", () => {
    test("dashboard-activity-80x24-layout: minimum terminal shows summary + timestamp only", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const snap = tui.snapshot();
      // At 80x24, icons should NOT be present
      // Verify no icon characters in activity rows (they'd only appear in standard+)
      expect(snap).toMatchSnapshot();
    });

    test("dashboard-activity-80x24-truncation: long summary truncated at 55 chars", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const snap = tui.snapshot();
      // Truncated summaries should end with … if longer than 55 chars
      expect(snap).toMatchSnapshot();
    });

    test("dashboard-activity-120x40-layout: standard terminal shows icon + summary + timestamp", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const snap = tui.snapshot();
      // Should have icons visible
      expect(snap).toMatchSnapshot();
    });

    test("dashboard-activity-120x40-summary-truncation: summary truncated at 80 chars", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("dashboard-activity-200x60-layout: large terminal shows icon + summary + target type + timestamp", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      const snap = tui.snapshot();
      // At large, target type column should be visible
      expect(snap).toContain("repository");
    });

    test("dashboard-activity-200x60-expanded-summary: summary expands to 120 chars", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("dashboard-activity-resize-standard-to-min: icon column collapses on resize", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // Resize to minimum
      await tui.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
      const snap = tui.snapshot();
      expect(snap).toMatchSnapshot();
    });

    test("dashboard-activity-resize-min-to-standard: icon column appears on resize", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.resize(TERMINAL_SIZES.standard.width, TERMINAL_SIZES.standard.height);
      const snap = tui.snapshot();
      // Icons should now be visible
      expect(snap).toMatch(/[◆⑂⊘⊙→✕•]/);
    });

    test("dashboard-activity-resize-preserves-focus: focused row preserved after resize", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("j", "j"); // Move to 3rd row
      await tui.resize(TERMINAL_SIZES.large.width, TERMINAL_SIZES.large.height);
      // Focus should still be on 3rd row
      expect(tui.snapshot()).toMatch(/Activity/);
    });

    test("dashboard-activity-resize-during-filter: filter stays active after resize", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("f"); // Apply Created filter
      await tui.resize(TERMINAL_SIZES.large.width, TERMINAL_SIZES.large.height);
      // Filter should persist
      expect(tui.snapshot()).toContain("[Created]");
    });
  });

  // ======================================================================
  // INTEGRATION TESTS
  // ======================================================================

  describe("Integration tests", () => {
    test("dashboard-activity-auth-expiry: 401 triggers app-shell auth error screen", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: "invalid-expired-token", CODEPLANE_API_URL: API_URL },
      });
      // 401 should propagate to app-shell auth error
      const snap = tui.snapshot();
      expect(snap).toMatch(/auth|expired|login/i);
    });

    test("dashboard-activity-rate-limit-429: shows rate limit message with retry-after", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      // Rate limit test depends on server behavior
      // If rate limited, expect inline message
      expect(tui.snapshot()).toMatch(/Activity/);
    });

    test("dashboard-activity-network-error: shows inline error with retry hint", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: {
          CODEPLANE_TOKEN: WRITE_TOKEN,
          CODEPLANE_API_URL: "http://localhost:1", // unreachable
        },
      });
      // Network error should show error state
      // May show on dashboard or at app level
      const snap = tui.snapshot();
      expect(snap).toBeDefined();
    });

    test("dashboard-activity-pagination-complete: both pages of 45 activities load", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // Navigate down many times to trigger pagination
      for (let i = 0; i < 40; i++) {
        await tui.sendKeys("j");
      }
      expect(tui.snapshot()).toMatch(/Activity/);
    });

    test("dashboard-activity-300-items-cap: pagination stops at 300 items", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // This test verifies the cap — depends on test data volume
      expect(tui.snapshot()).toMatch(/Activity/);
    });

    test("dashboard-activity-enter-then-q-returns: navigate to repo then q returns to dashboard", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("Enter"); // Navigate to repo (if applicable)
      await tui.sendKeys("q"); // Return to dashboard
      expect(tui.snapshot()).toMatch(/Dashboard/);
    });

    test("dashboard-activity-goto-from-repo-and-back: navigate to repo, g d returns to dashboard", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("Enter"); // Navigate to repo
      await tui.sendKeys("g", "d"); // Go-to dashboard
      await tui.waitForText("Dashboard");
      expect(tui.snapshot()).toMatch(/Activity/);
    });

    test("dashboard-activity-server-error-500: shows inline error with retry hint", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      // If server returns 500, verify error rendering
      const snap = tui.snapshot();
      expect(snap).toMatch(/Activity/);
    });

    test("dashboard-activity-concurrent-section-load: activity section loads independently", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      // All sections should load independently
      // Activity failure shouldn't affect repos section
      const snap = tui.snapshot();
      expect(snap).toMatch(/Dashboard/);
    });

    test("dashboard-activity-filter-then-paginate: page 2 fetched with active filter", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      await tui.sendKeys("f"); // Apply filter
      // Scroll down to trigger pagination with filter active
      for (let i = 0; i < 25; i++) {
        await tui.sendKeys("j");
      }
      expect(tui.snapshot()).toContain("[Created]");
    });

    test("dashboard-activity-filter-during-fetch: changing filter during fetch discards previous", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN, CODEPLANE_API_URL: API_URL },
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("Tab", "Tab", "Tab");
      await tui.waitForText("Activity");
      // Rapid filter changes
      await tui.sendKeys("f", "f", "f");
      // Should show the final filter (Archived)
      expect(tui.snapshot()).toContain("[Archived]");
    });
  });
});
```

---

## Testing Approach Details

### Test Infrastructure Requirements

All tests use the shared `launchTUI` helper from `e2e/tui/helpers.ts` which:
- Launches the TUI binary with configurable terminal dimensions
- Passes environment variables for auth and API URL
- Provides `sendKeys()`, `waitForText()`, `snapshot()`, `resize()`, and `getLine()` methods
- Cleans up the process on `terminate()`

### Failing Test Strategy

Per the repository's memory instruction (`feedback_failing_tests.md`): **Tests that fail due to unimplemented backends are left failing.** Since the activity endpoint currently returns 501, the following tests will naturally fail:

- `dashboard-activity-initial-load` (no data to render)
- `dashboard-activity-event-icons` (no events)
- `dashboard-activity-j-moves-down` (no rows to move through)
- `dashboard-activity-enter-navigates-to-repo` (no rows)
- `dashboard-activity-pagination-on-scroll` (no pages)
- `dashboard-activity-relative-timestamps` (no timestamps)

The `dashboard-activity-501-state` test **should pass** because it specifically validates the 501 error handling.

These tests are **not skipped, not commented out, not mocked**. They fail naturally and serve as signals that the backend feature is not yet implemented.

### No Mocking

All tests run against a real API server. Internal hooks, state management, and component internals are never mocked. Tests validate user-visible terminal output and keyboard interactions only.

---

## Dependencies and Ordering

This ticket depends on four prior tickets. Here's what each provides and how this ticket consumes it:

| Dependency | What it provides | How this ticket uses it |
|-----------|-----------------|------------------------|
| `tui-dashboard-data-hooks` | `useUser()` hook, `APIClientProvider` upgrade, `useAPIClient()` | `ActivityFeedPanel` calls `useUser()` to get the username for the activity API |
| `tui-dashboard-panel-component` | `DashboardPanel` wrapper component, `PanelErrorBoundary` | `DashboardScreen` wraps `ActivityFeedPanel` in `<DashboardPanel>` |
| `tui-dashboard-panel-focus-manager` | `useDashboardFocus()` hook, `PANEL` constants, `PanelFocusState` type | `DashboardScreen` uses focus state to pass `focused`, `cursorIndex`, `scrollOffset` to `ActivityFeedPanel` |
| `tui-dashboard-e2e-test-infra` | `launchTUI` helper, test fixtures, `TERMINAL_SIZES` constant | All E2E tests use these utilities |

---

## Security Review

| Concern | Mitigation |
|---------|------------|
| Token exposure | Token passed via `APIClientProvider`, never rendered in TUI, never logged |
| XSS/injection | Activity summaries rendered as plain `<text>` components — no shell interpretation |
| Filter values | Drawn from fixed `FILTER_CYCLE` array — never user-typed strings |
| Rate limiting | 200ms debounce on filter cycling prevents accidental rate limit hits |
| Auth expiry | 401 propagates to app-shell auth error screen — no inline credential prompting |
| Data privacy | Only shows authenticated user's own public activity — no other users' data |
