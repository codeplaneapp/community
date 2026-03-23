# Implementation Plan: `tui-repo-conflicts-view`

This document outlines the step-by-step implementation plan for the repository conflicts tab view within the Codeplane TUI, incorporating current architectural realities and research findings.

## Phase 1: Foundation & Data Layer

1. **Create Type Definitions**
   - **File:** `apps/tui/src/screens/Repository/tabs/conflicts-types.ts`
   - **Action:** Define `ConflictedChange`, `ConflictFile`, `FlatRow`, `ChangeConflictState`, and `ConflictCounts` interfaces exactly as specified in the engineering spec. Ensure these types are strictly adhered to throughout the tab.

2. **Create Data Hook Stub**
   - **File:** `apps/tui/src/hooks/data/useRepoConflicts.stub.ts`
   - **Action:** Since `tui-repo-jj-hooks` is not yet implemented, create a temporary stub returning mocked API data (`conflictedChanges`, `loadConflictsForChange`, etc.) to unblock UI development. 
   - **Note:** Add a `// TEMPORARY` comment to ensure it's flagged for replacement once the backend integration lands.

3. **Implement Flattened Row Hook**
   - **File:** `apps/tui/src/screens/Repository/tabs/useConflictRows.ts`
   - **Action:** Build the `useConflictRows` custom hook. It should take raw data from the stub and local UI state (expanded IDs, filter text, show-resolved toggle) to compute a flattened `FlatRow[]` array. This is critical for driving the `<scrollbox>` rendering and `j`/`k` keyboard navigation.

## Phase 2: UI Sub-components

4. **Implement Conflicts Header**
   - **File:** `apps/tui/src/screens/Repository/tabs/ConflictsHeader.tsx`
   - **Action:** Develop the `ConflictsHeader` component. Use `<box>` and `<text>` to render the status icon (⚠/✓), conflict counts, mode indicator, and context-sensitive action hints depending on filter state.

5. **Implement Change Row**
   - **File:** `apps/tui/src/screens/Repository/tabs/ChangeRow.tsx`
   - **Action:** Build the `ChangeRow` component. Utilize `truncateText` from `apps/tui/src/util/truncate.ts` for text constraints on descriptions and author names. Apply conditional rendering using the `useLayout()` hook's breakpoints (`minimum`, `standard`, `large`).

6. **Implement File Row**
   - **File:** `apps/tui/src/screens/Repository/tabs/FileRow.tsx`
   - **Action:** Develop the `FileRow` component. Instead of writing custom left-truncation logic, utilize the existing `truncateLeft` utility from `apps/tui/src/util/truncate.ts` to ensure file paths are truncated correctly while preserving the filename end for small terminal widths.

## Phase 3: Orchestrator Component

7. **Implement Conflicts Tab**
   - **File:** `apps/tui/src/screens/Repository/tabs/ConflictsTab.tsx`
   - **Action:** Build the primary stateful component (`ConflictsTab`).
     - Manage local focus state, expanded change IDs, and filter inputs.
     - Integrate the `useRepoConflicts` stub.
     - Register comprehensive screen keybindings via `useScreenKeybindings()` utilizing the `group: "Conflicts"` option for the help overlay.
     - **Fallback handling:** Since `ScreenName.ChangeDetail` does not exist in the router, handle the `v` keybinding by treating it as a no-op, logging a warning, and rendering a temporary inline message: `"Change detail view not yet available"`.
     - Emit required telemetry events using `apps/tui/src/lib/telemetry.ts` and write structured logs using `apps/tui/src/lib/logger.ts`.

## Phase 4: Integration (Scaffold Workaround)

8. **Register the Tab Structure**
   - **File:** `apps/tui/src/screens/Repository/tabs/index.ts`
   - **Action:** Since `tui-repo-screen-scaffold` is missing, scaffold out the tab directory. Create this file and export the `REPO_TABS` array defining `ConflictsTab` at index 3 (position 4). Create a basic `PlaceholderTab.tsx` locally to mock the other missing tabs (`Bookmarks`, `Changes`, etc.) so the screen can be rendered.

## Phase 5: E2E Testing

9. **Scaffold the Test File**
   - **File:** `e2e/tui/repository.test.ts`
   - **Action:** Create the test file and import helpers (`launchTUI`, `TUITestInstance`, `createMockAPIEnv`) from `e2e/tui/helpers.ts`. Include the provided mock JSON fixtures for changes and file conflicts.

10. **Implement Test Suites**
    - **File:** `e2e/tui/repository.test.ts`
    - **Action:** Sequentially implement all 75 E2E tests exactly as outlined in the spec:
      - **Terminal Snapshot Tests** (`SNAP-CONF-001` to `019`)
      - **Keyboard Interaction Tests** (`KEY-CONF-001` to `033`)
      - **Responsive Tests** (`RSP-CONF-001` to `011`)
      - **Integration Tests** (`INT-CONF-001` to `012`)
    - **Note:** Allow tests asserting on `501 Not Implemented` and other server error states to naturally fail when interacting with the real/daemon API, adhering strictly to the `tui-test` philosophy.

## Phase 6: Final Review

11. **Productionization Check**
    - Validate that no `console.log` statements remain (use `logger` instead).
    - Ensure the UI gracefully adapts at `80x24`.
    - Verify the `?` help menu cleanly picks up the new `Conflicts` binding group.
    - Confirm rapid `j`/`k` key presses are handled sequentially without dropped state.