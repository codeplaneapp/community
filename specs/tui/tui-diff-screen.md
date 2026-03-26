# Engineering Specification: TUI_DIFF_SCREEN — Complete Diff Screen Lifecycle and Integration

| Field | Value |
|-------|-------|
| Ticket | `tui-diff-screen` |
| Status | Not started |
| Dependencies | `tui-diff-screen-scaffold`, `tui-diff-data-hooks` |
| Target | `apps/tui/src/screens/DiffScreen/` |
| Tests | `e2e/tui/diff.test.ts` |

---

## 1. Overview

This specification defines the complete implementation of the diff screen: the full-screen diff viewer in the Codeplane TUI. The diff screen is pushed onto the navigation stack when a user examines file-level changes from a jj change, a landing request, or via deep link. It is the primary code review surface in the terminal.

The screen integrates with the existing navigation stack (`NavigationProvider`), keybinding priority system (`KeybindingProvider`), layout system (`useLayout`), loading infrastructure (`useScreenLoading`), telemetry system (`emit`), and syntax highlighting infrastructure (`useDiffSyntaxStyle`) that are already implemented in the TUI codebase. It consumes `useChangeDiff` and `useLandingDiff` from `@codeplane/ui-core` for data fetching and renders diffs using OpenTUI's `<diff>` component.

### Scope

**In scope:**
- DiffScreen component with sidebar + main content layout
- Data fetching via `useChangeDiff` / `useLandingDiff` hooks
- Full keybinding registration for all diff operations
- Navigation entry from change list, landing detail, command palette, and deep link
- View mode toggling (unified/split) with terminal width gating
- Whitespace toggle with API re-fetch
- Hunk expand/collapse state management
- File tree sidebar with change type indicators
- Inline comment support for landing diffs
- Loading, error, empty, and edge-case states
- Telemetry event emission
- State cleanup on unmount

**Out of scope:**
- Data hook implementations (`useChangeDiff`, `useLandingDiff`) — covered by `tui-diff-data-hooks`
- Scaffolded directory/file structure — covered by `tui-diff-screen-scaffold`
- Syntax highlighting infrastructure — already implemented (`useDiffSyntaxStyle`, `lib/diff-syntax.ts`)

---

## 2. File Inventory

### New files (12)

| File | Purpose | Approx. lines |
|------|---------|---------------|
| `apps/tui/src/screens/DiffScreen/types.ts` | Type definitions for diff screen state, props, and data models | 120 |
| `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` | Root screen component: orchestrates layout, data loading, keybindings, focus model | 350 |
| `apps/tui/src/screens/DiffScreen/DiffFileTree.tsx` | File tree sidebar component with change type icons, stats, and navigation | 180 |
| `apps/tui/src/screens/DiffScreen/DiffContentArea.tsx` | Main diff content area: renders `<diff>` per file, handles scroll, hunk state | 280 |
| `apps/tui/src/screens/DiffScreen/CommentForm.tsx` | Inline comment creation overlay for landing diffs | 120 |
| `apps/tui/src/screens/DiffScreen/keybindings.ts` | Keybinding definitions and factory function | 160 |
| `apps/tui/src/screens/DiffScreen/useDiffData.ts` | Orchestrates `useChangeDiff`/`useLandingDiff` selection, whitespace param, caching | 130 |
| `apps/tui/src/screens/DiffScreen/useHunkCollapse.ts` | Hunk expand/collapse state management per file | 80 |
| `apps/tui/src/screens/DiffScreen/useWhitespaceToggle.ts` | Whitespace toggle state with debounced re-fetch | 60 |
| `apps/tui/src/screens/DiffScreen/telemetry.ts` | Telemetry event helpers and session tracking | 110 |
| `apps/tui/src/screens/DiffScreen/index.ts` | Public barrel export of DiffScreen component | 5 |
| `apps/tui/src/commands/diff.ts` | Command palette entry for `:diff owner/repo change_id` | 50 |

### Modified files (4)

| File | Change | Impact |
|------|--------|--------|
| `apps/tui/src/router/registry.ts` | Replace `PlaceholderScreen` with `DiffScreen` for `ScreenName.DiffView` entry; update `breadcrumbLabel` to show contextual label based on params | Low risk — single entry change |
| `apps/tui/src/navigation/deepLinks.ts` | Add `"diff"` to `resolveScreenName()` map; add `--change` and `--landing` CLI arg handling to `buildInitialStack()` | Low risk — additive to existing map |
| `apps/tui/src/lib/terminal.ts` | Add `change` and `landing` to `TUILaunchOptions` interface; parse `--change` and `--landing` from CLI args | Low risk — additive field parsing |
| `apps/tui/src/index.tsx` | Pass `change` and `landing` from parsed CLI args to `buildInitialStack()` deep link args | Low risk — additive param pass-through |

---

## 3. Type Definitions

### `types.ts`

```typescript
import type { ScreenComponentProps } from "../../router/types.js";

// ── Data models ──────────────────────────────────────────────────

/** Change type for a file in a diff */
export type FileChangeType = "added" | "deleted" | "modified" | "renamed" | "copied";

/** A single file entry in the diff response */
export interface FileDiffItem {
  /** File path (new path for renames) */
  path: string;
  /** Old path (only for renamed/copied files) */
  old_path?: string;
  /** Change type */
  change_type: FileChangeType;
  /** Number of added lines */
  additions: number;
  /** Number of deleted lines */
  deletions: number;
  /** Unified diff patch content */
  patch: string | null;
  /** Whether the file is binary */
  is_binary: boolean;
  /** Language identifier from the API */
  language: string | null;
  /** File mode (e.g., "100644") */
  mode?: string;
  /** Old file mode (if changed) */
  old_mode?: string;
  /** Patch size in bytes (for size gating) */
  patch_size_bytes?: number;
}

/** Parsed diff response */
export interface DiffData {
  files: FileDiffItem[];
  total_additions: number;
  total_deletions: number;
}

// ── Screen params ────────────────────────────────────────────────

/** Source discriminator: which hook + API endpoint to use */
export type DiffSource =
  | { kind: "change"; owner: string; repo: string; change_id: string }
  | { kind: "landing"; owner: string; repo: string; number: number };

/** Props derived from ScreenComponentProps.params */
export interface DiffScreenParams {
  owner: string;
  repo: string;
  /** Present when viewing a single change diff */
  change_id?: string;
  /** Present when viewing a landing request diff */
  landing_number?: string;
}

// ── UI state ─────────────────────────────────────────────────────

export type ViewMode = "unified" | "split";
export type FocusZone = "tree" | "content";

/** Complete screen-level state */
export interface DiffScreenState {
  viewMode: ViewMode;
  sidebarVisible: boolean;
  whitespaceVisible: boolean;
  focusedFileIndex: number;
  focusZone: FocusZone;
  scrollPosition: number;
}

/** Hunk collapse tracking: Map<filePath, Set<hunkIndex>> */
export type HunkCollapseMap = Map<string, Set<number>>;

// ── Comment form ─────────────────────────────────────────────────

export interface CommentFormState {
  visible: boolean;
  filePath: string;
  lineNumber: number;
  side: "old" | "new";
  body: string;
}

export interface InlineComment {
  id: string;
  author: string;
  body: string;
  created_at: string;
  file_path: string;
  line_number: number;
  side: "old" | "new";
}

// ── Constants ────────────────────────────────────────────────────

/** Minimum terminal width to allow split view */
export const SPLIT_VIEW_MIN_COLS = 120;

/** Maximum files rendered before truncation */
export const MAX_RENDERED_FILES = 500;

/** File count warning threshold */
export const LARGE_DIFF_WARNING_THRESHOLD = 200;

/** Maximum file patch size before "too large" notice (1 MB) */
export const MAX_FILE_PATCH_BYTES = 1_048_576;

/** Maximum total diff response size (10 MB) */
export const MAX_DIFF_TOTAL_BYTES = 10_485_760;

/** Maximum comment body characters */
export const MAX_COMMENT_BODY_CHARS = 50_000;

/** Maximum username display width */
export const MAX_USERNAME_DISPLAY = 39;

/** Maximum file path storage length */
export const MAX_PATH_LENGTH = 4_096;

/** Diff data cache TTL in milliseconds (30 seconds) */
export const DIFF_CACHE_TTL_MS = 30_000;

/** Whitespace toggle re-fetch debounce (ms) */
export const WHITESPACE_DEBOUNCE_MS = 300;

/** View mode toggle debounce (ms) */
export const VIEW_TOGGLE_DEBOUNCE_MS = 100;

/** Large hunk virtual scroll threshold (lines) */
export const VIRTUAL_SCROLL_THRESHOLD = 500;

/** Context lines around hunks by breakpoint */
export const CONTEXT_LINES = {
  minimum: 3,
  standard: 3,
  large: 5,
} as const;

/** Line number gutter width by breakpoint (characters) */
export const GUTTER_WIDTH = {
  minimum: 4,
  standard: 5,
  large: 6,
} as const;
```

---

## 4. Component Architecture

### 4.1 Component Tree

```
DiffScreen (root)
├── useDiffData()                     — data orchestration
├── useHunkCollapse()                 — hunk state management
├── useWhitespaceToggle()             — whitespace state + debounced refetch
├── useDiffSyntaxStyle()              — syntax highlighting (existing)
├── useScreenLoading()                — loading lifecycle (existing)
├── useScreenKeybindings()            — keybinding registration (existing)
├── useLayout()                       — responsive dimensions (existing)
├── DiffTelemetryTracker              — session telemetry
│
├── [loading] FullScreenLoading       — "Loading diff…" (existing component)
├── [error]   FullScreenError         — error with retry (existing component)
├── [empty]   EmptyDiffNotice         — "No file changes."
│
├── <box flexDirection="row">
│   ├── DiffFileTree                  — left sidebar (25%)
│   │   └── <scrollbox>
│   │       └── FileTreeEntry × N
│   │
│   └── DiffContentArea               — main content (75%)
│       └── <scrollbox>
│           └── FileDiffBlock × N
│               ├── FileHeader
│               ├── <diff> / BinaryNotice / ErrorNotice
│               └── InlineComment × M (landing only)
│
└── [overlay] CommentForm             — modal comment creation
```

### 4.2 `DiffScreen.tsx` — Root Component

The root component is the `ScreenName.DiffView` screen registered in `screenRegistry`. It receives `ScreenComponentProps` from the `ScreenRouter`.

**Responsibilities:**
1. Parse `DiffScreenParams` from `entry.params`
2. Derive `DiffSource` discriminant (`change` vs `landing`)
3. Orchestrate data loading via `useDiffData()`
4. Manage screen-level UI state (`viewMode`, `focusZone`, `focusedFileIndex`, `sidebarVisible`, `whitespaceVisible`)
5. Register all keybindings via `useScreenKeybindings()`
6. Render layout: sidebar + content (or full-width if sidebar hidden)
7. Handle focus delegation between `DiffFileTree` and `DiffContentArea`
8. Manage `CommentForm` overlay visibility
9. Emit telemetry on mount/unmount/interactions
10. Clean up all state on unmount (collapse state, whitespace toggle, scroll position, syntax style)

**State initialization:**

```typescript
function DiffScreen({ entry, params }: ScreenComponentProps) {
  const layout = useLayout();
  const { width, breakpoint, sidebar } = layout;

  // Derive source from params
  const source = useMemo((): DiffSource => {
    if (params.landing_number) {
      return { kind: "landing", owner: params.owner, repo: params.repo, number: parseInt(params.landing_number, 10) };
    }
    return { kind: "change", owner: params.owner, repo: params.repo, change_id: params.change_id ?? "" };
  }, [params]);

  // View mode — default unified; auto-switch to unified if terminal shrinks below 120
  const [viewMode, setViewMode] = useState<ViewMode>("unified");
  const [focusZone, setFocusZone] = useState<FocusZone>("content");
  const [focusedFileIndex, setFocusedFileIndex] = useState(0);
  const [commentFormState, setCommentFormState] = useState<CommentFormState | null>(null);

  // Whitespace toggle with debounced re-fetch
  const whitespace = useWhitespaceToggle();

  // Data loading
  const { data, isLoading, error, refetch } = useDiffData(source, {
    ignoreWhitespace: !whitespace.visible,
  });

  // Hunk collapse state (reset on data change)
  const hunkCollapse = useHunkCollapse();

  // Syntax highlighting
  const syntaxStyle = useDiffSyntaxStyle();

  // Screen loading lifecycle
  const screenLoading = useScreenLoading({
    id: "diff-screen",
    label: "Loading diff…",
    isLoading,
    error,
    onRetry: refetch,
  });

  // ... keybindings, layout, render
}
```

**Terminal resize handling:**

The screen subscribes to terminal dimensions via `useLayout()`. On resize:

1. If `viewMode === "split"` and `width < SPLIT_VIEW_MIN_COLS`: auto-switch to `"unified"`, emit status bar flash "Switched to unified view (terminal too narrow)", emit telemetry `diff.auto_switch_unified`.
2. Scroll position is preserved relative to `focusedFileIndex` (not pixel offset).
3. Sidebar state is managed by `useSidebarState()` — already handles auto-collapse at minimum breakpoint.

```typescript
// Auto-switch split → unified on resize
useEffect(() => {
  if (viewMode === "split" && width < SPLIT_VIEW_MIN_COLS) {
    setViewMode("unified");
    emit("tui.diff.view_toggled", { from_mode: "split", to_mode: "unified", terminal_width: width, reason: "resize" });
    // Flash status bar message (via status bar override mechanism)
  }
}, [width, viewMode]);
```

**Unmount cleanup:**

On screen pop (`q` or `Esc`), the React component unmounts. The following cleanup runs automatically via `useEffect` cleanup functions:

- `useScreenKeybindings` → pops keybinding scope
- `useScreenLoading` → aborts in-flight fetch, unregisters loading state
- `useDiffSyntaxStyle` → calls `SyntaxStyle.destroy()` on the native handle
- `useHunkCollapse` → GC'd (state is local, not persisted)
- `useWhitespaceToggle` → GC'd
- Scroll position → GC'd (not cached cross-screen)
- Telemetry session → emits `tui.diff.session_duration` on unmount

### 4.3 `DiffFileTree.tsx` — Sidebar

The file tree sidebar renders a scrollable list of changed files.

**Props:**

```typescript
interface DiffFileTreeProps {
  files: FileDiffItem[];
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onFileSelect: (index: number) => void;
  hasFocus: boolean;
  breakpoint: Breakpoint | null;
  sidebarWidth: number; // columns, computed from layout percentage
}
```

**Rendering:**

Each file entry renders as a single row:

```
{icon} {path} {stats}
```

Where:
- `{icon}` is the change type character colored per spec: `A` (green ANSI 34), `D` (red ANSI 196), `M` (yellow ANSI 178), `R` (cyan ANSI 37), `C` (cyan ANSI 37)
- `{path}` is the file path, truncated from the left with `…/` prefix using `truncateLeft()` when it exceeds available width
- `{stats}` is `+N -M` formatted, using abbreviated K/M format above 999 (e.g., `+1.2k -340`)
- Renamed files show `old_path → new_path`, truncated if necessary
- Binary files append `[bin]` suffix in muted color

**Focus rendering:**
- The focused row uses reverse video (OpenTUI `inverse` style)
- When `hasFocus` is false, the focused row shows a muted highlight (border indicator, not reverse video) to indicate position without claiming active focus

**Scrolling:**
- The file tree is wrapped in a `<scrollbox>` that scrolls independently
- `j`/`k` moves focus (when `hasFocus` is true)
- `Enter` triggers `onFileSelect`
- Scroll viewport follows focus (keep focused item visible)

**Path truncation logic:**

```typescript
function truncateFilePath(path: string, maxWidth: number): string {
  if (path.length <= maxWidth) return path;
  if (maxWidth <= 4) return truncateText(path, maxWidth);
  // Prefer showing filename: truncate directory prefix
  const parts = path.split("/");
  const filename = parts[parts.length - 1];
  if (filename.length >= maxWidth - 2) return truncateLeft(filename, maxWidth);
  return "…/" + path.slice(-(maxWidth - 2));
}
```

**Stat formatting:**

```typescript
function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
```

### 4.4 `DiffContentArea.tsx` — Main Content

The main diff content area renders file diffs sequentially in a single `<scrollbox>`.

**Props:**

```typescript
interface DiffContentAreaProps {
  files: FileDiffItem[];
  focusedFileIndex: number;
  viewMode: ViewMode;
  syntaxStyle: SyntaxStyle | null;
  hunkCollapse: HunkCollapseState;
  whitespaceVisible: boolean;
  isLandingDiff: boolean;
  comments: Map<string, InlineComment[]>;
  onCommentCreate: (filePath: string, lineNumber: number, side: "old" | "new") => void;
  onScrollPositionChange: (position: number) => void;
  scrollToFileIndex: number | null; // set when file tree Enter or ]/[ triggers
  breakpoint: Breakpoint | null;
}
```

**Per-file rendering:**

Each file renders as a `FileDiffBlock`:

1. **File header**: Bold file path + colored stats + horizontal separator
2. **Diff content** (one of):
   - `<diff>` component for normal text files
   - `"Binary file changed"` for `is_binary: true`
   - `"File too large to display"` for files > `MAX_FILE_PATCH_BYTES`
   - `"Unable to parse diff for <filename>"` for malformed patches (wrapped in try/catch)
   - `"No diff available for this file"` for `patch: null`
   - `"Empty file added"` / `"Empty file"` for zero-line files
   - `"File renamed from old/path to new/path"` for renames with no content change
   - `"File mode changed: 100644 → 100755"` for permission-only changes
3. **Inline comments** (landing diffs only): rendered below the file diff

**`<diff>` component props:**

```tsx
<diff
  diff={file.patch}
  view={viewMode}
  filetype={resolveFiletype(file.language, file.path)}
  showLineNumbers={true}
  syncScroll={viewMode === "split"}
  syntaxStyle={syntaxStyle}
  addedBg={theme.diffAddedBg}
  removedBg={theme.diffRemovedBg}
  addedSignColor={theme.diffAddedText}
  removedSignColor={theme.diffRemovedText}
  lineNumberFg={theme.muted}
  hunkHeaderFg={theme.diffHunkHeader}
  contextLines={CONTEXT_LINES[breakpoint ?? "minimum"]}
  gutterWidth={GUTTER_WIDTH[breakpoint ?? "minimum"]}
/>
```

**Scroll-to-file behavior:**

When `scrollToFileIndex` changes (from `]`/`[` or file tree `Enter`), the `<scrollbox>` scrolls to the target file's header position. Implementation uses ref tracking per file header and `scrollbox.scrollTo()`.

**File count gating:**

```typescript
const renderableFiles = files.slice(0, MAX_RENDERED_FILES);
const isTruncated = files.length > MAX_RENDERED_FILES;
const isLargeDiff = files.length >= LARGE_DIFF_WARNING_THRESHOLD;
```

If `isLargeDiff`, render a warning bar above the file list: `"Large diff: N files"` in warning color.
If `isTruncated`, render a notice after the last file: `"Showing 500 of N files. Use file tree to navigate."` in muted color.

### 4.5 `CommentForm.tsx` — Inline Comment Overlay

A modal overlay for creating inline comments on landing diffs.

**Props:**

```typescript
interface CommentFormProps {
  filePath: string;
  lineNumber: number;
  side: "old" | "new";
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
  maxBodyLength: number; // MAX_COMMENT_BODY_CHARS
}
```

**Layout:**

```
┌────────────────────────────────────────────┐
│ Comment on {filePath}:{lineNumber} ({side})│
├────────────────────────────────────────────┤
│                                            │
│ [textarea: comment body]                   │
│                                            │
│ {charCount}/{maxChars}                     │
├────────────────────────────────────────────┤
│ Ctrl+S: Submit    Esc: Cancel              │
└────────────────────────────────────────────┘
```

**Keybindings (MODAL priority):**

The comment form registers a keybinding scope at `PRIORITY.MODAL` when visible:
- `ctrl+s` → submit (validate non-empty body, call `onSubmit`, close overlay)
- `escape` → cancel (call `onCancel`, close overlay)

**Optimistic rendering:**

On submit, the comment appears immediately inline below the referenced line via optimistic state. On server error, the comment is removed and status bar shows: "Comment may not have been saved. Press `R` to refresh."

**Character limit:**

Input is capped at `MAX_COMMENT_BODY_CHARS`. A counter shows `{current}/{max}` below the textarea. At 90% capacity, the counter changes to warning color.

---

## 5. Keybinding Registration

### `keybindings.ts`

Exports a factory function that creates the keybinding array for the diff screen. Keybindings are context-dependent on current state.

```typescript
import type { KeyHandler } from "../../providers/keybinding-types.js";

interface DiffKeybindingContext {
  // State readers
  viewMode: () => ViewMode;
  focusZone: () => FocusZone;
  focusedFileIndex: () => number;
  fileCount: () => number;
  sidebarVisible: () => boolean;
  isLandingDiff: () => boolean;
  terminalWidth: () => number;
  hasError: () => boolean;
  commentFormVisible: () => boolean;

  // Actions
  scrollDown: () => void;
  scrollUp: () => void;
  jumpToBottom: () => void;
  jumpToTop: () => void;
  pageDown: () => void;
  pageUp: () => void;
  nextFile: () => void;
  prevFile: () => void;
  toggleViewMode: () => void;
  toggleWhitespace: () => void;
  collapseHunk: () => void;
  collapseAllHunksInFile: () => void;
  expandAllHunksInFile: () => void;
  expandAllHunks: () => void;
  expandFocusedHunk: () => void;
  toggleSidebar: () => void;
  switchFocusZone: () => void;
  openCommentForm: () => void;
  selectFileInTree: () => void;
  retryFetch: () => void;
  treeNavigateDown: () => void;
  treeNavigateUp: () => void;
}

export function createDiffKeybindings(ctx: DiffKeybindingContext): KeyHandler[] {
  return [
    // ── Scrolling ──
    {
      key: "j",
      description: "Scroll down",
      group: "Navigation",
      handler: () => {
        if (ctx.focusZone() === "tree") ctx.treeNavigateDown();
        else ctx.scrollDown();
      },
    },
    {
      key: "k",
      description: "Scroll up",
      group: "Navigation",
      handler: () => {
        if (ctx.focusZone() === "tree") ctx.treeNavigateUp();
        else ctx.scrollUp();
      },
    },
    { key: "Down",   description: "Scroll down",   group: "Navigation", handler: () => ctx.focusZone() === "tree" ? ctx.treeNavigateDown() : ctx.scrollDown() },
    { key: "Up",     description: "Scroll up",     group: "Navigation", handler: () => ctx.focusZone() === "tree" ? ctx.treeNavigateUp() : ctx.scrollUp() },
    { key: "G",      description: "Jump to bottom", group: "Navigation", handler: ctx.jumpToBottom },
    // g g handled via go-to mode (first g enters go-to, second g triggers jumpToTop)
    { key: "ctrl+d", description: "Page down",      group: "Navigation", handler: ctx.pageDown },
    { key: "ctrl+u", description: "Page up",        group: "Navigation", handler: ctx.pageUp },

    // ── File navigation ──
    { key: "]", description: "Next file",     group: "Files", handler: ctx.nextFile },
    { key: "[", description: "Previous file", group: "Files", handler: ctx.prevFile },

    // ── View controls ──
    {
      key: "t",
      description: "Toggle view",
      group: "View",
      handler: ctx.toggleViewMode,
    },
    { key: "w", description: "Toggle whitespace", group: "View", handler: ctx.toggleWhitespace },

    // ── Hunk controls ──
    {
      key: "z",
      description: "Collapse hunk",
      group: "Hunks",
      handler: ctx.collapseHunk,
      when: () => ctx.focusZone() === "content",
    },
    { key: "Z", description: "Collapse all hunks", group: "Hunks", handler: ctx.collapseAllHunksInFile },
    { key: "x", description: "Expand file hunks",  group: "Hunks", handler: ctx.expandAllHunksInFile },
    { key: "X", description: "Expand all hunks",   group: "Hunks", handler: ctx.expandAllHunks },

    // ── Sidebar ──
    { key: "ctrl+b", description: "Toggle sidebar", group: "Layout", handler: ctx.toggleSidebar },

    // ── Focus ──
    { key: "Tab", description: "Switch focus", group: "Focus", handler: ctx.switchFocusZone, when: () => ctx.sidebarVisible() },

    // ── Enter (context-dependent) ──
    {
      key: "Enter",
      description: "Select / Expand",
      group: "Actions",
      handler: () => {
        if (ctx.focusZone() === "tree") ctx.selectFileInTree();
        else ctx.expandFocusedHunk(); // expands collapsed hunk at cursor
      },
    },

    // ── Comments (landing diff only) ──
    {
      key: "c",
      description: "Comment",
      group: "Actions",
      handler: ctx.openCommentForm,
      when: () => ctx.isLandingDiff() && ctx.focusZone() === "content",
    },

    // ── Error recovery ──
    {
      key: "R",
      description: "Retry",
      group: "Actions",
      handler: ctx.retryFetch,
      when: ctx.hasError,
    },
  ];
}

/** Status bar hints for the diff screen (context-sensitive) */
export function createDiffStatusBarHints(isLanding: boolean): StatusBarHint[] {
  const hints: StatusBarHint[] = [
    { keys: "t",   label: "view",   order: 10 },
    { keys: "w",   label: "ws",     order: 20 },
    { keys: "]/[", label: "files",  order: 30 },
    { keys: "x/z", label: "hunks",  order: 40 },
  ];
  if (isLanding) {
    hints.push({ keys: "c", label: "comment", order: 50 });
  }
  return hints;
}
```

**Go-to mode integration (`g g` for jump to top):**

The keybinding system already handles go-to mode (1500ms window after `g`). The diff screen registers `g` as a go-to trigger at the global level. The second `g` in go-to mode maps to `jumpToTop` via the existing `goToBindings.ts` infrastructure. However, `G` (uppercase, shift+g) is a screen-level keybinding that maps to `jumpToBottom` — this is registered directly in the screen's keybinding scope.

For `g g` specifically: the go-to bindings system needs an additional entry. The `goToBindings.ts` file already defines destinations like `g d` → Dashboard, `g i` → Issues. We add a contextual binding: when on the diff screen, `g g` → `jumpToTop` instead of any navigation. This is handled by registering a `when` predicate on the go-to binding that checks if the current screen is `DiffView`.

---

## 6. Data Flow

### `useDiffData.ts`

Orchestrates data fetching based on the `DiffSource` discriminant.

```typescript
interface UseDiffDataOptions {
  ignoreWhitespace: boolean;
}

interface UseDiffDataReturn {
  data: DiffData | null;
  isLoading: boolean;
  error: { message: string; status?: number } | null;
  refetch: () => void;
  isCacheHit: boolean;
}

export function useDiffData(
  source: DiffSource,
  options: UseDiffDataOptions
): UseDiffDataReturn {
  // Select hook based on source.kind
  // Pass ignoreWhitespace as query parameter option
  // Transform hook response into DiffData
  // Handle cache (30s TTL via source hook's built-in caching)
}
```

**Hook selection logic:**

```typescript
if (source.kind === "change") {
  // Uses useChangeDiff(owner, repo, change_id, { ignore_whitespace })
  // API: GET /api/repos/:owner/:repo/changes/:change_id/diff
} else {
  // Uses useLandingDiff(owner, repo, number, { ignore_whitespace })
  // API: GET /api/repos/:owner/:repo/landings/:number/diff
}
```

**Caching strategy:**

The `@codeplane/ui-core` hooks provide built-in caching. This layer adds a 30-second TTL check: if the user navigates away and back within 30 seconds, the cached data is served without an API call. The cache key is `${source.kind}:${owner}/${repo}:${id}:ws=${ignoreWhitespace}`.

```typescript
const cacheRef = useRef<{ key: string; data: DiffData; timestamp: number } | null>(null);

const cacheKey = `${source.kind}:${source.owner}/${source.repo}:${
  source.kind === "change" ? source.change_id : source.number
}:ws=${options.ignoreWhitespace}`;

// On data arrival, update cache
useEffect(() => {
  if (hookData && !hookLoading) {
    cacheRef.current = { key: cacheKey, data: transformToDiffData(hookData), timestamp: Date.now() };
  }
}, [hookData, hookLoading, cacheKey]);

// On mount, check cache freshness
const isCacheHit = useMemo(() => {
  if (!cacheRef.current) return false;
  if (cacheRef.current.key !== cacheKey) return false;
  return Date.now() - cacheRef.current.timestamp < DIFF_CACHE_TTL_MS;
}, [cacheKey]);
```

**Whitespace toggle re-fetch:**

When `ignoreWhitespace` changes, the hook re-fetches with the updated query parameter. The re-fetch shows an inline "Updating diff…" indicator (not full-screen spinner) because `useScreenLoading` distinguishes initial load from refresh. Implementation: track whether `data` has been loaded at least once; if yes, show inline loading instead of full-screen.

### Comment data flow (landing diffs)

```typescript
// In DiffScreen, when source.kind === "landing":
const comments = useLandingComments(source.owner, source.repo, source.number);
const createComment = useCreateComment(source.owner, source.repo, source.number);

// Group comments by file path for rendering
const commentsByFile = useMemo(() => {
  const map = new Map<string, InlineComment[]>();
  for (const c of comments.data ?? []) {
    const existing = map.get(c.file_path) ?? [];
    existing.push(c);
    map.set(c.file_path, existing);
  }
  return map;
}, [comments.data]);
```

---

## 7. Hunk Collapse State

### `useHunkCollapse.ts`

Manages per-file hunk collapse state.

```typescript
interface HunkCollapseState {
  /** Check if a specific hunk is collapsed */
  isCollapsed: (filePath: string, hunkIndex: number) => boolean;
  /** Collapse a single hunk */
  collapse: (filePath: string, hunkIndex: number) => void;
  /** Expand a single hunk */
  expand: (filePath: string, hunkIndex: number) => void;
  /** Collapse all hunks in a file */
  collapseAllInFile: (filePath: string, hunkCount: number) => void;
  /** Expand all hunks in a file */
  expandAllInFile: (filePath: string) => void;
  /** Expand all hunks across all files */
  expandAll: () => void;
  /** Reset all state (on data refresh) */
  reset: () => void;
}

export function useHunkCollapse(): HunkCollapseState {
  const [collapseMap, setCollapseMap] = useState<HunkCollapseMap>(new Map());

  const isCollapsed = useCallback((filePath: string, hunkIndex: number) => {
    return collapseMap.get(filePath)?.has(hunkIndex) ?? false;
  }, [collapseMap]);

  const collapse = useCallback((filePath: string, hunkIndex: number) => {
    setCollapseMap(prev => {
      const next = new Map(prev);
      const set = new Set(prev.get(filePath));
      set.add(hunkIndex);
      next.set(filePath, set);
      return next;
    });
  }, []);

  // ... expand, collapseAllInFile, expandAllInFile, expandAll, reset

  return { isCollapsed, collapse, expand, collapseAllInFile, expandAllInFile, expandAll, reset };
}
```

**Collapsed hunk rendering:**

When a hunk is collapsed, instead of rendering the `<diff>` lines for that hunk, render a single summary line:

```tsx
<box borderStyle="dashed" borderColor={theme.muted}>
  <text color={theme.muted}>⋯ {lineCount} lines hidden</text>
</box>
```

Pressing `Enter` on a collapsed hunk calls `hunkCollapse.expand(filePath, hunkIndex)`.

**Persistence:** Hunk collapse state persists during file navigation within the same diff session (same screen mount). It resets when data is re-fetched (whitespace toggle, retry).

---

## 8. Whitespace Toggle

### `useWhitespaceToggle.ts`

```typescript
interface WhitespaceToggleState {
  visible: boolean;
  toggle: () => void;
}

export function useWhitespaceToggle(): WhitespaceToggleState {
  const [visible, setVisible] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = useCallback(() => {
    // Clear any pending debounced toggle
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setVisible(prev => !prev);
    }, WHITESPACE_DEBOUNCE_MS);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { visible, toggle };
}
```

The debounce prevents rapid `w` presses from triggering multiple API re-fetches. The `visible` state flows into `useDiffData` as `ignoreWhitespace: !visible`, which triggers a re-fetch with the updated query parameter.

---

## 9. Navigation Integration

### 9.1 Screen Registry Update

**File:** `apps/tui/src/router/registry.ts`

```typescript
import { DiffScreen } from "../screens/DiffScreen/index.js";

// Replace the DiffView entry:
[ScreenName.DiffView]: {
  component: DiffScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => {
    if (p.change_id) return `Diff: ${p.change_id.slice(0, 8)}`;
    if (p.landing_number) return `Diff: !${p.landing_number}`;
    return "Diff";
  },
},
```

### 9.2 Entry Points

The diff screen is pushed onto the navigation stack from four entry points:

**A. Change list → `d` key**

From the repository changes view (future screen), pressing `d` on a focused change pushes:

```typescript
navigation.push(ScreenName.DiffView, {
  owner, repo, change_id: selectedChange.id,
});
```

The breadcrumb trail becomes: `Dashboard > owner/repo > Changes > abc12345 > Diff: abc12345`

**B. Landing detail → Diff tab / Enter on changes tab**

From the landing detail screen (future screen), pressing `Enter` on the Diff tab or on a change in the changes tab pushes:

```typescript
navigation.push(ScreenName.DiffView, {
  owner, repo, landing_number: String(landingNumber),
});
```

Breadcrumb: `Dashboard > owner/repo > Landings > !12 > Diff: !12`

**C. Command palette → `:diff`**

The command palette recognizes `:diff owner/repo change_id` and pushes the diff screen. See section 10.

**D. Deep link → `--screen diff`**

CLI args: `codeplane tui --screen diff --repo owner/repo --change abc12345`

Or: `codeplane tui --screen diff --repo owner/repo --landing 12`

### 9.3 Deep Link Changes

**File:** `apps/tui/src/navigation/deepLinks.ts`

Add to `resolveScreenName()`:

```typescript
diff: ScreenName.DiffView,
"diff-view": ScreenName.DiffView,
```

Add to `DeepLinkArgs` interface:

```typescript
export interface DeepLinkArgs {
  screen?: string;
  repo?: string;
  sessionId?: string;
  org?: string;
  change?: string;   // NEW
  landing?: string;   // NEW
}
```

Update `buildInitialStack()` to pass `change` and `landing` as params when the target screen is `DiffView`:

```typescript
if (screenName === ScreenName.DiffView) {
  if (args.change) params.change_id = args.change;
  if (args.landing) params.landing_number = args.landing;
  if (!args.change && !args.landing) {
    return {
      stack: [dashboardEntry()],
      error: "--change or --landing required for diff screen",
    };
  }
}
```

**File:** `apps/tui/src/lib/terminal.ts`

Add to `TUILaunchOptions`:

```typescript
export interface TUILaunchOptions {
  repo?: string;
  screen?: string;
  debug: boolean;
  apiUrl: string;
  token?: string;
  change?: string;   // NEW
  landing?: string;   // NEW
}
```

Add to `parseCLIArgs()`:

```typescript
// In the arg parsing loop:
case "--change":
  result.change = argv[++i];
  break;
case "--landing":
  result.landing = argv[++i];
  break;
```

**File:** `apps/tui/src/index.tsx`

Pass `change` and `landing` to `buildInitialStack()`:

```typescript
const deepLinkResult = buildInitialStack({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
  change: launchOptions.change,   // NEW
  landing: launchOptions.landing, // NEW
});
```

---

## 10. Command Palette Integration

### `commands/diff.ts`

Registers the `:diff` command with the command palette system.

```typescript
import { ScreenName } from "../router/types.js";

export const diffCommand = {
  name: "diff",
  description: "Open diff viewer for a change or landing",
  usage: ":diff <owner/repo> <change_id>",
  aliases: ["d"],
  requiresArgs: true,

  execute(args: string[], context: { push: NavigationContext["push"] }) {
    if (args.length < 2) {
      return { error: "Usage: :diff <owner/repo> <change_id|!landing_number>" };
    }

    const [repoSlug, identifier] = args;
    const [owner, repo] = repoSlug.split("/");

    if (!owner || !repo) {
      return { error: "Invalid repository format. Use: owner/repo" };
    }

    const params: Record<string, string> = { owner, repo };

    if (identifier.startsWith("!")) {
      // Landing diff: :diff owner/repo !12
      params.landing_number = identifier.slice(1);
    } else {
      // Change diff: :diff owner/repo abc12345
      params.change_id = identifier;
    }

    context.push(ScreenName.DiffView, params);
    return { success: true };
  },
};
```

---

## 11. Telemetry

### `telemetry.ts`

Centralized telemetry helpers for the diff screen.

```typescript
import { emit } from "../../lib/telemetry.js";
import type { DiffSource, DiffData, ViewMode } from "./types.js";

// ── Session tracker ──

interface DiffSession {
  startTime: number;
  source: DiffSource;
  filesViewed: Set<number>;
  commentsCreated: number;
  viewToggles: number;
  whitespaceToggles: number;
}

let currentSession: DiffSession | null = null;

export function startDiffSession(source: DiffSource): void {
  currentSession = {
    startTime: Date.now(),
    source,
    filesViewed: new Set([0]),
    commentsCreated: 0,
    viewToggles: 0,
    whitespaceToggles: 0,
  };
}

export function endDiffSession(): void {
  if (!currentSession) return;
  emit("tui.diff.session_duration", {
    duration_ms: Date.now() - currentSession.startTime,
    source: currentSession.source.kind,
    files_viewed: currentSession.filesViewed.size,
    comments_created: currentSession.commentsCreated,
    view_toggles: currentSession.viewToggles,
    whitespace_toggles: currentSession.whitespaceToggles,
  });
  currentSession = null;
}

// ── Event emitters ──

export function emitDiffViewed(source: DiffSource, data: DiffData, viewMode: ViewMode): void {
  emit("tui.diff.viewed", {
    source: source.kind,
    repo: `${source.owner}/${source.repo}`,
    file_count: data.files.length,
    total_additions: data.total_additions,
    total_deletions: data.total_deletions,
    view_mode: viewMode,
  });
}

export function emitViewToggled(from: ViewMode, to: ViewMode, terminalWidth: number): void {
  if (currentSession) currentSession.viewToggles++;
  emit("tui.diff.view_toggled", { from_mode: from, to_mode: to, terminal_width: terminalWidth });
}

export function emitWhitespaceToggled(visible: boolean, fileCount: number): void {
  if (currentSession) currentSession.whitespaceToggles++;
  emit("tui.diff.whitespace_toggled", { visible, file_count: fileCount });
}

export function emitFileNavigated(direction: "next" | "prev", fileIndex: number, totalFiles: number): void {
  if (currentSession) currentSession.filesViewed.add(fileIndex);
  emit("tui.diff.file_navigated", { direction, file_index: fileIndex, total_files: totalFiles });
}

export function emitFileTreeUsed(fileIndex: number, totalFiles: number): void {
  if (currentSession) currentSession.filesViewed.add(fileIndex);
  emit("tui.diff.file_tree_used", { file_index: fileIndex, total_files: totalFiles });
}

export function emitSidebarToggled(visible: boolean, terminalWidth: number): void {
  emit("tui.diff.sidebar_toggled", { visible, terminal_width: terminalWidth });
}

export function emitHunkCollapsed(scope: "single" | "all_file", filePath: string): void {
  emit("tui.diff.hunk_collapsed", { scope, file_path: filePath });
}

export function emitHunkExpanded(scope: "single" | "all_file" | "all_files", filePath: string): void {
  emit("tui.diff.hunk_expanded", { scope, file_path: filePath });
}

export function emitCommentCreated(repo: string, landingNumber: number, filePath: string, lineNumber: number, bodyLength: number): void {
  if (currentSession) currentSession.commentsCreated++;
  emit("tui.diff.comment_created", { repo, landing_number: landingNumber, file_path: filePath, line_number: lineNumber, body_length: bodyLength });
}

export function emitCommentCancelled(repo: string, landingNumber: number, hadContent: boolean): void {
  emit("tui.diff.comment_cancelled", { repo, landing_number: landingNumber, had_content: hadContent });
}

export function emitDiffError(errorType: string, statusCode: number | undefined, repo: string, source: string): void {
  emit("tui.diff.error", { error_type: errorType, status_code: statusCode ?? 0, repo, source });
}

export function emitDiffRetry(errorType: string, attemptNumber: number): void {
  emit("tui.diff.retry", { error_type: errorType, attempt_number: attemptNumber });
}
```

**Integration in DiffScreen:**

```typescript
// On mount
useEffect(() => {
  startDiffSession(source);
  return () => { endDiffSession(); };
}, [source]);

// On data loaded
useEffect(() => {
  if (data && !isLoading) {
    emitDiffViewed(source, data, viewMode);
  }
}, [data, isLoading]);
```

---

## 12. Permissions & Authorization

Authorization is handled at the API level. The diff screen does not implement client-side permission checks beyond what the API returns.

| Scenario | API response | Screen behavior |
|----------|-------------|----------------|
| No read access | 404 | `FullScreenError`: "Repository not found." |
| No write access (comment) | 403 | Status bar: "Write access required to comment" |
| Token expired | 401 | Auth error screen: "Session expired. Run `codeplane auth login`" |
| Rate limited | 429 | Status bar: "Rate limited. Retry in Ns." with countdown |

For the `c` keybinding (comment creation): when the API returns 403 on comment POST, the optimistic comment is reverted and the status bar shows the error. The `c` key itself remains active because permission is not known until the POST is attempted.

---

## 13. Observability

### Logging

All log statements use `process.stderr.write()` following the existing pattern in `lib/telemetry.ts` and `hooks/useOptimisticMutation.ts`.

| Level | Event | Format |
|-------|-------|--------|
| `info` | `diff.screen.opened` | `{source, repo, change_id?, landing_number?, file_count}` |
| `info` | `diff.screen.closed` | `{duration_ms, files_viewed, comments_created}` |
| `info` | `diff.view.toggled` | `{from, to, terminal_width}` |
| `info` | `diff.whitespace.toggled` | `{visible}` |
| `warn` | `diff.file.too_large` | `{path, size_bytes}` |
| `warn` | `diff.files.truncated` | `{total_files, rendered_files: 500}` |
| `warn` | `diff.split.unavailable` | `{terminal_width}` |
| `warn` | `diff.auto_switch_unified` | `{terminal_width}` |
| `error` | `diff.fetch.failed` | `{status_code, error_message, repo, source}` |
| `error` | `diff.parse.failed` | `{file_path, error_message}` |
| `error` | `diff.comment.failed` | `{status_code, error_message, landing_number}` |
| `debug` | `diff.cache.hit` | `{cache_key, age_ms}` |
| `debug` | `diff.cache.miss` | `{cache_key}` |

Logging is gated behind `CODEPLANE_TUI_DEBUG=true` for `debug` level, always emitted for `warn` and `error`.

---

## 14. Error Handling Matrix

| Error case | Detection | UI behavior | Recovery |
|------------|-----------|-------------|----------|
| API 404 (change not found) | `error.status === 404` | `FullScreenError`: "Change not found." | Press `q` to go back |
| API 404 (landing not found) | `error.status === 404` | `FullScreenError`: "Landing request not found." | Press `q` to go back |
| API 401 (auth expired) | `error.status === 401` | Auth error screen via `useScreenLoading` | Run `codeplane auth login` |
| API 429 (rate limited) | `error.status === 429` | Status bar: "Rate limited. Retry in Ns." | Wait, press `R` |
| Network error | `error.status === undefined` | `FullScreenError`: error message + "Press R to retry" | Press `R` |
| API timeout (>30s) | `useScreenLoading` timeout | "Diff loading timed out. Press `R` to retry." | Press `R` |
| Malformed diff patch | `try/catch` around `<diff>` render | "Unable to parse diff for `<filename>`" in red; other files render normally | File-level, not recoverable |
| File > 1MB | `file.patch_size_bytes > MAX_FILE_PATCH_BYTES` | "File too large to display" in muted text | No action needed |
| 500+ files | `files.length > MAX_RENDERED_FILES` | Truncated to 500 with notice | Use file tree to browse |
| Split view at < 120 cols | Width check in `toggleViewMode` | Flash "Split view requires 120+ column terminal" | Widen terminal |
| Resize below 120 in split | `useEffect` on `width` | Auto-switch to unified + flash message | Automatic |
| Comment POST fails | `createComment` error | Optimistic comment reverted + status bar error | Press `R` to refresh |
| SSE disconnect during comment | Network error on POST | "Comment may not have been saved. Press `R` to refresh." | Press `R` |
| Only whitespace changes + ws hidden | `data.files.length === 0` after ws filter | "No visible changes (whitespace hidden). Press w to show whitespace." | Press `w` |

---

## 15. Responsive Behavior Summary

| Property | Minimum (80×24 – 119×39) | Standard (120×40 – 199×59) | Large (200×60+) |
|----------|--------------------------|---------------------------|-----------------|
| Sidebar | Hidden (toggle `Ctrl+B`) | Visible (25%) | Visible (25%) |
| View modes | Unified only | Unified + split | Unified + split |
| Line numbers | 4-char gutter | 5-char gutter | 6-char gutter |
| Context lines | 3 | 3 | 5 |
| File paths in tree | Filename only | Relative path | Full path |
| Status bar hints | Abbreviated (4 hints) | Standard (6 hints) | Full (all hints) |
| Modal width | 90% | 60% | 50% |
| Breadcrumb | Truncated from left | Standard | Full |

---

## Implementation Plan

### Prerequisites

Before starting implementation, verify these dependencies are met:

1. **`tui-diff-screen-scaffold`**: The `apps/tui/src/screens/DiffScreen/` directory and all 12 file stubs exist.
2. **`tui-diff-data-hooks`**: `useChangeDiff`, `useLandingDiff`, `useLandingComments`, and `useCreateComment` are available from `@codeplane/ui-core`.

### Step 1: Type Definitions

**File:** `apps/tui/src/screens/DiffScreen/types.ts`

Define all types, interfaces, and constants listed in Section 3. No external dependencies beyond standard TypeScript types and the `ScreenComponentProps` import from `../../router/types.js`.

**Validation:** File compiles with `bun build --no-bundle apps/tui/src/screens/DiffScreen/types.ts`.

### Step 2: Hunk Collapse Hook

**File:** `apps/tui/src/screens/DiffScreen/useHunkCollapse.ts`

Implement the `useHunkCollapse` hook as specified in Section 7. Pure React state management — no external dependencies beyond React hooks.

**Validation:** Hook is importable and exports `HunkCollapseState` interface. Manual test: create, collapse, expand, reset.

### Step 3: Whitespace Toggle Hook

**File:** `apps/tui/src/screens/DiffScreen/useWhitespaceToggle.ts`

Implement as specified in Section 8. Debounce timer cleanup on unmount.

**Validation:** Hook is importable, toggle changes `visible` state after debounce, unmount clears timer.

### Step 4: Telemetry Helpers

**File:** `apps/tui/src/screens/DiffScreen/telemetry.ts`

Implement all emitters as specified in Section 11. Depends on `../../lib/telemetry.js` (`emit` function).

**Validation:** All functions export, `emit` is called with correct event names and property shapes.

### Step 5: Data Orchestration Hook

**File:** `apps/tui/src/screens/DiffScreen/useDiffData.ts`

Implement as specified in Section 6. Depends on `@codeplane/ui-core` hooks (`useChangeDiff`, `useLandingDiff`). Includes cache management.

**Validation:** Hook returns `DiffData | null` for both `change` and `landing` source kinds. Cache hit/miss logic correct.

### Step 6: Keybinding Definitions

**File:** `apps/tui/src/screens/DiffScreen/keybindings.ts`

Implement `createDiffKeybindings()` and `createDiffStatusBarHints()` as specified in Section 5. Depends on `../../providers/keybinding-types.js`.

**Validation:** Factory returns 20+ keybinding entries with correct keys, descriptions, groups, and conditional `when` predicates.

### Step 7: DiffFileTree Component

**File:** `apps/tui/src/screens/DiffScreen/DiffFileTree.tsx`

Implement as specified in Section 4.3. Depends on:
- OpenTUI: `<box>`, `<scrollbox>`, `<text>`
- `../../util/truncate.js` (`truncateLeft`)
- `../../theme/tokens.js` (via `useTheme()`)
- `./types.js` (`FileDiffItem`, `FileChangeType`)

**Validation:** Renders file entries with correct icons, colors, path truncation, and stat formatting. Focus highlight changes with `j`/`k`. `Enter` fires `onFileSelect`.

### Step 8: CommentForm Component

**File:** `apps/tui/src/screens/DiffScreen/CommentForm.tsx`

Implement as specified in Section 4.5. Depends on:
- OpenTUI: `<box>`, `<text>`, `<input>`
- Keybinding system: registers MODAL priority scope
- `./types.js` (`MAX_COMMENT_BODY_CHARS`)

**Validation:** Renders modal overlay. `Ctrl+S` submits, `Esc` cancels. Character counter updates. Body capped at max length.

### Step 9: DiffContentArea Component

**File:** `apps/tui/src/screens/DiffScreen/DiffContentArea.tsx`

Implement as specified in Section 4.4. This is the largest component. Depends on:
- OpenTUI: `<box>`, `<scrollbox>`, `<text>`, `<diff>`, `<markdown>`
- `../../lib/diff-syntax.js` (`resolveFiletype`)
- `../../hooks/useDiffSyntaxStyle.js`
- `./types.js` (constants, `FileDiffItem`)
- `./useHunkCollapse.js`

**Validation:** Renders files with correct diff rendering, handles binary/empty/too-large/error cases, scrolls to file on command, renders inline comments.

### Step 10: DiffScreen Root Component

**File:** `apps/tui/src/screens/DiffScreen/DiffScreen.tsx`

Wire everything together as specified in Section 4.2. This is the orchestration layer. Depends on all previous files plus:
- `../../hooks/useScreenKeybindings.js`
- `../../hooks/useScreenLoading.js`
- `../../hooks/useLayout.js`
- `../../hooks/useNavigation.js`
- `../../components/FullScreenLoading.js`
- `../../components/FullScreenError.js`

**Validation:** Screen renders in all states (loading, error, empty, data). All keybindings fire. Focus switches between tree and content. View mode toggles. Whitespace toggles and re-fetches. Sidebar toggles. Comments work on landing diffs.

### Step 11: Barrel Export

**File:** `apps/tui/src/screens/DiffScreen/index.ts`

```typescript
export { DiffScreen } from "./DiffScreen.js";
```

### Step 12: Registry Integration

**File:** `apps/tui/src/router/registry.ts`

Replace `PlaceholderScreen` with `DiffScreen` for the `ScreenName.DiffView` entry. Update `breadcrumbLabel` to show contextual label.

**Validation:** `ScreenRouter` renders `DiffScreen` when navigating to `DiffView`. Breadcrumb shows correct label.

### Step 13: Deep Link Integration

**Files:** `apps/tui/src/navigation/deepLinks.ts`, `apps/tui/src/lib/terminal.ts`, `apps/tui/src/index.tsx`

Add deep link support as specified in Section 9.3.

**Validation:** `codeplane tui --screen diff --repo owner/repo --change abc123` launches directly to diff screen. `--landing 12` variant works. Missing args show error.

### Step 14: Command Palette Integration

**File:** `apps/tui/src/commands/diff.ts`

Implement command as specified in Section 10. Register with command palette system (when available — this file is additive and will integrate when the command palette is implemented).

**Validation:** Export matches command interface. Parsing handles both change ID and `!N` landing syntax.

### Step 15: Integration Testing & Polish

Run all 97 E2E tests from `e2e/tui/diff.test.ts`. Address failures. Verify:
- All 30 snapshot tests produce correct visual output
- All 38 keyboard tests pass interaction verification
- All 15 responsive tests pass at all three breakpoints
- All 14 integration tests pass against real API

---

## Unit & Integration Tests

Test file: `e2e/tui/diff.test.ts`

The existing test file contains 36 syntax highlighting tests (SNAP-SYN, KEY-SYN, RSP-SYN, INT-SYN, EDGE-SYN). The following 97 tests are **additive** — they extend the existing file or are organized as new `describe` blocks within it.

### Snapshot Tests (30 tests)

```typescript
describe("TUI_DIFF_SCREEN — snapshot tests", () => {
  test("SNAP-DIFF-001: renders unified diff view at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "diff", "--repo", "test/repo", "--change", "abc123"] });
    await terminal.waitForText("Diff");
    // Assert: file tree sidebar visible at 25% width
    // Assert: main content shows unified diff with green/red highlighting
    // Assert: status bar shows keybinding hints and "File 1 of N"
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-DIFF-002: renders unified diff view at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "diff", "--repo", "test/repo", "--change", "abc123"] });
    await terminal.waitForText("Diff");
    // Assert: sidebar hidden, unified only, abbreviated status bar
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-DIFF-003: renders unified diff view at 200x60", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60, args: ["--screen", "diff", "--repo", "test/repo", "--change", "abc123"] });
    await terminal.waitForText("Diff");
    // Assert: wider gutters, full paths, extra context lines
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-DIFF-004: renders split diff view at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "diff", "--repo", "test/repo", "--change", "abc123"] });
    await terminal.waitForText("Diff");
    await terminal.sendKeys("t"); // toggle to split
    // Assert: two panes with synced line numbers
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-DIFF-005: renders split diff view at 200x60", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60, args: ["--screen", "diff", "--repo", "test/repo", "--change", "abc123"] });
    await terminal.waitForText("Diff");
    await terminal.sendKeys("t");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-DIFF-006: renders file tree sidebar with change type icons", async () => {
    // Navigate to diff with mixed A/D/M/R/C file types
    // Assert: correct colored icons (A=green, D=red, M=yellow, R=cyan, C=cyan)
    // Assert: stat summaries visible (+N -M format)
  });

  test("SNAP-DIFF-007: renders file tree sidebar with truncated paths", async () => {
    // Navigate to diff with deeply nested file paths
    // Assert: paths truncated with …/ prefix
  });

  test("SNAP-DIFF-008: renders loading state", async () => {
    // Assert: full-screen spinner with "Loading diff…" text
  });

  test("SNAP-DIFF-009: renders error state", async () => {
    // Trigger API error
    // Assert: error message with "Press R to retry"
  });

  test("SNAP-DIFF-010: renders empty diff state", async () => {
    // Navigate to diff with no file changes
    // Assert: "No file changes." centered in muted text
  });

  test("SNAP-DIFF-011: renders binary file indicator", async () => {
    // Navigate to diff containing binary file
    // Assert: "Binary file changed" shown
  });

  test("SNAP-DIFF-012: renders addition lines with green styling", async () => {
    // Assert: green background and + sign on added lines
  });

  test("SNAP-DIFF-013: renders deletion lines with red styling", async () => {
    // Assert: red background and - sign on deleted lines
  });

  test("SNAP-DIFF-014: renders hunk headers in cyan", async () => {
    // Assert: @@ ... @@ in cyan
  });

  test("SNAP-DIFF-015: renders line numbers in muted color", async () => {
    // Assert: gutter line numbers in muted (ANSI 245)
  });

  test("SNAP-DIFF-016: renders collapsed hunk summary", async () => {
    // Press z to collapse a hunk
    // Assert: "⋯ N lines hidden" shown
  });

  test("SNAP-DIFF-017: renders all hunks collapsed in file", async () => {
    // Press Z to collapse all
    // Assert: all hunks show collapsed summary
  });

  test("SNAP-DIFF-018: renders sidebar hidden state", async () => {
    // Press Ctrl+B to hide sidebar
    // Assert: main content at 100% width
  });

  test("SNAP-DIFF-019: renders whitespace hidden indicator in status bar", async () => {
    // Press w to toggle whitespace
    // Assert: status bar shows [ws: hidden]
  });

  test("SNAP-DIFF-020: renders file position in status bar", async () => {
    // Assert: "File 3 of 12" in status bar
  });

  test("SNAP-DIFF-021: renders inline comment on landing diff", async () => {
    // Navigate to landing diff with existing comments
    // Assert: comment block below diff line with author, timestamp, body
  });

  test("SNAP-DIFF-022: renders comment creation form overlay", async () => {
    // Press c on landing diff
    // Assert: form with pre-populated fields visible
  });

  test("SNAP-DIFF-023: renders renamed file in file tree", async () => {
    // Assert: old_path → new_path format in file tree
  });

  test("SNAP-DIFF-024: renders diff with syntax highlighting", async () => {
    // Assert: syntax colors applied via useDiffSyntaxStyle
  });

  test("SNAP-DIFF-025: renders breadcrumb for change diff", async () => {
    // Assert: header shows … > Changes > abc12345 > Diff
  });

  test("SNAP-DIFF-026: renders breadcrumb for landing diff", async () => {
    // Assert: header shows … > Landings > !12 > Diff
  });

  test("SNAP-DIFF-027: renders file too large notice", async () => {
    // File > 1MB
    // Assert: "File too large to display" shown
  });

  test("SNAP-DIFF-028: renders permission-only change", async () => {
    // File with mode change but no content diff
    // Assert: "File mode changed: 100644 → 100755"
  });

  test("SNAP-DIFF-029: renders help overlay", async () => {
    // Press ?
    // Assert: help overlay lists all diff keybindings
  });

  test("SNAP-DIFF-030: renders large diff file count warning", async () => {
    // Diff with 250 files
    // Assert: "Large diff: 250 files" warning
  });
});
```

### Keyboard Interaction Tests (38 tests)

```typescript
describe("TUI_DIFF_SCREEN — keyboard interaction", () => {
  test("KEY-DIFF-001: j scrolls down one line", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "diff", "--repo", "test/repo", "--change", "abc123"] });
    await terminal.waitForText("Diff");
    const before = terminal.snapshot();
    await terminal.sendKeys("j");
    const after = terminal.snapshot();
    // Assert: content scrolled down by 1 line
    expect(before).not.toBe(after);
    await terminal.terminate();
  });

  test("KEY-DIFF-002: k scrolls up one line", async () => {
    // Navigate down first, then up
    // Assert: scroll position decreases by 1
  });

  test("KEY-DIFF-003: G jumps to bottom", async () => {
    // Press G
    // Assert: last line of last file visible
  });

  test("KEY-DIFF-004: gg jumps to top", async () => {
    // Press G then g, g
    // Assert: first line of first file visible
  });

  test("KEY-DIFF-005: Ctrl+D pages down", async () => {
    // Assert: scroll advances by half visible height
  });

  test("KEY-DIFF-006: Ctrl+U pages up", async () => {
    // Assert: scroll retreats by half visible height
  });

  test("KEY-DIFF-007: ] navigates to next file", async () => {
    // Press ]
    // Assert: content scrolls to next file header, file tree focus advances
  });

  test("KEY-DIFF-008: [ navigates to previous file", async () => {
    // Press ]  then [
    // Assert: content scrolls back to previous file
  });

  test("KEY-DIFF-009: ] wraps from last to first file", async () => {
    // Navigate to last file, press ]
    // Assert: focus on first file
  });

  test("KEY-DIFF-010: [ wraps from first to last file", async () => {
    // Press [ on first file
    // Assert: focus on last file
  });

  test("KEY-DIFF-011: t toggles to split view", async () => {
    // At 120+ cols, press t
    // Assert: <diff> view changes to split
  });

  test("KEY-DIFF-012: t toggles back to unified view", async () => {
    // Press t twice
    // Assert: back to unified
  });

  test("KEY-DIFF-013: t rejected at 80 columns", async () => {
    // At 80 cols, press t
    // Assert: flash message "Split view requires 120+ column terminal"
    // Assert: stays unified
  });

  test("KEY-DIFF-014: w toggles whitespace hidden", async () => {
    // Press w
    // Assert: status bar shows [ws: hidden]
  });

  test("KEY-DIFF-015: w toggles whitespace visible", async () => {
    // Press w twice
    // Assert: status bar shows [ws: visible]
  });

  test("KEY-DIFF-016: z collapses focused hunk", async () => {
    // Press z
    // Assert: "⋯ N lines hidden" shown
  });

  test("KEY-DIFF-017: Z collapses all hunks in file", async () => {
    // Press Z
    // Assert: all hunks collapsed
  });

  test("KEY-DIFF-018: x expands all hunks in file", async () => {
    // Press Z then x
    // Assert: all hunks expanded
  });

  test("KEY-DIFF-019: X expands all hunks across files", async () => {
    // Collapse hunks in two files, press X
    // Assert: all hunks in all files expanded
  });

  test("KEY-DIFF-020: Enter on collapsed hunk expands it", async () => {
    // Press z then Enter on collapsed hunk
    // Assert: single hunk expands
  });

  test("KEY-DIFF-021: Ctrl+B toggles sidebar", async () => {
    // Press Ctrl+B
    // Assert: sidebar visibility toggles, main content width adjusts
  });

  test("KEY-DIFF-022: Ctrl+B hides sidebar", async () => {
    // At 120+ cols (sidebar visible), press Ctrl+B
    // Assert: sidebar hidden, content 100% width
  });

  test("KEY-DIFF-023: Ctrl+B shows sidebar", async () => {
    // After hiding, press Ctrl+B again
    // Assert: sidebar shown at 25%
  });

  test("KEY-DIFF-024: Tab switches focus to file tree", async () => {
    // Focus on content, press Tab
    // Assert: file tree has focus (reverse video on focused file)
  });

  test("KEY-DIFF-025: Tab switches focus to content", async () => {
    // Focus on tree, press Tab
    // Assert: content has focus
  });

  test("KEY-DIFF-026: j/k in file tree navigates files", async () => {
    // Tab to tree, j, j, k
    // Assert: focus moves down 2 then up 1
  });

  test("KEY-DIFF-027: Enter in file tree jumps to file", async () => {
    // Tab to tree, j, Enter
    // Assert: content scrolls to second file
  });

  test("KEY-DIFF-028: c opens comment form on landing diff", async () => {
    // On landing diff, press c
    // Assert: comment form overlay visible
  });

  test("KEY-DIFF-029: c is no-op on change diff", async () => {
    // On change diff, press c
    // Assert: no overlay, no state change
  });

  test("KEY-DIFF-030: Ctrl+S submits comment", async () => {
    // Open comment form, type body, press Ctrl+S
    // Assert: comment submitted, overlay closes, comment appears inline
  });

  test("KEY-DIFF-031: Esc cancels comment form", async () => {
    // Open comment form, press Esc
    // Assert: overlay closes, no comment created
  });

  test("KEY-DIFF-032: R retries failed fetch", async () => {
    // Trigger error state, press R
    // Assert: loading spinner shown, re-fetch initiated
  });

  test("KEY-DIFF-033: q pops diff screen", async () => {
    // Press q
    // Assert: diff screen removed from stack, previous screen visible
  });

  test("KEY-DIFF-034: Esc pops diff screen", async () => {
    // Press Esc (no overlay open)
    // Assert: diff screen removed from stack
  });

  test("KEY-DIFF-035: ? toggles help overlay", async () => {
    // Press ?
    // Assert: help overlay shown with diff keybindings
  });

  test("KEY-DIFF-036: ? then Esc closes help", async () => {
    // Press ?, then Esc
    // Assert: help overlay dismissed
  });

  test("KEY-DIFF-037: rapid j presses scroll smoothly", async () => {
    // Press j 20 times rapidly
    // Assert: scroll advances 20 lines without skipping
  });

  test("KEY-DIFF-038: file navigation updates status bar", async () => {
    // Press ]
    // Assert: status bar "File N of M" updates
  });
});
```

### Responsive Behavior Tests (15 tests)

```typescript
describe("TUI_DIFF_SCREEN — responsive behavior", () => {
  test("RSP-DIFF-001: sidebar hidden at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "diff", "--repo", "test/repo", "--change", "abc123"] });
    await terminal.waitForText("Diff");
    // Assert: no file tree sidebar rendered, main content full width
    await terminal.terminate();
  });

  test("RSP-DIFF-002: sidebar visible at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "diff", "--repo", "test/repo", "--change", "abc123"] });
    await terminal.waitForText("Diff");
    // Assert: file tree at ~25%, main content at ~75%
    await terminal.terminate();
  });

  test("RSP-DIFF-003: sidebar visible at 200x60", async () => {
    // Assert: sidebar at 25% with full untruncated paths
  });

  test("RSP-DIFF-004: split view available at 120x40", async () => {
    // At 120x40, press t
    // Assert: split view renders with two panes
  });

  test("RSP-DIFF-005: split view unavailable at 80x24", async () => {
    // At 80x24, press t
    // Assert: flash message, stays unified
  });

  test("RSP-DIFF-006: resize from 120 to 80 during split view", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "diff", "--repo", "test/repo", "--change", "abc123"] });
    await terminal.waitForText("Diff");
    await terminal.sendKeys("t"); // enter split view
    await terminal.resize(80, 24);
    // Assert: auto-switches to unified, flash message shown
    await terminal.terminate();
  });

  test("RSP-DIFF-007: resize from 80 to 120 preserves view mode", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "diff", "--repo", "test/repo", "--change", "abc123"] });
    await terminal.waitForText("Diff");
    await terminal.resize(120, 40);
    // Assert: stays unified (does not auto-switch to split)
    await terminal.terminate();
  });

  test("RSP-DIFF-008: resize preserves scroll position", async () => {
    // Scroll down, resize, assert scroll position preserved
  });

  test("RSP-DIFF-009: resize preserves sidebar toggle state", async () => {
    // At 120, hide sidebar (Ctrl+B), resize to 200
    // Assert: sidebar stays hidden (user preference preserved)
  });

  test("RSP-DIFF-010: file paths truncate at narrow sidebar", async () => {
    // At 80x24 with sidebar toggled on (Ctrl+B)
    // Assert: paths truncated with …/ prefix
  });

  test("RSP-DIFF-011: line number gutter width at 80x24", async () => {
    // Assert: 4-character gutter
  });

  test("RSP-DIFF-012: line number gutter width at 120x40", async () => {
    // Assert: 5-character gutter
  });

  test("RSP-DIFF-013: line number gutter width at 200x60", async () => {
    // Assert: 6-character gutter
  });

  test("RSP-DIFF-014: context lines at standard size", async () => {
    // At 120x40
    // Assert: 3 context lines around hunks
  });

  test("RSP-DIFF-015: context lines at large size", async () => {
    // At 200x60
    // Assert: 5 context lines around hunks
  });
});
```

### Data Loading and Integration Tests (14 tests)

```typescript
describe("TUI_DIFF_SCREEN — data loading and integration", () => {
  test("INT-DIFF-001: loads change diff from API", async () => {
    // Navigate to diff screen for a change
    // Assert: GET /api/repos/:owner/:repo/changes/:change_id/diff called
    // Assert: file list renders from response
  });

  test("INT-DIFF-002: loads landing diff from API", async () => {
    // Navigate to diff screen for a landing
    // Assert: GET /api/repos/:owner/:repo/landings/:number/diff called
  });

  test("INT-DIFF-003: whitespace toggle re-fetches with query param", async () => {
    // Press w
    // Assert: new fetch with ignore_whitespace=true
  });

  test("INT-DIFF-004: whitespace toggle back re-fetches without param", async () => {
    // Press w twice
    // Assert: fetch without ignore_whitespace
  });

  test("INT-DIFF-005: cached diff serves on back-navigation", async () => {
    // Navigate to diff, q, navigate back within 30s
    // Assert: no new API request
  });

  test("INT-DIFF-006: expired cache re-fetches", async () => {
    // Navigate to diff, wait >30s, navigate back
    // Assert: new API request made
  });

  test("INT-DIFF-007: inline comments loaded for landing diff", async () => {
    // Landing diff screen
    // Assert: comments fetched and rendered inline
  });

  test("INT-DIFF-008: comment creation posts to API", async () => {
    // Submit comment form
    // Assert: POST request sent, comment appears inline
  });

  test("INT-DIFF-009: 401 shows auth error", async () => {
    // API returns 401
    // Assert: auth error screen with login instructions
  });

  test("INT-DIFF-010: 404 shows not found", async () => {
    // API returns 404
    // Assert: "Change not found." or "Landing request not found."
  });

  test("INT-DIFF-011: 429 shows rate limit", async () => {
    // API returns 429
    // Assert: status bar shows rate limit countdown
  });

  test("INT-DIFF-012: network error shows retry prompt", async () => {
    // Network error during fetch
    // Assert: error message with R to retry
  });

  test("INT-DIFF-013: large diff renders with file count warning", async () => {
    // Diff with 200+ files
    // Assert: "Large diff: N files" warning
  });

  test("INT-DIFF-014: 500+ files truncated to 500", async () => {
    // Diff with >500 files
    // Assert: only 500 rendered, truncation notice shown
  });
});
```

### Edge Case Tests (15 tests)

```typescript
describe("TUI_DIFF_SCREEN — edge cases", () => {
  test("EDGE-DIFF-001: binary file shows binary notice", async () => {
    // File with is_binary: true
    // Assert: "Binary file changed" instead of diff
  });

  test("EDGE-DIFF-002: empty file shows empty notice", async () => {
    // Added file with 0 lines
    // Assert: "Empty file added"
  });

  test("EDGE-DIFF-003: renamed file with no content change", async () => {
    // change_type: "renamed" with empty patch
    // Assert: "File renamed from old/path to new/path"
  });

  test("EDGE-DIFF-004: permission-only change", async () => {
    // Mode change, no content diff
    // Assert: "File mode changed: 100644 → 100755"
  });

  test("EDGE-DIFF-005: malformed patch renders error for file", async () => {
    // Unparseable patch
    // Assert: "Unable to parse diff for <filename>", other files normal
  });

  test("EDGE-DIFF-006: file >1MB shows too large notice", async () => {
    // File exceeding 1MB
    // Assert: "File too large to display"
  });

  test("EDGE-DIFF-007: null patch field", async () => {
    // patch: null
    // Assert: "No diff available for this file"
  });

  test("EDGE-DIFF-008: diff with only whitespace changes and ws hidden", async () => {
    // All whitespace changes, whitespace hidden
    // Assert: "No visible changes (whitespace hidden). Press w to show whitespace."
  });

  test("EDGE-DIFF-009: single file diff has no file navigation", async () => {
    // Single file diff
    // Assert: ]/[ are no-ops, status bar shows "File 1 of 1"
  });

  test("EDGE-DIFF-010: comment form preserves content on resize", async () => {
    // Open comment form, type, resize
    // Assert: typed content preserved
  });

  test("EDGE-DIFF-011: syntax highlighting fallback for unknown language", async () => {
    // File with language: null, no recognizable extension
    // Assert: plain text rendering, no syntax colors
  });

  test("EDGE-DIFF-012: very long file path in breadcrumb", async () => {
    // Path > 60 chars
    // Assert: truncated from left in breadcrumb
  });

  test("EDGE-DIFF-013: diff screen from command palette", async () => {
    // :diff owner/repo change_id
    // Assert: diff screen pushed with correct context
  });

  test("EDGE-DIFF-014: stat numbers abbreviated at 1000+", async () => {
    // File with 1500 additions
    // Assert: shows +1.5k in file tree
  });

  test("EDGE-DIFF-015: concurrent resize and keyboard input", async () => {
    // Resize and press keys simultaneously
    // Assert: layout and handlers remain consistent
  });
});
```

### Test Total

| Category | Count |
|----------|-------|
| Snapshot (SNAP-DIFF) | 30 |
| Keyboard (KEY-DIFF) | 38 |
| Responsive (RSP-DIFF) | 15 |
| Integration (INT-DIFF) | 14 |
| **Subtotal (this ticket)** | **97** |
| Existing syntax tests (SNAP-SYN, KEY-SYN, RSP-SYN, INT-SYN, EDGE-SYN) | 36 |
| **Total in diff.test.ts** | **133** |

### Test Philosophy

Following the project's testing principles:

1. **Tests that fail due to unimplemented backends stay failing.** These tests will fail until the API endpoints and data hooks are implemented. They are never skipped.
2. **No mocking.** Tests run against the real API server with test fixtures.
3. **Each test validates one behavior.** Named by user-facing behavior, not implementation.
4. **Tests run at representative sizes.** Snapshot tests cover 80×24, 120×40, and 200×60.
5. **Tests are independent.** Each launches a fresh TUI instance.

---

## Source of Truth

This engineering specification should be maintained alongside:

- [specs/tui/prd.md](./prd.md) — Product requirements
- [specs/tui/design.md](./design.md) — Design specification
- [specs/tui/architecture.md](./architecture.md) — Engineering architecture
- [specs/tui/features.ts](./features.ts) — Codified feature inventory
