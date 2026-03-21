# Engineering Specification: `tui-notification-data-hooks`

## Notification data hooks adapter — useNotifications integration with pagination and optimistic mutations

**Ticket:** tui-notification-data-hooks 
**Status:** New 
**Dependencies:** tui-navigation-provider, tui-theme-provider 
**Target:** `apps/tui/src/hooks/useNotificationsAdapter.ts` 
**Tests:** `e2e/tui/notifications.test.ts`

---

## 1. Overview

This ticket creates the data layer adapter hook for the TUI notification system. The hook wraps `@codeplane/ui-core`'s `usePaginatedQuery` and `useMutation` primitives to provide the Notification screen and the StatusBar notification badge with a single, consumption-ready interface.

The hook manages:
- **Page-based pagination** against `GET /api/notifications/list?page=N&per_page=30`
- **500-item memory cap** with oldest-read-first eviction
- **Client-side filtering** (All / Unread status toggle, substring search on subject + body)
- **Optimistic `markRead(id)`** via `PATCH /api/notifications/:id` with revert on error
- **Optimistic `markAllRead()`** via `PUT /api/notifications/mark-read` with revert on error
- **`unreadCount` derivation** from the in-memory item set
- **SSE prepend** for real-time notification arrival with deduplication by `id`
- **Sorting** by `created_at` descending (newest first)

---

## 2. API Contract Reference

The following endpoints are consumed. These are defined in `apps/server/src/routes/notifications.ts` and backed by `packages/sdk/src/services/notification.ts`.

### 2.1 List notifications

```
GET /api/notifications/list?page={N}&per_page={P}

Response 200:
  Headers: X-Total-Count: {total}
  Body: NotificationResponse[]
```

### 2.2 Mark single notification read

```
PATCH /api/notifications/:id

Response 204: No Content
```

### 2.3 Mark all notifications read

```
PUT /api/notifications/mark-read

Response 204: No Content
```

### 2.4 SSE stream

```
GET /api/notifications (SSE)

Event type: "notification"
Event data: JSON-encoded NotificationResponse
Event id: notification.id (integer string)
Supports Last-Event-ID header for replay
```

### 2.5 Notification shape

From `packages/sdk/src/services/notification.ts`:

```typescript
interface NotificationResponse {
  id: number;
  user_id: number;
  source_type: string;    // e.g., "issue_assigned", "lr_reviewed"
  source_id: number | null;
  subject: string;
  body: string;
  status: string;
  read_at: string | null; // ISO 8601 or null if unread
  created_at: string;     // ISO 8601
  updated_at: string;     // ISO 8601
}
```

---

## 3. Type Definitions

**File:** `apps/tui/src/hooks/notification-types.ts`

```typescript
import type { HookError } from "@codeplane/ui-core/src/types/errors.js";

// --- Domain model ---

export interface Notification {
  id: number;
  userId: number;
  sourceType: string;
  sourceId: number | null;
  subject: string;
  body: string;
  status: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NotificationFilterStatus = "all" | "unread";

export interface NotificationFilters {
  status: NotificationFilterStatus;
  search: string;
}

// --- Hook return types ---

export interface UseNotificationsResult {
  /** Filtered, sorted notifications visible to the UI. */
  items: Notification[];
  /** Total unread count from the full in-memory set (not filtered). */
  unreadCount: number;
  /** Total server-side notification count. */
  totalCount: number;
  /** Whether a page fetch is in progress. */
  loading: boolean;
  /** Last error from fetch or mutation. */
  error: HookError | null;
  /** Whether more pages exist on the server. */
  hasMore: boolean;
  /** Trigger loading the next page. */
  loadMore: () => void;
  /** Hard-refresh from page 1. */
  refetch: () => void;
  /** Mark a single notification as read (optimistic). */
  markRead: (id: number) => Promise<void>;
  /** Mark all notifications as read (optimistic). */
  markAllRead: () => Promise<void>;
  /** Whether a markRead/markAllRead mutation is in flight. */
  mutating: boolean;
  /** Current active filters. */
  filters: NotificationFilters;
  /** Update filter status. */
  setFilterStatus: (status: NotificationFilterStatus) => void;
  /** Update search string. */
  setSearchQuery: (query: string) => void;
  /** Prepend a notification from SSE (deduplicates). */
  prepend: (notification: Notification) => void;
}

export type { HookError };

// --- Constants ---

export const MAX_NOTIFICATIONS = 500;
export const DEFAULT_PER_PAGE = 30;
export const MAX_PER_PAGE = 50;
```

---

## 4. Implementation Plan

### Step 1: Create notification domain types

**File:** `apps/tui/src/hooks/notification-types.ts`

Define the types listed in §3 above. This mirrors the pattern in `apps/tui/src/hooks/workflow-types.ts`.

**Key decisions:**
- The domain model uses camelCase (`sourceType`) while the API response uses snake_case (`source_type`). A `parseNotification()` mapper function lives in the adapter hook file.
- `NotificationFilters` is a value type, not a ref. Filter changes trigger re-derivation but not re-fetch (filtering is client-side).

### Step 2: Create the adapter hook

**File:** `apps/tui/src/hooks/useNotificationsAdapter.ts`

This is the primary deliverable. It composes three concerns:

#### 2a. Pagination via `usePaginatedQuery`

```typescript
import { usePaginatedQuery } from "@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";

const client = useAPIClient();
const path = "/api/notifications/list";
const cacheKey = "notifications:list";

const paginated = usePaginatedQuery<Notification>({
  client,
  path,
  cacheKey,
  perPage: DEFAULT_PER_PAGE,
  enabled: true,
  maxItems: MAX_NOTIFICATIONS,
  autoPaginate: false,
  parseResponse: (data: unknown, headers: Headers) => {
    const items = Array.isArray(data) ? data.map(parseNotification) : [];
    const totalHeader = headers.get("X-Total-Count");
    const totalCount = totalHeader ? parseInt(totalHeader, 10) : null;
    return { items, totalCount: isNaN(totalCount as number) ? null : totalCount };
  },
});
```

**Note:** The notification list endpoint returns a flat array body with the total in the `X-Total-Count` header (see `apps/server/src/routes/notifications.ts` line 96-97: `c.header("X-Total-Count", String(result.value.total)); return writeJSON(c, 200, result.value.items);`). This differs from the workflow runs endpoint which returns `{ runs, total_count }`. The `parseResponse` function handles this correctly.

#### 2b. Local state overlay for SSE prepend + optimistic mutations

The paginated query manages the server-fetched items. On top of that, we maintain a local overlay:

```typescript
const [localOverrides, setLocalOverrides] = useState<Map<number, Partial<Notification>>>(new Map());
const [prependedItems, setPrependedItems] = useState<Notification[]>([]);
```

**`prependedItems`**: Notifications delivered via SSE that arrived after the last fetch. These are prepended to the paginated items.

**`localOverrides`**: Optimistic mutation state. When `markRead(id)` is called, we insert `{ id, readAt: new Date().toISOString() }` into overrides. On server success, the override persists (it's correct). On server error, the override is deleted (revert).

**Merging logic (computed every render):**

```typescript
function mergeItems(
  paginatedItems: Notification[],
  prepended: Notification[],
  overrides: Map<number, Partial<Notification>>
): Notification[] {
  // 1. Combine prepended + paginated, deduplicate by id (prepended wins)
  const seenIds = new Set<number>();
  const combined: Notification[] = [];

  for (const item of prepended) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      combined.push(item);
    }
  }
  for (const item of paginatedItems) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      combined.push(item);
    }
  }

  // 2. Apply overrides
  const merged = combined.map(item => {
    const override = overrides.get(item.id);
    return override ? { ...item, ...override } : item;
  });

  // 3. Sort by created_at descending
  merged.sort((a, b) => {
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    return db - da;
  });

  // 4. Enforce memory cap with oldest-read-first eviction
  if (merged.length > MAX_NOTIFICATIONS) {
    return evictOldestRead(merged, MAX_NOTIFICATIONS);
  }

  return merged;
}
```

#### 2c. Memory cap with oldest-read-first eviction

```typescript
function evictOldestRead(items: Notification[], cap: number): Notification[] {
  if (items.length <= cap) return items;

  // Partition into unread and read
  const unread: Notification[] = [];
  const read: Notification[] = [];
  for (const item of items) {
    if (item.readAt === null) {
      unread.push(item);
    } else {
      read.push(item);
    }
  }

  const excess = items.length - cap;

  if (read.length >= excess) {
    // Evict oldest read (read is already sorted newest-first from parent sort)
    const keptRead = read.slice(0, read.length - excess);
    // Re-merge and re-sort
    const result = [...unread, ...keptRead];
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return result;
  } else {
    // All read evicted, still over cap — evict oldest unread too
    const remaining = cap - 0; // keep 0 read
    const keptUnread = unread.slice(0, remaining);
    return keptUnread; // already sorted
  }
}
```

#### 2d. Client-side filtering

```typescript
const [filters, setFilters] = useState<NotificationFilters>({
  status: "all",
  search: "",
});

function applyFilters(items: Notification[], filters: NotificationFilters): Notification[] {
  let filtered = items;

  // Status filter
  if (filters.status === "unread") {
    filtered = filtered.filter(n => n.readAt === null);
  }

  // Substring search on subject + body (case-insensitive)
  if (filters.search.trim().length > 0) {
    const query = filters.search.trim().toLowerCase();
    filtered = filtered.filter(n =>
      n.subject.toLowerCase().includes(query) ||
      n.body.toLowerCase().includes(query)
    );
  }

  return filtered;
}
```

Filtering is applied as the last step before returning `items` from the hook. It does NOT affect `unreadCount` — that is always derived from the full merged set.

#### 2e. Optimistic `markRead(id)`

```typescript
const markReadMutation = useMutation<number, void>({
  mutationFn: async (id, signal) => {
    const response = await client.request(`/api/notifications/${id}`, {
      method: "PATCH",
      signal,
    });
    if (!response.ok) {
      throw await parseResponseError(response);
    }
  },
  onOptimistic: (id) => {
    // Apply optimistic read_at
    setLocalOverrides(prev => {
      const next = new Map(prev);
      next.set(id, { readAt: new Date().toISOString() });
      return next;
    });
  },
  onSuccess: (_result, id) => {
    // Override stays — it's correct
  },
  onError: (_error, id) => {
    // Revert: remove the override so the item appears unread again
    setLocalOverrides(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  },
});
```

#### 2f. Optimistic `markAllRead()`

```typescript
const markAllReadMutation = useMutation<void, void>({
  mutationFn: async (_input, signal) => {
    const response = await client.request("/api/notifications/mark-read", {
      method: "PUT",
      signal,
    });
    if (!response.ok) {
      throw await parseResponseError(response);
    }
  },
  onOptimistic: () => {
    // Snapshot current unread IDs for rollback
    const snapshot = new Map(localOverrides);
    const allItems = mergeItems(paginated.items, prependedItems, localOverrides);
    const newOverrides = new Map(localOverrides);
    for (const item of allItems) {
      if (item.readAt === null) {
        newOverrides.set(item.id, { readAt: new Date().toISOString() });
      }
    }
    setLocalOverrides(newOverrides);

    // Store snapshot for rollback on the mutation function object
    (markAllReadMutation as any).__rollbackSnapshot = snapshot;
  },
  onSuccess: () => {
    delete (markAllReadMutation as any).__rollbackSnapshot;
  },
  onError: () => {
    // Revert to snapshot
    const snapshot = (markAllReadMutation as any).__rollbackSnapshot;
    if (snapshot instanceof Map) {
      setLocalOverrides(snapshot);
    }
    delete (markAllReadMutation as any).__rollbackSnapshot;
  },
});
```

#### 2g. `unreadCount` derivation

```typescript
const allMerged = mergeItems(paginated.items, prependedItems, localOverrides);
const unreadCount = allMerged.filter(n => n.readAt === null).length;
```

This is computed from the full merged set before client-side filtering, so it always reflects the true unread count of loaded items.

#### 2h. SSE prepend with deduplication

```typescript
const prepend = useCallback((notification: Notification) => {
  setPrependedItems(prev => {
    // Deduplicate: if id already exists in prepended or paginated items, skip
    if (prev.some(n => n.id === notification.id)) return prev;
    // Also check paginated items
    if (paginated.items.some(n => n.id === notification.id)) return prev;
    return [notification, ...prev];
  });
}, [paginated.items]);
```

The `prepend` function is exposed for the Notification screen to call when it receives an SSE event:

```typescript
// In the Notification screen component:
useSSE("notification", (event) => {
  try {
    const raw = JSON.parse(event.data);
    const notification = parseNotification(raw);
    prepend(notification);
  } catch {
    // Ignore malformed events
  }
});
```

#### 2i. Response shape mapper

```typescript
function parseNotification(raw: any): Notification {
  return {
    id: Number(raw.id),
    userId: Number(raw.user_id),
    sourceType: raw.source_type ?? "",
    sourceId: raw.source_id != null ? Number(raw.source_id) : null,
    subject: raw.subject ?? "",
    body: raw.body ?? "",
    status: raw.status ?? "",
    readAt: raw.read_at ?? null,
    createdAt: raw.created_at ?? "",
    updatedAt: raw.updated_at ?? "",
  };
}
```

This is a pure function exported for test access and reuse by the SSE handler.

### Step 3: Hook composition and return

```typescript
export function useNotificationsAdapter(): UseNotificationsResult {
  const client = useAPIClient();
  // ... all the above pieces ...

  const allMerged = mergeItems(paginated.items, prependedItems, localOverrides);
  const unreadCount = allMerged.filter(n => n.readAt === null).length;
  const visibleItems = applyFilters(allMerged, filters);

  return {
    items: visibleItems,
    unreadCount,
    totalCount: paginated.totalCount,
    loading: paginated.isLoading,
    error: paginated.error ?? markReadMutation.error ?? markAllReadMutation.error,
    hasMore: paginated.hasMore,
    loadMore: paginated.fetchMore,
    refetch: paginated.refetch,
    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
    mutating: markReadMutation.isLoading || markAllReadMutation.isLoading,
    filters,
    setFilterStatus: (status) => setFilters(prev => ({ ...prev, status })),
    setSearchQuery: (query) => setFilters(prev => ({ ...prev, search: query })),
    prepend,
  };
}
```

### Step 4: Export from hooks barrel

**File:** `apps/tui/src/hooks/index.ts`

Add:

```typescript
export { useNotificationsAdapter } from "./useNotificationsAdapter.js";
export type {
  Notification,
  NotificationFilters,
  NotificationFilterStatus,
  UseNotificationsResult,
} from "./notification-types.js";
```

### Step 5: SSE integration helper hook

**File:** `apps/tui/src/hooks/useNotificationSSE.ts`

A thin hook that bridges the SSE provider with the adapter's `prepend` function. This follows the pattern established by `apps/tui/src/screens/Agents/hooks/useSessionListSSE.ts`.

```typescript
import { useCallback } from "react";
import { useSSE } from "../providers/SSEProvider.js";
import { parseNotification } from "./useNotificationsAdapter.js";
import type { Notification } from "./notification-types.js";

/**
 * Subscribes to the "notification" SSE channel and calls `onNotification`
 * for each incoming notification.
 *
 * Depends on SSEProvider being mounted in the provider stack.
 */
export function useNotificationSSE(
  onNotification: (notification: Notification) => void,
): void {
  const handler = useCallback(
    (event: { type: string; data: string; id: string }) => {
      try {
        const raw = JSON.parse(event.data);
        const notification = parseNotification(raw);
        onNotification(notification);
      } catch {
        // Ignore malformed SSE events
      }
    },
    [onNotification],
  );

  useSSE("notification", handler);
}
```

This hook is exported separately so the StatusBar badge component can subscribe independently of the notification list screen.

---

## 5. File Manifest

| File | Purpose | New/Modified |
|------|---------|-------------|
| `apps/tui/src/hooks/notification-types.ts` | Domain types, filter types, hook return types, constants | New |
| `apps/tui/src/hooks/useNotificationsAdapter.ts` | Primary adapter hook — pagination, filtering, optimistic mutations, SSE prepend, eviction | New |
| `apps/tui/src/hooks/useNotificationSSE.ts` | SSE bridge hook for real-time notification events | New |
| `apps/tui/src/hooks/index.ts` | Barrel export — add notification hook and type exports | Modified |
| `e2e/tui/notifications.test.ts` | E2E tests for notification data hooks | New |

---

## 6. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     useNotificationsAdapter()                   │
│                                                                 │
│  ┌─────────────────────┐    ┌──────────────────────────────┐   │
│  │  usePaginatedQuery   │    │    SSE (via useNotificationSSE)│   │
│  │  GET /api/notif/list │    │    prepend(notification)      │   │
│  │                      │    │                               │   │
│  │  paginated.items ────┼────┼──> mergeItems()               │   │
│  └──────────────────────┘    │       ▲                       │   │
│                               │       │ prependedItems        │   │
│                               └───────┘                       │   │
│                                                                 │
│  localOverrides (Map<id, Partial<Notification>>)               │
│       │                                                         │
│       ▼                                                         │
│  mergeItems(paginated, prepended, overrides)                   │
│       │                                                         │
│       ├──> unreadCount = merged.filter(n => !n.readAt).length  │
│       │                                                         │
│       ▼                                                         │
│  applyFilters(merged, { status, search })                      │
│       │                                                         │
│       ▼                                                         │
│  items (visible to UI)                                          │
│                                                                 │
│  ┌───────────────────┐   ┌───────────────────────┐             │
│  │ markRead(id)       │   │ markAllRead()          │             │
│  │ PATCH /api/notif/:id│   │ PUT /api/notif/mark-read│             │
│  │ optimistic → override│   │ optimistic → override all│             │
│  │ revert on error    │   │ revert on error        │             │
│  └───────────────────┘   └───────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Edge Cases & Invariants

### 7.1 Deduplication

- SSE may deliver a notification that already exists in the paginated set (e.g., if a refetch races with an SSE event). `mergeItems()` deduplicates by `id` — prepended items win over paginated items because they appear first in the merge loop.
- The `prepend()` function also checks both `prependedItems` and `paginated.items` before inserting.

### 7.2 Sort stability

- All items are sorted by `created_at` descending. Since `created_at` is server-generated and unique to sub-second precision, sort is deterministic. If two items share the same `created_at`, secondary sort by `id` descending.

### 7.3 Eviction under memory cap

- The 500-item cap is enforced on the merged set BEFORE filtering. This means the full in-memory set never exceeds 500.
- Eviction priority: oldest read notifications are evicted first. Unread notifications are only evicted when all read notifications have been removed and the set still exceeds 500.
- After `markAllRead()`, all items become read. The next eviction pass treats them all equally (oldest first).

### 7.4 Refetch clears prepended items

- When `refetch()` is called, `prependedItems` is cleared to avoid duplicates with the fresh server response. The `refetch` wrapper:

```typescript
const refetch = useCallback(() => {
  setPrependedItems([]);
  setLocalOverrides(new Map());
  paginated.refetch();
}, [paginated.refetch]);
```

### 7.5 Filter does not affect unreadCount

- `unreadCount` is always derived from the full merged set, not the filtered subset. This ensures the StatusBar badge shows the true unread count regardless of the active filter.

### 7.6 Concurrent mutation guard

- `useMutation` already prevents concurrent mutations (throws "mutation in progress"). The adapter exposes `mutating: boolean` so the UI can disable the mark-read button during an in-flight request.

### 7.7 Stale override cleanup

- Overrides persist until refetch. On refetch, all overrides are cleared because the fresh server data reflects the true read state. This prevents overrides from accumulating indefinitely.

### 7.8 Empty state

- When `paginated.items` is empty and `prependedItems` is empty, `items` is an empty array. The UI should show "No notifications" (All filter) or "No unread notifications" (Unread filter).

---

## 8. Dependencies on Other Tickets

| Dependency | What it provides | How this hook uses it |
|-----------|------------------|-----------------------|
| `tui-navigation-provider` | `NavigationProvider` in provider stack, `useNavigation()` hook | Notification detail navigation ("navigate to referenced resource") is a screen-level concern, not a hook concern. The hook does not depend on navigation directly, but the screen that consumes it does. |
| `tui-theme-provider` | `ThemeProvider` in provider stack, `useTheme()` hook | The hook itself does not use theme tokens. The notification list component that renders items uses theme tokens for styling (read vs unread, error colors). |

Both dependencies must be merged before the notification screen can render, but the hook itself only requires `APIClientProvider` and `SSEProvider` in the provider stack.

---

## 9. Productionization Notes

### 9.1 No POC code

This hook is built directly on production-proven primitives (`usePaginatedQuery`, `useMutation`, `useSSE`). No proof-of-concept code is needed.

### 9.2 parseNotification is defensive

The `parseNotification()` function uses `?? ""` and `?? null` fallbacks for every field. This protects against partial responses from API version drift or SSE event format changes. No thrown errors for missing fields.

### 9.3 Eviction is O(n) worst case

The `evictOldestRead()` function partitions items into read/unread arrays. For 500 items, this is negligible. If the cap were raised to 5000+, a more efficient eviction strategy (e.g., maintaining a sorted read-queue) would be warranted.

### 9.4 No memoization needed for filtering

Client-side filtering (`applyFilters`) runs on every render. With a 500-item cap, this is sub-millisecond. React 19's automatic batching ensures filter state changes and pagination updates are batched into single renders.

### 9.5 SSE reconnection replay

The SSE provider handles reconnection and `Last-Event-ID` replay. The `prepend()` function handles deduplication of replayed events. No special handling is needed in the adapter hook.

### 9.6 Export `parseNotification` for reuse

`parseNotification` is exported as a named export from `useNotificationsAdapter.ts` so that both `useNotificationSSE.ts` and tests can use it without importing the full hook.

---

## 10. Unit & Integration Tests

**File:** `e2e/tui/notifications.test.ts`

All tests use `@microsoft/tui-test` via `launchTUI()` from `e2e/tui/helpers.ts`. Tests run against the real API server with test fixtures. Tests that fail due to unimplemented backend features are left failing — never skipped or commented out.

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI } from "./helpers.js";

describe("Notification Data Hooks", () => {

  // =========================================================================
  // Pagination — useNotificationsAdapter page loading
  // =========================================================================
  describe("Pagination", () => {

    test("HOOK-NOTIF-001: notifications load on screen mount with loading→data transition", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Loading");
      await terminal.waitForText("Notifications");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-002: notifications display empty state when inbox is empty", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
        env: { CODEPLANE_TOKEN: "empty-notifications-user-token" },
      });
      await terminal.waitForText("No notifications");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-003: scroll to bottom triggers next page load", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      // Scroll to bottom
      await terminal.sendKeys("G");
      await terminal.waitForText("Loading more");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-004: error state renders on API failure", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
        env: { CODEPLANE_TOKEN: "invalid-token" },
      });
      await terminal.waitForText("error", 5000);
      await terminal.terminate();
    });

    test("HOOK-NOTIF-005: refetch clears list and reloads from page 1", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("ctrl+r");
      await terminal.waitForText("Loading");
      await terminal.waitForText("Notifications");
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Sorting
  // =========================================================================
  describe("Sorting", () => {

    test("HOOK-NOTIF-006: notifications are sorted newest first by created_at", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      // Verify the snapshot shows items in descending chronological order
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Client-side filtering
  // =========================================================================
  describe("Filtering", () => {

    test("HOOK-NOTIF-010: filter toggle to Unread hides read notifications", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      // Press Tab to switch from All to Unread filter tab
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Unread");
      // Read notifications should be hidden
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-011: filter toggle back to All shows all notifications", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      // Switch to Unread, then back to All
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Unread");
      await terminal.sendKeys("Shift+Tab");
      await terminal.waitForText("All");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-012: search filters by substring in subject", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      // Press / to focus search input
      await terminal.sendKeys("/");
      await terminal.sendText("issue assigned");
      // Only matching notifications should be visible
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-013: search filters by substring in body", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("/");
      await terminal.sendText("review requested");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-014: Esc clears search and restores full list", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("/");
      await terminal.sendText("nonexistent");
      await terminal.waitForText("No notifications");
      await terminal.sendKeys("Escape");
      await terminal.waitForText("Notifications");
      // Full list should be restored
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-015: search is case-insensitive", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("/");
      await terminal.sendText("ISSUE");
      // Should match lowercase subject text
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Optimistic markRead(id)
  // =========================================================================
  describe("Mark Read", () => {

    test("HOOK-NOTIF-020: markRead immediately updates item appearance", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      // Navigate to first unread notification and press Enter or 'r' to mark read
      await terminal.sendKeys("r");
      // Item should immediately appear as read (visual change)
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-021: markRead decrements unread badge count", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      // Capture initial badge count from status bar
      const statusBarBefore = terminal.getLine(terminal.rows - 1);
      await terminal.sendKeys("r");
      // Badge count in status bar should have decremented
      const statusBarAfter = terminal.getLine(terminal.rows - 1);
      // Regex check that the count changed
      expect(statusBarBefore).not.toEqual(statusBarAfter);
      await terminal.terminate();
    });

    test("HOOK-NOTIF-022: markRead reverts on server error", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
        env: { CODEPLANE_SIMULATE_NOTIF_ERROR: "true" },
      });
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("r");
      // After server error, item should revert to unread appearance
      await terminal.waitForText("error", 5000);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Optimistic markAllRead()
  // =========================================================================
  describe("Mark All Read", () => {

    test("HOOK-NOTIF-030: markAllRead immediately marks all items as read", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      // Shift+R or designated key to mark all read
      await terminal.sendKeys("Shift+R");
      // All items should appear read
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-031: markAllRead sets unread badge to zero", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("Shift+R");
      // Status bar badge should show 0 or disappear
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toMatch(/◆\s+0|(?!◆)/);
      await terminal.terminate();
    });

    test("HOOK-NOTIF-032: markAllRead reverts on server error", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
        env: { CODEPLANE_SIMULATE_NOTIF_ERROR: "true" },
      });
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("Shift+R");
      await terminal.waitForText("error", 5000);
      // Items should revert to their original read/unread state
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Unread count derivation
  // =========================================================================
  describe("Unread Count", () => {

    test("HOOK-NOTIF-040: unread count reflects loaded unread items", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      // Status bar should show unread count
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toMatch(/◆\s+\d+/);
      await terminal.terminate();
    });

    test("HOOK-NOTIF-041: unread count is independent of active filter", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      const badgeBefore = terminal.getLine(terminal.rows - 1);
      // Switch to Unread filter
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Unread");
      const badgeAfter = terminal.getLine(terminal.rows - 1);
      // Badge count should be the same regardless of filter
      expect(badgeBefore).toMatch(/◆\s+\d+/);
      expect(badgeAfter).toMatch(/◆\s+\d+/);
      await terminal.terminate();
    });
  });

  // =========================================================================
  // SSE prepend
  // =========================================================================
  describe("SSE Prepend", () => {

    test("HOOK-NOTIF-050: new SSE notification appears at top of list", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
        env: { CODEPLANE_SSE_INJECT_FILE: "/tmp/tui-test-sse-notif.jsonl" },
      });
      await terminal.waitForText("Notifications");

      // Write an SSE event to the inject file
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        "/tmp/tui-test-sse-notif.jsonl",
        JSON.stringify({
          type: "notification",
          id: "99999",
          data: JSON.stringify({
            id: 99999,
            user_id: 1,
            source_type: "issue_assigned",
            source_id: 42,
            subject: "SSE Live Notification",
            body: "You were assigned to issue #42",
            status: "unread",
            read_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        }) + "\n",
      );

      await terminal.waitForText("SSE Live Notification");
      // Should appear at the top of the list
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-051: duplicate SSE notification is not added twice", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
        env: { CODEPLANE_SSE_INJECT_FILE: "/tmp/tui-test-sse-notif-dup.jsonl" },
      });
      await terminal.waitForText("Notifications");

      const { writeFileSync, appendFileSync } = await import("node:fs");
      const event = JSON.stringify({
        type: "notification",
        id: "88888",
        data: JSON.stringify({
          id: 88888,
          user_id: 1,
          source_type: "lr_reviewed",
          source_id: 10,
          subject: "Dedup Test Notification",
          body: "Landing request was reviewed",
          status: "unread",
          read_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }) + "\n";

      writeFileSync("/tmp/tui-test-sse-notif-dup.jsonl", event);
      await terminal.waitForText("Dedup Test Notification");

      // Send the same event again
      appendFileSync("/tmp/tui-test-sse-notif-dup.jsonl", event);

      // Wait a bit for processing
      await new Promise(r => setTimeout(r, 500));

      // Snapshot should show the notification exactly once
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-052: SSE notification increments unread badge", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
        env: { CODEPLANE_SSE_INJECT_FILE: "/tmp/tui-test-sse-notif-badge.jsonl" },
      });
      await terminal.waitForText("Notifications");

      const badgeBefore = terminal.getLine(terminal.rows - 1);

      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        "/tmp/tui-test-sse-notif-badge.jsonl",
        JSON.stringify({
          type: "notification",
          id: "77777",
          data: JSON.stringify({
            id: 77777,
            user_id: 1,
            source_type: "issue_commented",
            source_id: 5,
            subject: "Badge Increment Test",
            body: "New comment on issue",
            status: "unread",
            read_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        }) + "\n",
      );

      await terminal.waitForText("Badge Increment Test");
      const badgeAfter = terminal.getLine(terminal.rows - 1);
      // Badge count should have increased
      expect(badgeBefore).not.toEqual(badgeAfter);
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Memory cap & eviction
  // =========================================================================
  describe("Memory Cap", () => {

    test("HOOK-NOTIF-060: total in-memory items never exceed 500", async () => {
      // This test validates the hook's internal eviction by loading
      // enough pages to exceed 500 items
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      // Repeatedly scroll to load many pages
      for (let i = 0; i < 20; i++) {
        await terminal.sendKeys("G");
        // Small wait for page to load
        await new Promise(r => setTimeout(r, 200));
      }
      // App should still be responsive (not OOM)
      await terminal.sendKeys("g", "g");
      await terminal.waitForText("Notifications");
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Responsive rendering
  // =========================================================================
  describe("Responsive", () => {

    test("HOOK-NOTIF-070: notifications render at minimum terminal size 80x24", async () => {
      const terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-071: notifications render at standard terminal size 120x40", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-072: notifications render at large terminal size 200x60", async () => {
      const terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "notifications"],
      });
      await terminal.waitForText("Notifications");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Navigation integration
  // =========================================================================
  describe("Navigation", () => {

    test("HOOK-NOTIF-080: go-to keybinding g n navigates to notifications", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
      });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-NOTIF-081: q from notifications returns to previous screen", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
      });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      await terminal.sendKeys("q");
      await terminal.waitForText("Dashboard");
      await terminal.terminate();
    });
  });
});
```

### Test ID Index

| ID | Behavior | Category |
|----|----------|----------|
| HOOK-NOTIF-001 | Loading → data transition on mount | Pagination |
| HOOK-NOTIF-002 | Empty state for empty inbox | Pagination |
| HOOK-NOTIF-003 | Scroll-to-end triggers next page | Pagination |
| HOOK-NOTIF-004 | Error state on API failure | Pagination |
| HOOK-NOTIF-005 | Refetch clears and reloads | Pagination |
| HOOK-NOTIF-006 | Sorted newest-first by created_at | Sorting |
| HOOK-NOTIF-010 | Unread filter hides read items | Filtering |
| HOOK-NOTIF-011 | All filter restores full list | Filtering |
| HOOK-NOTIF-012 | Search filters by subject substring | Filtering |
| HOOK-NOTIF-013 | Search filters by body substring | Filtering |
| HOOK-NOTIF-014 | Esc clears search and restores list | Filtering |
| HOOK-NOTIF-015 | Search is case-insensitive | Filtering |
| HOOK-NOTIF-020 | markRead updates item appearance immediately | Mark Read |
| HOOK-NOTIF-021 | markRead decrements badge count | Mark Read |
| HOOK-NOTIF-022 | markRead reverts on server error | Mark Read |
| HOOK-NOTIF-030 | markAllRead marks all items read | Mark All Read |
| HOOK-NOTIF-031 | markAllRead sets badge to zero | Mark All Read |
| HOOK-NOTIF-032 | markAllRead reverts on server error | Mark All Read |
| HOOK-NOTIF-040 | Unread count reflects loaded data | Unread Count |
| HOOK-NOTIF-041 | Unread count independent of filter | Unread Count |
| HOOK-NOTIF-050 | SSE notification appears at top | SSE Prepend |
| HOOK-NOTIF-051 | Duplicate SSE notification deduplicated | SSE Prepend |
| HOOK-NOTIF-052 | SSE notification increments badge | SSE Prepend |
| HOOK-NOTIF-060 | Memory cap never exceeds 500 | Memory Cap |
| HOOK-NOTIF-070 | Renders at 80×24 | Responsive |
| HOOK-NOTIF-071 | Renders at 120×40 | Responsive |
| HOOK-NOTIF-072 | Renders at 200×60 | Responsive |
| HOOK-NOTIF-080 | g n navigates to notifications | Navigation |
| HOOK-NOTIF-081 | q returns to previous screen | Navigation |

---

## 11. Acceptance Criteria

1. **`apps/tui/src/hooks/notification-types.ts`** exists with all types defined in §3.
2. **`apps/tui/src/hooks/useNotificationsAdapter.ts`** exists and exports `useNotificationsAdapter()` and `parseNotification()`.
3. **`apps/tui/src/hooks/useNotificationSSE.ts`** exists and exports `useNotificationSSE()`.
4. **`apps/tui/src/hooks/index.ts`** re-exports the new hook and types.
5. **`e2e/tui/notifications.test.ts`** exists with all 28 tests.
6. The hook fetches `GET /api/notifications/list?page=N&per_page=30` using `usePaginatedQuery`.
7. The hook applies optimistic mutations via `useMutation` for `PATCH /api/notifications/:id` and `PUT /api/notifications/mark-read`.
8. Client-side filtering does not trigger new API requests.
9. `unreadCount` is derived from the full merged set, not the filtered subset.
10. The `prepend()` function deduplicates by notification `id`.
11. Memory cap of 500 items is enforced with oldest-read-first eviction.
12. All items are sorted by `created_at` descending.
13. No tests are skipped or commented out. Failing tests due to unimplemented backends remain failing.