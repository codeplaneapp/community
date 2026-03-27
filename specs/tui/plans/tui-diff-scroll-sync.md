# Implementation Plan: TUI_DIFF_SCROLL_SYNC

This document outlines the step-by-step implementation plan for the `TUI_DIFF_SCROLL_SYNC` feature, enabling synchronized virtual scrolling between the left and right panes in the Codeplane TUI's split diff view.

## Phase 1: Foundational Types and Hooks

**1. Define Scroll Sync Types**
*   **File:** `apps/tui/src/components/diff/scroll-sync-types.ts`
*   **Action:** Create this new file to hold the type contracts and constants.
*   **Details:**
    *   Export `LogicalLineIndex` interface (`hunkIndex`, `lineWithinHunk`, `fileIndex`).
    *   Export `ScrollSyncState` interface including both vertical and horizontal scroll state, boundaries (`totalLines`), and navigation methods (`scrollBy`, `scrollTo`, `scrollToTop`, `scrollToBottom`, `pageDown`, `pageUp`, `scrollHorizontalBy`, `scrollHorizontalTo`, `resetToFileTop`).
    *   Export `ScrollTelemetryAccumulator` interface.
    *   Export `VirtualWindow` interface.
    *   Define constants `VIRTUAL_SCROLL_BUFFER = 50` and `MAX_HORIZONTAL_OFFSET = 10000`.

**2. Implement Scroll Telemetry**
*   **File:** `apps/tui/src/components/diff/useScrollTelemetry.ts`
*   **Action:** Create custom hook to batch and emit telemetry.
*   **Details:**
    *   Use a `useRef` to maintain a `ScrollTelemetryAccumulator` and a `timerRef` for the 500ms debounce.
    *   Implement `recordScroll` to aggregate subsequent scroll events of the same method and direction.
    *   Implement `flush` to call `emit('tui.diff.split_view_scrolled', {...})` imported from `../../lib/telemetry.js`.
    *   Add methods for `emitSyncActive`, `emitPositionPreserved`, and `emitResync`.
    *   Ensure `useEffect` cleanup clears timeouts and flushes pending events on unmount.

**3. Implement Scroll Position Preservation**
*   **File:** `apps/tui/src/components/diff/useScrollPosition.ts`
*   **Action:** Create custom hook to track logical line index across mode toggles.
*   **Details:**
    *   Implement `capturePosition(logical: LogicalLineIndex)`. 
    *   Implement `resolvePosition(targetHunks, targetCollapseState)` which maps the logical index back to a visual visual offset in the new view mode by calling `resolveLogicalToVisual`.
    *   Implement `adjustForCollapseToggle` to manage offset shifting when hunks above the viewport are expanded or collapsed.

## Phase 2: Core State Controller

**4. Extend DiffSyncController**
*   **File:** `apps/tui/src/components/diff/DiffSyncController.tsx`
*   **Action:** Modify the existing controller (from `tui-diff-split-view`) to support virtual scrolling and 2D state.
*   **Details:**
    *   Add `horizontalOffset` state.
    *   Implement `computeLogicalIndex` and export `resolveLogicalToVisual`.
    *   Add `useCallback` implementations for all scroll methods (`scrollBy`, `scrollTo`, `pageDown`, `pageUp`, etc.), applying clamping based on `totalLines` and viewport height.
    *   Export `computeVirtualWindow(offset, viewportHeight, totalLines)` utility to calculate the `[startIndex, endIndex]` bounds given the ±50 `VIRTUAL_SCROLL_BUFFER`.

## Phase 3: Diff UI Components Update

**5. Update DiffPane for Virtual Scrolling**
*   **File:** `apps/tui/src/components/diff/DiffPane.tsx`
*   **Action:** Refactor line rendering to strictly adhere to the virtual scroll window.
*   **Details:**
    *   Flatten all visible split pairs (accounting for `collapseState`) into a single array with visual indices.
    *   Consume `offset`, `horizontalOffset`, and `totalLines` from `useScrollSync()`.
    *   Compute the `virtualWindow` using the current offset and viewport height.
    *   Slice the flattened array to `virtualWindow.startIndex` and `virtualWindow.endIndex`.
    *   Render a top spacer `<box height={topSpacerHeight} />` and bottom spacer `<box height={bottomSpacerHeight} />` to maintain native scrollbox dimensions while omitting unrendered `<DiffSplitLine>` items.

**6. Wire Interactions in DiffSplitView**
*   **File:** `apps/tui/src/components/diff/DiffSplitView.tsx`
*   **Action:** Register keyboard bindings, integrate telemetry, and setup mouse handling.
*   **Details:**
    *   Wrap the inner components in `<DiffSyncController>`.
    *   Initialize `useScrollTelemetry` with `useTerminalDimensions` and session info.
    *   Register scroll keybindings via `useScreenKeybindings` (`j`, `k`, `ctrl+d`, `ctrl+u`, `G`, `]`, `[`, `z`, `Z`, `x`, `X`).
    *   In the handler for `]`/`[`, invoke `scrollSync.resetToFileTop()`.
    *   Attach `onMouseEvent` to the top-level `<box>` wrapper to intercept scroll wheel actions and pass deltas to `scrollSync.scrollBy(delta)`.
    *   Pass `horizontalOffset` appropriately down to `DiffPane`.

## Phase 4: Integration with Viewer

**7. Integrate with View Mode Toggles & Resizing**
*   **File:** `apps/tui/src/components/diff/DiffViewer.tsx`
*   **Action:** Coordinate position preservation during "unified vs split" switching.
*   **Details:**
    *   Use `useScrollPosition` to capture state immediately *before* calling `onModeToggle`.
    *   Add a `useEffect` that triggers when `currentViewMode` changes. If switching to `split`, call `resolvePosition` to compute the visual offset and feed it into `initialOffsetRef` or `DiffSyncController`.
    *   Implement resize auto-revert logic: use `@opentui/react`'s `useOnResize` hook. If `width` drops below the split-view threshold (e.g., 120 cols), trigger `capturePosition` and forcefully switch view mode to `unified`.

## Phase 5: End-to-End Testing

**8. Create/Update E2E Tests**
*   **File:** `e2e/tui/diff.test.ts`
*   **Action:** Add comprehensive E2E test suites using `@microsoft/tui-test`.
*   **Details:**
    *   **Snapshot Tests:** Add `SNAP-SYNC-001` through `010` to verify structural integrity (top, middle, bottom scroll, addition/deletion only hunks, hidden sidebar views).
    *   **Keyboard Sync Tests:** Add `KEY-SYNC-001` through `018` verifying `j/k` operations, clamping, `Ctrl+D/U` paging, `G/gg` jumping, file navigation `]/[`, and preservation over `w` (whitespace) or `t` (split/unified) toggles.
    *   **Responsive Tests:** Add `RSP-SYNC-001` through `010` simulating terminal resize events (e.g., `terminal.resize(80, 24)`), asserting auto-revert behavior and offset preservation.
    *   **Integration Tests:** Add `INT-SYNC-001` through `007` to confirm syntax coloring and line numbers align correctly despite the 50-line virtual scroll buffer window.
    *   **Edge Cases:** Add `EDGE-SYNC-001` through `010` handling empty diffs, binary files, very large hunks (1000+ lines), and simultaneous resize/scroll occurrences.

## Phase 6: Polish and Productionization

**9. Code Quality & Observability**
*   Ensure robust typing. Avoid `any`; use strictly typed mappings (e.g., `Map<number, boolean>` for `collapseState`).
*   Validate telemetry: Ensure `CODEPLANE_TUI_DEBUG=true` logs batch outputs efficiently without polluting `stderr` with per-frame updates.
*   Confirm 16ms render budget constraint is met: Ensure the virtual scroll computations in `DiffPane` avoid unnecessary re-renders of the entire 10k+ line arrays.
*   Test that the React Error Boundary gracefully catches potential offset out-of-bounds errors resulting from aggressive manual terminal resizes.