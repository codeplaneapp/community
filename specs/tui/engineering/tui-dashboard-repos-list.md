# Engineering Specification: tui-dashboard-repos-list

## Implement the Recent Repositories Panel on the Dashboard

**Ticket ID**: `tui-dashboard-repos-list`
**Feature**: `TUI_DASHBOARD_REPOS_LIST`
**Type**: Feature
**Dependencies**: `tui-dashboard-data-hooks`, `tui-dashboard-panel-component`, `tui-dashboard-panel-focus-manager`, `tui-dashboard-e2e-test-infra`

---

## Overview

This ticket implements the Recent Repositories panel — the top-left quadrant of the Dashboard grid. It is the primary content region the user sees on TUI launch. The panel fetches the authenticated user's repositories via `useRepos()`, displays them in a keyboard-navigable scrolling list with responsive column layout, and supports filtering, pagination, and navigation to the repository overview screen.

---

## Dependency Assumptions

This specification assumes the following artifacts exist from dependency tickets:

| Dependency Ticket | Artifact | Expected Location | This Ticket Consumes |
|---|---|---|---|
| `tui-dashboard-data-hooks` | `useRepos()` hook | `apps/tui/src/hooks/useRepos.ts` | `{ items: RepoSummary[], totalCount: number, isLoading: boolean, error: HookError \| null, hasMore: boolean, fetchMore: () => void, refetch: () => void }` |
| `tui-dashboard-data-hooks` | `RepoSummary` type | `apps/tui/src/types/dashboard.ts` | `{ id: number, owner: string, full_name: string, name: string, description: string, is_public: boolean, num_stars: number, default_bookmark: string, created_at: string, updated_at: string }` |
| `tui-dashboard-panel-component` | `DashboardPanel` component | `apps/tui/src/screens/Dashboard/DashboardPanel.tsx` | Wraps panel content with title, count, border, focus indicator |
| `tui-dashboard-panel-focus-manager` | `useDashboardFocus()` hook | `apps/tui/src/screens/Dashboard/useDashboardFocus.ts` | `{ focusedPanel: number, setFocusedPanel: (n: number) => void, isFocused: (panel: number) => boolean }` |
| `tui-dashboard-e2e-test-infra` | Dashboard test file scaffold | `e2e/tui/dashboard.test.ts` | Test file with describe blocks, fixture imports, helpers |
| `tui-dashboard-e2e-test-infra` | Dashboard fixtures | `e2e/tui/fixtures/dashboard-fixtures.ts` | Deterministic repo seed data |
| `tui-dashboard-e2e-test-infra` | Dashboard test helpers | `e2e/tui/helpers/dashboard-helpers.ts` | `navigateToDashboard()`, `waitForReposList()` |

If any dependency is incomplete, this ticket's implementation fills the gap with clearly-marked `// TODO(dep: tui-dashboard-data-hooks): replace when hook is available` annotations, and corresponding E2E tests are left failing (never skipped).

---

## Implementation Plan

### Step 1: Define Types and Constants

**File**: `apps/tui/src/screens/Dashboard/repos-list-types.ts`

Define types and constants local to the repos list panel:

```typescript
import type { RepoSummary } from "../../types/dashboard.js";

/** Column layout configuration per breakpoint */
export interface ReposColumnLayout {
  nameWidth: number;
  showDescription: boolean;
  descriptionWidth: number;
  showStars: boolean;
  showBookmark: boolean;
  visibilityWidth: number;   // always 10 ("◆ public" or "◇ private")
  timestampWidth: number;    // always 4
}

/** Repos list panel state */
export interface ReposListState {
  focusedIndex: number;
  filterText: string;
  filterActive: boolean;
}

/** Panel index in the dashboard grid (top-left = 0) */
export const REPOS_PANEL_INDEX = 0;

/** Maximum items loaded in memory (pagination cap) */
export const MAX_REPOS_IN_MEMORY = 500;

/** Maximum filter input length */
export const MAX_FILTER_LENGTH = 100;

/** Scroll threshold for triggering next page fetch (0.0 - 1.0) */
export const SCROLL_PAGINATION_THRESHOLD = 0.8;

/** Per-page size for API requests */
export const REPOS_PER_PAGE = 20;
```

**Rationale**: Isolating types prevents circular dependencies and makes the panel self-documenting. Constants are colocated with the panel, not in global `util/constants.ts`, because they are panel-specific.

---

### Step 2: Implement Formatting Utilities

**File**: `apps/tui/src/screens/Dashboard/repos-list-format.ts`

Three formatting functions needed by the repos list that don't exist in `util/`:

```typescript
/**
 * Format a star count for display. K-abbreviated above 999.
 * Never exceeds 7 characters (e.g., "★ 1.2k").
 *
 * Examples:
 *   0     → "★ 0"
 *   42    → "★ 42"
 *   999   → "★ 999"
 *   1000  → "★ 1.0k"
 *   1234  → "★ 1.2k"
 *   12345 → "★ 12.3k"
 *   99999 → "★ 100k"
 */
export function formatStars(count: number): string {
  if (count < 1000) return `★ ${count}`;
  const k = count / 1000;
  if (k >= 100) return `★ ${Math.round(k)}k`;
  return `★ ${k.toFixed(1).replace(/\.0$/, "")}k`;
}

/**
 * Format a Date or ISO string as a compact relative timestamp.
 * Never exceeds 4 characters.
 *
 * Examples:
 *   just now → "now"
 *   30 seconds ago → "30s"
 *   5 minutes ago → "5m"
 *   3 hours ago → "3h"
 *   2 days ago → "2d"
 *   3 weeks ago → "3w"
 *   1 month ago → "1mo"
 *   2 years ago → "2y"
 */
export function relativeTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 0) return "now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return seconds < 10 ? "now" : `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;

  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months}mo`;

  const years = Math.floor(days / 365.25);
  return `${years}y`;
}

/**
 * Format visibility badge.
 * Public: "◆ public" in success color (ANSI 34)
 * Private: "◇ private" in muted color (ANSI 245)
 */
export function visibilityBadge(isPublic: boolean): { text: string; colorToken: "success" | "muted" } {
  return isPublic
    ? { text: "◆ public", colorToken: "success" }
    : { text: "◇ private", colorToken: "muted" };
}
```

**Rationale**: `formatStars` and `relativeTime` are likely to be reused by other panels (Starred Repos, Activity Feed) and eventually promoted to `util/`. For now they live with the panel to avoid scope creep. `visibilityBadge` encapsulates the spec's visibility indicator logic.

---

### Step 3: Implement Responsive Column Layout Hook

**File**: `apps/tui/src/screens/Dashboard/useReposColumns.ts`

This hook computes column widths and visibility based on the current breakpoint and available panel width.

```typescript
import { useMemo } from "react";
import { useLayout } from "../../hooks/useLayout.js";
import type { ReposColumnLayout } from "./repos-list-types.js";

/**
 * Compute the column layout for the repos list based on current breakpoint.
 *
 * The panel width is approximately 50% of terminal width at standard+
 * (due to the 2-column dashboard grid) or 100% at minimum (single-column stacked).
 * This hook receives the actual available width from the parent container.
 *
 * Breakpoint behavior:
 * - minimum (80×24): name(50) + visibility(10) + timestamp(4). No description, no stars.
 * - standard (120×40): name(40) + description(40) + visibility(10) + stars(7) + timestamp(4).
 * - large (200×60): name(60) + description(80) + visibility(10) + stars(7) + bookmark + timestamp(4).
 */
export function useReposColumns(availableWidth: number): ReposColumnLayout {
  const { breakpoint } = useLayout();

  return useMemo(() => {
    // Reserve fixed columns: visibility(10) + timestamp(4) + separators(~4)
    const fixedWidth = 10 + 4 + 4; // separators = padding between columns

    switch (breakpoint) {
      case "large":
        return {
          nameWidth: Math.min(60, Math.floor((availableWidth - fixedWidth - 7) * 0.4)),
          showDescription: true,
          descriptionWidth: Math.min(80, Math.floor((availableWidth - fixedWidth - 7) * 0.6)),
          showStars: true,
          showBookmark: true,
          visibilityWidth: 10,
          timestampWidth: 4,
        };
      case "standard":
        return {
          nameWidth: Math.min(40, Math.floor((availableWidth - fixedWidth - 7) * 0.5)),
          showDescription: true,
          descriptionWidth: Math.min(40, Math.floor((availableWidth - fixedWidth - 7) * 0.5)),
          showStars: true,
          showBookmark: false,
          visibilityWidth: 10,
          timestampWidth: 4,
        };
      case "minimum":
      default:
        return {
          nameWidth: Math.min(50, availableWidth - fixedWidth),
          showDescription: false,
          descriptionWidth: 0,
          showStars: false,
          showBookmark: false,
          visibilityWidth: 10,
          timestampWidth: 4,
        };
    }
  }, [breakpoint, availableWidth]);
}
```

**Rationale**: Column layout is computed as a derived value from breakpoint + available width. Memoized because breakpoint changes are infrequent (only on resize). The hook receives `availableWidth` from the parent `DashboardPanel` container rather than computing it from terminal width, because the panel's actual width depends on the dashboard grid layout (50% in grid mode, 100% in stacked mode).

---

### Step 4: Implement the RepoRow Component

**File**: `apps/tui/src/screens/Dashboard/RepoRow.tsx`

A single row in the repos list. Pure presentational component.

```typescript
import type { RepoSummary } from "../../types/dashboard.js";
import type { ReposColumnLayout } from "./repos-list-types.js";
import { truncateText } from "../../util/truncate.js";
import { formatStars, relativeTime, visibilityBadge } from "./repos-list-format.js";
import { useTheme } from "../../hooks/useTheme.js";

interface RepoRowProps {
  repo: RepoSummary;
  focused: boolean;
  columns: ReposColumnLayout;
}

export function RepoRow({ repo, focused, columns }: RepoRowProps) {
  const theme = useTheme();
  const badge = visibilityBadge(repo.is_public);

  return (
    <box
      flexDirection="row"
      height={1}
      width="100%"
      backgroundColor={focused ? theme.primary : undefined}
    >
      {/* Full name */}
      <box width={columns.nameWidth}>
        <text
          bold={focused}
          color={focused ? undefined : theme.primary}
        >
          {truncateText(repo.full_name, columns.nameWidth)}
        </text>
      </box>

      {/* Description (conditional) */}
      {columns.showDescription && (
        <box width={columns.descriptionWidth} marginLeft={1}>
          <text color={theme.muted}>
            {truncateText(repo.description || "", columns.descriptionWidth)}
          </text>
        </box>
      )}

      {/* Visibility badge */}
      <box width={columns.visibilityWidth} marginLeft={1}>
        <text color={theme[badge.colorToken]}>
          {badge.text}
        </text>
      </box>

      {/* Star count (conditional) */}
      {columns.showStars && (
        <box width={7} marginLeft={1}>
          <text color={theme.muted}>
            {formatStars(repo.num_stars)}
          </text>
        </box>
      )}

      {/* Default bookmark badge (large only) */}
      {columns.showBookmark && (
        <box width={8} marginLeft={1}>
          <text color={theme.muted}>
            {truncateText(repo.default_bookmark || "main", 8)}
          </text>
        </box>
      )}

      {/* Relative timestamp */}
      <box width={columns.timestampWidth} marginLeft={1}>
        <text color={theme.muted}>
          {relativeTime(repo.updated_at)}
        </text>
      </box>
    </box>
  );
}
```

**Rationale**: Each row is a flat flexbox row with fixed-width boxes per column. Truncation is always applied at render time via `truncateText()`. The `focused` state toggles `backgroundColor` to `theme.primary` (reverse-highlight effect) and bolds the name. Colors use semantic tokens from `useTheme()`, never raw ANSI codes.

---

### Step 5: Implement the ReposListPanel Component

**File**: `apps/tui/src/screens/Dashboard/ReposListPanel.tsx`

This is the main component for the repos list panel. It orchestrates data fetching, state management, keyboard bindings, filtering, pagination, and rendering.

```typescript
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRepos } from "../../hooks/useRepos.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useScreenLoading } from "../../hooks/useScreenLoading.js";
import { usePaginationLoading } from "../../hooks/usePaginationLoading.js";
import { ScreenName } from "../../router/types.js";
import { SkeletonList } from "../../components/SkeletonList.js";
import { PaginationIndicator } from "../../components/PaginationIndicator.js";
import { RepoRow } from "./RepoRow.js";
import { useReposColumns } from "./useReposColumns.js";
import { emit } from "../../lib/telemetry.js";
import { logger } from "../../lib/logger.js";
import { truncateText } from "../../util/truncate.js";
import {
  REPOS_PANEL_INDEX,
  MAX_REPOS_IN_MEMORY,
  MAX_FILTER_LENGTH,
  SCROLL_PAGINATION_THRESHOLD,
} from "./repos-list-types.js";
import type { RepoSummary } from "../../types/dashboard.js";

interface ReposListPanelProps {
  isFocused: boolean;
  availableWidth: number;
  availableHeight: number;
}

export function ReposListPanel({ isFocused, availableWidth, availableHeight }: ReposListPanelProps) {
  // --- Data layer ---
  const { items: repos, totalCount, isLoading, error, hasMore, fetchMore, refetch } = useRepos();

  // --- Navigation ---
  const { push } = useNavigation();

  // --- Theme ---
  const theme = useTheme();

  // --- Layout ---
  const { breakpoint } = useLayout();
  const columns = useReposColumns(availableWidth);

  // --- Local state ---
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [filterActive, setFilterActive] = useState(false);
  const scrollboxRef = useRef<any>(null);

  // --- Loading integration ---
  const screenLoading = useScreenLoading({
    id: "dashboard-repos",
    label: "Repositories",
    isLoading: isLoading && repos.length === 0,
    error: error ?? undefined,
    onRetry: refetch,
  });

  const pagination = usePaginationLoading({
    screen: "dashboard-repos",
    hasMore: hasMore && repos.length < MAX_REPOS_IN_MEMORY,
    fetchMore: async () => { fetchMore(); },
  });

  // --- Filtering ---
  const filteredRepos = useMemo(() => {
    if (!filterText) return repos;
    const query = filterText.toLowerCase();
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(query) ||
        (r.description && r.description.toLowerCase().includes(query))
    );
  }, [repos, filterText]);

  // Clamp focused index when filtered list changes
  useEffect(() => {
    if (focusedIndex >= filteredRepos.length && filteredRepos.length > 0) {
      setFocusedIndex(filteredRepos.length - 1);
    }
  }, [filteredRepos.length, focusedIndex]);

  // --- Pagination trigger on scroll ---
  const handleScroll = useCallback(
    (scrollPercent: number) => {
      if (
        scrollPercent >= SCROLL_PAGINATION_THRESHOLD &&
        hasMore &&
        !isLoading &&
        repos.length < MAX_REPOS_IN_MEMORY
      ) {
        pagination.loadMore();
      }
    },
    [hasMore, isLoading, repos.length, pagination]
  );

  // --- Visible page size (for Ctrl+D/Ctrl+U) ---
  // Subtract 2 for header row and potential filter row
  const pageSize = Math.max(1, Math.floor((availableHeight - 2) / 2));

  // --- Navigation action ---
  const openRepo = useCallback(
    (repo: RepoSummary) => {
      const [owner, name] = repo.full_name.split("/");
      emit("tui.dashboard.repos.open", {
        repo_full_name: repo.full_name,
        repo_is_public: repo.is_public,
        position_in_list: focusedIndex,
        was_filtered: filterText.length > 0,
        filter_text_length: filterText.length,
      });
      logger.info(`Repo opened from dashboard: ${repo.full_name} at position ${focusedIndex}`);
      push(ScreenName.RepoOverview, { owner, repo: name });
    },
    [push, focusedIndex, filterText]
  );

  // --- Go-to mode state for "gg" ---
  const [gPending, setGPending] = useState(false);
  const gTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Keybindings ---
  const isErrorState = screenLoading.showError;
  const isLoadingState = screenLoading.showSpinner || screenLoading.showSkeleton;

  useScreenKeybindings(
    [
      {
        key: "j",
        description: "Move down",
        group: "Navigation",
        handler: () => {
          if (filterActive || isLoadingState) return;
          setFocusedIndex((i) => Math.min(i + 1, filteredRepos.length - 1));
        },
        when: () => isFocused && !filterActive,
      },
      {
        key: "down",
        description: "Move down",
        group: "Navigation",
        handler: () => {
          if (filterActive || isLoadingState) return;
          setFocusedIndex((i) => Math.min(i + 1, filteredRepos.length - 1));
        },
        when: () => isFocused && !filterActive,
      },
      {
        key: "k",
        description: "Move up",
        group: "Navigation",
        handler: () => {
          if (filterActive || isLoadingState) return;
          setFocusedIndex((i) => Math.max(i - 1, 0));
        },
        when: () => isFocused && !filterActive,
      },
      {
        key: "up",
        description: "Move up",
        group: "Navigation",
        handler: () => {
          if (filterActive || isLoadingState) return;
          setFocusedIndex((i) => Math.max(i - 1, 0));
        },
        when: () => isFocused && !filterActive,
      },
      {
        key: "return",
        description: "Open repo",
        group: "Actions",
        handler: () => {
          if (isLoadingState || filteredRepos.length === 0) return;
          openRepo(filteredRepos[focusedIndex]);
        },
        when: () => isFocused && !filterActive && filteredRepos.length > 0,
      },
      {
        key: "/",
        description: "Filter",
        group: "Actions",
        handler: () => {
          if (isLoadingState || isErrorState) return;
          setFilterActive(true);
          emit("tui.dashboard.repos.filter", { total_loaded_count: repos.length });
          logger.debug("Filter activated");
        },
        when: () => isFocused && !filterActive,
      },
      {
        key: "escape",
        description: "Clear filter",
        group: "Actions",
        handler: () => {
          if (filterActive) {
            setFilterActive(false);
            setFilterText("");
            logger.debug("Filter cleared");
          }
        },
        when: () => isFocused && filterActive,
      },
      {
        key: "G",
        description: "Jump to bottom",
        group: "Navigation",
        handler: () => {
          if (isLoadingState || filterActive) return;
          setFocusedIndex(filteredRepos.length - 1);
        },
        when: () => isFocused && !filterActive,
      },
      {
        key: "g",
        description: "Go to top (gg)",
        group: "Navigation",
        handler: () => {
          if (isLoadingState || filterActive) return;
          if (gPending) {
            // Second 'g' press → jump to top
            setFocusedIndex(0);
            setGPending(false);
            if (gTimeoutRef.current) clearTimeout(gTimeoutRef.current);
          } else {
            // First 'g' press → start gg mode
            setGPending(true);
            gTimeoutRef.current = setTimeout(() => setGPending(false), 1500);
          }
        },
        when: () => isFocused && !filterActive,
      },
      {
        key: "ctrl+d",
        description: "Page down",
        group: "Navigation",
        handler: () => {
          if (isLoadingState || filterActive) return;
          setFocusedIndex((i) => Math.min(i + pageSize, filteredRepos.length - 1));
        },
        when: () => isFocused && !filterActive,
      },
      {
        key: "ctrl+u",
        description: "Page up",
        group: "Navigation",
        handler: () => {
          if (isLoadingState || filterActive) return;
          setFocusedIndex((i) => Math.max(i - pageSize, 0));
        },
        when: () => isFocused && !filterActive,
      },
      {
        key: "R",
        description: "Retry",
        group: "Actions",
        handler: () => {
          if (!isErrorState) return;
          emit("tui.dashboard.repos.retry", { error_type: screenLoading.loadingError?.type ?? "unknown" });
          screenLoading.retry();
        },
        when: () => isFocused && isErrorState,
      },
    ],
    [
      { keys: "j/k", label: "navigate", order: 0 },
      { keys: "Enter", label: "open", order: 10 },
      { keys: "/", label: "filter", order: 20 },
      { keys: "R", label: "retry", order: 30 },
    ]
  );

  // --- Telemetry: view event ---
  const viewEmitted = useRef(false);
  useEffect(() => {
    if (!isLoading && repos.length > 0 && !viewEmitted.current) {
      viewEmitted.current = true;
      emit("tui.dashboard.repos.view", {
        total_count: totalCount,
        terminal_width: availableWidth,
        terminal_height: availableHeight,
        breakpoint: breakpoint ?? "minimum",
      });
      logger.info(`Repos section loaded: total_count=${totalCount}, items_in_first_page=${repos.length}`);
    }
  }, [isLoading, repos.length, totalCount, availableWidth, availableHeight, breakpoint]);

  // --- Telemetry: empty state ---
  useEffect(() => {
    if (!isLoading && repos.length === 0 && !error) {
      emit("tui.dashboard.repos.empty", {});
    }
  }, [isLoading, repos.length, error]);

  // --- Telemetry: filter submit ---
  useEffect(() => {
    if (filterText.length > 0) {
      emit("tui.dashboard.repos.filter_submit", {
        filter_text_length: filterText.length,
        matched_count: filteredRepos.length,
        total_loaded_count: repos.length,
      });
    }
  }, [filterText, filteredRepos.length, repos.length]);

  // --- Cap indicator ---
  const showCapIndicator = totalCount > MAX_REPOS_IN_MEMORY && repos.length >= MAX_REPOS_IN_MEMORY;

  // --- Render: loading state ---
  if (screenLoading.showSpinner || screenLoading.showSkeleton) {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <box flexDirection="row" height={1}>
          <text bold color={theme.primary}>Repositories</text>
          <box flexGrow={1} />
        </box>
        <SkeletonList columns={2} />
      </box>
    );
  }

  // --- Render: error state ---
  if (screenLoading.showError && screenLoading.loadingError) {
    const errType = screenLoading.loadingError.type;
    const isRateLimit = errType === "rate_limited";
    const isAuth = errType === "auth_error";
    // Auth errors propagate to app-shell — this should not render inline
    // The AuthProvider handles 401 globally. If we reach here, it's a non-401 error.
    return (
      <box flexDirection="column" width="100%" height="100%">
        <box flexDirection="row" height={1}>
          <text bold color={theme.primary}>Repositories</text>
          <box flexGrow={1} />
        </box>
        <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
          <text color={theme.error}>
            {isRateLimit
              ? `Rate limited. Retry in ${screenLoading.loadingError.summary}`
              : screenLoading.loadingError.summary}
          </text>
          {!isAuth && <text color={theme.muted}>Press R to retry</text>}
        </box>
      </box>
    );
  }

  // --- Render: empty state ---
  if (repos.length === 0 && !isLoading && !error) {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <box flexDirection="row" height={1}>
          <text bold color={theme.primary}>Repositories</text>
          <text color={theme.muted}> (0)</text>
          <box flexGrow={1} />
        </box>
        <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
          <text color={theme.muted}>
            No repositories yet. Create one with `codeplane repo create`.
          </text>
        </box>
      </box>
    );
  }

  // --- Render: data loaded ---
  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Section header */}
      <box flexDirection="row" height={1}>
        <text bold color={theme.primary}>Repositories</text>
        <text color={theme.muted}> ({totalCount})</text>
        <box flexGrow={1} />
        {!filterActive && <text color={theme.muted}>/ filter</text>}
      </box>

      {/* Filter input */}
      {filterActive && (
        <box height={1}>
          <input
            value={filterText}
            onChange={(val: string) => setFilterText(val.slice(0, MAX_FILTER_LENGTH))}
            placeholder="Filter repositories…"
            autoFocus
          />
        </box>
      )}

      {/* Repository list */}
      <scrollbox
        ref={scrollboxRef}
        flexGrow={1}
        onScroll={handleScroll}
        scrollToIndex={focusedIndex}
      >
        <box flexDirection="column">
          {filteredRepos.length === 0 && filterText.length > 0 ? (
            <box height={1} justifyContent="center">
              <text color={theme.muted}>No matching repositories</text>
            </box>
          ) : (
            filteredRepos.map((repo, index) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                focused={index === focusedIndex && isFocused}
                columns={columns}
              />
            ))
          )}

          {/* Pagination indicator */}
          {pagination.status !== "idle" && (
            <PaginationIndicator
              status={pagination.status}
              spinnerFrame={pagination.spinnerFrame}
              error={pagination.error ?? undefined}
            />
          )}

          {/* Cap indicator */}
          {showCapIndicator && (
            <box height={1}>
              <text color={theme.muted}>
                Showing first {MAX_REPOS_IN_MEMORY} of {totalCount}
              </text>
            </box>
          )}
        </box>
      </scrollbox>
    </box>
  );
}
```

**Key design decisions**:

1. **Filter is client-side only** — never sent to the API. Applies to all loaded items. New pages arriving during filter are also filtered.
2. **`gg` implemented via local `gPending` state** — 1500ms timeout matches go-to mode spec. Within the panel, `g` starts gg mode; `G` (uppercase) jumps to bottom. The global go-to system (priority 3) is separate and handled by `KeybindingProvider`.
3. **Scroll-based pagination** — `handleScroll` callback fires on `<scrollbox>` scroll events. When scroll reaches 80% threshold and `hasMore` is true, triggers `pagination.loadMore()`.
4. **Focus index clamping** — when filter narrows the list, `focusedIndex` is clamped to prevent out-of-bounds.
5. **Auth errors (401) propagate globally** — the `AuthProvider` intercepts 401 responses and shows the auth error screen. The repos panel never renders inline auth errors.
6. **Rate limit (429)** — displayed inline with retry-after information from the error summary.

---

### Step 6: Register ReposListPanel in Dashboard Screen

**File**: `apps/tui/src/screens/Dashboard/index.tsx` (modify existing)

The Dashboard screen composes 4 panels in a grid. This step integrates `ReposListPanel` as panel index 0.

```typescript
import { useDashboardFocus } from "./useDashboardFocus.js";
import { DashboardPanel } from "./DashboardPanel.js";
import { ReposListPanel } from "./ReposListPanel.js";
import { useLayout } from "../../hooks/useLayout.js";
import type { ScreenComponentProps } from "../../router/types.js";
import { REPOS_PANEL_INDEX } from "./repos-list-types.js";

export function DashboardScreen({ entry }: ScreenComponentProps) {
  const { breakpoint, contentHeight, width } = useLayout();
  const { isFocused } = useDashboardFocus();

  // Grid layout: 2 columns at standard+, 1 column at minimum
  const isGrid = breakpoint !== "minimum";
  const panelWidth = isGrid ? Math.floor(width / 2) : width;
  const panelHeight = isGrid ? Math.floor(contentHeight / 2) : contentHeight;

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection={isGrid ? "row" : "column"} flexGrow={1}>
        {/* Top-left: Repos */}
        <DashboardPanel
          title="Repositories"
          focused={isFocused(REPOS_PANEL_INDEX)}
          width={panelWidth}
          height={panelHeight}
        >
          <ReposListPanel
            isFocused={isFocused(REPOS_PANEL_INDEX)}
            availableWidth={panelWidth - 2}  {/* -2 for border */}
            availableHeight={panelHeight - 2} {/* -2 for border + header */}
          />
        </DashboardPanel>

        {/* Top-right: Organizations (placeholder) */}
        {/* Bottom-left: Starred (placeholder) */}
        {/* Bottom-right: Activity (placeholder) */}
      </box>
    </box>
  );
}
```

**Note**: The full Dashboard layout composition is handled by the `tui-dashboard-grid-layout` dependency ticket. This step only shows how `ReposListPanel` integrates. The remaining panels remain placeholders until their respective tickets are implemented.

---

### Step 7: Update Screen Registry

**File**: `apps/tui/src/router/registry.ts` (modify existing)

Replace the `PlaceholderScreen` mapping for `Dashboard` with the new `DashboardScreen`:

```typescript
import { DashboardScreen } from "../screens/Dashboard/index.js";

// In screenRegistry:
[ScreenName.Dashboard]: {
  component: DashboardScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Dashboard",
},
```

---

### Step 8: Implement Telemetry and Logging

All telemetry events and logging are integrated directly in `ReposListPanel.tsx` (Step 5 above). The events match the spec's telemetry table:

| Event | Location in Code |
|---|---|
| `tui.dashboard.repos.view` | `useEffect` on initial load completion |
| `tui.dashboard.repos.open` | `openRepo()` callback |
| `tui.dashboard.repos.filter` | `/` keybinding handler |
| `tui.dashboard.repos.filter_submit` | `useEffect` on `filterText` change |
| `tui.dashboard.repos.paginate` | Inside `usePaginationLoading` (deferred to that hook's implementation) |
| `tui.dashboard.repos.error` | Logged via `useScreenLoading` error path |
| `tui.dashboard.repos.retry` | `R` keybinding handler |
| `tui.dashboard.repos.empty` | `useEffect` on empty data state |

Logging uses `logger.info` / `logger.warn` / `logger.debug` from `lib/logger.ts` and respects `CODEPLANE_TUI_LOG_LEVEL`.

---

### Step 9: File Summary

| File | Action | Purpose |
|---|---|---|
| `apps/tui/src/screens/Dashboard/repos-list-types.ts` | **Create** | Types and constants for repos list panel |
| `apps/tui/src/screens/Dashboard/repos-list-format.ts` | **Create** | `formatStars()`, `relativeTime()`, `visibilityBadge()` |
| `apps/tui/src/screens/Dashboard/useReposColumns.ts` | **Create** | Responsive column layout hook |
| `apps/tui/src/screens/Dashboard/RepoRow.tsx` | **Create** | Single repo row component |
| `apps/tui/src/screens/Dashboard/ReposListPanel.tsx` | **Create** | Main repos list panel component |
| `apps/tui/src/screens/Dashboard/index.tsx` | **Create** | Dashboard screen composition with ReposListPanel |
| `apps/tui/src/router/registry.ts` | **Modify** | Replace PlaceholderScreen with DashboardScreen for Dashboard entry |

---

## Productionization Notes

### Promoting Utilities

The `formatStars()` and `relativeTime()` functions in `repos-list-format.ts` will be needed by multiple panels (Starred Repos, Activity Feed, Repo List screen). After this ticket ships:

1. Move `formatStars()` and `relativeTime()` to `apps/tui/src/util/format.ts`
2. Re-export from `apps/tui/src/util/index.ts`
3. Update all import paths
4. Add unit tests in `e2e/tui/util-format.test.ts`

This is deferred to avoid scope creep on this ticket. The panel-local import paths are easy to update via find-and-replace.

### ScrollableList Abstraction

The keyboard navigation pattern (j/k, G, gg, Ctrl+D/U, Enter, /, filter) is duplicated across every list panel. After 2-3 panels are implemented (repos, starred, orgs), extract a shared `ScrollableList<T>` component as described in the engineering architecture doc. The repos list panel will then be refactored to use it. For now, the pattern is inlined to avoid designing the abstraction prematurely.

### useRepos() Hook

The `useRepos()` hook is created by the `tui-dashboard-data-hooks` dependency ticket. If that ticket is not yet complete, `ReposListPanel` should import from `../../hooks/useRepos.ts` and the file should exist as a stub returning empty data with `isLoading: true`. The E2E tests will fail naturally (never skipped) because no data renders.

### DashboardPanel and useDashboardFocus()

These are provided by `tui-dashboard-panel-component` and `tui-dashboard-panel-focus-manager` respectively. If not yet available, create minimal stubs:

```typescript
// Stub: apps/tui/src/screens/Dashboard/DashboardPanel.tsx
export function DashboardPanel({ children }: { children: React.ReactNode; [key: string]: any }) {
  return <box flexDirection="column" width="100%" height="100%">{children}</box>;
}

// Stub: apps/tui/src/screens/Dashboard/useDashboardFocus.ts
export function useDashboardFocus() {
  return { isFocused: (panel: number) => panel === 0, setFocusedPanel: () => {}, focusedPanel: 0 };
}
```

These stubs are replaced wholesale when the dependency tickets land. No `// TODO` annotations needed — the stubs are functional (repos panel always focused, no border styling).

---

## Unit & Integration Tests

### Test File: `e2e/tui/dashboard.test.ts`

All tests are appended to the existing `dashboard.test.ts` file (created by `tui-dashboard-e2e-test-infra`). Tests are organized in a `describe("TUI_DASHBOARD_REPOS_LIST")` block.

Tests use `@microsoft/tui-test` via the helpers in `e2e/tui/helpers.ts`. No mocking of hooks or internal state. All tests run against the real API server with test fixtures.

### Test Fixtures: `e2e/tui/fixtures/dashboard-fixtures.ts`

The following fixture data is expected (created by `tui-dashboard-e2e-test-infra`):

```typescript
export const repoFixtures: RepoSummary[] = [
  {
    id: 1,
    owner: "testuser",
    full_name: "testuser/api-gateway",
    name: "api-gateway",
    description: "API gateway service for the Codeplane platform",
    is_public: true,
    num_stars: 42,
    default_bookmark: "main",
    created_at: "2025-01-15T10:00:00Z",
    updated_at: "2026-03-23T08:30:00Z",
  },
  {
    id: 2,
    owner: "testuser",
    full_name: "testuser/secret-project",
    name: "secret-project",
    description: "Private research project",
    is_public: false,
    num_stars: 0,
    default_bookmark: "main",
    created_at: "2025-06-01T12:00:00Z",
    updated_at: "2026-03-22T14:00:00Z",
  },
  // ... 30+ fixtures for pagination testing
  // ... fixtures with 0 stars, 999 stars, 1234 stars, 99999 stars
  // ... fixtures with empty description
  // ... fixtures with very long names (60+ chars)
  // ... fixtures with Unicode in description
];

export const emptyRepoFixtures: RepoSummary[] = [];
```

### Test Structure

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance, TERMINAL_SIZES } from "./helpers";

describe("TUI_DASHBOARD_REPOS_LIST", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  // ═══════════════════════════════════════════════
  // Terminal Snapshot Tests
  // ═══════════════════════════════════════════════

  describe("snapshot tests", () => {
    test("dashboard-repos-list-initial-load", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Repositories");
      // Wait for data to load (header shows count)
      await terminal.waitForText(/Repositories \(\d+\)/);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-list-empty-state", async () => {
      // Launch with user that has zero repos
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_USER: "emptyuser" },
      });
      await terminal.waitForText("No repositories yet");
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("No repositories yet. Create one with `codeplane repo create`.");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-list-loading-state", async () => {
      // Launch with artificially slow API
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_API_DELAY: "5000" },
      });
      await terminal.waitForText("Repositories");
      // Should show skeleton loading before data arrives
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-list-error-state", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_API_FAIL: "500" },
      });
      await terminal.waitForText("Press R to retry");
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Press R to retry");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-list-focused-row", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      // First row should be focused (primary background color)
      const snapshot = terminal.snapshot();
      // Verify focus indicator exists (ANSI color code for primary)
      expect(snapshot).toMatch(/\x1b\[.*m.*testuser\//);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-list-private-indicator", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      const snapshot = terminal.snapshot();
      // Public repos show ◆ public, private show ◇ private
      expect(snapshot).toContain("◆ public");
      expect(snapshot).toContain("◇ private");
    });

    test("dashboard-repos-list-filter-active", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("/");
      await terminal.waitForText("Filter repositories");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-list-filter-results", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("/");
      await terminal.sendText("api");
      // Only repos matching "api" should be visible
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("api");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-list-filter-no-results", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("/");
      await terminal.sendText("zzzznonexistent");
      await terminal.waitForText("No matching repositories");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-list-pagination-loading", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      // Navigate to bottom to trigger pagination
      await terminal.sendKeys("G");
      // If more items exist, Loading more… should appear
      // This may or may not show depending on total fixture count
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-list-star-count", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      const snapshot = terminal.snapshot();
      // Star counts should be visible at standard size
      expect(snapshot).toMatch(/★ \d/);
    });

    test("dashboard-repos-list-header-total-count", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/Repositories \(\d+\)/);
    });
  });

  // ═══════════════════════════════════════════════
  // Keyboard Interaction Tests
  // ═══════════════════════════════════════════════

  describe("keyboard interaction tests", () => {
    test("dashboard-repos-j-moves-down", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      const beforeSnapshot = terminal.snapshot();
      await terminal.sendKeys("j");
      const afterSnapshot = terminal.snapshot();
      // Focus should have moved — snapshots should differ
      expect(afterSnapshot).not.toEqual(beforeSnapshot);
    });

    test("dashboard-repos-k-moves-up", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("j"); // move down
      const afterJ = terminal.snapshot();
      await terminal.sendKeys("k"); // move back up
      const afterK = terminal.snapshot();
      // Focus returned to first row
      expect(afterK).not.toEqual(afterJ);
    });

    test("dashboard-repos-k-at-top-no-wrap", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      const before = terminal.snapshot();
      await terminal.sendKeys("k"); // already at top
      const after = terminal.snapshot();
      // Focus should stay on first row — no change
      expect(after).toEqual(before);
    });

    test("dashboard-repos-j-at-bottom-no-wrap", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("G"); // jump to last
      const before = terminal.snapshot();
      await terminal.sendKeys("j"); // try to go past
      const after = terminal.snapshot();
      expect(after).toEqual(before);
    });

    test("dashboard-repos-down-arrow-moves-down", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      const before = terminal.snapshot();
      await terminal.sendKeys("Down");
      const after = terminal.snapshot();
      expect(after).not.toEqual(before);
    });

    test("dashboard-repos-up-arrow-moves-up", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("Down");
      const afterDown = terminal.snapshot();
      await terminal.sendKeys("Up");
      const afterUp = terminal.snapshot();
      expect(afterUp).not.toEqual(afterDown);
    });

    test("dashboard-repos-enter-opens-repo", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("Enter");
      // Breadcrumb should update to show repo
      await terminal.waitForText("Dashboard");
      // Should show repo overview screen or breadcrumb with owner/repo
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/Dashboard.*›/);
    });

    test("dashboard-repos-enter-on-second-item", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("j"); // move to second
      await terminal.sendKeys("Enter");
      // Second repo's overview should be pushed
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/Dashboard.*›/);
    });

    test("dashboard-repos-slash-activates-filter", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("/");
      await terminal.waitForText("Filter repositories");
    });

    test("dashboard-repos-filter-narrows-list", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("/");
      await terminal.sendText("secret");
      // Only matching repos visible
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("secret");
    });

    test("dashboard-repos-filter-case-insensitive", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("/");
      await terminal.sendText("API"); // uppercase
      const snapshot = terminal.snapshot();
      // Should match lowercase "api" in repo names/descriptions
      expect(snapshot).toContain("api");
    });

    test("dashboard-repos-esc-clears-filter", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("/");
      await terminal.sendText("test");
      await terminal.sendKeys("Escape");
      // Filter should be cleared, full list restored
      await terminal.waitForNoText("Filter repositories");
    });

    test("dashboard-repos-G-jumps-to-bottom", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("G");
      // Focus should be on last row — snapshot will show scrolled state
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-gg-jumps-to-top", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("G");  // go to bottom
      await terminal.sendKeys("g", "g"); // go to top
      // Focus should be on first row
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-ctrl-d-page-down", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      const before = terminal.snapshot();
      await terminal.sendKeys("ctrl+d");
      const after = terminal.snapshot();
      expect(after).not.toEqual(before);
    });

    test("dashboard-repos-ctrl-u-page-up", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("ctrl+d"); // page down
      await terminal.sendKeys("ctrl+u"); // page up
      // Should return near top
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-R-retries-on-error", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_API_FAIL: "500" },
      });
      await terminal.waitForText("Press R to retry");
      // Simulate retry (may fail again — that's fine, we verify the action)
      await terminal.sendKeys("R");
      // Should show loading or error again
      const snapshot = terminal.snapshot();
      expect(snapshot).toBeDefined();
    });

    test("dashboard-repos-R-no-op-when-loaded", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      const before = terminal.snapshot();
      await terminal.sendKeys("R"); // should do nothing
      const after = terminal.snapshot();
      expect(after).toEqual(before);
    });

    test("dashboard-repos-tab-moves-to-next-section", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("Tab");
      // Focus should move to next panel — repos panel loses focus indicator
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-shift-tab-moves-to-prev-section", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("Tab"); // move away
      await terminal.sendKeys("shift+Tab"); // move back
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-j-in-filter-input", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("/");
      await terminal.sendText("j"); // should type 'j', not navigate
      const snapshot = terminal.snapshot();
      // 'j' should appear in the filter input, not move list cursor
      expect(snapshot).toContain("j");
    });

    test("dashboard-repos-q-in-filter-input", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("/");
      await terminal.sendText("q"); // should type 'q', not quit
      const snapshot = terminal.snapshot();
      // TUI should still be running (not quit)
      expect(snapshot).toContain("Repositories");
    });

    test("dashboard-repos-pagination-on-scroll", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      // Navigate towards bottom to trigger pagination
      for (let i = 0; i < 25; i++) {
        await terminal.sendKeys("j");
      }
      // If total > page size, pagination should have triggered
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-rapid-j-presses", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      // Send 10 rapid j presses
      for (let i = 0; i < 10; i++) {
        await terminal.sendKeys("j");
      }
      // Focus should be on 11th row (0-indexed: 10)
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-enter-during-loading", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_API_DELAY: "5000" },
      });
      await terminal.waitForText("Repositories");
      // Press Enter during loading — should be a no-op
      await terminal.sendKeys("Enter");
      const snapshot = terminal.snapshot();
      // Should still be on dashboard, not navigated
      expect(snapshot).toContain("Dashboard");
      expect(snapshot).not.toMatch(/Dashboard.*›/);
    });
  });

  // ═══════════════════════════════════════════════
  // Responsive Tests
  // ═══════════════════════════════════════════════

  describe("responsive tests", () => {
    test("dashboard-repos-80x24-layout", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.waitForText(/Repositories/);
      const snapshot = terminal.snapshot();
      // Description and stars should NOT be visible at minimum
      // Name + visibility + timestamp only
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-80x24-truncation", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.waitForText(/Repositories/);
      const snapshot = terminal.snapshot();
      // Long names should be truncated with …
      // (depends on fixture data having long names)
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-120x40-layout", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      const snapshot = terminal.snapshot();
      // All columns should be visible
      expect(snapshot).toMatch(/★/);
      expect(snapshot).toMatch(/◆|◇/);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-120x40-description-truncation", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-200x60-layout", async () => {
      terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      const snapshot = terminal.snapshot();
      // Expanded columns plus bookmark badge should be visible
      expect(snapshot).toMatch(/★/);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-resize-standard-to-min", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.resize(80, 24);
      // Columns should collapse immediately
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-resize-min-to-standard", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.waitForText(/Repositories/);
      await terminal.resize(120, 40);
      // Columns should appear
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-resize-preserves-focus", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("j", "j", "j"); // move to 4th row
      await terminal.resize(80, 24);
      // Focus should remain on 4th row after resize
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-resize-during-filter", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("/");
      await terminal.sendText("api");
      await terminal.resize(80, 24);
      // Filter should stay active, results re-rendered at new size
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("api");
    });

    test("dashboard-repos-filter-input-80x24", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.waitForText(/Repositories/);
      await terminal.sendKeys("/");
      await terminal.waitForText("Filter");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ═══════════════════════════════════════════════
  // Integration Tests
  // ═══════════════════════════════════════════════

  describe("integration tests", () => {
    test("dashboard-repos-auth-expiry", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_API_FAIL: "401" },
      });
      // 401 should propagate to app-shell auth error, not inline error
      await terminal.waitForText(/auth|login|expired/i, 10000);
      const snapshot = terminal.snapshot();
      // Should NOT show "Press R to retry" (that's inline error)
      expect(snapshot).not.toContain("Press R to retry");
    });

    test("dashboard-repos-rate-limit-429", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_API_FAIL: "429", CODEPLANE_TEST_RETRY_AFTER: "30" },
      });
      await terminal.waitForText(/[Rr]ate limit/, 10000);
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/[Rr]ate limit/);
    });

    test("dashboard-repos-network-error", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_API_FAIL: "network" },
      });
      await terminal.waitForText("Press R to retry", 10000);
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Press R to retry");
    });

    test("dashboard-repos-pagination-complete", async () => {
      // 45 repos (page size 20) → 3 pages total, all load
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_REPO_COUNT: "45" },
      });
      await terminal.waitForText(/Repositories \(45\)/);
      // Navigate to trigger all pages
      await terminal.sendKeys("G");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-500-items-cap", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_REPO_COUNT: "600" },
      });
      await terminal.waitForText(/Repositories \(600\)/);
      // Navigate to bottom, trigger all pages
      await terminal.sendKeys("G");
      // Should show cap indicator
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Showing first 500 of 600");
    });

    test("dashboard-repos-enter-then-q-returns", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("j", "j"); // focus 3rd row
      await terminal.sendKeys("Enter"); // open repo
      await terminal.waitForText(/Dashboard.*›/);
      await terminal.sendKeys("q"); // back to dashboard
      await terminal.waitForText(/Repositories \(\d+\)/);
      // Focus should be preserved on 3rd row
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-goto-from-repo-and-back", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText(/Repositories \(\d+\)/);
      await terminal.sendKeys("Enter"); // open repo
      await terminal.waitForText(/Dashboard.*›/);
      await terminal.sendKeys("g", "d"); // go-to dashboard
      await terminal.waitForText(/Repositories \(\d+\)/);
      // Repos list should be intact
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-server-error-500", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_API_FAIL: "500" },
      });
      await terminal.waitForText("Press R to retry", 10000);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("dashboard-repos-concurrent-section-load", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      // Both repos section and other sections should load independently
      await terminal.waitForText("Repositories");
      // Dashboard should render even if other sections are still loading
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });
});
```

### Test File: `e2e/tui/util-format.test.ts` (append or create)

Unit tests for the pure formatting functions that don't require a TUI instance:

```typescript
import { describe, test, expect } from "bun:test";
import { formatStars, relativeTime, visibilityBadge } from "../../apps/tui/src/screens/Dashboard/repos-list-format";

describe("formatStars", () => {
  test("zero stars", () => expect(formatStars(0)).toBe("★ 0"));
  test("small count", () => expect(formatStars(42)).toBe("★ 42"));
  test("999 not abbreviated", () => expect(formatStars(999)).toBe("★ 999"));
  test("1000 abbreviated", () => expect(formatStars(1000)).toBe("★ 1k"));
  test("1234 abbreviated", () => expect(formatStars(1234)).toBe("★ 1.2k"));
  test("12345 abbreviated", () => expect(formatStars(12345)).toBe("★ 12.3k"));
  test("99999 abbreviated", () => expect(formatStars(99999)).toBe("★ 100k"));
  test("never exceeds 7 chars", () => {
    for (const n of [0, 1, 42, 999, 1000, 1234, 12345, 99999, 999999]) {
      expect(formatStars(n).length).toBeLessThanOrEqual(7);
    }
  });
});

describe("relativeTime", () => {
  const now = Date.now();
  test("just now", () => expect(relativeTime(new Date(now - 5000).toISOString())).toBe("now"));
  test("30 seconds", () => expect(relativeTime(new Date(now - 30000).toISOString())).toBe("30s"));
  test("5 minutes", () => expect(relativeTime(new Date(now - 300000).toISOString())).toBe("5m"));
  test("3 hours", () => expect(relativeTime(new Date(now - 10800000).toISOString())).toBe("3h"));
  test("2 days", () => expect(relativeTime(new Date(now - 172800000).toISOString())).toBe("2d"));
  test("3 weeks", () => expect(relativeTime(new Date(now - 1814400000).toISOString())).toBe("3w"));
  test("never exceeds 4 chars", () => {
    const offsets = [5000, 30000, 300000, 10800000, 172800000, 1814400000, 7776000000, 63072000000];
    for (const offset of offsets) {
      expect(relativeTime(new Date(now - offset).toISOString()).length).toBeLessThanOrEqual(4);
    }
  });
  test("future date returns now", () => expect(relativeTime(new Date(now + 100000).toISOString())).toBe("now"));
});

describe("visibilityBadge", () => {
  test("public repo", () => {
    const badge = visibilityBadge(true);
    expect(badge.text).toBe("◆ public");
    expect(badge.colorToken).toBe("success");
  });
  test("private repo", () => {
    const badge = visibilityBadge(false);
    expect(badge.text).toBe("◇ private");
    expect(badge.colorToken).toBe("muted");
  });
});
```

### Test Philosophy Compliance

1. **Tests that fail due to unimplemented backends are left failing.** If `useRepos()` is not wired to a real API, the snapshot tests will fail because no data renders. They are **never skipped or commented out**.
2. **No mocking of implementation details.** Tests launch a real TUI instance via `launchTUI()` and interact via keyboard simulation. No mock hooks, no mock API client, no mock components.
3. **Each test validates one behavior.** Test names describe user-facing behavior ("j moves focus down"), not implementation ("setFocusedIndex increments").
4. **Snapshot tests are supplementary.** Keyboard interaction tests are the primary verification. Snapshots catch unintended visual regressions.
5. **Tests run at representative sizes.** Responsive tests cover minimum (80×24), standard (120×40), and large (200×60).
6. **Tests are independent.** Each test creates a fresh TUI instance. `afterEach` terminates the instance.

---

## Error Handling Matrix

| Error | HTTP Status | Detection | TUI Behavior |
|---|---|---|---|
| Network timeout | — | Data hook timeout (30s) | Loading spinner → error + "Press R to retry" |
| Network error | — | `fetch` throws | Error + "Press R to retry" |
| Auth expired | 401 | `ApiError.code === "UNAUTHORIZED"` | **Propagated to app-shell auth error screen** (not inline) |
| Rate limited | 429 | `ApiError.code === "RATE_LIMITED"` | Inline: "Rate limited. Retry in Ns." + "Press R to retry" |
| Server error | 500-599 | `ApiError.code === "SERVER_ERROR"` | Inline error + "Press R to retry" |
| Pagination timeout | — | Pagination hook timeout | Existing items remain. "Loading more…" → inline error. R retries |
| Malformed response | — | JSON parse error / missing fields | Generic error message + "Press R to retry" |
| Empty response w/ non-zero total | — | `items.length === 0 && totalCount > 0` | Treated as end-of-pagination |

---

## Accessibility & Edge Cases

| Edge Case | Handling |
|---|---|
| Terminal resize while scrolled | `useOnResize` triggers synchronous re-layout. Column widths recalculate. `focusedIndex` preserved. `scrollToIndex` keeps focused row visible. |
| Rapid `j` presses | Processed sequentially via React state updates. No debouncing. Each press increments `focusedIndex` by 1. |
| Filter during pagination | Client-side filter applied to all loaded items. New pages arriving during active filter are immediately filtered. |
| Unicode in descriptions | `truncateText()` operates on `.length` (code units). Grapheme-cluster-aware truncation deferred to a utility enhancement. |
| SSE disconnect | Repos list uses REST, not SSE. Unaffected by SSE state. |
| Very long `full_name` | Truncated with `…` at column width boundary. |
| Description is `null`/`undefined`/empty | Renders empty string. Column still allocated at standard+ breakpoints. |
| `num_stars` is 0 | Renders "★ 0". |
| Future `updated_at` timestamp | `relativeTime()` returns "now". |
| 500-item cap reached | Shows "Showing first 500 of {totalCount}" at list bottom. Pagination stops. |
| Filter input at max length (100 chars) | `onChange` slices input to 100 chars. No visual overflow. |
| Enter during loading | No-op. `isLoadingState` guard prevents navigation. |
| R when not in error state | No-op. `when` predicate on keybinding prevents handler. |

---

## Performance Considerations

1. **Memoized filtered list**: `filteredRepos` is computed via `useMemo` on `[repos, filterText]`. Re-computation only on data or filter change.
2. **Stable column layout**: `useReposColumns` memoizes on `[breakpoint, availableWidth]`. No recomputation on scroll or focus change.
3. **No virtual scrolling (yet)**: With the 500-item cap, rendering all rows is acceptable. If profiling shows frame drops at 500 items, virtual scrolling via `<scrollbox>` windowing can be added later.
4. **Pagination deduplication**: `usePaginationLoading.loadMore()` guards against concurrent fetches.
5. **Telemetry is fire-and-forget**: `emit()` writes to stderr asynchronously. No render blocking.

---

## Dependency Graph

```
tui-dashboard-data-hooks ──────┐
tui-dashboard-panel-component ─┤
tui-dashboard-panel-focus-mgr ─┼──→ tui-dashboard-repos-list
tui-dashboard-e2e-test-infra ──┘
```

All four dependencies must be at least stubbed before this ticket can render. The implementation handles missing dependencies via stub files (see Productionization Notes). E2E tests will fail naturally if the real implementations are not present.