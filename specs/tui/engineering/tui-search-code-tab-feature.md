# Engineering Specification: TUI Search Code Tab

## Overview
This specification details the implementation of the "Code" tab (tab 4) on the TUI search screen. It introduces multi-line code search results with dynamic syntax highlighting, match highlighting (parsing `<em>` tags), and responsive layout behavior based on terminal dimensions. It integrates with `@codeplane/ui-core`'s `useSearch` hook and handles independent pagination state.

## Implementation Plan

### Phase 1: Utilities for Snippet Processing and Formatting
**File:** `apps/tui/src/utils/snippet.ts` (New file)
- Implement `parseMatchHighlights(snippet: string)`:
  - Accepts a raw snippet containing `<em>` and `</em>` tags from PostgreSQL `ts_headline()`.
  - Strips the tags to produce plain text.
  - Returns `{ plainText: string, highlights: Array<{ start: number, end: number }> }`.
- Implement `formatSnippetLines(plainText: string, breakpoint: Breakpoint, terminalWidth: number)`:
  - Determines max visible lines based on breakpoint (`minimum`: 0, `standard`: 2, `large`: 4).
  - Handles soft-wrapping at `terminalWidth - 4` (accounting for the `│ ` gutter).
  - Replaces literal `\t` with 4 spaces.
  - Returns a truncated/padded string or array of strings to match the required line count precisely.

**File:** `apps/tui/src/utils/path.ts` (Update/New)
- Implement `truncateFilePath(path: string, maxLength: number)`:
  - Performs left-truncation, preserving the file name and as much of the parent directory path as possible, prepending `…/` if truncated.

**File:** `apps/tui/src/utils/language.ts` (New file)
- Implement `getLanguageFromPath(path: string)`:
  - Maps common file extensions (`.ts`, `.tsx`, `.py`, `.go`, `.rs`, `.js`, etc.) to language identifiers supported by OpenTUI's `<code>` component (Tree-sitter compatible names).

### Phase 2: `CodeResultRow` Component
**File:** `apps/tui/src/components/search/CodeResultRow.tsx` (New file)
- Create a functional component `CodeResultRow({ result, focused, breakpoint, width })`.
- **Header Line (Line 1):**
  - Render `<box flexDirection="row">`.
  - Condantly apply reverse video to the header line if `focused === true`.
  - Render repository context (`owner/repo`) truncated to 30 chars max using `theme.muted`.
  - Render the file path using `truncateFilePath` (max 60 for standard/large, 40 for minimum) using `theme.primary`.
- **Snippet Block (Lines 2+):**
  - If `breakpoint === "minimum"`, return null for the snippet section.
  - If `result.snippet` is empty, render `│ (no preview available)` in `theme.muted`.
  - Call `parseMatchHighlights` on `result.snippet`.
  - Render a `<box flexDirection="row">` containing the gutter `<text fg={theme.border}>│ </text>` alongside the OpenTUI `<code>` component.
  - Pass `language={getLanguageFromPath(result.path)}`, `content={plainText}`, and `highlights={highlights}` to the `<code>` component.
  - The `<code>` component's `highlights` array should map to the style required for bold + `primary` color.

### Phase 3: Integration into `SearchScreen`
**File:** `apps/tui/src/screens/SearchScreen.tsx`
- **State Additions:**
  - Add `codeFocusedIndex` (number, default 0).
  - Add `codeScrollPosition` (number, default 0).
- **Data Fetching:**
  - Consume `{ data: codeData, loading: codeLoading, error: codeError, fetchMore: loadMoreCode } = useSearch().searchCode`.
- **Tab Registration:**
  - Update tab logic to include `Code` as tab index 3 (4th tab).
  - Update tab badge rendering to format `codeData.total_count` (e.g., `> 9999` becomes `10k+`).
- **Render Active Tab:**
  - When `activeTab === 3`, render the `scrollbox` containing `CodeResultRow` components.
  - Add Empty State: If `codeData.items.length === 0 && !codeLoading`, render "No code results for '{query}'."
  - Add Error State: If `codeError`, render "Code search failed. Press R to retry." in red, or "Rate limited. Retry in {N}s." if it's a 429.
  - Add Loading More: Render "Loading more…" at the bottom when fetching pagination.
- **Keybindings Update:**
  - Modify `useScreenKeybindings` to conditionally route `j`/`k`/`Enter`/`G`/`gg`/`Ctrl+D`/`Ctrl+U` based on `activeTab`.
  - For `activeTab === 3`:
    - `j`/`k` increment/decrement `codeFocusedIndex`.
    - `Enter` calls `navigation.push('CodeExplorer', { owner, repo, path })` using the currently focused item.
    - `R` triggers a retry if `codeError` is present.
    - Clamp navigation within `0` and `codeData.items.length - 1`.
- **Resize Handling:**
  - Retrieve `width` and `breakpoint` from `useLayout()`. Ensure snippet lines dynamically update when terminal resizes. `Scrollbox` automatically adjusts, but we must clamp `codeFocusedIndex` if resize reduces the visible item count (though typically results length remains static on resize).

## Unit & Integration Tests

### Unit Tests
**File:** `apps/tui/src/utils/snippet.test.ts`
- `parseMatchHighlights`: 
  - Verifies extraction of plain text from HTML snippet with single and multiple `<em>` tags.
  - Verifies offset calculation (ranges) map precisely to the stripped text.
  - Verifies fallback if tags are malformed or missing.
- `formatSnippetLines`:
  - Verifies correct padding and truncation to exactly 2 lines (standard) and 4 lines (large).
  - Verifies tab-to-space replacement.

### E2E Tests
**File:** `e2e/tui/search.test.ts`

**1. Terminal Snapshot Tests**
- `SNAP-CODE-001`: Code tab renders at 120x40 with results (header + 2 lines snippet + `│` gutter).
- `SNAP-CODE-002`: Code tab renders at 80x24 with results (header only, no snippets).
- `SNAP-CODE-003`: Code tab renders at 200x60 with results (header + 4 lines snippet).
- `SNAP-CODE-004`: Code tab empty results state shows "No code results...".
- `SNAP-CODE-005`: Code tab error state shows "Code search failed. Press R to retry."
- `SNAP-CODE-006`: Code tab rate limit state shows "Rate limited. Retry in 30s."
- `SNAP-CODE-011`: Code snippet with empty snippet field shows "│ (no preview available)".

**2. Keyboard Interaction Tests**
- `KEY-CODE-001 / 002`: Key `4` or `Tab` switches to Code tab.
- `KEY-CODE-004`: `j`/`k` navigates between full results (skips over snippet lines).
- `KEY-CODE-005`: `Enter` on code result pushes `CodeExplorer` screen with `Search > owner/repo > path` breadcrumb.
- `KEY-CODE-006`: `q` from `CodeExplorer` pops back, preserving `Code` tab state (query, focus, scroll).
- `KEY-CODE-012`: `R` retries search when in error state.
- `KEY-CODE-020`: Pagination on scroll-to-end triggers page 2 fetch, appending elements natively.

**3. Responsive Tests**
- `RESIZE-CODE-004`: Resize 120x40 -> 80x24 dynamically hides snippets, retains focused result.
- `RESIZE-CODE-006`: Resize 120x40 -> 200x60 expands snippets from 2 to 4 lines.

**4. Integration & Data Hooks**
- `INT-CODE-001`: End-to-end code search flow: type query -> wait debounce -> press `4` -> verify result -> `Enter` to open -> `q` to return.
- `INT-CODE-003`: Pagination up to cap (scroll deeply to verify 300 item cap limit is respected, stopping requests at page 10).
- `INT-CODE-005`: Partial API failure. Validates that if the code API endpoint fails (500), issues/repos tabs still render their data gracefully while the Code tab displays its isolated error state.
- `INT-CODE-013`: Match highlighting end-to-end. Ensures server-sent `<em>term</em>` actually applies `bold` + `primary` ANSI codes in the final terminal buffer output.
