# Research Findings: Codeplane TUI Dashboard

This document synthesizes the existing codebase patterns, libraries, and utilities necessary for implementing the `tui-dashboard-screen` ticket in `apps/tui/src/screens/Dashboard/`.

## 1. OpenTUI UI Components & Primitives
The Codeplane TUI uses OpenTUI combined with React 19. OpenTUI components act as native React intrinsic elements rather than standard HTML elements:

*   **`<box>`**: The primary layout container, using flexbox-like properties.
    *   *Common props:* `flexDirection="row" | "column"`, `width="100%"`, `height={contentHeight}`, `flexGrow={1}`, `paddingX={1}`, `gap={2}`.
*   **`<text>` and `<span>`**: For rendering strings and text.
    *   *Common props:* `fg={theme.primary}` (sets the foreground ANSI color/hex).
*   *Note:* The TUI is fully terminal-driven (keyboard navigation, no mouse reliance, monospace fonts, custom block characters for loading indicators).

## 2. Shared Hooks & Context
### Layout & Theming
*   **`useLayout`** (`apps/tui/src/hooks/useLayout.ts`): Provides responsive screen dimensions derived from OpenTUI's `useTerminalDimensions`. Returns `{ width, height, contentHeight, breakpoint, sidebarVisible }`.
    *   `breakpoint`: `"large"` (> 200x60), `"standard"` (120x40 to 199x59), or `null` (< 80x24 unsupported).
    *   `contentHeight`: Automatically computed as `height - 2` (reserving 1 row for header, 1 for status bar).
*   **`useTheme`** (`apps/tui/src/hooks/useTheme.ts`): Provides stable, ANSI-compatible semantic colors:
    *   `theme.primary` (Blue 33)
    *   `theme.success` (Green 34)
    *   `theme.warning` (Yellow 178)
    *   `theme.error` (Red 196)
    *   `theme.muted` (Gray 245)

### Navigation & Interactions
*   **`useScreenKeybindings`** (`apps/tui/src/hooks/useScreenKeybindings.ts`): Standardizes key registration and populates the status bar hints. Usage:
    ```tsx
    useScreenKeybindings([
      { key: "Tab", description: "Next panel", group: "Navigation", handler: () => {} },
      { key: "Enter", description: "Open", group: "Actions", handler: () => {} }
    ], statusBarHints);
    ```

## 3. Data Integration (`@codeplane/ui-core`)
Per design specs and codebase constraints, the TUI delegates fetching and pagination to shared UI hooks from the `@codeplane/ui-core` package. The expected interface patterns for the Dashboard are:

*   `useUser()`: Returns `{ user: { username: string }, isLoading, error }`.
*   `useRepos({ perPage: 20 })`: Returns `{ items: RepoSummary[], totalCount, isLoading, error, refetch, loadMore }`.
*   `useStarredRepos({ perPage: 20 })`: Returns the user's starred repos.
*   `useOrgs({ perPage: 20 })`: Returns organizations associated with the user.
*   `useActivity(username, { perPage: 30, enabled: !!username })`: Fetches the activity feed.

## 4. Utilities & Helpers
*   **Typography:** The `apps/tui/src/util/truncate.ts` file exports essential utilities to prevent terminal overflow errors:
    *   `truncateText(text, maxWidth)`: Truncates from the right with `…`.
    *   `truncateLeft(text, maxWidth)`: Truncates from the left (ideal for breadcrumbs).
*   **Observability (`apps/tui/src/lib/logger.ts`):** Structured standard logging for the TUI instead of `console.log`.
    *   `logger.debug("message")`, `logger.info()`, `logger.warn()`, `logger.error()`.
*   **Telemetry (`apps/tui/src/lib/telemetry.ts`):** Event emission for analytics.
    *   `emit("tui.dashboard.viewed", { repos_count: 5, terminal_width: 120, layout: "grid" })`.

## 5. Directory Assessment
The dashboard ticket specification references dependencies such as `DashboardPanel.tsx`, `useDashboardFocus.ts`, and `PanelErrorBoundary.tsx`. Based on the current filesystem state, these exact dependencies have *not* yet been scaffolded in `apps/tui/src/screens/Dashboard/`. The orchestrator will require these to either be mocked or implemented concurrently to satisfy the screen compilation.