# Engineering Specification: TUI Workspace Detail View

## 1. Overview
The **TUI_WORKSPACE_DETAIL_VIEW** is the comprehensive, multi-tab workspace detail screen for the Codeplane TUI. It provides a terminal-native, keyboard-driven interface to view workspace metadata, connect via SSH, manage active sessions, and handle snapshots. It utilizes `@opentui/react` for terminal rendering and `@codeplane/ui-core` for data and SSE real-time updates.

## 2. Architecture & Components

The screen will be implemented as a stack-based navigation target, composed of a parent container (`WorkspaceDetailScreen`) and child components for each tab.

### 2.1 Component Structure
*   **`WorkspaceDetailScreen`** (`apps/tui/src/screens/workspaces/WorkspaceDetailScreen.tsx`): The entry point. Handles `useWorkspace` data fetching, global screen keybindings, `useSSE` subscriptions for status changes, and tab state management (0: Overview, 1: SSH, 2: Sessions, 3: Snapshots).
*   **`WorkspaceHeader`** (`apps/tui/src/components/workspaces/WorkspaceHeader.tsx`): Renders the workspace name (wrapping), live SSE status badge (with `braille` spinner for transitional states), and the responsive metadata row.
*   **`WorkspaceTabBar`** (`apps/tui/src/components/workspaces/WorkspaceTabBar.tsx`): Renders the 4 tabs, handling active visual states and abbreviations based on `useLayout().breakpoint`.
*   **Tabs**:
    *   `OverviewTab`: Key-value grid for configuration, live `uptime` counter, and quick-action hints.
    *   `SSHTab`: Renders `<code>` block for the SSH command. Includes local state for token visibility toggle (`v`).
    *   `SessionsTab`: Implements `<ScrollableList>` for sessions. Handles `c` (create session form) and `D` (destroy confirmation modal).
    *   `SnapshotsTab`: Implements `<ScrollableList>` for snapshots. Handles `c` (create snapshot form) and `D` (delete confirmation modal).

### 2.2 Data Layer & State
*   **Hooks**: Consumes `useWorkspace`, `useWorkspaceSSHInfo`, `useWorkspaceSessions`, `useWorkspaceSnapshots` from `@codeplane/ui-core`.
*   **SSE**: Connects to the PG LISTEN/NOTIFY channel via `useSSE("workspace_status_" + workspaceID.replace(/-/g, ''))`. Dispatches updates to the local workspace status state.
*   **Tab State**: `const [activeTab, setActiveTab] = useState<number>(0)`. Each tab encapsulates its own lazy-loading logic.
*   **Modals**: Uses `ModalSystem` (`<ConfirmDialog>`, `<SessionCreateForm>`, `<SnapshotCreateForm>`) to overlay input/confirmation without losing the background screen context.

## 3. Implementation Plan

### Phase 1: Core Scaffolding & Routing
1.  **Register Screen**: Add `WorkspaceDetail` to `screenRegistry` in `apps/tui/src/navigation/registry.ts`, requiring `workspaceID` and `repo` context.
2.  **Screen Scaffold**: Create `apps/tui/src/screens/workspaces/WorkspaceDetailScreen.tsx`.
3.  **Data Fetching**: Wire up the `useWorkspace` hook. Implement a full-screen loading spinner (`<LoadingSpinner text="Loading workspace..." />`) and a 404/Error boundary using standard TUI components.

### Phase 2: Header & SSE Integration
1.  **Build `WorkspaceHeader`**: Implement the title text (bold, wrapping) and the status badge.
2.  **Status Badge Logic**: Map API status strings to `theme.success`, `theme.warning`, `theme.error`, and `theme.muted`. Implement a `useTimeline` hook (OpenTUI) to drive the braille spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) at 100ms intervals for transitional states (`starting`, `stopping`, `resuming`, `suspending`).
3.  **SSE Hook**: Add `useSSEChannel('workspace.status', handleStatusChange)` to update the status badge optimistically and trigger status bar flashes ("Workspace is now {status}").

### Phase 3: Tab Navigation System
1.  **Build `WorkspaceTabBar`**: Create a flex row of `<text>` elements. Use `useLayout()` to abbreviate labels at the 80x24 breakpoint (e.g., "1:Ovrvw").
2.  **Screen Keybindings**: Use `useScreenKeybindings` to bind:
    *   `Tab`/`Shift+Tab` to cycle `activeTab` with wrap-around.
    *   `1`, `2`, `3`, `4` to jump to specific tabs.
    *   `h`, `l` for adjacent navigation (no wrap).
    *   `q` to pop the screen.

### Phase 4: Tab Implementations
1.  **Overview Tab**:
    *   Implement layout using `<box flexDirection="column">`.
    *   Add a live ticker for uptime using `useEffect` with `setInterval` (1000ms) to update elapsed duration when `status === 'running'`.
    *   Implement keybindings `s` (suspend), `r` (resume), and `D` (delete workspace). Attach optimistic UI states (change to `suspending`/`resuming`) and error fallbacks.
2.  **SSH Tab**:
    *   Lazy fetch `useWorkspaceSSHInfo` when tab is active AND status is `running`.
    *   Display `ssh -p {port} {username}@{host}` inside a `<code>` block.
    *   Implement token masking `••••••••••••` and `v` keybinding to toggle state.
    *   Implement `y` keybinding to copy to clipboard (with TUI fallback notification).
3.  **Sessions Tab**:
    *   Implement `<ScrollableList>` passing session data. Handle pagination (`fetchMore` at 80% scroll).
    *   Responsive columns: hide Dimensions and Idle Timeout at `< 120` width.
    *   Bind `c` to open `<SessionCreateFormModal>`, `D` to open `<ConfirmDialog>` for deletion.
4.  **Snapshots Tab**:
    *   Implement `<ScrollableList>` for snapshots with pagination.
    *   Bind `c` to open `<SnapshotCreateFormModal>` (validating `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`), `D` to open `<ConfirmDialog>`.

### Phase 5: Polish & Error Handling
1.  **Responsive Layout Updates**: Add resize handlers via `useLayout()` to correctly wrap names, collapse metadata rows to just owner + status, and resize modals (90% width at minimum vs 60% at standard).
2.  **Status Bar Hints**: Dynamically update `useStatusBarHints` based on the current `activeTab` and `workspace.status`.

## 4. Unit & Integration Tests

All tests target `e2e/tui/workspaces.test.ts` using `@microsoft/tui-test`.

### 4.1 Terminal Snapshot Tests
*   `SNAP-WDET-001`: Render complete 120x40 Overview tab (Running state, full metadata, tabs, config, actions).
*   `SNAP-WDET-002`: Render 80x24 compact mode (abbreviated tabs, truncated metadata, wrapped name).
*   `SNAP-WDET-004-009`: Render individual status badges correctly (Green `[running]`, Yellow `[suspended]`, Red `[error]`, Muted `[deleted]`).
*   `SNAP-WDET-015`: Render SSH tab correctly, verifying `<code>` block framing and masked token text.
*   `SNAP-WDET-018`: Render Sessions tab with `<ScrollableList>`, reverse video on focused row.

### 4.2 Keyboard Interaction Tests
*   `KEY-WDET-005-008`: Simulate `Tab` and `Shift+Tab`. Assert tab index changes and visual active state updates correctly.
*   `KEY-WDET-009`: Simulate `1`, `2`, `3`, `4`. Assert jump to exact tab views.
*   `KEY-WDET-013-014`: Focus Overview. Simulate `s` when running (assert optimistic `[suspending]` state). Simulate `s` when suspended (assert error flash).
*   `KEY-WDET-017-020`: Simulate `D`. Assert confirmation modal opens. Simulate `Esc` to cancel, then `D` followed by `y` to confirm.
*   `KEY-WDET-030-031`: Focus SSH Tab. Simulate `v`. Assert token string replaces `••••••••••••`. Simulate `v` again to re-mask.

### 4.3 Data Loading & SSE Tests
*   `DATA-WDET-002-005`: Verify lazy loading. Navigating to SSH tab triggers the SSH fetch; navigating to Sessions triggers the sessions fetch.
*   `DATA-WDET-016-017`: Verify SSE stream. Emit a mock `workspace.status` payload. Assert badge dynamically updates without user interaction.
*   `DATA-WDET-023-024`: Handle 404 cleanly with specific text "Workspace not found" and `q` prompt.

### 4.4 Responsive Resize Tests
*   `RESIZE-WDET-001-003`: Launch at 120x40. Call `resize(80, 24)`. Assert session table drops the "Idle Timeout" and "Dimensions" columns dynamically.