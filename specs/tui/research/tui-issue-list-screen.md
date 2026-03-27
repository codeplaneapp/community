# Research Findings: TUI Issue List Screen

## 1. Existing TUI Code and Patterns (`apps/tui/`)

### Layout and OpenTUI Components
- **Responsive Layout (`useLayout`)**: Located at `apps/tui/src/hooks/useLayout.ts`. This hook wraps OpenTUI's `useTerminalDimensions` and returns structured breakpoints (`minimum`, `standard`, `large`), `contentHeight` (terminal height minus 2 for header/footer), and auto-calculated sidebar/modal widths. Components must NOT recalculate sizing manually.
- **OpenTUI React Reconciler**: According to the OpenTUI docs (`context/opentui/packages/react/README.md`), you construct terminal layouts using Flexbox-like primitives:
  - `<box>`: General layout container supporting flexbox (`flexDirection="column"`, `width="100%"`, `padding={1}`).
  - `<scrollbox>`: A scrollable view (essential for the issues list).
  - `<text>`: Used for rendering styled text, supports attributes like `fg`, `bg`, `bold`.
  - `<input>` / `<textarea>`: Native text inputs suitable for search filters.
- **Screen Scaffold Status**: `apps/tui/src/screens/Issues/` does not currently exist. The spec lists `tui-issues-screen-scaffold` as a dependency, but you will be replacing/creating it. `apps/tui/src/screens/PlaceholderScreen.tsx` provides an example of how new screens currently mount using basic `<box>` layout.
- **Missing Components**: The spec assumes `<LabelBadge>` (`tui-label-badge-component`) and `<ScrollableList>` (`tui-list-component`) exist. However, neither `apps/tui/src/components/LabelBadge.tsx` nor `apps/tui/src/components/ScrollableList.tsx` are present in the current codebase state. These may be coming from parallel PRs or need stubbing.

### TUI Custom Hooks (`apps/tui/src/hooks/`)
- **Keybindings (`useScreenKeybindings.ts`)**: Used to register screen-scoped keybindings (e.g., `j/k`, `Enter`, `f`). It pushes bindings at `PRIORITY.SCREEN` and removes them upon unmount. Automatically manages `when` conditions (e.g. active when not searching) and syncs status bar hints to the `StatusBarHintsContext`.
- **Optimistic Mutations (`useOptimisticMutation.ts`)**: Essential for the optimistic close/reopen `x` action. Takes `onOptimistic`, `onRevert`, and `mutate`. It executes the immediate state change, calls the API without an `AbortController` (to ensure completion if user navigates away), and handles error toasts via `loading.failMutation`.
- **Pagination (`usePaginationLoading.ts`)**: Manages in-flight tracking, deduplication, debounce retries (at 1 second intervals via `RETRY_DEBOUNCE_MS`), and `loadMore()` triggers for `<scrollbox onScroll>` endpoints.
- **Screen Loading (`useScreenLoading.ts`)**: Coordinates full-screen loading spinners vs skeletons, tracks sub-80ms spinner skips (`SPINNER_SKIP_THRESHOLD_MS`), handles global `R` retry registrations, and manages automatic aborts when the screen unmounts.

## 2. Shared Data Hooks (`@codeplane/ui-core`)

The `@codeplane/ui-core` components are physically situated in `specs/tui/packages/ui-core/src/hooks/issues/` for this iteration of the codebase.

- **`useIssues` (`useIssues.ts`)**: Consumes `usePaginatedQuery` to fetch from `/api/repos/{owner}/{repo}/issues`. 
  - **Returns**: `{ issues, totalCount, isLoading, error, hasMore, fetchMore, refetch }`
  - **Parameters**: `owner`, `repo`, `options: { perPage, state }`.
- **`useUpdateIssue` (`useUpdateIssue.ts`)**: 
  - **Returns**: `{ mutate, isLoading, error }`
  - **Parameters**: `owner`, `repo`, `callbacks: { onOptimistic, onRevert, onError, onSettled }`.
  - Supports patching fields: `title`, `body`, `state`, `assignees`, `labels`, `milestone`.
- **`useRepoLabels` (`useRepoLabels.ts`)**: Consumes `usePaginatedQuery` mapped to `/api/repos/{owner}/{repo}/labels` returning paginated `{ labels, totalCount, ... }`.
- **`useRepoCollaborators` (`useRepoCollaborators.ts`)**: Actually polls `/api/search/users?q={query}` (a known workaround without a dedicated collaborator API). Requires debouncing query inputs. Returns `{ users, isLoading, error, refetch }`.

## 3. Engineering Implementation Details to Match Spec

1. **Filtering & Searching Pipeline**: As per spec, use raw data arrays capped to 500 items via `.slice(0, 500)`, then apply local client-side filters in exactly this order: `Label Filter (AND)` -> `Assignee Filter` -> `Search text (case-insensitive title substring)`. 
2. **Breakpoints Implementation**: Map columns directly from `useLayout().breakpoint` (minimum, standard, large). The exact character widths for `IssueColumnConfig` (`stateIcon: 2, number: 6, ...`) must be strictly adhered to so tables don't shift unpredictably.
3. **Navigation Intercepts**: The `g g` key sequence implementation may require a secondary intercept tracking double presses if the context provider (`KeybindingProvider`) doesn't directly expose its go-to mode state.
4. **Event Telemetry**: Telemetry utility files (like `telemetry.ts` specified in the spec) need to wrap key interactions (`emitIssueListView`, `emitIssueOpen`, `emitCloseReopen`, etc.) directly inside the `useScreenKeybindings` handlers or local component `useEffect` hooks.