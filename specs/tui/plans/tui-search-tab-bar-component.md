# Implementation Plan: `tui-search-tab-bar-component`

This implementation plan details the step-by-step actions required to fulfill the engineering specification for the `tui-search-tab-bar-component` ticket. It introduces the new `SearchTabBar` component, the associated types, its container structure, and exhaustive E2E tests.

## Step 1: Create Hook Type Dependency Stub

**File:** `apps/tui/src/hooks/useSearchTabs.types.ts`

Since this file does not exist yet according to our codebase research, we will create a stub that exposes the exact type required by the `SearchTabBar.types.ts` specification to ensure type correctness and resolve dependencies early.

```typescript
// stub implementation for SearchTabId pending full useSearchTabs hook ticket
export type SearchTabId = "repos" | "issues" | "users" | "code";
```

## Step 2: Create the Search Screen Directory and Barrel Export

**File:** `apps/tui/src/screens/Search/index.ts`

Create the barrel export to allow clean imports from the `Search` directory as specified in the component design.

```typescript
export { SearchTabBar } from "./SearchTabBar.js";
export type { SearchTabBarProps, SearchTabDisplayState } from "./SearchTabBar.types.js";
```

## Step 3: Create Component Type Definitions

**File:** `apps/tui/src/screens/Search/SearchTabBar.types.ts`

Define the strict types needed for the component props and the tab item display states based on the spec definitions.

```typescript
import type { SearchTabId } from "../../hooks/useSearchTabs.types.js";

/**
 * Per-tab display state passed to SearchTabBar.
 *
 * This is a deliberately minimal projection of the full TabState<T>
 * from useSearchTabs. The tab bar only needs display-relevant fields,
 * not items, pagination cursors, or scroll positions.
 */
export interface SearchTabDisplayState {
  /** Tab identifier (repos, issues, users, code) */
  readonly id: SearchTabId;
  /** Full-length label for standard/large breakpoints (e.g., "Repositories") */
  readonly label: string;
  /** Abbreviated label for minimum breakpoint (e.g., "Repos") */
  readonly shortLabel: string;
  /** Total result count from API response. 0 before first query. */
  readonly totalCount: number;
  /** Whether this specific tab is currently loading results */
  readonly isLoading: boolean;
}

/**
 * Props for the SearchTabBar component.
 */
export interface SearchTabBarProps {
  /** Display state for all 4 tabs, in stable order */
  readonly tabs: readonly [
    SearchTabDisplayState,
    SearchTabDisplayState,
    SearchTabDisplayState,
    SearchTabDisplayState,
  ];
  /** Index of the currently active tab (0–3) */
  readonly activeIndex: number;
  /**
   * Whether any search query has been dispatched.
   * When false, count badges are hidden entirely.
   */
  readonly hasSearched: boolean;
}
```

## Step 4: Implement the Component

**File:** `apps/tui/src/screens/Search/SearchTabBar.tsx`

Implement the component, including the file-private `formatCount` and `buildTabLabel` utility functions, leveraging ` @opentui/react` primitives.

```typescript
import React, { useMemo } from "react";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import { TextAttributes } from "../../theme/tokens.js";
import type { SearchTabBarProps } from "./SearchTabBar.types.js";
import type { Breakpoint } from "../../types/breakpoint.js";

/**
 * Format a result count for display in a tab badge.
 *
 * - Counts 0–9999: rendered as-is (e.g., "42", "9999")
 * - Counts 10000+: abbreviated as "10k+" (constant string)
 *
 * @param count - Non-negative integer from SearchResultPage.total_count
 * @returns Formatted count string
 */
function formatCount(count: number): string {
  if (count >= 10_000) return "10k+";
  return String(count);
}

/**
 * Build a single tab's display label based on breakpoint and search state.
 *
 * @param tabIndex - 0-based tab index (used for number prefix at minimum breakpoint)
 * @param label - Full-length label (e.g., "Repositories")
 * @param shortLabel - Abbreviated label (e.g., "Repos")
 * @param totalCount - Result count from API
 * @param hasSearched - Whether any query has been dispatched
 * @param breakpoint - Current terminal breakpoint
 * @returns Formatted label string
 */
function buildTabLabel(
  tabIndex: number,
  label: string,
  shortLabel: string,
  totalCount: number,
  hasSearched: boolean,
  breakpoint: Breakpoint,
): string {
  const num = tabIndex + 1; // 1-based for display
  const countSuffix = hasSearched ? `(${formatCount(totalCount)})` : "";

  if (breakpoint === "minimum") {
    // "1:Repos(42)" or "1:Repos" (no count before query)
    return `${num}:${shortLabel}${countSuffix}`;
  }

  // standard and large: "Repositories (42)" or "Repositories"
  return hasSearched ? `${label} (${formatCount(totalCount)})` : label;
}

export function SearchTabBar({ tabs, activeIndex, hasSearched }: SearchTabBarProps) {
  const { breakpoint } = useLayout();
  const theme = useTheme();

  // Breakpoint is null when terminal is below minimum (80x24).
  // The TerminalTooSmallScreen renders instead of any content screen,
  // so this guard is defensive — the component should never receive null.
  // Fallback to "minimum" if it somehow does.
  const effectiveBreakpoint: Breakpoint = breakpoint ?? "minimum";

  const separator = effectiveBreakpoint === "minimum" ? "  " : " | ";

  const labels = useMemo(
    () =>
      tabs.map((tab, i) =>
        buildTabLabel(
          i,
          tab.label,
          tab.shortLabel,
          tab.totalCount,
          hasSearched,
          effectiveBreakpoint,
        ),
      ),
    [tabs, hasSearched, effectiveBreakpoint],
  );

  return (
    <box flexDirection="row" height={1} width="100%">
      {labels.map((label, i) => {
        const isActive = i === activeIndex;
        const isLast = i === labels.length - 1;

        return (
          <React.Fragment key={tabs[i].id}>
            <text
              fg={isActive ? theme.primary : theme.muted}
              attributes={isActive ? TextAttributes.BOLD | TextAttributes.UNDERLINE : 0}
            >
              {label}
            </text>
            {!isLast && <text fg={theme.muted}>{separator}</text>}
          </React.Fragment>
        );
      })}
    </box>
  );
}
```

## Step 5: Implement E2E Tests

**File:** `e2e/tui/search.test.ts`

Draft the complete suite covering responsiveness, UI states, snapshot assertions, and interactions exactly as outlined in section 8 of the engineering specification.

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI, TERMINAL_SIZES } from "./helpers.js";

describe("TUI_SEARCH — SearchTabBar", () => {
  test("tab bar renders 4 tabs in pre-query state at minimum breakpoint", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.minimum });
    await tui.sendKeys("g", "s");
    await tui.waitForText("1:Repos  2:Issues  3:Users  4:Code");
    const content = tui.getScreenText();
    expect(content).not.toMatch(/\(\d+\)/);
    await tui.quit();
  });

  test("tab bar renders 4 tabs in pre-query state at standard breakpoint", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await tui.waitForText("Repositories | Issues | Users | Code");
    const content = tui.getScreenText();
    expect(content).not.toMatch(/\(\d+\)/);
    await tui.quit();
  });

  test("tab bar renders 4 tabs in pre-query state at large breakpoint", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.large });
    await tui.sendKeys("g", "s");
    await tui.waitForText("Repositories | Issues | Users | Code");
    await tui.quit();
  });

  test("first tab is active by default", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await tui.waitForText("Repositories");
    // Snapshot verification catches the bold + underline + primary color styles
    await expect(tui).toMatchSnapshot("search-tab-bar-active-default");
    await tui.quit();
  });

  test("tab bar shows count badges after search query", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await tui.sendKeys("query");
    await tui.waitForText(/Repositories \(\d+\)/);
    await tui.quit();
  });

  test("count badge abbreviation for large counts", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await tui.sendKeys("trigger_10k_results"); // Assuming test fixture mapping
    await tui.waitForText("10k+");
    await tui.quit();
  });

  test("active tab switches on Tab keypress", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await tui.sendKeys("Tab");
    await expect(tui).toMatchSnapshot("search-tab-bar-active-issues");
    await tui.quit();
  });

  test("active tab switches on number key (1–4)", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await tui.sendKeys("3");
    await expect(tui).toMatchSnapshot("search-tab-bar-active-users");
    await tui.sendKeys("1");
    await expect(tui).toMatchSnapshot("search-tab-bar-active-repos");
    await tui.quit();
  });

  test("tab bar transitions labels on resize from standard to minimum", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await tui.sendKeys("query");
    await tui.waitForText(/Repositories \(\d+\)/);
    await tui.resize(TERMINAL_SIZES.minimum);
    await tui.waitForText(/1:Repos\(\d+\)/);
    await tui.quit();
  });

  test("tab bar transitions labels on resize from minimum to standard", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.minimum });
    await tui.sendKeys("g", "s");
    await tui.sendKeys("query");
    await tui.waitForText(/1:Repos\(\d+\)/);
    await tui.resize(TERMINAL_SIZES.standard);
    await tui.waitForText(/Repositories \(\d+\)/);
    await tui.quit();
  });

  test("search tab bar snapshot at 80x24 (pre-query)", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.minimum });
    await tui.sendKeys("g", "s");
    await expect(tui).toMatchSnapshot("search-tab-bar-minimum-pre-query");
    await tui.quit();
  });

  test("search tab bar snapshot at 120x40 (pre-query)", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await expect(tui).toMatchSnapshot("search-tab-bar-standard-pre-query");
    await tui.quit();
  });

  test("search tab bar snapshot at 200x60 (pre-query)", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.large });
    await tui.sendKeys("g", "s");
    await expect(tui).toMatchSnapshot("search-tab-bar-large-pre-query");
    await tui.quit();
  });

  test("search tab bar snapshot at 120x40 (with results)", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await tui.sendKeys("query");
    await tui.waitForText(/Repositories \(\d+\)/);
    await expect(tui).toMatchSnapshot("search-tab-bar-standard-with-results");
    await tui.quit();
  });

  test("tab bar shows (0) for all tabs on empty search results", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await tui.sendKeys("trigger_empty_results");
    await tui.waitForText("Repositories (0)");
    await tui.waitForText("Issues (0)");
    await tui.waitForText("Users (0)");
    await tui.waitForText("Code (0)");
    await tui.quit();
  });

  test("tab bar hides badges again after clearSearch", async () => {
    const tui = await launchTUI({ size: TERMINAL_SIZES.standard });
    await tui.sendKeys("g", "s");
    await tui.sendKeys("query");
    await tui.waitForText(/Repositories \(\d+\)/);
    // E.g., simulate clear input logic based on standard OpenTUI keybinding or parent UI trigger
    await tui.sendKeys("Escape"); // Standard behavior clears search/focus on some impls or backspacing
    await tui.waitForText("Repositories | Issues | Users | Code");
    const content = tui.getScreenText();
    expect(content).not.toMatch(/\(\d+\)/);
    await tui.quit();
  });
});
```