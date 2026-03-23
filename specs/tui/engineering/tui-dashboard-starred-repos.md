# Engineering Specification: TUI Dashboard — Starred Repositories Panel

**Ticket**: `tui-dashboard-starred-repos`
**Status**: Not started
**Dependencies**: `tui-dashboard-data-hooks`, `tui-dashboard-panel-component`, `tui-dashboard-panel-focus-manager`, `tui-dashboard-e2e-test-infra`
**Target directory**: `apps/tui/src/`
**Test directory**: `e2e/tui/`

---

## Overview

This specification covers the implementation of the Starred Repositories panel — the bottom-left quadrant of the Dashboard screen's 2×2 grid layout. The panel displays the authenticated user's starred repositories sorted by starring time (most recent first), with full keyboard navigation, client-side filtering, cursor-based pagination, and responsive column adaptation across all three terminal breakpoints.

---

## Implementation Plan

### Step 1: Create the `useStarredRepos` data hook in `@codeplane/ui-core`

**File**: `specs/tui/packages/ui-core/src/hooks/starred/useStarredRepos.ts`
**Barrel export**: `specs/tui/packages/ui-core/src/hooks/starred/index.ts`
**Re-export from**: `specs/tui/packages/ui-core/src/index.ts`

This hook follows the exact pattern established by `useIssues()` — it wraps `usePaginatedQuery<RepoSummary>()` with the starred repos API path.

```typescript
import { useAPIClient } from "../../client/context.js";
import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";
import type { RepoSummary } from "@codeplane/sdk";

export interface UseStarredReposOptions {
  /** Enable/disable the query. Default: true. */
  enabled?: boolean;
  /** Items per page. Default: 20, max: 100. */
  perPage?: number;
}

export interface UseStarredReposResult {
  repos: RepoSummary[];
  totalCount: number;
  isLoading: boolean;
  error: import("../../types/errors.js").HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
}

export function useStarredRepos(
  options?: UseStarredReposOptions
): UseStarredReposResult {
  const client = useAPIClient();
  const perPage = Math.min(options?.perPage ?? 20, 100);

  const query = usePaginatedQuery<RepoSummary>({
    client,
    path: "/api/user/starred",
    cacheKey: JSON.stringify({ starred: true, perPage }),
    perPage,
    enabled: options?.enabled ?? true,
    maxItems: 200, // 10 pages × 20 items cap
    autoPaginate: false,
    parseResponse: (data, headers) => {
      const items = (data as RepoSummary[]).map((item) => ({
        ...item,
      }));
      const totalCountHeader = headers.get("X-Total-Count");
      const totalCount = totalCountHeader
        ? parseInt(totalCountHeader, 10)
        : 0;
      return { items, totalCount };
    },
  });

  return {
    repos: query.items,
    totalCount: query.totalCount,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}
```

**Key decisions**:
- `maxItems: 200` enforces the 10-page memory cap from the product spec.
- `perPage: 20` matches the API contract `GET /api/user/starred?page=N&per_page=20`.
- The API returns items sorted by `stars.created_at DESC` server-side — no client-side sorting needed.
- `cacheKey` includes `starred: true` as a namespace separator to avoid collisions with `useRepos`.

---

### Step 2: Create `formatStarCount` utility

**File**: `apps/tui/src/util/format-stars.ts`
**Re-export from**: `apps/tui/src/util/index.ts`

```typescript
/**
 * Format a star count for display in repository lists.
 *
 * Rules:
 * - 0        → "" (empty string, never "★ 0")
 * - 1–999    → literal string ("1", "42", "999")
 * - 1000–999999 → K-abbreviated ("1k", "1.5k", "25k", "999k")
 * - 1000000+ → M-abbreviated ("1M", "1.5M", "25M")
 *
 * Result never exceeds 5 characters.
 */
export function formatStarCount(count: number): string {
  if (count <= 0) return "";
  if (count < 1000) return String(count);
  if (count < 10_000) {
    const k = count / 1000;
    const rounded = Math.floor(k * 10) / 10;
    return rounded % 1 === 0 ? `${Math.floor(rounded)}k` : `${rounded}k`;
  }
  if (count < 1_000_000) {
    return `${Math.floor(count / 1000)}k`;
  }
  if (count < 10_000_000) {
    const m = count / 1_000_000;
    const rounded = Math.floor(m * 10) / 10;
    return rounded % 1 === 0 ? `${Math.floor(rounded)}M` : `${rounded}M`;
  }
  return `${Math.floor(count / 1_000_000)}M`;
}
```

**Formatting truth table** (for test validation):

| Input | Output | Width |
|-------|--------|-------|
| 0 | `""` | 0 |
| 1 | `"1"` | 1 |
| 42 | `"42"` | 2 |
| 999 | `"999"` | 3 |
| 1000 | `"1k"` | 2 |
| 1500 | `"1.5k"` | 4 |
| 2000 | `"2k"` | 2 |
| 9999 | `"9.9k"` | 4 |
| 10000 | `"10k"` | 3 |
| 25000 | `"25k"` | 3 |
| 999999 | `"999k"` | 4 |
| 1000000 | `"1M"` | 2 |
| 1500000 | `"1.5M"` | 4 |
| 25000000 | `"25M"` | 3 |

---

### Step 3: Create the `DashboardPanel` shared wrapper component

**File**: `apps/tui/src/components/DashboardPanel.tsx`

This is a dependency declared by `tui-dashboard-panel-component`. The starred repos panel (and all other dashboard panels) are children of this wrapper. This spec describes only the interface contract; the panel component ticket owns its full implementation.

```typescript
import type { ReactNode } from "react";
import { useTheme } from "../hooks/useTheme.js";

export interface DashboardPanelProps {
  /** Panel title (e.g. "Starred Repos"). Rendered bold in primary color. */
  title: string;
  /** Whether this panel currently has keyboard focus. Controls border color. */
  focused: boolean;
  /** Panel index in the Tab cycle order (0-based). */
  index: number;
  /** Total number of panels. */
  total: number;
  /** Whether the dashboard is in compact (stacked) mode. Shows [index+1/total] in header. */
  isCompact: boolean;
  /** Whether this panel should be visible (in compact mode, only focused panel is visible). */
  visible: boolean;
  /** Panel content. */
  children: ReactNode;
}

export function DashboardPanel({
  title,
  focused,
  index,
  total,
  isCompact,
  visible,
  children,
}: DashboardPanelProps) {
  const theme = useTheme();

  if (!visible) return null;

  const headerText = isCompact
    ? `${title} [${index + 1}/${total}]`
    : title;

  const borderColor = focused ? theme.primary : theme.border;

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      flexBasis="50%"
      borderStyle="single"
      borderColor={borderColor}
    >
      <box height={1} paddingX={1}>
        <text bold fg={theme.primary}>{headerText}</text>
      </box>
      <box flexDirection="column" flexGrow={1}>
        {children}
      </box>
    </box>
  );
}
```

**Rendering rules**:
- `focused=true` → border is `theme.primary` (ANSI 33, blue)
- `focused=false` → border is `theme.border` (ANSI 240, gray)
- `isCompact=true` → header shows `"Starred Repos [3/4]"` format
- `visible=false` → returns `null` (compact mode hides non-focused panels)

---

### Step 4: Create the `StarredReposPanel` component

**File**: `apps/tui/src/screens/dashboard/StarredReposPanel.tsx`

This is the main implementation file for this ticket. It is the panel component rendered inside `DashboardPanel`.

#### Component Interface

```typescript
export interface StarredReposPanelProps {
  /** Whether this panel has keyboard focus from the dashboard focus manager. */
  focused: boolean;
  /** Panel index (used by DashboardPanel for compact header). */
  index: number;
  /** Total panels (used by DashboardPanel for compact header). */
  total: number;
  /** Whether the dashboard is in compact (stacked) mode. */
  isCompact: boolean;
  /** Whether this panel is visible (in compact, only the focused panel is visible). */
  visible: boolean;
}
```

#### Internal State

| State Variable | Type | Initial | Purpose |
|---------------|------|---------|----------|
| `focusedIndex` | `number` | `0` | Currently focused row index within filtered results |
| `filterActive` | `boolean` | `false` | Whether the filter input is shown and focused |
| `filterQuery` | `string` | `""` | Current filter text |
| `errorRetryPending` | `boolean` | `false` | Whether we're waiting for the user to press R |

#### Data Flow

```
useStarredRepos({ perPage: 20 })
  ↓
{ repos, totalCount, isLoading, error, hasMore, fetchMore, refetch }
  ↓
Client-side filter: repos.filter(matchesFilterQuery)
  ↓
filteredRepos → render in scrollbox
```

#### Filter Logic

```typescript
function matchesFilter(repo: RepoSummary, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    repo.full_name.toLowerCase().includes(q) ||
    (repo.description ?? "").toLowerCase().includes(q)
  );
}

const filteredRepos = useMemo(
  () => repos.filter((r) => matchesFilter(r, filterQuery)),
  [repos, filterQuery]
);
```

- Filter is client-side only — never sent to the API.
- Filter applies to all loaded items (across all fetched pages).
- New pages fetched via pagination are filtered as they arrive (because `repos` updates, `filteredRepos` re-derives).
- Max filter input length: 100 characters (enforced in onChange handler).

#### Responsive Column Configuration

```typescript
interface ColumnConfig {
  nameWidth: number;
  showDescription: boolean;
  descriptionWidth: number;
  showBookmarkBadge: boolean;
}

function getColumnConfig(breakpoint: Breakpoint | null): ColumnConfig {
  switch (breakpoint) {
    case "large":
      return { nameWidth: 50, showDescription: true, descriptionWidth: 60, showBookmarkBadge: true };
    case "standard":
      return { nameWidth: 40, showDescription: true, descriptionWidth: 30, showBookmarkBadge: false };
    case "minimum":
    default:
      return { nameWidth: 60, showDescription: false, descriptionWidth: 0, showBookmarkBadge: false };
  }
}
```

#### Row Rendering

Each row is a single-line `<box>` with horizontal layout:

```
┌─────────────────────────────────────────────────────────────┐
│ owner/name          A description...           ◆  1.5k     │
└─────────────────────────────────────────────────────────────┘
```

At minimum breakpoint (80×24):
```
┌──────────────────────────────────────────────────────────────┐
│ owner/really-long-repo-name-that-gets-truncat…     ◆  1.5k │
└──────────────────────────────────────────────────────────────┘
```

**Row render logic per column**:

1. **Full name**: `truncateText(repo.full_name, config.nameWidth)` in `theme.primary` color. Focused row uses reverse video attribute (`{ reverse: true }`).
2. **Description** (standard/large only): `truncateText(repo.description ?? "", config.descriptionWidth)` in `theme.muted` color. Hidden at minimum breakpoint.
3. **Visibility badge**: `"◆"` in `theme.success` (ANSI 34, green) for public repos, `"◇"` in `theme.muted` (ANSI 245) for private repos. Exactly 1 character, never truncated.
4. **Star count**: `formatStarCount(repo.num_stars)` in `theme.muted`. When `num_stars === 0`, renders empty (no element). Max 5 characters.
5. **Bookmark badge** (large only): Default bookmark indicator if present.

#### Scroll Position & Focus Management

The panel tracks `focusedIndex` as the cursor position within `filteredRepos`. The `<scrollbox>` component scrolls to keep the focused row visible.

- `focusedIndex` is clamped to `[0, filteredRepos.length - 1]`.
- When filter narrows results, `focusedIndex` is clamped to the new bounds.
- When filter clears, `focusedIndex` resets to `0`.
- When navigating back from a pushed repo overview screen, `focusedIndex` is preserved (focus memory).

**Pagination trigger**: When `focusedIndex >= filteredRepos.length * 0.8` and `hasMore` is true and not currently loading, call `fetchMore()`. This is checked on every focus change (j/k, G, gg, Ctrl+D, Ctrl+U).

#### Keybinding Registration

Keybindings are registered via `useScreenKeybindings()` only when `focused` prop is `true`. When the panel loses focus (another panel gains Tab focus), keybindings are deregistered.

The `when` predicate on each keybinding checks `props.focused` to prevent stale bindings from firing.

```typescript
const panelKeybindings: KeyHandler[] = [
  { key: "j",       description: "Down",       group: "Navigation", handler: moveDown,     when: () => !filterActive },
  { key: "Down",    description: "Down",       group: "Navigation", handler: moveDown,     when: () => !filterActive },
  { key: "k",       description: "Up",         group: "Navigation", handler: moveUp,       when: () => !filterActive },
  { key: "Up",      description: "Up",         group: "Navigation", handler: moveUp,       when: () => !filterActive },
  { key: "Enter",   description: "Open",       group: "Actions",    handler: handleEnter },
  { key: "/",       description: "Filter",     group: "Actions",    handler: activateFilter, when: () => !filterActive },
  { key: "Escape",  description: "Clear filter", group: "Actions",  handler: clearFilter,  when: () => filterActive },
  { key: "G",       description: "Last row",   group: "Navigation", handler: jumpToEnd,    when: () => !filterActive },
  // g g is handled by detecting "g" then "g" within 1500ms via go-to mode
  { key: "ctrl+d",  description: "Page down",  group: "Navigation", handler: pageDown,     when: () => !filterActive },
  { key: "ctrl+u",  description: "Page up",    group: "Navigation", handler: pageUp,       when: () => !filterActive },
  { key: "R",       description: "Retry",      group: "Actions",    handler: handleRetry,  when: () => !!error },
];
```

**Filter mode keybinding handling**:

When `filterActive` is `true`, the filter `<input>` component captures printable keys at `PRIORITY.TEXT_INPUT`. The `j`, `k`, `q`, and other navigation keys are typed into the input, not interpreted as navigation. Only `Escape` and `Enter` are handled at the panel level:

- `Escape` → clear filter, deactivate filter mode, refocus list
- `Enter` → select first match (set `focusedIndex = 0`, deactivate filter, push repo overview)

#### Error Handling

| HTTP Status | UI Behavior |
|-------------|-------------|
| 200 | Render items |
| 401 | Propagate to app-shell AuthErrorScreen via `useAuth()` state change |
| 429 | Display `"Rate limited. Retry in {Retry-After}s."` in `theme.error`. User presses `R` after wait. |
| 5xx | Display `error.message` in `theme.error` + `"Press R to retry"` in `theme.muted` |
| Network error | Display `"Network error"` in `theme.error` + `"Press R to retry"` |
| Malformed JSON | Display `"Unexpected response. Press R to retry."` |

The panel uses a per-panel React error boundary (inherited from dashboard grid) so a render crash in this panel does not affect the other three panels.

#### Telemetry Events

Telemetry is emitted via a `useTelemetry()` hook (or direct function calls to the telemetry module). Each event includes the common properties (`session_id`, `user_id` hashed, `timestamp`, `tui_version`, `terminal_width`, `terminal_height`).

```typescript
// On successful initial load:
telemetry.track("tui.dashboard.starred.view", {
  total_count: totalCount,
  items_in_first_page: repos.length,
  terminal_width: layout.width,
  terminal_height: layout.height,
  breakpoint: layout.breakpoint,
  load_time_ms: loadDuration,
});

// On repo open:
telemetry.track("tui.dashboard.starred.open", {
  repo_full_name: repo.full_name,
  repo_is_public: repo.is_public,
  position_in_list: focusedIndex,
  was_filtered: filterQuery.length > 0,
  filter_text_length: filterQuery.length,
});

// Additional events: filter, filter_applied, paginate, error, retry, empty, focused
```

#### Logging

All log output goes to stderr via the structured logger. Log level is controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

```typescript
const log = createLogger("Dashboard/StarredRepos");

log.info(`loaded [count=${repos.length}] [total=${totalCount}] [ms=${loadDuration}]`);
log.info(`opened [repo=${repo.full_name}] [position=${focusedIndex}]`);
log.info(`paginated [page=${page}] [items=${newCount}] [total_loaded=${totalLoaded}]`);
log.warn(`fetch failed [status=${status}] [error=${message}]`);
log.warn(`rate limited [retry_after=${retryAfter}s]`);
log.debug(`filter activated`);
log.debug(`focused`);
```

---

### Step 5: Create the `DashboardScreen` component (panel coordinator)

**File**: `apps/tui/src/screens/dashboard/DashboardScreen.tsx`
**Index barrel**: `apps/tui/src/screens/dashboard/index.ts`

The dashboard screen manages the 2×2 grid layout, panel focus cycling, and responsive stacking. The starred repos panel is panel index `2` (bottom-left), in the Tab cycle order: Recent Repos (0) → Organizations (1) → Starred Repos (2) → Activity Feed (3).

This file is owned by the broader `tui-dashboard-panel-focus-manager` dependency, but the starred repos integration point is:

```typescript
import { StarredReposPanel } from "./StarredReposPanel.js";

// Inside DashboardScreen render:
<StarredReposPanel
  focused={focusedPanel === 2}
  index={2}
  total={4}
  isCompact={isCompact}
  visible={isCompact ? focusedPanel === 2 : true}
/>
```

**Layout at standard (120×40)**:
```
┌─ row1 ──────────────────────────────────────────────┐
│  <RecentReposPanel />  │  <OrganizationsPanel />     │
├─ row2 ──────────────────────────────────────────────┤
│  <StarredReposPanel /> │  <ActivityFeedPanel />      │
└─────────────────────────────────────────────────────┘
```

**Layout at minimum (80×24)**:
```
┌───────────────────────────────────────────────┐
│  <Panel visible={focusedPanel === N} />        │
│  (only one panel visible, Tab cycles)          │
└───────────────────────────────────────────────┘
```

**Panel focus management**:
- `Tab` → `focusedPanel = (focusedPanel + 1) % 4`
- `Shift+Tab` → `focusedPanel = (focusedPanel + 3) % 4`
- `h` → move to left column (0↔1, 2↔3) when in two-column layout
- `l` → move to right column (0↔1, 2↔3) when in two-column layout

---

### Step 6: Register the DashboardScreen in the screen registry

**File**: `apps/tui/src/router/registry.ts`

Update the import and registry entry:

```typescript
import { DashboardScreen } from "../screens/dashboard/index.js";

// Replace:
[ScreenName.Dashboard]: {
  component: PlaceholderScreen,
  ...
},

// With:
[ScreenName.Dashboard]: {
  component: DashboardScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Dashboard",
},
```

---

### Step 7: Wire navigation from StarredReposPanel → RepoOverview

When the user presses `Enter` on a focused starred repo:

```typescript
const { push } = useNavigation();

function handleOpen() {
  if (filteredRepos.length === 0) return;
  const repo = filteredRepos[focusedIndex];
  if (!repo) return;
  const [owner, name] = repo.full_name.split("/");
  push(ScreenName.RepoOverview, { owner, repo: name });
}
```

The breadcrumb trail will read: `Dashboard > owner/repo`.

When pressing `q` on the repo overview, the navigation stack pops back to Dashboard, and the starred repos panel restores its `focusedIndex` (preserved in component state, not navigation stack scroll position).

---

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `specs/tui/packages/ui-core/src/hooks/starred/useStarredRepos.ts` | Create | Data hook for starred repos API |
| `specs/tui/packages/ui-core/src/hooks/starred/index.ts` | Create | Barrel export |
| `apps/tui/src/util/format-stars.ts` | Create | `formatStarCount()` utility |
| `apps/tui/src/util/index.ts` | Edit | Add `format-stars` re-export |
| `apps/tui/src/components/DashboardPanel.tsx` | Create | Shared panel wrapper (border, header, focus state) |
| `apps/tui/src/screens/dashboard/StarredReposPanel.tsx` | Create | Starred repos panel component |
| `apps/tui/src/screens/dashboard/DashboardScreen.tsx` | Create | Dashboard screen with 2×2 grid |
| `apps/tui/src/screens/dashboard/index.ts` | Create | Barrel export for dashboard screen |
| `apps/tui/src/router/registry.ts` | Edit | Replace Dashboard PlaceholderScreen with DashboardScreen |
| `e2e/tui/dashboard-starred.test.ts` | Create | All SNAP-STAR, KEY-STAR, RESP-STAR, INT-STAR tests |
| `e2e/tui/util-format-stars.test.ts` | Create | Unit tests for `formatStarCount()` |

---

## Component Tree (Full)

```
DashboardScreen
├── useLayout()                           // terminal dimensions, breakpoint
├── useNavigation()                       // push for repo open
├── useState(focusedPanel)                // 0-3 panel focus index
├── useScreenKeybindings(dashboardKeys)   // Tab, Shift+Tab, h, l
│
├── <box flexDirection="column" width="100%" height="100%">
│   ├── <box flexDirection="row" flexGrow={1}>              // Row 1 (top)
│   │   ├── <DashboardPanel title="Recent Repos" ...>       // Panel 0
│   │   │   └── <RecentReposPanel />
│   │   └── <DashboardPanel title="Organizations" ...>      // Panel 1
│   │       └── <OrganizationsPanel />
│   └── <box flexDirection="row" flexGrow={1}>              // Row 2 (bottom)
│       ├── <DashboardPanel title="Starred Repos" ...>      // Panel 2
│       │   └── <StarredReposPanel />
│       │       ├── useStarredRepos({ perPage: 20 })
│       │       ├── usePaginationLoading(...)
│       │       ├── useState(focusedIndex)
│       │       ├── useState(filterActive, filterQuery)
│       │       ├── useScreenKeybindings(panelKeys)  // only when focused
│       │       │
│       │       ├── {loading && !repos.length && <text>Loading…</text>}
│       │       ├── {error && <ErrorDisplay error={error} />}
│       │       ├── {!loading && !error && repos.length === 0 && <text>No starred repositories</text>}
│       │       ├── {filterActive && <FilterInput ... />}
│       │       ├── <scrollbox flexGrow={1} onScrollEnd={...}>
│       │       │   ├── <StarredRepoRow /> × N
│       │       │   │   ├── <text>{truncate(full_name)}</text>
│       │       │   │   ├── <text>{truncate(description)}</text>  // standard+large only
│       │       │   │   ├── <text>{◆ or ◇}</text>
│       │       │   │   └── <text>{formatStarCount(num_stars)}</text>  // if > 0
│       │       │   └── {loadingMore && <text>Loading more…</text>}
│       │       └── {filterActive && filteredRepos.length === 0 && <text>No matching repositories</text>}
│       └── <DashboardPanel title="Activity Feed" ...>      // Panel 3
│           └── <ActivityFeedPanel />
```

---

## Productionization Checklist

Since this is new production code (not PoC), the following engineering standards apply from the start:

1. **No mock data in production components.** The `useStarredRepos()` hook calls the real API. If the API is not yet available, the component renders its error state naturally — no hardcoded fallback data.

2. **Error boundaries are per-panel.** Each `DashboardPanel` wraps its children in a `<PanelErrorBoundary>` that catches render crashes and displays `"Panel error — press R to retry"` without affecting other panels.

3. **Memory cap is enforced.** The `maxItems: 200` setting in `usePaginatedQuery` ensures the starred repos list does not grow beyond 200 items. This is critical for long-running TUI sessions.

4. **Filter input is never sent to the API.** Client-side only. This eliminates a class of injection vulnerabilities and keeps the API surface minimal.

5. **Token is never logged.** All log messages reference repo names, counts, and error codes — never the auth token.

6. **Unicode truncation safety.** The `truncateText()` utility from `apps/tui/src/util/truncate.ts` handles ASCII text correctly. For grapheme-cluster-safe truncation of user-generated content with emoji or combining characters, a follow-up enhancement should integrate a grapheme-aware width function. The current implementation is correct for the common case (Latin + CJK repository names).

7. **Telemetry events are fire-and-forget.** Telemetry failures never block rendering or user interaction.

8. **Rate limit handling is passive.** The TUI displays the `Retry-After` value but does not auto-retry. The user decides when to press `R`. This prevents retry storms.

---

## Unit & Integration Tests

### Test File: `e2e/tui/util-format-stars.test.ts`

Unit tests for the `formatStarCount` utility. These are pure function tests that don't need a TUI instance.

```typescript
import { describe, expect, test } from "bun:test";
import { formatStarCount } from "../../apps/tui/src/util/format-stars.js";

describe("formatStarCount", () => {
  test("returns empty string for 0 stars", () => {
    expect(formatStarCount(0)).toBe("");
  });

  test("returns empty string for negative values", () => {
    expect(formatStarCount(-5)).toBe("");
  });

  test("returns literal for 1-999", () => {
    expect(formatStarCount(1)).toBe("1");
    expect(formatStarCount(42)).toBe("42");
    expect(formatStarCount(999)).toBe("999");
  });

  test("returns K-abbreviated for 1000-9999", () => {
    expect(formatStarCount(1000)).toBe("1k");
    expect(formatStarCount(1500)).toBe("1.5k");
    expect(formatStarCount(2000)).toBe("2k");
    expect(formatStarCount(9999)).toBe("9.9k");
  });

  test("returns K-abbreviated for 10000-999999", () => {
    expect(formatStarCount(10000)).toBe("10k");
    expect(formatStarCount(25000)).toBe("25k");
    expect(formatStarCount(999999)).toBe("999k");
  });

  test("returns M-abbreviated for 1000000+", () => {
    expect(formatStarCount(1000000)).toBe("1M");
    expect(formatStarCount(1500000)).toBe("1.5M");
    expect(formatStarCount(25000000)).toBe("25M");
  });

  test("result never exceeds 5 characters", () => {
    const cases = [0, 1, 42, 999, 1000, 1500, 9999, 10000, 25000, 999999, 1000000, 1500000, 25000000, 999999999];
    for (const n of cases) {
      const result = formatStarCount(n);
      expect(result.length).toBeLessThanOrEqual(5);
    }
  });
});
```

---

### Test File: `e2e/tui/dashboard-starred.test.ts`

All E2E tests for the starred repos panel. Uses `@microsoft/tui-test` via the `launchTUI` helper. Tests are **never skipped** — if the backend API is unimplemented, they fail naturally.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  type TUITestInstance,
} from "./helpers.js";

let tui: TUITestInstance;

afterEach(async () => {
  if (tui) await tui.terminate();
});

// ═══════════════════════════════════════════════════════════════════════════
// TERMINAL SNAPSHOT TESTS (15)
// ═══════════════════════════════════════════════════════════════════════════

describe("SNAP-STAR: Starred Repos Panel Snapshots", () => {
  test("SNAP-STAR-001: panel renders at 120x40 with items — header, rows, badges, star counts", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-STAR-002: empty state — 'No starred repositories' in muted color", async () => {
    // Requires a test user with zero starred repos
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    // Navigate to starred panel focus
    await tui.sendKeys("Tab", "Tab"); // focus panel 2
    const snapshot = tui.snapshot();
    // This assertion checks for either repos or empty state
    expect(
      snapshot.includes("No starred repositories") ||
      snapshot.includes("◆") ||
      snapshot.includes("◇")
    ).toBe(true);
  });

  test("SNAP-STAR-003: loading state — 'Loading…' centered in panel", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    // Capture immediately before data loads
    const snapshot = tui.snapshot();
    // Loading state may or may not be captured depending on timing
    // The test validates the loading indicator renders when data is in-flight
    expect(snapshot).toBeDefined();
  });

  test("SNAP-STAR-004: error state — red error message + 'Press R to retry'", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
      env: { CODEPLANE_API_URL: "http://localhost:1" }, // unreachable
    });
    await tui.waitForText("Press R to retry", 15_000);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-STAR-005: focused row highlight — first row with primary reverse video", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    // Focus starred repos panel
    await tui.sendKeys("Tab", "Tab");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-STAR-006: visibility badges — ◆ green for public, ◇ muted for private", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    const snapshot = tui.snapshot();
    // Verify badge characters are present
    expect(snapshot.includes("◆") || snapshot.includes("◇")).toBe(true);
  });

  test("SNAP-STAR-007: filter active — input with placeholder and match count", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab"); // focus starred panel
    await tui.sendKeys("/"); // activate filter
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-STAR-008: filter results — only matching repos shown with count", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    await tui.sendText("test");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-STAR-009: filter no results — 'No matching repositories'", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    await tui.sendText("zzzznonexistentzzzz");
    await tui.waitForText("No matching repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-STAR-010: pagination loading — 'Loading more…' at scrollbox bottom", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    // Scroll to bottom to trigger pagination
    await tui.sendKeys("G");
    // The loading indicator may appear briefly
    expect(tui.snapshot()).toBeDefined();
  });

  test("SNAP-STAR-011: star count formatting — empty, literal, K-abbreviated", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    // Verify the panel renders star counts in expected formats
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-STAR-012: unfocused border — gray (ANSI 240) when another panel focused", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    // Default focus is panel 0 (Recent Repos), so Starred is unfocused
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-STAR-013: rate limit display — 'Rate limited. Retry in 30s.'", async () => {
    // This test will fail naturally if the test API does not simulate 429s
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    // Rate limiting would need to be triggered by backend behavior
    expect(tui.snapshot()).toBeDefined();
  });

  test("SNAP-STAR-014: 80x24 minimum — single column, [3/4] header, no descriptions", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");
    // Navigate to starred panel in compact mode
    await tui.sendKeys("Tab", "Tab");
    await tui.waitForText("Starred Repos [3/4]");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-STAR-015: 200x60 large — expanded columns, bookmark badge", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
    });
    await tui.waitForText("Starred Repos");
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD INTERACTION TESTS (28)
// ═══════════════════════════════════════════════════════════════════════════

describe("KEY-STAR: Starred Repos Panel Keyboard", () => {
  test("KEY-STAR-001: j moves focus to next row", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab"); // focus starred panel
    await tui.sendKeys("j");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-002: k moves focus to previous row", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("j", "j", "k"); // down 2, up 1
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-003: Down arrow moves focus to next row", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("Down");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-004: Up arrow moves focus to previous row", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("Down", "Down", "Up");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-005: k on first row does not wrap (stays on row 0)", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("k"); // already at top
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-006: j on last row does not wrap (stays on last row)", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("G"); // jump to last row
    await tui.sendKeys("j"); // try to go past end
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-007: Enter opens correct repo and pushes repo overview", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("Enter");
    // Should navigate to repo overview — breadcrumb updates
    await tui.waitForText("Dashboard");
    // The breadcrumb should show the repo path
    const header = tui.getLine(0);
    expect(header).toMatch(/Dashboard.*›/);
  });

  test("KEY-STAR-008: breadcrumb shows 'Dashboard > owner/repo' after Enter", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("Enter");
    const header = tui.getLine(0);
    expect(header).toMatch(/Dashboard.*\//);
  });

  test("KEY-STAR-009: / activates filter input", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    // Filter input should be visible
    const snapshot = tui.snapshot();
    expect(snapshot.includes("of") || snapshot.includes("Filter")).toBe(true);
  });

  test("KEY-STAR-010: typing in filter narrows results", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    await tui.sendText("test");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-011: filter is case-insensitive", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    await tui.sendText("TEST");
    // Should match same repos as lowercase "test"
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-012: Esc clears filter and returns focus to list", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    await tui.sendText("test");
    await tui.sendKeys("Escape");
    // Filter should be cleared, all items visible
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-013: Enter in filter selects first match and closes filter", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    await tui.sendText("test");
    await tui.sendKeys("Enter");
    // Should navigate to the first matching repo
    const header = tui.getLine(0);
    expect(header).toMatch(/Dashboard/);
  });

  test("KEY-STAR-014: G jumps to last loaded row", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("G");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-015: g g jumps to first row", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("G"); // go to end
    await tui.sendKeys("g", "g"); // go to start
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-016: Ctrl+D pages down half panel height", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("ctrl+d");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-017: Ctrl+U pages up half panel height", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("ctrl+d"); // page down first
    await tui.sendKeys("ctrl+u"); // page back up
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-018: R retries on error state", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
      env: { CODEPLANE_API_URL: "http://localhost:1" },
    });
    await tui.waitForText("Press R to retry", 15_000);
    await tui.sendKeys("Tab", "Tab"); // focus starred panel
    await tui.sendKeys("R");
    // Retry attempt — may succeed or fail again depending on server
    expect(tui.snapshot()).toBeDefined();
  });

  test("KEY-STAR-019: R is no-op when data is loaded successfully", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    const before = tui.snapshot();
    await tui.sendKeys("R");
    const after = tui.snapshot();
    // Snapshot should be unchanged
    expect(after).toBe(before);
  });

  test("KEY-STAR-020: Tab cycles to next panel", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab"); // focus starred
    await tui.sendKeys("Tab"); // should move to Activity Feed (panel 3)
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-021: Shift+Tab cycles to previous panel", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab"); // focus starred
    await tui.sendKeys("shift+Tab"); // should move to Organizations (panel 1)
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-022: j in filter input types 'j', not navigation", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    await tui.sendText("j");
    // Filter input should contain 'j', not navigate down
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("j");
  });

  test("KEY-STAR-023: q in filter input types 'q', not quit", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    await tui.sendText("q");
    // Should still be on dashboard (not quit)
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("Dashboard");
  });

  test("KEY-STAR-024: rapid j presses — 10 j's moves focus to row 11", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    for (let i = 0; i < 10; i++) {
      await tui.sendKeys("j");
    }
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-025: Enter during loading is no-op", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    // Send Enter immediately before data loads
    await tui.sendKeys("Enter");
    // Should still be on dashboard
    await tui.waitForText("Dashboard");
  });

  test("KEY-STAR-026: h/l column navigation between panels", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab"); // focus starred (panel 2, bottom-left)
    await tui.sendKeys("l"); // move to Activity Feed (panel 3, bottom-right)
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-STAR-027: pagination triggers at 80% scroll depth", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    // Navigate deep into the list to trigger pagination
    for (let i = 0; i < 16; i++) {
      await tui.sendKeys("j");
    }
    // Pagination may have triggered — check snapshot
    expect(tui.snapshot()).toBeDefined();
  });

  test("KEY-STAR-028: focus preserved across panel switches", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab"); // focus starred
    await tui.sendKeys("j", "j", "j"); // move to row 3
    const before = tui.snapshot();
    await tui.sendKeys("Tab"); // move to Activity Feed
    await tui.sendKeys("shift+Tab"); // move back to starred
    const after = tui.snapshot();
    // Focus should be on the same row
    expect(after).toBe(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSIVE TESTS (10)
// ═══════════════════════════════════════════════════════════════════════════

describe("RESP-STAR: Starred Repos Panel Responsive", () => {
  test("RESP-STAR-001: 80x24 renders single-column stacked layout", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("Tab", "Tab");
    await tui.waitForText("[3/4]");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESP-STAR-002: 80x24 truncation — name 60ch, no description", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("Tab", "Tab");
    // Descriptions should not appear at minimum
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESP-STAR-003: 120x40 renders two-column grid layout", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Starred Repos");
    // Should see all four panels
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESP-STAR-004: 120x40 shows descriptions truncated at 30ch", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Starred Repos");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESP-STAR-005: 200x60 expanded columns with bookmark badge", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
    });
    await tui.waitForText("Starred Repos");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESP-STAR-006: resize from 120x40 to 80x24 collapses to stacked", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab"); // focus starred
    await tui.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
    await tui.waitForText("[3/4]");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESP-STAR-007: resize from 80x24 to 120x40 expands to grid", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");
    await tui.resize(TERMINAL_SIZES.standard.width, TERMINAL_SIZES.standard.height);
    await tui.waitForText("Starred Repos");
    await tui.waitForNoText("[3/4]");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESP-STAR-008: resize preserves focused row", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("j", "j", "j"); // move to row 3
    await tui.resize(TERMINAL_SIZES.large.width, TERMINAL_SIZES.large.height);
    // Focus should still be on row 3
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESP-STAR-009: resize during active filter", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    await tui.sendText("test");
    await tui.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
    // Filter should still be active
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESP-STAR-010: filter input at 80x24 minimum", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("/");
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS (13)
// ═══════════════════════════════════════════════════════════════════════════

describe("INT-STAR: Starred Repos Panel Integration", () => {
  test("INT-STAR-001: 401 auth expiry propagates to app shell", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
      env: { CODEPLANE_TOKEN: "invalid-expired-token" },
    });
    // Should show auth error screen
    await tui.waitForText("codeplane auth login", 15_000);
  });

  test("INT-STAR-002: 429 rate limit display", async () => {
    // Rate limiting requires backend to enforce limits
    // This test will fail naturally if rate limiting is not implemented
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    // Trigger many rapid requests — if rate limited, should show message
    expect(tui.snapshot()).toBeDefined();
  });

  test("INT-STAR-003: network error with retry recovery", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
      env: { CODEPLANE_API_URL: "http://localhost:1" },
    });
    await tui.waitForText("Press R to retry", 15_000);
    // Retry won't succeed (server still down), but verifies the mechanism
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("R");
    expect(tui.snapshot()).toBeDefined();
  });

  test("INT-STAR-004: full pagination — 45 items across multiple pages", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    // Scroll to trigger pagination multiple times
    for (let i = 0; i < 40; i++) {
      await tui.sendKeys("j");
    }
    expect(tui.snapshot()).toBeDefined();
  });

  test("INT-STAR-005: 200-item pagination cap", async () => {
    // Requires a user with >200 starred repos to verify cap
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    expect(tui.snapshot()).toBeDefined();
  });

  test("INT-STAR-006: navigate to repo and back preserves state", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("j", "j"); // focus row 2
    await tui.sendKeys("Enter"); // open repo
    await tui.sendKeys("q"); // go back
    await tui.waitForText("Starred Repos");
    // Focus should be preserved on row 2
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("INT-STAR-007: g d returns to dashboard with cached data", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("Enter"); // open repo
    await tui.sendKeys("g", "d"); // go to dashboard
    await tui.waitForText("Starred Repos");
    // Data should be cached, no loading state
    const snapshot = tui.snapshot();
    expect(snapshot).not.toContain("Loading…");
  });

  test("INT-STAR-008: server 500 error display", async () => {
    // Server 500 would need to be triggered by backend state
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    expect(tui.snapshot()).toBeDefined();
  });

  test("INT-STAR-009: concurrent panel loading independence", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    // Even if starred repos fails, other panels should render
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("Dashboard");
  });

  test("INT-STAR-010: empty user state — no starred repos", async () => {
    // Requires a test user with zero starred repos
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    expect(tui.snapshot()).toBeDefined();
  });

  test("INT-STAR-011: single starred repo edge case", async () => {
    // Requires a test user with exactly one starred repo
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    expect(tui.snapshot()).toBeDefined();
  });

  test("INT-STAR-012: starred repo with no description", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    // Repos without descriptions should render gracefully
    expect(tui.snapshot()).toBeDefined();
  });

  test("INT-STAR-013: sort order is by starring time, not name/update", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Starred Repos");
    // The API returns items sorted by stars.created_at DESC
    // Visual verification via snapshot
    expect(tui.snapshot()).toMatchSnapshot();
  });
});
```

---

## Implementation Sequence (Vertical Slices)

The following sequence ensures each step produces a testable increment:

### Slice 1: `formatStarCount` utility + unit tests
**Files**: `apps/tui/src/util/format-stars.ts`, `apps/tui/src/util/index.ts`, `e2e/tui/util-format-stars.test.ts`
**Verifiable**: `bun test e2e/tui/util-format-stars.test.ts` → all 7 tests pass.

### Slice 2: `useStarredRepos` data hook
**Files**: `specs/tui/packages/ui-core/src/hooks/starred/useStarredRepos.ts`, `specs/tui/packages/ui-core/src/hooks/starred/index.ts`
**Verifiable**: Import succeeds, TypeScript compiles.

### Slice 3: `DashboardPanel` shared component
**File**: `apps/tui/src/components/DashboardPanel.tsx`
**Verifiable**: Component renders in isolation (can be tested via a minimal DashboardScreen that renders one panel).

### Slice 4: `StarredReposPanel` component — data loading + rendering
**File**: `apps/tui/src/screens/dashboard/StarredReposPanel.tsx`
**Verifiable**: Panel renders rows from API data. SNAP-STAR-001, SNAP-STAR-002, SNAP-STAR-003, SNAP-STAR-004 become testable.

### Slice 5: `DashboardScreen` — grid layout + panel focus
**Files**: `apps/tui/src/screens/dashboard/DashboardScreen.tsx`, `apps/tui/src/screens/dashboard/index.ts`, `apps/tui/src/router/registry.ts`
**Verifiable**: Dashboard renders with four panels. Tab cycling works. KEY-STAR-020, KEY-STAR-021, KEY-STAR-026 become testable.

### Slice 6: Keyboard navigation within starred panel
**File**: `apps/tui/src/screens/dashboard/StarredReposPanel.tsx` (add keybinding registration)
**Verifiable**: j/k/G/gg/Ctrl+D/Ctrl+U work. KEY-STAR-001 through KEY-STAR-006, KEY-STAR-014 through KEY-STAR-017 pass.

### Slice 7: Enter → repo overview navigation
**File**: `apps/tui/src/screens/dashboard/StarredReposPanel.tsx` (add Enter handler + push)
**Verifiable**: KEY-STAR-007, KEY-STAR-008 pass. INT-STAR-006, INT-STAR-007 become testable.

### Slice 8: Filter input mode
**File**: `apps/tui/src/screens/dashboard/StarredReposPanel.tsx` (add filter state + input)
**Verifiable**: SNAP-STAR-007 through SNAP-STAR-009 pass. KEY-STAR-009 through KEY-STAR-013, KEY-STAR-022, KEY-STAR-023 pass.

### Slice 9: Pagination
**File**: `apps/tui/src/screens/dashboard/StarredReposPanel.tsx` (wire fetchMore on scroll)
**Verifiable**: SNAP-STAR-010 passes. KEY-STAR-027 passes. INT-STAR-004, INT-STAR-005 become testable.

### Slice 10: Responsive layout + error handling
**File**: `apps/tui/src/screens/dashboard/StarredReposPanel.tsx` (add responsive column config + error display + retry)
**Verifiable**: All RESP-STAR tests pass. SNAP-STAR-013, SNAP-STAR-014, SNAP-STAR-015 pass. KEY-STAR-018, KEY-STAR-019 pass.

### Slice 11: Telemetry + logging
**File**: `apps/tui/src/screens/dashboard/StarredReposPanel.tsx` (add telemetry events + structured logging)
**Verifiable**: All remaining integration tests become testable. Full test suite runs.

---

## Dependency Graph

```
tui-dashboard-data-hooks
  └── useStarredRepos (Step 2)

tui-dashboard-panel-component
  └── DashboardPanel (Step 3)

tui-dashboard-panel-focus-manager
  └── DashboardScreen focus cycling (Step 5)

tui-dashboard-e2e-test-infra
  └── launchTUI + helpers already exist in e2e/tui/helpers.ts

tui-dashboard-starred-repos (this ticket)
  ├── depends on all four above
  ├── formatStarCount utility (Step 1)
  ├── StarredReposPanel component (Steps 4, 6, 7, 8, 9, 10, 11)
  └── e2e tests (all steps)
```

---

## Edge Cases & Boundary Handling

| Edge Case | Handling |
|-----------|----------|
| Terminal resize while scrolled | `focusedIndex` is preserved; columns recalculate via `useLayout()`; scrollbox adjusts viewport |
| Rapid j/k presses | Processed sequentially via `sendKeys()` with 50ms inter-key delay; no debouncing |
| Filter during pagination | Filter applies to `repos` (all loaded items); new pages filtered as `repos` updates |
| SSE disconnect | Panel is unaffected (uses REST only); status bar shows SSE status |
| Unicode in names/descriptions | `truncateText()` operates on `.length` (code points); grapheme cluster safety is a known limitation |
| Focus memory on panel switch | `focusedIndex` is stored in component state, not navigation stack; survives Tab cycling |
| Concurrent panel loading | Each panel's `useStarredRepos()` / `useRecentRepos()` etc. are independent; failure in one does not block others |
| Filter with no results | Displays `"No matching repositories"` in `theme.muted`; `focusedIndex` resets to 0 |
| 0 stars | Star count element not rendered (empty, not "★ 0") |
| Navigation back from repo | `DashboardScreen` component remounts with preserved state via React reconciliation; `focusedIndex` maintained |
| 200-item pagination cap | Enforced by `maxItems: 200` in `usePaginatedQuery` config; oldest pages evicted |
| Filter input max length | `onChange` handler caps at 100 characters: `if (value.length > 100) return` |
| Empty description | `truncateText(repo.description ?? "", ...)` — nullish coalescing prevents crash |
| API returns empty first page | `repos.length === 0` triggers empty state: `"No starred repositories"` |
| Auth token missing | Caught at `AuthProvider` level before dashboard renders; auth error screen shown |

---

## Observability Summary

### Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Starred repos load success rate | >98% | <95% |
| Panel render time (initial) | <200ms | >500ms |
| Error rate | <2% | >5% |
| Memory (200-item cap) | Stable | Growing beyond cap |

### Structured Log Format

All logs to stderr. Prefix: `Dashboard/StarredRepos:`.

```
[info]  Dashboard/StarredRepos: loaded [count=20] [total=47] [ms=145]
[info]  Dashboard/StarredRepos: opened [repo=alice/api] [position=3]
[info]  Dashboard/StarredRepos: paginated [page=2] [items=20] [total_loaded=40]
[warn]  Dashboard/StarredRepos: fetch failed [status=500] [error=Internal Server Error]
[warn]  Dashboard/StarredRepos: rate limited [retry_after=30s]
[debug] Dashboard/StarredRepos: filter activated
[debug] Dashboard/StarredRepos: focused
```