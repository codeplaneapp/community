# Implementation Plan: tui-repo-file-preview

This plan implements the `tui-repo-file-preview` feature, building out a read-only, keyboard-driven file preview panel with syntax highlighting, search, and clipboard capabilities for the Codeplane TUI.

## Step 1: File Metadata Utilities & Unit Tests
**Target:** `apps/tui/src/util/file-metadata.ts`
- Create pure functions for file type detection (`detectLanguage`, `isBinaryContent`, `isMarkdownFile`, `hasNonUtf8Content`).
- Define `LANGUAGE_MAP` for OpenTUI `<code>` component `filetype` mapping.
- Implement formatters (`formatFileSize`, `formatLineCount`) and truncators (`truncatePathFromLeft`, `truncateContent`).
- Add validation logic (`isPathSafe`).

**Tests:** `e2e/tui/util-file-metadata.test.ts`
- Write comprehensive unit tests for all pure functions as outlined in the spec.

## Step 2: Custom Hooks
**Target:** `apps/tui/src/hooks/useClipboard.ts`
- Implement a cross-platform clipboard hook using `Bun.which()` to detect `pbcopy`, `wl-copy`, `xclip`, `xsel`, or `clip.exe`, with an `osc52` fallback.
- Manage transient feedback state (clearing after 2s).

**Target:** `apps/tui/src/hooks/useFileSearch.ts`
- Create the hook managing search state (query, matches, current match, active state).
- Implement literal, case-insensitive substring matching. Debounce by 150ms for files over 5,000 lines.
- Export `computeMatches` separately for easier unit testing.

**Tests:** `e2e/tui/hooks-file-search.test.ts`
- Write unit tests for `computeMatches` boundary conditions and coordinate logic.

**Target:** `apps/tui/src/hooks/useCodeSyntaxStyle.ts`
- Follow `useDiffSyntaxStyle` pattern. Initialize a `SyntaxStyle` instance using `createDiffSyntaxStyle()` from `apps/tui/src/lib/diff-syntax.ts`.
- Ensure proper garbage collection via `styleRef.current.destroy()` on unmount.

**Target:** `apps/tui/src/hooks/index.ts`
- Export the new hooks.

## Step 3: Type Definitions Stub
**Target:** `apps/tui/src/hooks/repo-tree-types.ts` (Create if missing)
- Given that `packages/ui-core` integration is partially stubbed, create this file to export the `UseFileContentReturn` interface expected by the UI. Include properties like `content`, `isLoading`, `error`, and `refetch()`.

## Step 4: UI Components
**Target:** `apps/tui/src/components/FilePreviewHeader.tsx`
- Implement the pinned 1-row header displaying the file path, binary/non-utf8 badges, language, size, and line count.
- Use `useLayout()` to conditionally truncate the file path if terminal width is constrained.

**Target:** `apps/tui/src/components/FilePreviewBody.tsx`
- Build conditional rendering logic: Loading (spinner), Error (with retry hint), Binary/Empty states.
- For text files, use OpenTUI's `<scrollbox>` and `<code>`. Wire up `syntaxStyle` from `useCodeSyntaxStyle` and `filetype` from `LANGUAGE_MAP`.
- For markdown files (when in rendered mode), use `<markdown streaming={false}>`.

**Target:** `apps/tui/src/components/FilePreviewPanel.tsx`
- Orchestrate Header, Body, and Search bar.
- Register screen keybindings conditionally (`props.focused`) via `useScreenKeybindings`. Map vi-bindings (`j`, `k`, `n`, `N`, `/`, `y`, `Y`, `w`, `m`, `G`, `gg`).
- Use telemetry `emit` from `apps/tui/src/lib/telemetry.ts` to log view events, copies, and errors.
- Implement search input toggle and match highlighting logic.

**Target:** `apps/tui/src/components/index.ts`
- Export the new components.

## Step 5: Screen Integration
**Target:** `apps/tui/src/screens/Repository/CodeExplorerTab.tsx`
- Create the required screen scaffold since it doesn't exist yet.
- Implement a split layout: left side `FileTreePanel` (stubbed for now), right side `FilePreviewPanel`.
- Manage focus state between `tree` and `preview`.
- Handle rapid file selection utilizing an `AbortController` to cancel stale content fetches.

## Step 6: End-to-End Testing
**Target:** `e2e/tui/helpers.ts`
- Add `navigateToCodeExplorer` and `selectFileInTree` terminal automation helpers.

**Target:** `e2e/tui/repository.test.ts`
- Append the 78 specified E2E test cases covering snapshots, keyboard interactions, responsive scaling (e.g. `terminal.resize()`), and integration states.
- Ensure tests failing due to the mocked 501 Not Implemented backend are committed as failing, following the exact project mandate.