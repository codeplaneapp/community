# Implementation Plan: TUI Workspace Detail View

This document outlines the step-by-step implementation plan for the `TUI_WORKSPACE_DETAIL_VIEW` feature. It focuses on building a robust, multi-tab terminal interface using `@opentui/react` and `@codeplane/ui-core`, integrating real-time SSE updates, keyboard-first navigation, and responsive layouts.

## Phase 1: Core Routing & Scaffolding

### 1.1 Update Router Registry
**File:** `apps/tui/src/router/registry.ts`
*   **Action:** Modify the `WorkspaceDetail` entry.
*   **Changes:**
    *   Set `requiresRepo: true` to ensure the screen inherits repository context from the navigation stack.
    *   Replace `PlaceholderScreen` with `WorkspaceDetailScreen` (imported lazily or directly).
    *   Ensure the breadcrumb label correctly truncates the workspace ID (e.g., `p.workspaceId.slice(0, 8)`).

### 1.2 Scaffold Main Screen Component
**File:** `apps/tui/src/screens/workspaces/WorkspaceDetailScreen.tsx`
*   **Action:** Create the parent container for the detail view.
*   **Changes:**
    *   Implement the standard `ScreenComponentProps` signature.
    *   Extract `workspaceId` and `repo` context from props/stack.
    *   Integrate the `useWorkspace` hook from `@codeplane/ui-core`.
    *   Handle loading states with `<FullScreenLoading text="Loading workspace..." />`.
    *   Handle 404/errors with `<FullScreenError>` and provide a `q` prompt to pop the screen.
    *   Setup local state for tab management: `const [activeTab, setActiveTab] = useState<number>(0)`.

## Phase 2: Header & SSE Integration

### 2.1 Workspace Header Component
**File:** `apps/tui/src/components/workspaces/WorkspaceHeader.tsx`
*   **Action:** Create the header layout.
*   **Changes:**
    *   Render the workspace name with `<text wrap="truncate">` or flex wrapping.
    *   Display key metadata (persistence, idle timeout) responsively based on `useLayout()`.

### 2.2 Status Badge & SSE Stream
**File:** `apps/tui/src/components/workspaces/WorkspaceStatusBadge.tsx`
*   **Action:** Build the real-time status indicator.
*   **Changes:**
    *   Map statuses to theme colors: `running` (success), `failed` (error), `suspended` (muted), transitional (warning).
    *   Use OpenTUI's `useTimeline` to drive a braille spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) at 100ms intervals for transitional states (`starting`, `stopping`, `suspending`, `resuming`).
    *   In `WorkspaceDetailScreen`, consume `useSSE("workspace_status_" + workspaceId.replace(/-/g, ''))` (when the SSE adapter is available) to optimistically patch the `workspace.status` state.

## Phase 3: Tab Navigation System

### 3.1 Tab Bar Component
**File:** `apps/tui/src/components/workspaces/WorkspaceTabBar.tsx`
*   **Action:** Create the visual tab selector.
*   **Changes:**
    *   Render a flex row of tabs: `0: Overview`, `1: SSH`, `2: Sessions`, `3: Snapshots`.
    *   Apply reverse video or `theme.primary` to the active tab.
    *   Use `useLayout().breakpoint` to abbreviate labels (e.g., `0: Ovrvw`) on `< 80x24` terminals.

### 3.2 Screen Keybindings
**File:** `apps/tui/src/screens/workspaces/WorkspaceDetailScreen.tsx`
*   **Action:** Implement global screen navigation.
*   **Changes:**
    *   Use `useScreenKeybindings` to bind:
        *   `Tab` / `Shift+Tab`: Cycle `activeTab` with wrap-around.
        *   `1`, `2`, `3`, `4`: Jump directly to a specific tab.
        *   `h`, `l`: Adjacent tab navigation (vim-style).
        *   `q`: Pop current screen.

## Phase 4: Tab Implementations

### 4.1 Overview Tab
**File:** `apps/tui/src/screens/workspaces/tabs/WorkspaceOverviewTab.tsx`
*   **Action:** Build the default configuration and action view.
*   **Changes:**
    *   Implement a key-value grid for metadata.
    *   Add a live uptime ticker using `useEffect` and `setInterval` (1000ms) active only when `status === 'running'`.
    *   Bind `s` (suspend), `r` (resume), and `D` (delete). Use `useOptimisticMutation` to instantly update the local status to `suspending`/`resuming` while waiting for the server/SSE.

### 4.2 SSH Tab
**File:** `apps/tui/src/screens/workspaces/tabs/WorkspaceSSHTab.tsx`
*   **Action:** Build the SSH connection info panel.
*   **Changes:**
    *   Lazy-load `useWorkspaceSSHInfo` only when the tab is active and the workspace is `running`.
    *   Render the connection command inside an OpenTUI `<code>` block.
    *   Implement token masking (`••••••••••••`) and bind the `v` key to toggle visibility.
    *   Bind the `y` key to copy the command to the system clipboard (with a TUI fallback notification).

### 4.3 Sessions Tab
**File:** `apps/tui/src/screens/workspaces/tabs/WorkspaceSessionsTab.tsx`
*   **Action:** Build the active sessions list.
*   **Changes:**
    *   Integrate `useWorkspaceSessions` with a `<ScrollableList>` component.
    *   Implement responsive columns: hide "Dimensions" and "Idle Timeout" when terminal width is `< 120`.
    *   Bind `c` to open a `<SessionCreateFormModal>` and `D` to open a `<ConfirmDialog>` for deletion.

### 4.4 Snapshots Tab
**File:** `apps/tui/src/screens/workspaces/tabs/WorkspaceSnapshotsTab.tsx`
*   **Action:** Build the snapshots list.
*   **Changes:**
    *   Integrate `useWorkspaceSnapshots` with a `<ScrollableList>`.
    *   Bind `c` to open a `<SnapshotCreateFormModal>` (validating names via regex) and `D` to open a deletion confirmation.

## Phase 5: Polish & Modals

### 5.1 Dynamic Status Bar Hints
**File:** `apps/tui/src/screens/workspaces/WorkspaceDetailScreen.tsx`
*   **Action:** Keep user hints context-aware.
*   **Changes:**
    *   Dynamically update the status bar keybindings array based on the `activeTab` and current `workspace.status` (e.g., only show `s: Suspend` if running, `v: Show Token` if on SSH tab).

### 5.2 Modals
**Files:** `apps/tui/src/components/workspaces/modals/*.tsx`
*   **Action:** Implement overlay forms and dialogs.
*   **Changes:**
    *   Use `<OverlayLayer>` and `<box position="absolute">` to render modals over the main screen.
    *   Ensure modal widths adapt using `useLayout()` (e.g., 90% at minimum size, 60% at standard).

## Phase 6: E2E Testing

### 6.1 Scaffold Test File
**File:** `e2e/tui/workspaces.test.ts`
*   **Action:** Create the test suite using `@microsoft/tui-test`.
*   **Changes:**
    *   Define workspace fixture data matching the `ui-core` types.
    *   Set up mock API responses for `/api/repos/:owner/:repo/workspaces/:id` and related endpoints.

### 6.2 Implement Test Cases
*   **Snapshots:**
    *   `SNAP-WDET-001`: 120x40 Overview tab rendering.
    *   `SNAP-WDET-002`: 80x24 abbreviated mode rendering.
    *   `SNAP-WDET-004-009`: Validate all status badge colors and spinner states.
    *   `SNAP-WDET-015`: Validate SSH tab `<code>` block and masked token.
*   **Interactions:**
    *   `KEY-WDET-005-009`: Validate `Tab`, `Shift+Tab`, and numeric key tab switching.
    *   `KEY-WDET-013-014`: Validate `s`/`r` optimistic state updates.
    *   `KEY-WDET-030-031`: Validate `v` key toggling token visibility.
*   **Data & Layout:**
    *   `DATA-WDET-002-005`: Verify lazy loading on tab switch.
    *   `RESIZE-WDET-001-003`: Validate responsive column dropping in the Sessions tab on terminal resize.