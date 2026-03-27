# Research Context: TUI Search Code Tab (TUI_SEARCH_CODE_TAB)

This document provides comprehensive research and context required to implement the TUI Search Code Tab feature based on the codebase's existing architecture, utility patterns, and shared packages.

## 1. Layout and Breakpoints (`useLayout`)

The application uses a synchronous, unified hook for responsive terminal dimensions which is required for Phase 1 (`formatSnippetLines`) and Phase 3 (`SearchScreen` resize handling).

**File:** `apps/tui/src/hooks/useLayout.ts`
- Returns `LayoutContext` containing:
  - `width: number` - Raw terminal width in columns.
  - `height: number` - Raw terminal height in rows.
  - `breakpoint: Breakpoint | null` - `"large" | "standard" | "minimum"`.
  - `contentHeight: number` - Safe height excluding header/status bar.

*Implementation Note:* For Phase 2 `CodeResultRow`, you should pass `breakpoint` and `width` down from `SearchScreen` to avoid calling `useLayout()` N times per row (as noted in `specs/tui/engineering/tui-search-result-row-components.md:1624`).

## 2. Text Truncation and Manipulation Utilities

Phase 1 requires creating utilities for path truncation and text snippet processing. The codebase already contains text manipulation primitives that establish the convention.

**File:** `apps/tui/src/util/truncate.ts` (and `apps/tui/src/util/text.ts`)
- Contains `truncateText(text: string, maxWidth: number)` which right-truncates and adds `…` (U+2026).
- Contains `truncateLeft(text: string, maxWidth: number)` which left-truncates and prepends `…`.
- Contains `wrapText(text: string, maxWidth: number)` which wraps on word boundaries.

*Implementation Note:* For `apps/tui/src/utils/path.ts`, you should create `truncateFilePath(path: string, maxLength: number)` following the `truncateLeft` pattern but ensuring it preserves the filename correctly, prepending `…/`.

## 3. Keyboard Input & Keybindings

Phase 3 requires adding specific vim-style keybindings (`j`/`k`/`Enter`/`G`/`gg`/`Ctrl+D`/`Ctrl+U`) dynamically when `activeTab === 3`.

**File:** `apps/tui/src/hooks/useScreenKeybindings.ts`
- **Hook signature:** `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[])`
- Registers keybinding scopes using `KeybindingContext` at `PRIORITY.SCREEN`.
- Handlers take a `description`, `group`, and `handler` callback.
- Uses `normalizeKeyDescriptor` internally to parse input like `"ctrl+u"`.

## 4. End-to-End Testing Infrastructure

The TUI E2E testing framework wraps `@microsoft/tui-test` and provides deterministic terminal emulation.

**File:** `e2e/tui/helpers.ts`
- **Launch:** Uses `launchTUI(options: LaunchTUIOptions)` which returns a `TUITestInstance`.
- **Sizes:** The `TERMINAL_SIZES` constant exports exact dimensions matching the breakpoint specs:
  - `minimum: { width: 80, height: 24 }`
  - `standard: { width: 120, height: 40 }`
  - `large: { width: 200, height: 60 }`
- **API:** The returned `terminal` instance exposes:
  - `sendKeys(...keys: string[])` - Handles both printable characters and named keys (e.g. `"Enter"`, `"Down"`, `"ctrl+c"`).
  - `waitForText(text: string)`
  - `snapshot()` - Returns the full visible terminal grid as a string.
  - `resize(cols, rows)` - Triggers `SIGWINCH` and resizes the PTY.

*Implementation Note:* For the E2E tests in `e2e/tui/search.test.ts`, use `await terminal.resize(TERMINAL_SIZES.large.width, TERMINAL_SIZES.large.height)` to trigger the `RESIZE-CODE-006` expansion test.

## 5. Search Data Layer Integration

According to `specs/tui/engineering/tui-search-data-hooks.md` and related reviews:
- The `SearchScreen` component should be located at `apps/tui/src/screens/Search/SearchScreen.tsx`.
- The search orchestration is handled by a local hook `useSearchTabs` inside `apps/tui/src/hooks/useSearchTabs.ts` that acts as an adapter over the `@codeplane/ui-core` API calls.
- The data type `CodeSearchResult` is defined in `apps/tui/src/hooks/useSearchTabs.types.ts`.

*Implementation Note:* In `SearchScreen.tsx`, check `codeData.items.length === 0 && !codeLoading` for the empty state. Map `codeError` (e.g. rate-limit `429` status) directly to the specific error text.

## 6. OpenTUI Component Usage

The `CodeResultRow` will need to compose standard OpenTUI primitives to match the `CodeSearchResult` shape:
- Use `<box flexDirection="row">` for layouts and gutters.
- Use `<code>` block provided by OpenTUI. Note that the engineering spec explicitly asks to map `<em>` highlights to `bold` + `theme.primary`. `parseMatchHighlights` should return the exact `{ start, end }` indices stripped of `<em>` tags to pass into the `<code>` component's `highlights` array.
- Apply reverse video conditionally in the row container if `focused` is true.