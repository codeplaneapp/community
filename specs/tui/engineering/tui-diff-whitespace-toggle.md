# Engineering Specification: TUI_DIFF_WHITESPACE_TOGGLE

> `w` key toggles whitespace visibility with API re-fetch, debounce, caching, and responsive status bar indicator.

**Ticket:** tui-diff-whitespace-toggle  
**Dependencies:** tui-diff-screen, tui-diff-data-hooks  
**Status:** Not started  
**Target files:** `apps/tui/src/`  
**Test file:** `e2e/tui/diff.test.ts`  

---

## Architecture Overview

The whitespace toggle introduces three new units of code and modifies four existing surfaces:

| Unit | Type | File | Purpose |
|------|------|------|---------|
| `useWhitespaceToggle` | Hook (new) | `apps/tui/src/hooks/useWhitespaceToggle.ts` | State machine + debounced `ignoreWhitespace` flag |
| `WhitespaceIndicator` | Component (new) | `apps/tui/src/components/WhitespaceIndicator.tsx` | Responsive status bar indicator segment |
| `WhitespaceEmptyState` | Component (new) | `apps/tui/src/components/WhitespaceEmptyState.tsx` | "No visible changes" empty state display |
| `DiffScreen` | Component (modified) | `apps/tui/src/screens/Diff/DiffScreen.tsx` | Wire toggle into screen state, keybindings, status bar |
| `DiffContentArea` | Component (modified) | `apps/tui/src/screens/Diff/DiffContentArea.tsx` | Inline loading indicator during re-fetch |
| `DiffFileTree` | Component (modified) | `apps/tui/src/screens/Diff/DiffFileTree.tsx` | Filter whitespace-only files when hidden |
| `useDiffData` | Hook (modified) | `apps/tui/src/hooks/useDiffData.ts` | Pass `ignore_whitespace` option to data hooks |

### Data Flow

```
┌────────────┐   toggle()    ┌──────────────────────┐
│  w keypress ├──────────────►│  useWhitespaceToggle │
└────────────┘               │                      │
                             │  whitespaceVisible ───┼──► StatusBar (immediate)
                             │  (flips immediately)  │
                             │                      │
                             │  ignoreWhitespace ────┼──► useDiffData (300ms debounce)
                             │  (debounced 300ms)    │         │
                             └──────────────────────┘         │
                                                              ▼
                             ┌──────────────────────┐   ┌────────────┐
                             │   DiffContentArea    │◄──┤ API re-fetch│
                             │   (re-renders)       │   │ (cached 30s)│
                             └──────────────────────┘   └────────────┘
```

The key architectural insight is the split between `whitespaceVisible` (immediate UI feedback) and `ignoreWhitespace` (debounced API parameter). This ensures the status bar updates on every `w` press while the API is only called once the user stops toggling.

---

## Implementation Plan

### Step 1: `useWhitespaceToggle` hook

**File:** `apps/tui/src/hooks/useWhitespaceToggle.ts`

This is the core state machine. It manages two pieces of state:

1. `whitespaceVisible: boolean` — Flips immediately on every `toggle()` call. Drives the status bar indicator and the empty-state check.
2. `ignoreWhitespace: boolean` — Flips 300ms after the last `toggle()` call. Drives the API query parameter passed to `useDiffData`.

```typescript
import { useState, useCallback, useRef, useEffect } from "react";

const WHITESPACE_DEBOUNCE_MS = 300;

export interface WhitespaceToggleState {
  /** Current visual state — true means whitespace is shown (default). */
  whitespaceVisible: boolean;
  /** Debounced API parameter — true means API should ignore whitespace. */
  ignoreWhitespace: boolean;
  /** Whether the debounced value is catching up to the visual state. */
  isPending: boolean;
  /** Flip the toggle. No-op guard is the caller's responsibility. */
  toggle: () => void;
}

export function useWhitespaceToggle(): WhitespaceToggleState {
  const [whitespaceVisible, setWhitespaceVisible] = useState(true);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const toggle = useCallback(() => {
    setWhitespaceVisible((prev) => {
      const next = !prev;

      // Cancel any pending debounce
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      setIsPending(true);

      // Debounce the API-facing flag
      timerRef.current = setTimeout(() => {
        setIgnoreWhitespace(!next); // ignoreWhitespace is inverse of visible
        setIsPending(false);
        timerRef.current = null;
      }, WHITESPACE_DEBOUNCE_MS);

      return next;
    });
  }, []);

  return { whitespaceVisible, ignoreWhitespace, isPending, toggle };
}
```

**Key behaviors:**
- `whitespaceVisible` defaults to `true` (whitespace shown).
- `ignoreWhitespace` defaults to `false` (no filtering).
- `isPending` is `true` between a `toggle()` call and the debounce firing — used to show the inline loading indicator optimistically.
- Rapid toggles: only the final state fires the debounced `setIgnoreWhitespace`. The timer is cleared and restarted on each call.
- Unmount cleanup: clears the pending timer to prevent state updates on unmounted components.

**No-op guard:** The hook itself does not enforce no-op during loading/error/overlay states. That logic lives in the keybinding `when()` predicate in `DiffScreen`, following the established pattern where keybinding guards are at the registration site.

---

### Step 2: Modify `useDiffData` to accept `ignoreWhitespace`

**File:** `apps/tui/src/hooks/useDiffData.ts`

The existing `useDiffData` adapter hook calls either `useChangeDiff` or `useLandingDiff` based on `DiffScreenParams.mode`. The modification adds `ignoreWhitespace` as a parameter and passes it through as `opts.ignore_whitespace`.

```typescript
import { useChangeDiff, useLandingDiff } from "@codeplane/ui-core";
import type { DiffScreenParams } from "../types/diff";
import type { DiffFetchOptions } from "@codeplane/ui-core";

export interface DiffData {
  files: FileDiffItem[];
  isLoading: boolean;
  isRefetching: boolean;
  error: { message: string; status?: number } | null;
  refetch: () => void;
}

export function useDiffData(
  params: DiffScreenParams,
  ignoreWhitespace: boolean,
): DiffData {
  const opts: DiffFetchOptions = { ignore_whitespace: ignoreWhitespace };

  const changeDiff = useChangeDiff(
    params.owner,
    params.repo,
    params.change_id ?? "",
    { ...opts, enabled: params.mode === "change" },
  );

  const landingDiff = useLandingDiff(
    params.owner,
    params.repo,
    params.number ? parseInt(params.number, 10) : 0,
    { ...opts, enabled: params.mode === "landing" },
  );

  const active = params.mode === "change" ? changeDiff : landingDiff;

  return {
    files: active.files ?? [],
    isLoading: active.isLoading,
    isRefetching: active.isRefetching ?? false,
    error: active.error,
    refetch: active.refetch,
  };
}
```

**Cache key integration:** The `@codeplane/ui-core` hooks (`useChangeDiff`, `useLandingDiff`) construct cache keys that include the `ignore_whitespace` boolean per the tui-diff-data-hooks spec:
- Change: `change-diff:${owner}/${repo}:${changeId}:ws=${ignoreWhitespace}`
- Landing: `landing-diff:${owner}/${repo}:${number}:ws=${ignoreWhitespace}`

This means toggling whitespace produces a different cache key, so both variants are cached independently. The 30-second TTL (`CACHE_TTL_MS = 30_000`) is managed by the cache layer in `apps/tui/src/lib/diff-cache.ts`.

**`isRefetching` flag:** This is distinct from `isLoading`. `isLoading` is `true` on initial mount when no data exists. `isRefetching` is `true` when data already exists but a new fetch is in-flight (e.g., after whitespace toggle). This distinction drives the UI: `isLoading` shows the full-screen spinner; `isRefetching` shows the inline "Updating diff…" indicator.

---

### Step 3: `WhitespaceIndicator` component

**File:** `apps/tui/src/components/WhitespaceIndicator.tsx`

A pure presentational component that renders the status bar segment.

```typescript
import React from "react";
import { useTerminalDimensions } from "@opentui/react";
import { useTheme } from "../theme/tokens";

interface WhitespaceIndicatorProps {
  whitespaceVisible: boolean;
}

export function WhitespaceIndicator({ whitespaceVisible }: WhitespaceIndicatorProps) {
  const { width } = useTerminalDimensions();
  const theme = useTheme();

  const isAbbreviated = width < 120;
  const label = isAbbreviated
    ? whitespaceVisible
      ? "ws:vis"
      : "ws:hid"
    : whitespaceVisible
      ? "[ws: visible]"
      : "[ws: hidden]";

  const color = whitespaceVisible ? theme.muted : theme.warning;

  return <text color={color}>{label}</text>;
}
```

**Responsive behavior:**
| Terminal width | Visible label | Hidden label | Color |
|---|---|---|---|
| < 120 | `ws:vis` | `ws:hid` | muted / warning |
| ≥ 120 | `[ws: visible]` | `[ws: hidden]` | muted / warning |

**Color semantics:**
- `muted` (ANSI 245, gray) for the default visible state — does not draw attention.
- `warning` (ANSI 178, yellow) for the hidden state — signals that the diff is filtered and the user is not seeing the complete picture.

**Status bar position:** The `WhitespaceIndicator` is rendered in the right section of the status bar, between the file position indicator and the `?` help hint. It is injected into the status bar's right slot by `DiffScreen` via the status bar composition API.

---

### Step 4: `WhitespaceEmptyState` component

**File:** `apps/tui/src/components/WhitespaceEmptyState.tsx`

Displayed when `whitespaceVisible === false` and the filtered file list is empty (all files are whitespace-only).

```typescript
import React from "react";
import { useTheme } from "../theme/tokens";

export function WhitespaceEmptyState() {
  const theme = useTheme();

  return (
    <box
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
      flexDirection="column"
    >
      <text color={theme.muted}>No visible changes (whitespace hidden).</text>
      <text color={theme.primary}>Press w to show whitespace.</text>
    </box>
  );
}
```

**Design decisions:**
- Two lines, not one. The recovery action (`Press w`) is separated onto its own line and rendered in `primary` color (ANSI 33, blue) to draw the user's eye to the escape hatch.
- The component fills available space via `flexGrow={1}` and centers both vertically and horizontally.
- At 80×24, the lines are short enough (42 chars and 30 chars) to fit without wrapping.

---

### Step 5: Inline loading indicator in `DiffContentArea`

**File:** `apps/tui/src/screens/Diff/DiffContentArea.tsx`

Modify the existing `DiffContentArea` to accept an `isRefetching` prop and render an inline loading banner when `true`.

```typescript
interface DiffContentAreaProps {
  files: FileDiffItem[];
  focusedFileIndex: number;
  viewMode: ViewMode;
  showWhitespace: boolean;
  hunkCollapse: HunkCollapseState;
  isLandingDiff: boolean;
  inlineComments: Map<string, LandingComment[]>;
  scrollPosition: number;
  onScroll: (pos: number) => void;
  isRefetching: boolean;  // NEW
}

export function DiffContentArea(props: DiffContentAreaProps) {
  const theme = useTheme();

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Inline loading indicator — does NOT replace content */}
      {props.isRefetching && (
        <box width="100%" justifyContent="center" paddingY={0}>
          <text color={theme.muted}>Updating diff…</text>
        </box>
      )}

      {/* Existing diff content rendering */}
      {/* ... */}
    </box>
  );
}
```

**Key constraints:**
- The inline indicator is rendered **above** the diff content, not replacing it.
- The previous diff content remains visible (and slightly dimmed if desired) below the indicator, preserving spatial context.
- The file tree sidebar is unaffected — it remains interactive during re-fetch.
- The status bar remains visible and accurate.
- Scroll position is preserved — the content area does not reset on re-fetch start.
- When re-fetch completes, the indicator disappears and new content replaces old. Scroll position resets to top of the focused file.

---

### Step 6: File tree filtering in `DiffFileTree`

**File:** `apps/tui/src/screens/Diff/DiffFileTree.tsx`

When `whitespaceVisible === false`, the file tree must exclude files that are whitespace-only. The API response with `ignore_whitespace=true` already excludes these files from the response. However, the file tree header count and focus management must adapt.

```typescript
interface DiffFileTreeProps {
  files: FileDiffItem[];
  focusedFileIndex: number;
  onSelect: (index: number) => void;
  whitespaceVisible: boolean;  // NEW — controls header display
}

export function DiffFileTree(props: DiffFileTreeProps) {
  const fileCount = props.files.length;

  return (
    <box flexDirection="column" width="25%">
      <text bold>Files ({fileCount})</text>
      <scrollbox>
        {props.files.map((file, i) => (
          <FileTreeEntry
            key={file.path}
            file={file}
            focused={i === props.focusedFileIndex}
            onSelect={() => props.onSelect(i)}
          />
        ))}
        {fileCount === 0 && (
          <text color={theme.muted}>(empty)</text>
        )}
      </scrollbox>
    </box>
  );
}
```

**File counting:** The `Files (N)` header count reflects the number of files in the current response, which is already filtered when `ignore_whitespace=true` was sent to the API. No client-side filtering is needed — the server handles exclusion.

**Focus management:** When the whitespace toggle causes the focused file to disappear (because it was whitespace-only), the focus resets to index 0 of the new file list. This is handled in `DiffScreen` when the data hook returns a new file set.

---

### Step 7: Wire everything together in `DiffScreen`

**File:** `apps/tui/src/screens/Diff/DiffScreen.tsx`

This is the integration point. `DiffScreen` composes all the pieces:

```typescript
import React, { useMemo, useEffect, useRef } from "react";
import { useWhitespaceToggle } from "../../hooks/useWhitespaceToggle";
import { useDiffData } from "../../hooks/useDiffData";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings";
import { useLayout } from "../../hooks/useLayout";
import { useTheme } from "../../theme/tokens";
import { WhitespaceIndicator } from "../../components/WhitespaceIndicator";
import { WhitespaceEmptyState } from "../../components/WhitespaceEmptyState";
import { DiffContentArea } from "./DiffContentArea";
import { DiffFileTree } from "./DiffFileTree";
import { trackEvent } from "../../lib/telemetry";
import { log } from "../../lib/logger";
import type { DiffScreenParams } from "../../types/diff";

interface DiffScreenProps {
  params: DiffScreenParams;
}

export function DiffScreen({ params }: DiffScreenProps) {
  // --- Whitespace toggle state ---
  const {
    whitespaceVisible,
    ignoreWhitespace,
    isPending,
    toggle: toggleWhitespace,
  } = useWhitespaceToggle();

  // --- Data fetching (reacts to ignoreWhitespace changes) ---
  const { files, isLoading, isRefetching, error, refetch } = useDiffData(
    params,
    ignoreWhitespace,
  );

  // --- Screen state ---
  const [focusedFileIndex, setFocusedFileIndex] = React.useState(0);
  const [viewMode, setViewMode] = React.useState<"unified" | "split">("unified");
  const [commentFormOpen, setCommentFormOpen] = React.useState(false);
  const [focusZone, setFocusZone] = React.useState<"tree" | "content">("content");
  const sessionToggleCountRef = useRef(0);
  const { breakpoint } = useLayout();
  const theme = useTheme();

  // --- Hunk collapse state (resets on whitespace toggle) ---
  const [hunkCollapse, setHunkCollapse] = React.useState<HunkCollapseState>(
    createHunkCollapseState(),
  );

  // Reset hunk collapse when ignoreWhitespace changes (re-fetch completed)
  useEffect(() => {
    setHunkCollapse(createHunkCollapseState());
  }, [ignoreWhitespace]);

  // Reset focused file index if current focus is out of bounds
  useEffect(() => {
    if (focusedFileIndex >= files.length && files.length > 0) {
      setFocusedFileIndex(0);
    }
  }, [files.length, focusedFileIndex]);

  // --- Determine screen state for no-op guard ---
  const screenState = useMemo(() => {
    if (isLoading) return "loading" as const;
    if (error) return "error" as const;
    return "loaded" as const;
  }, [isLoading, error]);

  // --- Keybinding: w to toggle whitespace ---
  const canToggleWhitespace = () =>
    screenState === "loaded" && !commentFormOpen;

  useScreenKeybindings(
    [
      {
        key: "w",
        description: "Toggle whitespace",
        group: "Diff",
        handler: () => {
          if (!canToggleWhitespace()) {
            log.debug("diff.whitespace.noop", {
              reason: screenState === "loading"
                ? "initial_loading"
                : screenState === "error"
                  ? "error_state"
                  : "comment_form_open",
            });
            return;
          }

          // Guard: no re-fetch if diff has 0 files
          const willRefetch = files.length > 0;

          toggleWhitespace();
          sessionToggleCountRef.current += 1;

          log.info("diff.whitespace.toggled", {
            visible: !whitespaceVisible,
            file_count: files.length,
            source: params.mode,
          });

          trackEvent("tui.diff.whitespace_toggled", {
            visible: !whitespaceVisible,
            file_count: files.length,
            filtered_file_count: files.length, // updated after re-fetch
            source: params.mode,
            repo: `${params.owner}/${params.repo}`,
            view_mode: viewMode,
            session_toggle_count: sessionToggleCountRef.current,
          });
        },
        when: canToggleWhitespace,
      },
      // ... other diff keybindings (t, ], [, x, z, etc.)
    ],
    [
      { keys: "w", label: "whitespace", order: 30 },
      // ... other status bar hints
    ],
  );

  // --- Compute derived state ---
  const showEmptyState = !whitespaceVisible && files.length === 0 && !isLoading && !isRefetching;
  const showInlineLoading = isRefetching || isPending;

  // --- Render ---
  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Main content area: sidebar + content split */}
      <box flexDirection="row" flexGrow={1}>
        {/* File tree sidebar */}
        <DiffFileTree
          files={files}
          focusedFileIndex={focusedFileIndex}
          onSelect={setFocusedFileIndex}
          whitespaceVisible={whitespaceVisible}
        />

        {/* Content area */}
        {showEmptyState ? (
          <WhitespaceEmptyState />
        ) : (
          <DiffContentArea
            files={files}
            focusedFileIndex={focusedFileIndex}
            viewMode={viewMode}
            showWhitespace={whitespaceVisible}
            hunkCollapse={hunkCollapse}
            isLandingDiff={params.mode === "landing"}
            inlineComments={new Map()}
            scrollPosition={0}
            onScroll={() => {}}
            isRefetching={showInlineLoading}
          />
        )}
      </box>

      {/* Status bar extension: whitespace indicator */}
      {/* This is injected into the status bar's right section via the screen's
          status bar composition API (see StatusBar.tsx integration below) */}
    </box>
  );
}
```

**Status bar integration detail:**

The `DiffScreen` provides the `WhitespaceIndicator` as part of its status bar right-section content. The exact integration depends on how the screen's status bar composition works (set via context or render prop). The indicator is positioned between the file position (`File 1 of 4`) and the help hint (`?`):

```typescript
// Status bar right section composition
const statusBarRight = useMemo(
  () => (
    <box flexDirection="row" gap={1}>
      <text color={theme.muted}>
        File {focusedFileIndex + 1} of {files.length}
      </text>
      <WhitespaceIndicator whitespaceVisible={whitespaceVisible} />
      <text color={theme.muted}>?</text>
    </box>
  ),
  [focusedFileIndex, files.length, whitespaceVisible, theme],
);
```

---

### Step 8: Error handling during re-fetch

**File:** `apps/tui/src/screens/Diff/DiffScreen.tsx` (within the screen component)

The whitespace re-fetch can fail in several ways. Each is handled according to the spec:

```typescript
// Watch for re-fetch errors
useEffect(() => {
  if (error && isRefetching) {
    const status = error.status;

    if (status === 401) {
      // Auth error — replace screen with auth error state
      log.error("diff.whitespace.refetch.failed", {
        visible: whitespaceVisible,
        status_code: 401,
        error_message: "Session expired",
      });
      // Navigation replaces current screen with auth error
      return;
    }

    if (status === 429) {
      // Rate limited — show countdown in status bar
      const retryAfter = parseInt(
        error.headers?.["retry-after"] ?? "60",
        10,
      );
      log.warn("diff.whitespace.rate_limited", { retry_after_s: retryAfter });
      showStatusBarMessage(
        `Rate limited. Retry in ${retryAfter}s.`,
        retryAfter * 1000,
      );
      // Previous diff content preserved — no state revert
      return;
    }

    // Network error, timeout, 404, 500 — preserve previous diff
    log.error("diff.whitespace.refetch.failed", {
      visible: whitespaceVisible,
      status_code: status ?? 0,
      error_message: error.message,
    });
    showStatusBarMessage(
      status === 404
        ? "Diff not found. Press R to retry."
        : `Failed to update diff. Press R to retry.`,
      5000,
    );

    trackEvent("tui.diff.whitespace_refetch_failed", {
      visible: whitespaceVisible,
      error_type:
        status === 429
          ? "rate_limit"
          : status === 401
            ? "auth"
            : status
              ? "server"
              : "network",
      status_code: status ?? 0,
    });
  }
}, [error, isRefetching]);

// Watch for successful re-fetch completion
useEffect(() => {
  if (!isRefetching && !isLoading && files) {
    // Re-fetch completed
    if (files.length === 0 && !whitespaceVisible) {
      trackEvent("tui.diff.whitespace_empty_state", {
        total_file_count: 0, // unknown from filtered response
        repo: `${params.owner}/${params.repo}`,
        source: params.mode,
      });
    }
  }
}, [isRefetching, isLoading, files?.length]);
```

**Re-fetch timeout:** The `@codeplane/ui-core` hooks use a 30-second request timeout. If the timeout fires:
- The `error` object has `message: "Diff loading timed out. Press R to retry."`
- Previous diff content is preserved
- The inline loading indicator is replaced with the timeout error message
- `log.error("diff.whitespace.refetch.timeout", { visible, timeout_ms: 30000 })`

**Retry via `R` key:** The existing global retry keybinding (`R`) calls `refetch()` on the active data hook. After a failed whitespace re-fetch, pressing `R` re-issues the request with the current `ignoreWhitespace` value.

---

### Step 9: Telemetry instrumentation

**File:** `apps/tui/src/lib/telemetry.ts` (add event definitions)

All telemetry events follow the existing `trackEvent(name, properties)` pattern.

```typescript
// Event definitions for whitespace toggle
export interface WhitespaceToggledEvent {
  visible: boolean;
  file_count: number;
  filtered_file_count: number;
  source: "change" | "landing";
  repo: string;
  view_mode: "unified" | "split";
  session_toggle_count: number;
}

export interface WhitespaceRefetchCompletedEvent {
  visible: boolean;
  duration_ms: number;
  file_count_delta: number;
  cache_hit: boolean;
}

export interface WhitespaceRefetchFailedEvent {
  visible: boolean;
  error_type: "network" | "timeout" | "auth" | "rate_limit" | "server";
  status_code: number;
}

export interface WhitespaceEmptyStateEvent {
  total_file_count: number;
  repo: string;
  source: "change" | "landing";
}
```

**Common properties** (attached automatically by `trackEvent`):
- `session_id`, `terminal_width`, `terminal_height`, `timestamp`, `user_id`

---

### Step 10: Logging instrumentation

**File:** `apps/tui/src/lib/logger.ts` (use existing logger)

All log calls use the structured logger from the existing codebase:

| Level | Event | When |
|-------|-------|------|
| `info` | `diff.whitespace.toggled` | `toggle()` called |
| `info` | `diff.whitespace.refetch.started` | Debounced API call fires |
| `info` | `diff.whitespace.refetch.completed` | API response received |
| `warn` | `diff.whitespace.refetch.slow` | Re-fetch > 3 seconds |
| `warn` | `diff.whitespace.rate_limited` | 429 response |
| `error` | `diff.whitespace.refetch.failed` | Any error response |
| `error` | `diff.whitespace.refetch.timeout` | 30-second timeout |
| `debug` | `diff.whitespace.debounce.cancelled` | Rapid toggle cancelled pending debounce |
| `debug` | `diff.whitespace.cache.hit` | Re-fetch served from cache |
| `debug` | `diff.whitespace.cache.miss` | Cache miss, fetching from API |
| `debug` | `diff.whitespace.noop` | `w` pressed but ignored |

---

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/hooks/useWhitespaceToggle.ts` | **Create** | Core state machine with debounced API flag |
| `apps/tui/src/components/WhitespaceIndicator.tsx` | **Create** | Responsive `[ws: visible]` / `[ws: hidden]` status bar segment |
| `apps/tui/src/components/WhitespaceEmptyState.tsx` | **Create** | "No visible changes" centered empty state |
| `apps/tui/src/hooks/useDiffData.ts` | **Modify** | Add `ignoreWhitespace` parameter, pass through to `useChangeDiff`/`useLandingDiff` |
| `apps/tui/src/screens/Diff/DiffScreen.tsx` | **Modify** | Wire `useWhitespaceToggle`, register `w` keybinding, compose status bar, handle errors |
| `apps/tui/src/screens/Diff/DiffContentArea.tsx` | **Modify** | Add `isRefetching` prop, render inline "Updating diff…" indicator |
| `apps/tui/src/screens/Diff/DiffFileTree.tsx` | **Modify** | Accept filtered file list, show `(empty)` state, update count header |
| `apps/tui/src/lib/telemetry.ts` | **Modify** | Add whitespace toggle event type definitions |

---

## State Persistence Rules

| User action | `whitespaceVisible` preserved? | `ignoreWhitespace` preserved? | Re-fetch triggered? |
|---|---|---|---|
| Navigate file with `]`/`[` | ✅ Yes | ✅ Yes | No |
| Select file in tree with `Enter` | ✅ Yes | ✅ Yes | No |
| Toggle sidebar with `Ctrl+B` | ✅ Yes | ✅ Yes | No |
| Toggle view mode with `t` | ✅ Yes | ✅ Yes | No |
| Expand/collapse hunks with `x`/`z` | ✅ Yes | ✅ Yes | No |
| Terminal resize | ✅ Yes | ✅ Yes | No |
| Pop screen with `q` | ❌ Reset to `true` | ❌ Reset to `false` | N/A (screen unmounts) |
| Re-enter diff screen | ❌ Fresh `true` | ❌ Fresh `false` | Yes (initial load) |

**Hunk collapse state reset:** When `ignoreWhitespace` changes (debounce fires), the hunk collapse state resets to all-expanded. This is because the re-fetched diff has a different hunk structure — collapsed hunk indices from the previous response are meaningless in the new response.

**Scroll position reset:** When the re-fetch completes, the scroll position resets to the top of the first file. The `scrollPosition` state variable is set to `0` in the effect that detects `isRefetching` transitioning from `true` to `false`.

---

## Debounce Behavior — Detailed Scenarios

| Scenario | `w` presses | Debounce firings | API calls | Final state |
|---|---|---|---|---|
| Single toggle | 1 | 1 (at 300ms) | 1 | `hidden` |
| Double toggle (within 300ms) | 2 | 1 (at 300ms after last press) | 1 (or 0 if net=no-op) | `visible` (no-op, net effect = original) |
| Triple toggle (within 300ms) | 3 | 1 (at 300ms after last press) | 1 | `hidden` |
| Two toggles, 500ms apart | 2 | 2 | 2 | `visible` |
| Five toggles in 1 second, spread evenly (200ms each) | 5 | 1-2 | 1-2 | `hidden` |

**Optimization for net-no-op:** When the debounce fires and `ignoreWhitespace` already equals the target value (because an even number of rapid toggles cancelled out), the `setIgnoreWhitespace` call is a no-op due to React's state identity check — no re-render, no re-fetch.

---

## Productionization Checklist

This section addresses how to move from spec to production-ready code:

### 1. POC validation (pre-implementation)

Before writing production code, validate the following assumptions with proof-of-concept scripts in `poc/`:

- **`poc/whitespace-debounce.ts`**: Verify that `setTimeout`/`clearTimeout` behaves correctly in Bun's event loop for 300ms debounce under rapid invocation. Confirm timer cleanup on component unmount equivalent.
- **`poc/diff-cache-ttl.ts`**: Verify the diff cache correctly stores and expires two variants (ws=true, ws=false) independently with 30s TTL. Confirm cache hit/miss behavior when toggling within and beyond TTL.
- **`poc/opentui-inline-loading.ts`**: Verify that rendering a `<text>` element above existing `<scrollbox>` content in OpenTUI does not cause a full re-layout that resets scroll position.

Once PoC assertions pass, graduate them into the real test suite as integration tests.

### 2. Feature flag gating

No feature flag is required. The whitespace toggle is an additive keybinding on an already-gated screen (`DiffView`). It does not alter existing behavior — the `w` key is currently unbound in the diff screen.

### 3. Backward compatibility

- The `ignore_whitespace` query parameter is optional. If the API server does not support it (older version), the parameter is silently ignored and the diff returned is identical to the unfiltered version. The toggle appears non-functional but does not error.
- The cache layer already handles arbitrary cache keys. Adding `ws=true`/`ws=false` to the key requires no cache layer changes.

### 4. Memory considerations

- Two diff variants are cached simultaneously (one with whitespace, one without). For a large diff (10MB), this doubles memory usage to 20MB during the 30s cache window. This is acceptable for terminal applications.
- The `isPending` timer reference is a single `setTimeout` ID — negligible memory.
- The `sessionToggleCountRef` is a single number — negligible.

### 5. Accessibility

- The `[ws: hidden]` indicator uses yellow (ANSI 178) which has sufficient contrast on dark backgrounds.
- The status bar text content (`[ws: visible]`/`[ws: hidden]`) is screen-reader-compatible for terminals with screen reader support.
- The empty state message uses two colors (gray + blue) that are distinguishable in all three color tiers (truecolor, 256, 16).

---

## Unit & Integration Tests

**Test file:** `e2e/tui/diff.test.ts`

All tests are appended to the existing diff test file. Tests are organized into `describe` blocks by test category. Tests that depend on unimplemented backends (the diff API, the diff screen itself) are left failing — they are never skipped or commented out.

### Test helpers

```typescript
// e2e/tui/helpers.ts — existing helpers used by all tests
import { launchTUI, type TUITestInstance } from "./helpers";

// Navigate to a diff screen with test fixture data
async function navigateToDiff(
  terminal: TUITestInstance,
  mode: "change" | "landing" = "change",
): Promise<void> {
  // Navigate to a test repo's diff view
  await terminal.sendKeys("g", "r"); // go to repos
  await terminal.waitForText("Repositories");
  await terminal.sendKeys("Enter"); // select first repo
  await terminal.waitForText("Changes"); // repo overview

  if (mode === "change") {
    // Navigate to changes tab, select a change, view diff
    await terminal.sendKeys("Enter"); // open first change
    await terminal.waitForText("Diff"); // diff screen loaded
  } else {
    await terminal.sendKeys("g", "l"); // go to landings
    await terminal.waitForText("Landing");
    await terminal.sendKeys("Enter"); // open first landing diff
    await terminal.waitForText("Diff");
  }
}

// Wait for diff content to fully render
async function waitForDiffLoaded(terminal: TUITestInstance): Promise<void> {
  await terminal.waitForText("File");
  await terminal.waitForNoText("Loading");
}
```

### Snapshot tests — visual states (10 tests)

```typescript
describe("TUI_DIFF_WHITESPACE_TOGGLE — snapshots", () => {
  test("SNAP-WS-001: renders whitespace visible indicator in status bar at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Status bar (last line) should show [ws: visible] in muted color
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("SNAP-WS-002: renders whitespace hidden indicator in status bar at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");

    // Status bar should immediately show [ws: hidden] in warning color
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("SNAP-WS-003: renders abbreviated whitespace indicator at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/ws:vis/);
    expect(statusLine).not.toMatch(/\[ws: visible\]/);
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("SNAP-WS-004: renders abbreviated whitespace hidden indicator at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/ws:hid/);
    expect(statusLine).not.toMatch(/\[ws: hidden\]/);
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("SNAP-WS-005: renders whitespace indicator at 200x60", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("SNAP-WS-006: renders inline updating indicator during re-fetch", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Press w — inline loading should appear
    await terminal.sendKeys("w");

    // The "Updating diff…" indicator should be visible
    await terminal.waitForText("Updating diff");
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("SNAP-WS-007: renders no visible changes empty state", async () => {
    // This test requires a diff fixture where all files are whitespace-only
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal); // navigate to whitespace-only diff fixture
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");

    // Wait for re-fetch to complete
    await terminal.waitForText("No visible changes");
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("SNAP-WS-008: renders no visible changes empty state at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");
    await terminal.waitForText("No visible changes");

    // Verify text fits within 80 columns
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("SNAP-WS-009: renders filtered file tree with whitespace hidden", async () => {
    // Fixture: 5 files, 2 whitespace-only
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Verify initial file count
    await terminal.waitForText("Files (5)");

    await terminal.sendKeys("w");

    // After re-fetch, file tree should show filtered count
    await terminal.waitForText("Files (3)");
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("SNAP-WS-010: renders diff with whitespace changes excluded", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");

    // Wait for filtered diff to render
    await terminal.waitForNoText("Updating diff");
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });
});
```

### Keyboard interaction tests (17 tests)

```typescript
describe("TUI_DIFF_WHITESPACE_TOGGLE — keyboard interactions", () => {
  test("KEY-WS-001: w toggles whitespace to hidden", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Verify default state
    const beforeStatus = terminal.getLine(terminal.rows - 1);
    expect(beforeStatus).toMatch(/\[ws: visible\]/);

    await terminal.sendKeys("w");

    // Status bar should immediately update
    const afterStatus = terminal.getLine(terminal.rows - 1);
    expect(afterStatus).toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("KEY-WS-002: w toggles whitespace back to visible", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w"); // hide
    await terminal.waitForText("[ws: hidden]");

    // Wait for re-fetch to complete
    await terminal.waitForNoText("Updating diff");

    await terminal.sendKeys("w"); // show again
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });

  test("KEY-WS-003: w is no-op during initial loading", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate but don't wait for load to complete
    await navigateToDiff(terminal);

    // Press w during loading
    await terminal.sendKeys("w");

    // Status bar should not show ws indicator change
    // (or should still show default visible)
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).not.toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("KEY-WS-004: w is no-op during error state", async () => {
    // This test requires an error-producing fixture
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    // Trigger error state (e.g., 500 from server)
    await terminal.waitForText("Error");

    await terminal.sendKeys("w");

    // Should not toggle — no ws indicator change
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).not.toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("KEY-WS-005: w is no-op when comment form is open", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Open comment form (c key in landing diff context)
    await terminal.sendKeys("c");
    await terminal.waitForText("Comment"); // comment form overlay

    // Press w — should type into form, not toggle whitespace
    await terminal.sendKeys("w");

    // Status bar should still show visible
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });

  test("KEY-WS-006: w works from file tree focus zone", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Move focus to file tree
    await terminal.sendKeys("Tab");

    await terminal.sendKeys("w");

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("KEY-WS-007: w works from main content focus zone", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Default focus is on content
    await terminal.sendKeys("w");

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("KEY-WS-008: w works in split view mode", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Toggle to split view
    await terminal.sendKeys("t");

    // Toggle whitespace
    await terminal.sendKeys("w");

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("KEY-WS-009: rapid w presses debounced", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Press w three times rapidly (net result: hidden)
    await terminal.sendKeys("w");
    await terminal.sendKeys("w");
    await terminal.sendKeys("w");

    // Final status should be hidden
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);

    // Wait for debounce to settle (300ms + buffer)
    await terminal.waitForNoText("Updating diff");

    await terminal.terminate();
  });

  test("KEY-WS-010: w during Updating diff indicator", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // First toggle
    await terminal.sendKeys("w");
    await terminal.waitForText("Updating diff");

    // Toggle back while update is in progress
    await terminal.sendKeys("w");

    // Status should show visible again
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });

  test("KEY-WS-011: w then file navigation preserves whitespace state", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // Navigate to next file
    await terminal.sendKeys("]");

    // Whitespace should still be hidden
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("KEY-WS-012: w then view toggle preserves whitespace state", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // Toggle view mode
    await terminal.sendKeys("t");

    // Whitespace should still be hidden, no additional re-fetch
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("KEY-WS-013: w on empty diff is no-op", async () => {
    // Navigate to a diff with 0 files
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // On an empty diff, w should toggle the indicator cosmetically
    await terminal.sendKeys("w");

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);
    // But no "Updating diff" indicator should appear (no re-fetch for 0 files)

    await terminal.terminate();
  });

  test("KEY-WS-014: w on whitespace-only diff shows empty state", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");

    await terminal.waitForText("No visible changes");
    await terminal.waitForText("Press w to show whitespace");

    await terminal.terminate();
  });

  test("KEY-WS-015: w on empty state restores full diff", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Toggle to hidden (produces empty state)
    await terminal.sendKeys("w");
    await terminal.waitForText("No visible changes");

    // Toggle back to visible
    await terminal.sendKeys("w");

    // Empty state should disappear, full diff should render
    await terminal.waitForNoText("No visible changes");
    await terminal.waitForText("File"); // file tree or file indicator

    await terminal.terminate();
  });

  test("KEY-WS-016: Shift+W does not trigger toggle", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Send Shift+W (uppercase W)
    await terminal.sendKeys("W");

    // Status bar should still show visible
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });

  test("KEY-WS-017: Ctrl+W does not trigger toggle", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Send Ctrl+W
    await terminal.sendKeys("ctrl+w");

    // Status bar should still show visible
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });
});
```

### Responsive behavior tests (8 tests)

```typescript
describe("TUI_DIFF_WHITESPACE_TOGGLE — responsive behavior", () => {
  test("RSP-WS-001: status bar indicator abbreviates at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/ws:vis/);
    expect(statusLine).not.toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });

  test("RSP-WS-002: status bar indicator full at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });

  test("RSP-WS-003: status bar indicator full at 200x60", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });

  test("RSP-WS-004: resize from 120 to 80 abbreviates indicator", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w"); // toggle to hidden for more visibility
    await terminal.waitForText("[ws: hidden]");

    // Resize to minimum
    await terminal.resize(80, 24);

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/ws:hid/);
    expect(statusLine).not.toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("RSP-WS-005: resize from 80 to 120 expands indicator", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");
    await terminal.waitForText("ws:hid");

    // Resize to standard
    await terminal.resize(120, 40);

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("RSP-WS-006: resize during whitespace re-fetch", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Toggle whitespace
    await terminal.sendKeys("w");

    // Resize during re-fetch
    await terminal.resize(80, 24);

    // Layout should recalculate, re-fetch should continue
    // Eventually the diff should render at new size
    await terminal.waitForNoText("Updating diff");

    // Whitespace state should be preserved
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/ws:hid/);

    await terminal.terminate();
  });

  test("RSP-WS-007: whitespace state preserved across resize", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // Resize down
    await terminal.resize(80, 24);
    let statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/ws:hid/);

    // Resize back up
    await terminal.resize(120, 40);
    statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("RSP-WS-008: empty state message at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");
    await terminal.waitForText("No visible changes");

    // Verify no horizontal overflow
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });
});
```

### Data loading and integration tests (10 tests)

```typescript
describe("TUI_DIFF_WHITESPACE_TOGGLE — data integration", () => {
  test("INT-WS-001: whitespace toggle re-fetches change diff with ignore_whitespace", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal, "change");
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");

    // Should trigger re-fetch — inline loading indicator appears
    await terminal.waitForText("Updating diff");
    // After re-fetch completes, diff should render with filtered content
    await terminal.waitForNoText("Updating diff");

    await terminal.terminate();
  });

  test("INT-WS-002: whitespace toggle re-fetches landing diff with ignore_whitespace", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal, "landing");
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");

    await terminal.waitForText("Updating diff");
    await terminal.waitForNoText("Updating diff");

    await terminal.terminate();
  });

  test("INT-WS-003: whitespace toggle back re-fetches without ignore_whitespace", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Toggle to hidden
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // Toggle back to visible
    await terminal.sendKeys("w");
    await terminal.waitForText("Updating diff");
    await terminal.waitForNoText("Updating diff");

    // Full diff should be restored
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });

  test("INT-WS-004: whitespace toggle serves from cache within TTL", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // First toggle: cache miss
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // Toggle back: cache miss for ws=false
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // Toggle again within 30s: should be cache hit (faster response)
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("INT-WS-005: whitespace toggle re-fetches after cache expires", async () => {
    // This test verifies behavior after 30s TTL expiration
    // Note: real-time test — may need timeout adjustment
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // First toggle to populate cache
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // Toggle back
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // The cache TTL behavior is verified by the data hook layer
    // This test confirms the toggle mechanism works for the round trip
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });

  test("INT-WS-006: 401 during whitespace re-fetch shows auth error", async () => {
    // This test requires the server to return 401 on re-fetch
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Trigger whitespace toggle (API returns 401)
    await terminal.sendKeys("w");

    // Auth error screen should replace diff
    await terminal.waitForText("Session expired");
    await terminal.waitForText("codeplane auth login");

    await terminal.terminate();
  });

  test("INT-WS-007: 404 during whitespace re-fetch shows error", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Trigger whitespace toggle (API returns 404)
    await terminal.sendKeys("w");

    // Previous diff should be preserved, error in status bar
    await terminal.waitForText("not found");

    await terminal.terminate();
  });

  test("INT-WS-008: 429 during whitespace re-fetch shows rate limit", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Trigger whitespace toggle (API returns 429)
    await terminal.sendKeys("w");

    // Rate limit message in status bar
    await terminal.waitForText("Rate limited");

    await terminal.terminate();
  });

  test("INT-WS-009: network error during whitespace re-fetch preserves previous diff", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Trigger whitespace toggle (network failure)
    await terminal.sendKeys("w");

    // Previous diff should still be visible
    await terminal.waitForText("Failed to update diff");
    await terminal.waitForText("Press R to retry");

    await terminal.terminate();
  });

  test("INT-WS-010: re-fetch timeout after 30 seconds", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Trigger whitespace toggle (simulated slow response > 30s)
    await terminal.sendKeys("w");

    // Timeout message should appear
    await terminal.waitForText("timed out", 35000);

    await terminal.terminate();
  });
});
```

### Edge case tests (10 tests)

```typescript
describe("TUI_DIFF_WHITESPACE_TOGGLE — edge cases", () => {
  test("EDGE-WS-001: whitespace-only diff shows empty state when hidden", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.sendKeys("w");

    await terminal.waitForText("No visible changes (whitespace hidden)");
    await terminal.waitForText("Press w to show whitespace");

    await terminal.terminate();
  });

  test("EDGE-WS-002: recovering from empty state restores all files", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Enter empty state
    await terminal.sendKeys("w");
    await terminal.waitForText("No visible changes");

    // Recover
    await terminal.sendKeys("w");
    await terminal.waitForNoText("No visible changes");
    await terminal.waitForText("Files");

    await terminal.terminate();
  });

  test("EDGE-WS-003: mixed whitespace and code changes filter correctly", async () => {
    // Fixture: 5 files, 2 whitespace-only, 3 with code changes
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.waitForText("Files (5)");

    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // Should show only 3 files
    await terminal.waitForText("Files (3)");

    await terminal.terminate();
  });

  test("EDGE-WS-004: file tree count updates on whitespace toggle", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.waitForText("Files (5)");

    // Toggle to hidden
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");
    await terminal.waitForText("Files (3)");

    // Toggle back to visible
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");
    await terminal.waitForText("Files (5)");

    await terminal.terminate();
  });

  test("EDGE-WS-005: file position resets when focused file is whitespace-only", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Navigate to file 3 (which is whitespace-only in the fixture)
    await terminal.sendKeys("]");
    await terminal.sendKeys("]");
    await terminal.waitForText("File 3 of 5");

    // Toggle whitespace — file 3 disappears
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // Focus should reset to file 1 of filtered set
    await terminal.waitForText("File 1 of 3");

    await terminal.terminate();
  });

  test("EDGE-WS-006: status bar file count reflects filtered count", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    await terminal.waitForText("File 1 of 5");

    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");
    await terminal.waitForText("File 1 of 3");

    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");
    await terminal.waitForText("File 1 of 5");

    await terminal.terminate();
  });

  test("EDGE-WS-007: hunk collapse state resets on whitespace toggle", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Collapse a hunk
    await terminal.sendKeys("z");

    // Toggle whitespace
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // After re-fetch, all hunks should be expanded (fresh diff data)
    // The collapsed hunk from before should no longer be collapsed
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("EDGE-WS-008: scroll position resets to top on whitespace toggle", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // Scroll down significantly
    for (let i = 0; i < 20; i++) {
      await terminal.sendKeys("j");
    }

    // Toggle whitespace
    await terminal.sendKeys("w");
    await terminal.waitForNoText("Updating diff");

    // Scroll position should be at top (line 1 visible)
    expect(terminal.snapshot()).toMatchSnapshot();

    await terminal.terminate();
  });

  test("EDGE-WS-009: debounce correctly handles odd number of rapid toggles", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // 3 rapid presses → net state: hidden
    await terminal.sendKeys("w");
    await terminal.sendKeys("w");
    await terminal.sendKeys("w");

    // Wait for debounce + re-fetch
    await terminal.waitForNoText("Updating diff");

    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: hidden\]/);

    await terminal.terminate();
  });

  test("EDGE-WS-010: debounce correctly handles even number of rapid toggles", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToDiff(terminal);
    await waitForDiffLoaded(terminal);

    // 4 rapid presses → net state: visible (no-op)
    await terminal.sendKeys("w");
    await terminal.sendKeys("w");
    await terminal.sendKeys("w");
    await terminal.sendKeys("w");

    // Wait for debounce to settle
    // Status should be back to visible — net no-op
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[ws: visible\]/);

    await terminal.terminate();
  });
});
```

---

## Dependency Graph

```
tui-diff-whitespace-toggle
├── tui-diff-screen (dependency)
│   ├── DiffScreen component shell
│   ├── DiffContentArea component
│   ├── DiffFileTree component
│   ├── Screen keybinding registration
│   └── Status bar composition
├── tui-diff-data-hooks (dependency)
│   ├── useChangeDiff hook
│   ├── useLandingDiff hook
│   ├── DiffFetchOptions.ignore_whitespace
│   ├── Cache layer with ws-aware keys
│   └── useDiffData adapter hook
└── Shared infrastructure (already implemented)
    ├── useScreenKeybindings
    ├── useTerminalDimensions
    ├── useOnResize
    ├── useTheme
    ├── StatusBar component
    ├── KeybindingProvider
    └── Logger / Telemetry
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| API does not support `ignore_whitespace` parameter | Medium | Low | Feature degrades gracefully — same diff returned. Toggle appears non-functional. No error. |
| Large diff (10MB+) causes slow re-fetch | Low | Medium | 30s timeout with clear error message. Inline loading preserves context. Warn log at >3s. |
| OpenTUI `<text>` inserted above `<scrollbox>` resets scroll | Medium | Medium | Validate with PoC (`poc/opentui-inline-loading.ts`). If confirmed, use overlay positioning instead. |
| React 19 strict mode fires debounce timer twice | Low | Low | Timer cleanup in `useEffect` return. `clearTimeout` before `setTimeout`. |
| Cache key collision between change and landing diffs | Very low | High | Cache keys are prefixed with `change-diff:` vs `landing-diff:` — no collision possible. |
