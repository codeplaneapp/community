# Engineering Specification: tui-nav-chrome-eng-03

## Responsive Layout Hooks: `useBreakpoint`, `useResponsiveValue`, `useLayout`

**Ticket:** tui-nav-chrome-eng-03  
**Type:** Engineering  
**Status:** Partial  
**Depends on:** tui-bootstrap-and-renderer  
**Files:**
- `apps/tui/src/hooks/useBreakpoint.ts` (new)
- `apps/tui/src/hooks/useResponsiveValue.ts` (new)
- `apps/tui/src/hooks/useLayout.ts` (modify — integrate sidebar state)
- `apps/tui/src/hooks/useSidebarState.ts` (new)
- `apps/tui/src/types/breakpoint.ts` (exists, no changes)
- `apps/tui/src/components/AppShell.tsx` (modify — migrate to `useLayout()`)

**Test files:**
- `e2e/tui/app-shell.test.ts` (extend existing responsive layout test groups)

---

## 1. Overview

This ticket implements the responsive layout detection system for the Codeplane TUI. The system provides a layered set of hooks that translate raw terminal dimensions (from OpenTUI's `useTerminalDimensions`) into semantic breakpoints, breakpoint-aware values, and a composite layout context. It also introduces a sidebar state machine that separates user preference (Ctrl+B toggle) from automatic breakpoint-driven collapse.

The hooks are foundational — every screen, every component that adapts to terminal size, and every modal/overlay relies on this system. The design must be zero-allocation on re-renders when dimensions haven't changed, and layout recalculations must be synchronous (no debounce, no animation) per the TUI design spec.

### 1.1 Current State Assessment

Two of the six files in scope already exist. The remaining four must be created, and `useLayout.ts` must be evolved to integrate the new sidebar state machine.

**What exists today:**

| File | Status | Notes |
|------|--------|-------|
| `apps/tui/src/types/breakpoint.ts` | ✅ Complete | `Breakpoint` type + `getBreakpoint()` pure function. No changes needed. |
| `apps/tui/src/types/index.ts` | ✅ Complete | Re-exports `getBreakpoint` and `Breakpoint`. No changes needed. |
| `apps/tui/src/hooks/useLayout.ts` | ⚠️ Exists, needs evolution | Current implementation derives `sidebarVisible` as a simple `breakpoint !== null && breakpoint !== "minimum"` check. Does NOT integrate `useSidebarState()` for Ctrl+B toggle support. `getSidebarWidth` takes only breakpoint (not visibility). `LayoutContext` interface lacks `sidebar: SidebarState` field. |
| `apps/tui/src/hooks/index.ts` | ⚠️ Exists, needs additions | Exports `useLayout` and `LayoutContext` but not the three new hooks. |
| `apps/tui/src/hooks/useBreakpoint.ts` | ❌ Does not exist | Must be created. |
| `apps/tui/src/hooks/useResponsiveValue.ts` | ❌ Does not exist | Must be created. |
| `apps/tui/src/hooks/useSidebarState.ts` | ❌ Does not exist | Must be created. |
| `apps/tui/src/components/AppShell.tsx` | ⚠️ Migration candidate | Currently calls `getBreakpoint()` directly via `useTerminalDimensions()` instead of `useLayout()`. Should be migrated to `useLayout()` for consistency. |

**Components consuming `useLayout()`:**
- `HeaderBar.tsx` — `{ width, breakpoint }` for truncation
- `StatusBar.tsx` — `{ width, breakpoint }` for hint count
- `FullScreenLoading.tsx` — `{ width, contentHeight }` for centering
- `FullScreenError.tsx` — `{ width, contentHeight }` for centering
- `PaginationIndicator.tsx` — `{ width }` for truncation
- `SkeletonList.tsx` — `{ contentHeight, width }` for placeholder rows
- `SkeletonDetail.tsx` — `{ width, contentHeight }` for sizing

**Components calling `getBreakpoint()` directly:**
- `AppShell.tsx` — `getBreakpoint(width, height)` for null check (migration target for this ticket)
- `ErrorScreen.tsx` — `getBreakpoint(termWidth, termHeight)` for responsive config (acceptable — renders outside provider stack in error boundary)

**E2E tests:** The `e2e/tui/app-shell.test.ts` file contains 412 existing tests across many describe blocks. Layout-specific tests use IDs `HOOK-LAY-001` through `HOOK-LAY-038` and `RESP-LAY-001` through `RESP-LAY-015`. New tests will use `HOOK-BP-*`, `HOOK-RV-*`, `HOOK-SB-*`, and `RESP-SB-*` prefixes to avoid collisions.

---

## 2. Type Foundation

### 2.1 `apps/tui/src/types/breakpoint.ts` — No changes

This file already exists and matches the architecture spec exactly:

```typescript
export type Breakpoint = "minimum" | "standard" | "large";

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

---

## 3. Implementation Plan

### Step 1: Create `apps/tui/src/hooks/useBreakpoint.ts` — Reactive breakpoint hook

**Status:** ❌ New file

**What:** A React hook that returns the current `Breakpoint | null` derived from live terminal dimensions. This extracts the breakpoint computation that currently lives inline inside `useLayout()` into its own composable hook.

**File:** `apps/tui/src/hooks/useBreakpoint.ts`

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
| No internal state | The hook is a pure derivation. No `useState`, no effects. This makes it predictable and testable. |

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
It returns `{ width: number, height: number }` and auto-updates on SIGWINCH.

---

### Step 2: Create `apps/tui/src/hooks/useResponsiveValue.ts` — Breakpoint-to-value mapper

**Status:** ❌ New file

**What:** A generic hook that selects a value from a breakpoint-keyed map based on the current breakpoint.

**File:** `apps/tui/src/hooks/useResponsiveValue.ts`

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
| Returns `T \| undefined` | When below minimum and no fallback provided, returns `undefined`. This forces callers to handle the unsupported case explicitly. |
| `fallback` parameter | For hooks called in components that may render briefly during resize transitions below minimum, a fallback prevents crashes. |
| `useMemo` with `values` in deps | Since `values` is typically an object literal, it will be a new reference each render. Callers should define values objects at module scope for stability, or memoize them. |

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
```

---

### Step 3: Create `apps/tui/src/hooks/useSidebarState.ts` — Sidebar visibility state machine

**Status:** ❌ New file

**What:** Manages sidebar visibility by combining user preference (manual Ctrl+B toggle) with automatic breakpoint-driven collapse.

**File:** `apps/tui/src/hooks/useSidebarState.ts`

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

**Design decisions:**

| Decision | Rationale |
|----------|----------|
| `userPreference: boolean \| null` | Three-state: null means "I haven't expressed a preference, use the default." This preserves the expected initial visible state at standard/large without the user having to opt in. |
| Toggle is no-op at minimum | There is physically not enough horizontal space for a sidebar at 80 columns. Allowing toggle would cause layout breakage. |
| Preference survives resize | If a user hides the sidebar at standard, then resize triggers minimum (auto-hidden), then resizes back to standard, the sidebar stays hidden (user's preference restored). |
| `resolveSidebarVisibility` exported as a pure function | Extracted for testability. Can be unit-tested without React, both directly in `bunEval` and via import in test files. |
| `useMemo` on the return object | Prevents downstream consumers from re-rendering when the sidebar state hasn't actually changed. The `toggle` callback is stabilized via `useCallback` with `[autoOverride]` dep. |

---

### Step 4: Evolve `apps/tui/src/hooks/useLayout.ts` — Integrate sidebar state machine

**Status:** ⚠️ Existing file — modify

**What:** The current `useLayout()` computes `sidebarVisible` as a simple boolean from the breakpoint. It must be upgraded to integrate `useSidebarState()` so that sidebar visibility respects both auto-collapse AND user Ctrl+B toggle.

**Current implementation (lines relevant to sidebar):**
```typescript
// Current: simple derivation
const sidebarVisible = breakpoint !== null && breakpoint !== "minimum";
// ...
sidebarWidth: getSidebarWidth(breakpoint),
```

**Target implementation:**

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

**Changes from current implementation:**

| Change | Before | After |
|--------|--------|-------|
| `sidebarVisible` derivation | `breakpoint !== null && breakpoint !== "minimum"` (inline) | `sidebar.visible` (from `useSidebarState()`) |
| `getSidebarWidth` signature | `getSidebarWidth(breakpoint: Breakpoint \| null)` | `getSidebarWidth(breakpoint: Breakpoint \| null, sidebarVisible: boolean)` |
| `getSidebarWidth` behavior | Returns `"0%"` only for minimum/null breakpoint | Returns `"0%"` when `!sidebarVisible` (includes user toggle) |
| `LayoutContext` interface | No `sidebar` field | Adds `sidebar: SidebarState` field |
| Import | No `useSidebarState` import | Imports `useSidebarState` and `SidebarState` type |
| `useMemo` deps | `[width, height]` | `[width, height, sidebar]` |
| Future comment | Line 31-32 contains TODO about future `useSidebarState()` | Removed — integrated |

**Backward compatibility:**

All existing consumers that destructure `{ width, breakpoint, contentHeight, sidebarVisible, sidebarWidth, modalWidth, modalHeight }` from `useLayout()` will continue to work unchanged. The only additions are the new `sidebar` field and the behavioral change where `sidebarVisible` now reflects user toggle state (which defaults to `null` / auto, producing the same initial behavior as before).

**Value table for derived properties:**

| Breakpoint | sidebar.visible (default) | sidebarWidth | modalWidth | modalHeight |
|------------|--------------------------|-------------|------------|-------------|
| `null`     | `false`                  | `"0%"`      | `"90%"`    | `"90%"`     |
| `"minimum"` | `false`                | `"0%"`      | `"90%"`    | `"90%"`     |
| `"standard"` | `true`               | `"25%"`     | `"60%"`    | `"60%"`     |
| `"standard"` (user toggled off) | `false` | `"0%"`  | `"60%"`    | `"60%"`     |
| `"large"`  | `true`                   | `"30%"`     | `"50%"`    | `"50%"`     |
| `"large"` (user toggled off) | `false`  | `"0%"`      | `"50%"`    | `"50%"`     |

---

### Step 5: Update `apps/tui/src/hooks/index.ts` — Barrel exports

**Status:** ⚠️ Existing file — add new exports

**Current content:**
```typescript
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
```

**Additions (append after existing exports):**
```typescript
export { useBreakpoint } from "./useBreakpoint.js";
export { useResponsiveValue, type ResponsiveValues } from "./useResponsiveValue.js";
export { useSidebarState, resolveSidebarVisibility, type SidebarState } from "./useSidebarState.js";
```

---

### Step 6: Migrate `apps/tui/src/components/AppShell.tsx` — Use `useLayout()`

**Status:** ⚠️ Migration — replace direct `getBreakpoint` call

**Current:**
```typescript
import React from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint } from "../types/breakpoint.js";
import { HeaderBar } from "./HeaderBar.js";
import { StatusBar } from "./StatusBar.js";
import { TerminalTooSmallScreen } from "./TerminalTooSmallScreen.js";

export function AppShell({ children }: { children?: React.ReactNode }) {
  const { width, height } = useTerminalDimensions();
  const bp = getBreakpoint(width, height);

  if (bp === null) {
    return <TerminalTooSmallScreen cols={width} rows={height} />;
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <HeaderBar />
      <box flexGrow={1} width="100%">
        {children}
      </box>
      <StatusBar />
    </box>
  );
}
```

**Target:**
```typescript
import React from "react";
import { useLayout } from "../hooks/useLayout.js";
import { HeaderBar } from "./HeaderBar.js";
import { StatusBar } from "./StatusBar.js";
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
    </box>
  );
}
```

**Changes:**
- Remove `useTerminalDimensions` import from `@opentui/react`
- Remove `getBreakpoint` import from `../types/breakpoint.js`
- Add `useLayout` import from `../hooks/useLayout.js`
- Replace `useTerminalDimensions() + getBreakpoint()` with `useLayout()`
- Replace `bp === null` with `!layout.breakpoint`
- Replace `width`/`height` with `layout.width`/`layout.height`

**Exception — `ErrorScreen.tsx` is NOT migrated:**
`ErrorScreen.tsx` calls `getBreakpoint()` directly because it may render outside the provider stack (e.g., in the error boundary before providers are mounted). This is acceptable and intentional — `ErrorScreen` cannot rely on React context since the error boundary catches errors from within the provider tree. No changes to this file.

---

## 4. Integration Points

### 4.1 KeybindingProvider / GlobalKeybindings — Ctrl+B toggle

The `Ctrl+B` sidebar toggle must be wired to `layout.sidebar.toggle` via the keybinding system. The global keybinding registration should include:

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

This integration is out of scope for this ticket but should be wired in the GlobalKeybindings component after this ticket lands.

### 4.2 StatusBar

The status bar already consumes `useLayout()` for `{ width, breakpoint }`. After this ticket, it can also use `layout.sidebarVisible` and `layout.sidebar.autoOverride` to dynamically display the Ctrl+B hint with appropriate state text.

### 4.3 ModalSystem

Modal/overlay components consume `useLayout().modalWidth` and `useLayout().modalHeight`. No changes needed — these values are unchanged.

### 4.4 Screen components with sidebars

Screens that render a sidebar+main split (code explorer, diff file tree) should use:
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

---

## 5. Unit & Integration Tests

### 5.1 Test file: `e2e/tui/app-shell.test.ts`

All responsive layout tests are co-located with app shell tests since the responsive system is part of the app shell's foundation. New `describe` blocks are appended after the existing `KeybindingProvider — Priority Dispatch` block.

**Testing approach:**

Pure functions (`getBreakpoint`, `resolveSidebarVisibility`) are tested via `bunEval` — Bun subprocess evaluation that runs `bun -e <expression>` in the TUI package context. This avoids React context requirements.

React hooks (`useBreakpoint`, `useResponsiveValue`, `useSidebarState`, `useLayout`) are tested indirectly via E2E scenarios that launch the real TUI at specific terminal dimensions and verify the rendered output reflects the expected breakpoint behavior. Per project policy, no mocking of implementation details.

**Note on existing tests:** 19 tests in `HOOK-LAY-001` through `HOOK-LAY-019` already test `getBreakpoint()` boundaries comprehensively. The new tests focus on the three new hooks and the sidebar state machine. Tests `HOOK-LAY-020` through `HOOK-LAY-038` already cover `useLayout` computed values and module resolution. Some of these existing tests may need adjustments if the `useLayout()` interface changes (e.g., new exports in the barrel), but the boundary value tests for `getBreakpoint()` are unaffected.

#### 5.1.1 `useBreakpoint` — Module resolution and hook availability

```typescript
describe("TUI_APP_SHELL — useBreakpoint hook", () => {
  test("HOOK-BP-001: useBreakpoint is importable from hooks barrel", async () => {
    const result = await bunEval(`
      const mod = await import("./src/hooks/index.js");
      console.log(typeof mod.useBreakpoint);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-BP-002: useBreakpoint is importable from direct path", async () => {
    const result = await bunEval(`
      const { useBreakpoint } = await import("./src/hooks/useBreakpoint.js");
      console.log(typeof useBreakpoint);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-BP-003: useBreakpoint.ts imports from @opentui/react", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useBreakpoint.ts")).text();
    expect(content).toContain('from "@opentui/react"');
  });

  test("HOOK-BP-004: useBreakpoint.ts imports getBreakpoint from types", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useBreakpoint.ts")).text();
    expect(content).toContain('from "../types/breakpoint.js"');
  });

  test("HOOK-BP-005: useBreakpoint.ts has zero useState calls", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useBreakpoint.ts")).text();
    expect(content).not.toContain("useState");
  });

  test("HOOK-BP-006: useBreakpoint.ts has zero useEffect calls", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useBreakpoint.ts")).text();
    expect(content).not.toContain("useEffect");
  });

  test("HOOK-BP-007: useBreakpoint.ts uses useMemo for memoization", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useBreakpoint.ts")).text();
    expect(content).toContain("useMemo");
  });
});
```

#### 5.1.2 `useResponsiveValue` — Value selection logic tests

Since `useResponsiveValue` is a React hook, the underlying selection logic (breakpoint lookup into a values map) is exercised through `bunEval` by reproducing the lookup logic:

```typescript
describe("TUI_APP_SHELL — useResponsiveValue hook", () => {
  test("HOOK-RV-001: useResponsiveValue is importable from hooks barrel", async () => {
    const result = await bunEval(`
      const mod = await import("./src/hooks/index.js");
      console.log(typeof mod.useResponsiveValue);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-RV-002: selects 'minimum' value at 80x24", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      const bp = getBreakpoint(80, 24);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBe("minimum");
    expect(parsed.selected).toBe(0);
  });

  test("HOOK-RV-003: selects 'standard' value at 120x40", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      const bp = getBreakpoint(120, 40);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBe("standard");
    expect(parsed.selected).toBe(2);
  });

  test("HOOK-RV-004: selects 'large' value at 200x60", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      const bp = getBreakpoint(200, 60);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBe("large");
    expect(parsed.selected).toBe(4);
  });

  test("HOOK-RV-005: returns undefined when below minimum and no fallback", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      const bp = getBreakpoint(60, 20);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected: selected === undefined ? "__undefined__" : selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBeNull();
    expect(parsed.selected).toBe("__undefined__");
  });

  test("HOOK-RV-006: returns fallback when below minimum", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      const bp = getBreakpoint(60, 20);
      const values = { minimum: 0, standard: 2, large: 4 };
      const fallback = -1;
      const selected = bp ? values[bp] : fallback;
      console.log(JSON.stringify({ selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe(-1);
  });

  test("HOOK-RV-007: works with string values", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      const bp = getBreakpoint(120, 40);
      const values = { minimum: "sm", standard: "md", large: "lg" };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe("md");
  });

  test("HOOK-RV-008: works with boolean values", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      const bp = getBreakpoint(80, 24);
      const values = { minimum: false, standard: true, large: true };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ selected }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe(false);
  });

  test("HOOK-RV-009: useResponsiveValue.ts has zero useEffect calls", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useResponsiveValue.ts")).text();
    expect(content).not.toContain("useEffect");
  });
});
```

#### 5.1.3 `resolveSidebarVisibility` — State resolution logic tests

The pure `resolveSidebarVisibility` function is tested directly via `bunEval`:

```typescript
describe("TUI_APP_SHELL — resolveSidebarVisibility pure function", () => {
  test("HOOK-SB-001: sidebar hidden when breakpoint is null", async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import("./src/hooks/useSidebarState.js");
      console.log(JSON.stringify(resolveSidebarVisibility(null, null)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(true);
  });

  test("HOOK-SB-002: sidebar hidden at minimum breakpoint", async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import("./src/hooks/useSidebarState.js");
      console.log(JSON.stringify(resolveSidebarVisibility("minimum", null)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(true);
  });

  test("HOOK-SB-003: sidebar hidden at minimum even with user preference true", async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import("./src/hooks/useSidebarState.js");
      console.log(JSON.stringify(resolveSidebarVisibility("minimum", true)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(true);
  });

  test("HOOK-SB-004: sidebar visible at standard with no user preference", async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import("./src/hooks/useSidebarState.js");
      console.log(JSON.stringify(resolveSidebarVisibility("standard", null)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(true);
    expect(parsed.autoOverride).toBe(false);
  });

  test("HOOK-SB-005: sidebar hidden at standard with user preference false", async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import("./src/hooks/useSidebarState.js");
      console.log(JSON.stringify(resolveSidebarVisibility("standard", false)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(false);
  });

  test("HOOK-SB-006: sidebar visible at large with no user preference", async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import("./src/hooks/useSidebarState.js");
      console.log(JSON.stringify(resolveSidebarVisibility("large", null)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(true);
    expect(parsed.autoOverride).toBe(false);
  });

  test("HOOK-SB-007: sidebar visible at standard with user preference true", async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import("./src/hooks/useSidebarState.js");
      console.log(JSON.stringify(resolveSidebarVisibility("standard", true)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(true);
    expect(parsed.autoOverride).toBe(false);
  });

  test("HOOK-SB-008: sidebar hidden at large with user preference false", async () => {
    const result = await bunEval(`
      const { resolveSidebarVisibility } = await import("./src/hooks/useSidebarState.js");
      console.log(JSON.stringify(resolveSidebarVisibility("large", false)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(false);
  });

  test("HOOK-SB-009: resolveSidebarVisibility is importable from hooks barrel", async () => {
    const result = await bunEval(`
      const mod = await import("./src/hooks/index.js");
      console.log(typeof mod.resolveSidebarVisibility);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-SB-010: useSidebarState is importable from hooks barrel", async () => {
    const result = await bunEval(`
      const mod = await import("./src/hooks/index.js");
      console.log(typeof mod.useSidebarState);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-SB-011: useSidebarState.ts has zero useEffect calls", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useSidebarState.ts")).text();
    expect(content).not.toContain("useEffect");
  });

  test("HOOK-SB-012: useSidebarState.ts imports useBreakpoint from local hook", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useSidebarState.ts")).text();
    expect(content).toContain('from "./useBreakpoint.js"');
  });
});
```

#### 5.1.4 `useLayout` — Updated derived layout values tests

These tests verify the `getSidebarWidth` function now respects visibility (not just breakpoint), and that the `sidebar` field is exposed on the `LayoutContext`:

```typescript
describe("TUI_APP_SHELL — useLayout sidebar integration", () => {
  test("HOOK-LAY-039: sidebarWidth returns '0%' when visibility is false at standard", async () => {
    const result = await bunEval(`
      function getSidebarWidth(bp, visible) {
        if (!visible) return "0%";
        switch (bp) {
          case "large": return "30%";
          case "standard": return "25%";
          default: return "0%";
        }
      }
      console.log(JSON.stringify({
        visibleStandard: getSidebarWidth("standard", true),
        hiddenStandard: getSidebarWidth("standard", false),
        visibleLarge: getSidebarWidth("large", true),
        hiddenLarge: getSidebarWidth("large", false),
        visibleMinimum: getSidebarWidth("minimum", true),
        hiddenNull: getSidebarWidth(null, false),
      }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visibleStandard).toBe("25%");
    expect(parsed.hiddenStandard).toBe("0%");
    expect(parsed.visibleLarge).toBe("30%");
    expect(parsed.hiddenLarge).toBe("0%");
    expect(parsed.visibleMinimum).toBe("0%");
    expect(parsed.hiddenNull).toBe("0%");
  });

  test("HOOK-LAY-040: useLayout.ts imports useSidebarState", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useLayout.ts")).text();
    expect(content).toContain('from "./useSidebarState.js"');
  });

  test("HOOK-LAY-041: useLayout.ts no longer has inline sidebarVisible derivation", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useLayout.ts")).text();
    // The old pattern was: breakpoint !== null && breakpoint !== "minimum"
    // This should no longer appear — sidebar state comes from useSidebarState
    expect(content).not.toContain('breakpoint !== null && breakpoint !== "minimum"');
  });

  test("HOOK-LAY-042: LayoutContext interface includes sidebar field", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useLayout.ts")).text();
    expect(content).toContain("sidebar: SidebarState");
  });

  test("HOOK-LAY-043: AppShell.tsx imports useLayout instead of getBreakpoint", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/AppShell.tsx")).text();
    expect(content).toContain('from "../hooks/useLayout.js"');
    expect(content).not.toContain('from "../types/breakpoint.js"');
    expect(content).not.toContain("getBreakpoint");
  });

  test("HOOK-LAY-044: AppShell.tsx does not import useTerminalDimensions directly", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/AppShell.tsx")).text();
    expect(content).not.toContain("useTerminalDimensions");
  });

  test("HOOK-LAY-045: ErrorScreen.tsx still uses getBreakpoint directly (acceptable)", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/ErrorScreen.tsx")).text();
    expect(content).toContain("getBreakpoint");
    // ErrorScreen renders outside provider stack — direct usage is intentional
  });

  test("HOOK-LAY-046: tsc --noEmit passes with new hook files", async () => {
    const result = await run(["bun", "run", "check"]);
    if (result.exitCode !== 0) {
      console.error("tsc stderr:", result.stderr);
      console.error("tsc stdout:", result.stdout);
    }
    expect(result.exitCode).toBe(0);
  }, 30_000);
});
```

#### 5.1.5 E2E sidebar toggle tests

These tests launch the real TUI and verify sidebar behavior through rendered output:

```typescript
describe("TUI_APP_SHELL — sidebar toggle E2E", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  test("RESP-SB-001: Ctrl+B toggles sidebar off at standard breakpoint", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const beforeSnapshot = terminal.snapshot();
    await terminal.sendKeys("ctrl+b");
    const afterSnapshot = terminal.snapshot();
    expect(beforeSnapshot).not.toBe(afterSnapshot);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-SB-002: Ctrl+B toggles sidebar back on at standard breakpoint", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("ctrl+b"); // hide
    await terminal.sendKeys("ctrl+b"); // show
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-SB-003: Ctrl+B is no-op at minimum breakpoint", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    const before = terminal.snapshot();
    await terminal.sendKeys("ctrl+b");
    const after = terminal.snapshot();
    expect(before).toBe(after);
  });

  test("RESP-SB-004: user preference survives resize through minimum", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("ctrl+b"); // hide sidebar
    await terminal.resize(80, 24);    // minimum - auto-hidden
    await terminal.waitForText("Dashboard");
    await terminal.resize(120, 40);   // back to standard - preference should persist
    await terminal.waitForText("Dashboard");
    // Sidebar should still be hidden because user toggled it off
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-SB-005: sidebar shows at large breakpoint with wider width", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-SB-006: Ctrl+B restores sidebar after toggle off then on", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    const initial = terminal.snapshot();
    await terminal.sendKeys("ctrl+b"); // hide
    await terminal.sendKeys("ctrl+b"); // show
    const restored = terminal.snapshot();
    // Layout should match initial state after toggle cycle
    expect(restored).toBe(initial);
  });
});
```

---

## 6. Productionization Checklist

### 6.1 File creation and modification summary

| File | Action | Lines (approx) | Purpose |
|------|--------|----|--------|
| `apps/tui/src/hooks/useBreakpoint.ts` | **Create** | ~20 | Reactive breakpoint hook wrapping `getBreakpoint()` + `useTerminalDimensions()` |
| `apps/tui/src/hooks/useResponsiveValue.ts` | **Create** | ~45 | Generic breakpoint-to-value mapper |
| `apps/tui/src/hooks/useSidebarState.ts` | **Create** | ~100 | Sidebar visibility state machine with user toggle + auto-collapse |
| `apps/tui/src/hooks/useLayout.ts` | **Modify** | ~140 | Integrate `useSidebarState()`, add `sidebar` to `LayoutContext`, update `getSidebarWidth` signature |
| `apps/tui/src/hooks/index.ts` | **Modify** | +3 lines | Add barrel exports for three new hooks |
| `apps/tui/src/components/AppShell.tsx` | **Modify** | ~26 | Migrate from `getBreakpoint()` to `useLayout()` |
| `apps/tui/src/types/breakpoint.ts` | No change | — | Already complete |
| `apps/tui/src/types/index.ts` | No change | — | Already complete |

### 6.2 Step-by-step implementation order

The implementation order matters due to import dependencies:

1. **Create `useBreakpoint.ts`** — depends only on `@opentui/react` and `types/breakpoint.ts` (both exist)
2. **Create `useResponsiveValue.ts`** — depends on `useBreakpoint.ts` (just created)
3. **Create `useSidebarState.ts`** — depends on `useBreakpoint.ts` (just created)
4. **Modify `useLayout.ts`** — depends on `useSidebarState.ts` (just created)
5. **Modify `hooks/index.ts`** — add barrel exports for all three new hooks
6. **Modify `AppShell.tsx`** — replace `getBreakpoint()` with `useLayout()`
7. **Run `tsc --noEmit`** to verify type safety
8. **Write tests** in `e2e/tui/app-shell.test.ts`

### 6.3 Impact on existing tests

**Tests that may need updating:**

The existing test `HOOK-LAY-025` tests `getSidebarWidth` with the OLD signature (breakpoint only). After Step 4, `getSidebarWidth` takes `(breakpoint, sidebarVisible)`. Since `getSidebarWidth` is module-private and the test reimplements the logic inline via `bunEval`, the test is unaffected — it tests its own inline implementation, not the module's. However, the behavioral contract it documents is now incomplete. Consider updating the test description or adding `HOOK-LAY-039` (defined in section 5.1.4) as the authoritative test for the new signature.

The existing test `HOOK-LAY-022` through `HOOK-LAY-024` test `sidebarVisible` derivation using the OLD logic (`breakpoint !== null && breakpoint !== "minimum"`). After Step 4, the same logic still produces the same results when `userPreference` is `null` (the default). These tests remain valid because they test the default behavior path. No changes needed.

The existing test `HOOK-LAY-030` checks that existing exports remain in the hooks barrel. After Step 5, new exports are added but existing ones are unchanged. This test remains valid.

### 6.4 Performance validation

- **No debounce**: Resize events trigger synchronous re-render via `useTerminalDimensions`'s internal `useOnResize` subscription. The existing `RESP-LAY-015` rapid resize test (and new `RESP-SB-004` resize-through-minimum test) verifies this doesn't crash.
- **Memoization**: All hooks use `useMemo` to prevent unnecessary re-renders:
  - `useBreakpoint`: `useMemo([width, height])` — stable when dimensions are within same breakpoint band
  - `useResponsiveValue`: `useMemo([breakpoint, values, fallback])` — stable when breakpoint hasn't changed
  - `useSidebarState`: `useMemo([breakpoint, userPreference])` for resolution, `useMemo([visible, userPreference, autoOverride, toggle])` for return object
  - `useLayout`: `useMemo([width, height, sidebar])` — recomputes on any dimension change or sidebar state change
- **No effects in hot path**: All four hooks have zero `useEffect` calls. Only `useState` for user preference in `useSidebarState`.
- **Zero allocations on stable state**: When dimensions haven't changed and no toggle has occurred, all hooks return the same memoized references.

### 6.5 Tree-shaking

All exports are named exports (no default exports). The barrel re-export in `hooks/index.ts` uses named re-exports. Bun's bundler can tree-shake unused hooks. Consumers that only need `useBreakpoint` won't pull in `useSidebarState`'s `useState` import.

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
        │                 ├── AppShell.tsx (migrated from getBreakpoint())
        │                 ├── HeaderBar.tsx
        │                 ├── StatusBar.tsx
        │                 ├── FullScreenLoading.tsx
        │                 ├── FullScreenError.tsx
        │                 ├── PaginationIndicator.tsx
        │                 ├── SkeletonList.tsx
        │                 └── SkeletonDetail.tsx
        │
        └── getBreakpoint() direct callers (bypassing hooks):
            └── ErrorScreen.tsx (acceptable — outside provider stack)
```

---

## 8. File Summary

### Production files

| File | Action | Lines (approx) | Status |
|------|--------|--------|--------|
| `apps/tui/src/types/breakpoint.ts` | None | 33 | ✅ Complete |
| `apps/tui/src/types/index.ts` | None | 2 | ✅ Complete |
| `apps/tui/src/hooks/useBreakpoint.ts` | **Create** | 20 | ❌ New |
| `apps/tui/src/hooks/useResponsiveValue.ts` | **Create** | 45 | ❌ New |
| `apps/tui/src/hooks/useSidebarState.ts` | **Create** | 100 | ❌ New |
| `apps/tui/src/hooks/useLayout.ts` | **Modify** | 140 | ⚠️ Evolve to integrate sidebar |
| `apps/tui/src/hooks/index.ts` | **Modify** | +3 lines | ⚠️ Add barrel exports |
| `apps/tui/src/components/AppShell.tsx` | **Modify** | 26 | ⚠️ Migrate to useLayout() |

### Test additions to existing file

| File | Test groups added | Test count |
|------|-------------------|------------|
| `e2e/tui/app-shell.test.ts` | `TUI_APP_SHELL — useBreakpoint hook` | 7 |
| | `TUI_APP_SHELL — useResponsiveValue hook` | 9 |
| | `TUI_APP_SHELL — resolveSidebarVisibility pure function` | 12 |
| | `TUI_APP_SHELL — useLayout sidebar integration` | 8 |
| | `TUI_APP_SHELL — sidebar toggle E2E` | 6 |

**Total new tests: 42**  
**Existing tests in file: 412**  
**Total after merge: 454**

---

## 9. Acceptance Criteria

1. `getBreakpoint(cols, rows)` returns `null` for <80×24, `"minimum"` for 80×24–119×39, `"standard"` for 120×40–199×59, `"large"` for 200×60+. (Already passing — no changes.)
2. `useBreakpoint()` exists at `apps/tui/src/hooks/useBreakpoint.ts` and returns the current breakpoint reactively, updating on terminal resize with no debounce.
3. `useResponsiveValue({ minimum, standard, large })` exists at `apps/tui/src/hooks/useResponsiveValue.ts` and returns the correct value for the current breakpoint, or fallback/undefined below minimum.
4. `useSidebarState()` exists at `apps/tui/src/hooks/useSidebarState.ts` and tracks user toggle preference separately from auto-collapse. `resolveSidebarVisibility` is exported for direct testing.
5. Sidebar is auto-hidden at minimum/unsupported and Ctrl+B toggle is a no-op at those breakpoints.
6. User sidebar preference survives resize transitions through minimum and back.
7. `useLayout()` returns a composite object with all layout values including the new `sidebar: SidebarState` field.
8. `useLayout()` integrates `useSidebarState()` — `sidebarVisible` reflects both auto-collapse AND user toggle.
9. `getSidebarWidth` returns `"0%"` when user has toggled sidebar off (not just when breakpoint forces it).
10. `AppShell.tsx` is migrated to use `useLayout()` instead of calling `getBreakpoint()` directly.
11. `ErrorScreen.tsx` continues to call `getBreakpoint()` directly (intentional — renders outside provider stack).
12. All layout recalculations are synchronous — no debounce, no animation, no `useEffect` in the hot path.
13. All hooks are memoized and return stable references when inputs haven't changed.
14. All three new hooks are exported from `apps/tui/src/hooks/index.ts` barrel.
15. All 42 new tests pass (or fail only due to unimplemented backend features, never skipped).
16. `tsc --noEmit` passes with all new files.
17. No new runtime dependencies introduced. Only imports from `react`, `@opentui/react`, and local modules.
18. Test IDs (`HOOK-BP-*`, `HOOK-RV-*`, `HOOK-SB-*`, `HOOK-LAY-039+`, `RESP-SB-*`) do not collide with existing test IDs.