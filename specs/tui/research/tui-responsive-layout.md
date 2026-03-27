# Research Findings: TUI Responsive Layout System (`tui-responsive-layout`)

This document provides comprehensive research on the current state of the Codeplane TUI codebase as it relates to the `tui-responsive-layout` ticket. It identifies existing implementations, gaps, and exact files that require modification according to the engineering specification.

## 1. Routing & Screen Definitions

### `apps/tui/src/router/types.ts`
- **Current State:** The `ScreenDefinition` interface defines `component`, `requiresRepo`, `requiresOrg`, and `breadcrumbLabel`.
- **Gap:** Missing the `hasSidebar: boolean` flag required to determine if a screen should render the sidebar layout.

### `apps/tui/src/router/registry.ts`
- **Current State:** Exports `screenRegistry` mapping every `ScreenName` to a `ScreenDefinition`. Currently, all screens use `PlaceholderScreen`.
- **Gap:** Every entry in `screenRegistry` needs to be updated to include `hasSidebar`. According to the spec, `RepoOverview`, `DiffView`, `Wiki`, and `WikiDetail` should be `true`, while all others should be `false`.

## 2. Layout & State Hooks

### `apps/tui/src/hooks/useLayout.ts`
- **Current State:** Provides a robust `LayoutContext` returning `width`, `height`, `breakpoint`, `contentHeight`, `sidebarVisible`, `sidebarWidth`, `modalWidth`, `modalHeight`, and `sidebar` state.
- **Gap:** `LayoutContext` lacks the required extended responsive values: `maxBreadcrumbSegmentLength`, `diffContextLines`, `lineNumberGutterWidth`, and `splitDiffAvailable`.

### `apps/tui/src/hooks/useSidebarState.ts`
- **Current State:** `resolveSidebarVisibility` correctly handles basic auto-collapse. However, at the `"minimum"` breakpoint, it currently forces `{ visible: false, autoOverride: true }` regardless of `userPreference`. The `toggle` function also acts as a no-op if `autoOverride` is true.
- **Gap:** The product spec requires that at minimum size, the sidebar starts hidden but the user CAN force-show it via `Ctrl+B` (as an overlay/push). `resolveSidebarVisibility` and `toggle` must be updated to respect a `true` user preference even at the `"minimum"` breakpoint.

## 3. Global Keybindings

### `apps/tui/src/hooks/useGlobalKeybindings.ts`
- **Current State:** Registers core fallback keys (`q`, `escape`, `ctrl+c`, `?`, `:`, `g`).
- **Gap:** Missing the `onSidebarToggle` action and the `ctrl+b` key descriptor.

### `apps/tui/src/components/GlobalKeybindings.tsx`
- **Current State:** Binds actions to `useNavigation()` and `process.exit()`. Passes callbacks to `useGlobalKeybindings`.
- **Gap:** Needs a new `onSidebarToggle` callback that checks if the current screen has a sidebar (`currentDef?.hasSidebar`) before invoking `layout.sidebar.toggle()`.

## 4. App Shell & Components

### `apps/tui/src/components/AppShell.tsx`
- **Current State:** Checks for `layout.breakpoint` (rendering `TerminalTooSmallScreen` if null) and then renders a simple vertical flexbox with `HeaderBar`, `{children}`, `StatusBar`, and `OverlayLayer`.
- **Gap:** Does not render a sidebar. It needs to be updated to read `useNavigation()` to determine if the current screen supports a sidebar, and if so, render a split layout containing `SidebarPlaceholder` and the main `{children}`.

### `apps/tui/src/components/HeaderBar.tsx`
- **Current State:** Truncates the entire breadcrumb string to fit the screen. Displays the notification count next to a bell icon (if > 0).
- **Gap:** Needs responsive logic to truncate individual segments exceeding 24 characters, show full un-truncated breadcrumbs at the `"large"` breakpoint, and hide the repo context and bell icon text at the `"minimum"` breakpoint.

### `apps/tui/src/components/StatusBar.tsx`
- **Current State:** Uses `breakpoint !== "minimum"` to toggle between a limited (4) and full set of hints.
- **Gap:** Needs to be updated to show only 1 hint at `"minimum"`, full hints at `"standard"`, extended descriptive labels at `"large"`, and explicitly hide the sync status at `"minimum"`.

### `apps/tui/src/components/OverlayLayer.tsx`
- **Current State:** Uses `layout.modalWidth` and `layout.modalHeight` (percentage strings like `"60%"`) directly as `width` and `height` props for the absolute box.
- **Gap:** Works as designed, but the spec requires a min inner width guard (e.g., stretching to absolute columns if the terminal is very narrow but technically still meets the minimum breakpoint dimensions). This guard needs to be implemented or ensured via OpenTUI's sizing constraints.

## 5. Text Utilities

### `apps/tui/src/util/text.ts`
- **Current State:** Provides standard string truncation (`truncateRight`, `fitWidth`, `truncateText`, `truncateBreadcrumb`) based on `string.length`.
- **Gap:** Lacks handling for Unicode wide characters (CJK). Needs `charDisplayWidth`, `stringDisplayWidth`, and `truncateByDisplayWidth` functions to ensure strings are truncated correctly visually without splitting wide characters.

## 6. Telemetry & Lifecycle Logging

- **Current State:** No dedicated telemetry or breakpoint lifecycle hooks exist.
- **Gap:** The spec requires `useBreakpointLifecycle.ts` and `lib/telemetry.ts` to log and emit events (`tui.responsive.breakpoint_init`, `tui.responsive.breakpoint_change`, etc.) which should be mounted in `AppShell`.

## 7. Placeholder Implementations

- **Missing Files:** The following files need to be scaffolded as infrastructure for downstream tickets:
  - `apps/tui/src/components/SidebarPlaceholder.tsx`
  - `apps/tui/src/components/ListColumnConfig.ts`
  - `apps/tui/src/components/DiffResponsive.ts`

## 8. E2E Tests

### `e2e/tui/app-shell.test.ts`
- **Current State:** Contains extensive tests for the package scaffold, TypeScript compilation, color detection, theme tokens, and basic layout structure.
- **Gap:** The specific `TUI_RESPONSIVE_LAYOUT` tests detailed in the engineering spec (e.g., `RESPONSIVE_SNAPSHOT_01`, `RESPONSIVE_KEY_01`, pure function tests for column resolution and diff constraints) need to be appended to this file.