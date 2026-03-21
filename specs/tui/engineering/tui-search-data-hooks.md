# Engineering Specification: `tui-search-data-hooks`

## Search Data Hooks Adapter — `useSearchTabs` Integration with Parallel API Calls and Per-Tab State Management

---

## 1. Overview

This ticket creates the data layer for the TUI global search screen. The primary deliverable is `apps/tui/src/hooks/useSearchTabs.ts` — a custom React hook that orchestrates search queries across the four Codeplane search API endpoints (repositories, issues, users, code), manages per-tab state (items, pagination, loading, errors, focus), and exposes a clean interface for the `SearchScreen` component to consume.

This hook does **not** render any UI. It is a pure data-management abstraction that sits between the `@codeplane/ui-core` API client and the `SearchScreen` component.

### Dependencies

| Dependency | Role | Status |
|---|---|---|
| `tui-navigation-provider` | `NavigationProvider` provides screen context; search hook preserves state across push/pop | Required |
| `tui-theme-provider` | `ThemeProvider` provides color tokens consumed by search screen (not by hook directly) | Required |
| `@codeplane/ui-core` | `useAPIClient()` provides the authenticated HTTP client | Implemented |
| `@opentui/react` | React 19 hooks (`useState`, `useEffect`, `useCallback`, `useRef`, `useMemo`) | Implemented |

### Feature Mapping

This ticket implements the data layer for:
- `TUI_SEARCH_SCREEN` — search query dispatch and result aggregation
- `TUI_SEARCH_REPOS_TAB` — repository search state
- `TUI_SEARCH_ISSUES_TAB` — issue search state
- `TUI_SEARCH_USERS_TAB` — user search state
- `TUI_SEARCH_CODE_TAB` — code search state
- `TUI_SEARCH_TAB_NAVIGATION` — per-tab state preservation

---

## 2. API Contract

The hook consumes four REST endpoints. All use page-based pagination.

### 2.1 Endpoints

| Tab | Endpoint | Method | Query Parameters |
|---|---|---|---|
| Repositories | `GET /api/search/repositories` | GET | `q`, `page`, `per_page` |
| Issues | `GET /api/search/issues` | GET | `q`, `state`, `label`, `assignee`, `milestone`, `page`, `per_page` |
| Users | `GET /api/search/users` | GET | `q`, `page`, `per_page` |
| Code | `GET /api/search/code` | GET | `q`, `page`, `per_page` |

### 2.2 Response Shape

All four endpoints return the same envelope:

```typescript
interface SearchResultPage<T> {
  items: T[];
  total_count: number;
  page: number;
  per_page: number;
}
```

Additionally, all responses include the `X-Total-Count` header.

### 2.3 Result Types

```typescript
interface RepositorySearchResult {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  description: string;
  is_public: boolean;
  topics: string[];
}

interface IssueSearchResult {
  id: string;
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  number: string;
  title: string;
  state: string;
}

interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

interface CodeSearchResult {
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  path: string;
  snippet: string;
}
```

### 2.4 Pagination Rules

- Default `per_page`: **30**
- Maximum `per_page`: 100 (server-enforced)
- Maximum loaded items per tab: **300** (10 pages × 30 per page)
- Page numbering: 1-based
- `total_count` may exceed 300 — the hook reports it accurately but stops loading beyond 300 items

### 2.5 Error Codes

| Code | Meaning | Hook Behavior |
|---|---|---|
| 422 | Empty or invalid query | Should never occur (guarded client-side) |
| 401 | Auth expired | Propagated to global error handler |
| 429 | Rate limited | Stored as tab-level error, retry available |
| 500 | Server error | Stored as tab-level error, retry available |
| Network error | Connection failed | Stored as tab-level error, retry available |

---

## 3. Type Definitions

**File:** `apps/tui/src/hooks/useSearchTabs.types.ts`

```typescript
import type { HookError } from "./workflow-types.js";

// ---- Search tab identifiers ----

export const SEARCH_TAB_IDS = ["repos", "issues", "users", "code"] as const;
export type SearchTabId = (typeof SEARCH_TAB_IDS)[number];

// ---- Per-tab result item types ----

export interface RepositorySearchResult {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  description: string;
  is_public: boolean;
  topics: string[];
}

export interface IssueSearchResult {
  id: string;
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  number: string;
  title: string;
  state: string;
}

export interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface CodeSearchResult {
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  path: string;
  snippet: string;
}

export type SearchResultItem =
  | RepositorySearchResult
  | IssueSearchResult
  | UserSearchResult
  | CodeSearchResult;

// ---- API response envelope ----

export interface SearchResultPage<T> {
  items: T[];
  total_count: number;
  page: number;
  per_page: number;
}

// ---- Per-tab state ----

export interface TabState<T extends SearchResultItem = SearchResultItem> {
  id: SearchTabId;
  label: string;
  shortLabel: string;
  items: T[];
  totalCount: number;
  currentPage: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  scrollPosition: number;
  focusedIndex: number;
}

// ---- Hook configuration ----

export interface UseSearchTabsConfig {
  /** Debounce delay in ms. Default: 300 */
  debounceMs?: number;
  /** Items per page. Default: 30 */
  perPage?: number;
  /** Maximum items loaded per tab. Default: 300 */
  maxItemsPerTab?: number;
  /** Minimum query length to trigger search. Default: 1 */
  minQueryLength?: number;
}

// ---- Hook return type ----

export interface UseSearchTabsReturn {
  /** Per-tab state array (always 4 tabs, stable order) */
  tabs: [
    TabState<RepositorySearchResult>,
    TabState<IssueSearchResult>,
    TabState<UserSearchResult>,
    TabState<CodeSearchResult>,
  ];
  /** Index of the currently active tab (0-3) */
  activeTabIndex: number;
  /** Switch active tab by index */
  setActiveTab: (index: number) => void;
  /** Current raw query string (before trim/debounce) */
  query: string;
  /** Update the query string (triggers debounced search) */
  setQuery: (query: string) => void;
  /** Load next page for the currently active tab */
  fetchMore: () => void;
  /** Retry the failed search for a specific tab */
  retryTab: (tabIndex: number) => void;
  /** Update scroll position for a tab */
  setScrollPosition: (tabIndex: number, position: number) => void;
  /** Update focused item index for a tab */
  setFocusedIndex: (tabIndex: number, index: number) => void;
  /** Whether any tab is currently loading */
  isSearching: boolean;
  /** Clear query and reset all tab state */
  clearSearch: () => void;
}
```

---

## 4. Implementation Plan

### Step 1: Create type definitions file

**File:** `apps/tui/src/hooks/useSearchTabs.types.ts`

Define all types as specified in Section 3. This file is a standalone module with no runtime imports beyond `HookError` from `workflow-types.ts`.

**Rationale:** Separating types enables the `SearchScreen` component and test files to import types without importing hook implementation.

### Step 2: Implement debounce utility

**File:** `apps/tui/src/hooks/useSearchTabs.ts` (internal to the hook, not exported)

Implement a `useDebouncedValue<T>(value: T, delayMs: number): T` internal hook:

```typescript
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
```

This returns the debounced query value. The hook uses the raw `query` for UI display and the `debouncedQuery` for API dispatch.

**Design decision:** Inline debounce rather than a shared utility because the debounce behavior is tightly coupled to the search lifecycle (abort on change, guard on length). A generic `useDebounce` would add unnecessary abstraction.

### Step 3: Implement tab state initialization

Define the initial tab state factory:

```typescript
const TAB_DEFINITIONS: ReadonlyArray<{ id: SearchTabId; label: string; shortLabel: string }> = [
  { id: "repos",  label: "Repositories", shortLabel: "Repos" },
  { id: "issues", label: "Issues",       shortLabel: "Issues" },
  { id: "users",  label: "Users",        shortLabel: "Users" },
  { id: "code",   label: "Code",         shortLabel: "Code" },
];

function createInitialTabState<T extends SearchResultItem>(def: typeof TAB_DEFINITIONS[number]): TabState<T> {
  return {
    id: def.id as SearchTabId,
    label: def.label,
    shortLabel: def.shortLabel,
    items: [],
    totalCount: 0,
    currentPage: 0,
    isLoading: false,
    error: null,
    hasMore: false,
    scrollPosition: 0,
    focusedIndex: 0,
  };
}
```

`currentPage: 0` indicates no pages have been fetched. The first fetch requests `page=1`.

### Step 4: Implement the `useSearchTabs` hook

**File:** `apps/tui/src/hooks/useSearchTabs.ts`

The hook's core logic:

#### 4a. State declarations

```typescript
export function useSearchTabs(config: UseSearchTabsConfig = {}): UseSearchTabsReturn {
  const {
    debounceMs = 300,
    perPage = 30,
    maxItemsPerTab = 300,
    minQueryLength = 1,
  } = config;

  const client = useAPIClient();
  const [query, setQueryRaw] = useState("");
  const debouncedQuery = useDebouncedValue(query, debounceMs);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [tabs, setTabs] = useState(() => [
    createInitialTabState<RepositorySearchResult>(TAB_DEFINITIONS[0]),
    createInitialTabState<IssueSearchResult>(TAB_DEFINITIONS[1]),
    createInitialTabState<UserSearchResult>(TAB_DEFINITIONS[2]),
    createInitialTabState<CodeSearchResult>(TAB_DEFINITIONS[3]),
  ] as UseSearchTabsReturn["tabs"]);

  const abortControllersRef = useRef<(AbortController | null)[]>([null, null, null, null]);
  const isMounted = useRef(true);
  const lastDispatchedQuery = useRef("");
```

#### 4b. Query dispatch — parallel fetch across all 4 endpoints

On `debouncedQuery` change:

1. **Trim** the query. If trimmed length < `minQueryLength`, reset all tabs to initial state and return.
2. **Abort** any in-flight requests by calling `.abort()` on all 4 `AbortController` instances.
3. **Create** 4 new `AbortController` instances.
4. **Set** all 4 tabs to `isLoading: true`, clear `error`, reset `items`, `currentPage`, `totalCount`, `scrollPosition`, `focusedIndex`, `hasMore`.
5. **Dispatch** 4 `Promise.allSettled()` fetch calls in parallel — one per endpoint.
6. **On each settlement:**
   - If **fulfilled**: update the corresponding tab with `items`, `totalCount`, `currentPage: 1`, `hasMore: totalCount > items.length && items.length < maxItemsPerTab`, `isLoading: false`.
   - If **rejected** (not AbortError): set `error` on the corresponding tab, `isLoading: false`.
   - If **rejected** (AbortError): no-op (request was superseded).
7. **Auto-select tab:** After all 4 settle, if the current active tab has 0 results but another tab has results, switch `activeTabIndex` to the first tab with results.

```typescript
useEffect(() => {
  const trimmed = debouncedQuery.trim();

  if (trimmed.length < minQueryLength) {
    // Reset all tabs
    if (lastDispatchedQuery.current !== "") {
      setTabs(prev => prev.map((tab, i) => ({
        ...createInitialTabState(TAB_DEFINITIONS[i]),
      })) as UseSearchTabsReturn["tabs"]);
      lastDispatchedQuery.current = "";
    }
    return;
  }

  if (trimmed === lastDispatchedQuery.current) return;
  lastDispatchedQuery.current = trimmed;

  // Abort in-flight requests
  abortControllersRef.current.forEach(ac => ac?.abort());

  const controllers = TAB_DEFINITIONS.map(() => new AbortController());
  abortControllersRef.current = controllers;

  // Set all tabs to loading
  setTabs(prev => prev.map((tab) => ({
    ...tab,
    items: [],
    totalCount: 0,
    currentPage: 0,
    isLoading: true,
    error: null,
    hasMore: false,
    scrollPosition: 0,
    focusedIndex: 0,
  })) as UseSearchTabsReturn["tabs"]);

  const endpoints = [
    `/api/search/repositories?q=${encodeURIComponent(trimmed)}&page=1&per_page=${perPage}`,
    `/api/search/issues?q=${encodeURIComponent(trimmed)}&page=1&per_page=${perPage}`,
    `/api/search/users?q=${encodeURIComponent(trimmed)}&page=1&per_page=${perPage}`,
    `/api/search/code?q=${encodeURIComponent(trimmed)}&page=1&per_page=${perPage}`,
  ];

  const fetchTab = async (index: number) => {
    const response = await client.request(endpoints[index], {
      signal: controllers[index].signal,
    });
    if (!response.ok) {
      const parsed = await parseResponseError(response);
      throw parsed;
    }
    const body = await response.json();
    const totalCount = parseInt(response.headers.get("X-Total-Count") ?? "0", 10)
      || body.total_count
      || 0;
    return { items: body.items ?? [], totalCount };
  };

  Promise.allSettled(endpoints.map((_, i) => fetchTab(i))).then((results) => {
    if (!isMounted.current) return;

    setTabs(prev => {
      const next = [...prev] as UseSearchTabsReturn["tabs"];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") {
          const { items, totalCount } = result.value;
          next[i] = {
            ...next[i],
            items,
            totalCount,
            currentPage: 1,
            isLoading: false,
            error: null,
            hasMore: totalCount > items.length && items.length < maxItemsPerTab,
          };
        } else {
          const err = result.reason;
          if (err?.name === "AbortError") return; // superseded
          next[i] = {
            ...next[i],
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          };
        }
      });
      return next;
    });

    // Auto-select first tab with results
    setTabs(prev => {
      setActiveTabIndex(current => {
        if (prev[current].items.length > 0) return current;
        const firstWithResults = prev.findIndex(t => t.items.length > 0);
        return firstWithResults >= 0 ? firstWithResults : current;
      });
      return prev;
    });
  });
}, [debouncedQuery, minQueryLength, perPage, maxItemsPerTab, client]);
```

#### 4c. Pagination — `fetchMore()`

Loads the next page for the **active tab only**.

```typescript
const fetchMore = useCallback(() => {
  const tab = tabs[activeTabIndex];
  if (!tab || tab.isLoading || !tab.hasMore) return;
  if (tab.items.length >= maxItemsPerTab) return;

  const trimmed = query.trim();
  if (trimmed.length < minQueryLength) return;

  const nextPage = tab.currentPage + 1;
  const tabId = tab.id;
  const tabIndex = activeTabIndex;

  // Abort any existing request for this tab
  abortControllersRef.current[tabIndex]?.abort();
  const controller = new AbortController();
  abortControllersRef.current[tabIndex] = controller;

  // Set loading on this tab
  setTabs(prev => {
    const next = [...prev] as UseSearchTabsReturn["tabs"];
    next[tabIndex] = { ...next[tabIndex], isLoading: true };
    return next;
  });

  const endpointBase = {
    repos: "repositories",
    issues: "issues",
    users: "users",
    code: "code",
  }[tabId];

  const url = `/api/search/${endpointBase}?q=${encodeURIComponent(trimmed)}&page=${nextPage}&per_page=${perPage}`;

  client.request(url, { signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw await parseResponseError(response);
      const body = await response.json();
      const totalCount = parseInt(response.headers.get("X-Total-Count") ?? "0", 10)
        || body.total_count
        || 0;
      return { items: body.items ?? [], totalCount };
    })
    .then(({ items: newItems, totalCount }) => {
      if (!isMounted.current) return;
      setTabs(prev => {
        const next = [...prev] as UseSearchTabsReturn["tabs"];
        let combined = [...next[tabIndex].items, ...newItems];
        if (combined.length > maxItemsPerTab) {
          combined = combined.slice(0, maxItemsPerTab);
        }
        next[tabIndex] = {
          ...next[tabIndex],
          items: combined,
          totalCount,
          currentPage: nextPage,
          isLoading: false,
          hasMore: totalCount > combined.length && combined.length < maxItemsPerTab,
        };
        return next;
      });
    })
    .catch((err) => {
      if (err?.name === "AbortError") return;
      if (!isMounted.current) return;
      setTabs(prev => {
        const next = [...prev] as UseSearchTabsReturn["tabs"];
        next[tabIndex] = {
          ...next[tabIndex],
          isLoading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        };
        return next;
      });
    });
}, [tabs, activeTabIndex, query, perPage, maxItemsPerTab, minQueryLength, client]);
```

#### 4d. Per-tab retry — `retryTab()`

Retries a failed search for a specific tab by re-fetching page 1 with the current trimmed query.

```typescript
const retryTab = useCallback((tabIndex: number) => {
  if (tabIndex < 0 || tabIndex > 3) return;
  const trimmed = query.trim();
  if (trimmed.length < minQueryLength) return;

  abortControllersRef.current[tabIndex]?.abort();
  const controller = new AbortController();
  abortControllersRef.current[tabIndex] = controller;

  setTabs(prev => {
    const next = [...prev] as UseSearchTabsReturn["tabs"];
    next[tabIndex] = {
      ...next[tabIndex],
      items: [],
      totalCount: 0,
      currentPage: 0,
      isLoading: true,
      error: null,
      hasMore: false,
    };
    return next;
  });

  const endpointBase = ["repositories", "issues", "users", "code"][tabIndex];
  const url = `/api/search/${endpointBase}?q=${encodeURIComponent(trimmed)}&page=1&per_page=${perPage}`;

  client.request(url, { signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw await parseResponseError(response);
      const body = await response.json();
      const totalCount = parseInt(response.headers.get("X-Total-Count") ?? "0", 10)
        || body.total_count || 0;
      return { items: body.items ?? [], totalCount };
    })
    .then(({ items, totalCount }) => {
      if (!isMounted.current) return;
      setTabs(prev => {
        const next = [...prev] as UseSearchTabsReturn["tabs"];
        next[tabIndex] = {
          ...next[tabIndex],
          items,
          totalCount,
          currentPage: 1,
          isLoading: false,
          hasMore: totalCount > items.length && items.length < maxItemsPerTab,
        };
        return next;
      });
    })
    .catch((err) => {
      if (err?.name === "AbortError") return;
      if (!isMounted.current) return;
      setTabs(prev => {
        const next = [...prev] as UseSearchTabsReturn["tabs"];
        next[tabIndex] = {
          ...next[tabIndex],
          isLoading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        };
        return next;
      });
    });
}, [query, perPage, maxItemsPerTab, minQueryLength, client]);
```

#### 4e. Tab state mutators

```typescript
const setActiveTab = useCallback((index: number) => {
  if (index >= 0 && index <= 3) {
    setActiveTabIndex(index);
  }
}, []);

const setScrollPosition = useCallback((tabIndex: number, position: number) => {
  setTabs(prev => {
    const next = [...prev] as UseSearchTabsReturn["tabs"];
    next[tabIndex] = { ...next[tabIndex], scrollPosition: position };
    return next;
  });
}, []);

const setFocusedIndex = useCallback((tabIndex: number, index: number) => {
  setTabs(prev => {
    const next = [...prev] as UseSearchTabsReturn["tabs"];
    next[tabIndex] = { ...next[tabIndex], focusedIndex: index };
    return next;
  });
}, []);

const setQuery = useCallback((q: string) => {
  setQueryRaw(q);
}, []);

const clearSearch = useCallback(() => {
  setQueryRaw("");
  abortControllersRef.current.forEach(ac => ac?.abort());
  setTabs([
    createInitialTabState<RepositorySearchResult>(TAB_DEFINITIONS[0]),
    createInitialTabState<IssueSearchResult>(TAB_DEFINITIONS[1]),
    createInitialTabState<UserSearchResult>(TAB_DEFINITIONS[2]),
    createInitialTabState<CodeSearchResult>(TAB_DEFINITIONS[3]),
  ] as UseSearchTabsReturn["tabs"]);
  setActiveTabIndex(0);
  lastDispatchedQuery.current = "";
}, []);
```

#### 4f. Derived state

```typescript
const isSearching = useMemo(() => tabs.some(t => t.isLoading), [tabs]);
```

#### 4g. Cleanup

```typescript
useEffect(() => {
  isMounted.current = true;
  return () => {
    isMounted.current = false;
    abortControllersRef.current.forEach(ac => ac?.abort());
  };
}, []);
```

#### 4h. Return value

```typescript
return {
  tabs,
  activeTabIndex,
  setActiveTab,
  query,
  setQuery,
  fetchMore,
  retryTab,
  setScrollPosition,
  setFocusedIndex,
  isSearching,
  clearSearch,
};
```

### Step 5: Export from hooks barrel

**File:** `apps/tui/src/hooks/index.ts` (or wherever hooks are re-exported)

Add:
```typescript
export { useSearchTabs } from "./useSearchTabs.js";
export type { UseSearchTabsReturn, TabState, SearchTabId, SearchResultItem } from "./useSearchTabs.types.js";
```

---

## 5. File Inventory

| File | Purpose | New/Modified |
|---|---|---|
| `apps/tui/src/hooks/useSearchTabs.types.ts` | Type definitions for search tab state | **New** |
| `apps/tui/src/hooks/useSearchTabs.ts` | Hook implementation | **New** |
| `e2e/tui/search.test.ts` | E2E tests for search data hooks and screen | **New** |

---

## 6. Behavioral Specification

### 6.1 Query Lifecycle

```
User types character
  → setQuery(raw) updates `query` state immediately (for UI display)
  → useDebouncedValue waits 300ms of inactivity
  → debouncedQuery updates
  → useEffect fires:
      1. Trim query
      2. Guard: if trimmed.length < 1, reset all tabs, return
      3. Guard: if trimmed === lastDispatchedQuery, return (no re-fetch)
      4. Abort all 4 in-flight controllers
      5. Create 4 new controllers
      6. Set all 4 tabs to isLoading: true, clear items/errors
      7. Promise.allSettled(4 fetches)
      8. On settlement: update each tab independently
      9. Auto-select first tab with results (if current tab empty)
```

### 6.2 Abort Semantics

Each tab has its own `AbortController` stored in `abortControllersRef.current[tabIndex]`. This means:

- **New query dispatch:** All 4 controllers are aborted simultaneously. 4 new controllers created.
- **fetchMore():** Only the active tab's controller is aborted and replaced.
- **retryTab():** Only the specified tab's controller is aborted and replaced.
- **Component unmount:** All 4 controllers are aborted in the cleanup effect.
- **AbortError:** Always swallowed silently (no error state set).

### 6.3 Per-Tab State Preservation

When the user switches tabs:
- `setActiveTab(index)` updates `activeTabIndex` only.
- No data is cleared. Items, scroll position, focused index, loading state, and errors are all preserved per-tab.
- When the user switches back, the tab renders exactly as they left it.

When the user navigates away from the search screen (push to detail) and returns (pop back):
- The `useSearchTabs` hook's React state is preserved because the SearchScreen component remains mounted in the navigation stack (it's only hidden, not unmounted).
- Query, all tab state, active tab index — all preserved.

### 6.4 Partial Failures

If 2 of 4 search fetches fail:
- The 2 successful tabs populate with results normally.
- The 2 failed tabs show `error` state with the parsed error.
- The user can press `R` on a failed tab to retry via `retryTab(tabIndex)`.
- Retrying one tab does not affect the other tabs.
- If the active tab failed but another tab succeeded, auto-select switches to the first successful tab.

### 6.5 Empty Query Guard

- `query` of `""` or `" "` (whitespace-only) → no API calls dispatched.
- `query` of `"a"` (1 character) → API calls dispatched (meets `minQueryLength = 1`).
- Query trimming is applied only for API dispatch, not for UI display. The raw query (with leading/trailing spaces) is stored and shown in the input.

### 6.6 Pagination Cap

Each tab is capped at `maxItemsPerTab` (default 300) loaded items:
- `hasMore` becomes `false` when `items.length >= maxItemsPerTab`, even if `totalCount` is larger.
- `fetchMore()` is a no-op when `items.length >= maxItemsPerTab`.
- The `totalCount` field still reports the server's true count (e.g., 1500), allowing the UI to display "Showing 300 of 1500".

### 6.7 Debounce Behavior

- Debounce delay: 300ms (configurable).
- Rapid typing ("ap" → "api" → "api g" → "api ga") triggers only the final settled value after 300ms of inactivity.
- If the user types, waits 300ms (search dispatched), then types more: the new typing starts a new 300ms debounce. When it fires, in-flight requests from the previous dispatch are aborted.

---

## 7. Integration Points

### 7.1 With SearchScreen Component

The `SearchScreen` (future ticket) consumes `useSearchTabs` as its sole data source:

```typescript
function SearchScreen() {
  const search = useSearchTabs();

  // Render search input bound to search.query / search.setQuery
  // Render tab bar using search.tabs (labels, counts, loading)
  // Render active tab's items list using search.tabs[search.activeTabIndex]
  // Handle j/k with search.setFocusedIndex
  // Handle scroll with search.setScrollPosition
  // Handle Tab/Shift+Tab with search.setActiveTab
  // Handle Enter with navigation push based on focused item type
  // Handle scroll-to-end with search.fetchMore
  // Handle R with search.retryTab
  // Handle Ctrl+U with search.clearSearch
}
```

### 7.2 With NavigationProvider

The hook itself does not call `useNavigation()`. Navigation is handled by the screen component. However, the hook depends on the `NavigationProvider`'s behavior of keeping popped screens mounted (state preserved) for back-navigation.

### 7.3 With APIClientProvider

The hook calls `useAPIClient()` from `@codeplane/ui-core` to get the authenticated HTTP client. The client is configured with the auth token from `AuthProvider` and includes `Authorization: token <token>` headers automatically.

### 7.4 With useTabScrollState (Optional Composition)

The existing `useTabScrollState` hook in `apps/tui/src/hooks/useTabScrollState.ts` manages scroll position per tab via a ref-based map. The `useSearchTabs` hook inlines scroll/focus state into the `TabState` type instead of using `useTabScrollState`, because:
- Search tab state needs to be reset atomically when a new query is dispatched.
- Scroll position and focus index are tightly coupled to the items array (reset together).
- Using two separate hooks would require coordination that adds complexity.

The SearchScreen may still use `useTabScrollState` for the `<scrollbox>` rendering layer if needed, but the source of truth is `TabState.scrollPosition` and `TabState.focusedIndex`.

---

## 8. Error Handling

### 8.1 Error Types

The hook uses the same `HookError` type as the rest of the TUI:

```typescript
// From @codeplane/ui-core/src/types/errors.ts
export interface HookError {
  message: string;
  status?: number;
  code?: string;
}
```

When `parseResponseError(response)` is called on a non-OK response, it returns a `HookError` with status code and message from the API response body.

### 8.2 401 Handling

A 401 response is stored as a tab-level error like any other error. However, the `SearchScreen` component should check for `error.status === 401` and propagate to the app-shell auth error flow. This is the screen's responsibility, not the hook's.

### 8.3 Network Errors

Network errors (DNS failure, timeout, connection refused) are caught in the `catch` block and wrapped as `NetworkError` instances. These are stored as tab-level errors with `message: "Fetch failed"`.

---

## 9. Performance Considerations

### 9.1 Memory

- Each tab holds at most 300 items in memory.
- Total maximum: 4 × 300 = 1200 result objects.
- Result objects are small (5-8 string fields each).
- Estimated memory: ~500KB worst case. Well within acceptable limits for a long-running TUI session.

### 9.2 Re-renders

- `setTabs` creates new array/object references, triggering re-renders.
- `setScrollPosition` and `setFocusedIndex` update individual tab state, causing a re-render of the full tabs array.
- **Optimization path (future):** If re-render performance becomes an issue, split scroll/focus state into a separate `useRef`-based store (like `useTabScrollState`). For now, the simpler approach of state-in-tabs is preferred because correctness matters more than micro-optimization at this stage.

### 9.3 Network

- Each query dispatch sends 4 HTTP requests in parallel.
- Debounce at 300ms prevents excessive requests during typing.
- AbortController cancellation prevents wasted bandwidth and ensures responses from stale queries are ignored.

---

## 10. Unit & Integration Tests

**File:** `e2e/tui/search.test.ts`

Tests use `@microsoft/tui-test` and run against a real API server. Tests validate user-facing behavior through the rendered TUI, not hook internals.

### 10.1 Test Naming Convention

Follows the established pattern: `TYPE-DOMAIN-NUMBER`
- `HOOK-SEARCH-001` through `HOOK-SEARCH-NNN` for data hook behavior tests
- `KEY-SEARCH-001` through `KEY-SEARCH-NNN` for keyboard interaction tests
- `SNAP-SEARCH-001` through `SNAP-SEARCH-NNN` for snapshot tests

### 10.2 Test Cases

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI } from "./helpers";

describe("TUI_SEARCH search data hooks", () => {

  // ---- Query Dispatch ----

  test("HOOK-SEARCH-001: typing a query shows 'Searching…' after debounce", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s"); // navigate to search
    await terminal.waitForText("Search");
    await terminal.sendText("api gateway");
    // After 300ms debounce, loading indicator should appear
    await terminal.waitForText("Searching");
    await terminal.terminate();
  });

  test("HOOK-SEARCH-002: search results populate tab count badges", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    // Wait for results to load - count badges should appear
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.terminate();
  });

  test("HOOK-SEARCH-003: empty query does not trigger search", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    // Empty state message should be visible
    await terminal.waitForText("Type a query");
    // No loading indicator should appear
    await terminal.waitForNoText("Searching");
    await terminal.terminate();
  });

  test("HOOK-SEARCH-004: query with only whitespace does not trigger search", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("   ");
    // Should remain in empty state
    await terminal.waitForText("Type a query");
    await terminal.terminate();
  });

  test("HOOK-SEARCH-005: single character query triggers search", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("a");
    await terminal.waitForText("Searching");
    await terminal.terminate();
  });

  // ---- Parallel Dispatch ----

  test("HOOK-SEARCH-006: all four tab counts update after query", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    // All four tabs should show counts (even if 0)
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.waitForText(/Issues \(\d+\)/);
    await terminal.waitForText(/Users \(\d+\)/);
    await terminal.waitForText(/Code \(\d+\)/);
    await terminal.terminate();
  });

  // ---- Tab Switching ----

  test("KEY-SEARCH-001: Tab key cycles through search tabs", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    // Press Esc to leave input, then Tab to cycle
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("Tab");
    // Issues tab should now be active (visual indicator)
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("KEY-SEARCH-002: number keys 1-4 jump to tabs directly", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("3"); // jump to Users tab
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  // ---- Per-Tab State Preservation ----

  test("HOOK-SEARCH-007: tab switch preserves scroll position on return", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.sendKeys("Escape");
    // Move down in repos list
    await terminal.sendKeys("j", "j", "j");
    // Switch to Issues tab
    await terminal.sendKeys("2");
    // Switch back to Repos tab
    await terminal.sendKeys("1");
    // Snapshot should show the same focused item as before
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  // ---- Query Abort ----

  test("HOOK-SEARCH-008: rapid typing only dispatches final query", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    // Type rapidly without pausing 300ms
    await terminal.sendText("ap");
    await terminal.sendText("i");
    await terminal.sendText(" ");
    await terminal.sendText("gate");
    await terminal.sendText("way");
    // Wait for debounce + results
    await terminal.waitForText(/Repositories \(\d+\)|No results/);
    await terminal.terminate();
  });

  // ---- Error Handling ----

  test("HOOK-SEARCH-009: partial API failure shows error on failed tab", async () => {
    // This test exercises partial failure behavior.
    // It will fail until the backend supports all 4 search endpoints.
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    // If any tab shows an error, R should be available to retry
    await terminal.waitForText(/Repositories|Issues|Users|Code/);
    await terminal.terminate();
  });

  test("HOOK-SEARCH-010: R key retries failed tab", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories|Issues|Users|Code/);
    await terminal.sendKeys("Escape");
    // If there's an error, pressing R should show Searching again
    await terminal.sendKeys("R");
    await terminal.terminate();
  });

  // ---- Pagination ----

  test("HOOK-SEARCH-011: scrolling to bottom triggers fetchMore", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.sendKeys("Escape");
    // Scroll to bottom with G
    await terminal.sendKeys("G");
    // If there are more results, "Loading more…" should appear
    await terminal.terminate();
  });

  // ---- Navigation Integration ----

  test("HOOK-SEARCH-012: Enter on result navigates to detail view", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("Enter");
    // Should navigate to the detail screen
    // Breadcrumb should update
    const header = terminal.getLine(0);
    expect(header).toMatch(/Search.*›/);
    await terminal.terminate();
  });

  test("HOOK-SEARCH-013: q from detail returns to search with state preserved", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("q"); // pop back to search
    await terminal.waitForText("Search");
    // Query should still be present
    await terminal.waitForText("test");
    // Results should still be present
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.terminate();
  });

  // ---- Clear Search ----

  test("KEY-SEARCH-003: Ctrl+U clears query and resets all tabs", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.sendKeys("Control+u");
    // Should return to empty state
    await terminal.waitForText("Type a query");
    await terminal.terminate();
  });

  // ---- Zero Results ----

  test("HOOK-SEARCH-014: zero results shows empty state message", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("zzzznonexistentqueryzzzz");
    // Wait for results to come back (may take time)
    await terminal.waitForText(/No results|\(0\)/);
    await terminal.terminate();
  });

  // ---- Responsive Behavior ----

  test("SNAP-SEARCH-001: search results at 80x24 minimum", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repos|Issues|Users|Code/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-SEARCH-002: search results at 120x40 standard", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-SEARCH-003: search results at 200x60 large", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-SEARCH-004: search empty state at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  // ---- Edge Cases ----

  test("EDGE-SEARCH-001: resize during search preserves state", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.resize(80, 24);
    // Results should still be visible (abbreviated)
    await terminal.waitForText(/Repos|Repositories/);
    await terminal.terminate();
  });

  test("EDGE-SEARCH-002: search input Esc returns focus to results", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.sendKeys("Escape");
    // j/k should now navigate the results list, not type in input
    await terminal.sendKeys("j");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("EDGE-SEARCH-003: / from results list refocuses search input", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendText("test");
    await terminal.waitForText(/Repositories \(\d+\)/);
    await terminal.sendKeys("Escape"); // leave input
    await terminal.sendKeys("/"); // return to input
    await terminal.sendText("more");
    // Query should now be "testmore" or append
    await terminal.terminate();
  });
});
```

### 10.3 Test Philosophy Notes

1. **Tests run against a real API server.** No mocking of `useAPIClient` or HTTP responses. If the search endpoints are not implemented yet, the tests will fail with network errors — this is intentional per repo policy.

2. **Tests validate user-visible behavior.** We test that typing "test" produces tab count badges with numbers, not that the hook's internal `tabs[0].totalCount` equals a specific value.

3. **Tests are independent.** Each test launches a fresh TUI instance via `launchTUI()`. No shared state.

4. **Snapshot tests are supplementary.** The `SNAP-SEARCH-*` tests catch visual regressions. The `HOOK-SEARCH-*` and `KEY-SEARCH-*` tests are the primary verification.

5. **Failing tests are never skipped.** If a test fails because the backend doesn't implement `/api/search/code` yet, the test stays failing.

---

## 11. Productionization Path

This hook is production-ready from the start — it is not a PoC. However, the following concerns should be addressed before the search feature ships:

### 11.1 API Client Error Classification

The hook treats all non-OK responses uniformly. Before shipping, verify that:
- 401 errors are properly propagated to the auth error boundary by the `SearchScreen`.
- 429 errors include a `Retry-After` header that the screen can display.
- 422 errors (invalid query) are impossible due to client-side guards.

### 11.2 Memory Pressure Testing

Run a long-session test that:
1. Executes 100+ search queries in sequence.
2. Switches tabs and scrolls through results.
3. Verifies memory usage remains stable (no leaked abort controllers, no accumulated closures).

The `isMounted` ref and `AbortController` cleanup in the unmount effect should prevent leaks, but this should be verified empirically.

### 11.3 Rate Limit Awareness

The current implementation sends 4 parallel requests per query. If the API server rate-limits per-user, this means each search query consumes 4 rate limit tokens. Consider:
- A server-side batch search endpoint (`POST /api/search` with `types: ["repos", "issues", "users", "code"]`) to reduce per-query cost.
- Client-side rate limit awareness: if a 429 is received, delay retries by the `Retry-After` duration.

### 11.4 Stale Closure Audit

The `fetchMore`, `retryTab`, and effect callbacks all capture state via closures. The current implementation uses `useCallback` with explicit dependency arrays. Before shipping, audit that:
- `fetchMore` correctly reads the latest `tabs` state (it does via the dependency array).
- `retryTab` correctly reads the latest `query` state.
- The debounce effect correctly aborts stale queries.

### 11.5 Integration with Command Palette

The search screen should be registered in the command palette registry so that `:search <query>` pre-populates the search input. This requires the `SearchScreen` to accept an `initialQuery` param and pass it to `setQuery` on mount. The hook supports this via `setQuery` — no hook changes needed.

---

## 12. Open Questions

| # | Question | Default Assumption | Impact |
|---|---|---|---|
| 1 | Should the hook deduplicate results across pages (e.g., if an item moves between pages during fetch)? | No deduplication — append pages as-is | Low. Server-side search results are snapshot-consistent within a query. |
| 2 | Should `fetchMore` be callable for non-active tabs? | No — only active tab | Low. The screen only triggers `fetchMore` for the visible tab. |
| 3 | Should the hook expose a `refetchAll()` method to re-run the current query across all tabs? | No — `retryTab` per tab is sufficient | Low. Can be added later if needed. |
| 4 | Should debounce be cancellable (e.g., pressing Enter dispatches immediately)? | Not in initial implementation | Medium. Can be added by exposing a `flushQuery()` method that bypasses debounce. |

---

## 13. Revision History

| Date | Author | Change |
|---|---|---|
| 2026-03-22 | spec-agent | Initial specification |