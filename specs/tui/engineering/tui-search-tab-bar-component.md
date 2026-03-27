# Engineering Specification: `tui-search-tab-bar-component`

## Search Tab Bar Component with Count Badges and Responsive Labels

---

## 1. Overview

This ticket creates `apps/tui/src/screens/Search/SearchTabBar.tsx` — a reusable horizontal tab bar component for the TUI search screen. The component renders 4 tabs (Repositories, Issues, Users, Code) with count badges sourced from search API responses. It adapts label format and separator style based on terminal breakpoint, fits within a single row, and re-renders synchronously on terminal resize.

This is a **pure presentational component**. It receives tab state and callbacks as props and renders a single-row `<box>` of `<text>` elements. It does not manage search state, dispatch API requests, or handle keyboard events beyond what its parent provides.

### Dependencies

| Dependency | Role | Status |
|---|---|---|
| `tui-responsive-layout` | `useLayout()` provides `breakpoint` and `width` for responsive label selection | Required |
| `tui-theme-provider` | `useTheme()` provides `primary` and `muted` color tokens | Required |
| `tui-search-data-hooks` | `TabState` type provides `totalCount` and `isLoading` per tab | Required (types only) |
| `@opentui/react` | React 19 components (`<box>`, `<text>`) and hooks (`useMemo`) | Implemented |
| `@opentui/core` | `RGBA` type for color props | Implemented |

### Feature Mapping

This ticket contributes to:
- `TUI_SEARCH_SCREEN` — visual tab bar within the search screen layout
- `TUI_SEARCH_TAB_NAVIGATION` — tab display and active state indicator
- `TUI_SEARCH_REPOS_TAB` — repository tab label and count badge
- `TUI_SEARCH_ISSUES_TAB` — issue tab label and count badge
- `TUI_SEARCH_USERS_TAB` — user tab label and count badge
- `TUI_SEARCH_CODE_TAB` — code tab label and count badge

---

## 2. Design Decisions

### 2.1 Custom component vs. OpenTUI `<tab-select>`

OpenTUI provides a built-in `<tab-select>` component with horizontal navigation, underline, and color styling. We intentionally do **not** use it for the search tab bar because:

1. **Count badges**: `<tab-select>` accepts `{ name, description, value }` options. There is no built-in mechanism to render inline count badges like `Repositories (42)` that update asynchronously from API responses.
2. **Responsive label switching**: The tab bar must switch between long labels (`Repositories (42)`) and short labels (`1:Repos(42)`) based on breakpoint. `<tab-select>` does not support dynamic label reformatting on resize.
3. **Pre-query state**: Before the first query dispatch, count badges must be hidden entirely (not shown as `(0)`). This conditional rendering is not expressible in `<tab-select>`'s static option interface.
4. **Number prefix keybinding hints**: At minimum breakpoint, labels include a `1:` prefix to hint at the `1`–`4` tab switching keybindings. This is not a standard `<tab-select>` pattern.
5. **Single-row height guarantee**: `<tab-select>` calculates height based on `showDescription` and may require more than 1 row. The search tab bar must always occupy exactly 1 row.

The component is a composition of `<box flexDirection="row">` and `<text>` elements — the same pattern used by `HeaderBar` and `StatusBar` in the codebase.

### 2.2 Active tab styling

Active tab: `fg={theme.primary}` with `attributes={TextAttributes.BOLD | TextAttributes.UNDERLINE}` — bold + underline + primary color (ANSI 33 at 256-color tier). This matches the design spec's "focused items, links, active tabs" semantic for the `primary` token.

Inactive tabs: `fg={theme.muted}` — muted color (ANSI 245 at 256-color tier). This matches the design spec's "secondary text, metadata" semantic for the `muted` token.

### 2.3 Count badge formatting

- Counts 0–9999: rendered as-is, e.g., `(42)`, `(9999)`.
- Counts 10000+: abbreviated as `(10k+)`. This avoids layout overflow from large numbers while communicating "many results."
- Before first query dispatch (indicated by `hasSearched === false`): no count badge shown. Tabs render as `Repositories` not `Repositories (0)`.

### 2.4 Responsive label formats

| Breakpoint | Format | Separator | Example |
|---|---|---|---|
| `minimum` (80×24 – 119×39) | `{N}:{ShortLabel}({Count})` | 2 spaces | `1:Repos(42)  2:Issues(7)  3:Users(3)  4:Code(128)` |
| `standard` (120×40 – 199×59) | `{FullLabel} ({Count})` | ` \| ` (pipe with spaces) | `Repositories (42) \| Issues (7) \| Users (3) \| Code (128)` |
| `large` (200×60+) | `{FullLabel} ({Count})` | ` \| ` (pipe with spaces) | `Repositories (42) \| Issues (7) \| Users (3) \| Code (128)` |

At minimum breakpoint without a query:
`1:Repos  2:Issues  3:Users  4:Code`

At standard/large breakpoint without a query:
`Repositories | Issues | Users | Code`

### 2.5 No wrapping guarantee

The tab bar is a single `<box>` with `height={1}` and `flexDirection="row"`. OpenTUI's Yoga layout engine does not wrap flex children by default (`flexWrap` defaults to `"nowrap"`). The component is designed so that at the minimum breakpoint (80 columns), the shortest possible label set (`1:Repos  2:Issues  3:Users  4:Code`) is 34 characters — well within 80 columns. The longest possible label set at minimum (`1:Repos(10k+)  2:Issues(10k+)  3:Users(10k+)  4:Code(10k+)`) is 58 characters — still within 80 columns.

---

## 3. Type Definitions

**File:** `apps/tui/src/screens/Search/SearchTabBar.types.ts`

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

### 3.1 Type invariants

1. `tabs` is always a 4-element tuple. The component never handles variable-length tab arrays.
2. `activeIndex` is always 0–3. The parent (SearchScreen) is responsible for clamping. The component renders with the given index — it does not validate bounds.
3. `totalCount` is a non-negative integer. The API guarantees this in the `SearchResultPage.total_count` field.
4. `hasSearched` transitions from `false` to `true` after the first query dispatch and stays `true` for the session. It may reset to `false` on `clearSearch()`.

---

## 4. Component Specification

**File:** `apps/tui/src/screens/Search/SearchTabBar.tsx`

### 4.1 Imports

```typescript
import React, { useMemo } from "react";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import { TextAttributes } from "../../theme/tokens.js";
import type { SearchTabBarProps } from "./SearchTabBar.types.js";
import type { Breakpoint } from "../../types/breakpoint.js";
```

### 4.2 Count formatting utility

Internal to the module. Not exported.

```typescript
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
```

### 4.3 Label builder utility

Internal to the module. Not exported.

```typescript
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
```

### 4.4 Component implementation

```typescript
export function SearchTabBar({ tabs, activeIndex, hasSearched }: SearchTabBarProps) {
  const { breakpoint } = useLayout();
  const theme = useTheme();

  // Breakpoint is null when terminal is below minimum (80×24).
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

### 4.5 Rendering behavior

1. **Single row**: The component renders as `<box height={1}>`. It never wraps to a second line.
2. **No keyboard handling**: The tab bar is display-only. Keyboard events (`Tab`, `Shift+Tab`, `1`–`4`) are handled by the parent `SearchScreen` component, which updates `activeIndex` via the `useSearchTabs` hook's `setActiveTab()`.
3. **No focus state**: The tab bar itself is not focusable. It does not receive or trap focus. Focus management belongs to the parent screen.
4. **Synchronous resize**: The component consumes `useLayout()` which derives from `useTerminalDimensions()`. On `SIGWINCH`, OpenTUI triggers a synchronous re-render. The `useMemo` recomputes `labels` with the new `effectiveBreakpoint`, and the component re-renders with the appropriate label format. No debounce, no animation.
5. **Loading indicator**: The tab bar does not display a loading spinner. If a tab is loading, the `isLoading` field is available in `SearchTabDisplayState` for the parent to use (e.g., inline spinner in the result list). The tab bar renders the last known `totalCount` during loading.

---

## 5. File Inventory

### 5.1 New files

| File | Purpose |
|---|---|
| `apps/tui/src/screens/Search/SearchTabBar.types.ts` | Type definitions for `SearchTabDisplayState` and `SearchTabBarProps` |
| `apps/tui/src/screens/Search/SearchTabBar.tsx` | Component implementation |
| `apps/tui/src/screens/Search/index.ts` | Barrel export for the Search screen directory |
| `e2e/tui/search.test.ts` | E2E tests for the search tab bar (and future search screen tests) |

### 5.2 Modified files

None. This component is new and self-contained. It will be consumed by the `SearchScreen` component in a subsequent ticket.

### 5.3 Directory creation

The `apps/tui/src/screens/Search/` directory does not exist yet. It must be created as part of this ticket. This follows the existing convention seen in `apps/tui/src/screens/Agents/`.

---

## 6. Implementation Plan

### Step 1: Create the Search screen directory and barrel export

**File:** `apps/tui/src/screens/Search/index.ts`

Create the directory `apps/tui/src/screens/Search/` and add a barrel export file:

```typescript
export { SearchTabBar } from "./SearchTabBar.js";
export type { SearchTabBarProps, SearchTabDisplayState } from "./SearchTabBar.types.js";
```

**Rationale:** Establishes the directory for all Search screen components. The barrel export follows the pattern used in `apps/tui/src/screens/Agents/components/index.ts`.

### Step 2: Create type definitions

**File:** `apps/tui/src/screens/Search/SearchTabBar.types.ts`

Create the `SearchTabDisplayState` interface and `SearchTabBarProps` interface as defined in Section 3. This file imports only `SearchTabId` from `../../hooks/useSearchTabs.types.js`.

**Rationale:** Separating types enables test files and the future `SearchScreen` component to import types without importing the component implementation. This also enables the types to be consumed by the `useSearchTabs` hook (which produces `SearchTabDisplayState`-compatible objects from `TabState`).

### Step 3: Implement the `formatCount` utility

**File:** `apps/tui/src/screens/Search/SearchTabBar.tsx`

Implement the `formatCount(count: number): string` function as defined in Section 4.2. This is a module-private function (not exported) used only by `buildTabLabel`.

**Boundary conditions to implement:**
- `formatCount(0)` → `"0"`
- `formatCount(9999)` → `"9999"`
- `formatCount(10000)` → `"10k+"`
- `formatCount(99999)` → `"10k+"`
- `formatCount(Number.MAX_SAFE_INTEGER)` → `"10k+"`

**Rationale:** The 10k+ abbreviation is a product decision to prevent layout overflow. The threshold of 10,000 is chosen because 5-digit numbers (`10000`+) in a `(N)` badge consume 7+ characters, which could cause the minimum-breakpoint layout to exceed 80 columns if multiple tabs have high counts.

### Step 4: Implement the `buildTabLabel` utility

**File:** `apps/tui/src/screens/Search/SearchTabBar.tsx`

Implement the `buildTabLabel` function as defined in Section 4.3. This is a module-private function (not exported) used only by the component.

**Label matrix (comprehensive):**

| Breakpoint | `hasSearched` | `totalCount` | Output |
|---|---|---|---|
| minimum | false | 0 | `"1:Repos"` |
| minimum | true | 0 | `"1:Repos(0)"` |
| minimum | true | 42 | `"1:Repos(42)"` |
| minimum | true | 9999 | `"1:Repos(9999)"` |
| minimum | true | 10000 | `"1:Repos(10k+)"` |
| standard | false | 0 | `"Repositories"` |
| standard | true | 0 | `"Repositories (0)"` |
| standard | true | 42 | `"Repositories (42)"` |
| standard | true | 10000 | `"Repositories (10k+)"` |
| large | false | 0 | `"Repositories"` |
| large | true | 42 | `"Repositories (42)"` |

Note the spacing difference: minimum uses no space before `(` — `Repos(42)` — to save horizontal space. Standard/large use a space — `Repositories (42)` — for readability.

### Step 5: Implement the `SearchTabBar` component

**File:** `apps/tui/src/screens/Search/SearchTabBar.tsx`

Implement the React component as defined in Section 4.4.

**Key implementation details:**

1. **`useMemo` dependency array**: `[tabs, hasSearched, effectiveBreakpoint]`. The `tabs` array reference changes when any tab's `totalCount` or `isLoading` changes (because `useSearchTabs` creates new `TabState` objects on update). This ensures labels recompute when counts change.

2. **`React.Fragment` with key**: Each tab uses `tabs[i].id` as the key (e.g., `"repos"`, `"issues"`). This is stable across re-renders.

3. **Separator rendering**: The separator `<text>` element is rendered between tabs (`!isLast` guard). At minimum breakpoint, the separator is 2 spaces. At standard/large, it is ` | ` (space-pipe-space, 3 characters). The separator always uses `theme.muted` color.

4. **Active tab attributes**: Uses `TextAttributes.BOLD | TextAttributes.UNDERLINE` (bitwise OR of `1 << 0 | 1 << 2 = 5`). This matches the design spec requirement for bold + underline + primary color.

5. **Inactive tab attributes**: Uses `0` (no attributes). Combined with `theme.muted` foreground, this produces the muted gray text specified in the design.

6. **Breakpoint null guard**: If `breakpoint` is `null` (terminal below 80×24), the `TerminalTooSmallScreen` should be rendering instead. As a defensive measure, the component falls back to `"minimum"` label format. This prevents a crash but should never occur in practice.

### Step 6: Write E2E tests

**File:** `e2e/tui/search.test.ts`

Create the test file for search screen features. The tab bar tests are the first test group in this file. See Section 8 for the complete test specification.

---

## 7. Edge Cases

### 7.1 All counts zero after search

When a query returns 0 results for all tabs, the tab bar renders `(0)` badges on all tabs (because `hasSearched === true`). This is correct — it communicates "search was performed, nothing found" vs. "no search performed yet."

### 7.2 Mixed loading states

Tabs load in parallel. During the loading window, some tabs may show stale counts while others update. The tab bar renders whatever `totalCount` each `SearchTabDisplayState` currently holds. This means a brief inconsistency (e.g., repos shows 42 while issues is still loading with its previous count). This is acceptable — the alternative (batch all tabs) would introduce unnecessary latency.

### 7.3 Resize during active search

If the terminal is resized while results are displayed, the component synchronously re-renders with the new breakpoint. Labels switch format immediately. Example: resizing from 120 columns to 79 columns transitions from `Repositories (42) | Issues (7) | ...` to the `TerminalTooSmallScreen` (handled by `AppShell`, not by the tab bar). Resizing from 120 to 100 transitions to minimum format: `1:Repos(42)  2:Issues(7)  ...`.

### 7.4 Count transitions during abbreviation boundary

If a search returns exactly 10,000 results, the badge shows `(10k+)`. If a subsequent search returns 9,999, it shows `(9999)`. The transition is handled by the `formatCount` function — no special animation or fade.

### 7.5 `hasSearched` reset on clearSearch

When the user clears the search (via `clearSearch()` in `useSearchTabs`), `hasSearched` resets to `false` and count badges disappear. The tab bar reverts to the pre-query format.

### 7.6 Tab bar width at extremes

**Widest possible (standard/large, all counts at 10k+):**
`Repositories (10k+) | Issues (10k+) | Users (10k+) | Code (10k+)`
= 19 + 3 + 14 + 3 + 13 + 3 + 12 = **67 characters** — fits within 80 columns.

**Widest possible (minimum, all counts at 10k+):**
`1:Repos(10k+)  2:Issues(10k+)  3:Users(10k+)  4:Code(10k+)`
= 13 + 2 + 14 + 2 + 13 + 2 + 12 = **58 characters** — fits within 80 columns.

**Narrowest possible (minimum, pre-query):**
`1:Repos  2:Issues  3:Users  4:Code`
= 7 + 2 + 8 + 2 + 7 + 2 + 6 = **34 characters**.

All variants fit within the 80-column minimum with margin to spare.

---

## 8. Unit & Integration Tests

**File:** `e2e/tui/search.test.ts`

All tests use `@microsoft/tui-test` via the helpers in `e2e/tui/helpers.ts`. Tests launch a full TUI instance, navigate to the search screen, and assert on terminal buffer content.

### 8.1 Test structure

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI, TERMINAL_SIZES } from "./helpers.js";

describe("TUI_SEARCH — SearchTabBar", () => {
  // ... tests below
});
```

### 8.2 Tab bar rendering tests

#### Test: tab bar renders 4 tabs in pre-query state at minimum breakpoint

```
Launch TUI at 80×24. Navigate to search screen (g s). Assert terminal
contains "1:Repos  2:Issues  3:Users  4:Code" on a single line. Assert no
parenthesized numbers are present on the tab bar line.
```

Verifies:
- Pre-query state hides count badges
- Minimum breakpoint uses short labels with number prefixes
- Separator is 2 spaces
- All 4 tabs are visible

#### Test: tab bar renders 4 tabs in pre-query state at standard breakpoint

```
Launch TUI at 120×40. Navigate to search screen (g s). Assert terminal
contains "Repositories | Issues | Users | Code" on a single line. Assert no
parenthesized numbers are present on the tab bar line.
```

Verifies:
- Pre-query state hides count badges
- Standard breakpoint uses full labels
- Separator is ` | `

#### Test: tab bar renders 4 tabs in pre-query state at large breakpoint

```
Launch TUI at 200×60. Navigate to search screen (g s). Assert terminal
contains "Repositories | Issues | Users | Code" on a single line.
```

Verifies:
- Large breakpoint uses same format as standard

#### Test: first tab is active by default

```
Launch TUI at 120×40. Navigate to search screen (g s). Assert that
"Repositories" appears with bold + underline + primary color attributes.
Assert that "Issues", "Users", "Code" appear with muted color and no
bold/underline.
```

Verifies:
- Active tab styling: bold + underline + primary color
- Inactive tab styling: muted color, no attributes

#### Test: tab bar shows count badges after search query

```
Launch TUI at 120×40. Navigate to search screen (g s). Type a search
query. Wait for results to appear. Assert terminal contains a tab label
matching the regex /Repositories \(\d+\)/. Assert all 4 tabs show
parenthesized counts.
```

Verifies:
- `hasSearched` transitions to true
- Count badges appear for all tabs
- Count formatting produces valid numbers

#### Test: count badge abbreviation for large counts

```
Launch TUI at 120×40. Navigate to search screen (g s). Type a query
known to return 10k+ results (if test fixture supports it). Assert terminal
contains "10k+" in a tab badge.
```

Verifies:
- `formatCount` abbreviation at the 10,000 threshold

#### Test: active tab switches on Tab keypress

```
Launch TUI at 120×40. Navigate to search screen (g s). Press Tab.
Assert that the second tab ("Issues") now has bold + underline + primary
color. Assert the first tab ("Repositories") now has muted color.
```

Verifies:
- Tab cycling updates `activeIndex`
- Visual styling follows active state

#### Test: active tab switches on number key (1–4)

```
Launch TUI at 120×40. Navigate to search screen (g s). Press "3".
Assert that the third tab ("Users") has active styling. Press "1".
Assert that the first tab ("Repositories") has active styling.
```

Verifies:
- Direct tab jump via number keys
- Active styling tracks the selected tab

### 8.3 Responsive resize tests

#### Test: tab bar transitions labels on resize from standard to minimum

```
Launch TUI at 120×40. Navigate to search screen (g s). Type a query and
wait for results. Assert tab bar shows full labels: "Repositories (N) |".
Resize terminal to 80×24. Assert tab bar now shows short labels:
"1:Repos(N)  2:Issues".
```

Verifies:
- Synchronous re-render on SIGWINCH
- Label format switches from full to short
- Separator switches from ` | ` to `  `
- Number prefix appears at minimum breakpoint

#### Test: tab bar transitions labels on resize from minimum to standard

```
Launch TUI at 80×24. Navigate to search screen (g s). Type a query and
wait for results. Assert tab bar shows short labels. Resize terminal to
120×40. Assert tab bar now shows full labels: "Repositories (N) |".
```

Verifies:
- Reverse transition from minimum to standard

### 8.4 Snapshot tests

#### Test: search tab bar snapshot at 80×24 (pre-query)

```
Launch TUI at 80×24. Navigate to search screen (g s). Capture terminal
snapshot. Compare against golden file.
```

#### Test: search tab bar snapshot at 120×40 (pre-query)

```
Launch TUI at 120×40. Navigate to search screen (g s). Capture terminal
snapshot. Compare against golden file.
```

#### Test: search tab bar snapshot at 200×60 (pre-query)

```
Launch TUI at 200×60. Navigate to search screen (g s). Capture terminal
snapshot. Compare against golden file.
```

#### Test: search tab bar snapshot at 120×40 (with results)

```
Launch TUI at 120×40. Navigate to search screen (g s). Type a search
query. Wait for results. Capture terminal snapshot. Compare against
golden file.
```

### 8.5 Edge case tests

#### Test: tab bar shows (0) for all tabs on empty search results

```
Launch TUI at 120×40. Navigate to search screen (g s). Type a query
that returns 0 results for all tabs. Assert all 4 tabs show "(0)" in
their badges.
```

Verifies:
- Zero counts render as `(0)` after search, not hidden

#### Test: tab bar hides badges again after clearSearch

```
Launch TUI at 120×40. Navigate to search screen (g s). Type a query
and wait for results. Assert badges are visible. Clear the search input
(select all, delete). Assert badges disappear from the tab bar line.
```

Verifies:
- `hasSearched` reverts to false on clear
- Count badges disappear

### 8.6 Test count

Total: **15 tests** in the `TUI_SEARCH — SearchTabBar` describe block.

---

## 9. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC-1 | Tab bar renders 4 tabs (Repositories, Issues, Users, Code) in a single row | Snapshot tests at all 3 breakpoints |
| AC-2 | Active tab displays bold + underline + primary color (ANSI 33) | Regex assertion on ANSI escape sequences |
| AC-3 | Inactive tabs display muted color (ANSI 245) | Regex assertion on ANSI escape sequences |
| AC-4 | At minimum breakpoint, labels use format `N:ShortLabel(Count)` with 2-space separator | Terminal content assertion at 80×24 |
| AC-5 | At standard/large breakpoints, labels use format `FullLabel (Count)` with ` \| ` separator | Terminal content assertion at 120×40 and 200×60 |
| AC-6 | Counts >= 10,000 display as `10k+` | Content assertion with high-count fixture |
| AC-7 | No count badge shown before first query dispatch | Pre-query content assertion |
| AC-8 | Tab bar re-renders synchronously on terminal resize | Resize test from standard to minimum |
| AC-9 | Tab bar never exceeds 1 row height at any breakpoint | `height={1}` prop + visual inspection at 80×24 |
| AC-10 | Component consumes `useTheme()` and `useLayout()` — no raw ANSI codes | Code review |
| AC-11 | Component is stateless — all state comes from props | Code review (no `useState` in component) |
| AC-12 | Types are exported from barrel for consumer use | Import test in future `SearchScreen` ticket |

---

## 10. Width Budget Analysis

This section documents the mathematical proof that the tab bar fits within the minimum terminal width (80 columns) under all conditions.

### 10.1 Character counts by component

| Component | Characters |
|---|---|
| `1:Repos` | 7 |
| `2:Issues` | 8 |
| `3:Users` | 7 |
| `4:Code` | 6 |
| 2-space separator (×3) | 6 |
| **Total (pre-query, minimum)** | **34** |

| Component | Characters |
|---|---|
| `1:Repos(10k+)` | 13 |
| `2:Issues(10k+)` | 14 |
| `3:Users(10k+)` | 13 |
| `4:Code(10k+)` | 12 |
| 2-space separator (×3) | 6 |
| **Total (worst case, minimum)** | **58** |

| Component | Characters |
|---|---|
| `Repositories (10k+)` | 19 |
| `Issues (10k+)` | 14 |
| `Users (10k+)` | 13 |
| `Code (10k+)` | 12 |
| ` \| ` separator (×3) | 9 |
| **Total (worst case, standard)** | **67** |

All variants are within 80 columns. The standard/large worst case (67 characters) is also within 80, so even if a responsive breakpoint transition has a brief intermediate state, no wrapping occurs.

---

## 11. Source of Truth

This specification should be maintained alongside:

- [specs/tui/prd.md](../prd.md) — Product requirements for the TUI
- [specs/tui/design.md](../design.md) — Design specification (Section 4.1: Search screen, Section 1.4: Tab navigation)
- [specs/tui/features.ts](../features.ts) — Feature inventory (`TUI_SEARCH` group)
- [specs/tui/engineering/tui-search-data-hooks.md](./tui-search-data-hooks.md) — Data layer that feeds this component
- [specs/tui/engineering/tui-responsive-layout.md](./tui-responsive-layout.md) — Responsive layout dependency
- [specs/tui/engineering/tui-theme-provider.md](./tui-theme-provider.md) — Theme provider dependency