# Implementation Plan: `useLayout` Hook with Breakpoint Detection

**Ticket:** `tui-layout-hook`
**Target:** `apps/tui/src/hooks/useLayout.ts`
**Tests:** `e2e/tui/app-shell.test.ts`

## 1. Overview
This plan details the steps to implement the `useLayout` hook. This hook will centralize responsive layout decisions in the Codeplane TUI, replacing ad hoc `useTerminalDimensions()` and `getBreakpoint()` queries with memoized, pre-computed layout values (e.g., `sidebarVisible`, `modalWidth`, `contentHeight`).

## 2. Implementation Steps

### Step 1: Create Types Barrel Export
**File:** `apps/tui/src/types/index.ts`
- Create the file to serve as a centralized export for layout types.
- Export `getBreakpoint` and `Breakpoint` from `breakpoint.ts` using `.js` extensions.
  ```typescript
  export { getBreakpoint } from "./breakpoint.js";
  export type { Breakpoint } from "./breakpoint.js";
  ```

### Step 2: Implement `useLayout` Hook
**File:** `apps/tui/src/hooks/useLayout.ts`
- Create the file.
- Import `useMemo` from `react` and `useTerminalDimensions` from `@opentui/react`.
- Import `getBreakpoint` and `Breakpoint` from `../types/breakpoint.js`.
- Define the `LayoutContext` interface containing `width`, `height`, `breakpoint`, `contentHeight`, `sidebarVisible`, `sidebarWidth`, `modalWidth`, and `modalHeight`.
- Implement pure helper functions `getSidebarWidth`, `getModalWidth`, and `getModalHeight` that take a `Breakpoint | "unsupported"` and return the appropriate percentage string.
- Implement the `useLayout` hook:
  - Call `useTerminalDimensions()` to get `width` and `height`.
  - Use `useMemo` with dependencies `[width, height]` to compute and return the `LayoutContext`.
  - Calculate `contentHeight` as `Math.max(0, height - 2)` to reserve space for the header and status bars.
  - Calculate `sidebarVisible` as `breakpoint !== "minimum" && breakpoint !== "unsupported"`.

### Step 3: Export Hook from Barrel
**File:** `apps/tui/src/hooks/index.ts`
- Add exports for `useLayout` and `LayoutContext` to make them available to the rest of the application:
  ```typescript
  export { useLayout } from "./useLayout.js";
  export type { LayoutContext } from "./useLayout.js";
  ```

### Step 4: Add Tests to App Shell Test Suite
**File:** `e2e/tui/app-shell.test.ts`
- Append pure function unit tests for `getBreakpoint` covering "unsupported", "minimum", "standard", and "large" boundary conditions and OR logic.
- Append hook integration tests using `bunEval` from test helpers to verify the hook's computed values (`contentHeight`, `sidebarVisible`, `sidebarWidth`, `modalWidth`, `modalHeight`) without requiring a full TUI launch.
- Append E2E responsive layout tests using `@microsoft/tui-test` (via `launchTUI` helper) to run the full TUI at various dimensions. Verify snapshot matches, "Terminal too small" messages at unsupported sizes, resize behavior, and layout structural constraints.
- Append edge case tests (e.g., `contentHeight` flooring at 0, extremely large terminals, negative dimensions, and boundary logic).
- *Note: Leave tests that fail due to missing target components (like `AppShell`, `HeaderBar`, `StatusBar`) failing, adhering to the project's test failure policy.*

## 3. Post-Implementation Verification
- Run TypeScript compilation to ensure no type errors and that module resolution (using `.js` extensions) succeeds.
- Execute `e2e/tui/app-shell.test.ts` to ensure the new tests run and golden snapshot files are correctly generated.
- Validate that no new external runtime dependencies were added to `package.json`.
- *Note: Refactoring existing consumers like `TabbedDetailView` and `MessageBlock` to use the new hook is out of scope for this ticket and should be deferred to a follow-up refactoring ticket.*