# Implementation Plan: TUI Search Code Tab

## Phase 1: Utilities for Snippet Processing and Formatting

Based on the research context, we will place these utilities in `apps/tui/src/util/` to match the existing `truncate.ts` convention, rather than creating a new `utils/` directory.

### 1.1 Snippet Processing (`apps/tui/src/util/snippet.ts`)
Create a new file to handle Postgres `ts_headline()` HTML parsing and terminal soft-wrapping.

*   **`parseMatchHighlights(snippet: string)`:**
    *   Use a regex (e.g., `/<em\b[^>]*>(.*?)<\/em>/gi`) to find highlight tags.
    *   Iterate through matches to build a plain text string (stripping the tags) while calculating the exact `{ start, end }` indices for the stripped text.
    *   Return `{ plainText: string, highlights: Array<{ start: number, end: number }> }`.
*   **`formatSnippetLines(plainText: string, breakpoint: Breakpoint, terminalWidth: number)`:**
    *   Define max lines: `large` = 4, `standard` = 2, `minimum` = 0.
    *   If `minimum`, return an empty array.
    *   Replace literal `\t` with 4 spaces.
    *   Account for the gutter `│ ` (subtract 4 from `terminalWidth` for soft-wrapping).
    *   Split the text into lines, wrap/truncate to fit the line limit exactly, and return an array of formatted strings.

### 1.2 Path Truncation (`apps/tui/src/util/path.ts`)
Create a new file to handle path formatting, leveraging patterns from `util/truncate.ts`.

*   **`truncateFilePath(path: string, maxLength: number)`:**
    *   Split the path into directory parts and filename.
    *   If the total length exceeds `maxLength`, left-truncate the directory path (e.g., prepending `…/`) while fully preserving the filename.

### 1.3 Language Mapping (`apps/tui/src/util/language.ts`)
Create a new file to map extensions to Tree-sitter language identifiers.

*   **`getLanguageFromPath(path: string)`:**
    *   Extract the file extension.
    *   Map common extensions to OpenTUI supported languages (e.g., `.ts`/`.tsx` -> `typescript`, `.rs` -> `rust`, `.py` -> `python`, `.go` -> `go`).
    *   Return `undefined` or `text` as a fallback.

## Phase 2: `CodeResultRow` Component

### 2.1 Component Implementation (`apps/tui/src/components/search/CodeResultRow.tsx`)
Create the stateless row component for rendering individual code search results.

*   **Props:** `{ result: CodeSearchResult, focused: boolean, breakpoint: Breakpoint, width: number }`
*   **Header Line (Line 1):**
    *   Use `<box flexDirection="row" ...>` container.
    *   Apply reverse video (e.g., `inverse={true}` or background highlight) if `focused === true`.
    *   Render repository context (`owner/repo`) truncated to max 30 characters using `theme.muted`.
    *   Render the path using `truncateFilePath(result.path, breakpoint === 'minimum' ? 40 : 60)` in `theme.primary`.
*   **Snippet Block (Lines 2+):**
    *   If `breakpoint === 'minimum'`, render nothing for the snippet.
    *   If `result.snippet` is empty/null, render `<text color="muted">│ (no preview available)</text>`.
    *   Call `parseMatchHighlights(result.snippet)` to get `plainText` and `highlights`.
    *   Format lines using `formatSnippetLines(plainText, breakpoint, width)`.
    *   Render `<box flexDirection="row">` with a `<text color="border">│ </text>` gutter.
    *   Render the OpenTUI `<code>` component, passing `language={getLanguageFromPath(result.path)}`, `content={formattedText}`, and the `highlights` array formatted to apply `bold` and `theme.primary` to the matched ranges.

## Phase 3: Integration into `SearchScreen`

### 3.1 Screen Updates (`apps/tui/src/screens/Search/SearchScreen.tsx`)
Integrate the code tab into the existing Search screen. Note the path aligns with the research context.

*   **State Management:**
    *   Add `codeFocusedIndex` (default `0`) and `codeScrollPosition` (default `0`) to the component state.
*   **Data Hook Integration:**
    *   Extract `{ data: codeData, loading: codeLoading, error: codeError, fetchMore: loadMoreCode }` from the existing `useSearchTabs()` hook.
*   **Tab Registration:**
    *   Register `Code` as tab index 3 (the 4th tab).
    *   Update tab badges to format `codeData.total_count` (e.g., formatting `15000` to `15k+`).
*   **Keybindings (`useScreenKeybindings`):**
    *   Add conditional keybindings for `activeTab === 3`.
    *   `j` / `k` / `Down` / `Up`: Increment/decrement `codeFocusedIndex`, clamping between `0` and `codeData.items.length - 1`.
    *   `Enter`: Call `navigation.push('CodeExplorer', { owner: item.owner, repo: item.repo, path: item.path })` for the currently focused item.
    *   `R`: Trigger a data refetch if `codeError` is truthy.
*   **Rendering the Active Tab:**
    *   When `activeTab === 3`, render a `<scrollbox>` handling pagination (`onScrollToEnd={loadMoreCode}`).
    *   *Empty State:* If `codeData.items.length === 0 && !codeLoading`, show `<text>No code results for '{query}'.</text>`.
    *   *Error State:* If `codeError`, check for 429 status ("Rate limited. Retry in {N}s.") or general 500 error ("Code search failed. Press R to retry.").
    *   Map `codeData.items` to `<CodeResultRow>` components, passing down `breakpoint` and `width` from `useLayout()`. Add a "Loading more…" indicator at the bottom if `codeLoading` is true during pagination.

## Phase 4: Unit and E2E Testing

### 4.1 Unit Tests (`apps/tui/src/util/snippet.test.ts`)
*   Test `parseMatchHighlights`: Ensure it strips `<em>` and `</em>` correctly and returns accurate start/end indices for single and multiple matches. Test fallback behavior for malformed HTML.
*   Test `formatSnippetLines`: Verify that padding, truncation, and line counts (2 for standard, 4 for large) are strictly enforced. Verify `\t` replacement.

### 4.2 E2E Tests (`e2e/tui/search.test.ts`)
Using `@microsoft/tui-test` and the internal `launchTUI` wrapper:

*   **Snapshot Tests:**
    *   `SNAP-CODE-001`: Render at `TERMINAL_SIZES.standard` (120x40) to verify 2-line snippets and `│` gutter.
    *   `SNAP-CODE-002`: Render at `TERMINAL_SIZES.minimum` (80x24) to verify snippets are hidden.
    *   `SNAP-CODE-003`: Render at `TERMINAL_SIZES.large` (200x60) to verify 4-line snippets.
    *   `SNAP-CODE-004` to `006`: Verify empty state, error state, and rate-limit states.
    *   `SNAP-CODE-011`: Verify the `(no preview available)` state for empty snippets.
*   **Keyboard Interaction Tests:**
    *   `KEY-CODE-001`/`002`: Send `4` or `Tab` x3 to switch to the Code tab.
    *   `KEY-CODE-004`: Send `j`/`k` to verify selection movement across rows.
    *   `KEY-CODE-005`: Send `Enter` and verify the breadcrumb changes to `Search > owner/repo > path`.
*   **Responsive Tests:**
    *   `RESIZE-CODE-004`: Call `terminal.resize(80, 24)` and verify snippet hides but focus remains.
    *   `RESIZE-CODE-006`: Call `terminal.resize(200, 60)` and verify snippet expands to 4 lines.
*   **Integration Tests:**
    *   `INT-CODE-005`: Mock a 500 error for the code search endpoint. Verify the Issues tab still works, but the Code tab shows the isolated error state.
    *   `INT-CODE-013`: Assert that the final terminal snapshot contains the correct ANSI escape codes (`\x1b[1m` for bold, `\x1b[38;5;33m` for primary) over the matched text.
