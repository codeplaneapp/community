# Codebase Research: TUI Search Result Row Renderers

Based on the engineering specification for `tui-search-result-row-components`, the goal is to implement search result row renderers for repos, issues, users, and code tabs. Below is an exhaustive outline of the existing production files required for this implementation, along with their current states.

## 1. Missing Files (To be created or scaffolded elsewhere)

These files were checked but do **not** exist in `apps/tui/src/` yet. They are either deliverables for this ticket or depend on parallel tickets (like `tui-search-data-hooks` or `tui-list-component`).

- `apps/tui/src/hooks/useSearchTabs.types.ts`
- `apps/tui/src/components/ListRow.tsx`
- `apps/tui/src/components/ListComponent.tsx`
- `apps/tui/src/screens/Search/results/` (Directory does not exist)

## 2. Existing Hook & Utility Files

The following files exist in `apps/tui/src/` and are fully implemented. They expose the utilities, hooks, and types necessary for the implementation of the search row renderers.

### `apps/tui/src/types/breakpoint.ts`
Defines the `Breakpoint` types and the threshold logic for responsive layout.
```typescript
/**
 * Terminal size breakpoint classification.
 *
 * Ranges (both cols AND rows must meet the threshold):
 * - minimum: 80×24 – 119×39
 * - standard: 120×40 – 199×59
 * - large: 200×60+
 *
 * Below 80×24 returns null (unsupported).
 */
export type Breakpoint = "minimum" | "standard" | "large";

/**
 * Compute the breakpoint from terminal dimensions.
 *
 * Returns null when the terminal is below the minimum supported size
 * (cols < 80 OR rows < 24). The caller is responsible for rendering
 * the "terminal too small" screen when this returns null.
 *
 * The threshold logic uses OR for downgrade: if EITHER dimension
 * is below the threshold for a breakpoint, the terminal falls to
 * the next lower breakpoint. This prevents usability issues where
 * a terminal is wide but very short (or vice versa).
 */
export function getBreakpoint(
  cols: number,
  rows: number,
): Breakpoint | null {
  if (cols < 80 || rows < 24) return null;
  if (cols < 120 || rows < 40) return "minimum";
  if (cols < 200 || rows < 60) return "standard";
  return "large";
}
```

### `apps/tui/src/hooks/useBreakpoint.ts`
Provides the `useBreakpoint` hook which returns the active `Breakpoint | null`.
```typescript
import { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";

/**
 * Returns the current terminal breakpoint.
 *
 * Reads terminal dimensions from OpenTUI's useTerminalDimensions()
 * and derives the breakpoint via getBreakpoint(). Recalculates
 * synchronously on terminal resize (SIGWINCH) — no debounce.
 *
 * Returns null when the terminal is below 80×24 (unsupported).
 */
export function useBreakpoint(): Breakpoint | null {
  const { width, height } = useTerminalDimensions();
  return useMemo(() => getBreakpoint(width, height), [width, height]);
}
```

### `apps/tui/src/hooks/useLayout.ts`
Provides full responsive layout contexts like width, height, breakpoint classification, and available content heights.
```typescript
import { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";
import { useSidebarState, type SidebarState } from "./useSidebarState.js";

export interface LayoutContext {
  width: number;
  height: number;
  breakpoint: Breakpoint | null;
  contentHeight: number;
  sidebarVisible: boolean;
  sidebarWidth: string;
  modalWidth: string;
  modalHeight: string;
  sidebar: SidebarState;
}
// ... functions ...
export function useLayout(): LayoutContext {
  const { width, height } = useTerminalDimensions();
  const sidebar = useSidebarState();

  return useMemo((): LayoutContext => {
    const breakpoint = getBreakpoint(width, height);
    return {
      width,
      height,
      breakpoint,
      contentHeight: Math.max(0, height - 2),
      sidebarVisible: sidebar.visible,
      sidebarWidth: getSidebarWidth(breakpoint, sidebar.visible),
      modalWidth: getModalWidth(breakpoint),
      modalHeight: getModalHeight(breakpoint),
      sidebar,
    };
  }, [width, height, sidebar]);
}
```

### `apps/tui/src/hooks/useResponsiveValue.ts`
Generic hook for responding to the active breakpoint.
```typescript
import { useMemo } from "react";
import { useBreakpoint } from "./useBreakpoint.js";
import type { Breakpoint } from "../types/breakpoint.js";

export interface ResponsiveValues<T> {
  minimum: T;
  standard: T;
  large: T;
}

export function useResponsiveValue<T>(
  values: ResponsiveValues<T>,
  fallback?: T,
): T | undefined {
  const breakpoint = useBreakpoint();

  return useMemo(() => {
    if (!breakpoint) return fallback;
    return values[breakpoint];
  }, [breakpoint, values, fallback]);
}
```

### `apps/tui/src/hooks/useTheme.ts` & `apps/tui/src/theme/tokens.ts`
These files manage the truecolor, ANSI 256, and ANSI 16 styling tokens.
`useTheme()` returns an object with properties like `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`.
`TextAttributes` allows you to apply `BOLD`, `DIM`, `UNDERLINE`, and `REVERSE` bitwise flags.
`statusToToken(status: string)` converts strings like `"open"`, `"closed"` to `CoreTokenName` representing the theme styling to use.

### `apps/tui/src/util/text.ts`
Provides utilities for string truncation. `truncatePathLeft` does NOT exist in this file yet and will need to be added as specified by the ticket.
```typescript
export function truncateBreadcrumb(segments: string[], maxWidth: number, separator = " › "): string { /*...*/ }
export function truncateRight(text: string, maxWidth: number): string { /*...*/ }
export function fitWidth(text: string, width: number, align: "left" | "right" = "left"): string { /*...*/ }
export function truncateText(text: string, maxLength: number): string { /*...*/ }
export function wrapText(text: string, width: number): string[] { /*...*/ }
```

### `apps/tui/src/util/format.ts`
Provides specific text parsing and formatting functionality. **Notice:** `formatRelativeTime` does NOT exist in this file yet and will need to be implemented as specified by the ticket.
```typescript
import { truncateText } from "./truncate.js";

export function formatAuthConfirmation(username: string, source: string, maxWidth: number): string { /*...*/ }
export function formatErrorSummary(error: unknown, maxChars: number): string { /*...*/ }
```

## 3. Recommended Implementation Strategy

Based on these findings:
1. The underlying utilities expected by the row renderers (`useTheme`, `TextAttributes`, `statusToToken`, `useBreakpoint`, `truncateRight`) are verified and stable.
2. `formatRelativeTime` must be manually added to `apps/tui/src/util/format.ts`.
3. `truncatePathLeft` must be manually added to `apps/tui/src/util/text.ts`.
4. `RepositorySearchResult` missing fields should be verified against `useSearchTabs.types.ts` when it's made available or created.
5. The row components depend directly on width logic (`columns.ts`) and highlight string parsers (`highlight.ts`) which must be built entirely from scratch in `apps/tui/src/screens/Search/results/` as prescribed.