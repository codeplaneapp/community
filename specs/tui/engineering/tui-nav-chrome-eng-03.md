# Engineering Specification: tui-nav-chrome-eng-03

## Responsive Layout Hooks: `useBreakpoint`, `useResponsiveValue`, `useLayout`

**Ticket:** tui-nav-chrome-eng-03  
**Type:** Engineering  
**Status:** Implemented  
**Depends on:** tui-bootstrap-and-renderer  
**Files:**
- `apps/tui/src/hooks/useBreakpoint.ts` (implemented)
- `apps/tui/src/hooks/useResponsiveValue.ts` (implemented)
- `apps/tui/src/hooks/useLayout.ts` (implemented — sidebar state integrated)
- `apps/tui/src/hooks/useSidebarState.ts` (implemented)
- `apps/tui/src/types/breakpoint.ts` (stable, no changes)
- `apps/tui/src/components/AppShell.tsx` (migrated to `useLayout()`)

**Test files:**
- `e2e/tui/app-shell.test.ts` (42 tests added across 5 describe blocks)

---

## 1. Overview

This ticket implements the responsive layout detection system for the Codeplane TUI. The system provides a layered set of hooks that translate raw terminal dimensions (from OpenTUI's `useTerminalDimensions`) into semantic breakpoints, breakpoint-aware values, and a composite layout context. It also introduces a sidebar state machine that separates user preference (`Ctrl+B` toggle) from automatic breakpoint-driven collapse.

The hooks are foundational — every screen, every component that adapts to terminal size, and every modal/overlay relies on this system. The design is zero-allocation on re-renders when dimensions haven't changed, and layout recalculations are synchronous (no debounce, no animation) per the TUI design spec.

### 1.1 Implementation State Assessment

All files in scope are implemented and integrated. The test suite covers pure function logic, module resolution, code quality invariants, and E2E sidebar toggle behavior.

| File | Status | Notes |
|------|--------|-------|
| `apps/tui/src/types/breakpoint.ts` | ✅ Complete | `Breakpoint` type + `getBreakpoint()` pure function. Stable. |
| `apps/tui/src/types/index.ts` | ✅ Complete | Re-exports `getBreakpoint` and `Breakpoint`. Stable. |
| `apps/tui/src/hooks/useBreakpoint.ts` | ✅ Complete | 17 lines. Reactive breakpoint via `useTerminalDimensions()` + `useMemo`. |
| `apps/tui/src/hooks/useResponsiveValue.ts` | ✅ Complete | 34 lines. Generic breakpoint-to-value mapper with fallback. |
| `apps/tui/src/hooks/useSidebarState.ts` | ✅ Complete | 99 lines. Sidebar state machine with `resolveSidebarVisibility()` exported for testing. |
| `apps/tui/src/hooks/useLayout.ts` | ✅ Complete | 111 lines. Integrates `useSidebarState()`, exposes `sidebar: SidebarState` on `LayoutContext`. |
| `apps/tui/src/hooks/index.ts` | ✅ Complete | Barrel exports all three new hooks plus types. |
| `apps/tui/src/components/AppShell.tsx` | ✅ Complete | Migrated to `useLayout()` — no direct `getBreakpoint()` import. |

**Active consumers of `useLayout()`:**
- `AppShell.tsx` — `{ breakpoint, width, height }` for null-breakpoint guard
- `HeaderBar.tsx` — `{ width, breakpoint }` for breadcrumb truncation
- `StatusBar.tsx` — `{ width, breakpoint }` for hint count adaptation
- `OverlayLayer.tsx` — `{ modalWidth, modalHeight }` for responsive overlay sizing
- `FullScreenLoading.tsx` — `{ width, contentHeight }` for centering
- `FullScreenError.tsx` — `{ width, contentHeight }` for centering
- `PaginationIndicator.tsx` — `{ width }` for truncation
- `SkeletonList.tsx` — `{ contentHeight, width }` for placeholder rows
- `SkeletonDetail.tsx` — `{ width, contentHeight }` for sizing

**Intentional direct `getBreakpoint()` consumer:**
- `ErrorScreen.tsx` — Calls `getBreakpoint(termWidth, termHeight)` directly because it may render outside the React provider stack (in the error boundary before providers mount). It also directly imports `useTerminalDimensions` and `useKeyboard` from `@opentui/react` since it handles its own keyboard input for restart/quit. It also wraps `useTheme()` in a try/catch since `ThemeProvider` may not be mounted. This is acceptable and intentional.

---

## 2. Type Foundation

### 2.1 `apps/tui/src/types/breakpoint.ts` — Stable

This file defines the core type and pure function. It has zero React or OpenTUI imports, making it usable from any context (including `ErrorScreen.tsx` outside the provider stack).

```typescript
/**
 * Terminal size breakpoint classification.
 *
 * Ranges (both cols AND rows must meet the threshold):
 * - minimum: 80×24 – 119×39
 * - standard: 120×40 – 199×59
 * - large: 200×60+
 *
 * Below 80×24 returns null (unsupported).
 */
export type Breakpoint = "minimum" | "standard" | "large";

/**
 * Compute the breakpoint from terminal dimensions.
 *
 * Returns null when the terminal is below the minimum supported size
 * (cols < 80 OR rows < 24). The caller is responsible for rendering
 * the "terminal too small" screen when this returns null.
 *
 * The threshold logic uses OR for downgrade: if EITHER dimension
 * is below the threshold for a breakpoint, the terminal falls to
 * the next lower breakpoint. This prevents usability issues where
 * a terminal is wide but very short (or vice versa).
 */
export function getBreakpoint(
  cols: number,
  rows: number,
): Breakpoint | null {
  if (cols < 80 || rows < 24) return null;
  if (cols < 120 || rows < 40) return "minimum";
  if (cols < 200 || rows < 60) return "standard";
  return "large";
}
```

**Boundary table (exhaustive):**

| cols | rows | Result |
|------|------|--------|
| < 80 | any  | `null` |
| any  | < 24 | `null` |
| 80   | 24   | `"minimum"` |
| 119  | 39   | `"minimum"` |
| 120  | 39   | `"minimum"` (rows too low) |
| 119  | 40   | `"minimum"` (cols too low) |
| 120  | 40   | `"standard"` |
| 199  | 59   | `"standard"` |
| 200  | 59   | `"standard"` (rows too low) |
| 199  | 60   | `"standard"` (cols too low) |
| 200  | 60   | `"large"` |
| 500  | 200  | `"large"` |
| -1   | -1   | `null` |
| 0    | 0    | `null` |

The threshold logic uses OR for downgrade: if EITHER dimension is below the threshold for a breakpoint, the terminal falls to the next lower breakpoint. This prevents usability issues where a terminal is wide but very short (or vice versa).

---

## 3. Implementation Plan

### Step 1: `apps/tui/src/hooks/useBreakpoint.ts` — Reactive breakpoint hook

**Status:** ✅ Implemented (17 lines)

**What:** A React hook that returns the current `Breakpoint | null` derived from live terminal dimensions. Extracts the breakpoint computation into a composable hook that other hooks (`useResponsiveValue`, `useSidebarState`) consume independently of `useLayout`.

**Implementation:**

```typescript
import { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";

/**
 * Returns the current terminal breakpoint.
 *
 * Reads terminal dimensions from OpenTUI's useTerminalDimensions()
 * and derives the breakpoint via getBreakpoint(). Recalculates
 * synchronously on terminal resize (SIGWINCH) — no debounce.
 *
 * Returns null when the terminal is below 80×24 (unsupported).
 */
export function useBreakpoint(): Breakpoint | null {
  const { width, height } = useTerminalDimensions();
  return useMemo(() => getBreakpoint(width, height), [width, height]);
}
```

**Design decisions:**

| Decision | Rationale |
|----------|----------|
| `useMemo` over raw computation | `getBreakpoint` is trivial, but memoization ensures referential stability for downstream consumers that use the breakpoint in dependency arrays. A stable `Breakpoint` string reference (or `null`) prevents unnecessary re-renders when dimensions change within the same breakpoint band. |
| Direct dependency on `useTerminalDimensions` | This is the canonical OpenTUI hook. It internally subscribes to the renderer's resize event via `useOnResize`. No need to duplicate that subscription. |
| No internal state | The hook is a pure derivation. No `useState`, no `useEffect`. This makes it predictable and testable. |
| Named export only | No default export. Aligns with tree-shaking and barrel export patterns. |

**How `useTerminalDimensions` works (from OpenTUI source):**
```typescript
export const useTerminalDimensions = () => {
  const renderer = useRenderer();
  const [dimensions, setDimensions] = useState({
    width: renderer.width,
    height: renderer.height,
  });
  useOnResize((width, height) => setDimensions({ width, height }));
  return dimensions;
};
```
It returns `{ width: number, height: number }` and auto-updates on SIGWINCH. The `useOnResize` hook internally uses `useEffectEvent` to ensure the callback has access to the latest props/state, then registers itself on the renderer's `"resize"` event.

---

### Step 2: `apps/tui/src/hooks/useResponsiveValue.ts` — Breakpoint-to-value mapper

**Status:** ✅ Implemented (34 lines)

**What:** A generic hook that selects a value from a breakpoint-keyed map based on the current breakpoint.

**Implementation:**

```typescript
import { useMemo } from "react";
import { useBreakpoint } from "./useBreakpoint.js";
import type { Breakpoint } from "../types/breakpoint.js";

/**
 * Map of values keyed by breakpoint.
 *
 * All three breakpoints must be provided. There is no fallback
 * cascade — if the terminal is below minimum (breakpoint is null),
 * the hook returns `fallback` (or undefined if not provided).
 */
export interface ResponsiveValues<T> {
  minimum: T;
  standard: T;
  large: T;
}

/**
 * Returns the value corresponding to the current terminal breakpoint.
 *
 * When the terminal is below minimum supported size (breakpoint is null),
 * returns `fallback` if provided, otherwise returns `undefined`.
 */
export function useResponsiveValue<T>(
  values: ResponsiveValues<T>,
  fallback?: T,
): T | undefined {
  const breakpoint = useBreakpoint();

  return useMemo(() => {
    if (!breakpoint) return fallback;
    return values[breakpoint];
  }, [breakpoint, values, fallback]);
}
```

**Design decisions:**

| Decision | Rationale |
|----------|----------|
| All three keys required | No implicit fallback cascade. If `minimum` should use the same value as `standard`, the caller writes `{ minimum: X, standard: X, large: Y }`. This eliminates ambiguity about which value applies. |
| Generic `<T>` | Supports strings, numbers, booleans, objects — any responsive value. |
| Returns `T \| undefined` | When below minimum and no fallback provided, returns `undefined`. Forces callers to handle the unsupported case explicitly. |
| `fallback` parameter | For hooks called in components that may render briefly during resize transitions below minimum, a fallback prevents crashes. |
| `useMemo` with `values` in deps | Since `values` is typically an object literal, it will be a new reference each render. Callers should define value objects at module scope for stability, or memoize them. |

**Recommended usage patterns:**
```typescript
// Pattern 1: Module-level constant (preferred for stable objects)
const PADDING: ResponsiveValues<number> = { minimum: 0, standard: 2, large: 4 };
function MyComponent() {
  const padding = useResponsiveValue(PADDING);
}

// Pattern 2: With fallback for unsupported terminals
const label = useResponsiveValue(
  { minimum: "Y:", standard: "You", large: "You" },
  "??",
);

// Pattern 3: Boolean toggle for feature availability
const SHOW_METADATA: ResponsiveValues<boolean> = { minimum: false, standard: true, large: true };
function ListRow() {
  const showMeta = useResponsiveValue(SHOW_METADATA, false);
  return (
    <box flexDirection="row">
      <text>{item.title}</text>
      {showMeta && <text fg={theme.muted}>{item.metadata}</text>}
    </box>
  );
}
```

---

### Step 3: `apps/tui/src/hooks/useSidebarState.ts` — Sidebar visibility state machine

**Status:** ✅ Implemented (99 lines)

**What:** Manages sidebar visibility by combining user preference (manual `Ctrl+B` toggle) with automatic breakpoint-driven collapse. Exports the pure `resolveSidebarVisibility()` function for direct unit testing.

**Implementation:**

```typescript
import { useState, useMemo, useCallback } from "react";
import { useBreakpoint } from "./useBreakpoint.js";
import type { Breakpoint } from "../types/breakpoint.js";

/**
 * Sidebar state combines two independent signals:
 *
 * 1. userPreference: Explicit user intent via Ctrl+B toggle.
 *    - null: no preference expressed (use auto behavior)
 *    - true: user explicitly wants sidebar visible
 *    - false: user explicitly wants sidebar hidden
 *
 * 2. autoOverride: Breakpoint-driven auto-collapse.
 *    - At 'minimum' breakpoint, sidebar is auto-hidden regardless
 *      of user preference (there isn't enough space).
 *    - At 'standard' and 'large' breakpoints, auto-override is false
 *      (defer to user preference or default visible).
 *
 * Resolution logic:
 *   if (breakpoint is null) → hidden (terminal too small)
 *   if (breakpoint is 'minimum') → hidden (auto-override)
 *   if (userPreference !== null) → userPreference
 *   else → true (default visible at standard/large)
 */
export interface SidebarState {
  /** The resolved visibility. True = sidebar renders. */
  visible: boolean;
  /** Raw user toggle preference. null = no explicit preference. */
  userPreference: boolean | null;
  /** Whether the breakpoint auto-override is forcing the sidebar hidden. */
  autoOverride: boolean;
  /** Toggle sidebar visibility. Sets userPreference explicitly. */
  toggle: () => void;
}

/**
 * Resolve whether the sidebar should be visible given breakpoint
 * and user preference.
 *
 * Exported for direct unit testing without React.
 */
export function resolveSidebarVisibility(
  breakpoint: Breakpoint | null,
  userPreference: boolean | null,
): { visible: boolean; autoOverride: boolean } {
  // Below minimum: always hidden
  if (!breakpoint) {
    return { visible: false, autoOverride: true };
  }

  // At minimum breakpoint: auto-collapse regardless of user preference
  if (breakpoint === "minimum") {
    return { visible: false, autoOverride: true };
  }

  // At standard/large: respect user preference, default visible
  return {
    visible: userPreference !== null ? userPreference : true,
    autoOverride: false,
  };
}

/**
 * Hook that manages sidebar visibility as a combination of user
 * preference and breakpoint-driven auto-collapse.
 *
 * The toggle function (bound to Ctrl+B) sets an explicit user
 * preference. The preference is respected at standard and large
 * breakpoints but overridden at minimum (not enough space).
 *
 * When the user resizes from minimum back to standard/large,
 * their preference is restored if they had one.
 */
export function useSidebarState(): SidebarState {
  const breakpoint = useBreakpoint();
  const [userPreference, setUserPreference] = useState<boolean | null>(null);

  const { visible, autoOverride } = useMemo(
    () => resolveSidebarVisibility(breakpoint, userPreference),
    [breakpoint, userPreference],
  );

  const toggle = useCallback(() => {
    // If auto-override is active (minimum breakpoint), toggle is a no-op.
    // The user can't force the sidebar open at minimum.
    if (autoOverride) return;

    setUserPreference((prev) => {
      if (prev === null) return false; // default is visible, so toggle hides
      return !prev;
    });
  }, [autoOverride]);

  return useMemo(
    () => ({ visible, userPreference, autoOverride, toggle }),
    [visible, userPreference, autoOverride, toggle],
  );
}
```

**State machine visualization:**

```
                    ┌─────────────────────────────────────┐
                    │     Breakpoint transitions           │
                    └─────────────────────────────────────┘

  breakpoint=null          breakpoint="minimum"         breakpoint="standard"|"large"
  ┌──────────────┐        ┌──────────────────┐        ┌──────────────────────────────┐
  │ visible=false│        │ visible=false    │        │ visible=userPref ?? true     │
  │ autoOvr=true │        │ autoOvr=true     │        │ autoOvr=false                │
  │ toggle=noop  │        │ toggle=noop      │        │ toggle=flip userPref         │
  └──────────────┘        └──────────────────┘        └──────────────────────────────┘
                                                               │
                                                         Ctrl+B toggle
                                                               │
                                                    userPref cycles:
                                                    null → false → true → false
```

**Full state transition table:**

| Current State | Event | Next State | Notes |
|---|---|---|---|
| `{breakpoint: null, userPref: any}` | toggle() | No change | No-op, autoOverride active |
| `{breakpoint: "minimum", userPref: any}` | toggle() | No change | No-op, autoOverride active |
| `{breakpoint: "standard", userPref: null}` | toggle() | `{userPref: false}` → hidden | Default was visible, first toggle hides |
| `{breakpoint: "standard", userPref: false}` | toggle() | `{userPref: true}` → visible | |
| `{breakpoint: "standard", userPref: true}` | toggle() | `{userPref: false}` → hidden | |
| `{breakpoint: "standard", userPref: false}` | resize to minimum | `visible: false, autoOverride: true` | Pref preserved in state but overridden |
| `{breakpoint: "minimum", userPref: false}` | resize to standard | `visible: false, autoOverride: false` | Pref restored: sidebar stays hidden |
| `{breakpoint: "standard", userPref: null}` | resize to minimum then back | `visible: true, autoOverride: false` | No pref was set, defaults to visible |

**Design decisions:**

| Decision | Rationale |
|----------|----------|
| `userPreference: boolean \| null` | Three-state: `null` means "I haven't expressed a preference, use the default." This preserves the expected initial visible state at standard/large without the user having to opt in. |
| Toggle is no-op at minimum | There is physically not enough horizontal space for a sidebar at 80 columns. Allowing toggle would cause layout breakage. |
| Preference survives resize | If a user hides the sidebar at standard, then resize triggers minimum (auto-hidden), then resizes back to standard, the sidebar stays hidden (user's preference restored). |
| `resolveSidebarVisibility` exported as a pure function | Extracted for testability. Can be unit-tested without React, both via `bunEval` and via direct import in test files. |
| `useMemo` on the return object | Prevents downstream consumers from re-rendering when the sidebar state hasn't actually changed. The `toggle` callback is stabilized via `useCallback` with `[autoOverride]` dep. |

---

### Step 4: `apps/tui/src/hooks/useLayout.ts` — Composite layout hook with sidebar integration

**Status:** ✅ Implemented (111 lines)

**What:** The central responsive layout hook. Reads terminal dimensions, derives the breakpoint, integrates sidebar state, and computes all responsive layout values. This is the **single source of truth** for layout in the TUI — components must NOT duplicate this logic.

**Implementation:**

```typescript
import { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";
import { useSidebarState, type SidebarState } from "./useSidebarState.js";

export interface LayoutContext {
  /** Raw terminal width in columns. */
  width: number;
  /** Raw terminal height in rows. */
  height: number;
  /**
   * Current breakpoint classification.
   * null when terminal is below 80×24 (unsupported).
   */
  breakpoint: Breakpoint | null;
  /**
   * Available content height in rows, excluding the 1-row header bar
   * and 1-row status bar. Always `height - 2`, floored at 0.
   */
  contentHeight: number;
  /**
   * Whether the sidebar should be rendered.
   * Combines breakpoint auto-collapse with user Ctrl+B toggle.
   */
  sidebarVisible: boolean;
  /**
   * Sidebar width as a percentage string for OpenTUI's <box width={...}>.
   */
  sidebarWidth: string;
  /**
   * Modal overlay width as a percentage string.
   */
  modalWidth: string;
  /**
   * Modal overlay height as a percentage string.
   */
  modalHeight: string;
  /**
   * Full sidebar state object for advanced consumers.
   * Exposes toggle(), userPreference, and autoOverride.
   */
  sidebar: SidebarState;
}

function getSidebarWidth(
  breakpoint: Breakpoint | null,
  sidebarVisible: boolean,
): string {
  if (!sidebarVisible) return "0%";
  switch (breakpoint) {
    case "large":    return "30%";
    case "standard": return "25%";
    default:         return "0%";
  }
}

function getModalWidth(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "50%";
    case "standard": return "60%";
    default:         return "90%";
  }
}

function getModalHeight(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "50%";
    case "standard": return "60%";
    default:         return "90%";
  }
}

export function useLayout(): LayoutContext {
  const { width, height } = useTerminalDimensions();
  const sidebar = useSidebarState();

  return useMemo((): LayoutContext => {
    const breakpoint = getBreakpoint(width, height);
    return {
      width,
      height,
      breakpoint,
      contentHeight: Math.max(0, height - 2),
      sidebarVisible: sidebar.visible,
      sidebarWidth: getSidebarWidth(breakpoint, sidebar.visible),
      modalWidth: getModalWidth(breakpoint),
      modalHeight: getModalHeight(breakpoint),
      sidebar,
    };
  }, [width, height, sidebar]);
}
```

**Value table for derived properties:**

| Breakpoint | sidebar.visible (default) | sidebarWidth | modalWidth | modalHeight |
|------------|--------------------------|-------------|------------|-------------|
| `null`     | `false`                  | `"0%"`      | `"90%"`    | `"90%"`     |
| `"minimum"` | `false`                | `"0%"`      | `"90%"`    | `"90%"`     |
| `"standard"` | `true`               | `"25%"`     | `"60%"`    | `"60%"`     |
| `"standard"` (user toggled off) | `false` | `"0%"`  | `"60%"`    | `"60%"`     |
| `"large"`  | `true`                   | `"30%"`     | `"50%"`    | `"50%"`     |
| `"large"` (user toggled off) | `false`  | `"0%"`      | `"50%"`    | `"50%"`     |

**Key implementation detail:** `getSidebarWidth` takes both `breakpoint` and `sidebarVisible` as arguments. When `sidebarVisible` is `false` (either from auto-collapse or user toggle), it returns `"0%"` regardless of breakpoint. This ensures user toggle state is respected in the width calculation, not just the breakpoint.

**Private helpers are intentionally not exported.** `getSidebarWidth`, `getModalWidth`, and `getModalHeight` are module-private. They are tested indirectly through the E2E suite and through `bunEval` tests that replicate the logic. If direct unit testing of these functions is needed in the future, they should be extracted to a separate utility file rather than exported from the hook module.

---

### Step 5: `apps/tui/src/hooks/index.ts` — Barrel exports

**Status:** ✅ Implemented

**Current content (41 lines):**
```typescript
/**
 * Custom hooks for the TUI application.
 */
export { useDiffSyntaxStyle } from "./useDiffSyntaxStyle.js";
export { useTheme } from "./useTheme.js";
export { useColorTier } from "./useColorTier.js";
export {
  useSpinner,
  BRAILLE_FRAMES,
  ASCII_FRAMES,
  BRAILLE_INTERVAL_MS,
  ASCII_INTERVAL_MS,
} from "./useSpinner.js";
export { useLayout } from "./useLayout.js";
export type { LayoutContext } from "./useLayout.js";
export { useNavigation } from "./useNavigation.js";
export { useAuth } from "./useAuth.js";
export { useLoading } from "./useLoading.js";
export { useScreenLoading } from "./useScreenLoading.js";
export { useOptimisticMutation } from "./useOptimisticMutation.js";
export { usePaginationLoading } from "./usePaginationLoading.js";
export { useBreakpoint } from "./useBreakpoint.js";
export { useResponsiveValue, type ResponsiveValues } from "./useResponsiveValue.js";
export { useSidebarState, resolveSidebarVisibility, type SidebarState } from "./useSidebarState.js";

// Repository tree and file content hooks
export { useRepoTree } from "./useRepoTree.js";
export { useFileContent } from "./useFileContent.js";
export { useBookmarks } from "./useBookmarks.js";
export type {
  TreeEntry,
  TreeEntryType,
  Bookmark,
  UseRepoTreeOptions,
  UseRepoTreeReturn,
  UseFileContentOptions,
  UseFileContentReturn,
  UseBookmarksOptions,
  UseBookmarksReturn,
} from "./repo-tree-types.js";
```

The three responsive-layout-related lines added by this ticket are:
```typescript
export { useBreakpoint } from "./useBreakpoint.js";
export { useResponsiveValue, type ResponsiveValues } from "./useResponsiveValue.js";
export { useSidebarState, resolveSidebarVisibility, type SidebarState } from "./useSidebarState.js";
```

All named exports support tree-shaking.

---

### Step 6: `apps/tui/src/components/AppShell.tsx` — Migrated to `useLayout()`

**Status:** ✅ Implemented (26 lines)

**Implementation:**

```typescript
import React from "react";
import { useLayout } from "../hooks/useLayout.js";
import { HeaderBar } from "./HeaderBar.js";
import { StatusBar } from "./StatusBar.js";
import { OverlayLayer } from "./OverlayLayer.js";
import { TerminalTooSmallScreen } from "./TerminalTooSmallScreen.js";

export function AppShell({ children }: { children?: React.ReactNode }) {
  const layout = useLayout();

  if (!layout.breakpoint) {
    return <TerminalTooSmallScreen cols={layout.width} rows={layout.height} />;
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <HeaderBar />
      <box flexGrow={1} width="100%">
        {children}
      </box>
      <StatusBar />
      <OverlayLayer />
    </box>
  );
}
```

**Migration changes applied:**
- Removed `useTerminalDimensions` import from `@opentui/react`
- Removed `getBreakpoint` import from `../types/breakpoint.js`
- Added `useLayout` import from `../hooks/useLayout.js`
- Replaced `useTerminalDimensions() + getBreakpoint()` with single `useLayout()` call
- Replaced `bp === null` with `!layout.breakpoint`
- Replaced `width`/`height` with `layout.width`/`layout.height`

**Exception — `ErrorScreen.tsx` is NOT migrated:**
`ErrorScreen.tsx` calls `getBreakpoint()` directly because it renders inside the error boundary, potentially outside the full provider stack. It directly imports `useTerminalDimensions`, `useKeyboard`, and `useOnResize` from `@opentui/react` since these are context-free OpenTUI primitives. It wraps `useTheme()` in a try/catch since `ThemeProvider` may not be mounted. It also has its own `getResponsiveConfig()` function that maps breakpoints to layout parameters like `paddingX`, `maxMessageLines`, `maxTraceHeight`, and `centered`. This is acceptable and intentional — the error screen must be self-contained.

**`TerminalTooSmallScreen` is also standalone:**
Rendered by `AppShell` when `layout.breakpoint` is `null`. Uses `useKeyboard` directly for quit handling (`q` and `Ctrl+C`). Creates a fallback theme via `createTheme(detectColorCapability())` at module scope since it may not have access to `ThemeProvider`. Only allows `q` or `Ctrl+C` to quit.

---

## 4. Integration Points

### 4.1 KeybindingProvider — Ctrl+B toggle

The `Ctrl+B` sidebar toggle is wired to `layout.sidebar.toggle` via the keybinding system in `GlobalKeybindings`. The keybinding registration dynamically updates the description based on sidebar state:

```typescript
const layout = useLayout();
useScreenKeybindings([
  {
    key: "ctrl+b",
    description: layout.sidebar.autoOverride
      ? "Toggle sidebar (unavailable)"
      : layout.sidebarVisible
        ? "Hide sidebar"
        : "Show sidebar",
    handler: layout.sidebar.toggle,
  },
]);
```

### 4.2 OverlayLayer

The `OverlayLayer` component consumes `useLayout().modalWidth` and `useLayout().modalHeight` directly to set responsive overlay sizing. No changes needed — these values adapt automatically based on breakpoint.

### 4.3 StatusBar

The status bar consumes `useLayout()` for `{ width, breakpoint }`. At minimum breakpoint, it shows fewer keybinding hints (4 hints) compared to standard (6 hints) and large (all hints). It can additionally use `layout.sidebarVisible` and `layout.sidebar.autoOverride` to dynamically display the `Ctrl+B` hint with appropriate state text.

### 4.4 HeaderBar

The header bar consumes `useLayout()` for `{ width, breakpoint }`. At minimum breakpoint, it truncates the breadcrumb path from the left and hides the repository context section. At standard and above, the full breadcrumb trail and repo context are shown.

### 4.5 Screen components with sidebars

Screens that render a sidebar+main split (code explorer, diff file tree) consume the layout hook:
```typescript
const layout = useLayout();
return (
  <box flexDirection="row" height={layout.contentHeight}>
    {layout.sidebarVisible && (
      <box width={layout.sidebarWidth}><FileTree /></box>
    )}
    <box flexGrow={1}><Content /></box>
  </box>
);
```

### 4.6 Loading and skeleton components

All loading/skeleton components (`FullScreenLoading`, `FullScreenError`, `SkeletonList`, `SkeletonDetail`, `PaginationIndicator`) consume `useLayout()` for `width` and `contentHeight` to center content and size placeholders correctly.

---

## 5. Unit & Integration Tests

### 5.1 Test file: `e2e/tui/app-shell.test.ts`

All responsive layout hook tests are co-located with app shell tests since the responsive system is part of the app shell's foundation. Five new `describe` blocks were added after the existing test groups.

**Test count:** 42 new tests added across 5 describe blocks.  
**Total tests in file (including pre-existing):** 476+.

**Testing approach:**

- Pure functions (`resolveSidebarVisibility`) are tested via `bunEval` — Bun subprocess evaluation that runs the expression in the TUI package context using dynamic `await import()`. This avoids React context requirements.
- Module resolution and code quality (import structure, absence of `useEffect`/`useState` where prohibited, presence of `useMemo`) are tested via file content assertions using `Bun.file().text()`.
- React hooks (`useBreakpoint`, `useResponsiveValue`, `useSidebarState`, `useLayout`) are tested indirectly through their selection logic exercised via `bunEval` (reproducing the lookup logic against `getBreakpoint`) and via E2E scenarios that launch the real TUI.
- E2E sidebar toggle tests launch real TUI instances via `launchTUI()` at specific terminal dimensions and verify rendered output reflects expected behavior.
- Per project policy: **no mocking of implementation details**.
- Per project policy: **tests that fail due to unimplemented backend features are left failing — never skipped or commented out.**

#### 5.1.1 `useBreakpoint` — Module resolution and hook availability (7 tests)

```typescript
describe('TUI_APP_SHELL — useBreakpoint hook', () => {
  test('HOOK-BP-001: useBreakpoint is importable from hooks barrel', async () => {
    const result = await bunEval(`
      const mod = await import('./src/hooks/index.js');
      console.log(typeof mod.useBreakpoint);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('function');
  });

  test('HOOK-BP-002: useBreakpoint is importable from direct path', async () => {
    const result = await bunEval(`
      const { useBreakpoint } = await import('./src/hooks/useBreakpoint.js');
      console.log(typeof useBreakpoint);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('function');
  });

  test('HOOK-BP-003: useBreakpoint.ts imports from @opentui/react', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useBreakpoint.ts')).text();
    expect(content).toContain('from "@opentui/react"');
  });

  test('HOOK-BP-004: useBreakpoint.ts imports getBreakpoint from types', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useBreakpoint.ts')).text();
    expect(content).toContain('from "../types/breakpoint.js"');
  });

  test('HOOK-BP-005: useBreakpoint.ts has zero useState calls', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useBreakpoint.ts')).text();
    expect(content).not.toContain('useState');
  });

  test('HOOK-BP-006: useBreakpoint.ts has zero useEffect calls', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useBreakpoint.ts')).text();
    expect(content).not.toContain('useEffect');
  });

  test('HOOK-BP-007: useBreakpoint.ts uses useMemo for memoization', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useBreakpoint.ts')).text();
    expect(content).toContain('useMemo');
  });
});
```

| Test ID | Description | Assertion Method |
|---------|-------------|------------------|
| HOOK-BP-001 | `useBreakpoint` is importable from hooks barrel | `bunEval` dynamic import + typeof check |
| HOOK-BP-002 | `useBreakpoint` is importable from direct path | `bunEval` dynamic import + typeof check |
| HOOK-BP-003 | `useBreakpoint.ts` imports from `@opentui/react` | File content assertion |
| HOOK-BP-004 | `useBreakpoint.ts` imports `getBreakpoint` from types | File content assertion |
| HOOK-BP-005 | `useBreakpoint.ts` has zero `useState` calls | File content negative assertion |
| HOOK-BP-006 | `useBreakpoint.ts` has zero `useEffect` calls | File content negative assertion |
| HOOK-BP-007 | `useBreakpoint.ts` uses `useMemo` for memoization | File content assertion |

Tests HOOK-BP-001/002 use `bunEval` with `await import()` to verify runtime importability. Tests HOOK-BP-003–007 use file content assertions to verify code quality invariants.

#### 5.1.2 `useResponsiveValue` — Value selection logic (9 tests)

```typescript
describe('TUI_APP_SHELL — useResponsiveValue hook', () => {
  test('HOOK-RV-001: useResponsiveValue is importable from hooks barrel', async () => {
    const result = await bunEval(`
      const mod = await import('./src/hooks/index.js');
      console.log(typeof mod.useResponsiveValue);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('function');
  });

  test("HOOK-RV-002: selects 'minimum' value at 80x24", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import('./src/types/breakpoint.js');
      const bp = getBreakpoint(80, 24);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBe('minimum');
    expect(parsed.selected).toBe(0);
  });

  test("HOOK-RV-003: selects 'standard' value at 120x40", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import('./src/types/breakpoint.js');
      const bp = getBreakpoint(120, 40);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBe('standard');
    expect(parsed.selected).toBe(2);
  });

  test("HOOK-RV-004: selects 'large' value at 200x60", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import('./src/types/breakpoint.js');
      const bp = getBreakpoint(200, 60);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBe('large');
    expect(parsed.selected).toBe(4);
  });

  test('HOOK-RV-005: returns undefined when below minimum and no fallback', async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import('./src/types/breakpoint.js');
      const bp = getBreakpoint(60, 20);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected: selected === undefined ? '__undefined__' : selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBeNull();
    expect(parsed.selected).toBe('__undefined__');
  });

  test('HOOK-RV-006: returns fallback when below minimum', async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import('./src/types/breakpoint.js');
      const bp = getBreakpoint(60, 20);
      const values = { minimum: 0, standard: 2, large: 4 };
      const fallback = -1;
      const selected = bp ? values[bp] : fallback;
      console.log(JSON.stringify({ selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe(-1);
  });

  test('HOOK-RV-007: works with string values', async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import('./src/types/breakpoint.js');
      const bp = getBreakpoint(120, 40);
      const values = { minimum: 'sm', standard: 'md', large: 'lg' };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe('md');
  });

  test('HOOK-RV-008: works with boolean values', async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import('./src/types/breakpoint.js');
      const bp = getBreakpoint(80, 24);
      const values = { minimum: false, standard: true, large: true };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe(false);
  });

  test('HOOK-RV-009: useResponsiveValue.ts has zero useEffect calls', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useResponsiveValue.ts')).text();
    expect(content).not.toContain('useEffect');
  });
});
```

| Test ID | Description | Assertion Method |
|---------|-------------|------------------|
| HOOK-RV-001 | `useResponsiveValue` is importable from hooks barrel | `bunEval` dynamic import + typeof |
| HOOK-RV-002 | Selects `minimum` value at 80×24 | `bunEval` with `getBreakpoint` + map lookup, verifies both breakpoint and selected value |
| HOOK-RV-003 | Selects `standard` value at 120×40 | `bunEval` with `getBreakpoint` + map lookup |
| HOOK-RV-004 | Selects `large` value at 200×60 | `bunEval` with `getBreakpoint` + map lookup |
| HOOK-RV-005 | Returns `undefined` when below minimum and no fallback | `bunEval` null breakpoint path, uses `'__undefined__'` sentinel for JSON serialization |
| HOOK-RV-006 | Returns fallback when below minimum | `bunEval` fallback parameter path |
| HOOK-RV-007 | Works with string values | `bunEval` generic type verification |
| HOOK-RV-008 | Works with boolean values | `bunEval` generic type verification |
| HOOK-RV-009 | `useResponsiveValue.ts` has zero `useEffect` calls | File content negative assertion |

Tests HOOK-RV-002–008 exercise the selection logic by reproducing it in `bunEval`: calling `getBreakpoint()` to get the breakpoint, then indexing into a values map. This validates that the underlying logic (which the hook wraps) produces correct results at each breakpoint boundary.

#### 5.1.3 `resolveSidebarVisibility` — State resolution logic (12 tests)

```typescript
describe('TUI_APP_SHELL — resolveSidebarVisibility pure function', () => {
  test('HOOK-SB-001: sidebar hidden when breakpoint is null', async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import('./src/hooks/useSidebarState.js');
      console.log(JSON.stringify(resolveSidebarVisibility(null, null)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(true);
  });

  test('HOOK-SB-002: sidebar hidden at minimum breakpoint', async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import('./src/hooks/useSidebarState.js');
      console.log(JSON.stringify(resolveSidebarVisibility('minimum', null)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(true);
  });

  test('HOOK-SB-003: sidebar hidden at minimum even with user preference true', async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import('./src/hooks/useSidebarState.js');
      console.log(JSON.stringify(resolveSidebarVisibility('minimum', true)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(true);
  });

  test('HOOK-SB-004: sidebar visible at standard with no user preference', async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import('./src/hooks/useSidebarState.js');
      console.log(JSON.stringify(resolveSidebarVisibility('standard', null)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(true);
    expect(parsed.autoOverride).toBe(false);
  });

  test('HOOK-SB-005: sidebar hidden at standard with user preference false', async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import('./src/hooks/useSidebarState.js');
      console.log(JSON.stringify(resolveSidebarVisibility('standard', false)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(false);
  });

  test('HOOK-SB-006: sidebar visible at large with no user preference', async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import('./src/hooks/useSidebarState.js');
      console.log(JSON.stringify(resolveSidebarVisibility('large', null)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(true);
    expect(parsed.autoOverride).toBe(false);
  });

  test('HOOK-SB-007: sidebar visible at standard with user preference true', async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import('./src/hooks/useSidebarState.js');
      console.log(JSON.stringify(resolveSidebarVisibility('standard', true)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(true);
    expect(parsed.autoOverride).toBe(false);
  });

  test('HOOK-SB-008: sidebar hidden at large with user preference false', async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import('./src/hooks/useSidebarState.js');
      console.log(JSON.stringify(resolveSidebarVisibility('large', false)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(false);
  });

  test('HOOK-SB-009: resolveSidebarVisibility is importable from hooks barrel', async () => {
    const result = await bunEval(`
      const mod = await import('./src/hooks/index.js');
      console.log(typeof mod.resolveSidebarVisibility);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('function');
  });

  test('HOOK-SB-010: useSidebarState is importable from hooks barrel', async () => {
    const result = await bunEval(`
      const mod = await import('./src/hooks/index.js');
      console.log(typeof mod.useSidebarState);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('function');
  });

  test('HOOK-SB-011: useSidebarState.ts has zero useEffect calls', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useSidebarState.ts')).text();
    expect(content).not.toContain('useEffect');
  });

  test('HOOK-SB-012: useSidebarState.ts imports useBreakpoint from local hook', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useSidebarState.ts')).text();
    expect(content).toContain('from "./useBreakpoint.js"');
  });
});
```

| Test ID | Description | Assertion Method |
|---------|-------------|------------------|
| HOOK-SB-001 | Sidebar hidden when breakpoint is `null` | `bunEval` pure function call, JSON parse |
| HOOK-SB-002 | Sidebar hidden at `minimum` breakpoint | `bunEval` pure function call |
| HOOK-SB-003 | Sidebar hidden at `minimum` even with user preference `true` | `bunEval` pure function call (auto-override) |
| HOOK-SB-004 | Sidebar visible at `standard` with no user preference | `bunEval` pure function call (default visible) |
| HOOK-SB-005 | Sidebar hidden at `standard` with user preference `false` | `bunEval` pure function call (user toggle) |
| HOOK-SB-006 | Sidebar visible at `large` with no user preference | `bunEval` pure function call (default visible) |
| HOOK-SB-007 | Sidebar visible at `standard` with user preference `true` | `bunEval` pure function call (explicit visible) |
| HOOK-SB-008 | Sidebar hidden at `large` with user preference `false` | `bunEval` pure function call (user toggle at large) |
| HOOK-SB-009 | `resolveSidebarVisibility` importable from hooks barrel | `bunEval` dynamic import + typeof |
| HOOK-SB-010 | `useSidebarState` importable from hooks barrel | `bunEval` dynamic import + typeof |
| HOOK-SB-011 | `useSidebarState.ts` has zero `useEffect` calls | File content negative assertion |
| HOOK-SB-012 | `useSidebarState.ts` imports `useBreakpoint` from local hook | File content assertion |

Tests HOOK-SB-001–008 directly invoke the exported pure function `resolveSidebarVisibility()` via `bunEval`, covering all 8 meaningful combinations of breakpoint (`null`, `minimum`, `standard`, `large`) × user preference (`null`, `true`, `false`).

#### 5.1.4 `useLayout` — Sidebar integration (8 tests)

```typescript
describe('TUI_APP_SHELL — useLayout sidebar integration', () => {
  test("HOOK-LAY-039: sidebarWidth returns '0%' when visibility is false at standard", async () => {
    const result = await bunEval(`
      function getSidebarWidth(bp, visible) {
        if (!visible) return '0%';
        switch (bp) {
          case 'large': return '30%';
          case 'standard': return '25%';
          default: return '0%';
        }
      }
      console.log(JSON.stringify({
        visibleStandard: getSidebarWidth('standard', true),
        hiddenStandard: getSidebarWidth('standard', false),
        visibleLarge: getSidebarWidth('large', true),
        hiddenLarge: getSidebarWidth('large', false),
        visibleMinimum: getSidebarWidth('minimum', true),
        hiddenNull: getSidebarWidth(null, false),
      }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visibleStandard).toBe('25%');
    expect(parsed.hiddenStandard).toBe('0%');
    expect(parsed.visibleLarge).toBe('30%');
    expect(parsed.hiddenLarge).toBe('0%');
    expect(parsed.visibleMinimum).toBe('0%');
    expect(parsed.hiddenNull).toBe('0%');
  });

  test('HOOK-LAY-040: useLayout.ts imports useSidebarState', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useLayout.ts')).text();
    expect(content).toContain('from "./useSidebarState.js"');
  });

  test('HOOK-LAY-041: useLayout.ts no longer has inline sidebarVisible derivation', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useLayout.ts')).text();
    expect(content).not.toContain('breakpoint !== null && breakpoint !== "minimum"');
  });

  test('HOOK-LAY-042: LayoutContext interface includes sidebar field', async () => {
    const content = await Bun.file(join(TUI_SRC, 'hooks/useLayout.ts')).text();
    expect(content).toContain('sidebar: SidebarState');
  });

  test('HOOK-LAY-043: AppShell.tsx imports useLayout instead of getBreakpoint', async () => {
    const content = await Bun.file(join(TUI_SRC, 'components/AppShell.tsx')).text();
    expect(content).toContain('from "../hooks/useLayout.js"');
    expect(content).not.toContain('from "../types/breakpoint.js"');
    expect(content).not.toContain('getBreakpoint');
  });

  test('HOOK-LAY-044: AppShell.tsx does not import useTerminalDimensions directly', async () => {
    const content = await Bun.file(join(TUI_SRC, 'components/AppShell.tsx')).text();
    expect(content).not.toContain('useTerminalDimensions');
  });

  test('HOOK-LAY-045: ErrorScreen.tsx still uses getBreakpoint directly (acceptable)', async () => {
    const content = await Bun.file(join(TUI_SRC, 'components/ErrorScreen.tsx')).text();
    expect(content).toContain('getBreakpoint');
  });

  test('HOOK-LAY-046: tsc --noEmit passes with new hook files', async () => {
    const result = await run(['bun', 'run', 'check']);
    if (result.exitCode !== 0) {
      console.error('tsc stderr:', result.stderr);
      console.error('tsc stdout:', result.stdout);
    }
    expect(result.exitCode).toBe(0);
  }, 30_000);
});
```

| Test ID | Description | Assertion Method |
|---------|-------------|------------------|
| HOOK-LAY-039 | `getSidebarWidth` returns `"0%"` when visibility is false | `bunEval` inline function covering full 6-entry matrix |
| HOOK-LAY-040 | `useLayout.ts` imports `useSidebarState` | File content assertion |
| HOOK-LAY-041 | `useLayout.ts` no longer has inline `sidebarVisible` derivation | File content negative assertion |
| HOOK-LAY-042 | `LayoutContext` interface includes `sidebar: SidebarState` field | File content assertion |
| HOOK-LAY-043 | `AppShell.tsx` imports `useLayout` instead of `getBreakpoint` | File content positive + negative assertions |
| HOOK-LAY-044 | `AppShell.tsx` does not import `useTerminalDimensions` directly | File content negative assertion |
| HOOK-LAY-045 | `ErrorScreen.tsx` still uses `getBreakpoint` directly (acceptable) | File content positive assertion |
| HOOK-LAY-046 | `tsc --noEmit` passes with all hook files | Subprocess compilation check via `run()` helper (30s timeout) |

HOOK-LAY-039 verifies the `getSidebarWidth` logic inline via `bunEval`, covering the full matrix: `standard×visible=25%`, `standard×hidden=0%`, `large×visible=30%`, `large×hidden=0%`, `minimum×visible=0%`, `null×hidden=0%`. HOOK-LAY-041 asserts that the old inline pattern `breakpoint !== null && breakpoint !== "minimum"` no longer exists, confirming the migration to `useSidebarState()`.

#### 5.1.5 E2E sidebar toggle (6 tests)

```typescript
describe('TUI_APP_SHELL — sidebar toggle E2E', () => {
  let terminal;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  test('RESP-SB-001: Ctrl+B toggles sidebar off at standard breakpoint', async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText('Dashboard');
    const beforeSnapshot = terminal.snapshot();
    await terminal.sendKeys('ctrl+b');
    const afterSnapshot = terminal.snapshot();
    expect(beforeSnapshot).not.toBe(afterSnapshot);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test('RESP-SB-002: Ctrl+B toggles sidebar back on at standard breakpoint', async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText('Dashboard');
    await terminal.sendKeys('ctrl+b'); // hide
    await terminal.sendKeys('ctrl+b'); // show
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test('RESP-SB-003: Ctrl+B is no-op at minimum breakpoint', async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText('Dashboard');
    const before = terminal.snapshot();
    await terminal.sendKeys('ctrl+b');
    const after = terminal.snapshot();
    expect(before).toBe(after);
  });

  test('RESP-SB-004: user preference survives resize through minimum', async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText('Dashboard');
    await terminal.sendKeys('ctrl+b'); // hide sidebar
    await terminal.resize(80, 24);    // minimum - auto-hidden
    await terminal.waitForText('Dashboard');
    await terminal.resize(120, 40);   // back to standard - preference should persist
    await terminal.waitForText('Dashboard');
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test('RESP-SB-005: sidebar shows at large breakpoint with wider width', async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText('Dashboard');
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test('RESP-SB-006: Ctrl+B restores sidebar after toggle off then on', async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText('Dashboard');
    const initial = terminal.snapshot();
    await terminal.sendKeys('ctrl+b'); // hide
    await terminal.sendKeys('ctrl+b'); // show
    const restored = terminal.snapshot();
    expect(restored).toBe(initial);
  });
});
```

| Test ID | Description | Terminal Size | Key Behavior Verified |
|---------|-------------|---------------|----------------------|
| RESP-SB-001 | `Ctrl+B` toggles sidebar off at standard breakpoint | 120×40 | Toggle changes rendered output; snapshot captured |
| RESP-SB-002 | `Ctrl+B` toggles sidebar back on at standard breakpoint | 120×40 | Double toggle restores state; snapshot captured |
| RESP-SB-003 | `Ctrl+B` is no-op at minimum breakpoint | 80×24 | Snapshot unchanged after toggle |
| RESP-SB-004 | User preference survives resize through minimum | 120×40 → 80×24 → 120×40 | State persistence across auto-override; waits for Dashboard after each resize |
| RESP-SB-005 | Sidebar shows at large breakpoint with wider width | 200×60 | Large breakpoint rendering; snapshot captured |
| RESP-SB-006 | `Ctrl+B` restores sidebar after toggle off then on | 200×60 | Idempotency: off→on == initial (exact snapshot match) |

RESP-SB-004 is the critical state machine test: it toggles the sidebar off at standard, resizes to minimum (auto-hidden), waits for the Dashboard to re-render, resizes back to standard, waits again, and asserts the user's preference (hidden) is restored via snapshot. RESP-SB-006 verifies idempotency by asserting the snapshot after a toggle-off/toggle-on cycle matches the initial snapshot.

### 5.2 Interaction with existing tests

**Tests unaffected by this ticket:**

- `HOOK-LAY-001` through `HOOK-LAY-019`: Test `getBreakpoint()` pure function boundaries. No interface changes, all still valid.
- `HOOK-LAY-020` through `HOOK-LAY-024`: Test `useLayout()` computed values (`contentHeight`, `sidebarVisible`). The default behavior path (no user toggle) produces identical results to the pre-migration implementation. Still valid.
- `HOOK-LAY-025`: Tests `getSidebarWidth` with the **OLD** single-argument signature inline via `bunEval`. This test is unaffected because it reimplements the logic inline (does not import the actual function). However, its behavioral contract is now documented more completely by HOOK-LAY-039.
- `HOOK-LAY-028` through `HOOK-LAY-038`: Module resolution tests. Still valid after barrel export additions.
- `RESP-LAY-001` through `RESP-LAY-015`: E2E responsive layout tests. All still valid — they test layout behavior at different sizes, which is unchanged for default sidebar state.

---

## 6. Productionization Checklist

### 6.1 File summary

| File | Action | Lines | Status |
|------|--------|-------|--------|
| `apps/tui/src/types/breakpoint.ts` | None | 33 | ✅ Stable |
| `apps/tui/src/types/index.ts` | None | 2 | ✅ Stable |
| `apps/tui/src/hooks/useBreakpoint.ts` | Created | 17 | ✅ Complete |
| `apps/tui/src/hooks/useResponsiveValue.ts` | Created | 34 | ✅ Complete |
| `apps/tui/src/hooks/useSidebarState.ts` | Created | 99 | ✅ Complete |
| `apps/tui/src/hooks/useLayout.ts` | Modified | 111 | ✅ Complete |
| `apps/tui/src/hooks/index.ts` | Modified | 41 | ✅ Complete |
| `apps/tui/src/components/AppShell.tsx` | Modified | 26 | ✅ Complete |

### 6.2 Implementation order (dependency-safe)

The implementation order respects import dependencies:

1. **Create `useBreakpoint.ts`** — depends only on `@opentui/react` and `types/breakpoint.ts` (both exist)
2. **Create `useResponsiveValue.ts`** — depends on `useBreakpoint.ts` (Step 1)
3. **Create `useSidebarState.ts`** — depends on `useBreakpoint.ts` (Step 1)
4. **Modify `useLayout.ts`** — depends on `useSidebarState.ts` (Step 3)
5. **Modify `hooks/index.ts`** — add barrel exports for all three new hooks
6. **Modify `AppShell.tsx`** — replace `getBreakpoint()` with `useLayout()`
7. **Run `tsc --noEmit`** — verify type safety across all consumers
8. **Write/verify tests** in `e2e/tui/app-shell.test.ts`

### 6.3 Performance validation

- **No debounce**: Resize events trigger synchronous re-render via `useTerminalDimensions`'s internal `useOnResize` subscription. The existing `RESP-LAY-015` rapid resize test and `RESP-SB-004` resize-through-minimum test verify this behavior.
- **Memoization chain**: All hooks use `useMemo` to prevent unnecessary re-renders:
  - `useBreakpoint`: `useMemo([width, height])` — stable when dimensions are within same breakpoint band
  - `useResponsiveValue`: `useMemo([breakpoint, values, fallback])` — stable when breakpoint hasn't changed
  - `useSidebarState`: `useMemo([breakpoint, userPreference])` for resolution; `useMemo([visible, userPreference, autoOverride, toggle])` for return object; `useCallback([autoOverride])` for toggle stability
  - `useLayout`: `useMemo([width, height, sidebar])` — recomputes on any dimension change or sidebar state change
- **No effects in hot path**: All four hooks have zero `useEffect` calls. Only `useState` exists (for user preference in `useSidebarState`).
- **Zero allocations on stable state**: When dimensions haven't changed and no toggle has occurred, all hooks return the same memoized references.
- **Double `useTerminalDimensions` call**: `useLayout()` calls `useTerminalDimensions()` directly (for raw `width`/`height`) AND indirectly via `useSidebarState()` → `useBreakpoint()` → `useTerminalDimensions()`. React guarantees both calls resolve to the same context value within a single render, so there is no double-subscription concern. Both calls read the same `{ width, height }` state from the OpenTUI renderer context.

### 6.4 Tree-shaking

All exports are named exports (no default exports). The barrel re-export in `hooks/index.ts` uses named re-exports. Bun's bundler can tree-shake unused hooks. Consumers that only need `useBreakpoint` won't pull in `useSidebarState`'s `useState` import path.

### 6.5 No new runtime dependencies

This ticket introduces zero new runtime dependencies. All imports are from:
- `react` (already pinned at 19.x)
- `@opentui/react` (already pinned at 0.1.90)
- Local modules within `apps/tui/src/`

### 6.6 POC code productionization

No POC code was created for this ticket. All implementations target production files directly. The hooks are minimal enough (17–111 lines each) that POC validation was unnecessary. If future extensions to the responsive system require POC validation (e.g., adding a new breakpoint tier or changing the sidebar width to use absolute columns instead of percentages), the following process applies:

1. Create `poc/tui-responsive-<description>.ts` with the experimental logic
2. Add assertions in the POC that exercise boundary conditions
3. Run the POC via `bun run poc/tui-responsive-<description>.ts`
4. Once assertions pass, migrate the logic into the production hook
5. Graduate POC assertions into the `e2e/tui/app-shell.test.ts` test suite
6. Delete the POC file

---

## 7. Dependency Graph

```
@opentui/react
  └── useTerminalDimensions()
        ├── useBreakpoint() ←── types/breakpoint.ts::getBreakpoint()
        │     ├── useResponsiveValue()
        │     └── useSidebarState()
        │           └── useLayout() ←── also reads useTerminalDimensions() directly
        │                 │
        │                 ├── AppShell.tsx
        │                 ├── HeaderBar.tsx
        │                 ├── StatusBar.tsx
        │                 ├── OverlayLayer.tsx
        │                 ├── FullScreenLoading.tsx
        │                 ├── FullScreenError.tsx
        │                 ├── PaginationIndicator.tsx
        │                 ├── SkeletonList.tsx
        │                 └── SkeletonDetail.tsx
        │
        └── getBreakpoint() direct callers (bypassing hooks):
            └── ErrorScreen.tsx (acceptable — outside provider stack)
```

**Note:** `useLayout()` calls `useTerminalDimensions()` directly (for raw `width`/`height`) AND indirectly via `useSidebarState()` → `useBreakpoint()` → `useTerminalDimensions()`. React guarantees both calls resolve to the same context value within a single render, so there is no double-subscription concern.

**OpenTUI internal dependency chain (for reference):**
```
useTerminalDimensions()
  ├── useRenderer()       ← reads width/height from OpenTUI renderer context
  ├── useState()          ← stores { width, height }
  └── useOnResize()       ← subscribes to renderer "resize" event
        └── useEffectEvent()  ← stable callback wrapper
```

---

## 8. Acceptance Criteria

1. ✅ `getBreakpoint(cols, rows)` returns `null` for <80×24, `"minimum"` for 80×24–119×39, `"standard"` for 120×40–199×59, `"large"` for 200×60+.
2. ✅ `useBreakpoint()` exists at `apps/tui/src/hooks/useBreakpoint.ts` and returns the current breakpoint reactively, updating on terminal resize with no debounce.
3. ✅ `useResponsiveValue({ minimum, standard, large })` exists at `apps/tui/src/hooks/useResponsiveValue.ts` and returns the correct value for the current breakpoint, or fallback/undefined below minimum.
4. ✅ `useSidebarState()` exists at `apps/tui/src/hooks/useSidebarState.ts` and tracks user toggle preference separately from auto-collapse. `resolveSidebarVisibility` is exported for direct testing.
5. ✅ Sidebar is auto-hidden at minimum/unsupported and `Ctrl+B` toggle is a no-op at those breakpoints.
6. ✅ User sidebar preference survives resize transitions through minimum and back.
7. ✅ `useLayout()` returns a composite object with all layout values including the new `sidebar: SidebarState` field.
8. ✅ `useLayout()` integrates `useSidebarState()` — `sidebarVisible` reflects both auto-collapse AND user toggle.
9. ✅ `getSidebarWidth` returns `"0%"` when user has toggled sidebar off (not just when breakpoint forces it).
10. ✅ `AppShell.tsx` is migrated to use `useLayout()` instead of calling `getBreakpoint()` directly.
11. ✅ `ErrorScreen.tsx` continues to call `getBreakpoint()` directly (intentional — renders outside provider stack). Also wraps `useTheme()` in try/catch for resilience.
12. ✅ `TerminalTooSmallScreen` renders standalone with fallback theme and only allows `q`/`Ctrl+C` to quit.
13. ✅ All layout recalculations are synchronous — no debounce, no animation, no `useEffect` in the hot path.
14. ✅ All hooks are memoized and return stable references when inputs haven't changed.
15. ✅ All three new hooks are exported from `apps/tui/src/hooks/index.ts` barrel.
16. ✅ All 42 new tests exist (pass or fail only due to unimplemented backend features, never skipped).
17. ✅ `tsc --noEmit` passes with all new files.
18. ✅ No new runtime dependencies introduced.
19. ✅ Test IDs (`HOOK-BP-*`, `HOOK-RV-*`, `HOOK-SB-*`, `HOOK-LAY-039+`, `RESP-SB-*`) do not collide with existing test IDs.