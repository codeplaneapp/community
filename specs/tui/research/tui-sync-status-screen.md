# TUI Sync Status Screen — Codebase Research

Based on the Codeplane TUI PRD, OpenTUI component constraints, and current implementation details found in the `apps/tui` directory, here are the required patterns, hooks, and architectural context needed to implement the Sync Status screen.

## 1. Layout and Responsive Breakpoints (`useLayout`)

The spec requires responsive adaptations across three states: minimum, standard, and large. This logic is natively handled by the central `useLayout` hook.

*   **File**: `apps/tui/src/hooks/useLayout.ts`
*   **Usage**:
    ```tsx
    import { useLayout } from "../../hooks/useLayout.js";
    
    export function SyncStatusScreen() {
      const { breakpoint, width, contentHeight } = useLayout();
      // breakpoint is "minimum" | "standard" | "large" | null
      // fallback handling for null (unsupported) is handled by AppShell
    }
    ```
*   **Modal Sizing**: `useLayout` also provides `modalWidth` and `modalHeight` strings (e.g., `"60%"`, `"90%"`) which must be passed to the `<box>` width/height props for `<ErrorDetailModal>` and `<DiscardConfirmationModal>`.

## 2. Theme and Semantic Colors (`useTheme`)

The spec calls for mapping statuses to specific colors (warning, success, error). This should be strictly implemented using the `useTheme` hook, never hardcoded ANSI values.

*   **File**: `apps/tui/src/hooks/useTheme.ts`
*   **Tokens**: `primary`, `success`, `warning`, `error`, `muted`, `border`, `surface`.
*   **Usage**:
    ```tsx
    import { useTheme } from "../../hooks/useTheme.js";
    const theme = useTheme();
    
    // Examples:
    <text fg={theme.success}>● Online</text>
    <box borderColor={theme.border} backgroundColor={theme.surface}>
    ```

## 3. Keyboard Bindings (`useScreenKeybindings`)

The `SyncStatusScreen` must trap specific keys (`S`, `r`, `d`, `y`, `/`, `Enter`, `Esc`). The TUI framework manages this through a priority-based context provider.

*   **File**: `apps/tui/src/hooks/useScreenKeybindings.ts`
*   **Pattern**: 
    ```tsx
    import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
    
    useScreenKeybindings([
      { key: "S", description: "Force sync", group: "Actions", handler: () => forceSync.mutate() },
      { key: "d", description: "Discard", group: "Actions", handler: () => setDiscardModal(true) },
      { key: "/", description: "Filter", group: "Navigation", handler: () => setFilterActive(true) },
      { key: "r", description: "Refresh", group: "Actions", handler: () => refetch() },
    ]);
    ```
*   **Esc Priority**: Implement a prioritized escape handler. If a modal is open, close modal. If filter is focused, clear filter. Else `pop()` the screen.

## 4. UI Components and Primitives (OpenTUI)

All layout construction must rely strictly on `@opentui/react` primitives. The TUI does not use standard HTML elements.

*   **Layout**: `<box flexDirection="row" | "column" gap={1} border={true}>`
*   **Text**: `<text fg={theme.muted} bg={theme.primary}>`
*   **Input**: `<input value={filterQuery} onChange={setFilterQuery} focus={isFilterFocused} />`
*   **Scrolling lists**: `<scrollbox>` wrapping a `<box>` with multiple `<QueueItemRow>` children.

## 5. API Data Hooks (`@codeplane/ui-core`)

The `apps/tui/src/providers/APIClientProvider.tsx` defines a mock client, indicating that direct data dependencies might require local stubbing or wrapping for development. The engineering plans (`specs/tui/engineering/tui-sync-data-hooks.md`) specify the required signatures:

*   `useDaemonStatus({ pollingInterval: 3000, pauseWhenNotVisible: true })` returning `{ pid, port, dbMode, uptime, sync_status, pending_count, conflict_count, last_sync_at, remote_url, error, refetch }`
*   `useSyncConflicts()` returning a list/paginated result of sync queue items.
*   `useSyncForce()`, `useConflictResolve()`, `useConflictRetry()` returning `{ mutate, isPending }` semantics (React Query style).

*Note*: If these hooks are not fully implemented in the monorepo, you must stub their return types cleanly within the `SyncStatusScreen` integration phase so the UI renders against valid mock data during e2e testing.

## 6. End-to-End Testing (`e2e/tui/sync.test.ts`)

Tests are evaluated against `@microsoft/tui-test` using standard OpenTUI snapshotting patterns found in `e2e/tui/app-shell.test.ts`.
*   Mock the data responses via `Bun.serve` or by intercepting the hooks directly if required by the test framework.
*   Use `terminal.resize(80, 24)` to trigger the "minimum" breakpoint and verify column truncation logic in `SNAP-SYNC-002`.
*   Use `await terminal.sendKeys("j")` and `await terminal.sendKeys("Enter")` to navigate the scrollbox and verify modal mounting.