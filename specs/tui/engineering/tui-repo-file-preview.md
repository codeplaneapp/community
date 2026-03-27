# Engineering Specification: TUI Repo File Preview

## Overview
This specification details the implementation of the `FilePreview` panel for the Codeplane TUI. The file preview occupies the main content area of the Code Explorer split view and renders file content with syntax highlighting, inline search, and comprehensive keyboard navigation.

## Component Architecture
- **Location**: `apps/tui/src/screens/Repository/CodeExplorer/FilePreview.tsx`
- **Props**:
  - `repo`: `{ owner: string, name: string }`
  - `changeId`: `string`
  - `filePath`: `string | null`
  - `isActive`: `boolean` (Focus state)
  - `onReturnToTree`: `() => void`
- **State**:
  - `searchActive`: `boolean`
  - `searchQuery`: `string`
  - `showLineNumbers`: `boolean` (Default: true)
  - `wordWrap`: `boolean` (Default: false)
  - `markdownMode`: `boolean` (Default: true for .md/.mdx)
- **Hooks**:
  - `useFileContent` (from `@codeplane/ui-core`)
  - `useTerminalDimensions` (from `@opentui/react`)
  - `useClipboard`

## Implementation Plan

### Step 1: Utility Functions
**File**: `apps/tui/src/utils/file-formatters.ts`
- Implement `formatFileSize(bytes: number): string` for human-readable sizes (e.g., "2.4 KB").
- Implement `formatLineCount(lines: number): string` for comma-formatting.
- Implement `truncatePath(path: string, maxWidth: number): string` to safely truncate from the left with `.../`.

### Step 2: Component Scaffolding
**File**: `apps/tui/src/screens/Repository/CodeExplorer/FilePreview.tsx`
- **FileHeader**: Flex row (height 1, bordered). Left-aligned truncated path. Right-aligned badges (BINARY, NON-UTF8), language, size, and line count.
- **FileBody**: Conditionally render centered text for Loading, Error, Empty, or Binary states. Otherwise, render `<scrollbox>` with `<code>` or `<markdown>`.

### Step 3: State & Data Fetching
- Integrate `useFileContent(repo.owner, repo.name, changeId, filePath)`.
- Derive and handle large files: If `lineCount > 100000` or `size > 5242880` (5MB), slice content to the first 10,000 lines. Append a "--- truncated ---" text block.

### Step 4: Search Logic
- Define `searchActive`, `searchQuery`, `currentMatchIndex`.
- Compute `highlightRanges` to pass into the `<code>` component's highlights prop.
- Create a `SearchInput` bar that mounts at the bottom (or top) of the view when `/` is active, rendering the `current/total` matches limit (max 10,000). Debounce large file searches by 150ms.

### Step 5: Keyboard Bindings
Map local keys using `useScreenKeybindings` when `isActive` is true:
- **Scroll**: `j`/`k` (line), `Ctrl+D`/`Ctrl+U` (page), `G`/`g g` (bounds).
- **Toggles**: `n` (line numbers), `w` (word wrap), `m` (markdown toggle).
- **Clipboard**: `y` (path), `Y` (content up to 1MB).
- **Search**: `/` (activate), `n`/`N` (next/prev match), `Esc` (clear).
- **Navigation**: `h` / `Left` calls `onReturnToTree()`.
- **Retry**: `R` calls the refetch method from data hook.

### Step 6: Responsive Behavior
- Use `useTerminalDimensions()` to dictate gutter width: 4 chars for `< 120` cols, 6 chars for `>= 120` cols.
- Re-calculate `truncatePath` limits synchronously on resize.

## Unit & Integration Tests

All tests must be added to `e2e/tui/repository.test.ts` using `@microsoft/tui-test`.

### 1. Rendering & Content Types (Snapshot)
- `file-preview-text-file`: Select `.ts`, assert header and `<code>` syntax highlighting.
- `file-preview-markdown-rendered`: Select `.md`, assert `<markdown>` structure.
- `file-preview-markdown-raw`: Toggle `m`, assert fallback to `<code>`.
- `file-preview-binary-file`: Select `.png`, assert BINARY badge and message.
- `file-preview-empty-file`: Select 0-byte file, assert "File is empty.".
- `file-preview-large-file-warning`: Assert truncation warning and 10K cutoff.
- `file-preview-non-utf8-badge`: Assert NON-UTF8 badge and replacements.

### 2. Keyboard Interactions
- `file-preview-scroll-down-up`: `j`, `k`, assert viewport shifts.
- `file-preview-scroll-page`: `Ctrl+D`, `Ctrl+U`, assert half-page jumps.
- `file-preview-toggles`: `w` (wrap), `n` (lines).
- `file-preview-copy-path`: `y`, assert clipboard holds file path.
- `file-preview-copy-content-rejected`: `Y` on binary, assert "Cannot copy binary".
- `file-preview-return-focus`: `h`, assert focus returns to file tree sidebar.
- `file-preview-retry-fetch`: Mock error, press `R`, assert refetch.

### 3. Search Mode
- `file-preview-search-flow`: `/`, type string, assert highlighting.
- `file-preview-search-navigation`: `n`, `N`, assert match index updates.
- `file-preview-search-clear`: `Esc`, assert search panel hides.

### 4. Layout Constraints
- `file-preview-80x24-layout`: Assert full width and 4-char gutter.
- `file-preview-120x40-layout`: Assert split view and 6-char gutter.
- `file-preview-resize-preserves-scroll`: Assert relative position is held during `SIGWINCH`.

### 5. Integration / Lifecycle
- `file-preview-network-error`: 500 API response, assert inline error.
- `file-preview-abort-race`: Select rapidly, assert AbortController cancels obsolete fetches.