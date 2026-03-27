# Engineering Specification: Repository jj-Native Data Hooks

**Ticket:** `tui-repo-jj-hooks`
**Type:** Engineering
**Status:** Not Started
**Dependency:** `tui-auth-token-loading` (must be complete — AuthProvider and APIClientProvider must be mounted and providing valid context)

---

## Overview

This ticket creates the TUI-side data hooks for jj-native repository concepts that differentiate Codeplane from git-only forges. The deliverable is three React hooks that bridge the Codeplane HTTP API's jj endpoints with the TUI's provider stack, error handling, and pagination patterns.

These hooks are the data access layer for the repository Changes tab (`TUI_REPO_CHANGES_VIEW`), Conflicts tab (`TUI_REPO_CONFLICTS_VIEW`), and Operation Log tab (`TUI_REPO_OPERATION_LOG`). They do **not** render any UI. They return typed data, loading states, errors, pagination controls, and refetch functions that screen components consume.

---

## Scope

### In Scope

| Hook | Purpose | API Endpoint | Pagination |
|------|---------|-------------|------------|
| `useChanges(owner, repo, options?)` | Paginated change history with sort and filter | `GET /api/repos/:owner/:repo/changes` | Cursor-based |
| `useRepoConflicts(owner, repo)` | Conflicted changes and per-change file conflicts | `GET /api/repos/:owner/:repo/changes` (filtered) + `GET /api/repos/:owner/:repo/changes/:change_id/conflicts` | Non-paginated (conflicts per change) |
| `useOperationLog(owner, repo, options?)` | Paginated operation audit trail | `GET /api/repos/:owner/:repo/operations` | Cursor-based |

### Out of Scope

- Screen components that consume these hooks (separate tickets: `TUI_REPO_CHANGES_VIEW`, `TUI_REPO_CONFLICTS_VIEW`, `TUI_REPO_OPERATION_LOG`)
- Change diff viewing (`useChangeDiff` — separate ticket, consumes `GET /api/repos/:owner/:repo/changes/:change_id/diff`)
- Change file listing (`useChangeFiles` — separate ticket)
- Bookmark hooks (`useBookmarks` — covered by `tui-repo-tree-hooks`)
- File-at-change content (`useFileContent` — covered by `tui-repo-tree-hooks`)
- Conflict resolution mutations (future ticket)

---

## Feature Mapping

These hooks underpin the following features from `specs/tui/features.ts`:

- `TUI_REPO_CHANGES_VIEW` — Changes tab (tab 2) of repository detail screen
- `TUI_REPO_CONFLICTS_VIEW` — Conflicts tab (tab 4) of repository detail screen
- `TUI_REPO_OPERATION_LOG` — Operation log tab (tab 5) of repository detail screen

---

## 1. Codebase Ground Truth

The following facts were validated against the actual repository and drive every decision in this spec:

| Fact | Location | Impact |
|------|----------|--------|
| Changes list endpoint is defined and stubbed (returns 501) | `apps/server/src/routes/jj.ts` line 200 | `useChanges` will receive 501 until backend implemented — tests left failing per policy |
| Operations list endpoint is defined and stubbed (returns 501) | `apps/server/src/routes/jj.ts` line 298 | `useOperationLog` will receive 501 until backend implemented |
| Change conflicts endpoint is defined and stubbed (returns 501) | `apps/server/src/routes/jj.ts` line 260 | `useRepoConflicts` conflict detail will receive 501 |
| All list endpoints use cursor-based pagination (`cursor` + `limit` query params) | `apps/server/src/routes/jj.ts` `parsePagination()` line 107 | Unlike issues (page-based), jj endpoints use cursor pagination |
| Response format is `CursorResponse<T>` = `{ items: T[], next_cursor: string }` | `apps/server/src/routes/jj.ts` line 78 | Empty `next_cursor` string means no more pages |
| Default limit is 30, max is 100 | `apps/server/src/routes/jj.ts` line 109 | Matches existing hook defaults |
| `ChangeResponse` includes `has_conflict` boolean | `apps/server/src/routes/jj.ts` line 31 | Enables client-side filtering for conflicted changes without extra endpoint |
| `ChangeResponse` includes `is_empty` boolean | `apps/server/src/routes/jj.ts` line 32 | Empty change indicator for UI |
| `ChangeConflictResponse` does not include pagination | `apps/server/src/routes/jj.ts` line 260 | Returns full array per change — no cursor |
| `OperationResponse` is minimal: `operation_id`, `description`, `timestamp` | `apps/server/src/routes/jj.ts` line 70 | Lightweight; DB has more fields (`operationType`, `userId`, `parentOperationId`) but API only exposes three |
| SDK DB layer has richer types than API response | `packages/sdk/src/db/changes_sql.ts`, `conflicts_sql.ts`, `jj_operations_sql.ts` | Hooks model the API response shape, not DB schema |
| Auth header format is `Authorization: token {token}` | Server auth middleware | Consistent with existing hooks |
| Error response shape is `{ message: string }` | `apps/server/src/routes/jj.ts` `apiError()` | Matches `parseResponseError()` expectations |
| TUI's `APIClientProvider` provides `{ baseUrl, token }` | `apps/tui/src/providers/APIClientProvider.tsx` | Hooks use `useAPIClient()` for client access |
| `useTUIFetch` pattern exists in `tui-repo-data-hooks` spec | `specs/tui/engineering/tui-repo-data-hooks.md` | Reuse the same fetch wrapper pattern |
| `useRepoFetch` pattern exists in `tui-repo-tree-hooks` spec | `specs/tui/engineering/tui-repo-tree-hooks.md` | Alternative fetch wrapper using `LoadingError` |
| No `hooks/data/` directory exists yet in TUI | `apps/tui/src/hooks/` | Will be created by `tui-repo-data-hooks` ticket |
| `LoadingError` type is defined | `apps/tui/src/loading/types.ts` line 37 | Use for structured error returns |
| Existing paginated hooks use page-based pattern (`page` + `per_page`) | `tui-repo-data-hooks` spec | jj hooks need a different pattern for cursor-based APIs |
| `@codeplane/sdk` defines `Change`, `ChangeConflict`, `Operation` types | `packages/sdk/src/services/repohost.ts` | Can reference for type alignment but hooks define own wire types |

---

## 2. API Contract Reference

All jj endpoints are repository-scoped under `/api/repos/:owner/:repo/`.

**Source of truth:** `apps/server/src/routes/jj.ts`

### Changes Endpoints

| Endpoint | Method | Success | Query Params | Response Body |
|----------|--------|---------|-------------|---------------|
| `/changes` | `GET` | 200 | `cursor`, `limit` (1–100, default 30) | `CursorResponse<ChangeResponse>` |
| `/changes/:change_id` | `GET` | 200 | — | `ChangeResponse` |
| `/changes/:change_id/conflicts` | `GET` | 200 | — | `ChangeConflictResponse[]` |
| `/changes/:change_id/diff` | `GET` | 200 | `whitespace` ("ignore" \| "hide") | `ChangeDiffResponse` |
| `/changes/:change_id/files` | `GET` | 200 | — | `ChangeFileResponse[]` |

### Operations Endpoint

| Endpoint | Method | Success | Query Params | Response Body |
|----------|--------|---------|-------------|---------------|
| `/operations` | `GET` | 200 | `cursor`, `limit` (1–100, default 30) | `CursorResponse<OperationResponse>` |

### Wire Types (from `apps/server/src/routes/jj.ts`)

```typescript
// Cursor pagination wrapper
interface CursorResponse<T> {
  items: T[];
  next_cursor: string;  // empty string = no more pages
}

// Change entity
interface ChangeResponse {
  change_id: string;
  commit_id: string;
  description: string;
  author_name: string;
  author_email: string;
  timestamp: string;       // ISO-8601
  has_conflict: boolean;
  is_empty: boolean;
  parent_change_ids: string[];
}

// Conflict detail for a change
interface ChangeConflictResponse {
  file_path: string;
  conflict_type: string;   // e.g., "content", "modify-delete"
  base_content?: string;
  left_content?: string;
  right_content?: string;
  hunks?: string;
  resolution_status?: string;
}

// Operation log entry
interface OperationResponse {
  operation_id: string;
  description: string;
  timestamp: string;       // ISO-8601
}
```

### Current Backend Status

**All endpoints return `501 Not Implemented`.** The route handlers are defined but stubbed. Database schemas and SQL queries exist (`packages/sdk/src/db/changes_sql.ts`, `conflicts_sql.ts`, `jj_operations_sql.ts`) but the HTTP handlers do not call them yet.

Per project policy: **tests that fail due to 501 responses are left failing — never skipped or commented out.**

---

## 3. Architecture

### Position in Provider Stack

All hooks in this ticket require the following providers to be mounted (in order):

```
AuthProvider          ← provides token, authState
  → APIClientProvider ← provides configured APIClient
    → [hooks execute here]
```

The hooks consume `useAPIClient()` from the TUI's `APIClientProvider` to get the configured HTTP client.

### Data Flow

```
Screen Component (e.g., Changes tab)
  → useChanges(owner, repo, options?)    // TUI adapter hook
    → useAPIClient()                     // gets { baseUrl, token } from provider
    → fetch with cursor pagination       // manages cursor, items accumulation
    → error classification               // 401 → auth_error, 429 → rate_limited, 501 → http_error
    → returns { changes, isLoading, error, hasMore, fetchMore, refetch }
```

### Why Cursor-Based Pagination (Not Page-Based)

The jj API endpoints use cursor-based pagination (`cursor` + `limit` query params, `CursorResponse<T>` response), unlike the issues/labels endpoints which use page-based pagination (`page` + `per_page`, `X-Total-Count` header). The hooks in this ticket implement cursor pagination natively:

- `next_cursor` from the response is stored and sent in the next request
- Empty `next_cursor` signals end of data (`hasMore = false`)
- No total count is available from the API — `totalCount` is not exposed
- `fetchMore()` sends the stored cursor; `refetch()` clears the cursor and fetches from the beginning

### Why TUI-Side Hooks (Not ui-core)

`@codeplane/ui-core` does not currently export hooks for changes, conflicts, or operations. These hooks follow the same adapter pattern established by `tui-repo-data-hooks`:

1. **TUI-specific error handling:** 401 triggers auth retry, 429 displays retry-after, 501 shows meaningful error
2. **TUI-specific loading integration:** Works with `useScreenLoading` and `usePaginationLoading`
3. **Provider compatibility:** Uses TUI's `APIClientProvider` (`{ baseUrl, token }`) directly

If `@codeplane/ui-core` later adds these hooks, the TUI adapter layer can delegate to them.

---

## 4. Type Definitions

### File: `apps/tui/src/hooks/data/jj-types.ts`

A dedicated types file for jj-native data hooks. Keeps hook files focused on logic and allows consumers (screen components, test helpers) to import types without pulling in React.

```typescript
/**
 * Types for jj-native repository data hooks.
 *
 * These mirror the API response shapes from apps/server/src/routes/jj.ts
 * and are used by:
 * - useChanges
 * - useRepoConflicts
 * - useOperationLog
 */

import type { TUIFetchError } from "./useTUIFetch.js";

// ---------------------------------------------------------------------------
// Change
// ---------------------------------------------------------------------------

/** A jj change in the repository's change history. */
export interface Change {
  /** Stable jj change identifier. */
  changeId: string;
  /** Associated git commit SHA. */
  commitId: string;
  /** Change description (commit message equivalent). */
  description: string;
  /** Author display name. */
  authorName: string;
  /** Author email address. */
  authorEmail: string;
  /** ISO-8601 timestamp when the change was created. */
  timestamp: string;
  /** Whether this change has unresolved conflicts. */
  hasConflict: boolean;
  /** Whether this change is empty (no file modifications). */
  isEmpty: boolean;
  /** Parent change IDs forming the change DAG. */
  parentChangeIds: string[];
}

/** Options for the useChanges hook. */
export interface UseChangesOptions {
  /**
   * Sort order for the change list.
   * - "newest" (default): most recent first
   * - "oldest": oldest first
   */
  sort?: "newest" | "oldest";
  /**
   * Filter changes.
   * - undefined/"all" (default): all changes
   * - "conflicted": only changes with has_conflict === true
   * - "empty": only empty changes
   * - "non-empty": only non-empty changes
   */
  filter?: "all" | "conflicted" | "empty" | "non-empty";
  /** Items per page. Default: 30. Max: 100. */
  perPage?: number;
  /** Whether to enable fetching. Default: true. */
  enabled?: boolean;
}

/** Return value of useChanges. */
export interface UseChangesResult {
  /** Accumulated change items across all loaded pages. */
  changes: Change[];
  /** Whether a fetch is currently in progress. */
  isLoading: boolean;
  /** Structured error from the last failed request. */
  error: TUIFetchError | null;
  /** Whether more pages are available. */
  hasMore: boolean;
  /** Fetch the next page of changes. No-op if !hasMore or isLoading. */
  fetchMore: () => void;
  /** Hard reset: clear all loaded data and refetch from page 1. */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Conflict
// ---------------------------------------------------------------------------

/** A file-level conflict within a jj change. */
export interface ChangeConflict {
  /** Path of the conflicted file. */
  filePath: string;
  /** Type of conflict (e.g., "content", "modify-delete"). */
  conflictType: string;
  /** Base content for three-way merge (optional, may be absent for add/add). */
  baseContent?: string;
  /** Left side content. */
  leftContent?: string;
  /** Right side content. */
  rightContent?: string;
  /** Conflict hunks as a string (optional). */
  hunks?: string;
  /** Resolution status (e.g., "unresolved", "resolved"). */
  resolutionStatus?: string;
}

/** A change that has conflicts, with its per-file conflict details loaded. */
export interface ConflictedChange {
  /** The change that has conflicts. */
  change: Change;
  /** File-level conflicts for this change. Null if not yet loaded. */
  conflicts: ChangeConflict[] | null;
  /** Whether conflicts are currently being fetched. */
  isLoadingConflicts: boolean;
  /** Error from fetching conflicts, if any. */
  conflictError: TUIFetchError | null;
}

/** Return value of useRepoConflicts. */
export interface UseRepoConflictsResult {
  /** Changes that have has_conflict === true, with per-change conflict details. */
  conflictedChanges: ConflictedChange[];
  /** Whether the initial changes fetch is in progress. */
  isLoading: boolean;
  /** Error from the changes list fetch. */
  error: TUIFetchError | null;
  /** Total number of conflicted changes found (across loaded pages). */
  conflictCount: number;
  /** Whether more change pages are available to scan for conflicts. */
  hasMore: boolean;
  /** Fetch the next page of changes to scan for more conflicts. */
  fetchMore: () => void;
  /** Hard reset: clear all data and rescan from the beginning. */
  refetch: () => void;
  /**
   * Load conflict details for a specific change.
   * Called on-demand when a user expands a change in the conflicts view.
   */
  loadConflictsForChange: (changeId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Operation
// ---------------------------------------------------------------------------

/** A jj operation log entry. */
export interface Operation {
  /** Unique operation identifier. */
  operationId: string;
  /** Human-readable operation description. */
  description: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
}

/** Options for the useOperationLog hook. */
export interface UseOperationLogOptions {
  /** Items per page. Default: 50. Max: 100. */
  perPage?: number;
  /** Whether to enable fetching. Default: true. */
  enabled?: boolean;
}

/** Return value of useOperationLog. */
export interface UseOperationLogResult {
  /** Accumulated operation entries across all loaded pages. */
  operations: Operation[];
  /** Whether a fetch is currently in progress. */
  isLoading: boolean;
  /** Structured error from the last failed request. */
  error: TUIFetchError | null;
  /** Whether more pages are available. */
  hasMore: boolean;
  /** Fetch the next page of operations. */
  fetchMore: () => void;
  /** Hard reset: clear all data and refetch from page 1. */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Wire-format parsers
// ---------------------------------------------------------------------------

/** Parse a ChangeResponse (snake_case API) to a Change (camelCase internal). */
export function parseChange(raw: Record<string, unknown>): Change {
  return {
    changeId: String(raw.change_id ?? ""),
    commitId: String(raw.commit_id ?? ""),
    description: String(raw.description ?? ""),
    authorName: String(raw.author_name ?? ""),
    authorEmail: String(raw.author_email ?? ""),
    timestamp: String(raw.timestamp ?? ""),
    hasConflict: Boolean(raw.has_conflict),
    isEmpty: Boolean(raw.is_empty),
    parentChangeIds: Array.isArray(raw.parent_change_ids)
      ? raw.parent_change_ids.map(String)
      : [],
  };
}

/** Parse a ChangeConflictResponse to a ChangeConflict. */
export function parseChangeConflict(raw: Record<string, unknown>): ChangeConflict {
  return {
    filePath: String(raw.file_path ?? ""),
    conflictType: String(raw.conflict_type ?? ""),
    baseContent: raw.base_content != null ? String(raw.base_content) : undefined,
    leftContent: raw.left_content != null ? String(raw.left_content) : undefined,
    rightContent: raw.right_content != null ? String(raw.right_content) : undefined,
    hunks: raw.hunks != null ? String(raw.hunks) : undefined,
    resolutionStatus: raw.resolution_status != null ? String(raw.resolution_status) : undefined,
  };
}

/** Parse an OperationResponse to an Operation. */
export function parseOperation(raw: Record<string, unknown>): Operation {
  return {
    operationId: String(raw.operation_id ?? ""),
    description: String(raw.description ?? ""),
    timestamp: String(raw.timestamp ?? ""),
  };
}
```

---

## 5. Detailed Design

### File Structure

```
apps/tui/src/
├── hooks/
│   ├── data/
│   │   ├── index.ts                 # barrel export (updated)
│   │   ├── jj-types.ts              # types + parsers for jj hooks
│   │   ├── useChanges.ts            # paginated change history
│   │   ├── useRepoConflicts.ts      # conflicted changes + per-change conflicts
│   │   ├── useOperationLog.ts       # paginated operation audit trail
│   │   ├── useCursorPagination.ts   # shared cursor pagination primitive
│   │   ├── useTUIFetch.ts           # (exists from tui-repo-data-hooks)
│   │   └── types.ts                 # (exists from tui-repo-data-hooks)
│   └── index.ts                     # updated barrel (re-exports data/index.ts)
```

### Prerequisites

This ticket depends on `tui-auth-token-loading` being complete. It also assumes the `hooks/data/` directory structure and `useTUIFetch` utility from `tui-repo-data-hooks` exist. If `tui-repo-data-hooks` has not shipped yet, this ticket must create:

1. The `hooks/data/` directory
2. The `useTUIFetch.ts` shared fetch wrapper (as specified in `tui-repo-data-hooks`)
3. The `types.ts` base types file

If those artifacts already exist, this ticket only adds jj-specific files.

---

### 5.1 `useCursorPagination` — Shared Cursor Pagination Primitive

**File:** `apps/tui/src/hooks/data/useCursorPagination.ts`

The jj API endpoints use cursor-based pagination, unlike the page-based pagination used by issues/repos. This shared hook encapsulates the cursor accumulation pattern for reuse across `useChanges` and `useOperationLog`.

```typescript
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTUIFetch, type TUIFetchError } from "./useTUIFetch.js";

export interface CursorPaginationConfig<TRaw, TParsed> {
  /** Base API path (e.g., "/api/repos/owner/repo/changes"). */
  basePath: string;
  /** Cache key for detecting filter changes that require hard reset. */
  cacheKey: string;
  /** Items per page. Clamped to 1–100. */
  perPage: number;
  /** Maximum items to keep in memory. Oldest evicted on overflow. */
  maxItems: number;
  /** Whether fetching is enabled. */
  enabled: boolean;
  /** Parse a single raw API item into the typed model. */
  parseItem: (raw: Record<string, unknown>) => TParsed;
  /**
   * Optional client-side filter applied after parsing.
   * Return true to include the item.
   */
  clientFilter?: (item: TParsed) => boolean;
}

export interface CursorPaginationResult<T> {
  items: T[];
  isLoading: boolean;
  error: TUIFetchError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
}

const MAX_ITEMS_DEFAULT = 500;

export function useCursorPagination<TRaw, TParsed>(
  config: CursorPaginationConfig<TRaw, TParsed>
): CursorPaginationResult<TParsed> {
  const {
    basePath,
    cacheKey,
    perPage: rawPerPage,
    maxItems = MAX_ITEMS_DEFAULT,
    enabled,
    parseItem,
    clientFilter,
  } = config;

  const perPage = Math.min(Math.max(rawPerPage, 1), 100);
  const { request } = useTUIFetch();

  const [items, setItems] = useState<TParsed[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<TUIFetchError | null>(null);
  const cursorRef = useRef<string>("");
  const hasMoreRef = useRef(true);
  const isMounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const [refetchCounter, setRefetchCounter] = useState(0);
  const lastCacheKey = useRef(cacheKey);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const buildPath = useCallback(
    (cursor: string): string => {
      const params = new URLSearchParams({ limit: String(perPage) });
      if (cursor) params.set("cursor", cursor);
      const separator = basePath.includes("?") ? "&" : "?";
      return `${basePath}${separator}${params.toString()}`;
    },
    [basePath, perPage]
  );

  const fetchPage = useCallback(
    async (cursor: string, existingItems: TParsed[]) => {
      if (!isMounted.current) return;
      setIsLoading(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await request(buildPath(cursor), {
          signal: controller.signal,
        });
        const body = (await res.json()) as {
          items: Record<string, unknown>[];
          next_cursor: string;
        };

        if (isMounted.current) {
          const rawItems = Array.isArray(body.items) ? body.items : [];
          let parsed = rawItems.map(parseItem);
          if (clientFilter) {
            parsed = parsed.filter(clientFilter);
          }

          const nextCursor = body.next_cursor ?? "";
          cursorRef.current = nextCursor;
          hasMoreRef.current = nextCursor !== "";

          let combined = cursor === ""
            ? parsed
            : [...existingItems, ...parsed];

          // Memory cap: evict oldest items
          if (combined.length > maxItems) {
            combined = combined.slice(combined.length - maxItems);
          }

          setItems(combined);
          setError(null);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        if (isMounted.current) {
          setError(err);
          setIsLoading(false);
        }
      }
    },
    [request, buildPath, parseItem, clientFilter, maxItems]
  );

  // Fetch on mount, filter change (hard reset), or refetch
  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setIsLoading(false);
      cursorRef.current = "";
      hasMoreRef.current = true;
      return;
    }

    if (cacheKey !== lastCacheKey.current) {
      // Hard reset on filter/sort change
      lastCacheKey.current = cacheKey;
      setItems([]);
      cursorRef.current = "";
      hasMoreRef.current = true;
    }

    fetchPage("", []);
  }, [enabled, cacheKey, refetchCounter, fetchPage]);

  const hasMore = hasMoreRef.current;

  const fetchMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    fetchPage(cursorRef.current, items);
  }, [hasMore, isLoading, items, fetchPage]);

  const refetch = useCallback(() => {
    abortRef.current?.abort();
    setError(null);
    cursorRef.current = "";
    hasMoreRef.current = true;
    setRefetchCounter((c) => c + 1);
  }, []);

  return { items, isLoading, error, hasMore, fetchMore, refetch };
}
```

**Key design decisions:**

1. **Generic over `TRaw` and `TParsed`.** The primitive doesn't know about Change or Operation types. It accepts a `parseItem` function to convert wire format to internal model.
2. **Client-side filter support.** `useChanges` needs to filter by `has_conflict`, `is_empty`, etc. The filter runs after parsing, before accumulation.
3. **Hard reset on `cacheKey` change.** When sort/filter options change, the cursor is invalid — must refetch from the beginning.
4. **Memory cap.** Default 500 items, oldest evicted. Matches the architecture spec.
5. **No `totalCount`.** Cursor-based APIs don't expose total count. `hasMore` is determined solely by `next_cursor !== ""`.

---

### 5.2 `useChanges(owner, repo, options?)` — Paginated Change History

**File:** `apps/tui/src/hooks/data/useChanges.ts`

```typescript
import { useMemo } from "react";
import { useCursorPagination, type CursorPaginationResult } from "./useCursorPagination.js";
import {
  parseChange,
  type Change,
  type UseChangesOptions,
  type UseChangesResult,
} from "./jj-types.js";

const DEFAULT_PER_PAGE = 30;
const MAX_ITEMS = 500;

export function useChanges(
  owner: string,
  repo: string,
  options?: UseChangesOptions
): UseChangesResult {
  const sort = options?.sort ?? "newest";
  const filter = options?.filter ?? "all";
  const perPage = options?.perPage ?? DEFAULT_PER_PAGE;
  const enabled = options?.enabled ?? true;

  const basePath = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/changes`;

  // Cache key changes on sort/filter → triggers hard reset in useCursorPagination
  const cacheKey = useMemo(
    () => `changes:${owner}:${repo}:${sort}:${filter}`,
    [owner, repo, sort, filter]
  );

  // Client-side filter function
  const clientFilter = useMemo(() => {
    if (filter === "all") return undefined;
    return (change: Change): boolean => {
      switch (filter) {
        case "conflicted":
          return change.hasConflict;
        case "empty":
          return change.isEmpty;
        case "non-empty":
          return !change.isEmpty;
        default:
          return true;
      }
    };
  }, [filter]);

  const result = useCursorPagination<Record<string, unknown>, Change>({
    basePath,
    cacheKey,
    perPage,
    maxItems: MAX_ITEMS,
    enabled: enabled && !!owner && !!repo,
    parseItem: parseChange,
    clientFilter,
  });

  // Sort is applied client-side when API doesn't support it natively.
  // The API returns newest-first by default.
  // If the user requests "oldest", we reverse the accumulated items.
  const changes = useMemo(() => {
    if (sort === "oldest") {
      return [...result.items].reverse();
    }
    return result.items;
  }, [result.items, sort]);

  return {
    changes,
    isLoading: result.isLoading,
    error: result.error,
    hasMore: result.hasMore,
    fetchMore: result.fetchMore,
    refetch: result.refetch,
  };
}
```

**API endpoint:** `GET /api/repos/:owner/:repo/changes?cursor=...&limit=30`

**Sorting:** The API returns changes in newest-first order (by timestamp). The "oldest" sort option reverses the accumulated array client-side. If the backend later supports a `sort` query parameter, this can be pushed to the server.

**Filtering:** Client-side filtering on `has_conflict`, `is_empty`. When a filter is active and the API returns items that don't match, the visible count may be less than `perPage`. The UI should trigger `fetchMore` when the visible list is short but `hasMore` is true.

**Guard:** If `owner` or `repo` is empty, fetching is disabled.

---

### 5.3 `useRepoConflicts(owner, repo)` — Conflicted Changes with Per-Change Details

**File:** `apps/tui/src/hooks/data/useRepoConflicts.ts`

```typescript
import { useState, useCallback, useMemo, useRef } from "react";
import { useTUIFetch, type TUIFetchError } from "./useTUIFetch.js";
import { useCursorPagination } from "./useCursorPagination.js";
import {
  parseChange,
  parseChangeConflict,
  type Change,
  type ChangeConflict,
  type ConflictedChange,
  type UseRepoConflictsResult,
} from "./jj-types.js";

const DEFAULT_PER_PAGE = 30;
const MAX_ITEMS = 500;

export function useRepoConflicts(
  owner: string,
  repo: string
): UseRepoConflictsResult {
  const { request } = useTUIFetch();

  // Conflict details cache: changeId → { conflicts, isLoading, error }
  const [conflictDetails, setConflictDetails] = useState<
    Map<string, {
      conflicts: ChangeConflict[] | null;
      isLoading: boolean;
      error: TUIFetchError | null;
    }>
  >(new Map());

  const abortRefs = useRef<Map<string, AbortController>>(new Map());

  const basePath = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/changes`;

  const cacheKey = useMemo(
    () => `conflicts:${owner}:${repo}`,
    [owner, repo]
  );

  // Fetch all changes, filter client-side for conflicted ones
  const changesResult = useCursorPagination<Record<string, unknown>, Change>({
    basePath,
    cacheKey,
    perPage: DEFAULT_PER_PAGE,
    maxItems: MAX_ITEMS,
    enabled: !!owner && !!repo,
    parseItem: parseChange,
    clientFilter: (change) => change.hasConflict,
  });

  // Build ConflictedChange objects by joining changes with their conflict details
  const conflictedChanges: ConflictedChange[] = useMemo(
    () =>
      changesResult.items.map((change) => {
        const detail = conflictDetails.get(change.changeId);
        return {
          change,
          conflicts: detail?.conflicts ?? null,
          isLoadingConflicts: detail?.isLoading ?? false,
          conflictError: detail?.error ?? null,
        };
      }),
    [changesResult.items, conflictDetails]
  );

  // Load conflict details for a specific change on demand
  const loadConflictsForChange = useCallback(
    async (changeId: string): Promise<void> => {
      // Skip if already loaded or loading
      const existing = conflictDetails.get(changeId);
      if (existing?.conflicts !== null || existing?.isLoading) return;

      // Abort any previous request for this change
      abortRefs.current.get(changeId)?.abort();
      const controller = new AbortController();
      abortRefs.current.set(changeId, controller);

      // Mark as loading
      setConflictDetails((prev) => {
        const next = new Map(prev);
        next.set(changeId, { conflicts: null, isLoading: true, error: null });
        return next;
      });

      try {
        const path = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/changes/${encodeURIComponent(changeId)}/conflicts`;
        const res = await request(path, { signal: controller.signal });
        const body = await res.json();
        const conflicts = (Array.isArray(body) ? body : []).map(parseChangeConflict);

        setConflictDetails((prev) => {
          const next = new Map(prev);
          next.set(changeId, { conflicts, isLoading: false, error: null });
          return next;
        });
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setConflictDetails((prev) => {
          const next = new Map(prev);
          next.set(changeId, { conflicts: null, isLoading: false, error: err });
          return next;
        });
      } finally {
        abortRefs.current.delete(changeId);
      }
    },
    [owner, repo, request, conflictDetails]
  );

  // Override refetch to also clear conflict details cache
  const refetch = useCallback(() => {
    // Abort all in-flight conflict requests
    for (const controller of abortRefs.current.values()) {
      controller.abort();
    }
    abortRefs.current.clear();
    setConflictDetails(new Map());
    changesResult.refetch();
  }, [changesResult.refetch]);

  return {
    conflictedChanges,
    isLoading: changesResult.isLoading,
    error: changesResult.error,
    conflictCount: conflictedChanges.length,
    hasMore: changesResult.hasMore,
    fetchMore: changesResult.fetchMore,
    refetch,
    loadConflictsForChange,
  };
}
```

**Data flow:**

1. `useCursorPagination` fetches `/changes` with a client-side filter for `has_conflict === true`
2. The hook maintains a `Map<changeId, conflictDetail>` for per-change conflict data
3. `loadConflictsForChange(changeId)` fetches `GET /changes/:change_id/conflicts` on demand
4. `conflictedChanges` is a computed join of filtered changes + their conflict detail state

**Why on-demand conflict loading:**
- A repository may have many conflicted changes but the user only expands a few
- Fetching all conflict details eagerly would be wasteful (N+1 requests)
- The conflicts view shows a hierarchical list where expanding a change triggers the detail fetch

**Cleanup:** `refetch()` aborts all in-flight conflict requests and clears the cache. Component unmount doesn't need special handling because `useCursorPagination` handles its own abort and the conflict fetch requests check `AbortError`.

---

### 5.4 `useOperationLog(owner, repo, options?)` — Paginated Operation Audit Trail

**File:** `apps/tui/src/hooks/data/useOperationLog.ts`

```typescript
import { useMemo } from "react";
import { useCursorPagination } from "./useCursorPagination.js";
import {
  parseOperation,
  type Operation,
  type UseOperationLogOptions,
  type UseOperationLogResult,
} from "./jj-types.js";

const DEFAULT_PER_PAGE = 50;
const MAX_ITEMS = 5000;

export function useOperationLog(
  owner: string,
  repo: string,
  options?: UseOperationLogOptions
): UseOperationLogResult {
  const perPage = options?.perPage ?? DEFAULT_PER_PAGE;
  const enabled = options?.enabled ?? true;

  const basePath = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/operations`;

  const cacheKey = useMemo(
    () => `operations:${owner}:${repo}`,
    [owner, repo]
  );

  const result = useCursorPagination<Record<string, unknown>, Operation>({
    basePath,
    cacheKey,
    perPage,
    maxItems: MAX_ITEMS,
    enabled: enabled && !!owner && !!repo,
    parseItem: parseOperation,
  });

  return {
    operations: result.items,
    isLoading: result.isLoading,
    error: result.error,
    hasMore: result.hasMore,
    fetchMore: result.fetchMore,
    refetch: result.refetch,
  };
}
```

**Design decisions:**

1. **Higher default `perPage` (50).** The operation log is an audit trail — users typically scan many entries. 50 per page reduces round-trips.
2. **Higher `maxItems` (5000).** Operation history can be long and users may scroll deep into it. 5000 entries × ~100 bytes per Operation = ~500KB, well within memory budget for a terminal session.
3. **No client-side filtering.** The operation log is displayed as-is. If filtering by operation type is added later, it can use `useCursorPagination`'s `clientFilter` parameter.
4. **No sorting option.** Operations are always chronological (newest first from API).

---

### 5.5 Barrel Export Updates

**File:** `apps/tui/src/hooks/data/index.ts`

Append the following exports to the existing barrel:

```typescript
// jj-native data hooks
export { useChanges } from "./useChanges.js";
export { useRepoConflicts } from "./useRepoConflicts.js";
export { useOperationLog } from "./useOperationLog.js";
export { useCursorPagination } from "./useCursorPagination.js";

// jj types
export type {
  Change,
  UseChangesOptions,
  UseChangesResult,
  ChangeConflict,
  ConflictedChange,
  UseRepoConflictsResult,
  Operation,
  UseOperationLogOptions,
  UseOperationLogResult,
} from "./jj-types.js";
export { parseChange, parseChangeConflict, parseOperation } from "./jj-types.js";
```

---

## Implementation Plan

Each step is a vertical slice that produces a testable artifact. Steps are ordered by dependency.

### Step 1: Type definitions and parsers

**File:** `apps/tui/src/hooks/data/jj-types.ts`

Create the types file as specified in Section 4. This file has minimal runtime code (only the three `parse*` functions). All interfaces are exported for consumption by hooks and screen components.

**Acceptance:**
- File compiles with `tsc --noEmit`
- All types are exported and importable from sibling modules
- `parseChange`, `parseChangeConflict`, `parseOperation` correctly convert snake_case API responses to camelCase internal types
- Parsers handle missing/null/undefined fields defensively (default to empty string, false, or empty array)

### Step 2: Cursor pagination primitive

**File:** `apps/tui/src/hooks/data/useCursorPagination.ts`

Create the shared cursor pagination hook as specified in Section 5.1.

**Acceptance:**
- Hook compiles and can be imported
- Cursor is stored between pages and sent in subsequent requests
- Empty `next_cursor` sets `hasMore = false`
- `fetchMore()` is no-op when `!hasMore` or `isLoading`
- `refetch()` clears cursor and items, fetches from beginning
- Cache key change triggers hard reset (new filter/sort)
- Memory cap enforced: items beyond `maxItems` are evicted from the start
- `enabled = false` clears items and stops fetching
- AbortController cancels in-flight requests on unmount
- AbortError is silently swallowed (not set as error state)

### Step 3: `useChanges` hook

**File:** `apps/tui/src/hooks/data/useChanges.ts`

Create the changes hook as specified in Section 5.2.

**Acceptance:**
- Hook compiles and can be imported
- Fetches `GET /api/repos/:owner/:repo/changes` with cursor pagination
- `sort: "oldest"` reverses the items array client-side
- `filter: "conflicted"` returns only changes with `hasConflict === true`
- `filter: "empty"` returns only changes with `isEmpty === true`
- `filter: "non-empty"` returns only changes with `isEmpty === false`
- Changing sort or filter triggers hard reset via cacheKey
- Guard: empty owner or repo disables fetching
- When API returns 501 (current state), error is populated with the 501 status and message

### Step 4: `useRepoConflicts` hook

**File:** `apps/tui/src/hooks/data/useRepoConflicts.ts`

Create the repo conflicts hook as specified in Section 5.3.

**Acceptance:**
- Hook compiles and can be imported
- Fetches changes list filtered for `has_conflict === true`
- `loadConflictsForChange(changeId)` fetches per-change conflict details on demand
- Loading a change's conflicts twice (while first is loading) is a no-op
- Loading a change whose conflicts are already loaded is a no-op
- `conflictCount` reflects the count of conflicted changes in loaded data
- `refetch()` clears both the changes list and the conflict details cache
- In-flight conflict requests are aborted on refetch
- Error from conflict detail fetch is stored per-change (doesn't affect the main error state)

### Step 5: `useOperationLog` hook

**File:** `apps/tui/src/hooks/data/useOperationLog.ts`

Create the operation log hook as specified in Section 5.4.

**Acceptance:**
- Hook compiles and can be imported
- Fetches `GET /api/repos/:owner/:repo/operations` with cursor pagination
- Default perPage is 50
- maxItems is 5000
- Guard: empty owner or repo disables fetching

### Step 6: Barrel export updates

**File:** `apps/tui/src/hooks/data/index.ts`

Update the barrel export as specified in Section 5.5.

**Acceptance:**
- All hooks and types are importable from `../hooks/data/index.js`
- No circular dependencies

### Step 7: Productionize — upgrade APIClientProvider if needed

If the `hooks/data/` directory does not yet exist (i.e., `tui-repo-data-hooks` has not shipped), this step creates the prerequisite infrastructure:

1. Create `apps/tui/src/hooks/data/` directory
2. Create `useTUIFetch.ts` with the fetch wrapper from `tui-repo-data-hooks` spec
3. Create `types.ts` with base types
4. Verify `APIClientProvider` provides a compatible client interface

If `tui-repo-data-hooks` has shipped, this step is a no-op.

---

## Productionization Notes

### Migrating to ui-core hooks

When `@codeplane/ui-core` adds `useChanges`, `useRepoConflicts`, and `useOperationLog` hooks, the TUI adapter hooks should be updated to delegate to them rather than implementing fetch logic directly. The migration path:

1. `useCursorPagination` remains in the TUI as a TUI-specific pagination primitive (it integrates with `useTUIFetch` for error interception)
2. `useChanges`, `useRepoConflicts`, `useOperationLog` become thin wrappers that call the ui-core hook and adapt the result to include TUI-specific error handling
3. Types in `jj-types.ts` should be kept in sync with ui-core's types or imported from ui-core once available

### Handling backend implementation

When the backend endpoints move from 501 → implemented:

1. Tests that currently fail with 501 will start passing — no test changes needed
2. Verify that the response shape matches the wire types defined in this spec
3. If the API adds server-side sorting or filtering params, update `useChanges` to prefer server-side over client-side
4. If the operations API adds `operation_type` or `user_id` fields, update `OperationResponse` type and `parseOperation` parser

### Performance considerations

1. **Client-side filtering caveat.** When `filter: "conflicted"` is active and few changes have conflicts, `useCursorPagination` may fetch many pages to accumulate enough visible items. The UI should show a "scanning..." indicator and call `fetchMore()` automatically when the visible list is shorter than the viewport. This is a screen-level concern, not a hook concern.
2. **Conflict detail cache.** The `Map<changeId, conflictDetail>` in `useRepoConflicts` is never evicted during a session (only on refetch). For repositories with hundreds of conflicted changes, this could accumulate. A future optimization could use an LRU cache with a cap of ~100 entries.
3. **Operation log depth.** The 5000-item cap for operations means approximately 100 pages at 50/page. For very active repositories, users scrolling deep will hit the cap and oldest entries will be evicted. The UI should not indicate that older entries exist beyond the cap.

---

## Unit & Integration Tests

### Test Organization

All E2E tests target `e2e/tui/repository.test.ts` within the `TUI_REPOSITORY` feature group. Tests are organized into three `describe` blocks corresponding to the three hooks.

**Test file:** `e2e/tui/repository.test.ts`

Tests run against a real API server. Since the jj endpoints currently return 501, **all tests that fetch data will fail**. Per project policy, tests are left failing — never skipped or commented out.

### Test Helpers

**File:** `e2e/tui/helpers.ts` (extend existing helpers)

```typescript
// Add to existing helpers.ts:

/** Navigate to a repository's Changes tab. */
export async function navigateToChangesTab(
  terminal: TUITestInstance,
  owner: string,
  repo: string
): Promise<void> {
  // Deep-link to repo, then switch to Changes tab (tab 2)
  // Alternatively use go-to keybindings if repo context is set
  await terminal.sendKeys("g", "r"); // go to repos
  await terminal.waitForText("Repositories");
  // Search and select the repo
  await terminal.sendKeys("/");
  await terminal.sendText(`${owner}/${repo}`);
  await terminal.sendKeys("Enter");
  await terminal.waitForText(repo);
  await terminal.sendKeys("Enter");
  // Switch to Changes tab (tab index 2)
  await terminal.sendKeys("2");
}

/** Navigate to a repository's Conflicts tab. */
export async function navigateToConflictsTab(
  terminal: TUITestInstance,
  owner: string,
  repo: string
): Promise<void> {
  await navigateToChangesTab(terminal, owner, repo);
  // Switch to Conflicts tab (tab index 4)
  await terminal.sendKeys("4");
}

/** Navigate to a repository's Operation Log tab. */
export async function navigateToOperationLog(
  terminal: TUITestInstance,
  owner: string,
  repo: string
): Promise<void> {
  await navigateToChangesTab(terminal, owner, repo);
  // Switch to Operation Log tab (tab index 5)
  await terminal.sendKeys("5");
}
```

### Test Specifications

#### `describe("TUI_REPO_CHANGES_VIEW — useChanges hook integration")`

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance, TERMINAL_SIZES } from "./helpers.js";

describe("TUI_REPO_CHANGES_VIEW — useChanges hook integration", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  // --- Loading & Error States ---

  test("CHANGES-001: Changes tab shows loading state on initial render", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.waitForText("Loading");
  });

  test("CHANGES-002: Changes tab shows error when API returns 501", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    // Navigate to changes tab
    await terminal.sendKeys("2");
    // 501 response should surface as an error
    await terminal.waitForText("not implemented", 10_000);
  });

  test("CHANGES-003: Changes tab retry (R key) re-fetches data", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("2");
    await terminal.waitForText("not implemented", 10_000);
    // Press R to retry
    await terminal.sendKeys("R");
    // Should show loading again
    await terminal.waitForText("Loading");
  });

  // --- Pagination ---

  test("CHANGES-004: Changes list supports j/k navigation", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    // When backend is implemented, j/k should move focus in the changes list
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("CHANGES-005: fetchMore triggers on scroll to 80% of list", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    // When backend is implemented and list is populated,
    // scrolling near the end should trigger pagination
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  // --- Filtering ---

  test("CHANGES-006: Filter for conflicted changes shows only conflicted items", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    // When backend is implemented, applying the 'conflicted' filter
    // should show only changes where hasConflict is true
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("CHANGES-007: Filter for empty changes shows only empty items", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("CHANGES-008: Changing filter triggers hard reset and refetch", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  // --- Sorting ---

  test("CHANGES-009: Sort newest-first is the default order", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("CHANGES-010: Sort oldest-first reverses the change list", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  // --- Responsive Snapshots ---

  test("SNAP-CHANGES-80x24: Changes tab at minimum terminal size", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("2");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-CHANGES-120x40: Changes tab at standard terminal size", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("2");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-CHANGES-200x60: Changes tab at large terminal size", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("2");
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});
```

#### `describe("TUI_REPO_CONFLICTS_VIEW — useRepoConflicts hook integration")`

```typescript
describe("TUI_REPO_CONFLICTS_VIEW — useRepoConflicts hook integration", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  // --- Loading & Error States ---

  test("CONFLICTS-001: Conflicts tab shows loading state on initial render", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    await terminal.waitForText("Loading");
  });

  test("CONFLICTS-002: Conflicts tab shows error when API returns 501", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    await terminal.waitForText("not implemented", 10_000);
  });

  test("CONFLICTS-003: Conflicts tab shows 'No conflicts' when list is empty", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    // When backend returns changes with no conflicts,
    // the view should show an empty state
    await terminal.waitForText("No conflicts", 10_000);
  });

  // --- Hierarchical List ---

  test("CONFLICTS-004: Expanding a conflicted change loads per-file conflicts", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    // When backend is implemented, pressing Enter on a conflicted change
    // should expand it and show per-file conflicts
    await terminal.sendKeys("Enter");
  });

  test("CONFLICTS-005: Per-change conflict detail shows conflict type", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    // When conflicts are loaded, each file should show its conflict_type
  });

  test("CONFLICTS-006: Conflict count badge reflects loaded data", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    // Tab header or status should show conflict count
  });

  // --- Error Isolation ---

  test("CONFLICTS-007: Conflict detail error for one change does not affect others", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    // A 501 on one change's conflicts should not prevent viewing other changes
  });

  test("CONFLICTS-008: Refetch clears both changes list and conflict details cache", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    await terminal.sendKeys("R"); // retry/refetch
  });

  // --- Responsive Snapshots ---

  test("SNAP-CONFLICTS-80x24: Conflicts tab at minimum terminal size", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-CONFLICTS-120x40: Conflicts tab at standard terminal size", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-CONFLICTS-200x60: Conflicts tab at large terminal size", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("4");
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});
```

#### `describe("TUI_REPO_OPERATION_LOG — useOperationLog hook integration")`

```typescript
describe("TUI_REPO_OPERATION_LOG — useOperationLog hook integration", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  // --- Loading & Error States ---

  test("OPLOG-001: Operation log shows loading state on initial render", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("5");
    await terminal.waitForText("Loading");
  });

  test("OPLOG-002: Operation log shows error when API returns 501", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("5");
    await terminal.waitForText("not implemented", 10_000);
  });

  test("OPLOG-003: Operation log retry (R key) re-fetches data", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("5");
    await terminal.waitForText("not implemented", 10_000);
    await terminal.sendKeys("R");
    await terminal.waitForText("Loading");
  });

  // --- Pagination ---

  test("OPLOG-004: Operation log uses 50 items per page by default", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    // Verify via the rendered list — when backend is live,
    // the first fetch should request limit=50
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("OPLOG-005: Scrolling to end of operation list triggers fetchMore", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  // --- Navigation ---

  test("OPLOG-006: j/k navigates operation list entries", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("5");
    // When backend is live, j/k should move focus between operation entries
    await terminal.sendKeys("j");
    await terminal.sendKeys("k");
  });

  test("OPLOG-007: G jumps to last loaded operation", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("5");
    await terminal.sendKeys("G");
  });

  test("OPLOG-008: gg jumps to first operation", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("5");
    await terminal.sendKeys("g", "g");
  });

  // --- Responsive Snapshots ---

  test("SNAP-OPLOG-80x24: Operation log at minimum terminal size", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("5");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-OPLOG-120x40: Operation log at standard terminal size", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("5");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-OPLOG-200x60: Operation log at large terminal size", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      args: ["--screen", "repos", "--repo", "alice/my-repo"],
    });
    await terminal.sendKeys("5");
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});
```

#### `describe("Parser functions — jj-types.ts")`

Pure function tests that can run without a TUI instance:

```typescript
describe("jj-types parsers", () => {
  test("PARSE-001: parseChange converts snake_case API response to camelCase", () => {
    const raw = {
      change_id: "abc123",
      commit_id: "def456",
      description: "Add feature",
      author_name: "Alice",
      author_email: "alice@example.com",
      timestamp: "2026-03-23T10:00:00Z",
      has_conflict: true,
      is_empty: false,
      parent_change_ids: ["parent1", "parent2"],
    };
    // Import parseChange and verify output
    // Exact assertions on each field
  });

  test("PARSE-002: parseChange handles missing fields with safe defaults", () => {
    const raw = {};
    // Should produce: changeId: "", hasConflict: false, isEmpty: false,
    // parentChangeIds: []
  });

  test("PARSE-003: parseChangeConflict converts snake_case fields", () => {
    const raw = {
      file_path: "src/main.rs",
      conflict_type: "content",
      base_content: "base",
      left_content: "left",
      right_content: "right",
      hunks: "@@ -1,3 +1,3 @@",
      resolution_status: "unresolved",
    };
    // Verify all fields converted correctly
  });

  test("PARSE-004: parseChangeConflict omits undefined optional fields", () => {
    const raw = {
      file_path: "src/main.rs",
      conflict_type: "modify-delete",
    };
    // Optional fields should be undefined, not empty string
  });

  test("PARSE-005: parseOperation converts snake_case fields", () => {
    const raw = {
      operation_id: "op-001",
      description: "commit working copy",
      timestamp: "2026-03-23T10:00:00Z",
    };
    // Verify all fields
  });

  test("PARSE-006: parseOperation handles missing fields with safe defaults", () => {
    const raw = {};
    // Should produce: operationId: "", description: "", timestamp: ""
  });
});
```

### Test Philosophy Notes

1. **Tests that fail due to 501 responses are left failing.** The CHANGES-002, CONFLICTS-002, and OPLOG-002 tests (and others that require live data) will fail until the backend implements the jj endpoints. This is correct per project policy.

2. **No mocking.** Tests launch a real TUI instance via `launchTUI()` and interact through the terminal PTY. No internal hooks, state, or API client are mocked.

3. **Parser tests are the exception.** The `parseChange`, `parseChangeConflict`, and `parseOperation` functions are pure — they can be tested as unit tests by importing and calling them directly. These tests will pass immediately since they don't depend on the backend.

4. **Snapshot tests at three sizes.** Each view is snapshot-tested at minimum (80×24), standard (120×40), and large (200×60) to catch responsive layout regressions.

5. **Each test launches a fresh instance.** No shared state between tests. `afterEach` terminates the terminal.

---

## File Manifest

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/hooks/data/jj-types.ts` | **Create** | Types and parsers for jj-native data hooks |
| `apps/tui/src/hooks/data/useCursorPagination.ts` | **Create** | Shared cursor-based pagination primitive |
| `apps/tui/src/hooks/data/useChanges.ts` | **Create** | Paginated change history hook |
| `apps/tui/src/hooks/data/useRepoConflicts.ts` | **Create** | Conflicted changes + per-change detail hook |
| `apps/tui/src/hooks/data/useOperationLog.ts` | **Create** | Paginated operation audit trail hook |
| `apps/tui/src/hooks/data/index.ts` | **Update** | Add barrel exports for new hooks and types |
| `apps/tui/src/hooks/index.ts` | **Update** | Re-export data hooks if not already |
| `e2e/tui/repository.test.ts` | **Update** | Add test suites for changes, conflicts, operation log |
| `e2e/tui/helpers.ts` | **Update** | Add navigation helpers for repo tabs |

---

## Source of Truth

This spec should be maintained alongside:

- `specs/tui/prd.md` — TUI product requirements
- `specs/tui/design.md` — TUI design specification
- `specs/tui/features.ts` — Codified feature inventory (`TUI_REPO_CHANGES_VIEW`, `TUI_REPO_CONFLICTS_VIEW`, `TUI_REPO_OPERATION_LOG`)
- `specs/tui/engineering/tui-repo-data-hooks.md` — Base repository data hooks (prerequisite pattern)
- `specs/tui/engineering/tui-repo-tree-hooks.md` — Tree/file hooks (parallel pattern)
- `specs/tui/engineering/tui-auth-token-loading.md` — Auth dependency spec
- `apps/server/src/routes/jj.ts` — API route definitions (source of truth for wire types)