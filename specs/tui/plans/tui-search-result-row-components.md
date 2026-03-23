# Implementation Plan: TUI Search Result Row Renderers

**Ticket:** `tui-search-result-row-components`

This plan outlines the step-by-step implementation of the search result row components and their required utilities based on the engineering specification.

## Phase 1: Shared Formatting & Layout Utilities

**1. Add Path Truncation Utility**
*   **File:** `apps/tui/src/util/text.ts`
*   **Action:** Add the `truncatePathLeft(path: string, maxWidth: number): string` function.
*   **Details:** Implement left-truncation using `.../` to preserve the rightmost file segments.

**2. Add Relative Time Formatter**
*   **File:** `apps/tui/src/util/format.ts` (Create if it does not exist)
*   **Action:** Add the `formatRelativeTime(isoTimestamp: string): string` function.
*   **Details:** Implement relative formatting logic (e.g., "just now", "5m ago", "3h ago", "2d ago").

**3. Create Search Results Directory**
*   **Action:** `mkdir -p apps/tui/src/screens/Search/results`

**4. Implement Highlight Parser**
*   **File:** `apps/tui/src/screens/Search/results/highlight.ts`
*   **Action:** Implement `parseHighlights`, `plainTextLength`, and `truncateHighlighted`.
*   **Details:** Pure functions to parse `<em>` tags from search API responses into styled `TextSegment` objects.

**5. Implement Column Width Calculators**
*   **File:** `apps/tui/src/screens/Search/results/columns.ts`
*   **Action:** Implement `getColumnVisibility` and the four per-type width calculators (`repoColumnWidths`, `issueColumnWidths`, `userColumnWidths`, `codeColumnWidths`).
*   **Details:** Handles responsive visibility and sizing rules based on `minimum`, `standard`, and `large` terminal breakpoints.

## Phase 2: Data Types Configuration

**1. Update Search Types**
*   **File:** `apps/tui/src/hooks/useSearchTabs.types.ts` (Create if scaffold is missing)
*   **Action:** Ensure the `RepositorySearchResult`, `IssueSearchResult`, `UserSearchResult`, and `CodeSearchResult` interfaces exist.
*   **Details:** Crucially, ensure `RepositorySearchResult` includes `star_count?: number;` and `language?: string;` as optional properties.

## Phase 3: Row Components Implementation

**1. Implement Repo Result Row**
*   **File:** `apps/tui/src/screens/Search/results/RepoResultRow.tsx`
*   **Action:** Build `RepoResultRow`.
*   **Details:** Include module-private helpers `formatTopics` and `formatCompactNumber`. Utilize `repoColumnWidths` for layout. Render full repo context, description, stars, and topics depending on available space.

**2. Implement Issue Result Row**
*   **File:** `apps/tui/src/screens/Search/results/IssueResultRow.tsx`
*   **Action:** Build `IssueResultRow`.
*   **Details:** Utilize `statusToToken` from theme tokens to color the state badge. Use `issueColumnWidths` and `formatRelativeTime`.

**3. Implement User Result Row**
*   **File:** `apps/tui/src/screens/Search/results/UserResultRow.tsx`
*   **Action:** Build `UserResultRow`.
*   **Details:** Simplest row. Displays username and display name with `userColumnWidths`.

**4. Implement Code Result Row**
*   **File:** `apps/tui/src/screens/Search/results/CodeResultRow.tsx`
*   **Action:** Build `CodeResultRow`.
*   **Details:** Rendered as 2 rows tall (`height={2}`). Include the module-private helper `parseSnippetLine` to extract line numbers. Use `truncatePathLeft` for the file path header and apply highlight segments to the code snippet line with a visual gutter.

**5. Create Barrel Exports**
*   **File:** `apps/tui/src/screens/Search/results/index.ts`
*   **Action:** Export all four row components, their prop types, the highlight parsing utilities, and the column width/visibility functions.

## Phase 4: Testing & Verification

**1. Implement Utility Unit Tests**
*   **File:** `e2e/tui/search-result-utils.test.ts`
*   **Action:** Implement test blocks for `parseHighlights`, `plainTextLength`, `truncateHighlighted`, `getColumnVisibility`, `repoColumnWidths`, `issueColumnWidths`, `truncatePathLeft`, and `formatRelativeTime`.
*   **Details:** Validate pure logic, edge cases, and math without React overhead.

**2. Implement Component Verification & E2E Skeleton**
*   **File:** `e2e/tui/search.test.ts`
*   **Action:** Implement tests checking for file existence, proper barrel exports, successful TypeScript compilation, responsive column visibility configurations, and highlight utility behavior inside the full app context.
*   **Details:** Confirm types pass check via `bun run check`. Visual snapshots will fail gracefully or remain pending until `SearchScreen` scaffolding is finished in a follow-up task.

## Acceptance Criteria Check
*   Ensure no UI dependencies or React hooks are placed in pure calculation files (`columns.ts`, `highlight.ts`).
*   Verify `CodeResultRow` accurately enforces `height={2}` on its outer `<box>` and is equipped to render properly with `rowHeight={2}` in a list.
*   Ensure fallback rendering logic works for components hiding columns at the `minimum` threshold.