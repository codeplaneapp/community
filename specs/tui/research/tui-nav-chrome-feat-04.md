# Research Findings: TUI_RESPONSIVE_LAYOUT (tui-nav-chrome-feat-04)

## 1. Existing Infrastructure

The TUI codebase has an existing structure that provides the foundation for responsive layout:

- **Breakpoints**: Defined in `apps/tui/src/types/breakpoint.ts`. `getBreakpoint()` currently returns `"minimum"`, `"standard"`, `"large"`, or `null` for unsupported terminals.
- **Layout Hooks**: `useLayout.ts`, `useBreakpoint.ts`, `useSidebarState.ts`, and `useResponsiveValue.ts` are fully implemented.
  - `useLayout.ts` returns a `LayoutContext` encompassing dimensions, breakpoint, `contentHeight`, `sidebarVisible`, `modalWidth`, `modalHeight`, and `sidebar` state.
  - `useSidebarState.ts` computes sidebar visibility by combining user preference and terminal width auto-collapse at `"minimum"` breakpoint.
- **App Shell Components**: `AppShell.tsx`, `HeaderBar.tsx`, `StatusBar.tsx`, `OverlayLayer.tsx`, and `TerminalTooSmallScreen.tsx` are partially implemented and need specific breakpoint adaptations.
- **Routing**: `apps/tui/src/router/types.ts` defines `ScreenName` (e.g., `RepoOverview`, `DiffView`, `Wiki`) which will be used in the new `useScreenHasSidebar.ts` hook.
- **Keybindings**: `apps/tui/src/providers/keybinding-types.ts` handles the keyboard interactions and status bar hints.
- **Telemetry**: `apps/tui/src/lib/telemetry.ts` provides a basic `emit()` function that logs to stderr if `CODEPLANE_TUI_DEBUG=true`.

## 2. Component Enhancements Needed

### AppShell.tsx
Currently renders `HeaderBar`, `children`, `StatusBar`, and `OverlayLayer`. It needs to wrap `children` in the new `SidebarLayout` conditionally using a new hook `useScreenHasSidebar()`.

### HeaderBar.tsx
Currently truncates breadcrumbs to a maximum width but misses the logic for extended breakpoint adaptations.
- `minimum`: Truncate breadcrumb, hide repo context, notification badge shows number only.
- `standard`: Full breadcrumb up to 80 chars, repo context centered, connection indicator.
- `large`: No truncation limit.

### StatusBar.tsx
Currently checks `breakpoint !== "minimum"` to toggle hint visibility. 
- Needs to render only the first hint and `? help` at `minimum`.
- Needs to show extended descriptive labels at `large` breakpoint.
- To support this, `StatusBarHint` in `apps/tui/src/providers/keybinding-types.ts` must be extended with an optional `longLabel`.

### OverlayLayer.tsx
Currently uses `layout.modalWidth/Height`. Needs a minimum inner width enforcement of 40 columns and stretching to `100% - 2` if the terminal is too narrow.

### TerminalTooSmallScreen.tsx
Currently maps both `q` and `Ctrl+C` to quit. Needs to be restricted to `Ctrl+C` only and update its display string format to match `(current: {cols}×{rows}, min: 80×24)` and show `Ctrl+C to quit`.

### GlobalKeybindings.tsx & useGlobalKeybindings.ts
Needs an `onToggleSidebar` action mapped to `ctrl+b`. Must be guarded by `useScreenHasSidebar()` and active `activeOverlay` checks.

## 3. New Additions Needed

### `SidebarLayout.tsx`
Needs to be created to render a horizontal split layout using OpenTUI's `<box flexDirection="row">`. Max width of 60 columns for the sidebar.

### `useScreenHasSidebar.ts`
A new hook verifying if `currentScreen.screen` (from `useNavigation`) is in a predefined set (`RepoOverview`, `DiffView`, `Wiki`, `WikiDetail`).

### `useResponsiveColumns.ts`
A hook returning standard column sets (`ListColumn[]`) adapted to the current breakpoint (for issue lists, landing lists, etc).

### `useResponsiveDiffMode.ts`
A hook to constrain diff view modes based on the breakpoint. At minimum, only unified mode should be available.

### `useBreakpointTelemetry.ts` & telemetry updates
`telemetry.ts` needs specialized logging stubs (`trackBreakpointInit`, `trackBreakpointChange`, `trackTerminalTooSmall`, `trackTerminalRestored`, `trackSidebarToggle`, `trackResize`, `trackSplitUnavailable`). These will be used in `useBreakpointTelemetry` inside `useLayout.ts` or `AppShell.tsx` to detect and track resize events using a `useRef` to compare previous states.

### Text Utilities (`util/text.ts`)
Add `getDisplayWidth()` and `truncateToWidth()` that account for CJK double-width characters (e.g., using `isDoubleWidth` checks), to safely truncate breadcrumbs and status texts without splitting wide characters.