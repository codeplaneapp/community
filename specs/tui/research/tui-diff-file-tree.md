# TUI_DIFF_FILE_TREE Context Research Document

Based on exploration of the repository, here are the detailed findings regarding the current state of the application architecture and relevant hooks that affect the `TUI_DIFF_FILE_TREE` feature implementation.

## 1. Directory Structure Status

- **`apps/tui/src/`**: Exists and contains a robust scaffolding of existing TUI hooks, providers, components, and layout utilities. However, the exact `screens/DiffScreen/` and `types/diff.ts` modules are not present in this workspace snapshot, indicating that prerequisite tickets (`tui-diff-screen-scaffold` and `tui-diff-data-hooks`) either have not been checked in or are represented by stub architectures in the design specs.
- **`packages/ui-core/`**: Not found in the monorepo root. TUI data hooks usually originate from here, but we will rely strictly on the `FileDiffItem` type definition described in the engineering spec.
- **`apps/ui/src/`**: Not found in the monorepo root.
- **`context/opentui/`**: Contains the OpenTUI core implementations and React bindings (`@opentui/react`).

## 2. Layout & Sidebar Patterns

### `apps/tui/src/hooks/useSidebarState.ts`
The TUI currently leverages `useSidebarState` for centralized breakpoint auto-collapse rules. 
- Uses `resolveSidebarVisibility(breakpoint, userPreference)`.
- **Required Changes:** The `resolveSidebarVisibility` logic correctly hides the sidebar by default at the `minimum` breakpoint but currently does not allow overriding it via `userPreference`. The spec mandates modifying this to allow `userPreference === true` to forcibly open the sidebar at `minimum`.

### `apps/tui/src/hooks/useLayout.ts`
The application responds to terminal dimension changes without debouncing via `useLayout`.
- It exports `LayoutContext` with properties like `contentHeight`, `sidebarVisible`, and `sidebarWidth`.
- **Required Changes:** The `getSidebarWidth` function explicitly sets the sidebar to `0%` when hidden, `30%` at `large`, and `25%` at `standard`. For `minimum`, we must return `"30%"` when toggled to `visible` instead of falling back to default or `0%`.

## 3. Keybindings Architecture

### `apps/tui/src/hooks/useScreenKeybindings.ts`
Keybinding registration is done via `useScreenKeybindings(bindings, hints)`.
- It utilizes a centralized `KeybindingContext` and registers scopes using `PRIORITY.SCREEN`.
- It allows passing a `when()` guard predicate on `KeyHandler` definitions (from `keybinding-types.ts`), which is perfectly aligned with our need to selectively apply file-tree keybindings like `j`, `k`, `G` only when `focusZone === "tree" && !searchActive`.
- Status bar hints are extracted automatically from the first 8 bindings' descriptions or passed as explicit `StatusBarHint` entries.

## 4. Theme & Styling

### `apps/tui/src/hooks/useTheme.ts`
- Returns a stable, frozen `ThemeTokens` object mapping semantic color roles to string values suitable for OpenTUI text styling (e.g., `theme.primary`, `theme.muted`, `theme.success`, `theme.error`, `theme.warning`). 
- We will use these theme references in the `DiffFileTreeEntry` and `DiffFileTreeSummary` to represent semantic focus states and file stat colors.

## 5. E2E Testing Context

### `e2e/tui/diff.test.ts`
- The test file uses `@microsoft/tui-test` imported from `./helpers.ts` (providing `launchTUI` and `TERMINAL_SIZES`).
- Uses standard Jest/Vitest style `describe` and `test` blocks.
- Existing tests like `TUI_DIFF_SYNTAX_HIGHLIGHT` assert on terminal golden snapshots using `expect(terminal.snapshot()).toMatchSnapshot()` and keyboard interactions using `await terminal.sendKeys(...)`.
- Our new 74 tests for file-tree snapshots, key interactions, responsive layouts, and integration will comfortably append to this file, relying on the same `launchTUI({ cols: X, rows: Y })` patterns.

## 6. OpenTUI Component Usage

- OpenTUI's `<box>`, `<scrollbox>`, `<text>`, and `<input>` primitives are widely utilized across the application shell.
- `<scrollbox>` manages internal overflow, enabling the `scrollOffset` state from `useFileTreeState` to properly window the rendered file nodes, as required by the 500-file cap limitation in the product specs.