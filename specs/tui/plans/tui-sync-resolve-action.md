# Implementation Plan: TUI Sync Resolve Actions

## 1. Overview and Architecture
Implement the sync resolve interaction model for the Codeplane TUI, allowing users to discard conflicts (`d`) and retry failed/conflicting items (`y`). The implementation will feature optimistic UI updates, in-flight concurrency guards, focus management, and contextual hints.

## 2. Step-by-Step Implementation Plan

### Step 1: Implement `useInFlightGuard`
**File:** `apps/tui/src/screens/Sync/hooks/useInFlightGuard.ts`
- **Description:** Create a React hook to maintain a registry of active action IDs to suppress duplicate API calls.
- **Implementation Details:**
  - Use a `Set<string>` in a `useRef` to track in-flight item IDs (coupled with state updates if re-renders are needed for visual feedback like loading states).
  - Expose a `guard(id: string, actionFn: () => Promise<void>)` function.
  - Inside `guard`:
    - Check if `id` is in the set. If so, trigger an "Action in progress" flash/toast and return early.
    - Add `id` to the set.
    - Set a 30-second safety timeout using `setTimeout` to automatically remove the ID in case the promise hangs silently.
    - Execute `await actionFn()`.
    - Finally, remove `id` from the set and clear the timeout.

### Step 2: Implement `useResolveAction` (Discard)
**File:** `apps/tui/src/screens/Sync/hooks/useResolveAction.ts`
- **Description:** Implement the discard action with optimistic UI updates.
- **Implementation Details:**
  - Import `useConflictResolve` from `@codeplane/ui-core`.
  - Maintain an `optimisticDiscards` state (`Set<string>`).
  - Implement `onDiscard(item)` wrapped with the in-flight guard.
  - **Flow:**
    1. Add `item.id` to `optimisticDiscards` (optimistically hiding the row).
    2. Call the API via `useConflictResolve`.
    3. On Success: Keep in `optimisticDiscards`, trigger a success flash ("Conflict discarded"), and force a refetch of daemon status/sync conflicts.
    4. On 404: Keep in `optimisticDiscards`, trigger a muted flash ("Conflict already resolved").
    5. On Error (Network/500): Remove from `optimisticDiscards` (row reappears), trigger an error flash ("Failed to discard").
  - Return `{ onDiscard, optimisticDiscards }`.

### Step 3: Implement `useRetryAction` (Retry)
**File:** `apps/tui/src/screens/Sync/hooks/useRetryAction.ts`
- **Description:** Implement the retry action with optimistic UI updates.
- **Implementation Details:**
  - Import `useConflictRetry` from `@codeplane/ui-core`.
  - Maintain an `optimisticRetries` state (`Map<string, 'pending'>` or `Set<string>`).
  - Implement `onRetry(item)` wrapped with the in-flight guard.
  - **Flow:**
    1. Add `item.id` to `optimisticRetries` (optimistically updating status badge to 'pending').
    2. Call the API via `useConflictRetry`.
    3. On Success: Keep in `optimisticRetries`, trigger a success flash ("Item queued for retry"), and force a refetch.
    4. On 404: Coordinate with `optimisticDiscards` (or local state) to remove the item entirely from the view, trigger a muted flash ("Item no longer in queue").
    5. On Error (Network/500): Remove from `optimisticRetries`, trigger an error flash ("Retry failed").
  - Return `{ onRetry, optimisticRetries }`.

### Step 4: Wire Screen Components and Focus Management
**Files:**
- `apps/tui/src/screens/Sync/SyncStatusScreen.tsx`
- `apps/tui/src/screens/Sync/components/SyncConflictList.tsx`
- `apps/tui/src/screens/Sync/components/DiscardConfirmModal.tsx` (New)
- `apps/tui/src/screens/Sync/components/ErrorDetailModal.tsx` (Update/New)

- **Implementation Details:**
  - **State Integration:** In `SyncConflictList`, apply `optimisticDiscards` (filter out matching IDs) and `optimisticRetries` (override item status to 'pending') to the raw list from the server to derive the `displayList`.
  - **Keybindings:** Add logic to handle `d` and `y` key presses using `useKeyboard` or `useScreenKeybindings`.
    - Block execution if an input field (like a filter `/`) is focused.
    - `d`: If focused item status is 'conflict', open `DiscardConfirmModal`.
    - `y`: If focused item status is 'conflict' or 'failed', call `onRetry(focusedItem)`.
  - **Focus Management:**
    - When `DiscardConfirmModal` emits `onConfirm`:
      - Calculate the new focus index: `min(currentIndex, displayList.length - 2)` (fallback to previous if last item, or empty state if only item).
      - Call `onDiscard(focusedItem)`.
      - Close the modal and synchronously apply the new focus index to prevent jumping.
  - **Modals:**
    - Build `DiscardConfirmModal` with absolute positioning, `zIndex={20}`, error/red border, and dynamic sizing based on terminal dimensions (90% width at 80x24, 50% at 120x40, 40% at 200x60). Trap focus within.
    - Ensure `ErrorDetailModal` (usually `zIndex={10}`) accepts `onDiscard` and `onRetry` callbacks, allowing `d` and `y` to be invoked directly from the detail view. Stacking: `DiscardConfirmModal` appears over `ErrorDetailModal`.
  - **Contextual Hints:** Update the status bar hints dynamically based on the focused item's status (`conflict` -> `d:discard y:retry Enter:detail`, `failed` -> `y:retry Enter:detail`, etc.).

## 3. Testing Plan

All tests target `e2e/tui/sync.test.ts` using `@microsoft/tui-test`.

- **Terminal Snapshot Tests (18 tests):** Cover `SNAP-RESOLVE-001` through `SNAP-RESOLVE-018`, ensuring modals render correctly across terminal sizes (80x24, 120x40, 200x60), text wraps in error details, contextual hints update, and optimistic queue states (yellow badges, green flashes) reflect visually.
- **Keyboard Interaction Tests (24 tests):** Cover `KEY-RESOLVE-001` through `KEY-RESOLVE-024`, validating `d`, `y`, `Enter`, `Esc` behaviors, focus shifts upon removal, modal cascade closures, key suppression during input focus, and rapid keypress blocking via the in-flight guard.
- **Responsive Tests (8 tests):** Cover `RESP-RESOLVE-001` through `RESP-RESOLVE-008`, validating modal and overlay dynamic resizing and layout adjustments on terminal resize events without breaking.
- **Integration Tests (20 tests):** Cover `INT-RESOLVE-001` through `INT-RESOLVE-020`, validating API success/failure handling, optimistic UI reversion on 500s, 404 cleanup scenarios, background refetching synchronization, and 401 unauth fallbacks.
- **Edge Case Tests (14 tests):** Cover `EDGE-RESOLVE-001` through `EDGE-RESOLVE-014`, testing concurrent actions on different items, extreme payloads (2000+ chars), missing request bodies, screen popping during pending promises, dumb terminal fallbacks, and optimistic UI merging against continuous 3s polling beats.