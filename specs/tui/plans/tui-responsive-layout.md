# Implementation Plan: TUI Responsive Layout System

**Ticket:** `tui-responsive-layout`

This implementation plan details the steps required to implement the responsive layout system for the Codeplane TUI, building upon the existing bootstrap and theming work. The changes will introduce breakpoints, a toggleable sidebar, and responsive adaptations across core components.

## Step 1: Extend Routing Definitions for Sidebar Support

**Target:** `apps/tui/src/router/types.ts`, `apps/tui/src/router/registry.ts`

1.  **`types.ts`**: Add `hasSidebar: boolean` to the `ScreenDefinition` interface.
2.  **`registry.ts`**: Update the `screenRegistry`. Set `hasSidebar: true` for `RepoOverview`, `DiffView`, `Wiki`, and `WikiDetail`. Set `hasSidebar: false` for all other screens.

## Step 2: Extend Layout Context with Responsive Values

**Target:** `apps/tui/src/hooks/useLayout.ts`

1.  Add new computed values to the `LayoutContext` interface: `maxBreadcrumbSegmentLength` (number), `diffContextLines` (number), `lineNumberGutterWidth` (number), and `splitDiffAvailable` (boolean).
2.  Implement helper functions `getDiffContextLines(breakpoint)`, `getLineNumberGutterWidth(breakpoint)`, and `isSplitDiffAvailable(breakpoint)` based on the engineering spec.
3.  Update the returned object in `useLayout` to include these new values.

## Step 3: Update Sidebar State Logic

**Target:** `apps/tui/src/hooks/useSidebarState.ts`

1.  Update `resolveSidebarVisibility`: At the `"minimum"` breakpoint, default to hidden but allow `userPreference === true` to force it visible (i.e., return `{ visible: userPreference === true, autoOverride: userPreference !== true }`).
2.  Update `toggle`: Remove the early return that prevents toggling at the `"minimum"` breakpoint. Instead, toggle `userPreference` explicitly between `true` and `false` if at `"minimum"`.

## Step 4: Create Display-Aware Text Utilities

**Target:** `apps/tui/src/util/text.ts`

1.  Implement `charDisplayWidth(char: string): number` to return `2` for wide CJK characters and `1` for standard ASCII characters.
2.  Implement `stringDisplayWidth(str: string): number`.
3.  Implement `truncateByDisplayWidth(text: string, maxWidth: number): string` to truncate safely without splitting wide characters, appending `…` when truncated.

## Step 5: Implement Telemetry and Breakpoint Lifecycle Logging

**Target:** `apps/tui/src/lib/telemetry.ts`, `apps/tui/src/hooks/useBreakpointLifecycle.ts`

1.  **`telemetry.ts`**: Create this file to define `TelemetryEvent` and functions like `emitBreakpointInit`, `emitBreakpointChange`, `emitTerminalTooSmall`, `emitSidebarToggle`, and `emitSplitUnavailable`. Use `logger.debug` to emit structured payloads.
2.  **`useBreakpointLifecycle.ts`**: Create a React hook `useBreakpointLifecycle(colorTier: string)` that utilizes `useBreakpoint()` and `useTerminalDimensions()` to detect changes. It should log changes (info/warn) and call the appropriate telemetry emit functions on initialization, resize, and breakpoint boundaries.

## Step 6: Create Sidebar Placeholder and Column Configurations

**Target:** `apps/tui/src/components/SidebarPlaceholder.tsx`, `apps/tui/src/components/ListColumnConfig.ts`, `apps/tui/src/components/DiffResponsive.ts`

1.  **`SidebarPlaceholder.tsx`**: Create a simple `<scrollbox>` with text indicating it's a placeholder, receiving `screen: ScreenName` as a prop.
2.  **`ListColumnConfig.ts`**: Create the `ColumnDef` interface and a `resolveColumns` function that returns visible columns based on the current breakpoint, applying large breakpoint overrides.
3.  **`DiffResponsive.ts`**: Implement `getDiffConstraints(breakpoint, terminalWidth)` returning an object with `splitAvailable`, `contextLines`, `gutterWidth`, `splitPaneWidth`, and `splitUnavailableMessage`.

## Step 7: Update App Shell to Render Sidebar

**Target:** `apps/tui/src/components/AppShell.tsx`

1.  Import and call `useBreakpointLifecycle(colorTier)` at the top.
2.  Import `useNavigation()` to determine the current screen.
3.  Read `currentDef.hasSidebar` from the screen registry.
4.  Update the layout structure: Wrap `{children}` in a flex-row box. If `layout.sidebarVisible` and `currentDef?.hasSidebar` are true, render the sidebar box (`maxWidth={60}`, `width={layout.sidebarWidth}`) containing `SidebarPlaceholder`, alongside the main content area.

## Step 8: Update Global Keybindings for Sidebar Toggle

**Target:** `apps/tui/src/hooks/useGlobalKeybindings.ts`, `apps/tui/src/components/GlobalKeybindings.tsx`

1.  **`useGlobalKeybindings.ts`**: Add `onSidebarToggle: () => void` to `GlobalKeybindingActions`. Register the `ctrl+b` keybinding with a `when` guard checking `!ctx.hasActiveModal()`.
2.  **`GlobalKeybindings.tsx`**: Implement the `onSidebarToggle` callback. Check if `currentDef?.hasSidebar` is true. If so, call `layout.sidebar.toggle()`.

## Step 9: Make HeaderBar Responsive

**Target:** `apps/tui/src/components/HeaderBar.tsx`

1.  Truncate individual breadcrumb segments to a maximum of 24 characters using `truncateByDisplayWidth` or standard truncation before joining them.
2.  Adjust logic for minimum breakpoints: Truncate breadcrumb trails from the left, hide repo context strings, and display the notification badge strictly as a number without text/icons.
3.  For large breakpoints, allow full un-truncated breadcrumbs.

## Step 10: Make StatusBar Responsive

**Target:** `apps/tui/src/components/StatusBar.tsx`

1.  At `"minimum"` breakpoint, slice `hints` to only show the first 1 hint and `? help`. Hide the sync status indicator.
2.  At `"standard"` breakpoint, show full hints and sync status.
3.  At `"large"` breakpoint, utilize expanded, descriptive label strings for hints if provided.

## Step 11: Create Layout Context Provider

**Target:** `apps/tui/src/providers/LayoutProvider.tsx`

1.  Create `LayoutProvider` utilizing `createContext` and exposing `useLayoutContext()`. This allows deeply nested components to access the layout state without recalculation overhead, falling back safely to `useLayout()` if necessary.
2.  Wrap the main app content in `LayoutProvider` inside `AppShell` or at the app root level.

## Step 12: Write Unit and E2E Tests

**Target:** `e2e/tui/app-shell.test.ts`

1.  Add pure function tests for Breakpoint classification (`getBreakpoint`), Sidebar state resolution (`resolveSidebarVisibility`), Column resolution (`resolveColumns`), Diff constraints (`getDiffConstraints`), and Text truncation (`truncateByDisplayWidth`).
2.  Add terminal snapshot tests (E2E) covering layout rendering at `80x24`, `120x40`, `200x60`, and "too small" bounds (`60x20`, `79x24`, `80x23`). Ensure snapshots reflect header/status bar adaptations.
3.  Add keyboard interaction tests validating that `Ctrl+B` toggles the sidebar successfully on valid screens, ignores input on modals, and ignores input on non-sidebar screens.
4.  Add resize behavior tests verifying sidebar auto-collapse logic on resize from standard to minimum and back, as well as testing modal adjustments on resize.
5.  Add integration tests validating colors and navigation flow between states.

All failing tests due to placeholders are acceptable and expected at this stage.
