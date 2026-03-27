# Engineering Specification: DiffScreen Component Shell

**Ticket:** `tui-diff-screen-scaffold`
**Status:** Not started
**Dependencies:** `tui-screen-router` (screen registry, `ScreenComponentProps`), `tui-app-shell-integration` (AppShell, HeaderBar, StatusBar), `tui-theme-provider` (color tokens), `tui-diff-data-hooks` (`useChangeDiff`, `useLandingDiff`)
**Target directory:** `apps/tui/src/`
**Test directory:** `e2e/tui/`

---

## 1. Overview

This ticket creates the `DiffScreen` component — the top-level screen component for viewing diffs of individual jj changes and landing request change stacks. It replaces `PlaceholderScreen` in the screen registry for `ScreenName.DiffView` and provides:

1. **Screen registration** with `requiresRepo: true` and context-aware breadcrumb generation.
2. **Three-zone layout**: optional file tree sidebar (left), main diff content area (center/right), and diff-specific status bar hints.
3. **Screen param handling**: `mode` (`'change'` | `'landing'`), `change_id` or `number` (landing number), `owner`, `repo`.
4. **Loading state**: full-screen spinner via `useScreenLoading` integration.
5. **Error state**: full-screen error display with `R` to retry.
6. **Focus zone state machine**: `tree` ↔ `content`, controlled by `Tab` and sidebar visibility.
7. **Breadcrumb generation**: dynamic breadcrumb text derived from mode and identifier.
8. **Screen-level keybinding scope**: all diff keybindings registered via `useScreenKeybindings`.
9. **Responsive layout**: sidebar auto-collapsed at `minimum` breakpoint, expanded at `standard`/`large`.

This is a **shell** — the file tree content, diff rendering, and inline comments are delivered by downstream tickets. This ticket delivers the structural container, state machine, data hook wiring, and keybinding registration.

---

## 2. Screen Params Contract

The `DiffScreen` receives params via the navigation stack. Params are injected by the caller at push time.

### 2.1 Param Schema

```typescript
/** DiffScreen expected params, validated from ScreenComponentProps.params */
interface DiffScreenParams {
  /** Diff mode. Determines which data hook to use. */
  mode: "change" | "landing";
  /** jj change ID. Required when mode === "change". */
  change_id?: string;
  /** Landing request number. Required when mode === "landing". */
  number?: string;
  /** Repository owner. Inherited from navigation stack (requiresRepo: true). */
  owner: string;
  /** Repository name. Inherited from navigation stack (requiresRepo: true). */
  repo: string;
}
```

### 2.2 Param Validation

Validation runs synchronously at the top of the component render. Invalid params render an inline error — never a crash.

```typescript
function validateDiffParams(
  params: Record<string, string>,
): { valid: true; parsed: DiffScreenParams } | { valid: false; message: string } {
  const mode = params.mode;
  if (mode !== "change" && mode !== "landing") {
    return { valid: false, message: "Invalid diff mode. Expected 'change' or 'landing'." };
  }
  if (mode === "change" && !params.change_id) {
    return { valid: false, message: "Missing change_id for change diff." };
  }
  if (mode === "landing" && !params.number) {
    return { valid: false, message: "Missing landing number for landing diff." };
  }
  if (!params.owner || !params.repo) {
    return { valid: false, message: "Missing repository context (owner/repo)." };
  }
  return {
    valid: true,
    parsed: {
      mode,
      change_id: params.change_id,
      number: params.number,
      owner: params.owner,
      repo: params.repo,
    },
  };
}
```

On validation failure, render `DiffParamError` with the message and register no keybindings. The `q` global keybinding (PRIORITY.GLOBAL = 5) still works to navigate back.

### 2.3 Navigation Examples

Callers push the diff screen like this:

```typescript
// From change list:
nav.push(ScreenName.DiffView, { mode: "change", change_id: "abc123" });
// owner and repo are inherited from repoContext in the stack

// From landing detail:
nav.push(ScreenName.DiffView, { mode: "landing", number: "42" });
```

The `NavigationProvider` merges `repoContext` (`{ owner, repo }`) into pushed params automatically when `requiresRepo: true`, so callers don't need to pass owner/repo explicitly.

---

## 3. Breadcrumb Generation

### 3.1 Registry Update

The `breadcrumbLabel` function in the screen registry entry for `ScreenName.DiffView` (line 113–118 of `apps/tui/src/router/registry.ts`) must be updated from the static `() => "Diff"` to produce contextual breadcrumbs:

```typescript
[ScreenName.DiffView]: {
  component: DiffScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => {
    if (p.mode === "change" && p.change_id) {
      // Truncate change_id to first 12 chars for readability
      return `Δ ${p.change_id.length > 12 ? p.change_id.slice(0, 12) : p.change_id}`;
    }
    if (p.mode === "landing" && p.number) {
      return `!${p.number} diff`;
    }
    return "Diff";
  },
},
```

### 3.2 Breadcrumb Examples

| Navigation Stack | Breadcrumb Trail |
|---|---|
| Dashboard → owner/repo → Δ abc123def456 | `Dashboard › owner/repo › Δ abc123def456` |
| Dashboard → owner/repo → Landings → !42 → !42 diff | `Dashboard › owner/repo › Landings › !42 › !42 diff` |

---

## 4. Layout Architecture

### 4.1 Three-Zone Layout

```
┌──────────┬──────────────────────────────────────┐
│ File     │                                      │
│ Tree     │         Diff Content Area             │
│ Sidebar  │         (scrollbox)                   │
│          │                                      │
│ (25%)    │         (75% or 100%)                 │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

The sidebar and content area live inside the AppShell content area (between HeaderBar and StatusBar). The DiffScreen component itself is a single `<box>` with `flexDirection="row"` that fills `flexGrow={1}` within the AppShell content slot.

### 4.2 Responsive Behavior

| Breakpoint | Sidebar Default | Sidebar Width | Content Width | Split Diff Available |
|---|---|---|---|---|
| `minimum` (80×24 – 119×39) | Hidden | 0% | 100% | No (unified only) |
| `standard` (120×40 – 199×59) | Visible | 25% | 75% | Yes |
| `large` (200×60+) | Visible | 30% | 70% | Yes |

The DiffScreen reads `layout.sidebarVisible` and `layout.sidebarWidth` from the existing `useLayout()` hook. Sidebar visibility is managed by `useSidebarState()` (exposed via `layout.sidebar`). The DiffScreen does NOT manage sidebar state independently — it reads from the shared layout system.

**Note on Ctrl+B:** The sidebar toggle function exists on `layout.sidebar.toggle()` (from `useSidebarState`), but Ctrl+B is not yet wired into `GlobalKeybindings` (which currently only registers `q`, `escape`, `ctrl+c`, `?`, `:`, `g`). The DiffScreen registers `ctrl+b` as a SCREEN-priority keybinding that calls `layout.sidebar.toggle()`. This is a screen-level binding until the global sidebar toggle ticket wires it at GLOBAL priority. When the global ticket lands, the DiffScreen binding will be superseded by the global one (GLOBAL priority 5 is lower than SCREEN priority 4, but since they do the same thing, the screen binding can be removed or left as a no-conflict duplicate).

### 4.3 Component Structure

```typescript
function DiffScreen({ entry, params }: ScreenComponentProps) {
  // --- Param validation ---
  const validation = validateDiffParams(params);
  if (!validation.valid) {
    return <DiffParamError message={validation.message} />;
  }
  const { parsed } = validation;

  // --- Data fetching ---
  const diffResult = useDiffData(parsed);
  const screenLoading = useScreenLoading({
    id: `diff-${parsed.mode}-${parsed.change_id || parsed.number}`,
    label: `Loading ${parsed.mode === "change" ? "change" : "landing"} diff…`,
    isLoading: diffResult.isLoading,
    error: diffResult.error,
    onRetry: diffResult.refetch,
  });

  // --- Focus zone ---
  const [focusZone, setFocusZone] = useState<FocusZone>("content");

  // --- View state ---
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified");
  const [showWhitespace, setShowWhitespace] = useState(true);

  // --- Layout ---
  const layout = useLayout();
  const theme = useTheme();

  // --- Focus reset on sidebar hide ---
  useEffect(() => {
    if (!layout.sidebarVisible && focusZone === "tree") {
      setFocusZone("content");
    }
  }, [layout.sidebarVisible, focusZone]);

  // --- Keybindings ---
  useScreenKeybindings(
    buildDiffKeybindings({
      focusZone,
      setFocusZone,
      viewMode,
      setViewMode,
      showWhitespace,
      setShowWhitespace,
      sidebarVisible: layout.sidebarVisible,
      sidebarToggle: layout.sidebar.toggle,
      breakpoint: layout.breakpoint,
    }),
    DIFF_STATUS_HINTS,
  );

  // --- Loading / Error rendering ---
  if (screenLoading.showSpinner) {
    return (
      <FullScreenLoading
        spinnerFrame={screenLoading.spinnerFrame}
        label={`Loading ${parsed.mode} diff…`}
      />
    );
  }
  if (screenLoading.showError && screenLoading.loadingError) {
    return (
      <FullScreenError
        screenLabel={`${parsed.mode} diff`}
        error={screenLoading.loadingError}
      />
    );
  }

  // --- Main layout ---
  return (
    <box flexDirection="row" flexGrow={1} width="100%">
      {layout.sidebarVisible && (
        <box
          width={layout.sidebarWidth}
          flexDirection="column"
          borderColor={focusZone === "tree" ? theme.primary : theme.border}
          borderRight
        >
          <DiffFileTreePlaceholder
            focused={focusZone === "tree"}
            files={diffResult.files}
          />
        </box>
      )}
      <box flexGrow={1} flexDirection="column">
        <DiffContentPlaceholder
          focused={focusZone === "content"}
          files={diffResult.files}
          viewMode={viewMode}
          showWhitespace={showWhitespace}
        />
      </box>
    </box>
  );
}
```

---

## 5. Focus Zone State Machine

### 5.1 States

```typescript
type FocusZone = "tree" | "content";
```

### 5.2 Transitions

| Current Zone | Trigger | Next Zone | Condition |
|---|---|---|---|
| `content` | `Tab` | `tree` | Sidebar is visible |
| `content` | `Tab` | `content` (no-op) | Sidebar is hidden |
| `tree` | `Tab` | `content` | Always |
| `tree` | `Escape` | `content` | Always |
| `tree` | `Enter` (select file) | `content` | Always (after file selection) |
| any | `Ctrl+B` (sidebar toggle) | `content` | When sidebar hides, focus returns to content |
| any | Resize to minimum | `content` | When sidebar auto-collapses |

### 5.3 Visual Focus Indicator

The active zone receives a visual indicator:

- **Tree zone focused**: sidebar border uses `theme.primary` color instead of `theme.border`.
- **Content zone focused**: no extra indicator (content is the default zone; the sidebar border stays `theme.border`).

This is achieved via the `borderColor` prop on the sidebar `<box>`:
```typescript
borderColor={focusZone === "tree" ? theme.primary : theme.border}
```

### 5.4 Focus Zone Initialization

Always starts at `"content"`. The file tree is a secondary navigation aid.

### 5.5 Sidebar Hide → Focus Reset

When the sidebar becomes invisible (via `Ctrl+B` toggle or breakpoint change from standard → minimum on resize), the focus zone must reset to `"content"` if currently on `"tree"`:

```typescript
useEffect(() => {
  if (!layout.sidebarVisible && focusZone === "tree") {
    setFocusZone("content");
  }
}, [layout.sidebarVisible, focusZone]);
```

---

## 6. Data Hook Wiring

### 6.1 Unified Data Interface

The `DiffScreen` shell delegates to either `useChangeDiff` or `useLandingDiff` based on the `mode` param. A thin adapter normalizes the return type:

```typescript
/** Normalized result shape consumed by DiffScreen layout */
interface DiffData {
  isLoading: boolean;
  error: { message: string; status?: number } | null;
  files: FileDiffItem[];
  changeId: string | null;         // Set for change mode
  landingNumber: number | null;    // Set for landing mode
  changes: LandingChangeDiff[];    // Set for landing mode (per-change diffs)
  refetch: () => void;
}
```

Note: `FileDiffItem` and `LandingChangeDiff` are imported from `apps/tui/src/types/diff.ts` (defined in the `tui-diff-data-hooks` dependency ticket). These types mirror `@codeplane/sdk`'s `FileDiffItem` but with a narrowed `change_type` union (`"added" | "modified" | "deleted" | "renamed" | "copied"`) instead of bare `string`.

### 6.2 Custom Hook: `useDiffData`

#### File: `apps/tui/src/screens/DiffScreen/useDiffData.ts`

```typescript
import { useChangeDiff } from "../../hooks/useChangeDiff.js";
import { useLandingDiff } from "../../hooks/useLandingDiff.js";
import type { DiffScreenParams } from "./types.js";
import type { FileDiffItem, LandingChangeDiff } from "../../types/diff.js";

interface DiffData {
  isLoading: boolean;
  error: { message: string; status?: number } | null;
  files: FileDiffItem[];
  changeId: string | null;
  landingNumber: number | null;
  changes: LandingChangeDiff[];
  refetch: () => void;
}

export function useDiffData(params: DiffScreenParams): DiffData {
  // Both hooks are always called (React rules of hooks),
  // but only one is enabled via the `enabled` option.
  const changeResult = useChangeDiff(
    params.owner,
    params.repo,
    params.change_id ?? "",
    { enabled: params.mode === "change" },
  );

  const landingResult = useLandingDiff(
    params.owner,
    params.repo,
    params.number ? parseInt(params.number, 10) : 0,
    { enabled: params.mode === "landing" },
  );

  if (params.mode === "change") {
    return {
      isLoading: changeResult.isLoading,
      error: changeResult.error,
      files: changeResult.data?.file_diffs ?? [],
      changeId: params.change_id ?? null,
      landingNumber: null,
      changes: [],
      refetch: changeResult.refetch,
    };
  }

  // Landing mode: flatten all file_diffs from all changes
  const allFiles = (landingResult.data?.changes ?? []).flatMap((c) => c.file_diffs);

  return {
    isLoading: landingResult.isLoading,
    error: landingResult.error,
    files: allFiles,
    changeId: null,
    landingNumber: params.number ? parseInt(params.number, 10) : null,
    changes: landingResult.data?.changes ?? [],
    refetch: landingResult.refetch,
  };
}
```

**Design decisions:**

- Both hooks are always called (React rules of hooks), but only one is `enabled`. The disabled hook returns idle state immediately.
- Landing mode flattens files across all changes for the file tree sidebar. Downstream tickets (DiffViewer) may display per-change grouping.
- `refetch` delegates to the active hook's refetch for retry.

---

## 7. Keybinding Registration

### 7.1 Complete Keybinding Set

All diff keybindings are registered as a single `PRIORITY.SCREEN` (= 4) scope via `useScreenKeybindings`. The `useScreenKeybindings` hook (in `apps/tui/src/hooks/useScreenKeybindings.ts`) pushes a scope on mount and pops it on unmount. Handler refs are kept fresh without re-registering the scope.

Downstream tickets will extend handlers for inline comments, expand/collapse, etc.

```typescript
function buildDiffKeybindings(ctx: {
  focusZone: FocusZone;
  setFocusZone: (zone: FocusZone) => void;
  viewMode: "unified" | "split";
  setViewMode: (mode: "unified" | "split") => void;
  showWhitespace: boolean;
  setShowWhitespace: (show: boolean) => void;
  sidebarVisible: boolean;
  sidebarToggle: () => void;
  breakpoint: Breakpoint | null;
}): KeyHandler[] {
  return [
    // --- Zone navigation ---
    {
      key: "tab",
      description: "Switch focus zone",
      group: "Navigation",
      handler: () => {
        if (!ctx.sidebarVisible) return;
        ctx.setFocusZone(ctx.focusZone === "tree" ? "content" : "tree");
      },
    },
    // --- Escape from tree to content ---
    {
      key: "escape",
      description: "Return to content",
      group: "Navigation",
      handler: () => ctx.setFocusZone("content"),
      when: () => ctx.focusZone === "tree",
    },
    // --- Sidebar toggle (Ctrl+B) ---
    {
      key: "ctrl+b",
      description: "Toggle sidebar",
      group: "Navigation",
      handler: () => ctx.sidebarToggle(),
    },
    // --- File navigation (content zone, wired by downstream ticket) ---
    {
      key: "]",
      description: "Next file",
      group: "Diff",
      handler: () => { /* wired by tui-diff-file-navigation ticket */ },
      when: () => ctx.focusZone === "content",
    },
    {
      key: "[",
      description: "Previous file",
      group: "Diff",
      handler: () => { /* wired by tui-diff-file-navigation ticket */ },
      when: () => ctx.focusZone === "content",
    },
    // --- Scroll (content zone, wired by downstream ticket) ---
    {
      key: "j",
      description: "Scroll down",
      group: "Navigation",
      handler: () => { /* wired by tui-diff-unified-view ticket */ },
      when: () => ctx.focusZone === "content",
    },
    {
      key: "k",
      description: "Scroll up",
      group: "Navigation",
      handler: () => { /* wired by tui-diff-unified-view ticket */ },
      when: () => ctx.focusZone === "content",
    },
    // --- View toggles ---
    {
      key: "t",
      description: ctx.viewMode === "unified" ? "Split view" : "Unified view",
      group: "Diff",
      handler: () => {
        if (ctx.breakpoint === "minimum") return; // Split unavailable at minimum
        ctx.setViewMode(ctx.viewMode === "unified" ? "split" : "unified");
      },
    },
    {
      key: "w",
      description: ctx.showWhitespace ? "Hide whitespace" : "Show whitespace",
      group: "Diff",
      handler: () => {
        ctx.setShowWhitespace(!ctx.showWhitespace);
      },
    },
    // --- Expand/collapse (wired by downstream ticket) ---
    {
      key: "x",
      description: "Expand all hunks",
      group: "Diff",
      handler: () => { /* wired by tui-diff-unified-view ticket */ },
      when: () => ctx.focusZone === "content",
    },
    {
      key: "z",
      description: "Collapse all hunks",
      group: "Diff",
      handler: () => { /* wired by tui-diff-unified-view ticket */ },
      when: () => ctx.focusZone === "content",
    },
  ];
}
```

**Key normalization:** The `useScreenKeybindings` hook normalizes all key descriptors via `normalizeKeyDescriptor()` (in `apps/tui/src/providers/normalize-key.ts`). Single-character keys like `"j"`, `"]"`, `"t"` are already normalized. `"tab"` normalizes to `"tab"` (lowercase). `"escape"` normalizes to `"escape"`. `"ctrl+b"` normalizes to `"ctrl+b"`.

**Escape key priority interaction:** The `escape` keybinding is registered at PRIORITY.SCREEN (4) with `when: () => ctx.focusZone === "tree"`. Because SCREEN (4) has higher priority (lower number) than GLOBAL (5), this binding is dispatched first when the predicate matches. When `focusZone === "content"`, the `when` predicate returns false, the binding is skipped, and dispatch falls through to GLOBAL which handles Escape via `onEscape` → `nav.pop()` (see `apps/tui/src/components/GlobalKeybindings.tsx` line 12–14).

**Ctrl+B note:** The `GlobalKeybindings` component (at `apps/tui/src/components/GlobalKeybindings.tsx`) does not currently register `ctrl+b`. It only registers `q`, `escape`, `ctrl+c`, `?`, `:`, and `g`. The DiffScreen registers `ctrl+b` at SCREEN priority to provide sidebar toggle functionality. When a global sidebar toggle ticket lands, the DiffScreen's binding can be removed or left — the global binding at GLOBAL priority (5) would be lower priority than SCREEN (4), so the DiffScreen binding would still fire first, which is fine since they do the same thing.

### 7.2 Status Bar Hints

Custom hints are passed as the second argument to `useScreenKeybindings`. The hook falls back to auto-generating hints from the first 8 bindings if no custom hints are provided, but we pass explicit hints for deterministic ordering:

```typescript
const DIFF_STATUS_HINTS: StatusBarHint[] = [
  { keys: "j/k", label: "scroll", order: 0 },
  { keys: "]/[", label: "file", order: 10 },
  { keys: "t", label: "view", order: 20 },
  { keys: "w", label: "whitespace", order: 30 },
  { keys: "Tab", label: "focus", order: 40 },
  { keys: "x/z", label: "hunks", order: 50 },
];
```

The `StatusBar` component already handles breakpoint-aware hint truncation (4 hints at minimum, 6 at standard, all at large), consuming hints via `StatusBarHintsContext`.

---

## 8. Loading & Error States

### 8.1 Loading State

Uses `useScreenLoading` from `apps/tui/src/hooks/useScreenLoading.ts`.

**Loading ID:** `diff-${mode}-${change_id || number}` — unique per diff target so multiple diff screens in the navigation stack don't collide.

**`UseScreenLoadingOptions` wiring:**
```typescript
useScreenLoading({
  id: `diff-${parsed.mode}-${parsed.change_id || parsed.number}`,
  label: `Loading ${parsed.mode === "change" ? "change" : "landing"} diff…`,
  isLoading: diffResult.isLoading,
  error: diffResult.error,
  onRetry: diffResult.refetch,
});
```

**Behavior (from the existing `useScreenLoading` implementation):**
- First 80ms (`SPINNER_SKIP_THRESHOLD_MS`): no spinner shown (data may arrive quickly). `showSkeleton` is true during this window.
- After 80ms: `showSpinner` becomes `true`, render `<FullScreenLoading>` with spinner and label.
- After 30s (`LOADING_TIMEOUT_MS`): transitions to timeout error state via LoadingProvider.
- On unmount: aborts in-flight fetch via AbortController.

**Label text:**
- Change mode: `"Loading change diff…"`
- Landing mode: `"Loading landing diff…"`

### 8.2 Error State

Renders `<FullScreenError>` (from `apps/tui/src/components/FullScreenError.tsx`) with:
- `screenLabel`: `"change diff"` or `"landing diff"` depending on mode.
- `error`: the `LoadingError` from `useScreenLoading`.

The `FullScreenError` component renders:
```
✗ Failed to load {screenLabel}
{error.summary} ({error.httpStatus})
```

The `LoadingProvider` receives the retry callback via `setRetryCallback()` inside `useScreenLoading`, which the `StatusBar` automatically picks up to show the `R:retry` hint. Pressing `R` triggers `retry()` on `useScreenLoading`, which debounces at 1 second (`RETRY_DEBOUNCE_MS`) and calls `diffResult.refetch()`.

### 8.3 Param Validation Error

For invalid params (missing mode, missing change_id, etc.), render a simple centered error. This is NOT a loading error — it's a programming error from the caller. No retry is offered.

```typescript
function DiffParamError({ message }: { message: string }) {
  const { width, contentHeight } = useLayout();
  const theme = useTheme();

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
      width="100%"
      height={contentHeight}
    >
      <text attributes={1} fg={theme.error}>✗ Invalid diff parameters</text>
      <text />
      <text fg={theme.muted}>{message}</text>
      <text />
      <text fg={theme.muted}>Press q to go back</text>
    </box>
  );
}
```

---

## 9. Placeholder Child Components

The DiffScreen shell renders two placeholder sub-components that downstream tickets will replace with real implementations. These are defined in the same screen directory to keep the shell self-contained.

### 9.1 `DiffFileTreePlaceholder`

```typescript
interface DiffFileTreePlaceholderProps {
  focused: boolean;
  files: FileDiffItem[];
}

function DiffFileTreePlaceholder({ focused, files }: DiffFileTreePlaceholderProps) {
  const theme = useTheme();
  return (
    <box flexDirection="column" padding={1}>
      <text fg={focused ? theme.primary : theme.muted} attributes={1}>
        Files ({files.length})
      </text>
      {files.slice(0, 20).map((file, i) => (
        <text key={file.path} fg={theme.muted}>
          {file.change_type === "added" ? "+" : file.change_type === "deleted" ? "-" : "~"}{" "}
          {file.path}
        </text>
      ))}
      {files.length > 20 && (
        <text fg={theme.muted}>  …and {files.length - 20} more</text>
      )}
    </box>
  );
}
```

### 9.2 `DiffContentPlaceholder`

```typescript
interface DiffContentPlaceholderProps {
  focused: boolean;
  files: FileDiffItem[];
  viewMode: "unified" | "split";
  showWhitespace: boolean;
}

function DiffContentPlaceholder({ focused, files, viewMode, showWhitespace }: DiffContentPlaceholderProps) {
  const theme = useTheme();
  return (
    <box flexDirection="column" padding={1}>
      <text fg={theme.muted}>
        Diff content ({viewMode} mode{showWhitespace ? "" : ", whitespace hidden"})
      </text>
      <text fg={theme.muted}>
        {files.length} file{files.length !== 1 ? "s" : ""} changed
      </text>
      <text />
      <text fg={theme.muted}>Diff viewer not yet implemented.</text>
    </box>
  );
}
```

These placeholders are explicitly temporary. They will be replaced by `DiffFileTree` (from `tui-diff-file-tree` ticket) and `DiffViewer` (from `tui-diff-unified-view` / `tui-diff-split-view` tickets).

---

## 10. Implementation Plan

All steps are vertical — each step produces a working, testable increment.

### Step 1: Create DiffScreen types

**File:** `apps/tui/src/screens/DiffScreen/types.ts`

Define:
- `DiffScreenParams` interface
- `FocusZone` type (`"tree" | "content"`)
- `validateDiffParams()` function
- Export all types

**Verification:** Types compile with `bun build`. The `validateDiffParams` function correctly rejects:
- Missing `mode` → `"Invalid diff mode. Expected 'change' or 'landing'."`
- `mode=change` without `change_id` → `"Missing change_id for change diff."`
- `mode=landing` without `number` → `"Missing landing number for landing diff."`
- Missing `owner` or `repo` → `"Missing repository context (owner/repo)."`

### Step 2: Create useDiffData adapter hook

**File:** `apps/tui/src/screens/DiffScreen/useDiffData.ts`

Implement the adapter hook that delegates to `useChangeDiff` or `useLandingDiff` based on mode. Returns `DiffData` normalized interface.

**Dependencies resolved:**
- `useChangeDiff` from `apps/tui/src/hooks/useChangeDiff.ts` (from `tui-diff-data-hooks` ticket)
- `useLandingDiff` from `apps/tui/src/hooks/useLandingDiff.ts` (from `tui-diff-data-hooks` ticket)
- `FileDiffItem`, `LandingChangeDiff` from `apps/tui/src/types/diff.ts` (from `tui-diff-data-hooks` ticket)

**Verification:** Hook compiles. Both code paths return conforming `DiffData` shapes. Disabled hook returns `{ isLoading: false, error: null, files: [], ... }`.

### Step 3: Create keybinding builder

**File:** `apps/tui/src/screens/DiffScreen/keybindings.ts`

Implement:
- `buildDiffKeybindings()` function returning `KeyHandler[]`
- `DIFF_STATUS_HINTS` constant array of `StatusBarHint[]`
- Import types: `KeyHandler`, `StatusBarHint` from `../../providers/keybinding-types.js`
- Import types: `FocusZone` from `./types.js`
- Import types: `Breakpoint` from `../../types/breakpoint.js`

Placeholder `handler` implementations for downstream features use no-op functions.

**Verification:** Builder returns valid `KeyHandler[]` array. All key descriptors pass `normalizeKeyDescriptor`. Key set: `tab`, `escape`, `ctrl+b`, `]`, `[`, `j`, `k`, `t`, `w`, `x`, `z`.

### Step 4: Create DiffScreen component and sub-components

**File:** `apps/tui/src/screens/DiffScreen/DiffScreen.tsx`

Implement the full component:
1. Param validation via `validateDiffParams`
2. Data fetching via `useDiffData`
3. Loading integration via `useScreenLoading` (from `../../hooks/useScreenLoading.js`)
4. Focus zone state management (`useState<FocusZone>("content")`)
5. View mode state (`useState<"unified" | "split">("unified")`)
6. Whitespace state (`useState(true)`)
7. Sidebar hide → focus reset effect
8. Layout rendering with placeholder children
9. Keybinding registration via `useScreenKeybindings`

Also create in the same file:
- `DiffParamError` sub-component
- `DiffFileTreePlaceholder` sub-component
- `DiffContentPlaceholder` sub-component

**File:** `apps/tui/src/screens/DiffScreen/index.ts`

Barrel export: `export { DiffScreen } from "./DiffScreen.js";`

**Import map for DiffScreen.tsx:**
```typescript
import { useState, useEffect } from "react";
import type { ScreenComponentProps } from "../../router/types.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useScreenLoading } from "../../hooks/useScreenLoading.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { FullScreenLoading } from "../../components/FullScreenLoading.js";
import { FullScreenError } from "../../components/FullScreenError.js";
import { useDiffData } from "./useDiffData.js";
import { validateDiffParams, type FocusZone } from "./types.js";
import { buildDiffKeybindings, DIFF_STATUS_HINTS } from "./keybindings.js";
import type { FileDiffItem } from "../../types/diff.js";
```

**Verification:** Component renders `FullScreenLoading` when data is loading. Component renders `DiffParamError` for bad params. Component renders three-zone layout after data loads.

### Step 5: Update screen registry

**File:** `apps/tui/src/router/registry.ts`

Changes:
1. Add import: `import { DiffScreen } from "../screens/DiffScreen/index.js";`
2. Replace `PlaceholderScreen` with `DiffScreen` in the `ScreenName.DiffView` entry (lines 113–118).
3. Update `breadcrumbLabel` to use the contextual breadcrumb function (§3.1).

The existing module-load validation at the bottom of `registry.ts` (lines 199–207) will catch any ScreenName entries that were accidentally removed.

**Verification:** Registry validation passes at module load. `bun build` succeeds. Navigation to `DiffView` renders the new component instead of `PlaceholderScreen`.

### Step 6: Add DiffScreen E2E tests

Append tests to `e2e/tui/diff.test.ts` (existing file, currently has syntax highlight test skeletons). Tests added under new `describe` blocks.

**Verification:** Tests run (some will fail due to unimplemented backend — this is expected and correct per project policy).

---

## 11. File Inventory

### New Files

| File Path | Purpose |
|---|---|
| `apps/tui/src/screens/DiffScreen/types.ts` | Param types, focus zone type, validation function |
| `apps/tui/src/screens/DiffScreen/useDiffData.ts` | Data hook adapter for change/landing modes |
| `apps/tui/src/screens/DiffScreen/keybindings.ts` | Keybinding builder + status bar hints |
| `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` | Main component + placeholder sub-components |
| `apps/tui/src/screens/DiffScreen/index.ts` | Barrel export |

### Modified Files

| File Path | Change |
|---|---|
| `apps/tui/src/router/registry.ts` | Import DiffScreen, update DiffView entry (component + breadcrumbLabel) |
| `e2e/tui/diff.test.ts` | Add screen scaffold tests (new describe blocks) |

---

## 12. Unit & Integration Tests

### Test File: `e2e/tui/diff.test.ts`

All tests are appended to the existing file (which already contains `TUI_DIFF_SYNTAX_HIGHLIGHT` describe blocks). Tests use `@microsoft/tui-test` via the shared `launchTUI` helper from `./helpers.ts`. Tests that depend on unimplemented backend APIs are left failing — never skipped.

The test helpers provide:
- `launchTUI(options)` — spawn real TUI with PTY, returns `TUITestInstance`
- `TERMINAL_SIZES` — `{ minimum: { width: 80, height: 24 }, standard: { width: 120, height: 40 }, large: { width: 200, height: 60 } }`
- `sendKeys()` — send key sequences with 50ms delay between keys
- `waitForText()` / `waitForNoText()` — poll terminal buffer with 10s default timeout
- `snapshot()` — capture full terminal buffer as string
- `getLine(n)` — get specific terminal line (0-indexed)
- `resize(cols, rows)` — resize PTY with 200ms settle time

### 12.1 Screen Registration Tests

```typescript
describe("TUI_DIFF_SCREEN_SCAFFOLD — screen registration", () => {
  test("SCAFFOLD-REG-001: DiffView renders DiffScreen instead of PlaceholderScreen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to a repo context first, then push DiffView
    // The PlaceholderScreen shows "This screen is not yet implemented."
    // The DiffScreen shows loading state or diff-specific content instead.
    // Assert: screen does NOT contain the PlaceholderScreen sentinel text
    // Assert: screen shows diff-specific content (loading spinner or layout)
    await terminal.terminate();
  });

  test("SCAFFOLD-REG-002: DiffView requires repo context", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Attempt to navigate to DiffView without repo context
    // The NavigationProvider validates requiresRepo and either:
    //   a) blocks the push (no navigation occurs), or
    //   b) inherits repoContext from the stack
    // Assert: either navigation is blocked or repo context is correctly inherited
    await terminal.terminate();
  });
});
```

### 12.2 Breadcrumb Tests

```typescript
describe("TUI_DIFF_SCREEN_SCAFFOLD — breadcrumbs", () => {
  test("SCAFFOLD-BC-001: change mode breadcrumb shows truncated change_id", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with mode=change, change_id=abc123def456ghij
    // Assert: header bar (line 0) contains "Δ abc123def456"
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Δ abc123def456/);
    await terminal.terminate();
  });

  test("SCAFFOLD-BC-002: landing mode breadcrumb shows landing number", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with mode=landing, number=42
    // Assert: header bar (line 0) contains "!42 diff"
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/!42 diff/);
    await terminal.terminate();
  });

  test("SCAFFOLD-BC-003: breadcrumb trail shows full path from dashboard", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate: Dashboard → repo → diff
    // Assert: breadcrumb shows "Dashboard › owner/repo › Δ ..."
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Dashboard.*›.*›.*Δ/);
    await terminal.terminate();
  });
});
```

### 12.3 Loading State Tests

```typescript
describe("TUI_DIFF_SCREEN_SCAFFOLD — loading state", () => {
  test("SCAFFOLD-LOAD-001: shows loading spinner while fetching diff data", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    // Assert: spinner character appears with "Loading change diff…" or "Loading landing diff…"
    // Note: spinner only appears after SPINNER_SKIP_THRESHOLD_MS (80ms)
    await terminal.waitForText("Loading");
    expect(terminal.snapshot()).toMatch(/Loading.*diff/);
    await terminal.terminate();
  });

  test("SCAFFOLD-LOAD-002: loading spinner is centered in content area", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen during loading
    // FullScreenLoading centers vertically in contentHeight (height - 2 = 38)
    // So spinner should be around row 20, not at top (rows 0-2)
    await terminal.waitForText("Loading");
    expect(terminal.getLine(0)).not.toMatch(/Loading.*diff/);
    expect(terminal.getLine(1)).not.toMatch(/Loading.*diff/);
    await terminal.terminate();
  });

  test("SCAFFOLD-LOAD-003: loading state at 80x24 minimum", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    // Assert: spinner visible within 80x24 constraints
    // FullScreenLoading truncates label to width - LOADING_LABEL_PADDING (6)
    await terminal.waitForText("Loading");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});
```

### 12.4 Error State Tests

```typescript
describe("TUI_DIFF_SCREEN_SCAFFOLD — error state", () => {
  test("SCAFFOLD-ERR-001: shows error on API failure", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen with invalid repo (triggers 404)
    // FullScreenError renders: "✗ Failed to load {screenLabel}"
    await terminal.waitForText("Failed to load");
    expect(terminal.snapshot()).toMatch(/✗.*Failed to load/);
    await terminal.terminate();
  });

  test("SCAFFOLD-ERR-002: R key retries after error", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen → error state
    await terminal.waitForText("Failed to load");
    // Press R to retry (LoadingProvider dispatches to useScreenLoading's retry callback)
    await terminal.sendKeys("R");
    // Assert: loading spinner reappears (retry initiated)
    await terminal.waitForText("Loading");
    await terminal.terminate();
  });

  test("SCAFFOLD-ERR-003: status bar shows R:retry hint on error", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen → error state
    await terminal.waitForText("Failed to load");
    // Check last line (status bar, line 39) for retry hint
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/R.*retry/);
    await terminal.terminate();
  });

  test("SCAFFOLD-ERR-004: invalid params show param error", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Push DiffView with missing mode param (should trigger validateDiffParams failure)
    // Assert: "Invalid diff parameters" message displayed
    // Assert: "Press q to go back" hint shown
    await terminal.waitForText("Invalid diff parameters");
    await terminal.terminate();
  });

  test("SCAFFOLD-ERR-005: q navigates back from error state", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen → error state
    await terminal.waitForText("Failed to load");
    // Press q (handled by PRIORITY.GLOBAL keybinding)
    await terminal.sendKeys("q");
    // Assert: back on previous screen
    await terminal.waitForNoText("Failed to load");
    await terminal.terminate();
  });
});
```

### 12.5 Layout Tests

```typescript
describe("TUI_DIFF_SCREEN_SCAFFOLD — layout", () => {
  test("SCAFFOLD-LAYOUT-001: sidebar visible at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen (after data loads)
    // useSidebarState: standard breakpoint → visible=true, sidebarWidth="25%"
    // Assert: file tree sidebar renders ("Files" header appears in left portion)
    await terminal.waitForText("Files");
    await terminal.terminate();
  });

  test("SCAFFOLD-LAYOUT-002: sidebar hidden at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen (after data loads)
    // useSidebarState: minimum breakpoint → visible=false, autoOverride=true
    // Assert: no file tree sidebar visible
    // DiffFileTreePlaceholder's "Files" header should NOT appear
    // Content area uses full width
    await terminal.terminate();
  });

  test("SCAFFOLD-LAYOUT-003: sidebar visible at 200x60", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff screen
    // useSidebarState: large breakpoint → visible=true, sidebarWidth="30%"
    await terminal.waitForText("Files");
    await terminal.terminate();
  });

  test("SCAFFOLD-LAYOUT-004: Ctrl+B toggles sidebar at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.waitForText("Files");
    // Press Ctrl+B (handled by DiffScreen's SCREEN-priority keybinding → sidebar.toggle())
    await terminal.sendKeys("ctrl+b");
    // useSidebarState: userPreference=false → visible=false
    await terminal.waitForNoText("Files");
    // Press Ctrl+B again to re-show
    await terminal.sendKeys("ctrl+b");
    // useSidebarState: userPreference=true → visible=true
    await terminal.waitForText("Files");
    await terminal.terminate();
  });

  test("SCAFFOLD-LAYOUT-005: resize from 120x40 to 80x24 hides sidebar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.waitForText("Files");
    // Resize to minimum breakpoint
    await terminal.resize(80, 24);
    // useSidebarState: breakpoint changes to minimum → autoOverride=true → visible=false
    await terminal.waitForNoText("Files");
    await terminal.terminate();
  });

  test("SCAFFOLD-LAYOUT-006: snapshot at 80x24 minimum", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen (after data loads)
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SCAFFOLD-LAYOUT-007: snapshot at 120x40 standard", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen (after data loads)
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SCAFFOLD-LAYOUT-008: snapshot at 200x60 large", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff screen (after data loads)
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});
```

### 12.6 Focus Zone Tests

```typescript
describe("TUI_DIFF_SCREEN_SCAFFOLD — focus zones", () => {
  test("SCAFFOLD-FOCUS-001: initial focus is on content zone", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    // Assert: sidebar border uses theme.border (not theme.primary)
    // This is the default state — no primary-colored border on sidebar
    await terminal.terminate();
  });

  test("SCAFFOLD-FOCUS-002: Tab moves focus from content to tree", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("Tab");
    // Assert: sidebar border color changes to theme.primary (visual focus indicator)
    // The DiffFileTreePlaceholder "Files" header text uses theme.primary when focused
    await terminal.terminate();
  });

  test("SCAFFOLD-FOCUS-003: Tab moves focus from tree back to content", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("Tab"); // focus tree
    await terminal.sendKeys("Tab"); // focus content
    // Assert: sidebar border returns to theme.border
    await terminal.terminate();
  });

  test("SCAFFOLD-FOCUS-004: Tab is no-op when sidebar is hidden", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen (sidebar auto-hidden at minimum breakpoint)
    await terminal.sendKeys("Tab");
    // Assert: no crash, content zone still focused
    // Assert: diff content still displayed normally
    await terminal.terminate();
  });

  test("SCAFFOLD-FOCUS-005: Ctrl+B hide resets focus to content", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("Tab"); // focus tree
    await terminal.sendKeys("ctrl+b"); // hide sidebar
    // Assert: focus is on content (sidebar gone, focus auto-reset via useEffect)
    await terminal.terminate();
  });

  test("SCAFFOLD-FOCUS-006: Escape in tree zone returns focus to content", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("Tab"); // focus tree
    await terminal.sendKeys("Escape"); // escape from tree
    // The SCREEN-priority escape binding fires (when: focusZone === "tree")
    // This does NOT pop the screen because SCREEN (4) > GLOBAL (5) in priority
    // Assert: focus is on content zone, screen is still DiffScreen
    await terminal.terminate();
  });

  test("SCAFFOLD-FOCUS-007: resize to minimum resets focus from tree to content", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Focus tree
    await terminal.sendKeys("Tab");
    // Resize to minimum (sidebar auto-hides via useSidebarState)
    await terminal.resize(80, 24);
    // Assert: focus is on content zone (auto-reset via useEffect dependency on layout.sidebarVisible)
    await terminal.terminate();
  });
});
```

### 12.7 Keybinding Tests

```typescript
describe("TUI_DIFF_SCREEN_SCAFFOLD — keybindings", () => {
  test("SCAFFOLD-KEY-001: t toggles view mode at standard breakpoint", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    // DiffContentPlaceholder initially shows "unified mode"
    await terminal.waitForText("unified");
    await terminal.sendKeys("t");
    // After toggle: "split mode"
    await terminal.waitForText("split");
    await terminal.sendKeys("t");
    // After toggle back: "unified mode"
    await terminal.waitForText("unified");
    await terminal.terminate();
  });

  test("SCAFFOLD-KEY-002: t is no-op at minimum breakpoint", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    await terminal.waitForText("unified");
    await terminal.sendKeys("t");
    // Split unavailable at minimum: handler returns early
    await terminal.waitForText("unified");
    await terminal.terminate();
  });

  test("SCAFFOLD-KEY-003: w toggles whitespace visibility", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    // DiffContentPlaceholder initially doesn't show "whitespace hidden"
    await terminal.sendKeys("w");
    // After toggle: shows "whitespace hidden"
    await terminal.waitForText("whitespace hidden");
    await terminal.sendKeys("w");
    // After toggle back: no longer shows "whitespace hidden"
    await terminal.waitForNoText("whitespace hidden");
    await terminal.terminate();
  });

  test("SCAFFOLD-KEY-004: ? shows help overlay with diff keybindings", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("?");
    // Help overlay (rendered by OverlayLayer via KeybindingProvider.getAllBindings())
    // shows diff-specific keybindings grouped by group label
    await terminal.waitForText("Diff");
    expect(terminal.snapshot()).toMatch(/Next file/);
    expect(terminal.snapshot()).toMatch(/Previous file/);
    expect(terminal.snapshot()).toMatch(/Scroll down/);
    // Dismiss help overlay
    await terminal.sendKeys("Escape");
    await terminal.terminate();
  });

  test("SCAFFOLD-KEY-005: status bar shows diff-specific hints", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    // StatusBar renders hints from StatusBarHintsContext
    // DIFF_STATUS_HINTS provides j/k, ]/[, t, w, Tab, x/z
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/j\/k/);
    expect(statusLine).toMatch(/\]\/\[/);
    await terminal.terminate();
  });

  test("SCAFFOLD-KEY-006: q navigates back from diff screen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    // Press q (handled at PRIORITY.GLOBAL by useGlobalKeybindings → nav.pop())
    await terminal.sendKeys("q");
    // Assert: back on previous screen (not on diff screen)
    await terminal.terminate();
  });
});
```

### 12.8 View Mode State Tests

```typescript
describe("TUI_DIFF_SCREEN_SCAFFOLD — view mode state", () => {
  test("SCAFFOLD-VIEW-001: initial view mode is unified", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    // DiffContentPlaceholder renders viewMode in its output text
    await terminal.waitForText("unified");
    await terminal.terminate();
  });

  test("SCAFFOLD-VIEW-002: view mode persists across focus zone changes", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen, toggle to split
    await terminal.sendKeys("t");
    await terminal.waitForText("split");
    // Switch focus to tree and back
    await terminal.sendKeys("Tab");
    await terminal.sendKeys("Tab");
    // Assert: still split mode (state is owned by DiffScreen, not by child)
    await terminal.waitForText("split");
    await terminal.terminate();
  });
});
```

---

## 13. Productionization Notes

### 13.1 Placeholder Component Graduation

The `DiffFileTreePlaceholder` and `DiffContentPlaceholder` are explicitly temporary. They MUST be replaced by downstream tickets:

| Placeholder | Replaced By | Ticket |
|---|---|---|
| `DiffFileTreePlaceholder` | `DiffFileTree` | `tui-diff-file-tree` |
| `DiffContentPlaceholder` | `DiffUnifiedView` / `DiffSplitView` | `tui-diff-unified-view`, `tui-diff-split-view` |

When replacing:
1. The replacement component must accept the same prop interface (`focused`, `files`, etc.) — extend, don't break.
2. The `DiffScreen` import changes from the local placeholder to the new component path.
3. Placeholder files are deleted once replacements ship.

### 13.2 Keybinding Handler Wiring

Several keybinding handlers are no-op in this shell (`]`, `[`, `j`, `k`, `x`, `z`). Downstream tickets wire real handlers by:

1. The `buildDiffKeybindings` function accepts a context object. Downstream components extend this context with their scroll/navigation callbacks.
2. Alternatively, downstream components register additional keybinding scopes at a lower priority than SCREEN (though the preferred approach is to extend the context).

The recommended approach: the `DiffScreen` component passes mutable refs for scroll position, focused file index, and hunk expand/collapse state. The keybinding handlers close over these refs. When downstream components mount, they populate the refs with their state.

```typescript
// Example graduation pattern:
const scrollRef = useRef({ scrollDown: () => {}, scrollUp: () => {} });

// In buildDiffKeybindings:
{ key: "j", handler: () => scrollRef.current.scrollDown(), ... }

// In DiffContentView (downstream):
useEffect(() => {
  scrollRef.current = {
    scrollDown: () => setOffset(o => o + 1),
    scrollUp: () => setOffset(o => o - 1),
  };
}, []);
```

### 13.3 `useDiffData` Cache Integration

The `useDiffData` hook currently delegates directly to `useChangeDiff` / `useLandingDiff`. These hooks already integrate with the diff cache layer (defined in `tui-diff-data-hooks`). No additional caching is needed in the screen shell.

When the `showWhitespace` toggle changes, the DiffScreen should re-fetch with the new `ignore_whitespace` option. This is handled by passing `{ ignore_whitespace: !showWhitespace }` to the data hooks:

```typescript
const changeResult = useChangeDiff(
  params.owner,
  params.repo,
  params.change_id ?? "",
  { enabled: params.mode === "change", ignore_whitespace: !showWhitespace },
);
```

This is deferred to the `tui-diff-data-hooks` ticket which defines the `DiffFetchOptions.ignore_whitespace` parameter.

### 13.4 Focus Zone Expansion

The current focus zone model has two states: `tree` and `content`. Future tickets may add a third zone for inline comment input. When this happens:

1. Extend `FocusZone` type: `"tree" | "content" | "comment"`
2. Update the Tab cycle: `content → tree → content` becomes `content → tree → comment → content`
3. The comment zone is only reachable when a comment input is active.

### 13.5 Test Failures Due to Unimplemented Backend

Per project policy, tests that fail because the diff API endpoints are not yet implemented in the local test server are left failing. They are NOT skipped, NOT commented out, and NOT mocked. The test output clearly shows which tests fail due to missing backend vs. actual bugs.

Specifically, tests in `SCAFFOLD-LOAD-001`, `SCAFFOLD-ERR-001`, and all layout tests that depend on data rendering will fail until:
- The `GET /api/repos/:owner/:repo/changes/:change_id/diff` endpoint is implemented.
- The `GET /api/repos/:owner/:repo/landings/:number/diff` endpoint is implemented.
- The diff data hooks (`tui-diff-data-hooks`) are implemented.

### 13.6 Escape Key Interaction with Focus Zones

The `Escape` key at PRIORITY.GLOBAL has existing behavior: in `GlobalKeybindings.tsx`, `onEscape` calls `nav.pop()` if `nav.canGoBack`. To allow Escape to return focus from tree → content without popping the screen, the DiffScreen registers an `escape` keybinding at PRIORITY.SCREEN (= 4) that only activates when `focusZone === "tree"`:

```typescript
{
  key: "escape",
  description: "Return to content",
  group: "Navigation",
  handler: () => ctx.setFocusZone("content"),
  when: () => ctx.focusZone === "tree",
}
```

Because SCREEN (4) has higher priority (lower number) than GLOBAL (5), this binding will be dispatched first when the predicate matches. When `focusZone === "content"`, the `when` predicate returns false, the binding is skipped, and dispatch falls through to GLOBAL which handles Escape via `onEscape` → `nav.pop()` (line 12–14 of `GlobalKeybindings.tsx`).

---

## 14. Acceptance Criteria

1. `ScreenName.DiffView` in the registry maps to `DiffScreen`, not `PlaceholderScreen`.
2. Navigating to `DiffView` with valid params renders the three-zone layout (sidebar + content) at standard/large breakpoints.
3. Navigating to `DiffView` at minimum breakpoint renders content only (no sidebar).
4. Invalid params render a clear error message with "Press q to go back".
5. Loading state shows a centered spinner with the correct label (after 80ms skip threshold).
6. Error state shows `FullScreenError` and the status bar shows `R:retry`.
7. `Tab` toggles focus between tree and content zones (when sidebar is visible).
8. `Tab` is a no-op when sidebar is hidden.
9. `Ctrl+B` hides sidebar and resets focus to content if focus was on tree.
10. `t` toggles view mode between unified and split (no-op at minimum breakpoint).
11. `w` toggles whitespace visibility flag.
12. `?` help overlay lists all diff keybindings grouped under "Diff" and "Navigation".
13. Status bar shows diff-specific hints: `j/k`, `]/[`, `t`, `w`, `Tab`, `x/z`.
14. Breadcrumb shows `Δ {change_id}` (truncated to 12 chars) for change mode and `!{number} diff` for landing mode.
15. All E2E tests are added to `e2e/tui/diff.test.ts` and run (failing tests from missing backend are expected).
16. No new npm dependencies introduced.
17. Module-load validation in `registry.ts` still passes (all ScreenName values have entries).
18. `Escape` in tree zone returns focus to content without popping the screen.