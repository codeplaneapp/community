## Implementation Plan

### Phase 1: Sub-component Scaffolding

1.  **Create `apps/tui/src/screens/Sync/components/StatusBanner.tsx`**
    *   **Props**: `status` ("online" | "syncing" | "error" | "offline"), `remoteUrl` (string | null), `uptime` (string), `lastSyncAt` (string | null), `breakpoint` ("minimum" | "standard" | "large").
    *   **Logic**: Map `status` to theme semantic colors and text indicators (`● Online`, `◐ Syncing…`, `● Error`, `● Offline`).
    *   **Layout**: Return a `<box flexDirection="row">`. Use `<text>` components. Truncate `remoteUrl` using `...` depending on the `breakpoint`. If `breakpoint === "minimum"`, condense to a single line.

2.  **Create `apps/tui/src/screens/Sync/components/SyncQueueSummary.tsx`**
    *   **Props**: `pending` (number), `synced` (number), `conflict` (number), `failed` (number), `breakpoint` ("minimum" | "standard" | "large").
    *   **Logic**: Format counts (abbreviate >9999 as "9999+"). Map colors to text (`pending`: warning, `synced`: success, `conflict`/`failed`: error).
    *   **Layout**: If all zero, render "All clear — no pending items" in green. If `breakpoint === "minimum"`, stack horizontally/vertically without borders to save space. Otherwise, render a bordered box with a 2x2 grid or list.

3.  **Create `apps/tui/src/screens/Sync/components/ConnectionDetails.tsx`**
    *   **Props**: `pid` (number), `port` (number), `dbMode` (string), `remoteUrl` (string | null), `hasToken` (boolean).
    *   **Logic**: Display static/dynamic connection details. If `hasToken`, show "●●●●●●●● (configured)". If no `remoteUrl`, show "not configured".

4.  **Create `apps/tui/src/screens/Sync/components/QueueItemRow.tsx`**
    *   **Props**: `item` (QueueItem object), `isFocused` (boolean), `breakpoint` ("minimum" | "standard" | "large").
    *   **Logic**:
        *   Resolve status colors (warning for pending, success for synced, red bold for conflict/failed).
        *   Resolve truncation points based on breakpoint.
        *   `minimum`: status(3ch), method(6ch), path(remaining−6ch), timestamp(6ch). Error hidden.
        *   `standard`: status(8ch), method(7ch), path(45ch), local_id(12ch), error(remaining−6ch), timestamp(6ch).
        *   `large`: full columns, inline error.
    *   **Layout**: `<box flexDirection="row" bg={isFocused ? theme.primary : undefined}>`.

5.  **Create `apps/tui/src/screens/Sync/components/QueueFilter.tsx`**
    *   **Props**: `value` (string), `onChange` (fn), `isActive` (boolean).
    *   **Layout**: Renders a `<box>` at the top of the queue list containing an OpenTUI `<input>` if `isActive` is true, otherwise renders a placeholder `<text fg={theme.muted}>/ filter</text>`.

### Phase 2: Main Screen Integration (`SyncStatusScreen.tsx`)

1.  **Create `apps/tui/src/screens/Sync/SyncStatusScreen.tsx`**
    *   **Hooks**:
        *   `useLayout()` for terminal dimensions and breakpoints.
        *   `useTheme()` for color tokens.
        *   `useDaemonStatus({ pollingInterval: 3000, pauseWhenNotVisible: true })`
        *   `useSyncConflicts({ pollingInterval: 3000, pauseWhenNotVisible: true })`
        *   `useSyncForce()`, `useConflictResolve()`, `useConflictRetry()`.
    *   **State**:
        *   `filterQuery` (string) and `isFilterFocused` (boolean).
        *   Modal states: `selectedConflictForDetail`, `selectedConflictForDiscard`.
    *   **Layout Engine**:
        *   Header/Status bar context managed via layout provider or `BaseScreen` hook.
        *   Top panel: Render `StatusBanner`.
        *   Middle panel: Render `SyncQueueSummary` and `ConnectionDetails` in a split `<box>` (stack vertically if `breakpoint === "minimum"`, side-by-side 40/60 if standard/large).
        *   Bottom panel: Render `QueueFilter` and `ScrollableList`.
            *   Provide `items={filteredConflicts}` (slice to max 200 items).
            *   `renderItem={(item, focused) => <QueueItemRow item={item} isFocused={focused} breakpoint={breakpoint} />}`.
    *   **Empty/Error States**:
        *   If `useDaemonStatus` returns connection refused, render a centered `<text>`: "Daemon not running. Start with `codeplane daemon start`."
        *   If `filteredConflicts.length === 0` and `filterQuery` is empty, render: "No sync queue items."

### Phase 3: Keyboard and Action Wiring

1.  **Bind Keyboard Actions in `SyncStatusScreen.tsx`**
    *   Use `useScreenKeybindings(bindings)` hook from architecture:
        *   `r`: Call `refetch()` on both status and conflicts queries.
        *   `S`: Call `forceSync.mutate()`. Setup `onSuccess` to trigger a toast ("Synced N items...") and `onError` to trigger an error toast. Prevent firing if `isSyncing` or `pending === 0`.
        *   `d`: If focused item is conflict, set `selectedConflictForDiscard` to open `DiscardConfirmationModal`.
        *   `y`: If focused item is failed/conflict, call `retryConflict.mutate(id)`. Optimistically update row status.
        *   `Enter`: If focused item is conflict/failed, set `selectedConflictForDetail` to open `ErrorDetailModal`.
        *   `/`: Set `isFilterFocused` to true.
        *   `Esc`: Priority chain check: (1) if modal open, close it, (2) if filter active, clear and blur filter, (3) call `pop()`.

2.  **Integrate Modals**
    *   Mount `<ErrorDetailModal item={selectedConflictForDetail} onClose={() => setSelected(...)} onDiscard={...} onRetry={...} />`.
    *   Mount `<DiscardConfirmationModal item={selectedConflictForDiscard} onConfirm={...} onClose={...} />`.

### Phase 4: Constants & Utilities

1.  **Helper logic in `SyncStatusScreen.tsx`**:
    *   Create a local filter function: `items.filter(i => i.method.includes(q) || i.path.includes(q) || i.status.includes(q))` case-insensitive.
    *   Format relative time for `lastSyncAt`.

## Unit & Integration Tests

Create `e2e/tui/sync.test.ts` focusing on `@microsoft/tui-test` snapshots and keyboard interactions.

1.  **Setup and Scaffolding**
    *   Mock `@codeplane/ui-core` daemon API routes locally in the test fixtures.
    *   Provide mocked responses for `/api/daemon/status` and `/api/daemon/conflicts`.

2.  **Snapshot Tests (SNAP-SYNC-001 to SNAP-SYNC-028)**
    *   Launch TUI using `launchTUI({ cols: 120, rows: 40 })`, navigate via `g y`.
    *   Assert default view (`expect(terminal.snapshot()).toMatchSnapshot()`).
    *   Resize terminal to 80x24 via `terminal.resize(80, 24)` and capture `SNAP-SYNC-002`.
    *   Resize terminal to 200x60 via `terminal.resize(200, 60)` and capture `SNAP-SYNC-003`.
    *   Inject specific daemon status responses to test banner states (Online, Syncing, Error, Offline).

3.  **Keyboard Interaction Tests (KEY-SYNC-001 to KEY-SYNC-035)**
    *   List Navigation: `await terminal.sendKeys("j")`, assert `getLine()` shows reverse video on row 2. `await terminal.sendKeys("k")`.
    *   Actions: Focus a conflict item, `await terminal.sendKeys("Enter")`, assert modal text appears. Close with `Esc`.
    *   Discard flow: `await terminal.sendKeys("d")`, assert confirmation. `await terminal.sendKeys("Enter")`, assert success toast.
    *   Retry flow: `await terminal.sendKeys("y")`, assert status updates to pending immediately.
    *   Filter flow: `await terminal.sendKeys("/")`, `await terminal.sendText("POST")`, assert list is filtered. `await terminal.sendKeys("Esc")`, assert filter clears.
    *   Force Sync: `await terminal.sendKeys("S")`, assert spinner appears on status banner, await toast message.

4.  **Responsive Layout Tests (RESP-SYNC-001 to RESP-SYNC-012)**
    *   Verify column truncation using regex on terminal lines at 80x24 vs 120x40.
    *   Assert that `ConnectionDetails` moves from side-by-side to stacked when width is reduced.

5.  **Integration & Edge Case Tests (INT-SYNC-001 to EDGE-SYNC-014)**
    *   Simulate a 401 response from the daemon API and verify `codeplane auth login` error screen pushes.
    *   Simulate connection refused (`ERR_CONNECTION_REFUSED`) to verify "Daemon not running" full screen text.
    *   Verify that `r` (refresh) fetches updated status data.
    *   Fill the queue with 200 items, scroll to bottom via `G`, verify truncation works.