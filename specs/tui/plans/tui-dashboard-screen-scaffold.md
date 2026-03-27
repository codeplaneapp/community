# Implementation Plan: TUI Dashboard Screen Scaffold

This document outlines the step-by-step implementation plan for the `tui-dashboard-screen-scaffold` ticket. It establishes the default Dashboard screen in the Codeplane TUI, replacing the placeholder, and registers it with the routing and keybinding systems.

## Step 1: Create the Dashboard Screen Component

**Target File**: `apps/tui/src/screens/Dashboard/index.tsx`

Create a new directory for the Dashboard screen and add the `index.tsx` component. This component will serve as the default root screen for the TUI. It will use OpenTUI layout primitives (`<box>`, `<text>`), consume layout and theme hooks, and register basic status bar hints.

**Implementation Details**:
1. Import `React`, `ScreenComponentProps`, `useScreenKeybindings`, `useLayout`, `useTheme`, `KeyHandler`, and `StatusBarHint` from their respective paths in `apps/tui/src/`.
2. Define a minimal set of `keybindings` containing a placeholder `r` key for navigation (to be implemented in future tickets).
3. Define `statusBarHints` for global affordances: `g` (go-to), `:` (command), and `?` (help).
4. Export a `DashboardScreen` functional component that:
   - Retrieves `layout` and `theme` via hooks.
   - Registers keybindings and hints using `useScreenKeybindings`.
   - Returns a full-width, full-height `<box>` containing a welcome message ("Welcome to Codeplane") styled with `theme.muted`.

## Step 2: Update the Screen Registry

**Target File**: `apps/tui/src/router/registry.ts`

Wire the new `DashboardScreen` into the TUI's routing system, replacing the generic `PlaceholderScreen`.

**Implementation Details**:
1. Replace the import of `PlaceholderScreen` (for the Dashboard) with `DashboardScreen` from `../screens/Dashboard/index.js`.
2. Update the `[ScreenName.Dashboard]` entry in `screenRegistry` to use `component: DashboardScreen`.
3. Retain the existing metadata (`requiresRepo: false`, `requiresOrg: false`, `breadcrumbLabel: () => "Dashboard"`).

## Step 3: Export the Dashboard Screen

**Target File**: `apps/tui/src/screens/index.ts`

Update the screens barrel file to re-export the new `DashboardScreen`. This establishes a clean module boundary for tests and other consumers.

**Implementation Details**:
1. Remove the empty `export {};` if present.
2. Add `export { DashboardScreen } from "./Dashboard/index.js";`.

## Step 4: Implement End-to-End Tests

**Target File**: `e2e/tui/dashboard.test.ts`

Create comprehensive E2E tests using `@microsoft/tui-test` to verify the scaffold across rendering, layout, navigation, and keybinding integration.

**Implementation Details**:
1. Setup the test file with `bun:test` imports and TUI test helpers (`launchTUI`, `TERMINAL_SIZES`, `createMockAPIEnv`).
2. Add a `afterEach` hook to ensure the terminal instance is terminated.
3. Group tests logically using `describe`:
   - **Module Scaffold**: Verify the module exists, the barrel exports it, and the registry maps correctly (Tests SNAP-DASH-001, 002, 003).
   - **Default Launch**: Launch the TUI at standard, minimum, and large sizes. Verify the breadcrumb shows "Dashboard", welcome text renders, and it correctly sits at stack depth 1 (Tests SNAP-DASH-010 to 013, INT-DASH-001, 002).
   - **Header & Status Bar**: Verify breadcrumb rendering and status bar hints (`g:go-to`, `?:help`) (Tests SNAP-DASH-020, 021, 030, 031).
   - **Keyboard Interaction**: Test standard exit keys (`q`, `ctrl+c`). Include the `g d` go-to test (KEY-DASH-003) which will intentionally fail until the go-to mode is fully implemented in a dependency ticket (leave as failing per spec).
   - **Responsive Layout**: Resize the terminal during runtime to ensure the `<box>` layout recalculates without crashing (Tests RESP-DASH-001 to 004).
   - **Navigation Integration**: Verify deep linking without `--screen` args resolves to Dashboard, and the placeholder text is absent (Tests INT-DASH-010 to 012).

## Step 5: Verify TypeScript Compilation

After creating and modifying the necessary files, ensure there are no type errors across the TUI codebase.

**Action**:
Run the TypeScript compiler (`tsc --noEmit`) within the project to validate that `DashboardScreen` satisfies the `ScreenComponentProps` constraint in the registry and that all imports are correct.