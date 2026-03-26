# Implementation Plan: TUI Repository README Rendering

**Ticket:** `tui-repo-readme-render`
**Title:** Repository README rendering section in overview
**Target Directory:** `apps/tui/src/` and `e2e/tui/`

This implementation plan breaks down the delivery of the README rendering section for the Codeplane TUI repository overview screen. It closely adheres to the engineering specification and research findings, utilizing OpenTUI components and maintaining high standards for robustness and performance.

## Step 1: Implement Content Sanitization Utilities

**File:** `apps/tui/src/util/readme.ts`

Create pure, unit-testable utility functions to process the raw README content before rendering.

1.  **Define `README_MAX_LINES`** set to `10000`.
2.  **Implement `stripAnsiEscapes(content: string)`**:
    *   Use a regex pattern to match and remove ANSI escape codes.
    *   Return an object containing the `cleaned` string and the `strippedCount`.
3.  **Implement `stripFrontMatter(content: string)`**:
    *   Check if the content begins with `---`.
    *   Find the closing `---` block and slice the content to remove the front matter block.
4.  **Implement `isEmptyContent(content: string | null)`**:
    *   Return true if content is null or whitespace-only.
5.  **Implement `truncateLines(content: string, maxLines: number)`**:
    *   Split the string by `\n`.
    *   If lines exceed `maxLines`, slice and rejoin, returning `wasTruncated: true`.
6.  **Implement `detectContentType(filename: string | null)`**:
    *   Return `"markdown"` for `.md` or `.markdown` extensions (case-insensitive).
    *   Return `"plaintext"` otherwise.
7.  **Implement `sanitizeReadmeContent(rawContent: string, maxLines: number = README_MAX_LINES)`**:
    *   Chain `stripAnsiEscapes`, `stripFrontMatter`, and `truncateLines`.
    *   Return an object with `content`, `wasTruncated`, `totalLines`, and `ansiStrippedCount`.

**File:** `apps/tui/src/util/index.ts`
*   Export all the functions created in `readme.ts`.

## Step 2: Implement Markdown Syntax Style Hook

**File:** `apps/tui/src/hooks/useMarkdownSyntaxStyle.ts`

Create a hook to manage the lifecycle of the OpenTUI `SyntaxStyle` instance required by `<markdown>` and `<code>`.

1.  Import `useMemo`, `useEffect`, `useRef` from `react`.
2.  Import `createDiffSyntaxStyle`, `detectColorTier`, and `ColorTier` from `../lib/diff-syntax.js`.
3.  Implement `useMarkdownSyntaxStyle(colorTier?: ColorTier)`:
    *   Instantiate the style using `createDiffSyntaxStyle(tier ?? detectColorTier())`.
    *   Store the instance in a `useRef`.
    *   **Crucial Lifecycle Management:** Provide a `useEffect` cleanup function that calls `styleRef.current?.destroy()` to prevent native memory leaks when the component unmounts.

**File:** `apps/tui/src/hooks/index.ts`
*   Export the `useMarkdownSyntaxStyle` hook.

## Step 3: Create the ReadmeSection Component

**File:** `apps/tui/src/screens/repo/ReadmeSection.tsx`

Build the UI component responsible for coordinating the README rendering state and sanitization.

1.  **Define `ReadmeSectionProps`** with `content`, `filename`, `isLoading`, `error`, `contentWidth`, `breakpoint`, `theme`, `syntaxStyle`, and `repoFullName`.
2.  **Implement `deriveReadmeState`** (pure function):
    *   Map incoming props to discrete states: `loading`, `markdown`, `plaintext`, `empty`, `empty-content`, `error`, `rate-limited`.
3.  **Implement `ReadmeSection`**:
    *   Use `useMemo` to run `sanitizeReadmeContent(content, README_MAX_LINES)`.
    *   Log warnings using `logger.warn()` (from `../../lib/logger.js`) if `ansiStrippedCount > 0` or if `wasTruncated` is true.
    *   Compute `retryAfterSeconds` from `error.retryAfterMs` for 429 errors.
    *   Define `tableOptions` memoized on `theme.border` for the `<markdown>` component.
    *   Render a separator line based on `contentWidth`.
    *   Render the section label conditionally showing the filename based on `breakpoint`.
    *   Use a switch/conditional logic over the derived state to render `<text>` statuses, `<code>` blocks (for plaintext), or the OpenTUI `<markdown>` primitive.
    *   Ensure the component uses a standard React Fragment `<>` at the root to inherit scrolling from the parent `<scrollbox>`.

**File:** `apps/tui/src/screens/repo/index.ts`
*   Create a barrel export for `ReadmeSection` and `ReadmeSectionProps`.

## Step 4: Integrate with RepoOverviewScreen

**File:** `apps/tui/src/screens/RepoOverviewScreen.tsx`

Modify the existing repo overview to embed the `ReadmeSection`.

1.  **Imports:**
    *   Import `ReadmeSection`.
    *   Import `useMarkdownSyntaxStyle` and `useColorTier`.
    *   Import telemetry module, aliasing `emit` to `trackEvent`: `import { emit as trackEvent } from "../../lib/telemetry.js"`.
2.  **Hooks Integration:**
    *   Call `useColorTier()` and `useMarkdownSyntaxStyle(colorTier)`.
    *   Destructure `{ content, filename, isLoading, error, refetch }` from the existing `useRepoReadme` hook.
    *   Calculate `contentWidth` using `useMemo` based on `useLayout().width - 2` (accounting for padding).
3.  **Keybindings:**
    *   Update the `R` key handler to isolate README retries: if `readmeError` exists but no metadata error exists, call `refetchReadme()` directly without refetching repo metadata.
    *   Update the `e` (code explorer) key handler to pass `selectedFile: readmeFilename` to the navigator context if it's available.
4.  **Telemetry:**
    *   Add a `useEffect` depending on `readmeLoading`, `readmeContent`, and `readmeError` to trigger `trackEvent` for `tui.repo.readme.loaded`, `tui.repo.readme.error`, or `tui.repo.readme.not_found`.
5.  **Render Replacement:**
    *   Replace the placeholder `{/* ── README ── */}` comment block with `<ReadmeSection />` passing in the appropriate state, style, theme, and geometry props.

## Step 5: Implement E2E Tests

**File:** `e2e/tui/repository.test.ts`

Write extensive end-to-end testing targeting the TUI.

1.  **Setup:** Import `@microsoft/tui-test` helpers (`launchTUI`, etc.). Define a `navigateToRepo` helper function.
2.  **Snapshot Tests (`TUI_REPO_README_RENDER — snapshot tests`):**
    *   Write tests to match terminal visual states for heading levels, fenced code blocks, blockquotes, tables, lists, links, images, horizontal rules, and bold/italic formatting.
    *   Include tests for edge cases: plaintext READMEs, empty READMEs, 500 errors, 429 rate limit errors.
    *   Ensure snapshots verify layout constraints like the horizontal separator line.
3.  **Keyboard Interaction Tests (`TUI_REPO_README_RENDER — keyboard interaction tests`):**
    *   Simulate keys `j`, `k`, `ctrl+d`, `ctrl+u`, `G`, and `gg` to assert scroll positions map effectively.
    *   Test `R` key behavior (full refresh vs. isolated README retry).
    *   Test `e` key behavior routing to the code explorer.
4.  **Responsive Tests (`TUI_REPO_README_RENDER — responsive tests`):**
    *   Launch the TUI with different grid sizes (e.g., 80x24, 120x40, 200x60) and verify truncations and label collapses.
    *   Simulate live resizing (`tui.resize()`) to assert re-layout mechanisms.
5.  **Integration Tests (`TUI_REPO_README_RENDER — integration tests`):**
    *   Test concurrent fetching behavior.
    *   Test 401 unauthenticated propagation.
    *   Test large file truncation (files > 10,000 lines).
    *   Test ANSI stripping outputs to guarantee no injection or color distortion occurs.

*Note: Tests failing due to an unimplemented backend must be left failing (no skipped tests).* 
