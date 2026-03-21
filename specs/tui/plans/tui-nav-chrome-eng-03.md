# Implementation Plan: Responsive Layout Hooks (`tui-nav-chrome-eng-03`)

## Phase 1: Foundation (Types & Pure Functions)

### 1. Update `apps/tui/src/types/breakpoint.ts`
- Modify the `Breakpoint` type alias to only include `"minimum" | "standard" | "large"`.
- Refactor the `getBreakpoint` pure function to return `null` instead of `"unsupported"` when dimensions are below 80x24.
- Implement exhaustive OR logic threshold checks for "minimum", "standard", and "large" breakpoints ensuring fallback to the smaller tier if either dimension is insufficient.

### 2. Export Types in `apps/tui/src/types/index.ts`
- Create or update the barrel file to cleanly re-export the `Breakpoint` type and `getBreakpoint` function.

## Phase 2: Core Responsive Hooks

### 3. Create `apps/tui/src/hooks/useBreakpoint.ts`
- Import `useTerminalDimensions` from `@opentui/react`.
- Implement pure derivation using the updated `getBreakpoint` function.
- Wrap the derivation in a `useMemo` block to guarantee referential stability on unchanged dimension thresholds.

### 4. Create `apps/tui/src/hooks/useResponsiveValue.ts`
- Define the `ResponsiveValues<T>` interface requiring keys for `minimum`, `standard`, and `large`.
- Create the `useResponsiveValue<T>` hook that selects the correct generic value based on the current breakpoint.
- Handle the `null` breakpoint scenario by gracefully returning the `fallback` argument or `undefined`.

### 5. Create `apps/tui/src/hooks/useSidebarState.ts`
- Define the `SidebarState` interface encompassing `visible`, `userPreference`, `autoOverride`, and `toggle`.
- Implement the `resolveSidebarVisibility` pure function to determine visibility prioritizing breakpoint minimums and respecting user toggles otherwise.
- Build the hook using `useState` for explicit user overrides (`boolean | null`) and returning stable toggle callbacks.

## Phase 3: Composite Hook & Aggregation

### 6. Refactor `apps/tui/src/hooks/useLayout.ts`
- Enhance `LayoutContext` interface to match the engineering specification.
- Incorporate the newly minted `useSidebarState` to inform sidebar visibility (`sidebarVisible`, `sidebarWidth`).
- Construct pure helper functions for percentage calculations: `getSidebarWidth`, `getModalWidth`, and `getModalHeight`.
- Bind them all in a single `useMemo` block to minimize downstream redraws.

### 7. Update Hook Exports in `apps/tui/src/hooks/index.ts`
- Add named barrel exports for `useBreakpoint`, `useResponsiveValue`, `useLayout`, and `useSidebarState`.

## Phase 4: Integration & Consumption Refactors

### 8. Refactor `apps/tui/src/components/AppShell.tsx`
- Strip direct usages of `useTerminalDimensions()` and raw `getBreakpoint()` in favor of consuming `useLayout()`.
- Replace legacy `breakpoint === "unsupported"` string checks with falsy breakpoint checks (`!layout.breakpoint`).
- Guarantee the `TerminalTooSmallScreen` component is invoked using the new layout bounds.

### 9. Refactor Other Legacy Consumers
- Audit the codebase (e.g., `MessageBlock.tsx`, `TabbedDetailView.tsx`) to purge all residual dependencies on the `'unsupported'` sentinel string.
- Migrate relevant properties to the `useResponsiveValue` hook.

### 10. Update Keybindings Context
- Tie the `ctrl+b` keyboard shortcut explicitly to `layout.sidebar.toggle` within the `GlobalKeybindings` layer.

## Phase 5: Testing & Validation

### 11. Refactor Existing Tests in `e2e/tui/app-shell.test.ts`
- Hunt down old layout and boundary tests asserting the `'unsupported'` value and retrofit them to assert `null`.

### 12. Append 37 New Tests to `e2e/tui/app-shell.test.ts`
- Inject the 14 pure function boundary tests directly asserting `getBreakpoint` constraints.
- Inject the 6 `useResponsiveValue` logic tests leveraging `bunEval`.
- Inject the 7 pure function tests validating `resolveSidebarVisibility` logic.
- Inject the 1 specific computed value test for `useLayout` dimension calculation (`HOOK-LAY-030`).
- Inject the 5 new `RESP-SB-*` E2E sidebar toggle scenarios.
- Inject the 4 new `RESP-LAY-*` extended resize transition scenarios highlighting width modifications.

### 13. Execute Test Suite
- Launch `bun test e2e/tui/app-shell.test.ts` directly, confirming E2E snapshot comparisons successfully align with the new specifications. (Note: Preserve any failing tests strictly related to unimplemented backend capabilities as explicitly defined).