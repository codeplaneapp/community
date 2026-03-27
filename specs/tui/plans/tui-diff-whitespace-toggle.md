# Implementation Plan: TUI_DIFF_WHITESPACE_TOGGLE

## 1. Context & Discrepancies Addressed

- **StatusBar Composition**: Currently, `apps/tui/src/components/StatusBar.tsx` hardcodes the right-side layout. It will be refactored to accept a `rightSlot` or `children` prop to support injecting custom segments like `WhitespaceIndicator`.
- **Telemetry**: The spec calls `trackEvent(name, properties)`. However, research shows `apps/tui/src/lib/telemetry.ts` exports `emit(name, properties)`. The implementation will use `emit()`.
- **Logging**: The spec uses `log.info("name", { properties })`. Since `apps/tui/src/lib/logger.ts` only accepts a single string argument, the implementation will stringify the properties: `logger.info("name " + JSON.stringify(properties))`.
- **Missing Dependencies**: `apps/tui/src/screens/Diff` and `apps/tui/src/hooks/useDiffData.ts` (along with caching and `@codeplane/ui-core` diff hooks) may not exist yet or are stubbed. The implementation will proceed by scaffolding these targets where missing. E2E tests failing due to unimplemented backends will remain failing per project constraints.

## 2. Step-by-Step Implementation

### Step 1: Refactor StatusBar
**File:** `apps/tui/src/components/StatusBar.tsx`
- Add an optional `rightSlot?: React.ReactNode` prop to the `StatusBarProps` interface.
- Update the internal flex layout to render `{rightSlot}` immediately before the `? help` hint.

### Step 2: Create Core State Hook
**File:** `apps/tui/src/hooks/useWhitespaceToggle.ts`
- Implement the state machine returning `{ whitespaceVisible, ignoreWhitespace, isPending, toggle }`.
- Use `useState` for `whitespaceVisible`, `ignoreWhitespace`, and `isPending`.
- Use `useRef` to store the timer ID and `useEffect` to `clearTimeout` on unmount.
- Implement the 300ms debounce inside the `toggle` callback, setting `isPending` to true during the window.

### Step 3: Create Presentational Components
**File:** `apps/tui/src/components/WhitespaceIndicator.tsx`
- Import `useTerminalDimensions` and `useTheme`.
- Conditionally render `[ws: visible]` / `[ws: hidden]` or abbreviated versions (`ws:vis` / `ws:hid`) depending on whether `width < 120`.
- Use `theme.muted` for visible and `theme.warning` for hidden.

**File:** `apps/tui/src/components/WhitespaceEmptyState.tsx`
- Build an OpenTUI `<box>` taking up available space with `flexGrow={1}`, centered vertically and horizontally.
- Render the two specific lines of `<text>` ("No visible changes (whitespace hidden)." and "Press w to show whitespace.") using `theme.muted` and `theme.primary`.

### Step 4: Adapt Data Fetching Hook
**File:** `apps/tui/src/hooks/useDiffData.ts`
- Expose `useDiffData(params, ignoreWhitespace)`.
- Ensure `opts = { ignore_whitespace: ignoreWhitespace }` is correctly passed to `useChangeDiff` or `useLandingDiff`.
- Safely extract `isRefetching` to drive the inline loading state in the TUI.

### Step 5: Update Diff Content & Tree Components
**File:** `apps/tui/src/screens/Diff/DiffContentArea.tsx`
- Update `DiffContentAreaProps` to accept `isRefetching: boolean`.
- Before rendering the diff content, add conditional logic: if `isRefetching` is true, render an inline `<box>` displaying `<text color={theme.muted}>Updating diff…</text>` at the top of the container.

**File:** `apps/tui/src/screens/Diff/DiffFileTree.tsx`
- Update `DiffFileTreeProps` to accept `whitespaceVisible: boolean`.
- Ensure the file count header reflects the pre-filtered `files.length` passed via props.
- Handle empty state explicitly: if `files.length === 0`, render `<text color={theme.muted}>(empty)</text>`.

### Step 6: Compose DiffScreen
**File:** `apps/tui/src/screens/Diff/DiffScreen.tsx`
- Tie together `useWhitespaceToggle` and `useDiffData`.
- Define keybindings utilizing `useScreenKeybindings`: assign `w` to `toggleWhitespace()` with a `canToggleWhitespace()` guard returning `true` only when `screenState === 'loaded'`.
- Emit telemetry using `emit("tui.diff.whitespace_toggled", { ... })`.
- Issue logs utilizing `logger.info("diff.whitespace.toggled " + JSON.stringify({...}))`.
- Use `useEffect` to reset `hunkCollapse` states back to expanded and `focusedFileIndex` to 0 whenever `ignoreWhitespace` changes (indicating a completed re-fetch).
- Inject `WhitespaceIndicator` into the status bar's `rightSlot` or context-based status bar component.
- Process error scenarios (e.g., 401, 429, timeouts) explicitly within `useEffect` hooks, preserving previous screen contents and providing relevant UI feedback for non-auth errors.

### Step 7: Apply E2E Tests
**File:** `e2e/tui/diff.test.ts`
- Append the designated test suites (`TUI_DIFF_WHITESPACE_TOGGLE — snapshots`, `keyboard interactions`, `responsive behavior`, `data integration`, `edge cases`) using `@microsoft/tui-test`.
- Ensure terminal emulation parameters dynamically set columns and rows via `launchTUI({ cols, rows })` exactly as required.
- Acknowledge that the tests will remain failing until the core backend data APIs and `DiffScreen` stubs are finalized.
