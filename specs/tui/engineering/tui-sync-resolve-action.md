# Engineering Specification: TUI Sync Resolve Actions

## Overview
This specification details the implementation of the sync resolve interaction model for the Codeplane TUI. This includes the logic for discarding conflicts (`d`), retrying failed/conflicting items (`y`), guarding against concurrent keypresses, and managing the associated optimistic UI updates and focus state transitions.

The features target the Sync Status Screen and will leverage hooks provided by `@codeplane/ui-core` while adding TUI-specific orchestration for keybindings, modals, focus management, and transient flash messaging.

## Architecture

1.  **Action Hooks**: The core logic is split into `useResolveAction` (for discard) and `useRetryAction`. These hooks encapsulate the API calls, optimistic state application, error handling, and toast notifications.
2.  **In-Flight Guard**: A concurrency barrier (`useInFlightGuard`) maintains a registry of active action IDs to suppress duplicate API calls and rapid redundant keypresses.
3.  **Optimistic UI Layer**: A localized override map of `itemId -> state ('discarded' | 'pending')` that merges with the continuously polling server state (`useSyncConflicts`) to ensure instantaneous feedback.
4.  **Focus Management**: After an item is discarded and removed from the list, focus must gracefully fall back to the next item, previous item, or empty state to prevent jumping or crashes.

## Implementation Plan

### Step 1: Implement `useInFlightGuard`
**File**: `apps/tui/src/screens/Sync/hooks/useInFlightGuard.ts`
*   Create a hook that maintains a `Set<string>` of item IDs currently undergoing a resolve or retry action.
*   Provide a `guard(id, actionFn)` wrapper that:
    *   Checks if the ID is already in the set. If so, triggers a "Action in progress" toast/flash and returns early.
    *   Adds the ID to the set.
    *   Executes the asynchronous `actionFn`.
    *   Removes the ID from the set upon completion or error.
    *   Includes a safety timeout (30 seconds) to purge stale IDs in case of silent promise failures.

### Step 2: Implement `useResolveAction` (Discard)
**File**: `apps/tui/src/screens/Sync/hooks/useResolveAction.ts`
*   Import `useConflictResolve` from `@codeplane/ui-core`.
*   Implement `useResolveAction` hook returning `{ onDiscard, optimisticDiscards }`.
*   `onDiscard(item)` flow:
    *   Wrap in the in-flight guard.
    *   Add item to `optimisticDiscards` set (hides the row immediately).
    *   Trigger `POST /api/daemon/conflicts/:id/resolve`.
    *   **Success**: Keep in `optimisticDiscards`, flash "Conflict discarded" (success green), and force an immediate re-fetch of `useSyncConflicts` and `useDaemonStatus`.
    *   **404 Error**: Keep in `optimisticDiscards`, flash "Conflict already resolved" (muted gray).
    *   **Network/500 Error**: Remove from `optimisticDiscards` (row reappears), flash error message "Failed to discard" (error red).

### Step 3: Implement `useRetryAction` (Retry)
**File**: `apps/tui/src/screens/Sync/hooks/useRetryAction.ts`
*   Import `useConflictRetry` from `@codeplane/ui-core`.
*   Implement `useRetryAction` hook returning `{ onRetry, optimisticRetries }`.
*   `onRetry(item)` flow:
    *   Wrap in the in-flight guard.
    *   Add item ID to `optimisticRetries` mapping `id -> 'pending'` (updates status badge immediately).
    *   Trigger `POST /api/daemon/conflicts/:id/retry`.
    *   **Success**: Keep in `optimisticRetries`, flash "Item queued for retry" (success/warning yellow), force re-fetch.
    *   **404 Error**: Remove from queue entirely via `optimisticDiscards` (shared state or callback), flash "Item no longer in queue" (muted gray).
    *   **Network/500 Error**: Remove from `optimisticRetries` (status reverts), flash error message "Retry failed" (error red).

### Step 4: Wire Screen Components and Focus Management
**Files**: `apps/tui/src/screens/Sync/SyncStatusScreen.tsx`, `apps/tui/src/screens/Sync/components/SyncConflictList.tsx`
*   **Merge Optimistic State**: In `SyncConflictList`, derive the `displayList` by filtering out IDs in `optimisticDiscards` and mapping IDs in `optimisticRetries` to a `'pending'` status.
*   **Keybindings (`d`, `y`, `Enter`)**: Update `useScreenKeybindings` or local `useKeyboard` handlers on the list:
    *   `d`: If focused item status is `conflict`, set state to open the Discard Confirmation Modal. (Block if filter input `/` is focused).
    *   `y`: If focused item status is `conflict` or `failed`, invoke `onRetry(focusedItem)`.
*   **Focus Management**: 
    *   When the active discard confirmation modal emits `onConfirm`:
        *   Determine the new focused index (next item, or previous if at the end of the list).
        *   Invoke `onDiscard(focusedItem)`.
        *   Close modal and manually set the new focus index.
*   **Contextual Hints**: Evaluate the focused row's status dynamically to determine status bar hints.
    *   `conflict`: show `d:discard y:retry Enter:detail`
    *   `failed`: show `y:retry Enter:detail`
    *   `pending`/`synced`: do not show resolve hints.
*   **Error Detail Modal Integration**: Pass down `onDiscard` and `onRetry` callbacks to the error detail modal so `d` and `y` can be invoked while the modal is open (with `d` stacking the confirmation modal on top via z-index).

## Unit & Integration Tests

All tests target `e2e/tui/sync.test.ts` using `@microsoft/tui-test`.

### Terminal Snapshot Tests (18 tests)
- `SNAP-RESOLVE-001`: Discard confirmation modal at 120×40 (centered, red border, operation details, hints).
- `SNAP-RESOLVE-002`: Discard confirmation modal at 80×24 (90% width, condensed).
- `SNAP-RESOLVE-003`: Discard confirmation modal at 200×60 (40% width, generous padding).
- `SNAP-RESOLVE-004`: Error detail modal at 120×40 (conflict item, full labels, JSON body, action hints).
- `SNAP-RESOLVE-005`: Error detail modal at 80×24 (90% width, 80% height, scrollable).
- `SNAP-RESOLVE-006`: Error detail modal at 200×60 (50% width, generous spacing).
- `SNAP-RESOLVE-007`: Error detail modal for failed item (hints show `y: retry Esc: close` only).
- `SNAP-RESOLVE-008`: Long error message (500+ chars) wraps in scrollbox, scrollbar visible.
- `SNAP-RESOLVE-009`: JSON request body syntax-highlighted via `<code language="json">`.
- `SNAP-RESOLVE-010`: Null request body ("No request body" placeholder).
- `SNAP-RESOLVE-011`: Queue row after retry (status red→yellow).
- `SNAP-RESOLVE-012`: Queue after discarding last conflict (previous item focused).
- `SNAP-RESOLVE-013`: Empty state after discarding only item.
- `SNAP-RESOLVE-014`: Flash "Conflict discarded" in green.
- `SNAP-RESOLVE-015`: Flash "Conflict already resolved" in gray.
- `SNAP-RESOLVE-016`: Flash "Item no longer in queue" in gray.
- `SNAP-RESOLVE-017`: Stacked modals — confirmation (z20) over detail (z10).
- `SNAP-RESOLVE-018`: Contextual hints for conflict row.

### Keyboard Interaction Tests (24 tests)
- `KEY-RESOLVE-001` to `KEY-RESOLVE-004`: `d` on conflict opens confirmation; `d` on failed/pending/synced is no-op.
- `KEY-RESOLVE-005` & `KEY-RESOLVE-006`: `Enter` in confirmation discards/removes row; `Esc` dismisses/unchanged.
- `KEY-RESOLVE-007` to `KEY-RESOLVE-010`: `y` on conflict/failed changes status to pending; `y` on pending/synced is no-op.
- `KEY-RESOLVE-011` & `KEY-RESOLVE-012`: `Enter` on conflict/failed opens error detail modal.
- `KEY-RESOLVE-013` to `KEY-RESOLVE-015`: Modal keypresses: `d` in detail modal opens stacked confirmation; `y` retries/closes.
- `KEY-RESOLVE-016` & `KEY-RESOLVE-017`: `Esc` behavior: closes detail to list; cascade confirmation → detail → list.
- `KEY-RESOLVE-018` to `KEY-RESOLVE-020`: Focus shifts after discard: advances, goes to previous if last, shows empty state if only.
- `KEY-RESOLVE-021`: Focus remains on same item after retry.
- `KEY-RESOLVE-022` & `KEY-RESOLVE-023`: Rapid `d` blocks when modal open; rapid `y` blocks via in-flight guard.
- `KEY-RESOLVE-024`: `d`/`y` are suppressed during filter input (`/`) focus.

### Responsive Tests (8 tests)
- `RESP-RESOLVE-001` to `RESP-RESOLVE-003`: Confirmation scales from 90% (80x24) to 50% (120x40) to 40% (200x60).
- `RESP-RESOLVE-004` to `RESP-RESOLVE-006`: Error Detail scales from 90x80 to 60x60 to 50x50 at respective breakpoints.
- `RESP-RESOLVE-007`: Resize 120→80 with confirmation open (width adjusts seamlessly).
- `RESP-RESOLVE-008`: Resize 80→200 with detail open (contracts gracefully, scroll preserved).

### Integration Tests (20 tests)
- `INT-RESOLVE-001` to `INT-RESOLVE-004`: Discard API scenarios (200 success, 404 already resolved, Network fail revert, 500 revert).
- `INT-RESOLVE-005` to `INT-RESOLVE-009`: Retry API scenarios (Conflict 200, Failed 200, 404 remove, Network fail revert, 500 revert).
- `INT-RESOLVE-010` & `INT-RESOLVE-011`: Actions trigger immediate background re-fetch of daemon status.
- `INT-RESOLVE-012` & `INT-RESOLVE-013`: Status bar resolves completely when queue hits zero ("All clear" shown).
- `INT-RESOLVE-014` & `INT-RESOLVE-015`: Interoperability with Force Sync action.
- `INT-RESOLVE-016` & `INT-RESOLVE-017`: Action execution completely integrated from within Detail modal.
- `INT-RESOLVE-018` & `INT-RESOLVE-019`: 401 Unauthorized during actions correctly renders auth fallback screen.
- `INT-RESOLVE-020`: Executing discard while `/` filter is active updates both base and filtered views properly.

### Edge Case Tests (14 tests)
- `EDGE-RESOLVE-001`: Concurrent discard + retry on *different* items process independently without collision.
- `EDGE-RESOLVE-002`: Daemon restart mid-detail gracefully handles 404.
- `EDGE-RESOLVE-003` & `EDGE-RESOLVE-004`: Extreme payload display (2000+ chars in detail, deeply nested JSON truncation).
- `EDGE-RESOLVE-005`: Null request body triggers fallback placeholder.
- `EDGE-RESOLVE-006`: Resize below 80x24 collapses to "too small", then restores state upon expanding.
- `EDGE-RESOLVE-007`: Rapid `d` + `Enter` combination enforces render-cycle boundary so modal must appear before accept.
- `EDGE-RESOLVE-008`: Popping screen (`q`) immediately after discarding last item executes cleanly.
- `EDGE-RESOLVE-009`: Unicode in API path renders with proper grapheme truncation.
- `EDGE-RESOLVE-010`: Resolving items through multiple failure/retry loops tracks correctly.
- `EDGE-RESOLVE-011`: Filter conflicts → discard all → clear filter shows surviving non-conflict items correctly.
- `EDGE-RESOLVE-012` & `EDGE-RESOLVE-013`: Optimistic UI successfully merges against periodic 3s polling beats.
- `EDGE-RESOLVE-014`: Dumb terminal (`TERM=dumb`) renders ASCII fallbacks perfectly.