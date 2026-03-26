# Research Report: Search Inline Filter Infrastructure (`tui-search-filter-infrastructure`)

This document details the codebase context, established patterns, and existing constraints necessary to implement the Search Inline Filter Infrastructure as outlined in the engineering specification.

## 1. Architectural Reality & Missing Dependencies

Before implementing the requested files, it is crucial to understand the current state of the TUI codebase:
*   **`SearchScreen.tsx` does not exist yet:** The `apps/tui/src/screens/Search` directory is currently absent. The implementation of this ticket will involve scaffolding this directory or waiting for a parallel PR depending on sequence.
*   **`<ScrollableList>` is not implemented:** Exhaustive grep searches confirm that `<ScrollableList>` is documented in architecture specs as the standard list pattern, but `apps/tui/src/components/ScrollableList.tsx` is not yet checked in. The `FilterPickerModal` will need to use a temporary `<scrollbox>` and manual array mapping with `j/k` keyboard wiring, or stub the `<ScrollableList>` props for when the component lands.
*   **`@codeplane/ui-core` is currently mocked:** `apps/tui/package.json` does not currently import `@codeplane/ui-core`, and `apps/tui/src/providers/APIClientProvider.tsx` contains `// Mock implementation of APIClient since @codeplane/ui-core is missing`. Therefore, `useSearchFilters.ts` must purely manage UI/local state rather than integrating with real backend hooks right now.

## 2. State Management (`useSearchFilters.ts`)

*   **Pattern:** This should be a standard React hook living in `apps/tui/src/screens/Search/filters/useSearchFilters.ts`.
*   **Shape:** It must track distinct filter states per tab:
    *   `Issues`: `{ state: string, labels: string[], repo: string }`
    *   `Repos`: `{ visibility: string, language: string }`
    *   `Code`: `{ language: string, repo: string }`
*   **Exported API:** Should export `{ activeFilters, setFilter, clearFilters }` grouped by tab.

## 3. Responsive Layout (`SearchFilterBar.tsx`)

*   **Layout Context:** The TUI handles terminal resize events synchronously via the `useLayout()` hook located at `apps/tui/src/hooks/useLayout.ts`.
    *   It exposes `width`, `height`, and `breakpoint` (`"large" | "standard" | "minimum" | null`).
    *   **Condensed Format:** The engineering spec triggers condensed mode at `< 120` columns. This exactly matches the TUI's internal definition of the `"minimum"` breakpoint (80-119 columns). You should use `const { width } = useLayout(); const isCondensed = width < 120;`.
*   **Styling:** Use `useTheme()` from `apps/tui/src/hooks/useTheme.ts`. Map filter keys to `theme.primary` and delimiters (the `|` character) to `theme.border`.

## 4. Modal System Integration (`FilterPickerModal.tsx`)

*   **Existing Modal Pattern:** The TUI's modal system is driven by `OverlayManager.tsx` and `OverlayLayer.tsx` (found in `apps/tui/src/providers/` and `apps/tui/src/components/`).
*   **Actionable Next Steps for Modals:**
    1.  **Extend Overlay Types:** You must modify `apps/tui/src/providers/overlay-types.ts` to add `"filter-picker"` to the `OverlayType` union (`export type OverlayType = "help" | "command-palette" | "confirm" | "filter-picker";`).
    2.  **Add Custom Payload:** Expand the `OverlayContextType` to accept a custom payload for the filter picker (e.g., the options list, the filter key, whether it is multi-select, and an `onConfirm` callback) similar to how `confirmPayload` is handled.
    3.  **Render in Layer:** Update `OverlayLayer.tsx` to conditionally render `<FilterPickerModal />` when `activeOverlay === "filter-picker"`.
    4.  **Keybindings:** The `OverlayManager` automatically registers an `Esc` keybinding at `PRIORITY.MODAL` to close overlays. The `FilterPickerModal` will only need to register `Enter` (to confirm), `Space` (to toggle), and `/` (if focusing input) using `useScreenKeybindings` or local keyboard hooks.

## 5. Keybindings & Focus (`SearchScreen.tsx`)

*   **Hook Context:** The TUI registers contextual shortcuts via `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[])` from `apps/tui/src/hooks/useScreenKeybindings.ts`.
*   **Usage in Search:** In the parent `SearchScreen`, you will define keybindings like `f s` (Filter State) or `f l` (Filter Labels).
*   **Example Implementation:**
    ```typescript
    useScreenKeybindings([
      { 
        key: "f s", 
        description: "Filter state", 
        group: "Search", 
        handler: () => openOverlay("filter-picker", { type: "state", options: [...] }) 
      }
    ]);
    ```

## 6. End-to-End Testing (`e2e/tui/search.test.ts`)

*   **Test Environment:** The `e2e/tui/search.test.ts` file does not currently exist. You will need to create it.
*   **Testing Pattern:** Reference `e2e/tui/agents.test.ts` or `e2e/tui/diff.test.ts` for the `@microsoft/tui-test` setup.
*   Tests must simulate terminal layouts. You can initialize the terminal at 120x40 to test the Full format, and resize to 80x24 to verify the Condensed format.