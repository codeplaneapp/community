# Implementation Plan: TUI Reusable ListComponent

This document outlines the step-by-step implementation plan for the reusable `ListComponent` in the Codeplane TUI, derived from the `tui-list-component` engineering specification.

## Step 1: Implement Keyboard Navigation Hook
**File**: `apps/tui/src/hooks/useKeyboardNavigation.ts`
- Build a hook to manage vim-style list navigation and focused item state.
- Define `focusedIndex` state, carefully clamping it between `[0, itemCount - 1]` or `-1` if empty.
- Map the following keybindings to focus transitions:
  - `j` / `down`: Move down 1 item.
  - `k` / `up`: Move up 1 item.
  - `G`: Jump to the last item.
  - `ctrl+d`: Move down by half `viewportHeight`.
  - `ctrl+u`: Move up by half `viewportHeight`.
  - `return` (Enter): Trigger the `onSelect(focusedIndex)` callback.
  - `space`: Trigger the `onToggleSelect(focusedIndex)` callback.
- Support an `isActive` predicate that dynamically enables/disables keybindings (useful when a search input is focused).
- Expose `jumpToTop` and `jumpToBottom` callback functions to allow custom `g g` wiring in screen-level go-to handlers.

## Step 2: Implement List Selection Hook
**File**: `apps/tui/src/hooks/useListSelection.ts`
- Create a generic hook for managing a `ReadonlySet<string>` of selected item IDs.
- Expose helper methods: `isSelected`, `toggle`, `selectAll`, `clearSelection`, and `selectedCount`.
- Utilize a provided `keyExtractor` to generate unique string IDs from generic items `T`.
- Ensure mutations generate a completely new `Set` reference to properly trigger React re-renders.

## Step 3: Create Presentational Empty State
**File**: `apps/tui/src/components/ListEmptyState.tsx`
- Implement a simple, centered component to display when the list data array is empty.
- Leverage the existing `useLayout` hook for `contentHeight` and `useTheme` for the semantic `muted` color token.
- Render an OpenTUI `<text>` component utilizing `TextAttributes.DIM` formatting.

## Step 4: Create Row Wrapper Component
**File**: `apps/tui/src/components/ListRow.tsx`
- Build a flex-row OpenTUI `<box>` wrapper to encapsulate a single rendered list item.
- Conditionally render a primary-colored `●` indicator if the row is selected.
- Delegate actual text highlight rendering (reverse video) to child components, but use `<box>` structural rendering and background/focus props to manage context when a specific row is active.

## Step 5: Implement Main ListComponent
**File**: `apps/tui/src/components/ListComponent.tsx`
- Construct the core generic component composing `ListRow`s nested within an OpenTUI `<scrollbox>`.
- Integrate `useKeyboardNavigation` and `useListSelection`.
- Merge the navigation bindings with any provided `extraBindings` and register them via `useScreenKeybindings`.
- Calculate the 80% focus threshold to invoke `onEndReached` for seamless pagination and data prefetching.
- Create a ref to the `<scrollbox>` element. Update `scrollTop` imperatively inside a `useEffect` whenever `focusedIndex` changes to ensure the focused row remains visible in the viewport.
- Conditionally render the existing `<PaginationIndicator>` below the scrollbox if `paginationStatus` is `loading` or `error`.
- Delegate specific row content to the provided `renderItem` prop, supplying it with the item data and its focus state.

## Step 6: Update Barrel Exports
**Files**:
- `apps/tui/src/components/index.ts`
- `apps/tui/src/hooks/index.ts`
- Add standard export declarations for `ListComponent`, `ListRow`, `ListEmptyState`, `useKeyboardNavigation`, and `useListSelection` (along with their associated TypeScript interfaces).

## Step 7: Author End-to-End Tests
**File**: `e2e/tui/list-component.test.ts`
- Write comprehensive e2e tests utilizing `@microsoft/tui-test` and its PTY terminal runner.
- Include a `navigateToListScreen` helper routing to a standard list interface (e.g., Issues).
- Replicate the exact test groupings from the PRD spec:
  1. **Terminal Snapshot Tests**: Different terminal sizes (80x24, 120x40, 200x60) and empty states.
  2. **Keyboard Navigation Tests**: Validate `j/k`, `Down/Up`, `G`, `Ctrl+D/U`, and `Enter`. Ensure assertions check for the ANSI reverse video escape sequence `\x1b[7m`.
  3. **Multi-Select Tests**: Validating toggles via `Space` and bullet indicators.
  4. **Empty State Tests**: Verifying presentational rendering.
  5. **Pagination Tests**: Ensure loading triggers at the 80% focus boundary.
  6. **Focus Gating**: Confirm navigation inputs are ignored when search elements are focused.
  7. **Responsive Layout**: Validating content size resizing limits.
  8. **Screen Transitions**: Verify focus preservation on back navigations.
- Leave tests targeting unimplemented list screens in a failing state intentionally, conforming to repository testing policies. Do not skip or disable them.