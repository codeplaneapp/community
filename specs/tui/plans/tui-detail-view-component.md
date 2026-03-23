# Implementation Plan: TUI DetailView Component

## 1. Overview
Implement a reusable `DetailView` component to serve as the foundational layout abstraction for all entity detail screens in the Codeplane TUI (e.g., issues, landings, workspaces). This involves creating a scrollable container with composable headers, titled sections, and robust keyboard-driven navigation.

## 2. Step-by-Step Implementation

### Step 1: Create `hooks/useDetailNavigation.ts`
**File Path**: `apps/tui/src/hooks/useDetailNavigation.ts`
- Implement a pure React hook that manages section focus index and scroll state.
- Define callbacks for scrolling (`onScroll`, `onPageScroll`) and section jumping (`onScrollToSection`).
- Provide `Tab`/`Shift+Tab` handling for section cycling, and `1-9` handling for direct section jumps.
- Provide `j/k` and `Ctrl+D`/`Ctrl+U` handlers for viewport scrolling.
- Wrap all handlers with an `isActive` predicate to allow screens to disable navigation when inputs or overlays are focused.
- Return `bindings` (an array of `KeyHandler` objects) and `hints` for status bar display.

### Step 2: Create `components/DetailSection.tsx`
**File Path**: `apps/tui/src/components/DetailSection.tsx`
- Build a titled section component using OpenTUI `<box>` and `<text>` primitives.
- Display the section title in bold text, optionally followed by an `[N]` index hint.
- Conditionally highlight the title using `theme.primary` when `focused` is true.
- Render a Unicode box-drawing underline (`─`) separator that dynamically adapts to the terminal width using `useLayout().width`.
- Assign `sectionId` to the root box to allow `scrollbox.scrollChildIntoView()` targeting.

### Step 3: Create `components/DetailHeader.tsx`
**File Path**: `apps/tui/src/components/DetailHeader.tsx`
- Build a composable header displaying an entity title, an optional status badge, and optional metadata.
- Use `statusToToken` from `apps/tui/src/theme/tokens.ts` to map API states to semantic colors.
- Render a metadata row of key-value pairs (e.g., `Author: alice`). Use `useLayout().breakpoint` to layout horizontally in standard/large sizes, or wrap vertically at the minimum breakpoint.

### Step 4: Create `components/DetailView.tsx`
**File Path**: `apps/tui/src/components/DetailView.tsx`
- Implement the main container using OpenTUI's `<scrollbox>` component.
- Establish a `scrollboxRef` and translate intents from `useDetailNavigation` into `scrollbox.scrollBy()` and `scrollbox.scrollChildIntoView()` calls.
- Use `useLayout().contentHeight` to restrict the scrollbox to the available vertical area.
- Render the `header` slot, an array of `DetailSection` items, and an optional `footer` slot.
- Wire up `useScreenKeybindings(bindings, hints)` to register the navigation keys at the SCREEN priority level.

### Step 5: Update Barrel Exports
**File Paths**:
- `apps/tui/src/components/index.ts`: Export `DetailView`, `DetailSection`, `DetailHeader`, and their corresponding prop interfaces.
- `apps/tui/src/hooks/index.ts`: Export `useDetailNavigation` and its interfaces.

### Step 6: Create E2E Tests
**File Path**: `e2e/tui/detail-view.test.ts`
- Create end-to-end tests using `@microsoft/tui-test` via the `launchTUI()` test helper.
- **Rendering**: Assert that bold titles, index hints, and underline separators are correctly rendered.
- **Scrolling**: Simulate `j`/`k` and `Ctrl+D`/`Ctrl+U` keystrokes and verify the content changes via snapshot diffs.
- **Navigation**: Simulate `Tab`, `Shift+Tab`, and `1-9` keys and assert `scrollChildIntoView` brings the right sections into view.
- **Responsiveness**: Use `TERMINAL_SIZES` to capture responsive snapshots at minimum (80x24), standard (120x40), and large (200x60) terminal dimensions.
- *Note*: Tests targeting unimplemented backends (e.g. `issue-detail`) should be left failing if the backend or specific screen implementation does not yet exist. Do not skip or mock.

## 3. Productionization Checklist
- [ ] **Type Safety**: Ensure strict typings and interfaces. Use `any` for `scrollboxRef` only if `@opentui/react` lacks types, adding a `// TODO: type scrollbox ref` comment.
- [ ] **Performance**: Memoize `bindings` and callbacks in `useDetailNavigation` to prevent unnecessary re-renders. Avoid per-render string allocations for the separator.
- [ ] **Accessibility & UX**: Verify section focus is visually identifiable. Ensure status bar hints correctly reflect available keybindings.
- [ ] **Edge Cases**: Gracefully handle 0 or 1 sections, missing header/footer, and very long titles.