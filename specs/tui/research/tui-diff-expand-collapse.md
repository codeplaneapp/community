# Research: tui-diff-expand-collapse — Hunk Expand/Collapse with z/Z/x/X Keys

## 1. Current Codebase State

### 1.1 DiffScreen Directory — Empty

**Path:** `apps/tui/src/screens/DiffScreen/`
**Status:** Directory exists but is completely empty. No files have been created yet.

The screen router at `apps/tui/src/router/registry.ts` maps `ScreenName.DiffView` to `PlaceholderScreen` (temporary). This means ALL dependency tickets (`tui-diff-screen-scaffold`, `tui-diff-unified-view`, `tui-diff-parse-utils`) are also unimplemented. This ticket builds on top of those.

### 1.2 Diff Parse Utilities — Not Yet Implemented

**Expected path:** `apps/tui/src/lib/diff-parse.ts` — Does NOT exist yet.
**Expected path:** `apps/tui/src/lib/diff-types.ts` — Does NOT exist yet.

The `tui-diff-parse-utils` spec (dependency) defines the following functions this ticket consumes:

- `parseDiffHunks(patch)` → `ParsedDiff` — Parses a raw unified diff patch string
- `getHunkVisualOffsets(hunks, collapseState?)` → `number[]` — Computes cumulative visual line offsets accounting for collapsed hunks
- `getFocusedHunkIndex(scrollPosition, hunkVisualOffsets)` → `number` — Binary search to find which hunk contains scroll position
- `getCollapsedSummaryText(hunk, terminalWidth)` → `string` — Generates summary text for collapsed hunks

Key types from `diff-types.ts` (spec-defined, not yet created):
```typescript
interface ParsedHunk {
  index: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  scopeName: string | null;
  lines: DiffLine[];
  splitPairs: SplitLinePair[];
  totalLineCount: number;
}

interface ParsedDiff {
  hunks: ParsedHunk[];
  isEmpty: boolean;
  error: string | null;
  unifiedLineMap: Map<number, number>;
  splitLeftLineMap: Map<number, number>;
  splitRightLineMap: Map<number, number>;
  hunkVisualOffsets: number[];
}
```

### 1.3 Existing Diff Infrastructure (Implemented)

Only foundational infra exists:

| File | Status | Purpose |
|------|--------|--------|
| `apps/tui/src/lib/diff-syntax.ts` | ✅ Implemented (143 lines) | Color palettes (truecolor/ansi256/ansi16), `resolveFiletype()`, `createDiffSyntaxStyle()` |
| `apps/tui/src/hooks/useDiffSyntaxStyle.ts` | ✅ Implemented | Memoized SyntaxStyle with cleanup |
| `apps/tui/src/theme/tokens.ts` | ✅ Implemented (263 lines) | ThemeTokens with 12 semantic tokens including `diffAddedBg`, `diffRemovedBg`, `diffHunkHeader`, `primary`, `muted`, `border` |
| `apps/tui/src/theme/detect.ts` | ✅ Implemented | Terminal color capability detection |
| `apps/tui/src/hooks/useTheme.ts` | ✅ Implemented | Returns frozen `ThemeTokens` from context |

### 1.4 Existing Dependency: Per-File useHunkCollapse (Spec Only)

The `tui-diff-unified-view` spec defines a per-file `useHunkCollapse` hook (spec lines 296–353):
```typescript
export interface HunkCollapseState {
  collapseState: Map<number, boolean>;
  toggleHunk: (hunkIndex: number) => void;
  collapseAll: (hunkCount: number) => void;
  expandAll: () => void;
  reset: () => void;
  isCollapsed: (hunkIndex: number) => boolean;
}
```
This is the per-file hook that this ticket REPLACES with `useHunkCollapseGlobal` (cross-file, nested Map).

### 1.5 Existing Dependency: useDiffScroll (Spec Only)

From `tui-diff-unified-view` spec (lines 364–398):
```typescript
export interface DiffScrollState {
  scrollOffset: number;
  scrollDown: () => void;
  scrollUp: () => void;
  pageDown: (viewportHeight: number) => void;
  pageUp: (viewportHeight: number) => void;
  jumpToTop: () => void;
  jumpToBottom: (totalLines: number, viewportHeight: number) => void;
  resetScroll: () => void;
  scrollRef: React.RefCallback<ScrollHandle>;
}
```
This ticket MODIFIES this hook to add `adjustAfterCollapse(removedLines)` and `adjustAfterExpand(addedLines)` methods.

---

## 2. Architecture & Pattern Context

### 2.1 Keybinding System (Implemented)

**File:** `apps/tui/src/providers/keybinding-types.ts` (90 lines)

Key types the collapse keybindings must conform to:
```typescript
export interface KeyHandler {
  key: string;           // Normalized key descriptor: "z", "Z", "x", "X", "return"
  description: string;   // Human-readable for help overlay
  group: string;         // Grouping in help overlay ("Diff")
  handler: () => void;   // Invoked on key match
  when?: () => boolean;  // Optional predicate checked at dispatch time
}

export const PRIORITY = {
  TEXT_INPUT: 1,
  MODAL: 2,
  GOTO: 3,
  SCREEN: 4,    // ← Collapse keybindings register here
  GLOBAL: 5,
} as const;
```

**File:** `apps/tui/src/hooks/useScreenKeybindings.ts` (55 lines)

Registration pattern:
```typescript
export function useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[]): void
```
- Pushes `PRIORITY.SCREEN` scope on mount, pops on unmount
- Uses `bindingsRef` for handler freshness without re-registration
- Auto-generates status bar hints from first 8 bindings if `hints` not provided
- The `bindings.map(b => b.key).join(",")` dependency array means scope re-registers when key set changes

**Key normalization** (`apps/tui/src/providers/normalize-key.ts`):
- "z" stays "z" (lowercase single char)
- "Z" stays "Z" (uppercase detected via event.shift + event.name)
- "Enter" normalizes to "return"
- "Esc" normalizes to "escape"
- Ctrl+z would be "ctrl+z" — distinct from "z"

### 2.2 Status Bar Hints Pattern

```typescript
export interface StatusBarHint {
  keys: string;     // e.g., "z/x"
  label: string;    // e.g., "hunks"
  order?: number;   // Lower = shown first. Default: 50.
}
```

The spec calls for:
- At standard+: `{ keys: "z/x", label: "hunks", order: 40 }`
- At minimum: `{ keys: "z/x", label: "", order: 40 }` (just keys, no label)

### 2.3 Overlay System (Implemented)

**File:** `apps/tui/src/providers/overlay-types.ts` (27 lines)

The `hasOverlay` guard in collapse keybindings checks:
```typescript
interface OverlayContextType {
  activeOverlay: OverlayState;  // "help" | "command-palette" | "confirm" | null
  isOpen(type: OverlayType): boolean;
}
```

When `activeOverlay !== null`, the collapse keybindings' `when()` returns false, letting keys fall through to the modal scope.

### 2.4 Theme Token Access Pattern

**File:** `apps/tui/src/hooks/useTheme.ts`

The `CollapsedHunkSummary` and `DiffHunkHeader` components use:
```typescript
const theme = useTheme();
// theme.primary → RGBA (blue, for ▶/▼ indicators)
// theme.muted → RGBA (gray, for summary text)
// theme.border → RGBA (gray, for dashed borders)
```

Tokens are frozen and referentially stable — safe in dependency arrays.

### 2.5 Responsive Layout Pattern (Implemented)

**File:** `apps/tui/src/hooks/useLayout.ts` (110 lines)

```typescript
export function useLayout(): LayoutContext {
  // Returns: width, height, breakpoint, contentHeight, sidebarVisible, ...
}
```

**File:** `apps/tui/src/types/breakpoint.ts`
```typescript
export type Breakpoint = "minimum" | "standard" | "large";
export function getBreakpoint(cols: number, rows: number): Breakpoint | null;
```

Breakpoint boundaries:
- `null`: < 80×24 (unsupported)
- `"minimum"`: 80×24 – 119×39
- `"standard"`: 120×40 – 199×59
- `"large"`: 200×60+

The 120-column breakpoint for summary format switching aligns with the `minimum` → `standard` transition.

### 2.6 Telemetry Pattern (Implemented)

**File:** `apps/tui/src/lib/telemetry.ts` (62 lines)

```typescript
export function emit(
  name: string,
  properties: Record<string, string | number | boolean> = {}
): void;
```

Events are written to stderr as JSON when `CODEPLANE_TUI_DEBUG=true`. The collapse-telemetry.ts file should call `emit()` with event names like `tui.diff.hunk.collapse_single`, `tui.diff.hunk.expand_single`, etc.

---

## 3. SDK Types (Implemented)

**File:** `packages/sdk/src/services/repohost.ts` (lines 52–68)

```typescript
export interface ChangeDiff {
  change_id: string;
  file_diffs: FileDiffItem[];
}

export interface FileDiffItem {
  path: string;
  old_path?: string;
  change_type: string;
  patch?: string;          // Raw unified diff string
  is_binary: boolean;
  language?: string;
  additions: number;
  deletions: number;
  old_content?: string;
  new_content?: string;
}
```

The `patch` field is the input to `parseDiffHunks()`. Binary files have `is_binary: true` and no `patch` — the collapse feature treats them as 0-hunk files.

---

## 4. OpenTUI Component Reference

**File:** `context/opentui/packages/core/src/renderables/Diff.ts`

The `<diff>` component accepts:
```typescript
interface DiffRenderableOptions {
  diff?: string;                    // Raw unified diff string
  view?: "unified" | "split";
  filetype?: string;
  syntaxStyle?: SyntaxStyle;
  wrapMode?: "word" | "char" | "none";
  showLineNumbers?: boolean;
  addedBg?: string | RGBA;
  removedBg?: string | RGBA;
  addedSignColor?: string | RGBA;
  removedSignColor?: string | RGBA;
  lineNumberFg?: string | RGBA;
  lineNumberBg?: string | RGBA;
  addedLineNumberBg?: string | RGBA;
  removedLineNumberBg?: string | RGBA;
}
```

Internally uses `parsePatch` from the `diff` npm package (line 7: `import { parsePatch } from "diff"`). The `diff` package is a transitive dependency — available for `diff-parse.ts` to reuse.

OpenTUI provides these relevant components:
- `<box>` — flexbox layout container
- `<text>` — text rendering with fg/bg color props
- `<scrollbox>` — scrollable container with scroll-to-end detection
- `<diff>` — diff rendering with unified/split modes
- `<code>` — syntax-highlighted code blocks
- `<markdown>` — markdown rendering

OpenTUI provides these relevant hooks:
- `useKeyboard` — raw keyboard input
- `useTerminalDimensions` — { width, height }
- `useOnResize` — resize callback

---

## 5. Test Infrastructure (Implemented)

### 5.1 Test Helper

**File:** `e2e/tui/helpers.ts` (491 lines)

Key exports for test implementation:
```typescript
export const TERMINAL_SIZES = {
  minimum: { width: 80, height: 24 },
  standard: { width: 120, height: 40 },
  large: { width: 200, height: 60 },
};

export interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>;
  sendText(text: string): Promise<void>;
  waitForText(text: string, timeoutMs?: number): Promise<void>;
  waitForNoText(text: string, timeoutMs?: number): Promise<void>;
  snapshot(): string;
  getLine(lineNumber: number): string;
  resize(cols: number, rows: number): Promise<void>;
  terminate(): Promise<void>;
  rows: number;
  cols: number;
}

export async function launchTUI(options?: LaunchTUIOptions): Promise<TUITestInstance>;
export function createMockAPIEnv(options?): Record<string, string>;
export function createTestCredentialStore(token?): { path; token; cleanup };
```

Key implementation details:
- Launches TUI via `@microsoft/tui-test`'s `spawn()` with real PTY
- Default env: `TERM=xterm-256color`, `COLORTERM=truecolor`, `LANG=en_US.UTF-8`
- 50ms delay between keypresses in `sendKeys()`
- `waitForText` polls every 100ms with 10s default timeout
- `snapshot()` returns full terminal buffer as string (rows joined by `\n`)
- `resize()` calls `terminal.resize()` with 200ms delay for SIGWINCH processing

Key resolution for collapse keybindings in tests:
- `"z"` → `{ type: "press", key: "z" }` (single char pass-through)
- `"Z"` → `{ type: "press", key: "Z" }` (single char pass-through)
- `"x"` → `{ type: "press", key: "x" }` (single char pass-through)
- `"X"` → `{ type: "press", key: "X" }` (single char pass-through)
- `"Enter"` → `{ type: "press", key: "Enter" }` (named key)
- `"ctrl+b"` → `{ type: "press", key: "b", modifiers: { ctrl: true } }` (dynamic pattern)
- `"ctrl+z"` → `{ type: "press", key: "z", modifiers: { ctrl: true } }` (dynamic pattern)

### 5.2 Existing diff.test.ts

**File:** `e2e/tui/diff.test.ts` (216 lines)

Currently contains 38 empty stub tests for `TUI_DIFF_SYNTAX_HIGHLIGHT` feature — no implementations, just describe/test blocks with TODO comments. The expand/collapse tests (65 tests per the eng spec) will be appended to this file.

Test framework: `bun:test` (Bun's native test framework)
- `describe()`, `test()`, `expect()` from `bun:test`
- `toMatchSnapshot()` for golden-file comparison
- Tests run with `bun test ../../e2e/tui/ --timeout 30000`
- `bunfig.toml` sets `test.timeout = 30000`

### 5.3 Test Data Requirements

Per spec section 12.1, E2E tests require:
- Repository with 2+ file change
- At least one file with 3+ hunks
- At least one file with a single-line hunk
- At least one binary file in a diff
- At least one landing request diff

Tests run against real API server — no mocks. Tests that can't reach the server fail at navigation, not at collapse assertions.

---

## 6. File Inventory — What to Create

### 6.1 New Files (5)

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `apps/tui/src/screens/DiffScreen/useHunkCollapseGlobal.ts` | Cross-file nested Map state hook | ~100 |
| `apps/tui/src/screens/DiffScreen/useFocusedHunk.ts` | Derives focused hunk from scroll position | ~50 |
| `apps/tui/src/screens/DiffScreen/CollapsedHunkSummary.tsx` | Collapsed hunk summary component (▶ ⋯ N lines hidden) | ~45 |
| `apps/tui/src/screens/DiffScreen/useCollapseKeybindings.ts` | z/Z/x/X/Enter keybinding handlers | ~130 |
| `apps/tui/src/screens/DiffScreen/collapse-telemetry.ts` | 6 telemetry event emitters | ~70 |

### 6.2 Modified Files (7)

| File | Change |
|------|--------|
| `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` | Replace `useHunkCollapse()` with `useHunkCollapseGlobal()`, wire `useCollapseKeybindings()`, reset on whitespace toggle |
| `apps/tui/src/screens/DiffScreen/DiffHunkHeader.tsx` | Add ▼/▶ indicator with `collapsed` prop, primary color |
| `apps/tui/src/screens/DiffScreen/UnifiedDiffViewer.tsx` | Replace inline collapsed summary with `<CollapsedHunkSummary>` |
| `apps/tui/src/screens/DiffScreen/types.ts` | Add `HunkCollapseGlobalState`, `CollapsedHunkSummaryProps`, `FocusedHunkInfo` |
| `apps/tui/src/screens/DiffScreen/useDiffScroll.ts` | Add `adjustAfterCollapse()` and `adjustAfterExpand()` |
| `apps/tui/src/screens/DiffScreen/diff-constants.ts` | Add `COLLAPSED_SUMMARY_HEIGHT=3`, `DASHED_BORDER_CHAR='╌'`, etc. |
| `apps/tui/src/lib/diff-parse.ts` | Enhance `getCollapsedSummaryText()` for singular form and en-dash |

### 6.3 Test File

| File | Tests |
|------|-------|
| `e2e/tui/diff.test.ts` | Append 65 tests (13 snapshot + 26 keyboard + 8 responsive + 6 integration + 12 edge case) |

---

## 7. Dependency Chain

```
tui-diff-parse-utils (NOT started)
  └── diff-types.ts, diff-parse.ts
  └── parseDiffHunks, getHunkVisualOffsets, getFocusedHunkIndex, getCollapsedSummaryText

tui-diff-screen-scaffold (NOT started)
  └── DiffScreen.tsx shell, types.ts, registry update

tui-diff-unified-view (NOT started)
  └── UnifiedDiffViewer.tsx, DiffHunkHeader.tsx, DiffFileHeader.tsx
  └── useHunkCollapse.ts, useDiffScroll.ts, useFileNavigation.ts
  └── diff-constants.ts

tui-diff-expand-collapse (THIS TICKET)
  └── useHunkCollapseGlobal.ts (replaces useHunkCollapse)
  └── useFocusedHunk.ts
  └── CollapsedHunkSummary.tsx
  └── useCollapseKeybindings.ts
  └── collapse-telemetry.ts
  └── Modifies: DiffScreen, DiffHunkHeader, UnifiedDiffViewer, types, useDiffScroll, diff-constants, diff-parse
```

All three upstream dependencies must be implemented first. The DiffScreen directory is currently empty.

---

## 8. Key Design Decisions & Patterns to Follow

### 8.1 Nested Map vs Flat Map

The spec chose `Map<string, Map<number, boolean>>` over `Map<"file:hunkIdx", boolean>` because:
- `collapseAllInFile` and `expandAllInFile` are O(hunk_count) with direct file-level access
- `getFileCollapseMap` returns inner Map directly without allocation
- Empty inner Maps are garbage collected via `next.delete(filePath)`

### 8.2 Ref + State Pattern for Keybinding Handlers

The codebase uses `optsRef.current` pattern extensively:
- `useScreenKeybindings` uses `bindingsRef.current` (line 24-25 of useScreenKeybindings.ts)
- Keybinding handlers access ref to avoid stale closures from React's render cycle
- State drives re-renders, ref provides synchronous reads

### 8.3 Immutable State Updates

Every `setCollapsed()` call creates new outer AND inner Maps. This is the same pattern used in `useHunkCollapse` (spec lines 319-329). React detects change via reference inequality.

### 8.4 Status Bar Hint Responsive Behavior

At `minimum` breakpoint: `{ keys: "z/x", label: "", order: 40 }` (keys only)
At `standard`+: `{ keys: "z/x", label: "hunks", order: 40 }` (keys + label)

### 8.5 COLLAPSED_SUMMARY_HEIGHT = 3

The collapsed summary occupies exactly 3 rows:
1. Dashed border line (`╌╌╌...`)
2. Summary text line (`▶ ⋯ N lines hidden (lines X–Y)`)
3. Dashed border line (`╌╌╌...`)

However, in the scroll model, a collapsed hunk is treated as **1 conceptual row** for j/k navigation — the 3-row visual rendering is internal to the scrollbox content.

### 8.6 Unicode Fallback

The `CollapsedHunkSummary` checks `TERM` and `LANG` env vars:
- `TERM=dumb` or no UTF-8 in LANG → fallback to ASCII `-`
- Otherwise → `╌` (Unicode box-drawing)
- The `▶`/`▼` indicators are always rendered (even on dumb terminals)

### 8.7 State Persistence Matrix

| Action | Preserves State? | Implementation |
|--------|-----------------|----------------|
| `]`/`[` (file nav) | ✅ Yes | Cross-file Map retains per-file state |
| `Ctrl+B` (sidebar) | ✅ Yes | Layout-only change |
| `t` (view toggle) | ✅ Yes | Both viewers read same Map |
| `l` (line numbers) | ✅ Yes | Rendering-only change |
| `w` (whitespace) | ❌ Reset | Call `hunkCollapse.reset()` |
| `q` (pop screen) | ❌ Reset | Component unmounts |
| Re-enter screen | ❌ Reset | Fresh `useHunkCollapseGlobal()` |
| Terminal resize | ✅ Yes | State is line-count-based |

---

## 9. Potential Implementation Risks

### 9.1 All Dependencies Unimplemented

The DiffScreen directory is completely empty. This ticket modifies 7 files that don't exist yet. Implementation must either:
- Wait for `tui-diff-parse-utils`, `tui-diff-screen-scaffold`, and `tui-diff-unified-view` to land first
- Or implement the collapse feature alongside stubs for the missing dependencies

### 9.2 getCollapsedSummaryText Enhancement

The spec modifies `diff-parse.ts` (which doesn't exist yet) to enhance `getCollapsedSummaryText()` with:
- Singular form: `"1 line hidden (line X)"` (not `"1 lines hidden"`)
- En-dash character: `\u2013` between line range numbers
- Use `hunk.newStart` (not `hunk.oldStart`) for the line range

This function will need to be created as part of `tui-diff-parse-utils` or created here if that dependency hasn't landed.

### 9.3 Scroll Adjustment Complexity

The spec defines two scroll adjustment callbacks:
- `adjustAfterCollapse(removedLines)`: Decreases scroll offset when collapse is above viewport
- `adjustAfterExpand(addedLines)`: No-op (expansion flows downward)

The tricky edge case: determining if the collapsed hunk is above, at, or below the current viewport. The spec simplifies this to always decrement, but the actual implementation may need the visual offset comparison.

### 9.4 Enter Key Conflict

The `Enter` keybinding has a `when` condition that checks `focusedHunk.onCollapsedSummary`. This means it only activates when the cursor is on a collapsed hunk. When not on a collapsed hunk, `Enter` falls through to other handlers (e.g., list selection in file tree). This conditional routing relies on the `KeybindingProvider`'s dispatch logic honoring the `when` predicate.

### 9.5 Split View Integration

If `SplitDiffViewer` exists (from `tui-diff-split-view`), collapsed summary spans full terminal width (not half). This is specified but the split view ticket is also unimplemented.

---

## 10. Relevant File Paths Summary

### Existing (Implemented)

| File | Relevance |
|------|----------|
| `apps/tui/src/providers/keybinding-types.ts` | KeyHandler, PRIORITY, StatusBarHint interfaces |
| `apps/tui/src/hooks/useScreenKeybindings.ts` | Registration pattern for screen keybindings |
| `apps/tui/src/providers/normalize-key.ts` | Key normalization ("z"→"z", "Z"→"Z", "Enter"→"return") |
| `apps/tui/src/providers/overlay-types.ts` | OverlayContextType for hasOverlay guard |
| `apps/tui/src/hooks/useOverlay.ts` | useOverlay() hook |
| `apps/tui/src/hooks/useTheme.ts` | useTheme() → ThemeTokens with primary, muted, border |
| `apps/tui/src/theme/tokens.ts` | ThemeTokens interface, RGBA color constants |
| `apps/tui/src/hooks/useLayout.ts` | useLayout() → width, height, breakpoint, contentHeight |
| `apps/tui/src/hooks/useBreakpoint.ts` | useBreakpoint() → Breakpoint | null |
| `apps/tui/src/types/breakpoint.ts` | Breakpoint type, getBreakpoint() |
| `apps/tui/src/lib/telemetry.ts` | emit() for telemetry events |
| `apps/tui/src/lib/diff-syntax.ts` | Color palettes, resolveFiletype() |
| `apps/tui/src/router/types.ts` | ScreenName.DiffView, navigation types |
| `packages/sdk/src/services/repohost.ts` | FileDiffItem, ChangeDiff types |
| `e2e/tui/helpers.ts` | launchTUI, TUITestInstance, TERMINAL_SIZES |
| `e2e/tui/diff.test.ts` | Existing test stubs (38 syntax highlight tests) |
| `context/opentui/packages/core/src/renderables/Diff.ts` | OpenTUI <diff> component, DiffRenderableOptions |

### Specs (Reference)

| File | Content |
|------|--------|
| `specs/tui/TUI_DIFF_EXPAND_COLLAPSE.md` | Product specification with acceptance criteria |
| `specs/tui/engineering/tui-diff-expand-collapse.md` | Engineering specification (the ticket input) |
| `specs/tui/engineering/tui-diff-unified-view.md` | Dependency: unified view with useHunkCollapse, useDiffScroll |
| `specs/tui/engineering/tui-diff-parse-utils.md` | Dependency: parseDiffHunks, getHunkVisualOffsets, getFocusedHunkIndex |
| `specs/tui/engineering/tui-diff-screen-scaffold.md` | Dependency: DiffScreen shell, params, focus zones |
| `specs/tui/features.ts` | TUI_DIFF_EXPAND_COLLAPSE in TUI_DIFF feature group (line 101) |