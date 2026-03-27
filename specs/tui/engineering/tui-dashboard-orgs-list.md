# Engineering Specification: `tui-dashboard-orgs-list`

## Implement the Organizations Panel on the Dashboard

**Status:** Not started
**Dependencies:** `tui-dashboard-data-hooks`, `tui-dashboard-panel-component`, `tui-dashboard-panel-focus-manager`, `tui-dashboard-e2e-test-infra`
**Target files:** `apps/tui/src/screens/Dashboard/OrgsPanel.tsx`, `apps/tui/src/screens/Dashboard/useOrgsPanel.ts`, `apps/tui/src/screens/Dashboard/orgs-panel-columns.ts`
**Test file:** `e2e/tui/dashboard.test.ts`

---

## 1. Overview

This ticket implements the Organizations panel — the top-right quadrant (panel index 1) of the Dashboard 2×2 grid. It displays every organization the authenticated user belongs to, fetched via `useOrgs()` from `@codeplane/ui-core`, with cursor-based pagination, client-side filtering, responsive column layout, and full keyboard navigation.

The panel is wrapped in a `DashboardPanel` shell (from `tui-dashboard-panel-component`) and integrates with the `DashboardFocusManager` (from `tui-dashboard-panel-focus-manager`) for cross-panel Tab/Shift+Tab cycling and per-panel cursor memory.

### Codebase Constraints (Verified)

The following infrastructure **exists and is ready to use** (verified by reading source files):

| Infrastructure | File | Verified Interface |
|---|---|---|
| `useLayout()` | `apps/tui/src/hooks/useLayout.ts` | Returns `LayoutContext { width, height, breakpoint: Breakpoint \| null, contentHeight, sidebarVisible, sidebarWidth, modalWidth, modalHeight, sidebar }` |
| `useResponsiveValue<T>(values, fallback?)` | `apps/tui/src/hooks/useResponsiveValue.ts` | Accepts `ResponsiveValues<T> { minimum: T, standard: T, large: T }`, returns `T \| undefined` |
| `useBreakpoint()` | `apps/tui/src/hooks/useBreakpoint.ts` | Returns `Breakpoint \| null` |
| `usePaginationLoading(options)` | `apps/tui/src/hooks/usePaginationLoading.ts` | Options: `{ screen, hasMore, fetchMore }`. Returns `{ status: PaginationStatus, error: LoadingError \| null, loadMore, retry, spinnerFrame }` |
| `useScreenLoading(options)` | `apps/tui/src/hooks/useScreenLoading.ts` | Options: `UseScreenLoadingOptions { id, label, isLoading, error, onRetry }`. Returns `{ signal, showSpinner, showSkeleton, showError, loadingError, retry, spinnerFrame }` |
| `useScreenKeybindings(bindings, hints?)` | `apps/tui/src/hooks/useScreenKeybindings.ts` | Pushes `PRIORITY.SCREEN` scope on mount, pops on unmount. Accepts `KeyHandler[]` and optional `StatusBarHint[]` |
| `useTheme()` | `apps/tui/src/hooks/useTheme.ts` | Returns `Readonly<ThemeTokens>` with `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border` (all RGBA from `@opentui/core`) |
| `useNavigation()` | `apps/tui/src/providers/NavigationProvider.tsx` | Returns `NavigationContext { stack, currentScreen, push, pop, replace, reset, canGoBack, repoContext, orgContext, saveScrollPosition, getScrollPosition }` |
| `useSpinner(active)` | `apps/tui/src/hooks/useSpinner.ts` | Returns frame character string (braille at 80ms) or `""` |
| `useStatusBarHints()` | `apps/tui/src/hooks/useStatusBarHints.ts` | Returns `StatusBarHintsContextType { hints, registerHints, overrideHints, isOverridden }` |
| `truncateText(text, maxWidth)` | `apps/tui/src/util/truncate.ts` | Returns string with `…` appended if truncated, guaranteed `.length <= maxWidth` |
| `PaginationIndicator` | `apps/tui/src/components/PaginationIndicator.tsx` | Props: `{ status: PaginationStatus, spinnerFrame: string, error?: LoadingError \| null }` |
| `SkeletonList` | `apps/tui/src/components/SkeletonList.tsx` | Props: `{ columns?, metaWidth?, statusWidth? }` |
| `logger.info/warn/debug/error()` | `apps/tui/src/lib/logger.ts` | Writes to stderr with ISO timestamp |
| `emit(name, properties)` | `apps/tui/src/lib/telemetry.ts` | JSON to stderr when `CODEPLANE_TUI_DEBUG=true` |
| `KeyHandler` type | `apps/tui/src/providers/keybinding-types.ts` | `{ key, description, group, handler, when? }` |
| `PRIORITY` constants | `apps/tui/src/providers/keybinding-types.ts` | `{ TEXT_INPUT: 1, MODAL: 2, GOTO: 3, SCREEN: 4, GLOBAL: 5 }` |
| `StatusBarHint` type | `apps/tui/src/providers/keybinding-types.ts` | `{ keys, label, order? }` |
| `LoadingError` type | `apps/tui/src/loading/types.ts` | `{ type, httpStatus?, summary }` |
| `PaginationStatus` type | `apps/tui/src/loading/types.ts` | `"idle" \| "loading" \| "error"` |
| `ScreenName` enum | `apps/tui/src/router/types.ts` | Includes `Dashboard`, `OrgOverview`, `Organizations` |
| `Breakpoint` type | `apps/tui/src/types/breakpoint.ts` | `"minimum" \| "standard" \| "large"` |
| `ThemeTokens` interface | `apps/tui/src/theme/tokens.ts` | All semantic color tokens as `RGBA` objects |
| `CoreTokenName` type | `apps/tui/src/theme/tokens.ts` | `"primary" \| "success" \| "warning" \| "error" \| "muted" \| "surface" \| "border"` |
| E2E helpers | `e2e/tui/helpers.ts` | `launchTUI(options)`, `TUITestInstance`, `TERMINAL_SIZES`, `createMockAPIEnv()` |

The following **does not exist yet** and is provided by dependency tickets:
- `@codeplane/ui-core` package — provided by `tui-dashboard-data-hooks`
- `useOrgs()` hook — provided by `tui-dashboard-data-hooks`
- `DashboardPanel` component — provided by `tui-dashboard-panel-component`
- `DashboardFocusManager` and `useDashboardFocus()` — provided by `tui-dashboard-panel-focus-manager`
- `DashboardScreen` and `DashboardLayout` — provided by `tui-dashboard-screen-scaffold` / `tui-dashboard-grid-layout`
- `apps/tui/src/screens/Dashboard/` directory — does not exist
- `e2e/tui/dashboard.test.ts` — does not exist yet

---

## 2. Implementation Plan

### Step 1: Define responsive column configuration

**File:** `apps/tui/src/screens/Dashboard/orgs-panel-columns.ts`
**Action:** Create

Pure-data module defining column layout per breakpoint. Imports `Breakpoint` from `../../types/breakpoint.js` and `CoreTokenName` from `../../theme/tokens.js`. Exports `OrgColumnConfig` interface, `ORG_COLUMNS` record, `visibilityColorToken()` function, and constants `ORGS_PAGINATION_CAP` (500), `ORGS_PER_PAGE` (20), `ORGS_FILTER_MAX_LENGTH` (100).

Column widths: minimum (name 50ch + visibility 9ch), standard (name 30ch + visibility 9ch + description 40ch + location 20ch), large (name 40ch + visibility 9ch + description 60ch + location 30ch + website 30ch).

### Step 2: Create the panel data & state hook

**File:** `apps/tui/src/screens/Dashboard/useOrgsPanel.ts`
**Action:** Create

Composition hook using `useOrgs()`, `usePaginationLoading()`, `useResponsiveValue(ORG_COLUMNS)`, `useNavigation()`, `emit()`, and `logger`. Manages client-side filtering via `useState`/`useMemo`, pagination cap at 500 items, rate limit extraction from 429 errors, load time tracking via `useRef(Date.now())`, and all telemetry/logging events.

### Step 3: Implement the OrgsPanel component

**File:** `apps/tui/src/screens/Dashboard/OrgsPanel.tsx`
**Action:** Create

Presentational component with `OrgRow` sub-component. Wraps content in `DashboardPanel`. Each `OrgRow` is a 1-row `<box flexDirection="row">` with responsive columns. Focused row uses `bg={theme.primary}`. Scrollbox with onScroll pagination trigger at 80%. Uses `PaginationIndicator` for loading-more state.

### Step 4: Integrate OrgsPanel into DashboardScreen

**File:** `apps/tui/src/screens/Dashboard/index.tsx`
**Action:** Modify

Mount OrgsPanel at grid position 1 (top-right). Wire focus manager callbacks for onSelect, onRetry, onFilter.

### Step 5: Wire panel keyboard interactions

All keyboard dispatch flows through `useDashboardKeybindings` from the focus manager. Input focus guard ensures printable keys go to filter input when active.

### Step 6: Handle scroll-to-end pagination

Dual-trigger: scrollbox onScroll at 80% + cursor-driven at 80% of loaded items. Guarded by `isCapped`.

### Step 7: Handle error states

401 → app-shell auth screen. 429 → inline rate limit message. 500/network → inline error with R to retry.

### Step 8: Register status bar hints

Three hint sets (normal, filter active, error) registered via `useStatusBarHints().registerHints()`.

---

## 3. File Inventory

| File | Action | Purpose |
|------|--------|--------|
| `apps/tui/src/screens/Dashboard/orgs-panel-columns.ts` | **Create** | Column config, visibility colors, constants |
| `apps/tui/src/screens/Dashboard/useOrgsPanel.ts` | **Create** | Data hook composition |
| `apps/tui/src/screens/Dashboard/OrgsPanel.tsx` | **Create** | Presentational component |
| `apps/tui/src/screens/Dashboard/index.tsx` | **Modify** | Mount OrgsPanel at grid position 1 |
| `e2e/tui/dashboard.test.ts` | **Create** | 63 tests across 4 describe blocks |

---

## 4. Data Flow

DashboardScreen → useDashboardFocus() → panelFocusState[1] → OrgsPanel → useOrgsPanel() → useOrgs() → GET /api/user/orgs → OrgRow × N via scrollbox → PaginationIndicator. Navigation via useNavigation().push(ScreenName.OrgOverview, { org: name }).

---

## 5. Responsive Column Layout Detail

80×24 (minimum): name (50ch) + visibility badge. 120×40 (standard): name (30ch) + visibility + description (40ch) + location (20ch). 200×60 (large): name (40ch) + visibility + description (60ch) + location (30ch) + website (30ch).

---

## 6. Edge Case Handling

Terminal resize preserves focus. Rapid j presses processed sequentially. Filter during pagination applies to all loaded items. Unicode truncation uses JS string length (grapheme-aware fix in §10.1). Empty description/location renders blank. 500-item cap shows indicator. Enter during loading is no-op. j/q in filter input goes to text input.

---

## 7-8. Telemetry & Logging

8 telemetry events via emit(). 11 log patterns via logger at info/warn/debug levels.

---

## 9. Unit & Integration Tests

63 tests: 13 snapshot, 25 keyboard, 11 responsive, 14 integration. All via @microsoft/tui-test launchTUI helper. Tests that fail due to unimplemented backends are left failing.

---

## 10. Productionization Checklist

Grapheme-aware truncation, real useOrgs() hook, API client upgrade, virtual scrolling for 500-item lists, stub removal.

---

## 11. Dependencies

6 dependency tickets. Local stubs provided for early development.

---

## 12. Acceptance Criteria Mapping

All 26 acceptance criteria mapped to specific implementation locations.