# Implementation Plan: tui-tabbed-detail-view

This implementation plan outlines the systematic development of the `TabbedDetailView` layout component for the Codeplane TUI, ensuring strict adherence to the provided Engineering Specification.

## Phase 1: Shared Types & Refactoring

1. **Create `apps/tui/src/types/breakpoint.ts`**
   - Define the `Breakpoint` type as `"minimum" | "standard" | "large"`.
   - Implement the `getBreakpoint(cols: number, rows: number): Breakpoint | "unsupported"` utility function to standardise layout logic across the TUI.

2. **Update `apps/tui/src/screens/Agents/types.ts`**
   - Remove the local `Breakpoint` type definition.
   - Re-export `Breakpoint` from `../../types/breakpoint.js`.

## Phase 2: State Management Hooks

1. **Create `apps/tui/src/hooks/useTabs.ts`**
   - Implement `useTabs` to manage tab visibility, current active tab, and track initial rendering (lazy loading signal).
   - Provide controller functions: `setActiveTab`, `cycleForward`, `cycleBackward`, `jumpToIndex`.
   - Support the `pushOnActivate` property to allow certain tabs (like Settings) to bypass internal content switching and immediately trigger navigation.

2. **Create `apps/tui/src/hooks/useTabScrollState.ts`**
   - Manage scroll offset and focus index per tab using a persistent `useRef<Map<string, TabScrollState>>`.
   - Provide handlers: `getScrollState`, `saveScrollState`, `resetScrollState`, `resetAll`.

3. **Create `apps/tui/src/hooks/useTabFilter.ts`**
   - Manage the `/` activation and `Esc` clearing logic via `isFiltering` boolean and `filterText` state.
   - Preserve `filterText` natively per tab by storing it in a Map during tab switching (`switchTab`).

4. **Update `apps/tui/src/hooks/index.ts`**
   - Create (or update) the barrel export for the `hooks` directory.
   - Export `useTabs`, `useTabScrollState`, `useTabFilter`, their return types, and constants like `FILTER_MAX_LENGTH`.
   - Retain existing exports (e.g., `useDiffSyntaxStyle`, `useNavigation`).

## Phase 3: Component Infrastructure

1. **Create `apps/tui/src/components/TabbedDetailView.types.ts`**
   - Define all core interfaces: `DetailBadge`, `DetailMetadataLine`, `TabScrollState`, `TabDefinition`, `TabContentContext`, `TabbedDetailViewProps`, and `TabbedDetailViewHandle`.
   - Import and re-export `Breakpoint` to maintain a clean public API for component consumers.

2. **Create `apps/tui/src/components/TabbedDetailView.test-helpers.ts`**
   - Export shared constants for tests: `TAB_LABEL_FORMATS`, `MAX_FILTER_LENGTH`, `MAX_ITEMS_PER_TAB`.
   - Export the `formatCount(count: number | null): string` utility function so tests can simulate exact label matching.

3. **Create `apps/tui/src/components/TabbedDetailView.tsx`**
   - Integrate OpenTUI elements: `<box>`, `<text>`, `<span>`, `<b>`, `<u>`, `<input>`, `<scrollbox>`.
   - Compose the internal `HeaderSection` sub-component to render the entity title, badge, wrapping description, and metadata.
   - Initialize `@opentui/react`'s `useTerminalDimensions()` and bind it to `getBreakpoint()`.
   - Implement the global `useKeyboard` handler, intercepting `/`, `Esc`, `Tab`, `Shift+Tab`, `1-9`, and `R` depending on the filter context and error state.
   - Construct the component layout ensuring unmounted tabs do not render, maintaining $O(1)$ switch cost.
   - Pass the resolved `TabContentContext` via the `renderContent` prop to dynamically render active tab lists.
   - Expose programmatic methods via `useImperativeHandle` matching the `TabbedDetailViewHandle` contract.

4. **Create `apps/tui/src/components/index.ts`**
   - Establish the component barrel file.
   - Export `TabbedDetailView`, `formatCount`, and all interfaces from `.types.js`.

## Phase 4: Validation & End-to-End Testing

1. **Create `e2e/tui/organizations.test.ts`**
   - Initialize the test file using `@microsoft/tui-test` and standard `bun:test` primitives.
   - Write SNAP/KEY/RSP/INT/EDGE test blocks matching the Engineering Spec exactly.
   - Assert tab rendering bounds across configurations (4-tabs vs. 2-tabs).
   - Provide simulation of responsive terminal resizes testing visibility constraints at `<80x24`, `80x24`, and `120x40` bounds.
   - Provide assertions for component state preservation including list scrolling, selection focusing, and filter text injection during switching.
   - Validate that `pushOnActivate` correctly prevents the active tab from switching visually.

2. **Run Full Test Suite**
   - Verify TypeScript compilation using `bunx tsc --noEmit`.
   - Ensure all layout interactions conform to standard TUI behavior and no regressions occur in previously implemented OpenTUI components.