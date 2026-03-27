# TUI_REPO_README_RENDER - Engineering Specification

## Overview

This specification outlines the implementation of the repository README rendering section within the Codeplane TUI's repository overview screen. The section dynamically fetches the repository's README, sanitizes the content, handles truncation for excessively large files, and elegantly renders both markdown and plaintext formats using OpenTUI components. It behaves smoothly within the parent screen's scrollbox and responds dynamically to terminal resize events.

## Implementation Plan

### 1. File Structure & Component Scaffold

Create a new component dedicated to rendering the README within the repository context.

*   **File:** `apps/tui/src/components/repository/RepoReadmeSection.tsx`
*   **Props:** `{ owner: string; repo: string }`
*   **Hooks Used:**
    *   `useRepoReadme(owner, repo)` from `@codeplane/ui-core` to fetch the data.
    *   `useTheme()` for accessing semantic color tokens (`border`, `muted`, `surface`).
    *   `useLayout()` for terminal `width` and `breakpoint` calculations.
    *   `useScreenKeybindings()` or equivalent priority keybinding hook to handle the `R` retry action and `e` code explorer navigation (if not already handled by the parent screen).

### 2. Content Processing & Sanitization

Within `RepoReadmeSection.tsx`, use a `useMemo` hook to process the raw content before passing it to the renderer.

1.  **ANSI Stripping:** Use a regular expression (e.g., `/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g`) to strip raw ANSI escape sequences from the fetched string to prevent terminal corruption.
2.  **Front Matter Stripping:** Detect and strip YAML front matter (content between `---` boundaries at the very beginning of the string).
3.  **Whitespace Check:** Trim the sanitized content. If the resulting string is empty, flag it as `empty-content`.
4.  **Truncation:** Split the content by `\n`. If the array length exceeds 10,000:
    *   Slice the array to 10,000 lines.
    *   Set a local `isTruncated` boolean to `true`.
    *   Join back to a string.

### 3. Rendering States

The component will render a sequence of boxes based on the current state.

*   **Separator:** Calculate `contentWidth = Math.max(0, width - 2)`. Render a `<box height={1}>` containing a `<text color={theme.border}>` with the character `─` repeated `contentWidth` times.
*   **Section Header:** A `<box flexDirection="row" gap={1}>` containing `<text bold>README</text>`. If `breakpoint !== "minimum"` and `filename` is populated, append `<text color={theme.muted}>{filename}</text>`.
*   **Loading State:** If `isLoading`, render `<text color={theme.muted}>Loading README…</text>`.
*   **Error State:** If `error`, render the error message. If the error is a 429 rate limit, display `Rate limited. Retry in X s.` (parsed from error). Otherwise, display `Unable to load README. Press R to retry.`
    *   *Interaction:* Register a contextual keybinding for `R` that calls the `refetch()` function provided by `useRepoReadme`.
*   **Empty State:** If `content === null`, render `<text color={theme.muted}>No README found.</text>`.
*   **Empty Content State:** If the sanitized content is purely whitespace, render `<text color={theme.muted}>Empty README.</text>`.
*   **Plaintext Rendering:** If `contentType === "plaintext"`, wrap the processed text in an OpenTUI `<code>` component to enforce preformatted monospace rendering.
*   **Markdown Rendering:** If `contentType === "markdown"`, wrap the text in an OpenTUI `<markdown>` component.
*   **Truncation Message:** If `isTruncated` is true, append a `<box marginTop={1}>` containing `<text color={theme.muted}>README truncated at 10,000 lines. View the full file in the code explorer.</text>`.

### 4. Integration into Repository Overview

*   **File:** `apps/tui/src/screens/RepoOverviewScreen.tsx`
*   **Action:** Import `RepoReadmeSection` and mount it as the final child element inside the main overview `<scrollbox>`.
*   **Scroll & Navigation:** Ensure the parent scrollbox maintains focus so that standard vim bindings (`j/k`, `Ctrl+D/U`, `G`, `gg`) continue to naturally scroll through the metadata and down into the README content. The `e` keybinding should ideally navigate to the Code Explorer, and if invoked while scrolled to the truncation message, pass `path: filename` to pre-select the README.

## Unit & Integration Tests

All tests will be implemented in `e2e/tui/repository.test.ts` using `@microsoft/tui-test` and mock API fixtures.

### Fixture Setups

Create dedicated mocked backend responses for:
1.  Standard `README.md` with full markdown features (headings, code blocks, tables, blockquotes, lists, bold/italic).
2.  Plaintext `README.txt` and extensionless `README`.
3.  Missing README (returns `null` / `404`).
4.  Huge README (> 10,050 lines) to trigger truncation.
5.  Malformed README with embedded ANSI codes and YAML front matter.
6.  Slow/hanging request to test the loading state.
7.  Failed request returning `500` to test the error state and `R` retry.

### Test Cases

*   **`readme-render-markdown-full`:** Navigate to the standard markdown repo fixture. Assert terminal snapshot matches expected layout at `120x40`. Verify headings, code blocks with `surface` backgrounds, and tables with box-drawing characters.
*   **`readme-render-plaintext-readme`:** Navigate to the plaintext repo fixture. Assert snapshot shows preformatted monospace text wrapped in a `<code>` block format without markdown formatting applied.
*   **`readme-render-no-readme`:** Navigate to the missing README fixture. Assert "No README found." appears in `muted` color beneath the separator.
*   **`readme-render-loading-state`:** Navigate to the slow request fixture. Assert "Loading README…" is visible while repo metadata is fully rendered above it.
*   **`readme-render-error-state`:** Navigate to the `500` error fixture. Assert "Unable to load README. Press R to retry." is displayed. Simulate pressing `R` and assert the loading state reappears.
*   **`readme-scroll-interactions`:** Navigate to a long README fixture. Simulate `j` (down), `k` (up), `Ctrl+D` (page down), and `G` (bottom). Assert via `getLine()` text matching that the viewport scrolls accurately through the content.
*   **`readme-large-file-truncation`:** Navigate to the >10,000 line fixture. Scroll to the bottom (`G`). Assert the presence of the "README truncated at 10,000 lines." message.
*   **`readme-ansi-stripped`:** Navigate to the malformed README fixture. Assert the rendered text does not contain escape characters and the layout is not corrupted.
*   **`readme-responsive-resize`:** Render the standard fixture at `120x40`. Simulate terminal resize to `80x24`. Assert via snapshot that the filename is hidden from the section label, code blocks truncate horizontally with `…`, and text cleanly wraps to the new `78` character content width.