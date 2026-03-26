# Implementation Plan: DiffScreen Component Shell (tui-diff-screen-scaffold)

This plan implements the structural shell for the `DiffScreen` component, serving as the foundation for the upcoming TUI diff viewer. It establishes the layout, state machine, data hook integration, loading/error states, and keybinding scopes.

## Phase 1: Dependency Stubs

Since downstream data hooks and types (`useChangeDiff`, `useLandingDiff`, `types/diff.ts`) do not yet exist, we must create minimal stubs to satisfy the TypeScript compiler. These will be replaced by the `tui-diff-data-hooks` ticket.

### 1.1 Create Diff Types Stub
**File:** `apps/tui/src/types/diff.ts`
- Define and export `FileDiffItem` interface (`path`, `change_type`).
- Define and export `LandingChangeDiff` interface (`file_diffs`).

### 1.2 Create Hook Stubs
**File:** `apps/tui/src/hooks/useChangeDiff.ts`
- Export a stub `useChangeDiff` that returns a mocked `{ isLoading: false, error: null, data: { file_diffs: [] }, refetch: () => {} }` object.

**File:** `apps/tui/src/hooks/useLandingDiff.ts`
- Export a stub `useLandingDiff` that returns a mocked `{ isLoading: false, error: null, data: { changes: [] }, refetch: () => {} }` object.

## Phase 2: DiffScreen Shell Core

### 2.1 Create DiffScreen Types
**File:** `apps/tui/src/screens/DiffScreen/types.ts`
- Define `DiffScreenParams` interface (`mode`, `change_id?`, `number?`, `owner`, `repo`).
- Define `FocusZone` type (`"tree" | "content"`).
- Implement and export `validateDiffParams(params)` returning a discriminated union (valid/invalid).

### 2.2 Create Data Hook Adapter
**File:** `apps/tui/src/screens/DiffScreen/useDiffData.ts`
- Import the stubbed `useChangeDiff` and `useLandingDiff` hooks.
- Implement `useDiffData` to normalize the response into a unified `DiffData` interface (flattening files for `landing` mode and providing a single `isLoading`, `error`, and `refetch` API).

### 2.3 Create Keybinding Builder
**File:** `apps/tui/src/screens/DiffScreen/keybindings.ts`
- Implement `buildDiffKeybindings(ctx)` returning an array of OpenTUI `KeyHandler` objects.
- Include handlers for `tab`, `]`, `[`, `j`, `k`, `t`, `w`, `x`, `z`.
- Implement conditional logic in `when` clauses for `focusZone === "content"`.
- Define and export `DIFF_STATUS_HINTS` to force explicit ordering of hints in the status bar (`j/k`, `]/[`, `t`, `w`, `Tab`, `x/z`).

## Phase 3: Component Implementation

### 3.1 Create DiffScreen Component
**File:** `apps/tui/src/screens/DiffScreen/DiffScreen.tsx`
- Import OpenTUI components (`<box>`, `<text>`).
- Import layout hooks (`useLayout`, `useTheme`, `useScreenKeybindings`, `useScreenLoading`).
- Implement the `DiffScreen` React component:
  - Perform parameter validation; render `DiffParamError` on failure.
  - Fetch data via `useDiffData`.
  - Manage `screenLoading` state; render `<FullScreenLoading>` or `<FullScreenError>` as needed.
  - Manage `focusZone`, `viewMode`, and `showWhitespace` state.
  - Automatically reset `focusZone` to `"content"` if the sidebar is hidden (via `useEffect`).
  - Register bindings using `useScreenKeybindings(buildDiffKeybindings(...), DIFF_STATUS_HINTS)`.
  - Render the three-zone flexible layout based on `layout.sidebarVisible` and `layout.sidebarWidth`.
- Implement `DiffParamError` (inline or in same file) for invalid params.
- Implement `DiffFileTreePlaceholder` (inline) to render the file tree skeleton.
- Implement `DiffContentPlaceholder` (inline) to render the diff content skeleton.

### 3.2 Create Barrel Export
**File:** `apps/tui/src/screens/DiffScreen/index.ts`
- Export `DiffScreen`.

## Phase 4: Registry Integration

### 4.1 Update Screen Registry
**File:** `apps/tui/src/router/registry.ts`
- Import `DiffScreen`.
- Update `ScreenName.DiffView` mapping to use `DiffScreen` instead of `PlaceholderScreen`.
- Update the `breadcrumbLabel` function to dynamically return `"Δ {change_id}"` (truncated to 12 chars) or `"!{number} diff"` based on the route params.

## Phase 5: E2E Testing

### 5.1 Append Tests to Suite
**File:** `e2e/tui/diff.test.ts`
- Append the following test suites using `@microsoft/tui-test` `launchTUI` helper:
  - **`TUI_DIFF_SCREEN_SCAFFOLD — screen registration`**: Verify component renders instead of placeholder.
  - **`TUI_DIFF_SCREEN_SCAFFOLD — breadcrumbs`**: Verify dynamic breadcrumb text generation in the header.
  - **`TUI_DIFF_SCREEN_SCAFFOLD — loading state`**: Verify spinner appearance and layout positioning.
  - **`TUI_DIFF_SCREEN_SCAFFOLD — error state`**: Verify API error rendering, parameter error rendering, and `R` retry keybinding.
  - **`TUI_DIFF_SCREEN_SCAFFOLD — layout`**: Verify sidebar visibility at `80x24`, `120x40`, and `200x60`. Verify `Ctrl+B` toggle.
  - **`TUI_DIFF_SCREEN_SCAFFOLD — focus zones`**: Verify `Tab` toggling, focus reset on sidebar collapse, and escape handling.
  - **`TUI_DIFF_SCREEN_SCAFFOLD — keybindings`**: Verify `t`, `w`, `?` (help overlay), and custom status bar hints.
  - **`TUI_DIFF_SCREEN_SCAFFOLD — view mode state`**: Verify unified/split state persistence across focus changes.

*(Note: Tests dependent on missing API endpoints will legitimately fail, fulfilling the requirement that tests failing due to unimplemented backends are left intact and failing.)*