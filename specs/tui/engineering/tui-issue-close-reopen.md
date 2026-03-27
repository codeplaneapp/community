# Engineering Specification: TUI Issue Close/Reopen

**Ticket:** `tui-issue-close-reopen`
**Title:** Single-key close/reopen toggle with optimistic updates, bulk operations, and error handling
**Type:** Feature
**Dependencies:** `tui-issue-list-screen`, `tui-issue-detail-view`, `tui-issues-data-hooks`
**Status:** Ready for implementation

---

## 1. Executive Summary

This specification details the implementation of a single-key close/reopen toggle for issues within the Codeplane TUI. The feature allows users to instantly toggle an issue's state using `x` (in the list view) or `o` (in the detail view), backed by an optimistic UI pattern that updates local state in <16ms. It includes comprehensive error handling (reverting on 403, 404, 429, 500, and timeouts), status bar feedback, and an in-flight guard to prevent duplicate API requests. Support for bulk operations via multi-selection and a retry mechanism (`R`) for failed operations are also included.

---

## 2. High-Level Architecture

### 2.1 State Management & Optimistic UI
The feature relies on an `OptimisticMutation` pattern. When a toggle is triggered:
1. The mutation is immediately registered as `in-flight`.
2. The local data cache (via `@codeplane/ui-core`'s caching mechanism) is updated optimistically.
3. A background `PATCH /api/repos/:owner/:repo/issues/:number` request is dispatched.
4. **On Success:** The in-flight lock is released, and a transient success message is dispatched to the Status Bar.
5. **On Error:** The local cache is reverted to its previous state, the in-flight lock is released, the failed operation is stored for potential retries (`R`), and an error message is rendered in the Status Bar.

### 2.2 Component Interactions
- **IssueListScreen:** Listens for `x`. Determines the target (either the currently focused row or the set of selected rows for bulk operations). Modifies the state icon color (`success` to `error` or vice versa) and total issue count optimistically.
- **IssueDetailScreen:** Listens for `o`. Modifies the state badge, injects an optimistic `TimelineEvent` into the comment feed, and updates the timestamp.
- **StatusBar:** Extended to accept transient priority messages (overriding keybinding hints for 3 seconds) with specific color coding (`success` ANSI 34, `error` ANSI 196).

---

## 3. Implementation Plan

### Step 1: Extend StatusBar Context for Transient Messages
**File:** `apps/tui/src/providers/StatusBarProvider.tsx` (or equivalent context)
- Add a `transientMessage` state: `{ text: string, type: 'success' | 'error', expiresAt: number } | null`.
- Add a `showMessage(text, type, durationMs = 3000)` function to the context.
- **File:** `apps/tui/src/components/StatusBar.tsx`
  - Modify rendering: If `transientMessage` is active, render it on the left side instead of standard hints, applying `truncateText(msg, width - 20)`.
  - Apply `theme.success` or `theme.error` colors based on the message type.

### Step 2: Implement the `useIssueStateToggle` Hook
**New File:** `apps/tui/src/screens/issues/hooks/useIssueStateToggle.ts`
- Create a custom hook that wraps `@codeplane/ui-core`'s `useUpdateIssue`.
- **State:** `isInFlight` (boolean), `lastFailedAction` (object containing payload and revert callback).
- **Optimistic Logic:** Access the query client/cache to synchronously update the target issue's `state` property, the issue list total count, and append a pseudo-timeline event for the detail view.
- **Error Handling Map:**
  - `403`: "Permission denied"
  - `404`: "Issue not found"
  - `429`: Parse `Retry-After` header -> "Rate limited. Retry in {N}s."
  - `500`: "Server error"
  - `Network Error`: "Network error"
- Emit telemetry events: `tui.issue.close`, `tui.issue.reopen`, `tui.issue.close_reopen.error`.

### Step 3: Integrate Toggle into Issue List Screen
**File:** `apps/tui/src/screens/issues/IssueListScreen.tsx`
- Import `useIssueStateToggle`.
- Register the `x` keybinding using `useScreenKeybindings` (priority 4).
- Register the `R` keybinding (active only if `lastFailedAction` exists).
- **Action Handler (`x`):**
  - Check if `isInFlight`. If true, ignore (emit `tui.issue.close_reopen.ignored`).
  - If `selected.size > 0` (Bulk mode):
    - If `selected.size > 5`, mount `<ConfirmDialog title="Close N issues?" />` via overlay.
    - Loop through selections and trigger mutations.
  - Else (Single mode): Trigger mutation on the currently `focusedItem`.
- **Render logic:** Dynamically set the `●` state icon color using `theme.success` (open) or `theme.error` (closed). Update status bar hints to `x:closing…` when `isInFlight`.

### Step 4: Integrate Toggle into Issue Detail Screen
**File:** `apps/tui/src/screens/issues/IssueDetailScreen.tsx`
- Import `useIssueStateToggle`.
- Register the `o` keybinding.
- Register the `R` keybinding for retry.
- **Action Handler (`o`):**
  - Check `isInFlight` guard.
  - Call mutation.
- **Render logic:**
  - Update the badge: `<text bg={isOpen ? theme.success : theme.error}>[{isOpen ? 'open' : 'closed'}]</text>`.
  - Inject optimistic timeline event: `→ @{user.login} changed state {old} → {new} — just now`.

### Step 5: Implement Retry Mechanism
**File:** `apps/tui/src/screens/issues/hooks/useIssueStateToggle.ts`
- Expose a `retry()` function.
- When `R` is pressed (in list or detail), invoke `retry()`. This clears the error state, re-applies the optimistic UI update, and dispatches the API request again. Emits `tui.issue.close_reopen.retry`.

### Step 6: Telemetry Event Registration
**File:** `apps/tui/src/lib/telemetry.ts`
- Register exact schemas for `tui.issue.close`, `tui.issue.reopen`, `tui.issue.close_reopen.error`, `tui.issue.close_reopen.retry`, and `tui.issue.close_reopen.ignored`.

---

## 4. File Inventory

### Modified Files
- `apps/tui/src/providers/StatusBarProvider.tsx` - Add transient message support.
- `apps/tui/src/components/StatusBar.tsx` - Render transient messages with color and truncation.
- `apps/tui/src/screens/issues/IssueListScreen.tsx` - Bind `x` and `R`, apply optimistic state icon rendering.
- `apps/tui/src/screens/issues/IssueDetailScreen.tsx` - Bind `o` and `R`, apply optimistic badge and timeline rendering.
- `apps/tui/src/lib/telemetry.ts` - Add new event definitions.

### New Files
- `apps/tui/src/screens/issues/hooks/useIssueStateToggle.ts` - Core hook for mutation, optimistic cache management, and error handling.

---

## 5. Unit & Integration Tests

All tests will be implemented in `e2e/tui/issues.test.ts` utilizing `@microsoft/tui-test`.

### 5.1 Snapshot Tests
- **`SNAP-CLOSE-002`**: Render issue list after pressing `x` on open issue. Assert state icon is red (`ANSI 196`).
- **`SNAP-CLOSE-004`**: Assert status bar transient success message at 120x40.
- **`SNAP-CLOSE-007`**: Issue detail screen after `o`. Assert `[closed]` badge and optimistic timeline event.
- **`SNAP-CLOSE-010 / 011`**: Verify truncation of status bar message at 80x24 and full message at 200x60.

### 5.2 Keyboard Interaction Tests
- **`KEY-CLOSE-001`**: Focus open issue -> press `x`. Assert immediate visual change. Mock API to resolve successfully.
- **`KEY-CLOSE-005`**: Rapid double-press `x`. Assert only one API call is dispatched using the mock server.
- **`KEY-CLOSE-011`**: Trigger 500 error on close. Wait for error message. Press `R`. Assert second API call is made.
- **`KEY-CLOSE-012`**: Filter to "Open". Assert "Issues (10)". Focus and press `x`. Assert title updates to "Issues (9)".

### 5.3 Error Handling & Edge Case Tests
- **`ERR-CLOSE-001`**: Mock API 403 response. Press `x`. Assert state changes instantly (optimistic), then reverts back to original color. Assert Status Bar shows "Permission denied" in red.
- **`ERR-CLOSE-003`**: Mock API 429 response with `Retry-After: 30`. Press `x`. Assert Status Bar shows "Rate limited. Retry in 30s."
- **`ERR-CLOSE-005`**: Simulate network timeout (>10s). Assert revert and "Network error" message.
- **`INT-CLOSE-003`**: Close from list, navigate to detail (`Enter`). Verify badge reflects the newly closed state based on shared cache.

---

## 6. Edge Cases & Constraints Checked

- **In-flight Resize:** The transient status bar message uses `useTerminalDimensions` to actively recalculate its truncation boundary. A resize during mutation or while the message is displayed will synchronously adjust the output without dropping the message.
- **Idempotency:** If the client is out of sync and attempts to close an already closed issue, the server will return a 200 OK with the actual state. The TUI reconciles this seamlessly when the API response resolves.
- **Concurrency:** Uses `isInFlight` lock per-issue to strictly prevent queueing multiple rapid toggles on the same item.
- **Null Timestamps:** Re-opening an issue sets `closed_at` to null; detail screen safely guards against formatting null dates.