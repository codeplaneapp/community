# Implementation Plan: Search Inline Filter Infrastructure

This document outlines the step-by-step implementation for the `tui-search-filter-infrastructure` ticket, adhering to the Codeplane TUI architecture, existing components, and terminal constraints.

## Phase 1: State Management

### 1. Create Filter Types and State Hook
**File:** `apps/tui/src/screens/Search/filters/useSearchFilters.ts`

*   **Action:** Define the TypeScript interfaces for the filter domains:
    *   `IssueFilters`: `{ state?: string; labels?: string[]; repo?: string; }`
    *   `RepoFilters`: `{ visibility?: string; language?: string; }`
    *   `CodeFilters`: `{ language?: string; repo?: string; }`
    *   `SearchTab`: `"issues" | "repos" | "code" | "users"`
*   **Action:** Implement the `useSearchFilters` hook.
    *   Initialize state for each tab using `useState` or a `useReducer`.
    *   Provide `setFilter(tab, key, value)` to update specific filter keys.
    *   Provide `clearFilters(tab)` to reset a tab's filters to default/empty.
    *   Provide `getActiveFilters(tab)` returning the current filter state for a given tab.
    *   Ensure state is isolated per tab so switching tabs doesn't pollute the context.

## Phase 2: Modal Infrastructure Extension

### 1. Update Overlay Types
**File:** `apps/tui/src/providers/overlay-types.ts`

*   **Action:** Add `"filter-picker"` to the `OverlayType` union.
*   **Action:** Define `FilterPickerPayload` interface:
    *   `options: { label: string; value: string }[]`
    *   `filterKey: string`
    *   `multiSelect?: boolean`
    *   `onConfirm: (values: string | string[]) => void`
*   **Action:** Update `OverlayContextType` to include `filterPickerPayload?: FilterPickerPayload`.

### 2. Update Overlay Layer
**File:** `apps/tui/src/components/OverlayLayer.tsx`

*   **Action:** Import the soon-to-be-created `FilterPickerModal`.
*   **Action:** Add a conditional render block for `activeOverlay === "filter-picker"`, passing the `filterPickerPayload` to the `FilterPickerModal` component.

## Phase 3: UI Components

### 1. Implement `FilterPickerModal`
**File:** `apps/tui/src/screens/Search/filters/FilterPickerModal.tsx`

*   **Action:** Create a modal overlay using OpenTUI `<box>` (absolute positioning, centered, 60% width/height, single border).
*   **Action:** Implement an `<input>` for fuzzy-search text entry at the top of the modal.
*   **Action:** Implement a local state `query` updated by the `<input>` to filter the `options` passed via props/payload.
*   **Action:** Implement a `<scrollbox>` below the input to display the filtered options.
*   **Action:** Wire up `useKeyboard` or contextual keybindings:
    *   `j` / `k` (or `Up`/`Down`) to move the active selection cursor within the `<scrollbox>`.
    *   `Space` to toggle selection if `multiSelect` is true.
    *   `Enter` to confirm the selection, trigger `onConfirm`, and close the overlay (via `closeOverlay()`).
    *   `/` to return focus to the `<input>`.

### 2. Implement `SearchFilterBar`
**File:** `apps/tui/src/screens/Search/filters/SearchFilterBar.tsx`

*   **Action:** Accept props: `activeTab: SearchTab`, `filters: Record<string, any>`.
*   **Action:** Consume the `useLayout()` hook to determine responsiveness (`const isCondensed = width < 120`).
*   **Action:** Consume the `useTheme()` hook for color tokens (`theme.primary` for keys, `theme.border` for delimiters).
*   **Action:** Render logic:
    *   If `Object.keys(filters).length === 0`, render nothing or a subtle "Press `f` to filter" hint.
    *   If `isCondensed`: Render abbreviated chips (e.g., `s:open | l:bug`).
    *   If `!isCondensed`: Render full chips (e.g., `state: open | labels: bug, p1`).
*   **Action:** Use an OpenTUI horizontal `<box flexDirection="row" gap={1}>` to lay out the filter chips.

## Phase 4: Integration (Prep for SearchScreen)

### 1. Scaffolding `SearchScreen` Integration (Draft)
**File:** `apps/tui/src/screens/Search/SearchScreen.tsx` (or index.tsx)

*   **Action:** Create the shell for `SearchScreen` if it doesn't exist, initializing `useSearchFilters()`.
*   **Action:** Render `<SearchFilterBar>` directly underneath the tab navigation.
*   **Action:** Use `useScreenKeybindings` to register the `f` prefix chords (e.g., `f s` for State, `f l` for Labels) which trigger `openOverlay("filter-picker", { ...payload })`.

## Phase 5: End-to-End Testing

### 1. Create Search E2E Test Suite
**File:** `e2e/tui/search.test.ts`

*   **Action:** Setup the `@microsoft/tui-test` framework scaffold.
*   **Action:** Write Test 1: **Filter Bar Rendering & Responsiveness**.
    *   Mock layout to 120x40.
    *   Set active filter state programmatically or via keypress.
    *   Assert full layout format exists in snapshot/text.
    *   Resize to 80x24 and assert condensed format.
*   **Action:** Write Test 2: **Modal Navigation & Fuzzy Search**.
    *   Simulate keypress `f l` to open label picker.
    *   Simulate typing "bug" into the `<input>`.
    *   Simulate `j`, `Space`, `Enter`.
    *   Assert the `SearchFilterBar` updates with the chosen label.
*   **Action:** Write Test 3: **Tab-Local State Isolation**.
    *   Set filter on `issues` tab.
    *   Switch to `repos` tab.
    *   Assert filter bar clears.
    *   Pop screen and reopen.
    *   Assert all filters are reset.