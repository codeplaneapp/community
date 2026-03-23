# Research: TUI_SEARCH_INLINE_FILTER

## 1. Directory State & Dependencies
The target directory `apps/tui/src/screens/search/` and its testing file `e2e/tui/search.test.ts` do not currently exist. This aligns with the engineering spec marking prior search tickets (`tui-search-screen-feature`, `tui-search-filter-infrastructure`, etc.) as dependencies. The implementation of this ticket will involve creating these files and relying on existing TUI architecture patterns.

## 2. Filter State Management & Context Pattern
The codebase relies heavily on standard React Context for state management. The proposed `SearchFilterContext.tsx` should mirror patterns seen in existing providers like `apps/tui/src/providers/NavigationProvider.tsx`:
- Define the context interface (`SearchFilterContextType`).
- Export `SearchFilterContext = createContext<SearchFilterContextType | null>(null)`. 
- Export a `SearchFilterProvider` component that uses local `useState` for the `issues`, `repositories`, and `code` filter states.
- Provide a custom consumer hook `useSearchFilters()` that throws an error if used outside the provider.

## 3. Responsive Layout (Filter Bar)
The spec requires rendering different Filter Bar layouts based on terminal size (`< 120 cols` vs `>= 120 cols`). 
- **Existing Pattern:** The TUI abstracts OpenTUI's `useTerminalDimensions()` behind a centralized `useLayout()` hook located at `apps/tui/src/hooks/useLayout.ts`.
- Instead of reading dimensions directly, the `FilterBar.tsx` should call `const layout = useLayout();` and check `layout.width < 120` or evaluate `layout.breakpoint` (which categorizes into `minimum`, `standard`, `large`).

## 4. Overlay & Modal Patterns (FilterPicker)
The `FilterPicker.tsx` component must render over the TUI layout. 
- **Existing Pattern:** Follow the architecture of `apps/tui/src/components/OverlayLayer.tsx`.
- Use an absolutely positioned box: `<box position="absolute" top="auto" left="auto" zIndex={100} flexDirection="column" border={true}>`.
- Sizing should hook into the centralized `useLayout()` values: `const { modalWidth, modalHeight } = useLayout();` to dynamically assign `width={modalWidth as any}` and `height={modalHeight as any}`.

## 5. Keyboard Interaction & Status Bar Integration
The spec mandates registering keys like `f` globally across the search screen, and context-specific keys like `o`, `l`, `r`, `x` per tab.
- **Existing Pattern:** Keyboard bindings are registered via `apps/tui/src/hooks/useScreenKeybindings.ts` (`useScreenKeybindings`).
- This hook pushes a `PRIORITY.SCREEN` scope onto the global `KeybindingProvider` and takes an array of bindings: `{ key: "f", description: "Toggle filters", group: "Search", handler: () => setFilterBarVisible(v => !v) }`.
- **Bonus:** `useScreenKeybindings` automatically populates the status bar hints using the descriptions provided, seamlessly fulfilling the spec requirement to dynamically reflect available keys based on the active tab.

## 6. E2E Testing Ecosystem
The E2E tests for the TUI use a headless PTY framework wrapped in a helper module.
- **Existing Pattern:** Look at `e2e/tui/helpers.ts` which exports the `launchTUI()` function.
- **Interaction & Snapshots:** Tests in `e2e/tui/search.test.ts` will spawn an instance: `const tui = await launchTUI();`
- **Resizing Tests (SNAP-FILTER-018):** Use `await tui.resize(80, 24)` to programmatically trigger the responsive `< 120 cols` condensed format layout changes.
- **Flows:** You can sequence commands with `await tui.sendKeys('/', 'a', 'p', 'i', 'Enter', 'Tab', 'f', 'o', 'l')`.
- **Assertions:** Validate state changes with `await tui.waitForText('[Open]')` and layout with standard Jest matchers `expect(tui.snapshot()).toMatchSnapshot()`.