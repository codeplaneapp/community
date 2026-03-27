# Engineering Specification: TUI Sync Conflict List

## 1. Overview

**Ticket:** tui-sync-conflict-list  
**Title:** Sync conflict list: focused triage view with bulk actions, resource description parsing, and composable filters  
**Type:** feature  
**Description:** Implement the dedicated conflict triage surface.

The Sync Conflict List is a focused triage view within the Codeplane TUI for resolving sync queue conflicts. It displays only `conflict` or `failed` items, allowing users to inspect errors, discard, or retry failed local writes against the remote server.

**Breadcrumb:** `Dashboard > Sync Status > Conflicts`  
**Reachable via:** `Enter` on conflict count in Sync Status, `g y c`, `:sync conflicts`, `--screen sync-conflicts`

## 2. Architecture & Components

The feature will be implemented across several focused components within the `apps/tui/src/screens/Sync/` directory.

### 2.1. Files to Create/Modify
- `apps/tui/src/screens/Sync/SyncConflictList.tsx`: The main orchestrator screen component.
- `apps/tui/src/screens/Sync/components/ConflictRow.tsx`: Individual list item rendering.
- `apps/tui/src/screens/Sync/components/ConflictSummaryBar.tsx`: Top bar showing overall status and count.
- `apps/tui/src/screens/Sync/components/FilterToolbar.tsx`: Filter controls (status, method, search).
- `apps/tui/src/screens/Sync/components/BulkConfirmModal.tsx`: Confirmation dialogs for bulk actions.
- `apps/tui/src/screens/Sync/utils/parseResourceDescription.ts`: Utility for converting API paths to human-readable text.
- `e2e/tui/sync.test.ts`: E2E test suite.

### 2.2. Layout Structure
```tsx
<box flexDirection="column" width="100%" height="100%">
  <ConflictSummaryBar count={...} status={...} />
  <FilterToolbar statusFilter={...} methodFilter={...} search={...} />
  <scrollbox flexGrow={1}>
    {/* List of ConflictRow components */}
  </scrollbox>
  {/* Modals rendered conditionally via <OverlayLayer> or absolute positioned boxes */}
  {detailModalOpen && <ConflictDetailModal ... />}
  {bulkModalOpen && <BulkConfirmModal ... />}
  {discardModalOpen && <DiscardConfirmModal ... />}
</box>
```

## 3. Data & State Management

### 3.1. Data Hooks
- `useSyncConflicts()`: Fetches list of conflicts (`GET /api/daemon/conflicts`). Polled every 3s.
- `useDaemonStatus()`: Fetches daemon status (`GET /api/daemon/status`). Polled every 3s.
- `useConflictResolve()`: Mutation hook for `POST /api/daemon/conflicts/:id/resolve`.
- `useConflictRetry()`: Mutation hook for `POST /api/daemon/conflicts/:id/retry`.

### 3.2. State
- **Filters**: `statusFilter` (all/conflict/failed), `methodFilter` (all/standard+), `searchText` (string).
- **Selection/Focus**: Managed by the list component or internal index state for Vim-style navigation.
- **Modals**: Visibility booleans and active item references for detail, discard, and bulk modals.

## 4. Keybindings & Interactions

- `j` / `k` / `arrows`: Navigate rows.
- `Enter`: Open detail modal.
- `d`: Discard selected with confirmation.
- `y`: Retry immediately (optimistic).
- `X`: Bulk discard all visible.
- `A`: Bulk retry all visible.
- `f`: Cycle status filter.
- `m`: Cycle method filter.
- `/`: Focus search input.
- `Esc`: Close modal → clear search → clear filters → pop screen (priority chain).
- `G` / `gg`: Jump to end/start.
- `Ctrl+D` / `Ctrl+U`: Page down/up.
- `R`: Manual refresh.

## 5. Implementation Plan

### Step 1: Utility and Parsers
1. Create `parseResourceDescription.ts`.
2. Implement regex/routing logic to convert paths like `/api/repos/:owner/:repo/issues` to "Issue on owner/repo".
3. Write unit tests for the parser covering various API paths and edge cases (e.g., Unicode paths, deep nesting).

### Step 2: UI Components
1. Create `ConflictSummaryBar.tsx`:
   - Accept `count` and `isAllClear` props.
   - Render "Sync Conflicts (N)" in red (`error` theme token) or "No Conflicts — All Clear ✓" in green (`success` theme token).
2. Create `FilterToolbar.tsx`:
   - Render status, method, and search indicators.
   - Integrate `<input>` for search text.
3. Create `ConflictRow.tsx`:
   - Implement responsive rendering using `useLayout()` to show/hide the error preview and full API path based on breakpoints (80x24, 120x40, 200x60).
   - Use correct theme tokens for `conflict` (red) vs `failed` (yellow).
4. Create `BulkConfirmModal.tsx`:
   - Implement dynamic text based on action (`discard` vs `retry`) and `count`.
   - Ensure focus trapping and `Esc`/`y`/`n` key handling.

### Step 3: Screen Orchestration (`SyncConflictList.tsx`)
1. Setup layout using `useLayout()`.
2. Integrate `@codeplane/ui-core` hooks (`useSyncConflicts`, `useConflictResolve`, etc.) with 3s polling.
3. Implement client-side filtering logic composing status, method, and search text.
4. Implement Vim-style list navigation using `useKeyboard` or a generic `ScrollableList` component.
5. Register keybindings via `useScreenKeybindings()`.
6. Implement the `Esc` priority chain (Modal -> Search -> Filters -> Pop).
7. Implement bulk execution logic (sequential processing to respect rate limits, handling partial failures).

### Step 4: Router Integration
1. Register `SyncConflictList` in the global screen registry.
2. Bind `g y c` and `:sync conflicts` to push the screen.

## 6. Unit & Integration Tests

Create `e2e/tui/sync.test.ts` to implement the 115 required tests using `@microsoft/tui-test`.

### 6.1. Snapshot Tests (SNAP-CL-001–024)
- **Breakpoints**: 120x40, 80x24, 200x60 layouts.
- **States**: Summary bar states, filter toolbar, focused row, empty states (filtered vs unfiltered).
- **Modals**: Detail modal with/without body, discard confirmation, bulk modals.
- **Edge cases**: Daemon not running, disconnected, loading.

### 6.2. Keyboard Tests (KEY-CL-001–038)
- Verify `j`/`k`, `Enter`, `d`, `y`, `X`, `A`, `f`, `m`, `/`.
- Test `Esc` priority chain strictly (pressing `Esc` multiple times should unwind state step-by-step).
- Verify `R` triggers manual refresh.

### 6.3. Responsive Tests (RESP-CL-001–017)
- Verify layout shifts: Abbreviated status at 80x24, expanded at 120x40, API path visible at 200x60.
- Verify state preservation (focus, scroll, modal open) during terminal resize events.

### 6.4. Integration Tests (INT-CL-001–020)
- Test actual resolution paths: discard success/404/500, retry success/404/500.
- Verify optimistic updates and rollbacks.
- Test bulk partial failures (completed items disappear, failed remain).

### 6.5. Edge Case Tests (EDGE-CL-001–016)
- Handle long errors, Unicode paths, >10KB JSON bodies in detail modal.
- Verify 500-item memory cap and pagination.
- Verify rapid `d`/`y` presses do not cause state corruption.