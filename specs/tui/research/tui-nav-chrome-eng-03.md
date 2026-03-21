# Research Findings: Responsive Layout Hooks (`tui-nav-chrome-eng-03`)

## 1. Current State of Type Definitions & Pure Functions
*   **Location:** `apps/tui/src/types/breakpoint.ts`
*   **Current implementation:** 
    *   `Breakpoint` is defined as `"minimum" | "standard" | "large"`.
    *   `getBreakpoint` returns `Breakpoint | "unsupported"` based on dimensions using `OR` logic (if either `cols` or `rows` is below threshold, it falls to a lower breakpoint).
*   **Gaps vs Spec:** The spec requires `getBreakpoint` to return `Breakpoint | null` instead of the `"unsupported"` string sentinel.

## 2. Current State of Layout Hooks
*   **Location:** `apps/tui/src/hooks/useLayout.ts`
*   **Current implementation:** 
    *   Reads `useTerminalDimensions()` and calculates layout synchronously.
    *   Derives `sidebarVisible` strictly from the breakpoint: `breakpoint !== "minimum" && breakpoint !== "unsupported"`.
    *   Exports layout metadata.

## 3. Current State of Tests
*   **Location:** `e2e/tui/app-shell.test.ts`
*   **Current State:** There is already extensive coverage for layout and responsiveness in this file. Groups like `getBreakpoint — pure function` (`HOOK-LAY-*`), `useLayout — computed values`, and `TUI Responsive Layout — E2E` (`RESP-LAY-*`) exist.
*   **Required Action:** 
    *   The existing tests asserting `'unsupported'` must be updated to expect `null`.
    *   The 37 new tests defined in the spec for `useBreakpoint`, `useResponsiveValue`, `useSidebarState`, and the sidebar E2E toggle interactions (`RESP-SB-*`) must be appended to this file.

## Conclusion
The necessary groundwork (OpenTUI's `useTerminalDimensions` and the basic layout logic) is already present. The implementation will involve updating the return type of `getBreakpoint` to use `null`, creating the three new focused hooks, upgrading `useLayout` to compose them together, and performing a sweeping refactor of components currently checking for `"unsupported"`.