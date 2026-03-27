# Implementation Plan: TUI_RESPONSIVE_LAYOUT (tui-nav-chrome-feat-04)

This document outlines the step-by-step implementation plan for ticket `tui-nav-chrome-feat-04`, integrating the responsive layout system into the Codeplane TUI application shell.

## Phase 1: Foundational Updates & Utilities

### Step 1.1: Update Text Utilities for Wide Characters
**File:** `apps/tui/src/util/text.ts`
- Add `getDisplayWidth(text: string): number` to compute display width accounting for CJK double-width characters.
- Implement `isDoubleWidth(code: number): boolean` to check Unicode ranges.
- Add `truncateToWidth(text: string, maxWidth: number): string` to safely truncate without splitting wide characters.
- Update existing truncation functions (`truncateBreadcrumb`, `truncateRight`) to use these new display-width-aware methods.

### Step 1.2: Extend Keybinding Types
**File:** `apps/tui/src/providers/keybinding-types.ts`
- Add an optional `longLabel?: string` property to the `StatusBarHint` interface to support descriptive labels at the `large` breakpoint.

### Step 1.3: Add Telemetry Stubs
**File:** `apps/tui/src/lib/telemetry.ts`
- Implement stub functions that log to `stderr` via the existing logger (if `CODEPLANE_TUI_DEBUG=true`).
- Add: `trackBreakpointInit`, `trackBreakpointChange`, `trackTerminalTooSmall`, `trackTerminalRestored`, `trackSidebarToggle`, `trackResize`, `trackSplitUnavailable`.

## Phase 2: Core Hooks

### Step 2.1: `useScreenHasSidebar`
**File:** `apps/tui/src/hooks/useScreenHasSidebar.ts`
- Create a hook that checks if the `currentScreen.screen` (from `useNavigation`) is in the set of sidebar-supporting screens (`RepoOverview`, `DiffView`, `Wiki`, `WikiDetail`).
- Export it from `apps/tui/src/hooks/index.ts`.

### Step 2.2: `useResponsiveColumns`
**File:** `apps/tui/src/hooks/useResponsiveColumns.ts`
- Create a hook that returns column definitions (`ListColumn[]`) based on the current breakpoint (e.g., hiding columns at `minimum`, showing all at `standard`/`large`).
- Define column sets for `issues` and `landings` lists.
- Export it from `apps/tui/src/hooks/index.ts`.

### Step 2.3: `useResponsiveDiffMode`
**File:** `apps/tui/src/hooks/useResponsiveDiffMode.ts`
- Create a hook to manage diff mode state (`unified` vs `split`).
- Enforce `unified` mode when the breakpoint is `minimum`.
- Provide context line counts and gutter widths per breakpoint.
- Export it from `apps/tui/src/hooks/index.ts`.

### Step 2.4: `useBreakpointTelemetry`
**File:** `apps/tui/src/hooks/useBreakpointTelemetry.ts`
- Create a hook that monitors breakpoint and dimension changes using `useLayout()`.
- Track transitions using `useRef` to emit the appropriate telemetry events (init, change, too-small, restored).
- Export it from `apps/tui/src/hooks/index.ts`.

## Phase 3: Global Keybindings & Global Layout

### Step 3.1: Wire Global Sidebar Toggle
**File:** `apps/tui/src/hooks/useGlobalKeybindings.ts`
- Add `onToggleSidebar` to the hook's accepted callbacks.
- Register `ctrl+b` in the bindings map pointing to this callback.

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`
- Add an `onToggleSidebar` handler.
- Ensure it acts as a no-op if `!hasSidebar` (via `useScreenHasSidebar`) or if `activeOverlay !== null` (via `useOverlay`).
- Call `layout.sidebar.toggle()` when valid.

### Step 3.2: Create `SidebarLayout` Component
**File:** `apps/tui/src/components/SidebarLayout.tsx`
- Create a component using OpenTUI's `<box flexDirection="row">`.
- Accept `sidebar` and `children` nodes.
- If `layout.sidebarVisible` is false, render only `children` at 100% width.
- If visible, render a left panel (width from `layout.sidebarWidth`, `maxWidth={60}`, with a `borderRight`) and main content (`flexGrow={1}`).

## Phase 4: App Shell Components Refinement

### Step 4.1: Update `TerminalTooSmallScreen`
**File:** `apps/tui/src/components/TerminalTooSmallScreen.tsx`
- Remove the `q` keybinding from the exit handler (leave only `Ctrl+C`).
- Update text format to exactly `(current: {cols}×{rows}, min: 80×24)`.
- Add a `Ctrl+C to quit` hint.

### Step 4.2: Enhance `HeaderBar`
**File:** `apps/tui/src/components/HeaderBar.tsx`
- Apply breakpoint-specific rendering:
  - **Minimum:** Truncate breadcrumbs severely (e.g., using `…`), hide repo context entirely, render notification badge as number only.
  - **Standard:** Normal truncation (up to 80 chars), show repo context, render badge with icon.
  - **Large:** No truncation limit.

### Step 4.3: Enhance `StatusBar`
**File:** `apps/tui/src/components/StatusBar.tsx`
- Adapt keybinding hint rendering by breakpoint:
  - **Minimum:** Show only the first hint and `? help`.
  - **Standard:** Show up to 6 hints and `? help`. Show sync status.
  - **Large:** Show all hints using `hint.longLabel ?? hint.label`.

### Step 4.4: Enforce Minimum Width in `OverlayLayer`
**File:** `apps/tui/src/components/OverlayLayer.tsx`
- Compute the pixel width based on `layout.modalWidth` percentage.
- If the computed width is less than 40 columns (min inner width) + borders, stretch the effective width to fill available space (`100% - 2` columns).

### Step 4.5: Integrate into `AppShell`
**File:** `apps/tui/src/components/AppShell.tsx`
- Integrate `useBreakpointTelemetry()`.
- Wrap the main content area in `SidebarLayout` dynamically if `useScreenHasSidebar()` is true (providing a placeholder sidebar). *Note: Screens will eventually take ownership of importing `SidebarLayout` directly, but this scaffold validates the integration.*

## Phase 5: E2E Testing

### Step 5.1: Create Test Suite
**File:** `e2e/tui/responsive-layout.test.ts`
- Use `@microsoft/tui-test` and the `launchTUI()` helper.
- Group into four `describe` blocks: `Snapshot Tests`, `Keyboard Interaction`, `Resize Tests`, `Integration Tests`.
- Implement all 48 tests defined in the engineering spec.
- **Snapshot tests:** Setup TUI at `80x24`, `120x40`, `200x60`, and `60x20` sizes to capture the header, status, sidebar visibility, modal width, list columns, and diff modes.
- **Keyboard tests:** Simulate `ctrl+b` (check sidebar toggle/no-op), `t` (diff split toggle), and navigation through size transitions.
- **Resize tests:** Simulate terminal resize (using `terminal.resize()`) to assert synchronous adjustments of modal sizing, sidebar auto-collapse/restore, text preservation, and scroll position retention.
- **Integration tests:** Ensure SSE streaming persists across resize, test go-to bindings at minimum width, error boundary constraints, and color retention.

*(Note: Tests that expect real screens (like `DiffView` or `RepoOverview`) to be fully populated may currently snapshot against placeholder states. These must be left to fail or snapshot the placeholder accurately until subsequent screen implementation tickets are completed.)*