# TUI Dashboard Starred Repositories - Research Findings

This document outlines the codebase context required to implement the `tui-dashboard-starred-repos` ticket for the Codeplane TUI. All references are verified against existing implementations in the repository.

## 1. Data Layer (`packages/ui-core`)

The `@codeplane/ui-core` package scaffold exists locally under the `specs/tui/packages/ui-core/` path. This is where data fetching logic relies on a shared set of primitives.

### `usePaginatedQuery`
**Location**: `specs/tui/packages/ui-core/src/hooks/internal/usePaginatedQuery.ts`

The internal pagination hook requires a specific `PaginatedQueryConfig<T>` object and returns `PaginatedQueryResult<T>`.

**Configuration Contract:**
- `client`: The `APIClient` context instance.
- `path`: URL path (e.g., `"/api/user/starred"`).
- `cacheKey`: Stringified object cache key (e.g., `JSON.stringify({ starred: true, perPage })`). Changes to this trigger a hard reset.
- `perPage`: Items per fetch.
- `enabled`: Boolean controlling initial mount query.
- `maxItems`: Enforces memory cap (drops oldest items from the state array).
- `autoPaginate`: Boolean (we set to `false` for manual cursor pagination).
- `parseResponse`: A function receiving `(data: unknown, headers: Headers)` and returning `{ items: T[], totalCount: number | null }`.

**Result Contract:**
- `items: T[]` - Accumulated results list.
- `totalCount: number` - Parsed from `X-Total-Count` headers.
- `isLoading: boolean` - True during in-flight fetch.
- `error: HookError | null` - Typed network or API error.
- `hasMore: boolean` - Side-effect free heuristic utilizing `parseResponse`.
- `fetchMore: () => void` - Fetches the next page.
- `refetch: () => void` - Performs a soft-reset refetch.

## 2. Layout and Responsive Design (`apps/tui/`)

### Breakpoints and Layout (`useLayout`)
**Location**: `apps/tui/src/hooks/useLayout.ts`

The UI adapts to the terminal size utilizing the `useLayout()` hook which wraps OpenTUI's `useTerminalDimensions`. 

**LayoutContext Return Values:**
- `width` / `height`: Raw columns/rows.
- `breakpoint`: `'large' | 'standard' | null` (where `null` implies minimum dimensions <= 80x24).
- Automatically calculates things like `contentHeight`, and `sidebarVisible` based on constraints.

## 3. UI Styling (`apps/tui/`)

### Theme Tokens (`useTheme`)
**Location**: `apps/tui/src/hooks/useTheme.ts`

The TUI relies on semantic color tokens to dictate visual hierarchies, automatically conforming to ANSI 256/16 constraints if truecolor isn't available.
- `useTheme()` returns an immutable object of `ThemeTokens`.
- Relevant tokens for this feature: 
  - `theme.primary`: Used for focused repo names (ANSI 33).
  - `theme.border`: Border states when inactive.
  - `theme.muted`: Descriptions and start counts.
  - `theme.success`: Public visibility badge.
  - `theme.error`: For rendering rate limits and backend errors.

### Text Utilities (`truncateText`)
**Location**: `apps/tui/src/util/truncate.ts`

Text truncation is natively supported via `truncateText(text: string, maxWidth: number)` which guarantees the string is equal to or less than `maxWidth` in columns, appending an ellipsis (`…`, width 1) if it exceeds.

## 4. Navigation Architecture (`apps/tui/`)

### Screen Registry
**Location**: `apps/tui/src/router/registry.ts`

Dashboard is registered as `[ScreenName.Dashboard]`. The `StarredReposPanel` leverages `useNavigation()` from `apps/tui/src/providers/NavigationProvider.tsx`.
- **Navigating**: Calling `push(ScreenName.RepoOverview, { owner, repo })` will transition to the selected repo, maintaining the history stack, enabling `q` (pop) returns with preserved state.

## 5. Testing Framework (`e2e/tui/`)

### E2E Helpers
**Location**: `e2e/tui/helpers.ts`

The E2E testing framework leverages `@microsoft/tui-test`. It exports the following helpers used by the target tests:
- `launchTUI(options)`: Spawns the headful terminal simulator.
- `TERMINAL_SIZES`: Constants dictating `minimum` (80x24), `standard` (120x40), and `large` (200x60) terminal parameters.
- `TUITestInstance`: Provides API methods for assertion logic:
  - `.sendKeys(...keys)` / `.sendText(text)`
  - `.waitForText(text)` / `.waitForNoText(text)`
  - `.snapshot()`: Grabs the full terminal buffer.
  - `.resize(cols, rows)`: Simulates dynamic WINCH events.

## Implementation Takeaways
To meet the PRD, the next step involves scaffolding `useStarredRepos.ts` inside `specs/tui/packages/ui-core/src/hooks/starred/`, creating the formatting util at `apps/tui/src/util/format-stars.ts`, scaffolding the standalone layout wrapper `DashboardPanel.tsx`, and hooking them all up inside `StarredReposPanel.tsx` consuming OpenTUI standard `<box>`, `<text>`, and `<scrollbox>` elements.