# Engineering Specification: TUI_RESPONSIVE_LAYOUT (tui-nav-chrome-feat-04)

## Overview
This specification details the implementation of the breakpoint-driven responsive layout system for the Codeplane TUI. It handles dynamic terminal resizing, a "Terminal too small" fallback screen, adaptive layout dimensions (sidebar toggling, modal sizing), and content adaptation (truncation, column visibility, diff view constraints).

## Implementation Plan

### 1. Breakpoint & Responsive Hooks (`apps/tui/src/hooks/useLayout.ts`)
- **Implement `getBreakpoint(width: number, height: number): "minimum" | "standard" | "large" | null`**
  - `< 80x24` -> `null` (too small)
  - `< 120x40` -> `"minimum"`
  - `< 200x60` -> `"standard"`
  - `Otherwise` -> `"large"`
- **Implement `useLayout()` hook:**
  - Consume `useTerminalDimensions()` from `@opentui/react`.
  - Calculate and return `{ width, height, breakpoint, contentHeight: height - 2, diffContextLines, lineNumberGutterWidth, splitDiffAvailable, modalWidth, sidebarWidth }`.
- **Implement `useResponsiveValue<T>(values: { minimum: T, standard: T, large: T }): T | undefined`**
  - Return the appropriate generic value based on the current breakpoint.

### 2. Sidebar State Management (`apps/tui/src/providers/LayoutProvider.tsx`)
- Create `LayoutProvider` to manage global layout state.
- **Sidebar State Machine:**
  - `userPreference`: `boolean | null` (starts as `null`).
  - `autoOverride`: `boolean` (derived from breakpoint: `false` at `minimum`, `true` at `standard/large`).
  - `sidebarVisible`: derived as `userPreference !== null ? userPreference : autoOverride`.
- **Expose `toggleSidebar()`:**
  - Toggles `userPreference`. If `null`, sets to `!autoOverride`.
  - Disable toggling if a modal is currently open.

### 3. Terminal Too Small Screen (`apps/tui/src/components/TerminalTooSmall.tsx`)
- Create a pure fallback component.
- Display a centered, yellow (warning color) message: `Terminal too small`.
- Display a muted text sub-message: `(current: {width}x{height}, min: 80x24)`.
- Use a dedicated, high-priority `useKeyboard` hook (or OpenTUI equivalent) directly inside to map `Ctrl+C`, `Esc`, and `q` to process exit.

### 4. AppShell Enhancements (`apps/tui/src/components/AppShell.tsx`)
- Retrieve `breakpoint` from `useLayout()`.
- If `breakpoint === null`, render `<TerminalTooSmall />` and return early.
- Otherwise, render standard layout: `<HeaderBar />`, content area `<box flexGrow={1}>`, `<StatusBar />`, and `<OverlayLayer />`.

### 5. Sidebar Layout Component (`apps/tui/src/components/SidebarLayout.tsx`)
- Create `<SidebarLayout hasSidebar={boolean}>` component to wrap screen content.
- If `hasSidebar` and `sidebarVisible` are both true, render a flex row with a sidebar `<box width={sidebarWidth} flexShrink={0} maxWidth={60}>` and main content `<box flexGrow={1}>`.
- Register the `Ctrl+B` keybinding via `useScreenKeybindings()` to trigger `toggleSidebar()`. Note: No-op on screens without a sidebar.

### 6. Component Layout Adaptations
- **HeaderBar (`apps/tui/src/components/HeaderBar.tsx`):**
  - Implement a `truncateBreadcrumb(path, maxWidth)` helper that accounts for CJK/display-width.
  - At `"minimum"`, hide repo context, show notification number only. Truncate breadcrumbs from left with `…`.
- **StatusBar (`apps/tui/src/components/StatusBar.tsx`):**
  - At `"minimum"`, show only 1 keybinding hint + `? help`. Hide sync status.
  - Expand hint verbosity based on breakpoint.
- **Modals (`apps/tui/src/components/Modal.tsx`):**
  - Apply `modalWidth` (90% / 60% / 50%). Calculate inner character width; if `< 40`, stretch to `100% - 2` columns.
- **ScrollableList Columns (`apps/tui/src/components/ScrollableList.tsx`):**
  - Apply conditional visibility to metadata columns (Author, Labels, Timestamp, Comments) based on the breakpoint. Adjust fixed widths for `"standard"` vs `"large"`.
- **DiffViewer (`apps/tui/src/components/DiffViewer.tsx`):**
  - Enforce `"unified"` mode at `"minimum"`.
  - Override `t` keybinding at `"minimum"` to trigger a temporary status bar message (`"split unavailable at this size"`).

## Unit & Integration Tests

### Pure Function Tests
Create `apps/tui/src/hooks/__tests__/layout.test.ts` (or utilize existing structure):
- **BREAKPOINT_PURE_01-14**: Test `getBreakpoint()` across all edge dimensions (e.g., 79x24 -> `null`, 80x24 -> `"minimum"`, 120x40 -> `"standard"`, 200x60 -> `"large"`, 0x0 -> `null`).
- **SIDEBAR_PURE_01-08**: Test the sidebar visibility resolution matrix (`userPreference` vs `autoOverride`).
- **TRUNCATE_01-11**: Test `truncateText` and `truncateBreadcrumb` functions, including CJK and combining characters display width.

### E2E TUI Tests (`e2e/tui/app-shell.test.ts`)

**Terminal Snapshot Tests (`RESPONSIVE_SNAPSHOT_01-20`)**
- `renders minimum layout at 80x24`
- `renders standard layout at 120x40`
- `renders large layout at 200x60`
- `renders "terminal too small" at 60x20` (and edge bounds 79x24, 80x23, 79x23).
- Sidebar visibility tests at various boundaries for Sidebar screens.
- List view conditional column rendering.
- Modal dynamic percentage sizing & minimum inner width assertions.
- Unified-only Diff constraint at minimum size.

**Keyboard Interaction Tests (`RESPONSIVE_KEY_01-11`)**
- `Ctrl+B` toggles sidebar at 120x40.
- `Ctrl+B` forces show sidebar at 80x24.
- `Ctrl+B` no-op on non-sidebar screens or when Modal is open.
- Diff `t` toggle behavior shows rejection message at minimum, toggles at standard.
- Navigation (`j`/`k`) preservation across resize scenarios.
- Quit commands (`Ctrl+C` / `q`) successfully exit from `TerminalTooSmall`.

**Resize Validation Tests (`RESPONSIVE_RESIZE_01-16`)**
- Resize 120x40 -> 80x24 -> 120x40 successfully transitions breakpoints, auto-hides sidebar, and restores sidebar correctly.
- Resize preserving scroll position and focused element in `<ScrollableList>`.
- Modals re-centering and resizing properly.
- Input fields retaining cursor position.
- "Terminal too small" dynamically triggering on resize and recovering.

**Integration Tests (`RESPONSIVE_INTEGRATION_01-11`)**
- Navigation stack continuity throughout `<TerminalTooSmall>` recovery.
- SSE streams visually wrap/adapt without interruption.
- Deep links honoring initial terminal sizes.
- `?` Help overlay sizing bounds adapting exactly to breakpoints.
