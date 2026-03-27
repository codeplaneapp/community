# Implementation Plan for `tui-workspace-list-screen`

This plan outlines the steps to implement the `tui-workspace-list-screen` feature, building the Workspace List screen with pagination and filtering for the Codeplane TUI. The implementation introduces 13 new files, updates the router registry, and appends 120 E2E tests.

## Step 1: Create Types and Constants

**`apps/tui/src/screens/Workspaces/types.ts`**
- Define temporary stubs for `Workspace` and `WorkspaceStatus` (mirroring `specs/tui/packages/ui-core/src/types/workspaces.ts`) until they are officially exported from `@codeplane/ui-core`.
- Define `StatusFilter` union type: `"all" | "running" | "suspended" | "pending" | "failed" | "stopped"`.
- Define `ColumnConfig` interface with `key`, `label`, `width`, and `visibleAt` properties.
- Define `WorkspaceRowProps` interface.

**`apps/tui/src/screens/Workspaces/constants.ts`**
- Export pagination and UI constants: `PAGE_SIZE`, `MEMORY_CAP`, `PAGINATION_SCROLL_THRESHOLD`, `STATUS_BAR_FLASH_MS`, `COUNT_ABBREVIATION_THRESHOLD`.
- Export `STATUS_FILTER_CYCLE` array for rotating filters.
- Export `COLUMNS` layout mapping for `minimum`, `standard`, and `large` breakpoints based on the spec definitions.

## Step 2: Implement Layout and State Hooks

**`apps/tui/src/screens/Workspaces/hooks/useWorkspaceColumns.ts`**
- Utilize `useLayout()` to fetch the terminal width and breakpoint.
- Calculate visible columns based on `COLUMNS[breakpoint]`.
- Map `-1` width columns to dynamically fill remaining horizontal space based on fixed bounds.
- Return resolved columns, breakpoint, and boolean flags for conditional rendering (e.g., `showColumnHeaders`, `deleteOverlayWidth`).

**`apps/tui/src/screens/Workspaces/hooks/useWorkspaceListState.ts`**
- Manage standard list state: `focusedIndex`, `statusFilter`, `searchText`, `searchActive`, `selectedIds`, `showDeleteConfirm`, `pendingDeleteWorkspace`.
- Manage pagination tracking behavior.
- Derive `filteredWorkspaces` using `useMemo` based on `statusFilter` and `searchText` (case-insensitive substring on `name`).
- Ensure `focusedIndex` is clamped within bounds (`[0, filteredWorkspaces.length - 1]`) on every render.
- Return state variables alongside action dispatchers (`moveFocus`, `cycleStatusFilter`, `toggleSelection`, `setSearchText`, etc.).

**`apps/tui/src/screens/Workspaces/hooks/useWorkspaceActions.ts`**
- Stub optimistic mutations for `suspend`, `resume`, and `deleteWorkspace` utilizing `useOptimisticMutation`.
- Implement stubbed actions that throw `"Not yet wired to ui-core hook"` in the mutate functions as defined by the spec.
- Utilize OSC 52 escape sequences for the `copySSH` action (`\x1b]52;c;{base64}\x07`), falling back to a console display if needed.
- Leverage `useNavigation()` (imported strictly from `../../providers/NavigationProvider.js`) for `navigateToCreate` and `navigateToDetail` actions.

**`apps/tui/src/screens/Workspaces/hooks/useWorkspaceListKeybindings.ts`**
- Use `useScreenKeybindings` to register key handlers for the screen.
- Manage `PRIORITY.SCREEN` scopes with strict `when()` predicates based on state context:
  - `searchActive` -> Pass all standard inputs to text `<input>`, trap `Escape`.
  - `showDeleteConfirm` -> Block background navigation, listen only for `y`/`n`/`Escape`.
  - Normal mode -> Full vim-bindings map (`j/k/↑/↓`, `Enter`, `G`, `/`, `f`, `c`, `p`, `r`, `d`, `S`, `Space`, `Escape`).
- Implement the `g g` jump-to-top handler using a 500ms timestamp ref (resolving prior to global go-to logic bindings).

## Step 3: Implement Presentational Components

**`apps/tui/src/screens/Workspaces/components/WorkspaceRow.tsx`**
- Map through the computed `columns` prop and render text fields appropriately truncated (`truncateRight`).
- Apply `attributes={TextAttributes.REVERSE}` formatting logic when the row is `focused`.
- Implement temporary inline `●` rendering using `statusToToken()` from the theme as `WorkspaceStatusBadge` is awaiting its dependency ticket.
- Implement local inline date formatter `formatRelativeTime` (yielding 4-char max results like `3m`, `now`, `5d`).

**`apps/tui/src/screens/Workspaces/components/WorkspaceColumnHeaders.tsx`**
- Render bold muted labels mapped from the visible columns using `TextAttributes.BOLD` mapping.

**`apps/tui/src/screens/Workspaces/components/WorkspaceFilterToolbar.tsx`**
- Render dynamic top toolbar indicating state:
  - At minimum breakpoint, display search input only.
  - Show standard `/ filter` hints and string literal `Status: {filter}`.

**`apps/tui/src/screens/Workspaces/components/WorkspaceEmptyState.tsx`**
- Display standard centered empty content handling the difference between "no workspaces" vs "filtered out workspaces".

**`apps/tui/src/screens/Workspaces/components/DeleteConfirmationOverlay.tsx`**
- Generate an absolute-positioned overlay trap (`border="single"`, `surface` background).
- Attach a localized internal `PRIORITY.MODAL` keybinding scope for confirming/declining deletions with `y`, `n`, `Escape`.

## Step 4: Assemble WorkspaceListScreen

**`apps/tui/src/screens/Workspaces/WorkspaceListScreen.tsx`**
- Scaffold root orchestration for the workspace list bringing all standard UI and state hooks into a single functional layout.
- Integrate stub payload for `useWorkspaces` fetching, imitating loading/resolved stages while pending true integration.
- Execute rendering waterfall conditional tree logic:
  1. `showSpinner` -> render `<FullScreenLoading>`
  2. `showError` -> render `<FullScreenError>`
  3. Empty array matches -> render `<WorkspaceEmptyState>`
  4. Nominal state -> `<scrollbox>` populated with list of `WorkspaceRow`s followed by `<PaginationIndicator>`.
- Fire `emit("tui.workspaces.view", ...)` telemetry mapping on payload resolve.

## Step 5: Screen Registry and Exports Update

**`apps/tui/src/screens/Workspaces/index.ts`**
- Add barrel export bridging `export { WorkspaceListScreen } from "./WorkspaceListScreen.js";`

**`apps/tui/src/router/registry.ts`**
- Import `WorkspaceListScreen` at file scope.
- Modify `[ScreenName.Workspaces]` dict entry assigning `component: WorkspaceListScreen` over the defunct `PlaceholderScreen`.

## Step 6: Append End-to-End Tests

**`e2e/tui/workspaces.test.ts`**
- Safely append the outlined 120 tests specified into the existing test definitions.
- Maintain test groupings (Snapshot, Keyboard, Responsive, Integration, and Edge Case logic blocks).
- Crucially enforce that unimplemented integrations MUST fail natively without test skips or comments.

## Important Considerations during Implementation
- **Navigation Imports**: Ensure imports strictly path point to `../../providers/NavigationProvider.js` as an isolated `hooks/useNavigation.ts` does not natively exist in the tree.
- **Data Hooks**: `@codeplane/ui-core` dependencies are formally marked unbuilt. Temporary data stubs yielding loading sequences MUST exist natively within the UI components first.
- **Types definition**: Leverage explicit localized `Workspace` type matching specs rather than relying on `@codeplane/ui-core` extraction at present.
- **Visual Tokens**: Employing `TextAttributes.REVERSE` ensures `\x1b[7m` ansi sequence mapping rendering focuses across testing environments.