# Implementation Plan: TUI Sync Conflict List

This plan outlines the steps to implement the `tui-sync-conflict-list` feature, providing a focused triage view for resolving sync queue conflicts in the Codeplane TUI.

## Phase 1: Routing & Navigation Setup

**1. Update Screen Types**
- **File:** `apps/tui/src/router/types.ts`
- **Action:** Add `SyncConflicts = "SyncConflicts"` to the `ScreenName` enum.

**2. Register Screen**
- **File:** `apps/tui/src/router/registry.ts`
- **Action:** Import the (soon to be created) `SyncConflictList` component. Register `ScreenName.SyncConflicts` in `screenRegistry` with `breadcrumbLabel: () => "Conflicts"`, `requiresRepo: false`, and `requiresOrg: false`.

**3. Global Keybindings & Command Palette**
- **File:** `apps/tui/src/hooks/useGlobalKeybindings.ts`
- **Action:** Add `g y c` to the go-to keybindings to push the `SyncConflicts` screen.
- **File:** `apps/tui/src/components/CommandPalette/commands.ts` (or equivalent)
- **Action:** Register `:sync conflicts` to navigate to the new screen.

**4. Deep Linking**
- **File:** `apps/tui/src/navigation/deepLinks.ts`
- **Action:** Map the CLI argument `--screen sync-conflicts` to `ScreenName.SyncConflicts`.

## Phase 2: Utilities & Parsers

**1. Resource Description Parser**
- **File:** `apps/tui/src/screens/Sync/utils/parseResourceDescription.ts`
- **Action:** Create a utility function `parseResourceDescription(method: string, path: string): string`. Implement regex/routing logic to convert raw API paths (e.g., `POST /api/repos/:owner/:repo/issues`) into human-readable text (e.g., "Create Issue on owner/repo").
- **File:** `apps/tui/src/screens/Sync/utils/parseResourceDescription.test.ts`
- **Action:** Write comprehensive unit tests for the parser covering standard paths, deeply nested paths, missing parameters, and Unicode characters.

## Phase 3: UI Components

**1. Summary Bar**
- **File:** `apps/tui/src/screens/Sync/components/ConflictSummaryBar.tsx`
- **Action:** Create component accepting `count: number` and `isAllClear: boolean`. Use OpenTUI `<box>` and `<text>`. Apply `theme.error` for active conflicts and `theme.success` for the all-clear state.

**2. Filter Toolbar**
- **File:** `apps/tui/src/screens/Sync/components/FilterToolbar.tsx`
- **Action:** Create component accepting `statusFilter`, `methodFilter`, `searchText`, and their respective `onChange` handlers. Render active filters and include an OpenTUI `<input>` for search. Use `theme.muted` for inactive filter text.

**3. Conflict Row**
- **File:** `apps/tui/src/screens/Sync/components/ConflictRow.tsx`
- **Action:** Create a responsive list item component.
  - Accept `item: SyncQueueItem` and `isFocused: boolean`.
  - Use `useLayout()` to determine the breakpoint.
  - At `< 80x24`: Hide error preview.
  - At `120x40`: Show abbreviated status and partial error.
  - At `>= 200x60`: Show full API path and expanded error preview.
  - Apply `theme.error` for `status === "conflict"` and `theme.warning` for `status === "failed"`.
  - Use reverse video or `theme.primary` background for the focused state.

**4. Bulk Confirmation Modal**
- **File:** `apps/tui/src/screens/Sync/components/BulkConfirmModal.tsx`
- **Action:** Create a modal overlay using absolute positioned `<box>`. Accept `action: "discard" | "retry"`, `count: number`, `onConfirm`, and `onCancel`. Trap focus and handle `y`/`n`/`Enter`/`Esc` keys.

## Phase 4: Main Screen Orchestration

**1. Sync Conflict List Screen**
- **File:** `apps/tui/src/screens/Sync/SyncConflictList.tsx`
- **Action:** Create the main screen component.
  - **Data Integration:** Import and use `useSyncConflicts`, `useDaemonStatus`, `useConflictResolve`, and `useConflictRetry` from `@codeplane/ui-core` hooks. Ensure 3s polling is configured.
  - **State Management:** Set up state for filters (`status`, `method`, `search`), focused item index, and modal visibility (detail, discard, bulk).
  - **Filtering:** Implement client-side filtering logic applying the active filters to the fetched conflict list.
  - **Keyboard Navigation:** Use `useKeyboard` or `useScreenKeybindings` for Vim-style navigation (`j`, `k`, `g g`, `G`, `Ctrl+D`, `Ctrl+U`).
  - **Interactions:** Map `Enter` to detail modal, `d` to discard, `y` to retry, `X` to bulk discard, `A` to bulk retry, `f` to cycle status, `m` to cycle method, `/` to focus search, `R` to manual refresh.
  - **Escape Chain:** Implement priority escape handling: 1. Close Modals -> 2. Blur Search -> 3. Clear Filters -> 4. Pop Screen.
  - **Bulk Logic:** Implement sequential processing for bulk actions to respect rate limits, handling partial successes/failures gracefully.
  - **Layout:** Assemble `<ConflictSummaryBar>`, `<FilterToolbar>`, and a `<scrollbox>` containing `<ConflictRow>` components. Render modals conditionally.

## Phase 5: Testing

**1. E2E Test Suite**
- **File:** `e2e/tui/sync.test.ts`
- **Action:** Implement the comprehensive test suite using `@microsoft/tui-test`.
  - **Snapshot Tests:** Cover 120x40, 80x24, 200x60 layouts, all modal states, empty states, and disconnected daemon states.
  - **Keyboard Tests:** Verify all navigation, action keys, and the strict priority of the `Esc` key chain.
  - **Responsive Tests:** Validate layout shifts and state preservation during terminal resize events.
  - **Integration Tests:** Mock the API to test successful and failed discard/retry operations, including bulk partial failures and optimistic UI rollbacks.
  - **Edge Case Tests:** Test with oversized JSON bodies, Unicode paths, and rapid keyboard input.
