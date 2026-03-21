# Research Findings: `useLayout` Hook Implementation

## 1. Existing State in `apps/tui/`

### 1.1 `apps/tui/src/types/breakpoint.ts`
This file already exists and is fully implemented per the specification.
- It exports the `Breakpoint` type (`"minimum" | "standard" | "large"`).
- It exports the `getBreakpoint(cols: number, rows: number)` function which returns a `Breakpoint` or `"unsupported"`.
- Uses `||` logic to determine breakpoints.

### 1.2 `apps/tui/src/types/index.ts`
This file does **not** exist yet. It needs to be created to serve as a barrel export for the `breakpoint.ts` types and functions.

### 1.3 `apps/tui/src/hooks/useLayout.ts`
This file does **not** exist yet. It will need to be created from scratch following the engineering spec, utilizing `useMemo`, `useTerminalDimensions` from `@opentui/react`, and `getBreakpoint`.

### 1.4 `apps/tui/src/hooks/index.ts`
This file exists and currently exports several hooks (e.g., `useNavigation`, `useClipboard`, `useDiffSyntaxStyle`, `useTabs`, etc.). The new `useLayout` hook and its `LayoutContext` interface must be added to these exports.

### 1.5 `e2e/tui/app-shell.test.ts`
This file exists and contains extensive tests for `TUI Navigation Provider and App Shell`, `Screen Registry`, `TUI_APP_SHELL — Package scaffold`, `TUI_APP_SHELL — TypeScript compilation`, `TUI_APP_SHELL — Dependency resolution`, and `TUI_APP_SHELL — Color capability detection`. The layout responsive tests mentioned in the spec (e.g., `HOOK-LAY-*`, `RESP-LAY-*`, `EDGE-LAY-*`) are currently missing and need to be appended.

## 2. Current Usages of `useTerminalDimensions` and `getBreakpoint`

A codebase search revealed the following components currently rely on inline layout logic, which represents the technical debt this ticket aims to solve.

### `apps/tui/src/components/TabbedDetailView.tsx`
- Imports both `useTerminalDimensions` and `getBreakpoint`.
- Usage:
  ```typescript
  const { width: termWidth, height: termHeight } = useTerminalDimensions();
  const rawBreakpoint = getBreakpoint(termWidth, termHeight);
  ```
- *Note: Refactoring this component is not part of the current ticket, but it's the primary consumer that validates the need for `useLayout`.*

### `apps/tui/src/screens/Agents/components/MessageBlock.tsx`
- Imports `useTerminalDimensions` from `@opentui/react`.
- Usage:
  ```typescript
  const { width } = useTerminalDimensions();
  ```

### `apps/tui/src/verify-imports.ts`
- Merely imports and validates that `useTerminalDimensions` exists and is a function within `@opentui/react`.

## 3. OpenTUI & Architecture Context

- `@opentui/react` exposes `useTerminalDimensions(): { width: number, height: number }`.
- `useTerminalDimensions` internally listens to `SIGWINCH` and updates React state synchronously, meaning `useOnResize` is redundant for this specific hook.
- All layout computation must respond synchronously via standard React re-rendering.
- The `useLayout` hook should be memoized using `useMemo` with `[width, height]` dependency array to prevent unnecessary re-renders in consumers.

## 4. Plan Summary based on Findings
1. Create `apps/tui/src/types/index.ts` and barrel export `Breakpoint` and `getBreakpoint`.
2. Create `apps/tui/src/hooks/useLayout.ts` conforming to the spec, utilizing the existing `getBreakpoint` function.
3. Update `apps/tui/src/hooks/index.ts` to export `useLayout` and `LayoutContext`.
4. Append the pure function tests, hook integration tests, E2E responsive layout tests, and edge case tests to `e2e/tui/app-shell.test.ts`.