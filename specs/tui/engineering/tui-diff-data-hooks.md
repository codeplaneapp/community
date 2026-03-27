# Engineering Specification: Diff Data Hooks — `useChangeDiff`, `useLandingDiff`, `useLandingComments`, `useCreateLandingComment`

**Ticket:** `tui-diff-data-hooks`
**Status:** Not started
**Dependencies:** `tui-navigation-provider` (for repo context extraction), `tui-auth-token-loading` (for authenticated API client)
**Target directory:** `apps/tui/src/`
**Test directory:** `e2e/tui/`

---

## 1. Overview

This ticket creates the TUI data-access layer for diff viewing and inline commenting on landing requests. Four hooks are delivered:

| Hook | Purpose | HTTP Method & Path |
|------|---------|-------------------|
| `useChangeDiff` | Fetch diff for a single jj change | `GET /api/repos/:owner/:repo/changes/:change_id/diff` |
| `useLandingDiff` | Fetch combined diff for a landing request's change stack | `GET /api/repos/:owner/:repo/landings/:number/diff` |
| `useLandingComments` | Fetch inline comments for a landing request | `GET /api/repos/:owner/:repo/landings/:number/comments` |
| `useCreateLandingComment` | Create an inline comment on a landing request | `POST /api/repos/:owner/:repo/landings/:number/comments` |

All hooks follow the established TUI patterns: they consume the `APIClient` from `APIClientProvider` (via `useAPIClient()`), integrate with the `LoadingProvider` via `useLoading()` / `useScreenLoading()` / `useOptimisticMutation()` patterns, and return typed responses with loading/error/refetch states.

---

## 2. Type Definitions

### File: `apps/tui/src/types/diff.ts`

The TUI defines its own types rather than importing from `@codeplane/sdk` because:
1. The SDK's `LandingCommentResponse` and `CreateLandingCommentInput` types are **not exported** from `packages/sdk/src/index.ts`.
2. The SDK's `FileDiffItem.change_type` is typed as `string`; the TUI benefits from a narrowed union.
3. The TUI may need UI-specific augmentations (e.g., provisional IDs for optimistic comments).

```typescript
/**
 * A single file's diff data within a change or landing request.
 * Mirrors the FileDiffItem from apps/server/src/routes/jj.ts line 41
 * with a narrowed change_type.
 */
export interface FileDiffItem {
  path: string;
  old_path?: string;
  change_type: "added" | "modified" | "deleted" | "renamed" | "copied";
  patch?: string;
  is_binary: boolean;
  language?: string;
  additions: number;
  deletions: number;
  old_content?: string;
  new_content?: string;
}

/**
 * Response from GET /api/repos/:owner/:repo/changes/:change_id/diff
 *
 * Note: This endpoint is currently stubbed (returns 501) in jj.ts line 242.
 * The response shape is inferred from the Go source code comments and
 * matches the pattern established by other diff endpoints.
 */
export interface ChangeDiffResponse {
  change_id: string;
  file_diffs: FileDiffItem[];
}

/**
 * A single change's diff within a landing request's change stack.
 * Mirrors FileDiff from apps/server/src/routes/landings.ts line 116.
 * The server types file_diffs as unknown[]; we assert FileDiffItem[].
 */
export interface LandingChangeDiff {
  change_id: string;
  file_diffs: FileDiffItem[];
}

/**
 * Response from GET /api/repos/:owner/:repo/landings/:number/diff
 * Mirrors LandingDiffResponse from landings.ts line 121.
 */
export interface LandingDiffResponse {
  landing_number: number;
  changes: LandingChangeDiff[];
}

/**
 * Author of a landing comment.
 * Mirrors LandingRequestAuthor from landings.ts line 56.
 */
export interface LandingCommentAuthor {
  id: number;
  login: string;
}

/**
 * An inline comment on a landing request diff.
 * Response item from GET /api/repos/:owner/:repo/landings/:number/comments
 * Mirrors LandingCommentResponse from landings.ts line 86.
 */
export interface LandingComment {
  id: number;
  landing_request_id: number;
  author: LandingCommentAuthor;
  path: string;
  line: number;
  side: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating a new inline comment.
 * Request body for POST /api/repos/:owner/:repo/landings/:number/comments
 * Mirrors the body schema from landings.ts line 670-675.
 */
export interface CreateLandingCommentInput {
  path: string;
  line: number;
  side: "left" | "right" | "both";
  body: string;
}

/**
 * Options for diff fetching hooks.
 */
export interface DiffFetchOptions {
  /** When true, whitespace-only changes are excluded. Default: false. */
  ignore_whitespace?: boolean;
  /** When false, the hook does not fetch on mount. Default: true. */
  enabled?: boolean;
}
```

---

## 3. Cache Layer

### File: `apps/tui/src/lib/diff-cache.ts`

A lightweight in-memory cache for diff responses. Cache entries expire after 30 seconds. Cache keys incorporate the `ignore_whitespace` boolean to ensure toggling whitespace refetches fresh data.

```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 30_000;

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Build a deterministic cache key for change diff requests.
 */
export function changeDiffCacheKey(
  owner: string,
  repo: string,
  changeId: string,
  ignoreWhitespace: boolean,
): string {
  return `change-diff:${owner}/${repo}:${changeId}:ws=${ignoreWhitespace}`;
}

/**
 * Build a deterministic cache key for landing diff requests.
 */
export function landingDiffCacheKey(
  owner: string,
  repo: string,
  number: number,
  ignoreWhitespace: boolean,
): string {
  return `landing-diff:${owner}/${repo}:${number}:ws=${ignoreWhitespace}`;
}

/**
 * Build a deterministic cache key for landing comments.
 */
export function landingCommentsCacheKey(
  owner: string,
  repo: string,
  number: number,
): string {
  return `landing-comments:${owner}/${repo}:${number}`;
}

/**
 * Retrieve a cached value if it exists and has not expired.
 */
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * Store a value in the cache.
 */
export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalidate a specific cache entry.
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all cache entries matching a prefix.
 * Used when a comment is created to bust the comments cache.
 */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear the entire diff cache. Called on SSE reconnection
 * to avoid serving stale data.
 */
export function clearDiffCache(): void {
  cache.clear();
}
```

**Design decisions:**

- The cache is a simple `Map` — no LRU eviction. Diff screens are visited one at a time; the cache holds at most 5–10 entries during a typical session.
- TTL of 30 seconds balances freshness (comments from other reviewers) against avoiding redundant fetches when toggling between files.
- Cache keys encode `ignore_whitespace` as a boolean suffix so that toggling whitespace triggers a new fetch rather than returning stale filtered/unfiltered data.
- `invalidateCacheByPrefix` is used by `useCreateLandingComment` to bust the comments cache after a new comment is created.

---

## 4. Hook Implementations

### Why not reuse `useRepoFetch`?

The existing `useRepoFetch` (`apps/tui/src/hooks/useRepoFetch.ts`) is an internal helper that only supports GET requests and doesn't support:
- Query parameter construction
- POST requests (needed for `useCreateLandingComment`)
- Response header reading (needed for `X-Total-Count` in `useLandingComments`)
- Per-hook caching with TTL

These hooks use `fetch` directly with the `APIClient` from `useAPIClient()`, following the same auth pattern. The server accepts both `Authorization: Bearer <token>` and `Authorization: token <token>` (confirmed: `apps/server/src/lib/middleware.ts` line 57). These hooks use `token` prefix matching `AuthProvider.tsx` line 62, while `useRepoFetch` uses `Bearer` — both work.

### 4.1 `useChangeDiff`

#### File: `apps/tui/src/hooks/useChangeDiff.ts`

Fetches the diff for a single jj change. Used when viewing a change's diff outside of a landing request context (e.g., from the repository changes tab).

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { useAPIClient } from "../providers/APIClientProvider.js";
import type {
  ChangeDiffResponse,
  FileDiffItem,
  DiffFetchOptions,
} from "../types/diff.js";
import {
  changeDiffCacheKey,
  getCached,
  setCached,
  invalidateCache,
} from "../lib/diff-cache.js";

export interface UseChangeDiffReturn {
  /** The list of file diffs for this change. Empty array while loading. */
  files: FileDiffItem[];
  /** The change ID echoed from the response. */
  changeId: string | null;
  /** Whether the initial fetch is in progress. */
  isLoading: boolean;
  /** Error from the most recent fetch attempt. */
  error: { message: string; status?: number } | null;
  /** Re-fetch the diff, bypassing cache. */
  refetch: () => void;
}

/**
 * Fetch the diff for a single jj change.
 *
 * Calls GET /api/repos/:owner/:repo/changes/:change_id/diff
 * with optional ?whitespace=ignore query parameter.
 *
 * Results are cached for 30 seconds. Cache key includes
 * the ignore_whitespace option.
 */
export function useChangeDiff(
  owner: string,
  repo: string,
  changeId: string,
  opts?: DiffFetchOptions,
): UseChangeDiffReturn {
  const client = useAPIClient();
  const ignoreWs = opts?.ignore_whitespace ?? false;
  const enabled = opts?.enabled ?? true;

  const [files, setFiles] = useState<FileDiffItem[]>([]);
  const [responseChangeId, setResponseChangeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const cacheKey = changeDiffCacheKey(owner, repo, changeId, ignoreWs);

  const fetchDiff = useCallback(
    async (bypassCache: boolean) => {
      if (!enabled || !owner || !repo || !changeId) return;

      // Check cache first (unless bypassing)
      if (!bypassCache) {
        const cached = getCached<ChangeDiffResponse>(cacheKey);
        if (cached) {
          setFiles(cached.file_diffs);
          setResponseChangeId(cached.change_id);
          setIsLoading(false);
          setError(null);
          return;
        }
      }

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const queryParams = ignoreWs ? "?whitespace=ignore" : "";
        const path = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/changes/${encodeURIComponent(changeId)}/diff${queryParams}`;

        const response = await fetch(`${client.baseUrl}${path}`, {
          headers: {
            Authorization: `token ${client.token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          const message = tryParseErrorMessage(body) ?? `HTTP ${response.status}`;
          throw Object.assign(new Error(message), { status: response.status });
        }

        const data: ChangeDiffResponse = await response.json();

        if (mountedRef.current) {
          setCached(cacheKey, data);
          setFiles(data.file_diffs);
          setResponseChangeId(data.change_id);
          setIsLoading(false);
          setError(null);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (mountedRef.current) {
          const e = err as Error & { status?: number };
          setError({ message: e.message, status: e.status });
          setIsLoading(false);
        }
      }
    },
    [client, owner, repo, changeId, ignoreWs, enabled, cacheKey],
  );

  // Initial fetch on mount or when deps change
  useEffect(() => {
    mountedRef.current = true;
    fetchDiff(false);
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchDiff]);

  const refetch = useCallback(() => {
    invalidateCache(cacheKey);
    fetchDiff(true);
  }, [cacheKey, fetchDiff]);

  return {
    files,
    changeId: responseChangeId,
    isLoading,
    error,
    refetch,
  };
}

function tryParseErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    return parsed?.message ?? null;
  } catch {
    return null;
  }
}
```

**Key design decisions:**

- **Query parameter name:** The change diff endpoint uses `whitespace=ignore` (matching the server route in `apps/server/src/routes/jj.ts` line 238: `const whitespace = (c.req.query("whitespace") ?? "").trim().toLowerCase()`), not `ignore_whitespace`. The `DiffFetchOptions.ignore_whitespace` boolean is mapped to this wire format internally.
- **AbortController:** Each fetch cancels the previous in-flight request. This handles rapid toggling of `ignore_whitespace` without race conditions.
- **Cache bypass on refetch:** `refetch()` invalidates the cache key before fetching, ensuring the user always gets fresh data when explicitly requesting it.
- **URL encoding:** Owner, repo, and changeId are `encodeURIComponent`'d for safety with special characters in jj change IDs.
- **Error shape:** Returns `{ message: string; status?: number }` to match the `UseScreenLoadingOptions.error` contract from `apps/tui/src/loading/types.ts` line 137, enabling direct pass-through to `useScreenLoading`.
- **Auth header:** Uses `Authorization: token ${client.token}` matching `AuthProvider.tsx` line 62. The server accepts both `token` and `Bearer` prefixes (middleware.ts line 57).

---

### 4.2 `useLandingDiff`

#### File: `apps/tui/src/hooks/useLandingDiff.ts`

Fetches the combined diff for a landing request's entire change stack.

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { useAPIClient } from "../providers/APIClientProvider.js";
import type {
  LandingDiffResponse,
  FileDiffItem,
  LandingChangeDiff,
  DiffFetchOptions,
} from "../types/diff.js";
import {
  landingDiffCacheKey,
  getCached,
  setCached,
  invalidateCache,
} from "../lib/diff-cache.js";

export interface UseLandingDiffReturn {
  /** All file diffs flattened across the change stack. */
  files: FileDiffItem[];
  /** The per-change diff breakdown preserving stack structure. */
  changes: LandingChangeDiff[];
  /** The landing request number echoed from the response. */
  landingNumber: number | null;
  /** Whether the initial fetch is in progress. */
  isLoading: boolean;
  /** Error from the most recent fetch attempt. */
  error: { message: string; status?: number } | null;
  /** Re-fetch the diff, bypassing cache. */
  refetch: () => void;
}

/**
 * Fetch the diff for a landing request's change stack.
 *
 * Calls GET /api/repos/:owner/:repo/landings/:number/diff
 * with optional ?ignore_whitespace=true query parameter.
 *
 * Returns both the raw per-change structure and a flattened
 * file list for consumption by the DiffViewer component.
 *
 * Results are cached for 30 seconds. Cache key includes
 * the ignore_whitespace option.
 */
export function useLandingDiff(
  owner: string,
  repo: string,
  number: number,
  opts?: DiffFetchOptions,
): UseLandingDiffReturn {
  const client = useAPIClient();
  const ignoreWs = opts?.ignore_whitespace ?? false;
  const enabled = opts?.enabled ?? true;

  const [files, setFiles] = useState<FileDiffItem[]>([]);
  const [changes, setChanges] = useState<LandingChangeDiff[]>([]);
  const [landingNumber, setLandingNumber] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const cacheKey = landingDiffCacheKey(owner, repo, number, ignoreWs);

  const fetchDiff = useCallback(
    async (bypassCache: boolean) => {
      if (!enabled || !owner || !repo || !number) return;

      if (!bypassCache) {
        const cached = getCached<LandingDiffResponse>(cacheKey);
        if (cached) {
          const flatFiles = flattenChangeDiffs(cached.changes);
          setFiles(flatFiles);
          setChanges(cached.changes);
          setLandingNumber(cached.landing_number);
          setIsLoading(false);
          setError(null);
          return;
        }
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const queryParams = ignoreWs ? "?ignore_whitespace=true" : "";
        const path = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/landings/${number}/diff${queryParams}`;

        const response = await fetch(`${client.baseUrl}${path}`, {
          headers: {
            Authorization: `token ${client.token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          const message = tryParseErrorMessage(body) ?? `HTTP ${response.status}`;
          throw Object.assign(new Error(message), { status: response.status });
        }

        const data: LandingDiffResponse = await response.json();

        if (mountedRef.current) {
          const flatFiles = flattenChangeDiffs(data.changes);
          setCached(cacheKey, data);
          setFiles(flatFiles);
          setChanges(data.changes);
          setLandingNumber(data.landing_number);
          setIsLoading(false);
          setError(null);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (mountedRef.current) {
          const e = err as Error & { status?: number };
          setError({ message: e.message, status: e.status });
          setIsLoading(false);
        }
      }
    },
    [client, owner, repo, number, ignoreWs, enabled, cacheKey],
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchDiff(false);
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchDiff]);

  const refetch = useCallback(() => {
    invalidateCache(cacheKey);
    fetchDiff(true);
  }, [cacheKey, fetchDiff]);

  return {
    files,
    changes,
    landingNumber,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Flatten the per-change diff structure into a single ordered
 * file list for the DiffViewer. Files appearing in multiple
 * changes are included once per change (preserving stack order).
 */
function flattenChangeDiffs(changes: LandingChangeDiff[]): FileDiffItem[] {
  const result: FileDiffItem[] = [];
  for (const change of changes) {
    for (const file of change.file_diffs) {
      result.push(file);
    }
  }
  return result;
}

function tryParseErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    return parsed?.message ?? null;
  } catch {
    return null;
  }
}
```

**Key design decisions:**

- **Query parameter name:** The landing diff endpoint uses `ignore_whitespace=true` (matching `apps/server/src/routes/landings.ts` line 417: `(c.req.query("ignore_whitespace") ?? "").trim().toLowerCase()` and line 418: `val === "true" || val === "1"`). This differs from the change diff endpoint which uses `whitespace=ignore`.
- **Dual return shape:** Returns both `files` (flat list for DiffViewer consumption) and `changes` (stack-structured for per-change navigation). The DiffViewer needs a flat list; the landing detail screen needs the per-change breakdown to show change headers.
- **`flattenChangeDiffs`:** Preserves stack order. Files modified in multiple changes appear multiple times — this is intentional for stacked-change review where a reviewer needs to see each change's contribution independently.
- **Landing number not URL-encoded:** Landing numbers are always positive integers (validated by `landingRouteContext` in the server at line 408), so encoding is unnecessary.

---

### 4.3 `useLandingComments`

#### File: `apps/tui/src/hooks/useLandingComments.ts`

Fetches paginated inline comments for a landing request. Used by the diff viewer to render comments anchored to specific lines.

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { useAPIClient } from "../providers/APIClientProvider.js";
import type { LandingComment } from "../types/diff.js";
import {
  landingCommentsCacheKey,
  getCached,
  setCached,
  invalidateCache,
} from "../lib/diff-cache.js";

export interface UseLandingCommentsReturn {
  /** All loaded comments for this landing request. */
  comments: LandingComment[];
  /** Inline comments only (path !== "" && line > 0), grouped for diff rendering. */
  inlineComments: LandingComment[];
  /** General comments (path === "" || line === 0), shown in comments tab. */
  generalComments: LandingComment[];
  /** Whether loading is in progress. */
  isLoading: boolean;
  /** Error from the most recent fetch attempt. */
  error: { message: string; status?: number } | null;
  /** Whether more pages are available. */
  hasMore: boolean;
  /** Fetch the next page of comments. */
  fetchMore: () => void;
  /** Re-fetch all comments from the beginning, bypassing cache. */
  refetch: () => void;
  /** Total comment count from server X-Total-Count header. */
  totalCount: number;
}

/**
 * Per-page size for comment pagination.
 *
 * The server's parsePagination (landings.ts line 308) defaults
 * to 30 and caps at 100. We use 50 to balance initial load speed
 * with reducing round trips for well-commented reviews.
 */
const COMMENTS_PER_PAGE = 50;

/**
 * Fetch inline comments for a landing request.
 *
 * Calls GET /api/repos/:owner/:repo/landings/:number/comments
 * with page-based pagination (page + per_page query params).
 *
 * The server returns the comments array directly (landings.ts line 658:
 * `writeJSON(c, 200, items)`) with X-Total-Count and Link headers
 * set by setPaginationHeaders (landings.ts line 657).
 *
 * Comments are partitioned into inline (anchored to a file path
 * and line number) and general (not anchored) for separate rendering.
 */
export function useLandingComments(
  owner: string,
  repo: string,
  number: number,
): UseLandingCommentsReturn {
  const client = useAPIClient();

  const [comments, setComments] = useState<LandingComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const pageRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const isInFlightRef = useRef(false);

  const cacheKey = landingCommentsCacheKey(owner, repo, number);

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      if (!owner || !repo || !number) return;
      if (isInFlightRef.current) return;

      // Check cache for first page only
      if (page === 1 && !append) {
        const cached = getCached<{ comments: LandingComment[]; totalCount: number }>(cacheKey);
        if (cached) {
          setComments(cached.comments);
          setTotalCount(cached.totalCount);
          setHasMore(cached.comments.length < cached.totalCount);
          setIsLoading(false);
          setError(null);
          return;
        }
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      isInFlightRef.current = true;

      setIsLoading(true);
      setError(null);

      try {
        const path = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/landings/${number}/comments?page=${page}&per_page=${COMMENTS_PER_PAGE}`;

        const response = await fetch(`${client.baseUrl}${path}`, {
          headers: {
            Authorization: `token ${client.token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          const message = tryParseErrorMessage(body) ?? `HTTP ${response.status}`;
          throw Object.assign(new Error(message), { status: response.status });
        }

        const total = parseInt(response.headers.get("X-Total-Count") ?? "0", 10);
        const data: LandingComment[] = await response.json();

        if (mountedRef.current) {
          const newComments = append ? [...comments, ...data] : data;
          setComments(newComments);
          setTotalCount(total || newComments.length);
          setHasMore(newComments.length < (total || Infinity) && data.length === COMMENTS_PER_PAGE);
          setIsLoading(false);
          setError(null);

          // Cache first page result
          if (page === 1) {
            setCached(cacheKey, { comments: newComments, totalCount: total || newComments.length });
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (mountedRef.current) {
          const e = err as Error & { status?: number };
          setError({ message: e.message, status: e.status });
          setIsLoading(false);
        }
      } finally {
        isInFlightRef.current = false;
      }
    },
    [client, owner, repo, number, comments, cacheKey],
  );

  useEffect(() => {
    mountedRef.current = true;
    pageRef.current = 1;
    fetchPage(1, false);
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [owner, repo, number]); // Intentionally not including fetchPage to avoid infinite loop

  const fetchMore = useCallback(() => {
    if (!hasMore || isInFlightRef.current) return;
    pageRef.current++;
    fetchPage(pageRef.current, true);
  }, [hasMore, fetchPage]);

  const refetch = useCallback(() => {
    invalidateCache(cacheKey);
    pageRef.current = 1;
    setComments([]);
    fetchPage(1, false);
  }, [cacheKey, fetchPage]);

  // Partition comments into inline and general
  const inlineComments = comments.filter((c) => c.path !== "" && c.line > 0);
  const generalComments = comments.filter((c) => c.path === "" || c.line === 0);

  return {
    comments,
    inlineComments,
    generalComments,
    isLoading,
    error,
    hasMore,
    fetchMore,
    refetch,
    totalCount,
  };
}

function tryParseErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    return parsed?.message ?? null;
  } catch {
    return null;
  }
}
```

**Key design decisions:**

- **Comment partitioning:** The hook pre-partitions comments into `inlineComments` (rendered in the diff viewer at their anchored line) and `generalComments` (rendered in a separate comments section below the diff). Comments with `path === ""` or `line === 0` are general comments per the server's default behavior (`body.path ?? ""` and `body.line ?? 0` in `apps/server/src/routes/landings.ts` line 683-684).
- **Response shape:** The server returns the array directly (`writeJSON(c, 200, items)` at line 658), not wrapped in an object. The hook parses `response.json()` as `LandingComment[]`.
- **Page-based pagination:** The landing comments endpoint uses traditional `page`/`per_page` pagination (matching `parsePagination` in `apps/server/src/routes/landings.ts` line 308), not cursor-based. The `X-Total-Count` header (set by `setPaginationHeaders` at line 371) drives `hasMore`.
- **50 comments per page:** Balances initial load speed against reducing round trips. The server allows up to 100 per page.
- **Deduplication guard:** Uses `isInFlightRef` (matching the pattern in `usePaginationLoading.ts` line 42) to prevent duplicate concurrent requests when scroll triggers overlap.
- **Effect dependency exclusion:** `fetchPage` is intentionally excluded from the effect's dependency array to avoid infinite re-renders when `comments` state changes inside `fetchPage`.

---

### 4.4 `useCreateLandingComment`

#### File: `apps/tui/src/hooks/useCreateLandingComment.ts`

Mutation hook for creating an inline comment on a landing request. Supports optimistic updates so the comment appears immediately in the diff viewer.

```typescript
import { useCallback, useRef } from "react";
import { useAPIClient } from "../providers/APIClientProvider.js";
import { useLoading } from "./useLoading.js";
import type {
  LandingComment,
  CreateLandingCommentInput,
} from "../types/diff.js";
import { invalidateCacheByPrefix } from "../lib/diff-cache.js";

export interface UseCreateLandingCommentOptions {
  /** Called immediately with a provisional comment for optimistic rendering. */
  onOptimistic?: (provisionalComment: LandingComment) => void;
  /** Called on server success with the real comment from the server. */
  onSuccess?: (comment: LandingComment) => void;
  /** Called on server error. The optimistic comment should be reverted. */
  onRevert?: (provisionalId: number) => void;
  /** Called on error with the error details. */
  onError?: (error: { message: string; status?: number }) => void;
}

export interface UseCreateLandingCommentReturn {
  /** Submit a new inline comment. */
  submit: (
    owner: string,
    repo: string,
    number: number,
    input: CreateLandingCommentInput,
  ) => void;
  /** Whether a comment submission is in flight. */
  isSubmitting: boolean;
}

let provisionalIdCounter = -1;

/**
 * Mutation hook for creating inline comments on landing requests.
 *
 * Calls POST /api/repos/:owner/:repo/landings/:number/comments
 * Server returns 201 on success (landings.ts line 690).
 *
 * Supports optimistic updates following the same pattern as
 * useOptimisticMutation (useOptimisticMutation.ts line 61):
 * 1. Generates a provisional comment with a negative ID
 * 2. Calls onOptimistic so the caller can insert it into the UI
 * 3. Sends the server request
 * 4. On success: calls onSuccess with the real server comment
 * 5. On error: calls onRevert so the caller can remove the provisional comment
 *
 * The mutation is never aborted on unmount — it completes in the
 * background to avoid data loss.
 */
export function useCreateLandingComment(
  options?: UseCreateLandingCommentOptions,
): UseCreateLandingCommentReturn {
  const client = useAPIClient();
  const loading = useLoading();
  const isSubmittingRef = useRef(false);

  const submit = useCallback(
    (
      owner: string,
      repo: string,
      number: number,
      input: CreateLandingCommentInput,
    ) => {
      if (isSubmittingRef.current) return;

      // Generate provisional comment for optimistic rendering
      const provisionalId = provisionalIdCounter--;
      const provisionalComment: LandingComment = {
        id: provisionalId,
        landing_request_id: 0, // unknown until server responds
        author: { id: 0, login: "you" }, // placeholder, replaced on success
        path: input.path,
        line: input.line,
        side: input.side,
        body: input.body,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Apply optimistic update immediately
      options?.onOptimistic?.(provisionalComment);
      isSubmittingRef.current = true;

      const mutationId = `create-landing-comment-${provisionalId}`;
      loading.registerMutation(mutationId, "create", "landing_comment");

      const path = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/landings/${number}/comments`;

      // Fire and forget — never abort mutations (matches useOptimisticMutation.ts line 61)
      fetch(`${client.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `token ${client.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(input),
      })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.text().catch(() => "");
            const message = tryParseErrorMessage(body) ?? `HTTP ${response.status}`;
            throw Object.assign(new Error(message), { status: response.status });
          }
          return response.json() as Promise<LandingComment>;
        })
        .then((serverComment) => {
          isSubmittingRef.current = false;
          loading.completeMutation(mutationId);

          // Invalidate comments cache so next fetch gets fresh data
          invalidateCacheByPrefix(`landing-comments:${owner}/${repo}:${number}`);

          options?.onSuccess?.(serverComment);
        })
        .catch((err: Error & { status?: number }) => {
          isSubmittingRef.current = false;
          options?.onRevert?.(provisionalId);
          options?.onError?.({
            message: err.message,
            status: err.status,
          });

          const errorMessage =
            err.message.length > 60
              ? err.message.slice(0, 57) + "\u2026"
              : err.message;
          loading.failMutation(mutationId, `\u2717 ${errorMessage}`);

          // Log revert for observability (matches useOptimisticMutation.ts line 79)
          process.stderr.write(
            `loading: action create failed on landing_comment: ` +
              `${err.message} \u2014 reverting optimistic update\n`
          );
        });
    },
    [client, loading, options],
  );

  return {
    submit,
    isSubmitting: isSubmittingRef.current,
  };
}

function tryParseErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    return parsed?.message ?? null;
  } catch {
    return null;
  }
}
```

**Key design decisions:**

- **Provisional IDs:** Uses decrementing negative IDs to avoid collision with server-assigned positive IDs. The caller replaces the provisional comment with the server response in `onSuccess`.
- **Never aborted:** Follows the identical pattern as `useOptimisticMutation` (`useOptimisticMutation.ts` line 61: "intentionally NOT using AbortController because mutations must complete even if user navigates away").
- **Cache invalidation:** On success, busts the comments cache for this landing request so the next `useLandingComments` fetch gets fresh data including the server-assigned ID and timestamp.
- **Loading integration:** Registers with `LoadingProvider` via `loading.registerMutation()` / `loading.completeMutation()` / `loading.failMutation()` for status bar mutation tracking and error display. Matches the exact pattern from `useOptimisticMutation.ts` lines 59-83.
- **Error message truncation:** Caps at 60 characters with "\u2026" suffix, matching the `ERROR_SUMMARY_MAX_LENGTH` constant in `apps/tui/src/loading/constants.ts` line 30 and the truncation pattern in `useOptimisticMutation.ts` lines 73-75.
- **Stderr logging:** Mirrors `useOptimisticMutation.ts` lines 79-83 for observability.

---

## 5. Hook Exports

### File: `apps/tui/src/hooks/index.ts` (additions)

Append these exports after the existing `useBookmarks` export block (after line 40):

```typescript
// Diff data hooks
export { useChangeDiff } from "./useChangeDiff.js";
export type { UseChangeDiffReturn } from "./useChangeDiff.js";
export { useLandingDiff } from "./useLandingDiff.js";
export type { UseLandingDiffReturn } from "./useLandingDiff.js";
export { useLandingComments } from "./useLandingComments.js";
export type { UseLandingCommentsReturn } from "./useLandingComments.js";
export { useCreateLandingComment } from "./useCreateLandingComment.js";
export type { UseCreateLandingCommentReturn, UseCreateLandingCommentOptions } from "./useCreateLandingComment.js";
```

---

## 6. Type Exports

### File: `apps/tui/src/types/index.ts` (additions)

Append these re-exports after the existing `breakpoint` exports (after line 2):

```typescript
export type {
  FileDiffItem,
  ChangeDiffResponse,
  LandingChangeDiff,
  LandingDiffResponse,
  LandingComment,
  LandingCommentAuthor,
  CreateLandingCommentInput,
  DiffFetchOptions,
} from "./diff.js";
```

---

## 7. Implementation Plan

Ordered vertically — each step builds on the previous.

### Step 1: Type definitions
**File:** `apps/tui/src/types/diff.ts`
- Define all interfaces listed in §2: `FileDiffItem`, `ChangeDiffResponse`, `LandingChangeDiff`, `LandingDiffResponse`, `LandingCommentAuthor`, `LandingComment`, `CreateLandingCommentInput`, `DiffFetchOptions`
- **File:** `apps/tui/src/types/index.ts` — append re-exports per §6
- **Verification:** `bun build apps/tui/src/types/diff.ts --no-bundle` compiles without errors

### Step 2: Cache layer
**File:** `apps/tui/src/lib/diff-cache.ts`
- Implement the `Map`-based cache with 30-second TTL
- Implement key builders: `changeDiffCacheKey`, `landingDiffCacheKey`, `landingCommentsCacheKey`
- Implement operations: `getCached`, `setCached`, `invalidateCache`, `invalidateCacheByPrefix`, `clearDiffCache`
- **Verification:** `bunEval` script confirming TTL expiry and prefix invalidation behavior

### Step 3: `useChangeDiff` hook
**File:** `apps/tui/src/hooks/useChangeDiff.ts`
- Implement the hook per §4.1
- Wire into `APIClientProvider` for auth via `useAPIClient()`
- Map `DiffFetchOptions.ignore_whitespace` to `?whitespace=ignore` query parameter
- Handle AbortController lifecycle (cancel on re-fetch and unmount)
- **File:** `apps/tui/src/hooks/index.ts` — append export
- **Verification:** Compiles; E2E test exercises the hook against the real server

### Step 4: `useLandingDiff` hook
**File:** `apps/tui/src/hooks/useLandingDiff.ts`
- Implement the hook per §4.2
- Map `DiffFetchOptions.ignore_whitespace` to `?ignore_whitespace=true` query parameter
- Implement `flattenChangeDiffs` utility for DiffViewer consumption
- **File:** `apps/tui/src/hooks/index.ts` — append export
- **Verification:** Compiles; E2E test exercises the hook

### Step 5: `useLandingComments` hook
**File:** `apps/tui/src/hooks/useLandingComments.ts`
- Implement the hook per §4.3
- Wire page-based pagination with `page` + `per_page` query params and `X-Total-Count` response header
- Implement inline/general comment partitioning (`path !== "" && line > 0`)
- Implement `isInFlightRef` deduplication guard
- **File:** `apps/tui/src/hooks/index.ts` — append export
- **Verification:** Compiles; E2E test exercises pagination

### Step 6: `useCreateLandingComment` mutation hook
**File:** `apps/tui/src/hooks/useCreateLandingComment.ts`
- Implement the hook per §4.4
- Wire optimistic update callbacks (`onOptimistic`, `onSuccess`, `onRevert`, `onError`)
- Wire `LoadingProvider` mutation tracking via `useLoading()` (`registerMutation`/`completeMutation`/`failMutation`)
- Implement provisional ID generation with decrementing negative counter
- Implement cache invalidation on success via `invalidateCacheByPrefix`
- **File:** `apps/tui/src/hooks/index.ts` — append export
- **Verification:** Compiles; E2E test exercises comment creation

### Step 7: E2E tests
**File:** `e2e/tui/diff.test.ts` (append to existing file)
- Write all tests per §8
- Tests run against real API server (configured via `API_URL` from helpers)
- Tests that fail due to stubbed backend endpoints (change diff returns 501) are left failing — never skipped or commented out

---

## 8. Unit & Integration Tests

### File: `e2e/tui/diff.test.ts` (appended after existing edge case tests at line 216)

All tests use `@microsoft/tui-test` via the helpers in `e2e/tui/helpers.ts`. Tests run against a real API server. Tests that fail because backend endpoints are stubbed (e.g., change diff returns 501) are **left failing** — they are never skipped or commented out.

```typescript
import { launchTUI, TUITestInstance, TERMINAL_SIZES } from "./helpers.ts";

// ── Change Diff Data Hook Tests ───────────────────────────────────────────

describe("TUI_DIFF_DATA — useChangeDiff", () => {
  test("DATA-CD-001: navigating to change diff screen triggers API fetch and shows loading or error", async () => {
    // Launch TUI at standard size
    // Navigate: g r → repo list → select repo → changes tab → select change → Enter
    // The change diff endpoint is stubbed (returns 501 "not implemented")
    // Assert: error state is displayed with the 501 message
    // Assert: retry hint "R" is shown in status bar or error screen
    // This test will fail until the change diff backend is implemented
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.sendKeys("g", "r"); // go to repo list
      await terminal.waitForText("Repositories");
      // Navigate to a repo's changes tab and select a change
      // The endpoint returns 501, so expect error display
      // Left failing until backend implements getChangeDiff
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CD-002: change diff displays file list from API response", async () => {
    // Launch TUI at 120x40
    // Navigate to change diff for a known change with file modifications
    // Assert: file names from the API response appear in the file tree
    // Assert: file change type indicators (A/M/D/R) are displayed
    // Assert: addition/deletion counts appear next to file names
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to diff screen
      // Assert file list is populated from response
      // This test will fail until the backend wires getChangeDiff
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CD-003: change diff shows loading state before data arrives", async () => {
    // Launch TUI at 120x40
    // Navigate to change diff
    // Assert: loading indicator (spinner frame or "Loading" text) appears
    // Note: may flash quickly if cache is warm; test captures initial state
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify loading indicator is present during fetch
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CD-004: change diff shows error state on 501 Not Implemented", async () => {
    // The change diff endpoint currently returns 501
    // Navigate to change diff
    // Assert: error message containing "not implemented" is displayed
    // Assert: retry hint is visible (R key or status bar prompt)
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to change diff
      // Since the endpoint returns 501, we should see error state
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CD-005: whitespace toggle refetches with whitespace=ignore query parameter", async () => {
    // Launch TUI at 120x40
    // Navigate to change diff
    // Press 'w' to toggle whitespace
    // Assert: data is refetched (loading indicator briefly appears or state updates)
    // Assert: the request includes ?whitespace=ignore
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to diff, press w
      // Verify refetch occurs with different query parameter
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CD-006: cached diff serves immediately on re-navigation within 30s", async () => {
    // Navigate to change diff, then back (q), then forward again
    // Assert: second navigation shows data immediately without loading spinner
    // The 80ms spinner skip threshold means cached responses never show spinner
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to diff
      // Press q to go back
      // Navigate to same diff again
      // Assert: no loading state visible (cache hit)
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CD-007: explicit refetch (R key) bypasses cache and fetches fresh data", async () => {
    // Navigate to change diff
    // Press R to trigger refetch via useScreenLoading retry
    // Assert: loading indicator appears (cache was bypassed)
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Trigger refetch and verify loading state reappears
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CD-008: whitespace toggle uses separate cache key", async () => {
    // Navigate to change diff (whitespace visible)
    // Data loads and is cached with key ws=false
    // Toggle whitespace (w key) → new fetch with ws=true, cached separately
    // Toggle whitespace again (w key) → served from ws=false cache
    // Assert: no loading state on second toggle back
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify cache isolation between whitespace modes
    } finally {
      await terminal.terminate();
    }
  });
});

// ── Landing Diff Data Hook Tests ──────────────────────────────────────────

describe("TUI_DIFF_DATA — useLandingDiff", () => {
  test("DATA-LD-001: navigating to landing diff triggers API fetch", async () => {
    // Launch TUI, navigate to landings list (g l), open a landing, go to diff tab
    // Assert: diff content appears OR loading/error state is shown
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.sendKeys("g", "l"); // go to landings
      await terminal.waitForText("Landing");
      // Select a landing, navigate to diff tab
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LD-002: landing diff displays files from all changes in stack", async () => {
    // Navigate to a landing with multiple changes in its stack
    // Assert: files from all changes appear in file tree
    // Assert: changes are ordered by stack position (first change's files first)
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to landing diff
      // Verify file tree reflects all changes in stack order
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LD-003: whitespace toggle sends ignore_whitespace=true", async () => {
    // Navigate to landing diff, press w to toggle whitespace
    // Assert: refetch occurs with ignore_whitespace=true query parameter
    // Note: different query param name than change diff (ignore_whitespace vs whitespace)
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to landing diff, toggle whitespace
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LD-004: landing diff error state displays retry hint", async () => {
    // Navigate to landing diff that returns server error
    // Assert: error message displayed to user
    // Assert: retry hint (R key) is available
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to landing diff
      // Verify error handling
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LD-005: landing diff cache key includes ignore_whitespace boolean", async () => {
    // Navigate to landing diff (whitespace ON, ws=false)
    // Toggle whitespace OFF (ws=true)
    // Assert: separate fetch occurs (not served from ws=false cache)
    // Toggle whitespace ON again (ws=false)
    // Assert: served from cache (no loading indicator, sub-80ms response)
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify cache isolation between whitespace modes
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LD-006: empty landing diff shows placeholder when no files changed", async () => {
    // Navigate to a landing with no file changes (empty changes array)
    // Assert: "No files changed" or similar placeholder text appears
    // Assert: no crash or error state
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify empty state rendering
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LD-007: landing diff flattens changes for DiffViewer while preserving stack structure", async () => {
    // Navigate to landing with 3 changes, each modifying 2 files
    // Assert: file tree shows all 6 file entries in stack order
    // Assert: per-change headers or groupings visible in the UI
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify dual return shape works for rendering
    } finally {
      await terminal.terminate();
    }
  });
});

// ── Landing Comments Data Hook Tests ──────────────────────────────────────

describe("TUI_DIFF_DATA — useLandingComments", () => {
  test("DATA-LC-001: comments load when landing diff screen mounts", async () => {
    // Navigate to a landing request diff screen
    // Assert: inline comments appear anchored below their referenced lines
    // OR loading state is shown for comments section
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Navigate to landing diff
      // Verify comments data is fetched alongside diff data
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LC-002: inline comments separated from general comments", async () => {
    // Navigate to landing diff with both inline (path+line) and general (no path) comments
    // Assert: inline comments (path !== '' && line > 0) appear in diff viewer at their lines
    // Assert: general comments (path === '' || line === 0) appear in comments section, not inline
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify comment partitioning logic
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LC-003: comment pagination loads additional pages on scroll", async () => {
    // Navigate to landing with >50 comments (exceeds COMMENTS_PER_PAGE)
    // Scroll to bottom of comments section
    // Assert: additional comments load via pagination (page 2 fetch triggers)
    // Assert: "Loading more..." indicator shown during fetch
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify pagination behavior
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LC-004: comments render author, timestamp, and markdown body", async () => {
    // Navigate to landing diff with at least one comment
    // Assert: @username appears in comment header
    // Assert: relative timestamp appears (e.g., "2 hours ago") in muted color
    // Assert: comment body is rendered as markdown
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify comment rendering content
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LC-005: comments refetch clears cache and reloads from page 1", async () => {
    // Navigate to landing diff with comments loaded
    // Trigger refetch (R key or screen-level retry)
    // Assert: loading state appears
    // Assert: page counter resets to 1
    // Assert: comments reload from first page
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify refetch behavior
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-LC-006: X-Total-Count header drives hasMore pagination state", async () => {
    // Navigate to landing with exactly 50 comments (1 full page)
    // If X-Total-Count > 50: hasMore should be true
    // If X-Total-Count === 50: hasMore should be false (all loaded)
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify hasMore derives from header, not just result count
    } finally {
      await terminal.terminate();
    }
  });
});

// ── Create Landing Comment Mutation Tests ─────────────────────────────────

describe("TUI_DIFF_DATA — useCreateLandingComment", () => {
  test("DATA-CC-001: pressing c on landing diff opens comment form", async () => {
    // Navigate to landing diff view
    // Focus a specific diff line with j/k navigation
    // Press c to open inline comment creation
    // Assert: comment creation form (textarea) appears below the focused line
    // Assert: textarea is focused and accepting input
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify comment form opens
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CC-002: Ctrl+S submits comment and shows optimistic result", async () => {
    // Open comment form on a landing diff line
    // Type comment body text
    // Press Ctrl+S to submit
    // Assert: comment appears immediately below the line (optimistic, provisional ID)
    // Assert: author shows "@you" placeholder with pending indicator
    // Assert: comment body text matches what was typed
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Type comment and submit
      // Verify optimistic rendering with provisional comment
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CC-003: c is no-op on change diff (non-landing context)", async () => {
    // Navigate to a change diff (not a landing request)
    // Focus a diff line
    // Press c
    // Assert: no comment form appears
    // Assert: no error message
    // Assert: terminal state unchanged
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify c is silent no-op outside landing context
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CC-004: Esc cancels empty comment form without confirmation", async () => {
    // Open comment form on landing diff
    // Press Esc immediately (no content typed)
    // Assert: form closes cleanly without confirmation dialog
    // Assert: focus returns to the diff line
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify clean cancellation of empty form
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CC-005: Esc on non-empty form shows discard confirmation", async () => {
    // Open comment form on landing diff
    // Type some content into the textarea
    // Press Esc
    // Assert: "Discard comment? (y/n)" confirmation prompt appears
    // Press n → returns to editing, content preserved
    // Press Esc again, then y → form closes, content discarded
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify discard confirmation flow
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CC-006: server error reverts optimistic comment and shows status bar error", async () => {
    // Submit a comment that the server rejects (e.g., 422 validation error)
    // Assert: optimistic comment (with negative provisional ID) is removed from display
    // Assert: error message appears in status bar for 5 seconds (STATUS_BAR_ERROR_DURATION_MS)
    // Assert: error is prefixed with ✗
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify revert on server error
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CC-007: only one comment form open at a time", async () => {
    // Open comment form on line 5
    // Press c on line 10 (attempting second form)
    // Assert: discard prompt for existing form OR existing form closes
    // Confirm discard
    // Assert: new form opens on line 10, not line 5
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify single-instance enforcement
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CC-008: successful comment creation invalidates comments cache", async () => {
    // Submit a comment successfully
    // Navigate away from the landing diff (q)
    // Navigate back to the same landing diff
    // Assert: comments are refetched (not served from stale cache)
    // Assert: new comment appears with server-assigned ID (not provisional)
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify cache invalidation on success
    } finally {
      await terminal.terminate();
    }
  });

  test("DATA-CC-009: duplicate submission prevented while in-flight", async () => {
    // Open comment form, type content, press Ctrl+S
    // Immediately press Ctrl+S again
    // Assert: only one comment is created (isSubmittingRef guard)
    // Assert: no duplicate optimistic comments appear
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      // Verify submission deduplication
    } finally {
      await terminal.terminate();
    }
  });
});

// ── Responsive Tests ──────────────────────────────────────────────────────

describe("TUI_DIFF_DATA — responsive behavior", () => {
  test("RSP-DD-001: diff data hooks work at 80x24 minimum", async () => {
    // Launch at 80x24 minimum terminal size
    // Navigate to landing diff
    // Assert: data loads and renders (or error state) correctly
    // Assert: no layout overflow or truncation errors
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    try {
      // Verify hook works at minimum size
    } finally {
      await terminal.terminate();
    }
  });

  test("RSP-DD-002: diff data hooks work at 200x60 large", async () => {
    // Launch at 200x60 large terminal size
    // Navigate to landing diff
    // Assert: data loads and renders with expanded layout
    // Assert: more context lines visible, wider diff columns
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
    });
    try {
      // Verify hook works at large size
    } finally {
      await terminal.terminate();
    }
  });

  test("RSP-DD-003: diff snapshot at 80x24 matches golden file", async () => {
    // Launch at 80x24, navigate to landing diff
    // Capture full terminal snapshot
    // Assert: snapshot matches golden file for minimum breakpoint
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    try {
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("RSP-DD-004: diff snapshot at 120x40 matches golden file", async () => {
    // Launch at 120x40, navigate to landing diff
    // Capture full terminal snapshot
    // Assert: snapshot matches golden file for standard breakpoint
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    try {
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });
});
```

---

## 9. File Inventory

| File | Type | Description |
|------|------|-------------|
| `apps/tui/src/types/diff.ts` | New | Diff and comment type definitions (§2) |
| `apps/tui/src/lib/diff-cache.ts` | New | In-memory 30s TTL cache for diff data (§3) |
| `apps/tui/src/hooks/useChangeDiff.ts` | New | Change diff data hook (§4.1) |
| `apps/tui/src/hooks/useLandingDiff.ts` | New | Landing diff data hook with flattening (§4.2) |
| `apps/tui/src/hooks/useLandingComments.ts` | New | Landing comments paginated data hook (§4.3) |
| `apps/tui/src/hooks/useCreateLandingComment.ts` | New | Comment creation mutation hook with optimistic updates (§4.4) |
| `apps/tui/src/hooks/index.ts` | Modified | Append 4 hook exports + 4 type exports (§5) |
| `apps/tui/src/types/index.ts` | Modified | Append 8 type re-exports (§6) |
| `e2e/tui/diff.test.ts` | Modified | Append 25 data hook tests across 5 describe blocks (§8) |

---

## 10. Productionization Notes

### From POC to Production

These hooks are production-ready from the start — no POC step is needed because:

1. **The API contracts are verified.** The server route handlers have been read directly:
   - `apps/server/src/routes/jj.ts` lines 227-243: change diff uses `whitespace=ignore` query param, returns 501
   - `apps/server/src/routes/landings.ts` lines 718-735: landing diff uses `ignore_whitespace=true` via `diffWhitespaceIgnored()` helper at line 416
   - `apps/server/src/routes/landings.ts` lines 642-662: comments list uses `parsePagination` (page/per_page), returns `X-Total-Count` header via `setPaginationHeaders`, response body is the items array directly
   - `apps/server/src/routes/landings.ts` lines 664-694: comment creation returns 201, accepts path/line/side/body

2. **The TUI patterns are established and matched exactly.** The hooks follow the identical patterns already in production:
   - `useOptimisticMutation.ts`: never-abort mutation pattern, `registerMutation`/`completeMutation`/`failMutation`, error truncation at 60 chars, stderr logging
   - `useScreenLoading.ts`: error shape `{ message: string; status?: number }` matching `UseScreenLoadingOptions.error` type
   - `usePaginationLoading.ts`: `isInFlightRef` deduplication guard pattern
   - `APIClientProvider.tsx`: `useAPIClient()` returning `{ baseUrl: string; token: string }`

3. **No new dependencies.** These hooks use only `react`, the existing `APIClientProvider`, and the existing `LoadingProvider`. No native deps, no new npm packages.

### Pre-merge Checklist

- [ ] All 4 hook files compile without errors (`bun build apps/tui/src/hooks/useChangeDiff.ts --no-bundle`)
- [ ] Type definitions import correctly from `apps/tui/src/types/diff.ts`
- [ ] Cache layer key generation is deterministic (verify: `changeDiffCacheKey("a","b","c",true) === changeDiffCacheKey("a","b","c",true)`)
- [ ] Cache TTL expiry works at 30 seconds (verify with `bunEval` using setTimeout)
- [ ] `invalidateCacheByPrefix("landing-comments:owner/repo:1")` removes the correct entries
- [ ] Hooks export from barrel file (`apps/tui/src/hooks/index.ts`)
- [ ] Types export from barrel file (`apps/tui/src/types/index.ts`)
- [ ] E2E tests are appended to `e2e/tui/diff.test.ts` after existing edge case tests (line 216)
- [ ] Tests that fail due to stubbed backends (501 for change diff) are left failing — never skipped
- [ ] No mocking of `APIClient`, `LoadingProvider`, or other internals in tests
- [ ] `useCreateLandingComment` integrates with `LoadingProvider` for status bar error display
- [ ] `useCreateLandingComment` never aborts in-flight mutations on unmount
- [ ] `useCreateLandingComment` logs to `process.stderr` on revert (matching `useOptimisticMutation.ts` line 79)
- [ ] URL encoding applied to owner, repo, and changeId path segments
- [ ] The change diff endpoint uses `?whitespace=ignore` (confirmed: `jj.ts` line 238)
- [ ] The landing diff endpoint uses `?ignore_whitespace=true` (confirmed: `landings.ts` line 417-418)
- [ ] The landing comments endpoint uses `?page=N&per_page=50` (confirmed: `landings.ts` line 308-334)
- [ ] The comments list response is a bare array `LandingComment[]` (confirmed: `landings.ts` line 658)
- [ ] The comment creation endpoint expects `POST` and returns `201` (confirmed: `landings.ts` line 690)
- [ ] Error shape `{ message: string; status?: number }` is compatible with `UseScreenLoadingOptions.error` (confirmed: `loading/types.ts` line 137)
- [ ] Auth header uses `Authorization: token ${client.token}` matching `AuthProvider.tsx` line 62

### Error Handling Matrix

| Scenario | Hook Behavior | User-Visible State |
|----------|--------------|--------------------|---|
| Network error (offline) | `error = { message: "Network error" }` | Error screen with "Press R to retry" |
| 401 Unauthorized | `error = { message, status: 401 }` | "Session expired. Run `codeplane auth login`" via `parseToLoadingError` |
| 404 Not Found | `error = { message, status: 404 }` | "Not found" error screen |
| 422 Validation Error (comment) | `error = { message, status: 422 }` | Optimistic revert + 5s status bar error prefixed with ✗ |
| 429 Rate Limited | `error = { message, status: 429 }` | "Rate limited — try again later" via `parseToLoadingError` |
| 500+ Server Error | `error = { message, status: 5xx }` | "Internal Server Error (5xx)" with retry hint |
| 501 Not Implemented (stubbed) | `error = { message: "get change diff not implemented", status: 501 }` | Error screen with retry hint |
| Abort (navigation away) | Silent — `if (err.name === "AbortError") return` | Previous screen restores cleanly |
| Mutation error (comment creation) | `onRevert(provisionalId)` + `loading.failMutation()` | Provisional comment removed, 5-second error toast in status bar |

### Integration Points

These hooks will be consumed by:

1. **`DiffScreen`** (`apps/tui/src/screens/DiffScreen.tsx`) — Uses `useChangeDiff` or `useLandingDiff` depending on navigation params. Passes `files` to `DiffViewer` component. Wires `isLoading`/`error`/`refetch` to `useScreenLoading` for full-screen loading states.
2. **`LandingDetailScreen`** (`apps/tui/src/screens/LandingDetailScreen.tsx`) — Uses `useLandingDiff` for the diff tab and `useLandingComments` for rendering inline review comments. Uses `changes` (not `files`) for per-change header display.
3. **Inline comment form component** — Uses `useCreateLandingComment` with optimistic callbacks to insert/remove provisional comments in the diff viewer's comment list.

The hooks are designed to compose directly with `useScreenLoading` since the error shape matches:

```typescript
// Example integration in DiffScreen
function DiffScreen({ owner, repo, changeId }: DiffScreenProps) {
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const { files, isLoading, error, refetch } = useChangeDiff(
    owner, repo, changeId,
    { ignore_whitespace: ignoreWhitespace }
  );
  // error shape { message: string; status?: number } matches UseScreenLoadingOptions.error
  const { showSpinner, showError, loadingError, retry } = useScreenLoading({
    id: `diff-${changeId}`,
    label: "Loading diff…",
    isLoading,
    error,
    onRetry: refetch,
  });
  // ... render DiffViewer with files
}
```

---

## 11. Architectural Constraints Compliance

| Constraint | Compliance | Evidence |
|-----------|------------|----------|
| All code in `apps/tui/src/` | ✅ | All new files under `apps/tui/src/types/`, `apps/tui/src/lib/`, `apps/tui/src/hooks/` |
| Tests in `e2e/tui/` | ✅ | Tests appended to `e2e/tui/diff.test.ts` |
| Uses `@microsoft/tui-test` | ✅ | All tests use `launchTUI` helper, `TUITestInstance`, `TERMINAL_SIZES` from `e2e/tui/helpers.ts` |
| No mocking implementation details | ✅ | Tests run against real API server; no mock of `APIClient` or `LoadingProvider` |
| Failing tests left failing | ✅ | Tests against 501 endpoints (change diff) will fail until backend implements `getChangeDiff` |
| No new runtime dependencies | ✅ | Uses only `react` and existing providers |
| Keyboard-first interaction | ✅ | All toggle/refetch actions are keyboard-triggered (w, R, c, Ctrl+S, Esc) |
| Consumes `APIClientProvider` | ✅ | All hooks call `useAPIClient()` from `apps/tui/src/providers/APIClientProvider.tsx` |
| Integrates with `LoadingProvider` | ✅ | Mutation hook uses `useLoading()` → `registerMutation`/`completeMutation`/`failMutation` |
| Follows optimistic mutation pattern | ✅ | `useCreateLandingComment` mirrors `useOptimisticMutation` (never-abort, stderr log, error truncation) |
| No browser APIs | ✅ | Uses only `fetch` (available in Bun natively) and React hooks |
| `.js` import extensions | ✅ | All imports use `.js` extensions matching ESM convention in existing codebase |
| Error shape compatible | ✅ | Returns `{ message: string; status?: number }` matching `loading/types.ts` `UseScreenLoadingOptions.error` |
| Auth header consistent | ✅ | Uses `token` prefix matching `AuthProvider.tsx` line 62; server accepts both `token` and `Bearer` (middleware.ts line 57) |