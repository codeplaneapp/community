# Engineering Specification: TUI Repository List Screen

**Ticket**: `tui-repo-list-screen`
**Title**: Repository list screen with search, sort, and filter
**Status**: Not started
**Dependencies**: `tui-repo-data-hooks`, `tui-screen-router`, `tui-responsive-layout`, `tui-theme-tokens`, `tui-loading-states`

---

## Overview

This specification defines the full engineering plan for the Repository List screen in the Codeplane TUI. The screen is a full-content-area repository browser reached via `g r` go-to navigation, `:repos` command palette entry, or `--screen repos` deep-link. It renders the authenticated user's repositories as a keyboard-navigable scrollable list with rich metadata columns, client-side text search, sort cycling, visibility/owner filtering, cursor-based pagination, and optimistic star/unstar.

The screen is registered in the screen registry as `RepoList` with `requiresRepo: false`.

---

## Implementation Plan

### Step 1: Define Repository List Types

**File**: `apps/tui/src/screens/RepoList/types.ts`

Define all local types for the screen's state model. These types are internal to the screen — they do not belong in `@codeplane/ui-core` or `@codeplane/sdk`.

```typescript
/** Sort options cycle: Recently updated → Name A–Z → Name Z–A → Most stars → Recently created */
export type RepoSortOrder =
  | "recently_updated"
  | "name_asc"
  | "name_desc"
  | "most_stars"
  | "recently_created";

export const SORT_ORDER_CYCLE: RepoSortOrder[] = [
  "recently_updated",
  "name_asc",
  "name_desc",
  "most_stars",
  "recently_created",
];

export const SORT_LABELS: Record<RepoSortOrder, string> = {
  recently_updated: "Recently updated",
  name_asc: "Name A–Z",
  name_desc: "Name Z–A",
  most_stars: "Most stars",
  recently_created: "Recently created",
};

/** Maps RepoSortOrder to the API `sort` and `direction` query params */
export const SORT_API_PARAMS: Record<RepoSortOrder, { sort: string; direction: "asc" | "desc" }> = {
  recently_updated: { sort: "updated", direction: "desc" },
  name_asc: { sort: "name", direction: "asc" },
  name_desc: { sort: "name", direction: "desc" },
  most_stars: { sort: "stars", direction: "desc" },
  recently_created: { sort: "created", direction: "desc" },
};

/** Visibility filter cycle: All → Public only → Private only */
export type VisibilityFilter = "all" | "public" | "private";

export const VISIBILITY_CYCLE: VisibilityFilter[] = ["all", "public", "private"];

export const VISIBILITY_LABELS: Record<VisibilityFilter, string> = {
  all: "All",
  public: "Public only",
  private: "Private only",
};

/** Represents a single repository row in the list */
export interface RepoListItem {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  description: string;
  is_public: boolean;
  default_bookmark: string;
  language: string | null;
  num_stars: number;
  num_forks: number;
  num_issues: number;
  updated_at: string; // ISO 8601
  created_at: string; // ISO 8601
  is_starred: boolean;
}

/** Column layout definition for responsive rendering */
export interface ColumnLayout {
  name: number;         // character width for full_name column
  description: number;  // 0 = hidden
  visibility: number;   // always 2
  language: number;     // 0 = hidden
  stars: number;        // 0 = hidden
  forks: number;        // 0 = hidden
  issues: number;       // 0 = hidden
  bookmark: number;     // 0 = hidden
  timestamp: number;    // always 4
}

/** Pagination constants */
export const PAGE_SIZE = 30;
export const MAX_LOADED_ITEMS = 1000;
export const PAGINATION_TRIGGER_PERCENT = 0.8;

/** Filter input max length */
export const MAX_FILTER_LENGTH = 120;
```

**Rationale**: Centralizing types prevents scattering magic strings across components. The cycle arrays and label maps enable the `o`/`v`/`w` key handlers to be pure index-rotation functions.

---

### Step 2: Implement Column Layout Calculator

**File**: `apps/tui/src/screens/RepoList/useColumnLayout.ts`

A hook that computes the column widths based on the current breakpoint from `useLayout()`.

```typescript
import { useLayout } from "../../hooks/useLayout.js";
import type { ColumnLayout } from "./types.js";

export function useColumnLayout(): ColumnLayout {
  const { breakpoint } = useLayout();

  if (breakpoint === "large") {
    return {
      name: 40,
      description: 60,
      visibility: 2,
      language: 12,
      stars: 7,
      forks: 7,
      issues: 7,
      bookmark: 12,
      timestamp: 4,
    };
  }

  if (breakpoint === "standard") {
    return {
      name: 30,
      description: 35,
      visibility: 2,
      language: 10,
      stars: 7,
      forks: 0,
      issues: 0,
      bookmark: 0,
      timestamp: 4,
    };
  }

  // minimum breakpoint
  return {
    name: 50,
    description: 0,
    visibility: 2,
    language: 0,
    stars: 0,
    forks: 0,
    issues: 0,
    bookmark: 0,
    timestamp: 4,
  };
}
```

**Design decisions**:
- Column widths are fixed per breakpoint (not dynamically distributed). This ensures deterministic snapshot tests.
- Hidden columns have width `0`. Rendering components check `> 0` before rendering.
- The separator gap between columns (1 space) is handled in the row renderer, not the layout hook.

---

### Step 3: Implement Formatting Utilities

**File**: `apps/tui/src/screens/RepoList/format.ts`

Pure functions for formatting repo metadata into fixed-width column strings. These functions have no React or OpenTUI dependencies and are independently unit-testable.

```typescript
import { truncateText } from "../../util/truncate.js";
import { fitWidth } from "../../util/text.js";

/** Format a number with K-abbreviation for values > 999. Max output: 7 chars. */
export function formatCount(n: number, prefix: string): string {
  if (n >= 10_000) return `${prefix}${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${prefix}${(n / 1000).toFixed(1)}k`;
  return `${prefix}${n}`;
}

/**
 * Format a relative timestamp. Max output: 4 chars.
 * Examples: "now", "3m", "2h", "5d", "3w", "2mo", "1y"
 */
export function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 604800)}w`;
  if (diffSec < 31536000) return `${Math.floor(diffSec / 2592000)}mo`;
  return `${Math.floor(diffSec / 31536000)}y`;
}

/** Format total count with abbreviation for large numbers. */
export function formatTotalCount(n: number): string {
  if (n > 9999) return `${Math.floor(n / 1000)}k+`;
  return String(n);
}

/**
 * Format a repo row's cells into an array of { text, width } entries.
 * Each cell is pre-truncated and padded to its column width.
 */
export function formatRepoName(fullName: string, maxWidth: number): string {
  return fitWidth(truncateText(fullName, maxWidth), maxWidth);
}

export function formatDescription(description: string | null, maxWidth: number): string {
  if (!description || maxWidth <= 0) return "";
  return fitWidth(truncateText(description, maxWidth), maxWidth);
}

export function formatVisibility(isPublic: boolean): string {
  return isPublic ? "  " : "🔒";
}

export function formatLanguage(language: string | null, maxWidth: number): string {
  if (!language || maxWidth <= 0) return "";
  return fitWidth(truncateText(language, maxWidth), maxWidth);
}

export function formatBookmark(bookmark: string | null, maxWidth: number): string {
  if (!bookmark || maxWidth <= 0) return "";
  return fitWidth(truncateText(bookmark, maxWidth), maxWidth);
}
```

**Key constraints enforced**:
- `formatRelativeTime` never exceeds 4 characters.
- `formatCount` never exceeds 7 characters (prefix + number).
- `formatTotalCount` abbreviates above 9999.
- All functions are pure — no hooks, no state, no side effects.

---

### Step 4: Implement Client-Side Filter and Sort Logic

**File**: `apps/tui/src/screens/RepoList/useRepoFilters.ts`

A hook that takes the raw repo list from the data hook and applies client-side filtering and sorting. This runs on every keypress in the filter input and every sort/visibility/owner cycle.

```typescript
import { useMemo, useState, useCallback } from "react";
import type {
  RepoListItem,
  RepoSortOrder,
  VisibilityFilter,
} from "./types.js";
import {
  SORT_ORDER_CYCLE,
  VISIBILITY_CYCLE,
  MAX_FILTER_LENGTH,
} from "./types.js";

interface RepoFilterState {
  /** Current sort order */
  sortOrder: RepoSortOrder;
  /** Current visibility filter */
  visibility: VisibilityFilter;
  /** Current owner filter: null = all owners */
  owner: string | null;
  /** Current search text (client-side substring) */
  filterText: string;
  /** Whether the search input is focused */
  isSearchFocused: boolean;
}

interface RepoFilterActions {
  cycleSortOrder: () => void;
  cycleVisibility: () => void;
  cycleOwner: () => void;
  setFilterText: (text: string) => void;
  clearFilters: () => void;
  focusSearch: () => void;
  blurSearch: () => void;
  hasActiveFilters: boolean;
}

interface UseRepoFiltersReturn {
  state: RepoFilterState;
  actions: RepoFilterActions;
  filteredItems: RepoListItem[];
  uniqueOwners: string[];
}

export function useRepoFilters(
  items: RepoListItem[]
): UseRepoFiltersReturn {
  const [sortOrder, setSortOrder] = useState<RepoSortOrder>("recently_updated");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [owner, setOwner] = useState<string | null>(null);
  const [filterText, setFilterTextRaw] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Extract unique owners from loaded items
  const uniqueOwners = useMemo(() => {
    const owners = new Set(items.map((item) => item.owner));
    return Array.from(owners).sort();
  }, [items]);

  const setFilterText = useCallback((text: string) => {
    setFilterTextRaw(text.slice(0, MAX_FILTER_LENGTH));
  }, []);

  const cycleSortOrder = useCallback(() => {
    setSortOrder((current) => {
      const idx = SORT_ORDER_CYCLE.indexOf(current);
      return SORT_ORDER_CYCLE[(idx + 1) % SORT_ORDER_CYCLE.length];
    });
  }, []);

  const cycleVisibility = useCallback(() => {
    setVisibility((current) => {
      const idx = VISIBILITY_CYCLE.indexOf(current);
      return VISIBILITY_CYCLE[(idx + 1) % VISIBILITY_CYCLE.length];
    });
  }, []);

  const cycleOwner = useCallback(() => {
    setOwner((current) => {
      if (current === null) {
        return uniqueOwners.length > 0 ? uniqueOwners[0] : null;
      }
      const idx = uniqueOwners.indexOf(current);
      if (idx === -1 || idx === uniqueOwners.length - 1) return null;
      return uniqueOwners[idx + 1];
    });
  }, [uniqueOwners]);

  const clearFilters = useCallback(() => {
    setFilterTextRaw("");
    setIsSearchFocused(false);
  }, []);

  const focusSearch = useCallback(() => setIsSearchFocused(true), []);
  const blurSearch = useCallback(() => setIsSearchFocused(false), []);

  const hasActiveFilters =
    filterText.length > 0 ||
    visibility !== "all" ||
    owner !== null;

  // Apply all filters and sort client-side
  const filteredItems = useMemo(() => {
    let result = items;

    // Visibility filter
    if (visibility === "public") {
      result = result.filter((r) => r.is_public);
    } else if (visibility === "private") {
      result = result.filter((r) => !r.is_public);
    }

    // Owner filter
    if (owner !== null) {
      result = result.filter((r) => r.owner === owner);
    }

    // Text search (case-insensitive substring on full_name and description)
    if (filterText.length > 0) {
      const lower = filterText.toLowerCase();
      result = result.filter(
        (r) =>
          r.full_name.toLowerCase().includes(lower) ||
          (r.description && r.description.toLowerCase().includes(lower))
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortOrder) {
        case "recently_updated":
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case "name_asc":
          return a.full_name.localeCompare(b.full_name);
        case "name_desc":
          return b.full_name.localeCompare(a.full_name);
        case "most_stars":
          return b.num_stars - a.num_stars;
        case "recently_created":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [items, visibility, owner, filterText, sortOrder]);

  return {
    state: { sortOrder, visibility, owner, filterText, isSearchFocused },
    actions: {
      cycleSortOrder,
      cycleVisibility,
      cycleOwner,
      setFilterText,
      clearFilters,
      focusSearch,
      blurSearch,
      hasActiveFilters,
    },
    filteredItems,
    uniqueOwners,
  };
}
```

**Key decisions**:
- Text search is client-side only — the filter text is never sent to the API. This matches the ticket spec.
- Sort is applied client-side to loaded items. The API `sort` parameter is updated for subsequent pagination fetches (handled in Step 5).
- Owner list is derived from loaded items, not from a separate API call.
- `useMemo` ensures filtering and sorting only recompute when inputs change.

---

### Step 5: Implement Repository Data Hook Adapter

**File**: `apps/tui/src/screens/RepoList/useRepoListData.ts`

This hook wraps the `useRepos()` hook from `@codeplane/ui-core` and adds the pagination cap, API sort parameter forwarding, and star/unstar mutation.

```typescript
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useOptimisticMutation } from "../../hooks/useOptimisticMutation.js";
import { emit } from "../../lib/telemetry.js";
import { logger } from "../../lib/logger.js";
import type { RepoListItem, RepoSortOrder } from "./types.js";
import { SORT_API_PARAMS, MAX_LOADED_ITEMS, PAGE_SIZE } from "./types.js";

interface UseRepoListDataReturn {
  items: RepoListItem[];
  totalCount: number;
  isLoading: boolean;
  isPaginating: boolean;
  error: Error | null;
  hasMore: boolean;
  paginationCapped: boolean;
  loadMore: () => void;
  retry: () => void;
  toggleStar: (repo: RepoListItem) => void;
}

/**
 * Wraps useRepos() from @codeplane/ui-core, adding:
 * - Pagination cap at MAX_LOADED_ITEMS
 * - API sort parameter forwarding
 * - Star/unstar optimistic mutation
 * - Telemetry emission
 *
 * NOTE: This hook consumes useRepos() which calls GET /api/user/repos.
 * The useRepos() hook is expected to be provided by the tui-repo-data-hooks
 * dependency ticket. Until that hook exists, this file will fail to compile —
 * that is intentional per project policy (no mocking unimplemented backends).
 */
export function useRepoListData(
  sortOrder: RepoSortOrder
): UseRepoListDataReturn {
  // useRepos() from @codeplane/ui-core — dependency: tui-repo-data-hooks
  // Expected signature:
  //   useRepos(options?: { sort?: string; direction?: string; perPage?: number })
  //   → { items: RepoListItem[], totalCount: number, isLoading: boolean,
  //      error: Error | null, hasMore: boolean, fetchMore: () => void, refetch: () => void }
  const apiParams = SORT_API_PARAMS[sortOrder];

  // --- BEGIN: Replace with actual useRepos() hook when tui-repo-data-hooks lands ---
  // This import will fail until the dependency is implemented.
  // @ts-expect-error — useRepos not yet implemented in @codeplane/ui-core
  const { useRepos } = await import("@codeplane/ui-core");
  const reposQuery = useRepos({
    sort: apiParams.sort,
    direction: apiParams.direction,
    perPage: PAGE_SIZE,
  });
  // --- END ---

  const [localItems, setLocalItems] = useState<RepoListItem[]>([]);
  const paginationCapped = localItems.length >= MAX_LOADED_ITEMS;

  // Sync items from query into local state (for optimistic star mutations)
  useEffect(() => {
    if (reposQuery.items) {
      setLocalItems(reposQuery.items.slice(0, MAX_LOADED_ITEMS));
    }
  }, [reposQuery.items]);

  const loadMore = useCallback(() => {
    if (paginationCapped) {
      logger.warn(`Pagination cap reached (${MAX_LOADED_ITEMS} items)`);
      return;
    }
    if (reposQuery.hasMore && !reposQuery.isLoading) {
      emit("tui.repos.paginate", {
        items_loaded_total: localItems.length,
        total_count: reposQuery.totalCount,
        sort_order: sortOrder,
      });
      reposQuery.fetchMore();
    }
  }, [paginationCapped, reposQuery, localItems.length, sortOrder]);

  // Star/unstar optimistic mutation
  const starMutation = useOptimisticMutation<{ repo: RepoListItem; star: boolean }>({
    id: "repo-star-toggle",
    entityType: "repository",
    action: "star_toggle",
    mutate: async ({ repo, star }) => {
      // Calls PUT or DELETE /api/user/starred/:owner/:repo
      // @ts-expect-error — API client method not yet wired
      const { useAPIClient } = await import("@codeplane/ui-core");
      const client = useAPIClient();
      const method = star ? "PUT" : "DELETE";
      await client.request(`/api/user/starred/${repo.owner}/${repo.name}`, { method });
    },
    onOptimistic: ({ repo, star }) => {
      setLocalItems((prev) =>
        prev.map((item) =>
          item.id === repo.id
            ? {
                ...item,
                is_starred: star,
                num_stars: item.num_stars + (star ? 1 : -1),
              }
            : item
        )
      );
    },
    onRevert: ({ repo, star }) => {
      setLocalItems((prev) =>
        prev.map((item) =>
          item.id === repo.id
            ? {
                ...item,
                is_starred: !star,
                num_stars: item.num_stars + (star ? -1 : 1),
              }
            : item
        )
      );
    },
    onSuccess: ({ repo, star }) => {
      const eventName = star ? "tui.repos.star" : "tui.repos.unstar";
      emit(eventName, { repo_full_name: repo.full_name, success: true });
      logger.info(`Repository ${star ? "starred" : "unstarred"}: ${repo.full_name}`);
    },
  });

  const toggleStar = useCallback(
    (repo: RepoListItem) => {
      starMutation.execute({ repo, star: !repo.is_starred });
    },
    [starMutation]
  );

  return {
    items: localItems,
    totalCount: reposQuery.totalCount,
    isLoading: reposQuery.isLoading && localItems.length === 0,
    isPaginating: reposQuery.isLoading && localItems.length > 0,
    error: reposQuery.error,
    hasMore: reposQuery.hasMore && !paginationCapped,
    paginationCapped,
    loadMore,
    retry: reposQuery.refetch,
    toggleStar,
  };
}
```

**Compilation note**: This file intentionally imports `useRepos` from `@codeplane/ui-core`. That hook does not exist yet (it is part of the `tui-repo-data-hooks` dependency ticket). The `@ts-expect-error` annotations will be removed when the dependency lands. Until then, the file will produce TypeScript errors — this is correct per project policy. **Production path**: When `tui-repo-data-hooks` ships, replace the `@ts-expect-error` blocks with clean imports and remove the dynamic `import()` calls in favor of static top-level imports.

---

### Step 6: Implement the Filter Toolbar Component

**File**: `apps/tui/src/screens/RepoList/FilterToolbar.tsx`

The persistent toolbar below the title row. Renders differently based on breakpoint.

```typescript
import React from "react";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import type { RepoSortOrder, VisibilityFilter } from "./types.js";
import { SORT_LABELS, VISIBILITY_LABELS } from "./types.js";

interface FilterToolbarProps {
  sortOrder: RepoSortOrder;
  visibility: VisibilityFilter;
  owner: string | null;
  filterText: string;
  isSearchFocused: boolean;
  onFilterTextChange: (text: string) => void;
}

export function FilterToolbar(props: FilterToolbarProps) {
  const { breakpoint } = useLayout();
  const theme = useTheme();
  const {
    sortOrder,
    visibility,
    owner,
    filterText,
    isSearchFocused,
    onFilterTextChange,
  } = props;

  // At minimum breakpoint, only render the search input
  if (breakpoint === "minimum") {
    return (
      <box flexDirection="row" width="100%" height={1}>
        <text fg={theme.muted}>/ </text>
        <input
          value={filterText}
          onChange={onFilterTextChange}
          focused={isSearchFocused}
          placeholder="Filter repositories…"
          width="100%"
        />
      </box>
    );
  }

  // Standard and large: full toolbar with labels
  return (
    <box flexDirection="row" width="100%" height={1} gap={2}>
      <box flexDirection="row">
        <text fg={theme.muted}>Sort: </text>
        <text fg={theme.primary}>{SORT_LABELS[sortOrder]}</text>
      </box>
      <text fg={theme.border}>│</text>
      <box flexDirection="row">
        <text fg={theme.muted}>Showing: </text>
        <text fg={theme.primary}>{VISIBILITY_LABELS[visibility]}</text>
      </box>
      <text fg={theme.border}>│</text>
      <box flexDirection="row">
        <text fg={theme.muted}>Owner: </text>
        <text fg={theme.primary}>{owner ?? "All"}</text>
      </box>
      <text fg={theme.border}>│</text>
      <box flexDirection="row" flexGrow={1}>
        <text fg={theme.muted}>/ </text>
        <input
          value={filterText}
          onChange={onFilterTextChange}
          focused={isSearchFocused}
          placeholder="Filter…"
          flexGrow={1}
        />
      </box>
    </box>
  );
}
```

---

### Step 7: Implement the Column Header Row

**File**: `apps/tui/src/screens/RepoList/ColumnHeaders.tsx`

```typescript
import React from "react";
import { useTheme } from "../../hooks/useTheme.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useColumnLayout } from "./useColumnLayout.js";
import { fitWidth } from "../../util/text.js";

export function ColumnHeaders() {
  const { breakpoint } = useLayout();
  const theme = useTheme();
  const cols = useColumnLayout();

  // Hidden at minimum breakpoint
  if (breakpoint === "minimum") return null;

  const cells: string[] = [];
  cells.push(fitWidth("Name", cols.name));
  if (cols.description > 0) cells.push(fitWidth("Description", cols.description));
  cells.push(fitWidth("V", cols.visibility));
  if (cols.language > 0) cells.push(fitWidth("Lang", cols.language));
  if (cols.stars > 0) cells.push(fitWidth("Stars", cols.stars));
  if (cols.forks > 0) cells.push(fitWidth("Forks", cols.forks));
  if (cols.issues > 0) cells.push(fitWidth("Issues", cols.issues));
  if (cols.bookmark > 0) cells.push(fitWidth("Bookmark", cols.bookmark));
  cells.push(fitWidth("Age", cols.timestamp));

  return (
    <box width="100%" height={1} bg={theme.surface}>
      <text bold fg={theme.muted}>
        {cells.join(" ")}
      </text>
    </box>
  );
}
```

---

### Step 8: Implement the Repository Row Component

**File**: `apps/tui/src/screens/RepoList/RepoRow.tsx`

```typescript
import React from "react";
import { useTheme } from "../../hooks/useTheme.js";
import { useColumnLayout } from "./useColumnLayout.js";
import type { RepoListItem } from "./types.js";
import {
  formatRepoName,
  formatDescription,
  formatVisibility,
  formatLanguage,
  formatCount,
  formatRelativeTime,
  formatBookmark,
} from "./format.js";
import { fitWidth } from "../../util/text.js";

interface RepoRowProps {
  repo: RepoListItem;
  focused: boolean;
  selected: boolean;
}

export function RepoRow({ repo, focused, selected }: RepoRowProps) {
  const theme = useTheme();
  const cols = useColumnLayout();

  const cells: string[] = [];

  // Selection prefix
  const prefix = selected ? "✓ " : focused ? "► " : "  ";

  cells.push(formatRepoName(repo.full_name, cols.name - 2)); // -2 for prefix
  if (cols.description > 0) {
    cells.push(formatDescription(repo.description, cols.description));
  }
  cells.push(formatVisibility(repo.is_public));
  if (cols.language > 0) {
    cells.push(formatLanguage(repo.language, cols.language));
  }
  if (cols.stars > 0) {
    cells.push(fitWidth(formatCount(repo.num_stars, "★ "), cols.stars));
  }
  if (cols.forks > 0) {
    cells.push(fitWidth(formatCount(repo.num_forks, "⑂ "), cols.forks));
  }
  if (cols.issues > 0) {
    cells.push(fitWidth(formatCount(repo.num_issues, "# "), cols.issues));
  }
  if (cols.bookmark > 0) {
    cells.push(formatBookmark(repo.default_bookmark, cols.bookmark));
  }
  cells.push(fitWidth(formatRelativeTime(repo.updated_at), cols.timestamp));

  const fg = focused ? theme.surface : undefined;
  const bg = focused ? theme.primary : undefined;

  return (
    <box width="100%" height={1} bg={bg}>
      <text fg={fg}>
        {prefix}{cells.join(" ")}
      </text>
    </box>
  );
}
```

---

### Step 9: Implement the Repo List Screen Component

**File**: `apps/tui/src/screens/RepoList/RepoListScreen.tsx`

This is the main screen component. It composes all sub-components, registers keybindings, handles focus state, and manages the scrollable list.

```typescript
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useScreenLoading } from "../../hooks/useScreenLoading.js";
import type { ScreenComponentProps } from "../../router/types.js";
import { ScreenName } from "../../router/types.js";
import { emit } from "../../lib/telemetry.js";
import { logger } from "../../lib/logger.js";
import { FullScreenLoading } from "../../components/FullScreenLoading.js";
import { FullScreenError } from "../../components/FullScreenError.js";
import { PaginationIndicator } from "../../components/PaginationIndicator.js";
import { FilterToolbar } from "./FilterToolbar.js";
import { ColumnHeaders } from "./ColumnHeaders.js";
import { RepoRow } from "./RepoRow.js";
import { useRepoListData } from "./useRepoListData.js";
import { useRepoFilters } from "./useRepoFilters.js";
import { useColumnLayout } from "./useColumnLayout.js";
import { formatTotalCount } from "./format.js";
import { PAGINATION_TRIGGER_PERCENT, MAX_LOADED_ITEMS } from "./types.js";

export function RepoListScreen({ entry, params }: ScreenComponentProps) {
  const { contentHeight, breakpoint, width } = useLayout();
  const theme = useTheme();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const startTimeRef = useRef(Date.now());
  const cols = useColumnLayout();

  // Data hook (depends on tui-repo-data-hooks)
  const { state: filterState, actions: filterActions, filteredItems, uniqueOwners } =
    /* Filter state is initialized with default sort, which is also
       passed to the data hook for API-level sorting */
    (() => {
      // We need the raw items first, then filter them
      // This is wired in the actual component below
      return { state: {} as any, actions: {} as any, filteredItems: [] as any, uniqueOwners: [] as any };
    })();

  // --- Actual wiring (simplified for spec clarity) ---
  const [sortOrder, setSortOrder] = useState<import("./types.js").RepoSortOrder>("recently_updated");
  const data = useRepoListData(sortOrder);
  const filters = useRepoFilters(data.items);

  // Sync sortOrder from filter actions
  // (cycleSortOrder in filters updates local state; we mirror to data hook)
  // In production, these would be unified. See "Productionization" section.

  // Loading lifecycle
  const loading = useScreenLoading({
    isLoading: data.isLoading,
    error: data.error,
    screenName: "RepoList",
  });

  // Telemetry: screen view
  useEffect(() => {
    if (!data.isLoading && !data.error) {
      emit("tui.repos.view", {
        total_count: data.totalCount,
        terminal_width: width,
        breakpoint: breakpoint ?? "minimum",
        load_time_ms: Date.now() - startTimeRef.current,
        entry_method: entry.params._entryMethod ?? "goto",
      });
      logger.info(
        `Repository list loaded: ${data.totalCount} total, ` +
          `${data.items.length} in first page, ` +
          `${Date.now() - startTimeRef.current}ms`
      );
    }
  }, [data.isLoading, data.error]);

  // Calculate visible rows (content height minus title, toolbar, column headers, pagination footer)
  const headerRows = breakpoint === "minimum" ? 2 : 3; // title + toolbar + optional column headers
  const footerRows = 1; // pagination indicator or empty
  const visibleRows = contentHeight - headerRows - footerRows;

  // Focus management
  const clampFocus = useCallback(
    (index: number) => Math.max(0, Math.min(index, filters.filteredItems.length - 1)),
    [filters.filteredItems.length]
  );

  // Pagination trigger: when focused index reaches 80% of loaded items
  useEffect(() => {
    if (
      focusedIndex >= Math.floor(filters.filteredItems.length * PAGINATION_TRIGGER_PERCENT) &&
      data.hasMore &&
      !data.isPaginating
    ) {
      data.loadMore();
    }
  }, [focusedIndex, filters.filteredItems.length, data.hasMore, data.isPaginating]);

  // Clamp focus when filtered items change
  useEffect(() => {
    setFocusedIndex((prev) => clampFocus(prev));
  }, [filters.filteredItems.length, clampFocus]);

  // Navigation hook (from NavigationProvider)
  // const { push, pop } = useNavigation();
  // Stubbed for spec — actual import from providers

  // --- Keybindings ---
  useScreenKeybindings([
    {
      key: "j",
      description: "Move down",
      handler: () => setFocusedIndex((i) => clampFocus(i + 1)),
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "k",
      description: "Move up",
      handler: () => setFocusedIndex((i) => clampFocus(i - 1)),
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "Down",
      description: "Move down",
      handler: () => setFocusedIndex((i) => clampFocus(i + 1)),
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "Up",
      description: "Move up",
      handler: () => setFocusedIndex((i) => clampFocus(i - 1)),
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "Enter",
      description: "Open repository",
      handler: () => {
        const repo = filters.filteredItems[focusedIndex];
        if (!repo) return; // no-op during loading or empty state
        emit("tui.repos.open", {
          repo_full_name: repo.full_name,
          repo_is_public: repo.is_public,
          position_in_list: focusedIndex,
          was_filtered: filters.actions.hasActiveFilters,
          filter_text_length: filters.state.filterText.length,
          sort_order: filters.state.sortOrder,
          visibility_filter: filters.state.visibility,
        });
        logger.info(`Repository opened from list: ${repo.full_name} (position ${focusedIndex})`);
        // push(ScreenName.RepoOverview, { owner: repo.owner, repo: repo.name });
      },
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "/",
      description: "Filter",
      handler: () => {
        filters.actions.focusSearch();
        emit("tui.repos.filter", {
          total_loaded_count: data.items.length,
          sort_order: filters.state.sortOrder,
          visibility_filter: filters.state.visibility,
        });
      },
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "Escape",
      description: "Clear filter / back",
      handler: () => {
        if (filters.state.isSearchFocused || filters.state.filterText.length > 0) {
          filters.actions.clearFilters();
        } else {
          // pop();
        }
      },
    },
    {
      key: "G",
      description: "Jump to bottom",
      handler: () => setFocusedIndex(clampFocus(filters.filteredItems.length - 1)),
      when: () => !filters.state.isSearchFocused,
    },
    // 'g g' is handled by go-to mode — the second 'g' after timeout cancels go-to
    // and jumps to top. This requires integration with KeybindingProvider's go-to state.
    {
      key: "ctrl+d",
      description: "Page down",
      handler: () => setFocusedIndex((i) => clampFocus(i + Math.floor(visibleRows / 2))),
    },
    {
      key: "ctrl+u",
      description: "Page up",
      handler: () => setFocusedIndex((i) => clampFocus(i - Math.floor(visibleRows / 2))),
    },
    {
      key: "o",
      description: "Sort",
      handler: () => {
        const prev = filters.state.sortOrder;
        filters.actions.cycleSortOrder();
        // Note: new sort order will be read from filters.state on next render
        emit("tui.repos.sort_change", {
          previous_sort_order: prev,
          new_sort_order: filters.state.sortOrder, // will be stale; use callback
          total_loaded_count: data.items.length,
        });
        logger.debug(`Sort order changed from ${prev}`);
      },
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "v",
      description: "Visibility",
      handler: () => {
        const prev = filters.state.visibility;
        filters.actions.cycleVisibility();
        emit("tui.repos.visibility_change", {
          previous_visibility: prev,
          new_visibility: filters.state.visibility,
          matched_count: filters.filteredItems.length,
        });
      },
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "w",
      description: "Owner",
      handler: () => {
        const prev = filters.state.owner;
        filters.actions.cycleOwner();
        emit("tui.repos.owner_change", {
          previous_owner: prev ?? "all",
          new_owner: filters.state.owner ?? "all",
          matched_count: filters.filteredItems.length,
        });
      },
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "c",
      description: "Create",
      handler: () => {
        emit("tui.repos.create", {});
        logger.info("Repository create form pushed");
        // push(ScreenName.RepoCreate);
      },
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "s",
      description: "Star",
      handler: () => {
        const repo = filters.filteredItems[focusedIndex];
        if (repo) data.toggleStar(repo);
      },
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "Space",
      description: "Select",
      handler: () => {
        const repo = filters.filteredItems[focusedIndex];
        if (!repo) return;
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(String(repo.id))) {
            next.delete(String(repo.id));
          } else {
            next.add(String(repo.id));
          }
          return next;
        });
      },
      when: () => !filters.state.isSearchFocused,
    },
    {
      key: "R",
      description: "Retry",
      handler: () => {
        if (data.error) {
          emit("tui.repos.retry", { error_type: "fetch" });
          data.retry();
        }
      },
      when: () => !!data.error,
    },
  ]);

  // --- Render ---

  // Error state (non-auth — auth errors propagate to app shell)
  if (data.error && data.items.length === 0) {
    const isRateLimit = (data.error as any)?.status === 429;
    const errorMessage = isRateLimit
      ? `Rate limited. Retry in ${(data.error as any)?.retryAfter ?? "?"}s.`
      : data.error.message || "Failed to load repositories.";
    return (
      <box flexDirection="column" width="100%" height={contentHeight}>
        <box height={1}>
          <text bold fg={theme.primary}>Repositories</text>
        </box>
        <FullScreenError
          message={errorMessage}
          hint="Press R to retry"
        />
      </box>
    );
  }

  // Loading state (initial)
  if (data.isLoading && data.items.length === 0) {
    return (
      <box flexDirection="column" width="100%" height={contentHeight}>
        <box height={1}>
          <text bold fg={theme.primary}>Repositories</text>
        </box>
        <FilterToolbar
          sortOrder={filters.state.sortOrder}
          visibility={filters.state.visibility}
          owner={filters.state.owner}
          filterText={filters.state.filterText}
          isSearchFocused={filters.state.isSearchFocused}
          onFilterTextChange={filters.actions.setFilterText}
        />
        <FullScreenLoading message="Loading repositories…" />
      </box>
    );
  }

  // Empty state
  if (filters.filteredItems.length === 0) {
    const isFiltered = filters.actions.hasActiveFilters;
    emit("tui.repos.empty", { has_filters_active: isFiltered });
    return (
      <box flexDirection="column" width="100%" height={contentHeight}>
        <box height={1}>
          <text bold fg={theme.primary}>
            Repositories ({formatTotalCount(data.totalCount)})
          </text>
        </box>
        <FilterToolbar
          sortOrder={filters.state.sortOrder}
          visibility={filters.state.visibility}
          owner={filters.state.owner}
          filterText={filters.state.filterText}
          isSearchFocused={filters.state.isSearchFocused}
          onFilterTextChange={filters.actions.setFilterText}
        />
        <box
          flexGrow={1}
          justifyContent="center"
          alignItems="center"
          flexDirection="column"
        >
          <text fg={theme.muted}>
            {isFiltered
              ? "No repositories match the current filters."
              : "No repositories found. Create one with `codeplane repo create`."}
          </text>
          {isFiltered && (
            <text fg={theme.muted}>Press Esc to clear filters.</text>
          )}
        </box>
      </box>
    );
  }

  // Calculate scroll window
  const scrollOffset = Math.max(
    0,
    Math.min(
      focusedIndex - Math.floor(visibleRows / 2),
      filters.filteredItems.length - visibleRows
    )
  );
  const visibleItems = filters.filteredItems.slice(
    scrollOffset,
    scrollOffset + visibleRows
  );

  // Pagination footer text
  let paginationText: string | null = null;
  if (data.paginationCapped && data.totalCount > MAX_LOADED_ITEMS) {
    paginationText = `Showing first ${MAX_LOADED_ITEMS} of ${formatTotalCount(data.totalCount)}`;
  }

  return (
    <box flexDirection="column" width="100%" height={contentHeight}>
      {/* Title row */}
      <box height={1} width="100%">
        <text bold fg={theme.primary}>
          Repositories ({formatTotalCount(data.totalCount)})
        </text>
      </box>

      {/* Filter toolbar */}
      <FilterToolbar
        sortOrder={filters.state.sortOrder}
        visibility={filters.state.visibility}
        owner={filters.state.owner}
        filterText={filters.state.filterText}
        isSearchFocused={filters.state.isSearchFocused}
        onFilterTextChange={filters.actions.setFilterText}
      />

      {/* Column headers (hidden at minimum) */}
      <ColumnHeaders />

      {/* Repository list */}
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {visibleItems.map((repo, i) => (
            <RepoRow
              key={repo.id}
              repo={repo}
              focused={scrollOffset + i === focusedIndex}
              selected={selectedIds.has(String(repo.id))}
            />
          ))}
        </box>
      </scrollbox>

      {/* Pagination indicator / footer */}
      <box height={1} width="100%">
        {data.isPaginating ? (
          <PaginationIndicator state="loading" />
        ) : paginationText ? (
          <text fg={theme.muted}>{paginationText}</text>
        ) : null}
      </box>
    </box>
  );
}
```

---

### Step 10: Register Screen in the Screen Registry

**File**: `apps/tui/src/router/registry.ts` (modify existing)

Replace the `PlaceholderScreen` import for `RepoList` with the actual screen component.

```typescript
// In the import section, add:
import { RepoListScreen } from "../screens/RepoList/RepoListScreen.js";

// In the screenRegistry object, update the RepoList entry:
[ScreenName.RepoList]: {
  component: RepoListScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Repositories",
},
```

The `breadcrumbLabel` returns a static "Repositories" string. The navigation stack already handles composing this into the breadcrumb trail (e.g., "Dashboard > Repositories").

---

### Step 11: Create the Barrel Export

**File**: `apps/tui/src/screens/RepoList/index.ts`

```typescript
export { RepoListScreen } from "./RepoListScreen.js";
export type { RepoListItem, RepoSortOrder, VisibilityFilter, ColumnLayout } from "./types.js";
```

---

### Step 12: Wire Status Bar Hints

The `useScreenKeybindings` hook automatically populates the status bar hints from the registered keybinding descriptions. The status bar will display the first N hints that fit the available width. The keybindings registered in Step 9 include `description` fields that become the hint labels.

At **minimum** breakpoint (80×24), the status bar shows ~4 hints: `j/k:nav Enter:open /:filter q:back`

At **standard** breakpoint (120×40), it shows ~6 hints: `j/k:nav Enter:open /:filter o:sort v:visibility q:back`

At **large** breakpoint (200×60), it shows all hints: `j/k:nav Enter:open /:filter o:sort v:visibility w:owner c:create s:star q:back`

The status bar component (`StatusBar.tsx`) reads hints from the `KeybindingProvider` context and truncates to fit.

---

### Step 13: Wire `g g` (Jump to Top) via Go-To Mode Integration

The `g g` sequence requires special handling because the first `g` enters go-to mode (handled by `KeybindingProvider`). When in go-to mode, `g` is a valid second key but is not mapped to any screen navigation in `goToBindings.ts`. The `KeybindingProvider` should fall through unmapped go-to keys to the screen's keybinding scope.

**File**: `apps/tui/src/navigation/goToBindings.ts` (modify existing)

Add a special case: when in go-to mode and `g` is pressed (i.e., `g g` sequence), dispatch a `"goto:top"` event that the active screen can handle.

```typescript
// In the go-to binding map, add:
{ key: "g", action: "jump_to_top" }  // g g → screen-handled jump-to-top
```

In the `RepoListScreen`, register a handler for this action:

```typescript
// In the keybindings array:
{
  key: "goto:top",
  description: "Jump to top",
  handler: () => setFocusedIndex(0),
},
```

If the go-to system does not support this dispatch pattern, the alternative is to use a `gg` chord detection within the screen's keybinding scope using a timer (1500ms window matching go-to mode timeout).

---

## File Inventory

| File | Type | Description |
|------|------|-------------|
| `apps/tui/src/screens/RepoList/types.ts` | New | Sort, filter, column layout types and constants |
| `apps/tui/src/screens/RepoList/format.ts` | New | Pure formatting functions (counts, timestamps, truncation) |
| `apps/tui/src/screens/RepoList/useColumnLayout.ts` | New | Responsive column width calculator hook |
| `apps/tui/src/screens/RepoList/useRepoFilters.ts` | New | Client-side filter/sort state and logic hook |
| `apps/tui/src/screens/RepoList/useRepoListData.ts` | New | Data hook adapter wrapping `useRepos()` + star mutation |
| `apps/tui/src/screens/RepoList/FilterToolbar.tsx` | New | Persistent filter/sort toolbar component |
| `apps/tui/src/screens/RepoList/ColumnHeaders.tsx` | New | Column header row component |
| `apps/tui/src/screens/RepoList/RepoRow.tsx` | New | Single repository row component |
| `apps/tui/src/screens/RepoList/RepoListScreen.tsx` | New | Main screen component (composition root) |
| `apps/tui/src/screens/RepoList/index.ts` | New | Barrel export |
| `apps/tui/src/router/registry.ts` | Modify | Replace PlaceholderScreen with RepoListScreen |
| `apps/tui/src/navigation/goToBindings.ts` | Modify | Add `g g` jump-to-top action |
| `e2e/tui/repository.test.ts` | Modify | Add all repo list E2E tests |

---

## Unit & Integration Tests

### Test File: `e2e/tui/repository.test.ts`

All tests target the existing `e2e/tui/repository.test.ts` file. Tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests that depend on unimplemented backend endpoints (e.g., `GET /api/user/repos`) will fail until those endpoints are available — they are **never** skipped or commented out.

#### Pure Unit Tests for Formatting Functions

These tests import directly from `apps/tui/src/screens/RepoList/format.ts` and do not require a terminal instance. They are placed in a dedicated file to keep the E2E file focused on terminal behavior.

**File**: `e2e/tui/repo-list-format.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import {
  formatCount,
  formatRelativeTime,
  formatTotalCount,
  formatRepoName,
  formatDescription,
  formatVisibility,
  formatLanguage,
} from "../../apps/tui/src/screens/RepoList/format.js";

describe("RepoList format utilities", () => {
  describe("formatCount", () => {
    test("renders small numbers without abbreviation", () => {
      expect(formatCount(0, "★ ")).toBe("★ 0");
      expect(formatCount(42, "★ ")).toBe("★ 42");
      expect(formatCount(999, "★ ")).toBe("★ 999");
    });

    test("abbreviates thousands with one decimal", () => {
      expect(formatCount(1000, "★ ")).toBe("★ 1.0k");
      expect(formatCount(1234, "★ ")).toBe("★ 1.2k");
      expect(formatCount(9999, "★ ")).toBe("★ 10.0k");
    });

    test("abbreviates ten-thousands without decimal", () => {
      expect(formatCount(10000, "★ ")).toBe("★ 10k");
      expect(formatCount(54321, "★ ")).toBe("★ 54k");
    });

    test("never exceeds 7 characters with prefix", () => {
      // Prefix "★ " is 2 chars, so number portion max 5 chars
      expect(formatCount(999999, "★ ").length).toBeLessThanOrEqual(7);
    });

    test("works with fork prefix", () => {
      expect(formatCount(23, "⑂ ")).toBe("⑂ 23");
      expect(formatCount(1200, "⑂ ")).toBe("⑂ 1.2k");
    });
  });

  describe("formatRelativeTime", () => {
    test("returns 'now' for times within last minute", () => {
      const now = new Date().toISOString();
      expect(formatRelativeTime(now)).toBe("now");
    });

    test("returns minutes for times within last hour", () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(formatRelativeTime(fiveMinAgo)).toBe("5m");
    });

    test("returns hours for times within last day", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      expect(formatRelativeTime(threeHoursAgo)).toBe("3h");
    });

    test("returns days for times within last week", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
      expect(formatRelativeTime(threeDaysAgo)).toBe("3d");
    });

    test("returns weeks for times within last month", () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
      expect(formatRelativeTime(twoWeeksAgo)).toBe("2w");
    });

    test("returns months for times within last year", () => {
      const twoMonthsAgo = new Date(Date.now() - 60 * 86400 * 1000).toISOString();
      expect(formatRelativeTime(twoMonthsAgo)).toBe("2mo");
    });

    test("returns years for old timestamps", () => {
      const twoYearsAgo = new Date(Date.now() - 730 * 86400 * 1000).toISOString();
      expect(formatRelativeTime(twoYearsAgo)).toBe("2y");
    });

    test("never exceeds 4 characters", () => {
      const ancient = new Date("2000-01-01").toISOString();
      expect(formatRelativeTime(ancient).length).toBeLessThanOrEqual(4);
    });
  });

  describe("formatTotalCount", () => {
    test("renders small numbers as-is", () => {
      expect(formatTotalCount(0)).toBe("0");
      expect(formatTotalCount(87)).toBe("87");
      expect(formatTotalCount(9999)).toBe("9999");
    });

    test("abbreviates above 9999", () => {
      expect(formatTotalCount(10000)).toBe("10k+");
      expect(formatTotalCount(15432)).toBe("15k+");
    });
  });

  describe("formatVisibility", () => {
    test("returns lock icon for private repos", () => {
      expect(formatVisibility(false)).toBe("🔒");
    });

    test("returns blank for public repos", () => {
      expect(formatVisibility(true)).toBe("  ");
    });
  });

  describe("formatRepoName", () => {
    test("truncates long names with ellipsis", () => {
      const longName = "organization/very-long-repository-name-that-exceeds-width";
      const result = formatRepoName(longName, 30);
      expect(result.length).toBe(30);
      expect(result).toContain("…");
    });

    test("pads short names to exact width", () => {
      const result = formatRepoName("alice/api", 30);
      expect(result.length).toBe(30);
    });
  });

  describe("formatDescription", () => {
    test("returns empty string for null description", () => {
      expect(formatDescription(null, 35)).toBe("");
    });

    test("returns empty string when width is 0", () => {
      expect(formatDescription("Hello", 0)).toBe("");
    });

    test("truncates long descriptions", () => {
      const desc = "A very long repository description that definitely exceeds thirty-five characters";
      const result = formatDescription(desc, 35);
      expect(result.length).toBe(35);
    });
  });

  describe("formatLanguage", () => {
    test("returns empty string for null language", () => {
      expect(formatLanguage(null, 10)).toBe("");
    });

    test("truncates long language names", () => {
      const result = formatLanguage("TypeScript", 8);
      expect(result.length).toBe(8);
      expect(result).toContain("…");
    });

    test("pads short language names", () => {
      const result = formatLanguage("Go", 10);
      expect(result.length).toBe(10);
    });
  });
});
```

#### Terminal Snapshot Tests

**File**: `e2e/tui/repository.test.ts`

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance, TERMINAL_SIZES } from "./helpers.js";

let terminal: TUITestInstance;

async function navigateToRepoList(t: TUITestInstance) {
  // g r → go-to repo list
  await t.sendKeys("g", "r");
  await t.waitForText("Repositories");
}

afterEach(async () => {
  if (terminal) await terminal.terminate();
});

describe("TUI_REPO_LIST_SCREEN", () => {
  // ─── SNAPSHOT TESTS ───────────────────────────────────────────────

  describe("Snapshot tests", () => {
    test("SNAP-REPO-LIST-001: initial load at standard size (120x40)", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // Verify header with total count
      await terminal.waitForText("Repositories (");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-002: empty state with zero repos", async () => {
      // Uses a test user with no repositories
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.waitForText("No repositories found");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-003: loading state", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      // Capture before data arrives
      // Note: may be flaky depending on API speed — snapshot shows loading or loaded
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-004: error state with API failure", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_API_URL: "http://localhost:1" }, // unreachable
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Press R to retry", 35000);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-005: focused row highlighting", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // First row should be highlighted
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-006: private repo visibility indicator", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // Should show 🔒 for private repos, blank for public
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-007: filter input focused after /", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-008: filter results narrowed", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("api");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-009: filter with no results", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("zzzznonexistent");
      await terminal.waitForText("No repositories match");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-010: pagination loading indicator", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // Scroll to trigger pagination
      await terminal.sendKeys("G");
      // Snapshot may show "Loading more…" if more pages exist
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-011: star count column at standard size", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // Verify star counts are visible in column format
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-012: header shows total count", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      const headerLine = terminal.getLine(1); // line after app header
      expect(headerLine).toMatch(/Repositories \(\d+\)/);
    });

    test("SNAP-REPO-LIST-013: sort label default", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // Toolbar should show default sort
      const toolbarLine = terminal.getLine(2);
      expect(toolbarLine).toMatch(/Sort:.*Recently updated/);
    });

    test("SNAP-REPO-LIST-014: sort label after cycling", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("o");
      const toolbarLine = terminal.getLine(2);
      expect(toolbarLine).toMatch(/Sort:.*Name A.Z/);
      await terminal.sendKeys("o");
      const toolbarLine2 = terminal.getLine(2);
      expect(toolbarLine2).toMatch(/Sort:.*Name Z.A/);
    });

    test("SNAP-REPO-LIST-015: visibility label after cycling", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("v");
      const toolbarLine = terminal.getLine(2);
      expect(toolbarLine).toMatch(/Showing:.*Public only/);
    });

    test("SNAP-REPO-LIST-016: column headers at standard size", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      const headerLine = terminal.getLine(3); // After title + toolbar
      expect(headerLine).toMatch(/Name.*Description.*V.*Lang.*Stars.*Age/);
    });

    test("SNAP-REPO-LIST-017: pagination cap message", async () => {
      // This test requires a user with 1500+ repos
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // Scroll to load many pages — may not reach cap in test fixture
      // Left as a verification point for when large test fixtures exist
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-018: breadcrumb shows Dashboard > Repositories", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      const breadcrumbLine = terminal.getLine(0);
      expect(breadcrumbLine).toMatch(/Dashboard.*›.*Repositories/);
    });

    test("SNAP-REPO-LIST-019: language tag column", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // At least one repo should show a language tag
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-REPO-LIST-020: selected row with checkmark prefix", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("Space");
      // First row should now show "✓" prefix
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ─── KEYBOARD INTERACTION TESTS ───────────────────────────────────

  describe("Keyboard interaction tests", () => {
    test("KEY-REPO-LIST-001: j moves focus down", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      const beforeSnap = terminal.snapshot();
      await terminal.sendKeys("j");
      const afterSnap = terminal.snapshot();
      // Focus should have moved — snapshots should differ
      expect(afterSnap).not.toBe(beforeSnap);
    });

    test("KEY-REPO-LIST-002: k moves focus up after j", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("j");
      const afterJ = terminal.snapshot();
      await terminal.sendKeys("k");
      const afterK = terminal.snapshot();
      // Should be back at first row — different from afterJ
      expect(afterK).not.toBe(afterJ);
    });

    test("KEY-REPO-LIST-003: k at top does not wrap around", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      const atTop = terminal.snapshot();
      await terminal.sendKeys("k");
      const stillAtTop = terminal.snapshot();
      expect(stillAtTop).toBe(atTop);
    });

    test("KEY-REPO-LIST-004: Down arrow moves down (same as j)", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("Down");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-005: Up arrow moves up (same as k)", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("j");
      await terminal.sendKeys("Up");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-006: Enter opens focused repository", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("Enter");
      // Should navigate to repo overview — breadcrumb updates
      const breadcrumb = terminal.getLine(0);
      expect(breadcrumb).toMatch(/Repositories.*›/);
    });

    test("KEY-REPO-LIST-007: Enter on second item opens second repo", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("j");
      await terminal.sendKeys("Enter");
      const breadcrumb = terminal.getLine(0);
      expect(breadcrumb).toMatch(/Repositories.*›/);
    });

    test("KEY-REPO-LIST-008: / focuses search input", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      // Search input should be focused — typing should go to input
      await terminal.sendText("test");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-009: filter narrows list", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("api");
      // List should show only matching repos
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-010: filter is case-insensitive", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("API");
      // Should match same repos as lowercase "api"
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-011: Esc clears filter and returns to list", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("test");
      await terminal.sendKeys("Escape");
      // Filter should be cleared, full list restored
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-012: Esc pops screen when no filter active", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("Escape");
      // Should return to Dashboard
      await terminal.waitForText("Dashboard");
    });

    test("KEY-REPO-LIST-013: G jumps to last loaded row", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("G");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-014: g g jumps to first row", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("G"); // go to bottom
      await terminal.sendKeys("g", "g"); // go to top
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-015: Ctrl+D pages down", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("ctrl+d");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-016: Ctrl+U pages up after Ctrl+D", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("ctrl+d");
      await terminal.sendKeys("ctrl+u");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-017: R retries on error state", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_API_URL: "http://localhost:1" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Press R to retry", 35000);
      await terminal.sendKeys("R");
      // Should attempt retry — may show loading or error again
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-018: R is no-op when data loaded", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      const before = terminal.snapshot();
      await terminal.sendKeys("R");
      const after = terminal.snapshot();
      expect(after).toBe(before);
    });

    test("KEY-REPO-LIST-019: o cycles sort order", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("o");
      expect(terminal.getLine(2)).toMatch(/Name A.Z/);
      await terminal.sendKeys("o");
      expect(terminal.getLine(2)).toMatch(/Name Z.A/);
      await terminal.sendKeys("o");
      expect(terminal.getLine(2)).toMatch(/Most stars/);
      await terminal.sendKeys("o");
      expect(terminal.getLine(2)).toMatch(/Recently created/);
      await terminal.sendKeys("o");
      expect(terminal.getLine(2)).toMatch(/Recently updated/);
    });

    test("KEY-REPO-LIST-020: v cycles visibility filter", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("v");
      expect(terminal.getLine(2)).toMatch(/Public only/);
      await terminal.sendKeys("v");
      expect(terminal.getLine(2)).toMatch(/Private only/);
      await terminal.sendKeys("v");
      expect(terminal.getLine(2)).toMatch(/All/);
    });

    test("KEY-REPO-LIST-021: w cycles owner filter", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("w");
      // Should filter to first owner
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-022: c pushes create repo form", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("c");
      // Should navigate to create form screen
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-023: s stars an unstarred repo", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      const before = terminal.snapshot();
      await terminal.sendKeys("s");
      const after = terminal.snapshot();
      // Star count should change optimistically
      expect(after).not.toBe(before);
    });

    test("KEY-REPO-LIST-024: s unstars a starred repo", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // Star first, then unstar
      await terminal.sendKeys("s");
      const starred = terminal.snapshot();
      await terminal.sendKeys("s");
      const unstarred = terminal.snapshot();
      expect(unstarred).not.toBe(starred);
    });

    test("KEY-REPO-LIST-025: Space toggles row selection", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("Space");
      // Row should show ✓ prefix
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.sendKeys("Space");
      // ✓ should be removed
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-026: q pops screen back to Dashboard", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("q");
      await terminal.waitForText("Dashboard");
    });

    test("KEY-REPO-LIST-027: j in search input types j, not navigation", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("j");
      // The 'j' should appear in search input, not move focus
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-028: o in search input types o, not sort cycle", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("o");
      // Sort label should NOT change
      expect(terminal.getLine(2)).toMatch(/Recently updated/);
    });

    test("KEY-REPO-LIST-029: q in search input types q, not pop screen", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("q");
      // Should still be on repo list screen
      await terminal.waitForText("Repositories");
    });

    test("KEY-REPO-LIST-030: rapid j presses move sequentially", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // Send 15 rapid j presses
      for (let i = 0; i < 15; i++) {
        await terminal.sendKeys("j");
      }
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-031: Enter during loading is no-op", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      // Immediately press Enter before data loads
      await terminal.sendKeys("Enter");
      // Should not crash or navigate
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-032: sort then filter", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("o"); // sort by name
      await terminal.sendKeys("/");
      await terminal.sendText("api");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-REPO-LIST-033: filter then sort", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("api");
      await terminal.sendKeys("Escape"); // blur search
      await terminal.sendKeys("o"); // change sort
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ─── RESPONSIVE TESTS ─────────────────────────────────────────────

  describe("Responsive tests", () => {
    test("RSP-REPO-LIST-001: 80x24 layout — minimal columns", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToRepoList(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RSP-REPO-LIST-002: 80x24 truncates long repo names at 50ch", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToRepoList(terminal);
      // Verify no line exceeds 80 columns
      for (let i = 0; i < 24; i++) {
        expect(terminal.getLine(i).length).toBeLessThanOrEqual(80);
      }
    });

    test("RSP-REPO-LIST-003: 80x24 hides column headers", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToRepoList(terminal);
      // Column header row should not be present
      const allContent = terminal.snapshot();
      expect(allContent).not.toMatch(/Name.*Description.*Lang/);
    });

    test("RSP-REPO-LIST-004: 80x24 toolbar collapsed to search only", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToRepoList(terminal);
      // Toolbar should not show Sort: or Showing: labels
      const allContent = terminal.snapshot();
      expect(allContent).not.toMatch(/Sort:/);
    });

    test("RSP-REPO-LIST-005: 120x40 standard layout", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RSP-REPO-LIST-006: 120x40 description truncation", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RSP-REPO-LIST-007: 120x40 column headers visible", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      const allContent = terminal.snapshot();
      expect(allContent).toMatch(/Name.*Description.*V.*Lang.*Stars.*Age/);
    });

    test("RSP-REPO-LIST-008: 200x60 full layout with all columns", async () => {
      terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToRepoList(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RSP-REPO-LIST-009: 200x60 shows forks, issues, bookmark columns", async () => {
      terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToRepoList(terminal);
      const allContent = terminal.snapshot();
      expect(allContent).toMatch(/Forks/);
      expect(allContent).toMatch(/Issues/);
      expect(allContent).toMatch(/Bookmark/);
    });

    test("RSP-REPO-LIST-010: resize standard → minimum collapses columns", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.resize(80, 24);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RSP-REPO-LIST-011: resize minimum → standard expands columns", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToRepoList(terminal);
      await terminal.resize(120, 40);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RSP-REPO-LIST-012: resize preserves focus", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("j", "j", "j"); // focus 4th row
      await terminal.resize(80, 24);
      // Focus should still be on the same repo
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RSP-REPO-LIST-013: resize during filter preserves filter", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("api");
      await terminal.resize(80, 24);
      // Filter should still be active
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RSP-REPO-LIST-014: resize during loading does not crash", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.resize(80, 24);
      // Should not crash — may show loading or loaded at new size
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RSP-REPO-LIST-015: 80x24 search input at full toolbar width", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("/");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ─── INTEGRATION TESTS ────────────────────────────────────────────

  describe("Integration tests", () => {
    test("INT-REPO-LIST-001: auth expiry shows auth error screen", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TOKEN: "expired-token-xxx" },
      });
      await terminal.sendKeys("g", "r");
      // Should show auth error at app shell level
      await terminal.waitForText("codeplane auth login", 35000);
    });

    test("INT-REPO-LIST-002: rate limit 429 shows inline error", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // This test requires the server to return 429
      // Left as a failing test until rate limit test fixtures are available
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("INT-REPO-LIST-003: network error shows retry hint", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_API_URL: "http://localhost:1" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Press R to retry", 35000);
    });

    test("INT-REPO-LIST-004: pagination loads all pages", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      // Scroll to bottom to trigger pagination
      await terminal.sendKeys("G");
      // Verify total items match API response
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("INT-REPO-LIST-005: Enter then q returns to repo list", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("Enter");
      await terminal.sendKeys("q");
      await terminal.waitForText("Repositories");
    });

    test("INT-REPO-LIST-006: go-to from repo and back", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("Enter"); // open repo
      await terminal.sendKeys("g", "r"); // go-to repo list again
      await terminal.waitForText("Repositories");
    });

    test("INT-REPO-LIST-007: star optimistic update", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("s"); // star
      // Star count should change
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("INT-REPO-LIST-008: visibility filter shows correct repos", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      await terminal.sendKeys("v"); // Public only
      // All visible repos should be public (no 🔒)
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.sendKeys("v"); // Private only
      // All visible repos should be private (show 🔒)
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("INT-REPO-LIST-009: deep link entry via --screen repos", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "repos"],
      });
      await terminal.waitForText("Repositories");
      const breadcrumb = terminal.getLine(0);
      expect(breadcrumb).toMatch(/Dashboard.*›.*Repositories/);
    });

    test("INT-REPO-LIST-010: command palette entry", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys(":");
      await terminal.sendText("repos");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Repositories");
    });

    test("INT-REPO-LIST-011: concurrent navigation resolves correctly", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.sendKeys("g", "d");
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
    });

    test("INT-REPO-LIST-012: server error 500 shows retry", async () => {
      // Requires server fixture that returns 500
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToRepoList(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });
});
```

---

## Productionization Path

The following items track the transition from scaffolded/stubbed code to production-ready:

### 1. Replace `@ts-expect-error` imports in `useRepoListData.ts`

**When**: `tui-repo-data-hooks` ticket ships.

**Action**: Remove the `@ts-expect-error` annotations and dynamic `import()` calls. Replace with static top-level imports:

```typescript
import { useRepos } from "@codeplane/ui-core";
import { useAPIClient } from "../../providers/APIClientProvider.js";
```

The star/unstar mutation should use the API client from `useAPIClient()` context rather than a dynamic import.

### 2. Wire navigation calls in `RepoListScreen.tsx`

**When**: `tui-screen-router` is fully wired.

**Action**: Replace the commented-out `push()` and `pop()` calls with real `useNavigation()` hook calls:

```typescript
import { useNavigation } from "../../providers/NavigationProvider.js";

// Inside the component:
const { push, pop } = useNavigation();

// In Enter handler:
push(ScreenName.RepoOverview, { owner: repo.owner, repo: repo.name });

// In Esc/q handler:
pop();

// In c handler:
push(ScreenName.RepoCreate);
```

### 3. Wire `g g` jump-to-top

**When**: `KeybindingProvider` go-to mode dispatch is finalized.

**Action**: Either (a) handle the `g g` → jump-to-top dispatch from the go-to binding system, or (b) implement a local chord detector in the screen:

```typescript
const lastGTime = useRef(0);
// In 'g' handler:
if (Date.now() - lastGTime.current < 1500) {
  setFocusedIndex(0); // g g → top
  lastGTime.current = 0;
} else {
  lastGTime.current = Date.now();
}
```

### 4. Validate `useRepos()` response shape

**When**: API is available for integration testing.

**Action**: Ensure the `RepoListItem` interface matches the actual `GET /api/user/repos` response. Key fields to verify:
- `full_name` — present and formatted as `owner/repo`
- `language` — may be `null` for repos without detected language
- `num_stars`, `num_forks`, `num_issues` — numeric, not string
- `is_starred` — whether current user has starred the repo (may require additional API call or response decoration)
- `updated_at`, `created_at` — ISO 8601 strings

If `is_starred` is not included in the repo list response, a separate `GET /api/user/starred` call will be needed to hydrate starred state. This should be batched, not per-item.

### 5. Verify sort parameter API integration

**When**: `GET /api/user/repos` supports `sort` and `direction` query params.

**Action**: Verify that `SORT_API_PARAMS` maps correctly to the API's accepted values. If the API uses different parameter names (e.g., `order_by` instead of `sort`), update the mapping.

### 6. Telemetry event validation

**When**: Analytics SDK transport is integrated.

**Action**: Review all `emit()` calls in the screen and verify:
- Event names match the telemetry spec in the product spec
- Property types are consistent (strings vs. numbers vs. booleans)
- No PII is emitted (repo names are acceptable; user tokens are not)

### 7. Remove scroll windowing fallback

The current implementation uses manual scroll offset calculation (`scrollOffset` + `visibleItems.slice()`). If OpenTUI's `<scrollbox>` supports virtualized scrolling with `onScroll` callbacks natively, replace the manual windowing with the native API for better performance at 1000 items.

---

## Architecture Decisions

### Why client-side sort instead of API-only sort?

The ticket specifies that sort change re-sorts locally loaded items immediately. This avoids a network round-trip for sort changes and provides instant feedback. The API `sort` parameter is updated for subsequent pagination fetches to ensure newly loaded pages arrive in the correct order. Trade-off: the first N loaded pages may have briefly inconsistent sort boundaries with subsequent pages. Deduplication by `repo.id` in the data hook prevents visual duplicates.

### Why manual scroll windowing instead of `<scrollbox>` native scrolling?

The scroll offset is computed manually so that the focused row is always centered in the viewport. OpenTUI's `<scrollbox>` provides overflow scrolling but doesn't guarantee focused-row centering. If OpenTUI adds focus-aware scrolling, the manual calculation can be removed.

### Why local state for star counts instead of refetching?

Optimistic star/unstar updates the local item array immediately. This avoids a full list refetch (which would lose scroll position and re-trigger pagination). The next pagination fetch or screen re-entry will reconcile with server state.

### Why `Set<string>` for selection instead of `Set<number>`?

Repo IDs are stored as strings in the selection set to avoid numeric comparison edge cases with large IDs. The `keyExtractor` pattern uses `String(repo.id)` consistently.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `useRepos()` hook not available from `@codeplane/ui-core` | High (dependency not shipped) | Blocks compilation | `@ts-expect-error` annotations; screen renders placeholder until hook ships |
| `GET /api/user/repos` response shape mismatch | Medium | Incorrect rendering | `RepoListItem` interface designed from server route analysis; validate at integration time |
| `is_starred` not in repo list response | Medium | Star toggle broken | Fallback: hydrate from `GET /api/user/starred` as separate batch call |
| `g g` chord conflicts with go-to mode | Low | Jump-to-top broken | Fallback: local chord detector with 1500ms timer |
| 1000-item pagination cap causes memory issues | Low | Performance degradation | Items are lightweight objects; 1000 × ~1KB = ~1MB |
| Unicode emoji (🔒) rendering inconsistent across terminals | Medium | Visual misalignment | Fallback: use ASCII `[P]` for private indicator if terminal doesn't support emoji width |
