# Implementation Plan: TUI Sync Status Screen

## Phase 1: Sub-component Scaffolding

All components will be created under `apps/tui/src/screens/Sync/components/` and must strictly use OpenTUI primitives (`<box>`, `<text>`, `<input>`) and shared hooks.

### 1. `StatusBanner.tsx`
*   **Path**: `apps/tui/src/screens/Sync/components/StatusBanner.tsx`
*   **Props**: `status` ("online" | "syncing" | "error" | "offline"), `remoteUrl` (string | null), `uptime` (string), `lastSyncAt` (string | null), `breakpoint` ("minimum" | "standard" | "large").
*   **Logic**: Use `useTheme()` to map `status` to semantic colors (`theme.success` for `● Online`, `theme.warning` for `◐ Syncing…`, `theme.error` for `● Error`/`Offline`).
*   **Layout**: Return a `<box flexDirection="row" gap={1}>`. If `breakpoint === "minimum"`, condense text to a single line and truncate `remoteUrl` aggressively.

### 2. `SyncQueueSummary.tsx`
*   **Path**: `apps/tui/src/screens/Sync/components/SyncQueueSummary.tsx`
*   **Props**: `pending` (number), `synced` (number), `conflict` (number), `failed` (number), `breakpoint` ("minimum" | "standard" | "large").
*   **Logic**: Abbreviate counts >9999 as "9999+". Use `useTheme()` for colors (`pending`: warning, `synced`: success, `conflict`/`failed`: error).
*   **Layout**: If all zero, render `<text fg={theme.success}>All clear — no pending items</text>`. If `breakpoint === "minimum"`, stack without borders. Otherwise, render a bordered `<box>` with a 2x2 grid.

### 3. `ConnectionDetails.tsx`
*   **Path**: `apps/tui/src/screens/Sync/components/ConnectionDetails.tsx`
*   **Props**: `pid` (number), `port` (number), `dbMode` (string), `remoteUrl` (string | null), `hasToken` (boolean), `breakpoint`.
*   **Logic**: Display static/dynamic connection details. Show `●●●●●●●● (configured)` if `hasToken` is true. If `!remoteUrl`, display "not configured" in `theme.muted`.

### 4. `QueueItemRow.tsx`
*   **Path**: `apps/tui/src/screens/Sync/components/QueueItemRow.tsx`
*   **Props**: `item` (QueueItem object), `isFocused` (boolean), `breakpoint` ("minimum" | "standard" | "large").
*   **Logic**: Resolve row status colors. Truncate columns based on `breakpoint`:
    *   `minimum`: status(3ch), method(6ch), path(remaining−6ch), timestamp(6ch). Error hidden.
    *   `standard`: status(8ch), method(7ch), path(45ch), local_id(12ch), error(remaining−6ch), timestamp(6ch).
    *   `large`: full columns, inline error.
*   **Layout**: `<box flexDirection="row" bg={isFocused ? theme.primary : undefined}>`.

### 5. `QueueFilter.tsx`
*   **Path**: `apps/tui/src/screens/Sync/components/QueueFilter.tsx`
*   **Props**: `value` (string), `onChange` (fn), `isActive` (boolean).
*   **Layout**: Return a `<box>`. If `isActive`, render `<input value={value} onChange={onChange} focus={true} />`. If `!isActive`, render placeholder `<text fg={theme.muted}>/ filter</text>`.

---

## Phase 2: Main Screen Integration

### `SyncStatusScreen.tsx`
*   **Path**: `apps/tui/src/screens/Sync/SyncStatusScreen.tsx`
*   **Hooks Setup**:
    *   `const { breakpoint } = useLayout();`
    *   `const theme = useTheme();`
    *   Data hooks (stubbed or imported from `@codeplane/ui-core`): `useDaemonStatus`, `useSyncConflicts`, `useSyncForce`, `useConflictResolve`, `useConflictRetry`.
*   **State Management**:
    *   `filterQuery` (string), `isFilterFocused` (boolean).
    *   `selectedConflictForDetail` (QueueItem | null).
    *   `selectedConflictForDiscard` (QueueItem | null).
*   **Layout Engine**:
    *   **Top Panel**: `<StatusBanner>`
    *   **Middle Panel**: Split `<box>` containing `<SyncQueueSummary>` and `<ConnectionDetails>`. Stack vertically if `breakpoint === "minimum"`, side-by-side (40/60) if standard/large.
    *   **Bottom Panel**: `<QueueFilter>` followed by a `<scrollbox>` wrapping the mapped `<QueueItemRow>` children.
*   **Empty/Error States**:
    *   If daemon connection refused: render centered `<text fg={theme.error}>Daemon not running. Start with codeplane daemon start.</text>`.
    *   If `filteredConflicts.length === 0` and `filterQuery` is empty: render `<text fg={theme.muted}>No sync queue items.</text>`.

---

## Phase 3: Keyboard and Action Wiring

Inside `SyncStatusScreen.tsx`, utilize the `useScreenKeybindings` hook to manage the vim-style TUI interactions.

*   **Keybindings Map**:
    *   `r`: `refetch()` for both daemon status and conflict queries.
    *   `S`: Call `forceSync.mutate()`. Trigger a toast on success/error. Prevent if currently syncing or queue is 0.
    *   `d`: If focused row is a conflict, set `selectedConflictForDiscard` (opens `DiscardConfirmationModal`).
    *   `y`: If focused row is a conflict/failed, call `retryConflict.mutate(id)`.
    *   `Enter`: If focused row is a conflict, set `selectedConflictForDetail` (opens `ErrorDetailModal`).
    *   `/`: Set `isFilterFocused(true)`.
    *   `Esc` Priority Chain: 
        1. If modal open -> close modal.
        2. If `isFilterFocused` -> clear filter and unfocus.
        3. Else -> `pop()` current screen.

*   **Modals Integration**:
    *   Render `<ErrorDetailModal item={selectedConflictForDetail} onClose={() => setSelected(null)} />` absolutely positioned.
    *   Use `width={modalWidth}` from `useLayout()` to size modals correctly.

---

## Phase 4: Unit & Integration Tests

Create a comprehensive E2E test suite leveraging `@microsoft/tui-test` to validate rendering, snapshots, and keyboard behavior.

### `sync.test.ts`
*   **Path**: `e2e/tui/sync.test.ts`
*   **Setup**: Mock `@codeplane/ui-core` daemon API routes (`/api/daemon/status`, `/api/daemon/conflicts`).
*   **Snapshot Tests**:
    *   `SNAP-SYNC-001`: Default standard view (120x40). `expect(terminal.snapshot()).toMatchSnapshot()`.
    *   `SNAP-SYNC-002`: Minimum breakpoint (80x24). `terminal.resize(80, 24)` - verify truncation logic.
    *   `SNAP-SYNC-003`: Large breakpoint (200x60). `terminal.resize(200, 60)`.
    *   `SNAP-SYNC-004 to 007`: Status banner states (Online, Syncing, Error, Offline).
*   **Keyboard Interaction Tests**:
    *   `KEY-SYNC-001`: List navigation. `await terminal.sendKeys("j")`, assert reverse video on row 2.
    *   `KEY-SYNC-005`: Modal flow. Focus conflict -> `Enter` -> assert modal -> `Esc` -> assert closed.
    *   `KEY-SYNC-010`: Discard flow. Focus conflict -> `d` -> assert discard prompt -> `Enter` -> assert success toast.
    *   `KEY-SYNC-015`: Filter flow. `/` -> `POST` -> assert list filters -> `Esc` -> assert filter clears.
*   **Edge Case Tests**:
    *   `EDGE-SYNC-001`: Simulate `ERR_CONNECTION_REFUSED`, verify "Daemon not running" screen.
    *   `EDGE-SYNC-002`: Ensure `<scrollbox>` truncates gracefully at 200 items (scroll to bottom via `G`).