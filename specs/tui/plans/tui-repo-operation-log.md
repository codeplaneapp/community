# Implementation Plan: TUI Repo Operation Log

## 1. Scaffold Missing Dependencies
Since `tui-repo-screen-scaffold` and `tui-repo-jj-hooks` have not yet merged, stub the missing dependencies to allow independent testing.
*   **File:** `apps/tui/src/hooks/data/jj-types.ts`
    *   **Action:** Define `OperationResponse` and `Operation` types, including a `parseOperation` stub that populates `parent_operation_id`, `operation_type`, and `user`.
*   **File:** `apps/tui/src/hooks/data/useOperationLog.ts`
    *   **Action:** Create a mocked hook returning dummy `OperationDetail` data, `isLoading`, `error`, `hasMore`, `fetchMore`, and `refetch` states.
*   **File:** `apps/tui/src/screens/Repository/contexts/RepoContext.tsx`
    *   **Action:** Create a stub for `useRepoContext` to return a fake `owner` and `repoName` during isolated development.

## 2. Base Types and Constants
*   **File:** `apps/tui/src/screens/Repository/OperationLog/types.ts`
    *   **Action:** Define `OperationDetail` (extending base `Operation`), `OpLogViewMode`, and `OpLogColumnConfig`.
*   **File:** `apps/tui/src/screens/Repository/OperationLog/constants.ts`
    *   **Action:** Define constants like `OP_LOG_PAGE_SIZE` (50), `OP_LOG_MAX_ITEMS`, `FILTER_MAX_LENGTH`, `COLUMN` widths, and `OP_TYPE_LABELS`.

## 3. Formatting and Layout Helpers
*   **File:** `apps/tui/src/screens/Repository/OperationLog/formatOpTime.ts`
    *   **Action:** Create `formatRelativeTime` (e.g., "3m ago") and `formatAbsoluteTime` (e.g., "2026-03-21 14:32:07 UTC").
*   **File:** `apps/tui/src/screens/Repository/OperationLog/useOpLogColumns.ts`
    *   **Action:** Wrap the `useLayout` hook to return dynamic column configurations based on `large`, `standard`, and `minimum` breakpoints.

## 4. UI Components
*   **File:** `apps/tui/src/screens/Repository/OperationLog/OperationRow.tsx`
    *   **Action:** Implement `<OperationRow>` using OpenTUI `<box>` and `<text>`. Render op ID, type, user, parent ID, description, and timestamp conditionally based on `OpLogColumnConfig`. Apply highlight styles for focused rows.
*   **File:** `apps/tui/src/screens/Repository/OperationLog/OperationDetailView.tsx`
    *   **Action:** Build a detail pane that replaces the list view. Use an OpenTUI `<scrollbox>` wrapping multiple `<DetailField>` read-only displays.

## 5. Interaction Hooks and Telemetry
*   **File:** `apps/tui/src/screens/Repository/OperationLog/useOpLogFilter.ts`
    *   **Action:** Create a hook to manage client-side filtering logic, `filterText` state, and an `applyFilter` helper.
*   **File:** `apps/tui/src/screens/Repository/OperationLog/useOpLogKeybindings.ts`
    *   **Action:** Wrap `useScreenKeybindings` to define specific mappings (`j/k`, `Enter`, `y`, `/`, `Escape`, `G`, `Ctrl+D/U`, `R`, `q`) bounded by `viewMode` (`list` vs `detail`) and `filterActive`. Include contextual hints for the Status Bar.
*   **File:** `apps/tui/src/screens/Repository/OperationLog/telemetry.ts`
    *   **Action:** Implement wrappers around the `emit` function for `emitOpLogViewed`, `emitOpLogOperationSelected`, `emitOpLogIdCopied`, `emitOpLogFiltered`, `emitOpLogPaginated`, `emitOpLogRefreshed`, and `emitOpLogError`.

## 6. Main Orchestration Component
*   **File:** `apps/tui/src/screens/Repository/OperationLog/OperationLogTab.tsx`
    *   **Action:** Build the primary view. Manage state for `focusedIndex`, `viewMode`, and `selectedOperation`. Use a `try/catch` dynamic import for `useClipboard` to provide a fallback if the utility is missing. Wire up fetching, layout, user inputs, and OpenTUI's `<scrollbox>` with `onScrollEnd` handling.
*   **File:** `apps/tui/src/screens/Repository/OperationLog/index.ts`
    *   **Action:** Provide a barrel export for `<OperationLogTab>`.

## 7. App Integration
*   **File:** `apps/tui/src/screens/Repository/RepoOverviewScreen.tsx`
    *   **Action:** Update the parent tab switcher logic to dynamically render `<OperationLogTab />` when `activeTabId === "oplog"`.

## 8. E2E Testing
*   **File:** `e2e/tui/repository.test.ts`
    *   **Action:** Add test suites using `@microsoft/tui-test` covering:
        *   Terminal Snapshots (`repo-oplog-default-state-*`, `repo-oplog-empty-state`, `repo-oplog-error-state`).
        *   List Navigation (`j/k`, `G`, `Ctrl+D/U` simulations).
        *   Detail View navigation (`Enter`, `q`, `Escape`).
        *   Filter logic (`/`, text input match simulations).
        *   Pagination edge cases.
        *   *Note:* Ensure tests for unimplemented backend endpoints or fallback UI states remain marked as failing.