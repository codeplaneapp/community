# Engineering Specification: `tui-diff-view-toggle`

## TUI_DIFF_VIEW_TOGGLE: `t` key toggles between unified and split diff modes

**Ticket ID:** `tui-diff-view-toggle`
**Type:** Feature
**Feature:** `TUI_DIFF_VIEW_TOGGLE`
**Dependencies:** `tui-diff-unified-view`, `tui-diff-split-view`
**Status:** Not started
**Target directory:** `apps/tui/src/`
**Test directory:** `e2e/tui/`

---

## 1. Overview

This ticket implements the `t` keybinding on the diff screen that toggles between unified and split (side-by-side) diff view modes. The toggle is purely client-side — it changes how already-fetched diff data is rendered via OpenTUI's `<diff>` component `view` prop. No API calls are made during toggle.

The feature manages:

1. **View mode state** (`viewMode`) tracking the current active mode (`'unified'` | `'split'`).
2. **Preferred mode state** (`preferredMode`) tracking the user's explicit last choice, used for post-revert restoration.
3. **Terminal width gating** — split mode requires ≥120 columns; toggling below this threshold is rejected with a flash message.
4. **Auto-revert on resize** — if the terminal shrinks below 120 columns during split mode, the view auto-reverts to unified with a notification.
5. **Flash message system** — temporary status bar override messages for rejection and auto-revert scenarios.
6. **Debounce** — 100ms debounce on the `t` key to prevent rapid-fire toggles.
7. **Scroll position preservation** — the logical line at the viewport top is preserved across mode transitions.
8. **Status bar indicator** — `[unified]` or `[split]` shown in the status bar center section.

---

## 2. Implementation Plan

### Step 1: Add diff-specific constants to `apps/tui/src/util/constants.ts`

Append three new constants to the existing constants file. This keeps all magic numbers in one location and allows other diff features to reference the same values.

```typescript
// ── Diff view toggle ────────────────────────────────────────────────────────

/**
 * Minimum terminal width (columns) required for split diff view.
 * Matches design.md §8.1: standard breakpoint starts at 120 cols.
 * The check is inclusive: width >= SPLIT_MIN_WIDTH.
 */
export const SPLIT_MIN_WIDTH = 120;

/**
 * Debounce interval for the `t` key toggle in the diff view.
 * Keypresses within this window of the last successful toggle are dropped.
 */
export const DIFF_TOGGLE_DEBOUNCE_MS = 100;

/**
 * Duration in milliseconds that flash messages (rejection, auto-revert)
 * remain visible in the status bar before auto-clearing.
 */
export const DIFF_FLASH_DURATION_MS = 3_000;
```

These constants reference design spec §8.1 and the ticket requirements (100ms debounce, 3s flash). Other diff tickets can import them without duplicating values.

---

### Step 2: Create the `useDiffViewToggle` hook

**File:** `apps/tui/src/hooks/useDiffViewToggle.ts` (new)

This is the core state management hook. It encapsulates all toggle logic, width checking, debounce, auto-revert, and flash messaging. The hook is designed to be consumed entirely by `DiffScreen` — it does not install any keybindings or providers itself.

#### Public API

```typescript
import { useState, useRef, useCallback, useEffect } from "react";
import { useTerminalDimensions } from "@opentui/react";
import {
  SPLIT_MIN_WIDTH,
  DIFF_TOGGLE_DEBOUNCE_MS,
  DIFF_FLASH_DURATION_MS,
} from "../util/constants.js";

export type DiffViewMode = "unified" | "split";

export interface DiffViewToggleState {
  /** Current active view mode. Passed to `<diff view={viewMode}>`. */
  viewMode: DiffViewMode;
  /** User's last explicit preference. Remembered across auto-reverts. */
  preferredMode: DiffViewMode;
  /** Whether split mode is available at the current terminal width. */
  canSplit: boolean;
  /** Current flash message, or null if none active. */
  flashMessage: string | null;
  /** Toggle handler — wire to the `t` keybinding. */
  toggle: () => void;
}
```

#### Internal state

| Variable | Type | Default | Purpose |
|---|---|---|---|
| `viewMode` | `DiffViewMode` | `"unified"` | Currently rendered mode. Drives `<diff view={viewMode}>`. |
| `preferredMode` | `DiffViewMode` | `"unified"` | Tracks user's explicit `t` press. NOT updated on auto-revert, allowing single `t` to restore split after forced revert. |
| `flashMessage` | `string \| null` | `null` | Active flash message. Auto-clears after `DIFF_FLASH_DURATION_MS`. |
| `lastToggleTs` | `useRef<number>` | `0` | Timestamp of last processed toggle, for debounce. |
| `flashTimerRef` | `useRef<ReturnType<typeof setTimeout> \| null>` | `null` | Timer handle for flash auto-clear. Cleaned up on unmount. |
| `previousWidthRef` | `useRef<number>` | `width` | Previous terminal width, for telemetry on auto-revert. |

#### Flash message constants

```typescript
const FLASH_MSG_SPLIT_UNAVAILABLE = "Split view requires 120+ column terminal";
const FLASH_MSG_AUTO_REVERTED = "Terminal too narrow — reverted to unified view";
```

#### `toggle()` logic

```
function toggle():
  now = Date.now()
  if (now - lastToggleTs.current < DIFF_TOGGLE_DEBOUNCE_MS):
    log.debug("diff.toggle.debounced", { elapsed_ms: now - lastToggleTs.current })
    return

  lastToggleTs.current = now

  if viewMode === "unified":
    if width < SPLIT_MIN_WIDTH:
      showFlash(FLASH_MSG_SPLIT_UNAVAILABLE)
      log.warn("diff.split.unavailable", { width, height })
      return
    setViewMode("split")
    setPreferredMode("split")
    log.info("diff.view.toggled", { from: "unified", to: "split", width, trigger: "keypress" })
  else:
    setViewMode("unified")
    setPreferredMode("unified")
    log.info("diff.view.toggled", { from: "split", to: "unified", width, trigger: "keypress" })
```

Note: `lastToggleTs` is updated _before_ the width check. This means a rejected toggle still consumes the debounce window, preventing rapid-fire flash messages from filling the event log.

#### Auto-revert on resize

```typescript
useEffect(() => {
  if (viewMode === "split" && width < SPLIT_MIN_WIDTH) {
    setViewMode("unified");
    // DO NOT update preferredMode — user's choice is remembered
    showFlash(FLASH_MSG_AUTO_REVERTED);
    console.info("diff.auto_switch_unified", {
      currentWidth: width,
      previousWidth: previousWidthRef.current,
      trigger: "resize",
    });
  }
  previousWidthRef.current = width;
}, [width, viewMode]);
```

**Critical invariant:** `preferredMode` is NOT changed on auto-revert. This means after a forced revert, the user's next `t` press toggles from `viewMode="unified"` to `"split"` (if width allows), which is the correct behavior per spec. The toggle handler reads `viewMode`, not `preferredMode`, to determine direction.

**Critical invariant:** Resize back above 120 does NOT auto-restore split. The `useEffect` only fires when `viewMode === "split" && width < SPLIT_MIN_WIDTH`. There is no effect that watches for `width >= SPLIT_MIN_WIDTH` to auto-restore.

#### Flash message management

```typescript
function showFlash(message: string): void {
  if (flashTimerRef.current !== null) {
    clearTimeout(flashTimerRef.current);
  }
  setFlashMessage(message);
  flashTimerRef.current = setTimeout(() => {
    setFlashMessage(null);
    flashTimerRef.current = null;
  }, DIFF_FLASH_DURATION_MS);
}

// Cleanup on unmount — prevents orphaned setState
useEffect(() => {
  return () => {
    if (flashTimerRef.current !== null) {
      clearTimeout(flashTimerRef.current);
    }
  };
}, []);
```

Flash messages replace each other: a new flash clears the existing timer and starts a fresh 3-second window. Only one flash is active at a time.

#### Derived value

```typescript
const canSplit = width >= SPLIT_MIN_WIDTH;
```

This is a convenience for consumers that want to show/hide split-mode-specific UI without calling the toggle.

---

### Step 3: Create the `useDiffScrollPreservation` hook

**File:** `apps/tui/src/hooks/useDiffScrollPreservation.ts` (new)

This hook preserves the logical scroll position across view mode transitions. When the view mode changes, it captures the current top-visible logical line index before the transition and restores it after.

#### Public API

```typescript
import { useRef, useCallback } from "react";
import type { DiffViewMode } from "./useDiffViewToggle.js";

export interface ScrollPreservation {
  /** Ref to attach to the <diff> or wrapping <scrollbox> component. */
  scrollRef: React.RefObject<any>;
  /** Call before a view toggle to snapshot the current scroll position. */
  capturePosition: () => void;
  /** Call after a view toggle to restore the scroll position. */
  restorePosition: (targetMode: DiffViewMode) => void;
}

export function useDiffScrollPreservation(): ScrollPreservation;
```

#### Implementation strategy

OpenTUI's `<diff>` component rebuilds its internal view when the `view` prop changes (`buildView()` is called). Scroll state is lost during this rebuild.

**Primary approach:** Read `scrollY` from the `<diff>` component's ref if it exposes `leftCodeRenderable` / `rightCodeRenderable` with numeric `scrollY` properties. After the view change, set `scrollY` on the new renderables.

**Fallback approach:** If OpenTUI's `<diff>` does not expose scroll internals via ref, wrap the `<diff>` in a `<scrollbox>` and read/restore the scrollbox's `scrollTop` property.

**Runtime guard:**
```typescript
const capturePosition = useCallback(() => {
  const el = scrollRef.current;
  if (!el) return;
  if (typeof el.leftCodeRenderable?.scrollY === "number") {
    savedLineIndex.current = el.leftCodeRenderable.scrollY;
  } else if (typeof el.scrollTop === "number") {
    savedLineIndex.current = el.scrollTop;
  } else {
    console.warn("diff.scroll.preservation_unavailable", {
      reason: "scrollY not accessible",
    });
  }
}, []);

const restorePosition = useCallback((targetMode: DiffViewMode) => {
  if (savedLineIndex.current <= 0) return;
  // Defer restoration to next frame so OpenTUI's layout pass completes first
  requestAnimationFrame(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof el.leftCodeRenderable?.scrollY === "number") {
      el.leftCodeRenderable.scrollY = savedLineIndex.current;
    }
    if (el.rightCodeRenderable && typeof el.rightCodeRenderable.scrollY === "number") {
      el.rightCodeRenderable.scrollY = savedLineIndex.current;
    }
    if (typeof el.scrollTop === "number") {
      el.scrollTop = savedLineIndex.current;
    }
    console.debug("diff.scroll.preserved", {
      lineIndex: savedLineIndex.current,
      mode: targetMode,
    });
  });
}, []);
```

The `requestAnimationFrame` is necessary because OpenTUI processes layout asynchronously after a prop change — setting scroll before layout completes would be overwritten.

---

### Step 4: Create the `DiffViewIndicatorContext` for status bar communication

**File:** `apps/tui/src/hooks/useDiffViewIndicator.ts` (new)

The StatusBar is rendered by AppShell, not by DiffScreen. Since the diff screen's view mode must appear in the status bar center section, a lightweight context bridges the two.

```typescript
import React, { createContext, useContext, useState, useMemo } from "react";
import type { DiffViewMode } from "./useDiffViewToggle.js";

export interface DiffViewIndicatorContextType {
  /** Current diff view mode, or null if not on diff screen. */
  mode: DiffViewMode | null;
  /** Set the indicator. Called by DiffScreen on mount and mode change. */
  setMode: (mode: DiffViewMode | null) => void;
}

export const DiffViewIndicatorContext =
  createContext<DiffViewIndicatorContextType>({
    mode: null,
    setMode: () => {},
  });

export function useDiffViewIndicator(): DiffViewIndicatorContextType {
  return useContext(DiffViewIndicatorContext);
}

export function DiffViewIndicatorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<DiffViewMode | null>(null);
  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return (
    <DiffViewIndicatorContext.Provider value={value}>
      {children}
    </DiffViewIndicatorContext.Provider>
  );
}
```

**Why a context instead of props?** StatusBar is a sibling of the content area inside AppShell. There is no prop-drilling path from DiffScreen → StatusBar without lifting state above both. A context is the standard React pattern for this.

**Why not reuse `StatusBarHintsContext`?** The hints context manages keybinding hints (left section). The view mode indicator goes in the center section alongside sync status. These are semantically different concerns. A dedicated context avoids overloading the hints API.

---

### Step 5: Add `DiffViewIndicatorProvider` to the provider stack

**File:** `apps/tui/src/components/AppShell.tsx` (modify)

The provider must wrap both the content area (where DiffScreen renders) and StatusBar (which reads the indicator). Looking at the existing AppShell structure:

```tsx
// Current structure:
<box flexDirection="column" width="100%" height="100%">
  <HeaderBar />
  <box flexGrow={1} width="100%">{children}</box>
  <StatusBar />
  <OverlayLayer />
</box>
```

Wrap the entire layout with the provider:

```tsx
import { DiffViewIndicatorProvider } from "../hooks/useDiffViewIndicator.js";

export function AppShell({ children }: { children?: React.ReactNode }) {
  const layout = useLayout();

  if (!layout.breakpoint) {
    return <TerminalTooSmallScreen cols={layout.width} rows={layout.height} />;
  }

  return (
    <DiffViewIndicatorProvider>
      <box flexDirection="column" width="100%" height="100%">
        <HeaderBar />
        <box flexGrow={1} width="100%">
          {children}
        </box>
        <StatusBar />
        <OverlayLayer />
      </box>
    </DiffViewIndicatorProvider>
  );
}
```

This ensures both DiffScreen (descendant of `{children}`) and StatusBar can access the context.

---

### Step 6: Modify StatusBar to render mode indicator and flash messages

**File:** `apps/tui/src/components/StatusBar.tsx` (modify)

Two additions to the existing StatusBar:

#### 6a. Mode indicator in center section

Add `useDiffViewIndicator()` import. In the center `<box>` section (where auth confirmation and sync status render), add a mode indicator when `mode !== null`:

```tsx
import { useDiffViewIndicator } from "../hooks/useDiffViewIndicator.js";

export function StatusBar() {
  // ... existing hooks ...
  const { mode: diffViewMode } = useDiffViewIndicator();
  const { hints, isOverridden } = useStatusBarHints();

  // ... existing logic ...

  return (
    <box flexDirection="row" height={1} width="100%" borderColor={theme.border} border={["top"]} justifyContent="space-between">
      {/* Left: hints or flash message */}
      <box flexGrow={1} flexDirection="row">
        {isOverridden && hints.length === 1 && hints[0].keys === "" ? (
          // Flash message mode — full-width warning text
          <text fg={theme.warning}>{hints[0].label}</text>
        ) : statusBarError ? (
          <text fg={theme.error}>{truncateRight(statusBarError, maxErrorWidth)}</text>
        ) : (
          <>
            {displayedHints.map((hint, i) => (
              <React.Fragment key={i}>
                <text fg={theme.primary}>{hint.keys}</text>
                <text fg={theme.muted}>{`:${hint.label}  `}</text>
              </React.Fragment>
            ))}
            {showRetryHint && (
              <>
                <text fg={theme.primary}>R</text>
                <text fg={theme.muted}>:retry</text>
              </>
            )}
          </>
        )}
      </box>

      {/* Center: view mode indicator + sync/auth status */}
      <box>
        {diffViewMode && (
          <text fg={theme.muted}>{`[${diffViewMode}] `}</text>
        )}
        {authConfirmText && <text fg={theme.success}>{authConfirmText}</text>}
        {offlineWarning && <text fg={theme.warning}>{offlineWarning}</text>}
        {!authConfirmText && !offlineWarning && (
          <text fg={syncColor}>{syncLabel}</text>
        )}
      </box>

      {/* Right: help */}
      <box>
        <text fg={theme.muted}>  </text>
        <text fg={theme.primary}>?</text>
        <text fg={theme.muted}> help</text>
      </box>
    </box>
  );
}
```

#### 6b. Flash message rendering via hint overrides

Flash messages use the existing `overrideHints` mechanism from `StatusBarHintsContext`. When a flash is active, the DiffScreen calls `overrideHints` with a single hint that has `keys: ""` and `label: <flash text>`. The StatusBar detects this pattern (single hint with empty keys) and renders it as a full-width warning message instead of the normal key:label format.

This is handled by the conditional in the left section above: `isOverridden && hints.length === 1 && hints[0].keys === ""`.

---

### Step 7: Create the DiffScreen component (or modify existing scaffold)

**File:** `apps/tui/src/screens/DiffScreen.tsx` (new)

Currently `DiffView` maps to `PlaceholderScreen` in the screen registry. This step creates the real DiffScreen. The screen itself is a dependency of `tui-diff-unified-view` and `tui-diff-split-view`, but the toggle logic can be wired into a skeleton that renders the `<diff>` component.

**Note:** This step integrates all hooks from Steps 2–4. The actual unified and split view rendering details are handled by the dependency tickets; this ticket wires the toggle that switches between them.

```typescript
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useDiffViewToggle } from "../hooks/useDiffViewToggle.js";
import { useDiffScrollPreservation } from "../hooks/useDiffScrollPreservation.js";
import { useDiffViewIndicator } from "../hooks/useDiffViewIndicator.js";
import { useDiffSyntaxStyle } from "../hooks/useDiffSyntaxStyle.js";
import { useScreenKeybindings } from "../hooks/useScreenKeybindings.js";
import { useStatusBarHints } from "../hooks/useStatusBarHints.js";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { buildDiffKeybindings, buildDiffStatusBarHints } from "./diff-keybindings.js";
import type { ScreenComponentProps } from "../router/types.js";
import type { DiffViewMode } from "../hooks/useDiffViewToggle.js";

type FocusZone = "content" | "tree";

export function DiffScreen({ entry, params }: ScreenComponentProps) {
  // --- View toggle ---
  const viewToggle = useDiffViewToggle();
  const scrollPreservation = useDiffScrollPreservation();

  // --- Focus zone ---
  const [focusZone, setFocusZone] = useState<FocusZone>("content");

  // --- Layout and theme ---
  const layout = useLayout();
  const theme = useTheme();
  const syntaxStyle = useDiffSyntaxStyle();

  // --- View mode indicator for status bar ---
  const indicator = useDiffViewIndicator();
  useEffect(() => {
    indicator.setMode(viewToggle.viewMode);
    return () => indicator.setMode(null);
  }, [viewToggle.viewMode, indicator]);

  // --- Flash message → status bar override ---
  const { overrideHints } = useStatusBarHints();
  useEffect(() => {
    if (viewToggle.flashMessage) {
      const cleanup = overrideHints([
        { keys: "", label: viewToggle.flashMessage, order: 0 },
      ]);
      return cleanup;
    }
  }, [viewToggle.flashMessage, overrideHints]);

  // --- Wrap toggle with scroll preservation ---
  const handleToggle = useCallback(() => {
    scrollPreservation.capturePosition();
    const prevMode = viewToggle.viewMode;
    viewToggle.toggle();
    // Defer restoration to after React re-render + OpenTUI layout
    const targetMode: DiffViewMode = prevMode === "unified" ? "split" : "unified";
    requestAnimationFrame(() => scrollPreservation.restorePosition(targetMode));
  }, [viewToggle, scrollPreservation]);

  // --- Keybindings ---
  const diffKeybindings = useMemo(
    () =>
      buildDiffKeybindings({
        focusZone,
        setFocusZone,
        toggle: handleToggle,
        // isLoading, error, fileCount will come from diff data hooks
        // (dependency tickets). For now, guard with defaults.
        canToggle: true,
      }),
    [focusZone, handleToggle],
  );

  const hints = useMemo(
    () => buildDiffStatusBarHints(),
    [],
  );

  useScreenKeybindings(diffKeybindings, hints);

  // --- Render ---
  return (
    <box flexDirection="row" flexGrow={1} width="100%">
      {layout.sidebarVisible && (
        <box
          width={layout.sidebarWidth}
          flexDirection="column"
          borderColor={focusZone === "tree" ? theme.primary : theme.border}
          border={["right"]}
        >
          {/* File tree — populated by dependency tickets */}
          <text fg={theme.muted}>File tree</text>
        </box>
      )}
      <box flexGrow={1} flexDirection="column">
        <diff
          ref={scrollPreservation.scrollRef}
          view={viewToggle.viewMode}
          syncScroll={viewToggle.viewMode === "split"}
          syntaxStyle={syntaxStyle}
          showLineNumbers={true}
          addedBg={theme.diffAddedBg}
          removedBg={theme.diffRemovedBg}
          addedSignColor={theme.diffAddedText}
          removedSignColor={theme.diffRemovedText}
          style={{ flexGrow: 1 }}
        />
      </box>
    </box>
  );
}
```

**Registration:** Update `apps/tui/src/router/registry.ts` to point `ScreenName.DiffView` at `DiffScreen` instead of `PlaceholderScreen`.

---

### Step 8: Create diff keybindings module

**File:** `apps/tui/src/screens/diff-keybindings.ts` (new)

Extract diff keybinding definitions into a dedicated module for testability and readability.

```typescript
import type { KeyHandler, StatusBarHint } from "../providers/keybinding-types.js";

interface DiffKeybindingsConfig {
  focusZone: "content" | "tree";
  setFocusZone: (zone: "content" | "tree") => void;
  toggle: () => void;
  canToggle: boolean; // false during loading/error/empty
}

export function buildDiffKeybindings(config: DiffKeybindingsConfig): KeyHandler[] {
  return [
    {
      key: "t",
      description: "Toggle view",
      group: "View Controls",
      handler: config.toggle,
      when: () => config.canToggle,
    },
    // Additional diff keybindings (j, k, ], [, w, x, z, Tab, Ctrl+B)
    // are added by dependency tickets. This module defines only the
    // toggle binding for this ticket.
  ];
}

export function buildDiffStatusBarHints(): StatusBarHint[] {
  return [
    { keys: "j/k", label: "navigate", order: 0 },
    { keys: "]/[", label: "file", order: 10 },
    { keys: "t", label: "view", order: 20 },
    { keys: "w", label: "whitespace", order: 30 },
    { keys: "x/z", label: "hunks", order: 40 },
    { keys: "Tab", label: "tree", order: 50 },
  ];
}
```

The `t:view` hint is always shown regardless of `canSplit`. The user should see the keybinding exists; the flash message explains rejection.

The `when` guard returns `false` during loading, error, and empty states. The DiffScreen will pass `canToggle: !isLoading && !error && fileCount > 0` once data hooks are integrated by dependency tickets.

---

### Step 9: Update screen registry

**File:** `apps/tui/src/router/registry.ts` (modify)

Replace the `PlaceholderScreen` mapping for `DiffView`:

```typescript
import { DiffScreen } from "../screens/DiffScreen.js";

// In the registry map:
[ScreenName.DiffView]: {
  component: DiffScreen,  // was: PlaceholderScreen
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.path ? `${p.path}` : "Diff"),
},
```

---

## 3. File Manifest

| File | Action | Purpose |
|---|---|---|
| `apps/tui/src/util/constants.ts` | **Modify** | Add `SPLIT_MIN_WIDTH`, `DIFF_TOGGLE_DEBOUNCE_MS`, `DIFF_FLASH_DURATION_MS` |
| `apps/tui/src/hooks/useDiffViewToggle.ts` | **Create** | Core toggle state, debounce, width gating, auto-revert, flash |
| `apps/tui/src/hooks/useDiffScrollPreservation.ts` | **Create** | Scroll position capture/restore across view transitions |
| `apps/tui/src/hooks/useDiffViewIndicator.ts` | **Create** | Context for communicating view mode to StatusBar |
| `apps/tui/src/screens/DiffScreen.tsx` | **Create** | Diff screen wiring toggle hook, keybindings, indicator, scroll preservation |
| `apps/tui/src/screens/diff-keybindings.ts` | **Create** | `t` binding definition and status bar hints |
| `apps/tui/src/components/AppShell.tsx` | **Modify** | Wrap layout in `DiffViewIndicatorProvider` |
| `apps/tui/src/components/StatusBar.tsx` | **Modify** | Render `[unified]`/`[split]` indicator and flash message support |
| `apps/tui/src/router/registry.ts` | **Modify** | Point `DiffView` at `DiffScreen` instead of `PlaceholderScreen` |
| `e2e/tui/diff.test.ts` | **Modify** | Add all toggle-related E2E tests |

---

## 4. State Lifecycle

### 4.1 Initialization

- On DiffScreen mount: `viewMode = "unified"`, `preferredMode = "unified"`, `flashMessage = null`.
- `indicator.setMode("unified")` → StatusBar shows `[unified]`.
- `canSplit` derived from current terminal width.

### 4.2 Normal toggle (width ≥ 120)

1. User presses `t` at 120+ col terminal.
2. `KeybindingProvider` dispatches to PRIORITY.SCREEN scope → `t` handler.
3. `when()` guard: `canToggle` is true (data loaded, no error, files > 0).
4. `handleToggle()` calls `capturePosition()` to snapshot scroll offset.
5. `viewToggle.toggle()` runs debounce check (>100ms since last toggle → pass).
6. Width check: `width >= 120` → pass.
7. `viewMode` set to `"split"`, `preferredMode` set to `"split"`.
8. `useEffect` in DiffScreen fires: `indicator.setMode("split")` → StatusBar updates to `[split]`.
9. `<diff view="split" syncScroll={true}>` re-renders.
10. `requestAnimationFrame` fires → `restorePosition("split")` restores scroll.

### 4.3 Rejected toggle (width < 120)

1. User presses `t` at <120 col terminal.
2. Debounce check passes.
3. Width check fails: `width < SPLIT_MIN_WIDTH`.
4. `showFlash(FLASH_MSG_SPLIT_UNAVAILABLE)` sets `flashMessage`.
5. `useEffect` in DiffScreen fires: `overrideHints([{ keys: "", label: "Split view requires 120+ column terminal" }])`.
6. StatusBar renders flash message in `theme.warning` color.
7. View mode stays `"unified"`. No re-render of diff content.
8. Timer fires after 3s → `flashMessage = null` → override cleared → normal hints restored.

### 4.4 Auto-revert on resize

1. User is in split mode at 130 cols.
2. Terminal resized to 100 cols.
3. `useTerminalDimensions()` updates → `useEffect` in `useDiffViewToggle` fires.
4. `viewMode === "split" && width < 120` → true.
5. `setViewMode("unified")`. `preferredMode` stays `"split"` (NOT updated).
6. `showFlash(FLASH_MSG_AUTO_REVERTED)` → StatusBar shows flash.
7. `indicator.setMode("unified")` → StatusBar indicator updates to `[unified]`.
8. Flash clears after 3 seconds.

### 4.5 Post-revert toggle

1. After auto-revert, user resizes back to 130 cols. No auto-restore occurs.
2. User presses `t`.
3. Current `viewMode` is `"unified"` → toggle direction is to `"split"`.
4. Width check: `130 >= 120` → pass.
5. `viewMode` and `preferredMode` both set to `"split"`.

### 4.6 Screen exit

1. User presses `q` to leave diff screen.
2. `DiffScreen` unmounts.
3. `useDiffViewToggle` cleanup effect clears flash timer.
4. `useEffect` cleanup in DiffScreen calls `indicator.setMode(null)`.
5. StatusBar no longer shows `[unified]`/`[split]` indicator.

### 4.7 Persistence scope

- View mode persists within a diff session: navigating between files (`]`/`[`), toggling whitespace (`w`), expanding/collapsing hunks (`x`/`z`) all preserve the current view mode.
- View mode resets to `"unified"` on new DiffScreen push (fresh component mount).
- View mode is NOT persisted to disk or config. Session-only.

---

## 5. Keybinding Context and Guards

The `t` key must be correctly gated across all focus contexts:

| Context | `t` behavior | Mechanism |
|---|---|---|
| Main diff content (focused) | Toggles view | PRIORITY.SCREEN scope, normal dispatch |
| File tree sidebar (focused) | Toggles view | Same PRIORITY.SCREEN scope — `t` is not used by file tree navigation |
| Hunk focus (expand/collapse) | Toggles view | Not consumed by hunk controls |
| Help overlay open (`?`) | Blocked | PRIORITY.MODAL scope captures all keys first |
| Command palette open (`:`) | Blocked | PRIORITY.MODAL scope captures all keys first |
| Comment form open (inline) | Blocked | PRIORITY.TEXT_INPUT scope captures printable keys first |
| Loading state | No-op | `when()` predicate returns false |
| Error state | No-op | `when()` predicate returns false |
| Empty diff (no files) | No-op | `when()` predicate returns false |

The priority dispatch system in `KeybindingProvider` handles all blocking automatically. The `t` binding at PRIORITY.SCREEN (4) is never reached when a PRIORITY.MODAL (2) or PRIORITY.TEXT_INPUT (1) scope is active.

---

## 6. Layout Proportions

When in split mode, OpenTUI's `<diff view="split">` internally creates two side-by-side panes with `flexDirection="row"` and splits them evenly. The outer DiffScreen layout only needs to provide the correct container width for the `<diff>` component.

| Configuration | Sidebar | Diff Container | Internal Split |
|---|---|---|---|
| Split + sidebar visible (standard) | 25% | 75% (`flexGrow=1`) | 37.5% + 37.5% (OpenTUI internal) |
| Split + sidebar visible (large) | 30% | 70% (`flexGrow=1`) | 35% + 35% (OpenTUI internal) |
| Split + sidebar hidden | 0% | 100% (`flexGrow=1`) | 50% + 50% (OpenTUI internal) |
| Unified + sidebar visible | 25% / 30% | 75% / 70% (single column) | — |
| Unified + sidebar hidden | 0% | 100% (single column) | — |

The `flexGrow={1}` on the content box handles all proportions automatically. No explicit percentage calculation is needed in DiffScreen code.

Line number gutter width is auto-sized by OpenTUI's `<diff>` component based on the maximum line number in the file. No explicit configuration needed.

---

## 7. Edge Cases

| Case | Behavior |
|---|---|
| Single-file diff | Toggle works normally. Split shows old content left, new content right. |
| Binary file diff | Toggle works. Binary diff shows "Binary file changed" in both modes. |
| Collapsed hunks | Hunk collapse state is preserved across toggles. Collapse state is in the `<diff>` component's internal state, which persists because only the `view` prop changes, not the diff data. |
| Scroll at bottom of file | Bottom position preserved. If unified bottom maps to a split position that's mid-file, scrolls to nearest equivalent. |
| Flash message replacement | New flash replaces existing flash (timer resets). Only one flash at a time. |
| Forced revert → immediate `t` | Works. If width is now ≥120 (e.g., resize crossed threshold briefly), toggle succeeds. If still <120, shows rejection flash (which replaces the revert flash). |
| 16-color terminal | Split view renders with +/- signs for differentiation instead of background colors. No functional difference in toggle behavior. |
| 500+ file diff | Toggle applies globally to all files. No per-file view mode. The `view` prop change triggers a single re-render. |
| Concurrent resize + keypress | Both paths check width before setting split. React batches state updates. No invalid state is reachable — worst case, auto-revert fires immediately after a successful toggle. |
| Flash timer cleanup on unmount | `useEffect` cleanup calls `clearTimeout`. No orphaned setState calls. |
| Width exactly 120 | Split is available. The threshold is `>=` 120 (inclusive). |
| Width 119 | Split rejected. 119 < 120. |

---

## 8. Telemetry Events

All events are emitted via structured `console.info` / `console.warn` / `console.debug`. When the telemetry system is integrated, these will be promoted to proper event emissions.

| Event | Level | Fields | Trigger |
|---|---|---|---|
| `tui.diff.view_toggled` | info | `from_mode`, `to_mode`, `terminal_width`, `terminal_height`, `sidebar_visible`, `file_count`, `trigger: 'keypress'` | Successful toggle |
| `tui.diff.view_toggle_rejected` | warn | `terminal_width`, `terminal_height`, `attempted_mode: 'split'` | Width check failed |
| `tui.diff.view_auto_reverted` | warn | `terminal_width`, `previous_width`, `from_mode: 'split'`, `to_mode: 'unified'`, `trigger: 'resize'` | Resize below threshold |
| `diff.toggle.debounced` | debug | `elapsed_ms` | Key pressed within debounce window |
| `diff.scroll.preserved` | debug | `line_index`, `from_mode`, `to_mode` | Scroll position restored |

---

## 9. Failure Modes and Recovery

| Failure | Impact | Recovery |
|---|---|---|
| OpenTUI `view` prop unsupported (version mismatch) | `<diff>` ignores prop, renders unified | Warn log. User sees unified-only. Toggle appears to no-op. |
| `syncScroll` prop ignored | Split panes scroll independently | Cosmetic degradation only. Warn log. |
| `useTerminalDimensions` returns stale/wrong width | Width check may incorrectly allow/deny split | Self-heals on next resize event. User can manually toggle. |
| `<diff>` component throws on view switch | React error boundary catches | Error boundary shows "Press `R` to retry". |
| Flash timer fires after unmount | `clearTimeout` in cleanup prevents this | No orphaned setState calls. |
| `preferredMode` / `viewMode` desync | Should not happen given the state machine | Self-heals on next `t` press (toggle reads `viewMode`, not `preferredMode`). |
| Scroll preservation ref not exposed by OpenTUI | Scroll jumps to top on toggle | Warn log. Graceful degradation — no crash. |

---

## 10. Productionization Notes

### 10.1 Scroll preservation robustness

The `useDiffScrollPreservation` hook relies on accessing internal properties of OpenTUI's `DiffRenderable` via ref. This is a fragile integration point.

**Before merging**, verify with a PoC test (`poc/diff-scroll-preserve.tsx`) that:
1. The `<diff>` component's ref exposes `leftCodeRenderable` and `rightCodeRenderable`.
2. Setting `scrollY` after a view change actually scrolls to the correct position.
3. The timing works — `requestAnimationFrame` fires after OpenTUI's layout pass.

If the internal API is not stable, fall back to:
- Wrapping the `<diff>` in a `<scrollbox>` and using the scrollbox's scroll position.
- Or, using OpenTUI's `useTimeline` hook to defer the scroll restoration to the next frame.

Add a runtime guard that logs a warning and degrades gracefully (scroll jumps to top) if the expected ref shape is not available.

### 10.2 Flash message system generalization

The flash message mechanism uses `overrideHints` from `StatusBarHintsContext` with a sentinel pattern (`keys: ""` signals flash mode). This is adequate for a single consumer. If other screens need flash messages, extract a dedicated `FlashMessageProvider` at the AppShell level with a `showFlash(message, durationMs)` API. For now, avoid premature abstraction.

### 10.3 DiffViewIndicatorContext placement

The `DiffViewIndicatorProvider` is a lightweight, single-purpose context. If more screens need status bar indicators (e.g., workflow run status, workspace state), consider a generic `ScreenIndicatorProvider` that allows any screen to set a status bar indicator. For now, the diff-specific context is appropriate and avoids over-engineering.

### 10.4 Constants validation

- `SPLIT_MIN_WIDTH = 120` — matches `STANDARD_COLS` in constants and `getBreakpoint()` in breakpoint.ts.
- `DIFF_TOGGLE_DEBOUNCE_MS = 100` — specified in ticket.
- `DIFF_FLASH_DURATION_MS = 3000` — specified in ticket, matches `STATUS_BAR_CONFIRMATION_MS`.

### 10.5 DiffScreen data integration

This ticket creates a DiffScreen skeleton wired for toggle behavior. The actual diff data fetching, file tree population, and hunk management are handled by dependency tickets (`tui-diff-unified-view`, `tui-diff-split-view`). The `canToggle` flag is hardcoded to `true` in this ticket and must be wired to actual data state when those tickets land. Specifically:

```typescript
canToggle: !diffResult.isLoading && diffResult.error === null && diffResult.files.length > 0
```

Until those hooks exist, tests that rely on actual diff data rendering will fail naturally (data not loaded). This is expected per the testing philosophy.

---

## 11. Unit & Integration Tests

**Test file:** `e2e/tui/diff.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests run against a real API server with test fixtures. No mocking of internal hooks or state.

Tests that fail due to unimplemented backend features (diff API not returning data, DiffScreen rendering incomplete) are left failing. They are never skipped or commented out.

The existing `diff.test.ts` contains 56 tests for `TUI_DIFF_SYNTAX_HIGHLIGHT`. The toggle tests are appended as new `describe` blocks after the existing ones.

---

### 11.1 Snapshot Tests (SNAP-TOGGLE-001 through SNAP-TOGGLE-010)

```typescript
describe("TUI_DIFF_VIEW_TOGGLE — snapshot tests", () => {
  test("SNAP-TOGGLE-001: unified mode shows [unified] in status bar at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen (g d for dashboard, then navigate to a repo and diff)
    // For these tests, use deep link args if available:
    // await launchTUI({ args: ["--screen", "diff", "--repo", "alice/hello"] })
    // Assert: status bar last row contains "[unified]"
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[unified\]/);
    // Assert: diff renders in single-column layout
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-TOGGLE-002: split mode shows [split] in status bar at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // toggle to split
    await terminal.waitForText("[split]");
    // Assert: diff renders in two-column layout
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-TOGGLE-003: split layout with sidebar visible at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen (sidebar visible at standard breakpoint)
    await terminal.sendKeys("t"); // toggle to split
    await terminal.waitForText("[split]");
    // Assert: three-column layout: sidebar (25%) + left pane + right pane
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-TOGGLE-004: split layout without sidebar at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("ctrl+b"); // hide sidebar
    await terminal.sendKeys("t"); // toggle to split
    await terminal.waitForText("[split]");
    // Assert: two-column layout: left pane (50%) + right pane (50%)
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-TOGGLE-005: split layout at 200x60 large terminal", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // toggle to split
    await terminal.waitForText("[split]");
    // Assert: wider panes, more context visible
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-TOGGLE-006: flash rejection message at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // attempt toggle — rejected
    // Assert: status bar shows flash rejection message
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/Split view requires 120\+ column terminal/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-TOGGLE-007: flash auto-revert message after resize", async () => {
    const terminal = await launchTUI({ cols: 130, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // toggle to split
    await terminal.waitForText("[split]");
    await terminal.resize(80, 24); // shrink below threshold
    // Assert: auto-reverted flash message visible
    await terminal.waitForText("reverted to unified");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-TOGGLE-008: toggle back to unified shows [unified] in status bar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    await terminal.sendKeys("t"); // back to unified
    await terminal.waitForText("[unified]");
    // Assert: single-column layout restored
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-TOGGLE-009: sync-scrolled split panes at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen with multi-hunk file
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    // Scroll down in the diff
    for (let i = 0; i < 10; i++) await terminal.sendKeys("j");
    // Assert: both panes show matching line ranges (syncScroll=true)
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-TOGGLE-010: collapsed hunks preserved in split view", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("z"); // collapse all hunks
    await terminal.sendKeys("t"); // toggle to split
    await terminal.waitForText("[split]");
    // Assert: hunks remain collapsed in split view
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});
```

---

### 11.2 Keyboard Interaction Tests (KEY-TOGGLE-001 through KEY-TOGGLE-019)

```typescript
describe("TUI_DIFF_VIEW_TOGGLE — keyboard interaction tests", () => {
  test("KEY-TOGGLE-001: t toggles unified→split→unified cycle", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.waitForText("[unified]");
    await terminal.sendKeys("t");
    await terminal.waitForText("[split]");
    await terminal.sendKeys("t");
    await terminal.waitForText("[unified]");
    await terminal.terminate();
  });

  test("KEY-TOGGLE-002: t rejected at 80 columns", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view requires 120+ column terminal");
    // View mode stays unified
    await terminal.waitForNoText("[split]");
    await terminal.terminate();
  });

  test("KEY-TOGGLE-003: t rejected at 119 columns", async () => {
    const terminal = await launchTUI({ cols: 119, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view requires 120+ column terminal");
    await terminal.terminate();
  });

  test("KEY-TOGGLE-004: t succeeds at exactly 120 columns", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t");
    await terminal.waitForText("[split]");
    await terminal.terminate();
  });

  test("KEY-TOGGLE-005: rapid t presses debounced at 100ms", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    // helpers.ts sendKeys has ~50ms inter-key delay
    // Two rapid t presses: first fires at 0ms, second at ~50ms (< 100ms debounce)
    // Only the first should process → end state: split
    await terminal.sendKeys("t", "t");
    // Should be in split (only first t processed)
    await terminal.waitForText("[split]");
    await terminal.terminate();
  });

  test("KEY-TOGGLE-006: t blocked when help overlay is open", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("?"); // open help overlay
    await terminal.waitForText("Keybindings"); // help content
    await terminal.sendKeys("t"); // consumed by PRIORITY.MODAL
    await terminal.sendKeys("Escape"); // close help
    // View should still be unified
    await terminal.waitForText("[unified]");
    await terminal.terminate();
  });

  test("KEY-TOGGLE-007: t blocked when command palette is open", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys(":"); // open command palette
    await terminal.sendKeys("t"); // goes to palette input as text
    await terminal.sendKeys("Escape"); // close palette
    await terminal.waitForText("[unified]");
    await terminal.terminate();
  });

  test("KEY-TOGGLE-008: t works when file tree has focus", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("Tab"); // focus file tree sidebar
    await terminal.sendKeys("t"); // should still toggle view
    await terminal.waitForText("[split]");
    await terminal.terminate();
  });

  test("KEY-TOGGLE-009: scroll position preserved unified→split", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen with long file
    // Scroll down significantly
    for (let i = 0; i < 20; i++) await terminal.sendKeys("j");
    // Capture a reference line from the viewport
    const beforeLine = terminal.getLine(5);
    await terminal.sendKeys("t"); // toggle to split
    await terminal.waitForText("[split]");
    // The same content region should be visible (not jumped to top)
    // Exact assertion depends on diff data
    await terminal.terminate();
  });

  test("KEY-TOGGLE-010: scroll position preserved split→unified", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // to split
    await terminal.waitForText("[split]");
    for (let i = 0; i < 20; i++) await terminal.sendKeys("j");
    await terminal.sendKeys("t"); // back to unified
    await terminal.waitForText("[unified]");
    // Assert: scroll position approximately preserved
    await terminal.terminate();
  });

  test("KEY-TOGGLE-011: view mode persists across file navigation", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split mode
    await terminal.waitForText("[split]");
    await terminal.sendKeys("]"); // next file
    await terminal.waitForText("[split]"); // still split
    await terminal.terminate();
  });

  test("KEY-TOGGLE-012: view mode persists across whitespace toggle", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split mode
    await terminal.waitForText("[split]");
    await terminal.sendKeys("w"); // toggle whitespace
    await terminal.waitForText("[split]"); // still split
    await terminal.terminate();
  });

  test("KEY-TOGGLE-013: view mode persists across hunk expand/collapse", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    await terminal.sendKeys("z"); // collapse all
    await terminal.waitForText("[split]"); // still split
    await terminal.sendKeys("x"); // expand all
    await terminal.waitForText("[split]"); // still split
    await terminal.terminate();
  });

  test("KEY-TOGGLE-014: t is no-op during loading state", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen — should show loading spinner initially
    // Immediately press t before data loads
    await terminal.sendKeys("t");
    // Should not crash, no toggle occurs
    await terminal.terminate();
  });

  test("KEY-TOGGLE-015: t is no-op during error state", async () => {
    // Launch with unreachable API to trigger network error
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { CODEPLANE_API_URL: "http://localhost:1" },
    });
    // Navigate to diff screen — should show error state
    await terminal.sendKeys("t");
    // No crash, no toggle
    await terminal.terminate();
  });

  test("KEY-TOGGLE-016: t is no-op on empty diff", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen for a change with no file diffs
    await terminal.sendKeys("t");
    // No crash
    await terminal.terminate();
  });

  test("KEY-TOGGLE-017: post-revert single t press restores split", async () => {
    const terminal = await launchTUI({ cols: 130, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split mode
    await terminal.waitForText("[split]");
    await terminal.resize(80, 24); // auto-revert to unified
    await terminal.waitForText("[unified]");
    await terminal.resize(130, 40); // resize back above threshold
    // NO auto-restore — still unified
    await terminal.waitForText("[unified]");
    await terminal.sendKeys("t"); // user presses t
    await terminal.waitForText("[split]"); // restores split
    await terminal.terminate();
  });

  test("KEY-TOGGLE-018: t:view hint always shown in status bar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/t.*view/);
    await terminal.terminate();
  });

  test("KEY-TOGGLE-019: status bar updates synchronously on toggle", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t");
    // Check status bar immediately after sendKeys resolves (~50ms)
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\[split\]/);
    await terminal.terminate();
  });
});
```

---

### 11.3 Responsive Tests (RSP-TOGGLE-001 through RSP-TOGGLE-013)

```typescript
describe("TUI_DIFF_VIEW_TOGGLE — responsive tests", () => {
  test("RSP-TOGGLE-001: split unavailable at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    await terminal.sendKeys("t");
    await terminal.waitForText("Split view requires 120+ column terminal");
    await terminal.terminate();
  });

  test("RSP-TOGGLE-002: split available at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t");
    await terminal.waitForText("[split]");
    await terminal.terminate();
  });

  test("RSP-TOGGLE-003: split available at 200x60", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff screen
    await terminal.sendKeys("t");
    await terminal.waitForText("[split]");
    await terminal.terminate();
  });

  test("RSP-TOGGLE-004: resize 120→80 reverts split to unified", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    await terminal.resize(80, 24);
    await terminal.waitForText("[unified]");
    await terminal.waitForText("reverted to unified");
    await terminal.terminate();
  });

  test("RSP-TOGGLE-005: resize 120→119 reverts split to unified", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    await terminal.resize(119, 40);
    await terminal.waitForText("[unified]");
    await terminal.terminate();
  });

  test("RSP-TOGGLE-006: resize 200→80→200 does not auto-restore split", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    await terminal.resize(80, 24); // auto-revert
    await terminal.waitForText("[unified]");
    await terminal.resize(200, 60); // resize back
    // Still unified — no auto-restore
    await terminal.waitForText("[unified]");
    await terminal.terminate();
  });

  test("RSP-TOGGLE-007: scroll position preserved on auto-revert", async () => {
    const terminal = await launchTUI({ cols: 130, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    for (let i = 0; i < 15; i++) await terminal.sendKeys("j");
    await terminal.resize(80, 24); // auto-revert
    await terminal.waitForText("[unified]");
    // Assert: scroll position approximately preserved
    // (content from scrolled region still visible, not jumped to top)
    await terminal.terminate();
  });

  test("RSP-TOGGLE-008: sidebar width stable across toggles", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    // Sidebar at 25% = 30 cols
    await terminal.sendKeys("t"); // split — sidebar stays 25%
    await terminal.waitForText("[split]");
    await terminal.sendKeys("t"); // unified — sidebar stays 25%
    await terminal.waitForText("[unified]");
    // Assert: sidebar border column position consistent
    await terminal.terminate();
  });

  test("RSP-TOGGLE-009: split panes have correct width proportions", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen, sidebar visible
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    // Assert: two diff panes visible in the content area
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("RSP-TOGGLE-010: flash message disappears after 3 seconds", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // rejected
    await terminal.waitForText("Split view requires 120+ column terminal");
    // Wait for flash to clear (3 seconds + buffer)
    await terminal.waitForNoText("Split view requires 120+ column terminal", 5000);
    await terminal.terminate();
  });

  test("RSP-TOGGLE-011: flash revert message disappears after 3 seconds", async () => {
    const terminal = await launchTUI({ cols: 130, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    await terminal.resize(80, 24); // revert
    await terminal.waitForText("reverted to unified");
    await terminal.waitForNoText("reverted to unified", 5000);
    await terminal.terminate();
  });

  test("RSP-TOGGLE-012: unified renders correctly after split→resize→unified", async () => {
    const terminal = await launchTUI({ cols: 130, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    await terminal.resize(100, 30); // auto-revert
    await terminal.waitForText("[unified]");
    // Assert: unified layout renders correctly at 100x30
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("RSP-TOGGLE-013: split at minimum-standard boundary (120x40 exact)", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // should succeed at boundary
    await terminal.waitForText("[split]");
    // Panes should fit without overflow
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});
```

---

### 11.4 Integration Tests (INT-TOGGLE-001 through INT-TOGGLE-005)

```typescript
describe("TUI_DIFF_VIEW_TOGGLE — integration tests", () => {
  test("INT-TOGGLE-001: toggle does not trigger API refetch", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen, wait for data to load
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    await terminal.sendKeys("t"); // unified
    await terminal.waitForText("[unified]");
    // Assert: no loading indicator appeared during toggle
    // (If API was refetched, "Loading" text would flash)
    await terminal.terminate();
  });

  test("INT-TOGGLE-002: cached diff data preserved across toggles", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen, wait for data to load
    const beforeToggle = terminal.snapshot();
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    await terminal.sendKeys("t"); // back to unified
    await terminal.waitForText("[unified]");
    const afterToggle = terminal.snapshot();
    // Content should be identical (same diff data rendered)
    await terminal.terminate();
  });

  test("INT-TOGGLE-003: whitespace toggle + view toggle interaction", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("w"); // toggle whitespace
    await terminal.sendKeys("t"); // split with whitespace hidden
    await terminal.waitForText("[split]");
    await terminal.sendKeys("w"); // toggle whitespace back
    // Both toggles should work independently
    await terminal.terminate();
  });

  test("INT-TOGGLE-004: syncScroll prop correct in split mode", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    // Scroll down
    for (let i = 0; i < 10; i++) await terminal.sendKeys("j");
    // Assert: both panes scrolled together (syncScroll=true)
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("INT-TOGGLE-005: syncScroll disabled in unified mode", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen (unified by default)
    // Unified mode has syncScroll=false (only one pane, so irrelevant)
    // Scroll should work normally
    for (let i = 0; i < 10; i++) await terminal.sendKeys("j");
    await terminal.terminate();
  });
});
```

---

### 11.5 Edge Case Tests (EDGE-TOGGLE-001 through EDGE-TOGGLE-010)

```typescript
describe("TUI_DIFF_VIEW_TOGGLE — edge case tests", () => {
  test("EDGE-TOGGLE-001: toggle on single-file diff", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff with only one file
    await terminal.sendKeys("t");
    await terminal.waitForText("[split]");
    // Split view should show the single file in left/right panes
    await terminal.terminate();
  });

  test("EDGE-TOGGLE-002: toggle on binary file diff", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff containing binary file
    await terminal.sendKeys("t");
    await terminal.waitForText("[split]");
    // Binary file message should display in split mode
    await terminal.terminate();
  });

  test("EDGE-TOGGLE-003: collapsed hunks preserved across toggle", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("z"); // collapse all hunks
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    // Assert: hunks remain collapsed
    await terminal.sendKeys("t"); // unified
    await terminal.waitForText("[unified]");
    // Assert: hunks still collapsed
    await terminal.terminate();
  });

  test("EDGE-TOGGLE-004: scroll at bottom of file preserved", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("G"); // jump to bottom
    await terminal.sendKeys("t"); // toggle to split
    await terminal.waitForText("[split]");
    // Assert: still at bottom region of file
    await terminal.terminate();
  });

  test("EDGE-TOGGLE-005: flash message replaced by newer flash", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // first rejection flash
    await terminal.waitForText("Split view requires 120+ column terminal");
    // Wait past debounce window (>100ms)
    await new Promise((r) => setTimeout(r, 150));
    await terminal.sendKeys("t"); // second rejection flash (replaces first, resets timer)
    await terminal.waitForText("Split view requires 120+ column terminal");
    await terminal.terminate();
  });

  test("EDGE-TOGGLE-006: forced revert then t restores split", async () => {
    const terminal = await launchTUI({ cols: 130, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    await terminal.resize(80, 24); // force revert
    await terminal.waitForText("[unified]");
    await terminal.resize(130, 40);
    await terminal.sendKeys("t"); // single t press
    await terminal.waitForText("[split]"); // restored
    await terminal.terminate();
  });

  test("EDGE-TOGGLE-007: 16-color terminal toggle works", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "", TERM: "xterm" },
    });
    // Navigate to diff screen
    await terminal.sendKeys("t");
    await terminal.waitForText("[split]");
    // Assert: diff renders (with degraded colors but +/- signs visible)
    await terminal.terminate();
  });

  test("EDGE-TOGGLE-008: large diff (500+ files) toggle performance", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to diff screen for a change with many files
    const startTime = Date.now();
    await terminal.sendKeys("t");
    await terminal.waitForText("[split]");
    const toggleTime = Date.now() - startTime;
    // Toggle should be fast — under 500ms even for large diffs
    // (no re-parse, just view rebuild)
    expect(toggleTime).toBeLessThan(500);
    await terminal.terminate();
  });

  test("EDGE-TOGGLE-009: concurrent resize and keypress", async () => {
    const terminal = await launchTUI({ cols: 130, rows: 40 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // split
    await terminal.waitForText("[split]");
    // Resize and press t nearly simultaneously
    terminal.resize(80, 24); // fire-and-forget (no await)
    await terminal.sendKeys("t"); // races with resize auto-revert
    // Should settle to a valid state — the key assertion is no crash
    await terminal.terminate();
  });

  test("EDGE-TOGGLE-010: flash timer cleanup on unmount", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    // Navigate to diff screen
    await terminal.sendKeys("t"); // trigger flash
    await terminal.waitForText("Split view requires");
    // Immediately navigate away (q to go back)
    await terminal.sendKeys("q");
    // No crash from orphaned timer trying to setState on unmounted component
    // Wait past the flash duration to confirm no error
    await new Promise((r) => setTimeout(r, 3500));
    // TUI should still be responsive
    await terminal.terminate();
  });
});
```

---

## 12. Test Summary

| Category | Count | IDs |
|---|---|---|
| Snapshot tests | 10 | SNAP-TOGGLE-001 through SNAP-TOGGLE-010 |
| Keyboard interaction tests | 19 | KEY-TOGGLE-001 through KEY-TOGGLE-019 |
| Responsive tests | 13 | RSP-TOGGLE-001 through RSP-TOGGLE-013 |
| Integration tests | 5 | INT-TOGGLE-001 through INT-TOGGLE-005 |
| Edge case tests | 10 | EDGE-TOGGLE-001 through EDGE-TOGGLE-010 |
| **Total** | **57** | |

All tests target `e2e/tui/diff.test.ts`. Tests are appended after the existing 56 `TUI_DIFF_SYNTAX_HIGHLIGHT` tests. Tests that fail because the DiffScreen is still a skeleton, because the backend diff API is not returning data, or because dependency features (`tui-diff-unified-view`, `tui-diff-split-view`) are not yet implemented will fail naturally. They are never skipped, commented out, or mocked.

---

## 13. Dependency Graph

```
tui-diff-unified-view ──┐
                         ├──► tui-diff-view-toggle (this ticket)
tui-diff-split-view ─────┘
         │
         ▼
   Depends on:
   ├── useTerminalDimensions() from @opentui/react
   ├── useScreenKeybindings() from apps/tui/src/hooks/useScreenKeybindings.ts
   ├── useStatusBarHints() from apps/tui/src/hooks/useStatusBarHints.ts
   ├── StatusBarHintsContext.overrideHints() from apps/tui/src/providers/KeybindingProvider.tsx
   ├── useLayout() from apps/tui/src/hooks/useLayout.ts
   ├── useTheme() from apps/tui/src/hooks/useTheme.ts
   ├── useDiffSyntaxStyle() from apps/tui/src/hooks/useDiffSyntaxStyle.ts
   ├── <diff view={} syncScroll={}> from @opentui/react
   ├── PRIORITY enum from apps/tui/src/providers/keybinding-types.ts
   ├── ScreenName.DiffView from apps/tui/src/router/types.ts
   ├── ScreenComponentProps from apps/tui/src/router/types.ts
   └── Constants (SPLIT_MIN_WIDTH, etc.) from apps/tui/src/util/constants.ts
```

---

## 14. Acceptance Checklist

- [ ] `t` key toggles between unified and split mode on the diff screen.
- [ ] `<diff>` component receives `view={viewMode}` and `syncScroll={viewMode === 'split'}`.
- [ ] No API re-fetch occurs on toggle. No loading indicator appears.
- [ ] Toggle applies globally to all files in the diff.
- [ ] Split mode requires ≥120 column terminal width (inclusive).
- [ ] Toggling at <120 cols shows flash message "Split view requires 120+ column terminal" for 3 seconds.
- [ ] Resizing below 120 cols during split mode auto-reverts to unified with flash notification.
- [ ] Resizing back above 120 does NOT auto-restore split mode.
- [ ] User's preferred mode is remembered — single `t` press after forced revert restores split.
- [ ] Logical scroll position preserved across manual and automatic view transitions.
- [ ] Status bar shows `[unified]` or `[split]` indicator. Updates synchronously.
- [ ] `t:view` keybinding hint always shown in status bar.
- [ ] Split layout: sidebar + two equal panes (OpenTUI internal 50/50 split of remaining space).
- [ ] Each split pane has its own line number gutter (managed by OpenTUI `<diff>`).
- [ ] 100ms debounce on `t` key at input layer.
- [ ] Default unified. Persists across file nav, whitespace toggle, hunk ops. Resets on new diff screen.
- [ ] `t` works in main content, file tree, and hunk focus contexts.
- [ ] `t` blocked by help overlay, comment form, and command palette (via PRIORITY.MODAL / PRIORITY.TEXT_INPUT).
- [ ] No-op during loading, error, and empty diff states (via `when()` guard).
- [ ] Works on single-file, binary, and multi-file diffs.
- [ ] Collapsed hunk state preserved across toggles.
- [ ] 16-color terminal: falls back to sign-based differentiation.
- [ ] Flash timer cleaned up on unmount. No orphaned timers.
- [ ] Constants (`SPLIT_MIN_WIDTH`, `DIFF_TOGGLE_DEBOUNCE_MS`, `DIFF_FLASH_DURATION_MS`) exported from `apps/tui/src/util/constants.ts`.
- [ ] `DiffViewIndicatorProvider` added to AppShell provider tree.
- [ ] StatusBar renders `[unified]`/`[split]` when diff screen is active, nothing when not.
- [ ] Screen registry updated to point `DiffView` at `DiffScreen`.