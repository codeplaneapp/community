# Engineering Specification: `useLayout` Hook with Breakpoint Detection

**Ticket:** `tui-layout-hook`
**Title:** Implement useLayout hook with breakpoint detection and responsive values
**Dependencies:** `tui-foundation-scaffold`, `tui-util-text`
**Target:** `apps/tui/src/hooks/useLayout.ts`
**Tests:** `e2e/tui/app-shell.test.ts` (layout & breakpoint section, appended to existing file)

---

## 1. Overview

The `useLayout` hook is the single entry point for all responsive layout decisions in the Codeplane TUI. Every component that adapts to terminal dimensions — sidebar visibility, modal sizing, content area height, column truncation — consumes this hook instead of independently querying `useTerminalDimensions()` and computing breakpoints ad hoc.

This ticket introduces:

1. A canonical `Breakpoint` type and `getBreakpoint()` pure function at `apps/tui/src/types/breakpoint.ts`
2. A `useLayout()` hook at `apps/tui/src/hooks/useLayout.ts` that returns pre-computed, memoized layout values
3. A barrel export at `apps/tui/src/types/index.ts`
4. Updated barrel at `apps/tui/src/hooks/index.ts` (file already exists — append exports)
5. Tests appended to the existing `e2e/tui/app-shell.test.ts` covering all breakpoint boundaries, computed values, responsive behavior, and resize transitions

Downstream consumers read semantic properties (`sidebarVisible`, `modalWidth`) instead of re-deriving breakpoints inline.

---

## 2. Existing Code Audit

### 2.1 What exists today (deployed in `apps/tui/src/`)

| File | Location | Status |
|------|----------|--------|
| `hooks/index.ts` | `apps/tui/src/hooks/index.ts` | ✅ Deployed — 13 lines. Exports `useDiffSyntaxStyle`, `useTheme`, `useColorTier`, `useSpinner`, `BRAILLE_FRAMES`, `ASCII_FRAMES`, `BRAILLE_INTERVAL_MS`, `ASCII_INTERVAL_MS`. |
| `hooks/useDiffSyntaxStyle.ts` | `apps/tui/src/hooks/useDiffSyntaxStyle.ts` | ✅ Deployed. Establishes hook patterns: `useMemo` for memoization, `useRef` + `useEffect` for cleanup of native resources. |
| `hooks/useTheme.ts` | `apps/tui/src/hooks/useTheme.ts` | ✅ Deployed. Hook for accessing theme context. |
| `hooks/useColorTier.ts` | `apps/tui/src/hooks/useColorTier.ts` | ✅ Deployed. Hook for detecting color tier. |
| `hooks/useSpinner.ts` | `apps/tui/src/hooks/useSpinner.ts` | ✅ Deployed. Spinner animation hook with braille/ASCII frames. |
| `screens/Agents/types.ts` | `apps/tui/src/screens/Agents/types.ts` | ✅ Deployed — 16 lines. Exports `MessageRole`, `MessagePart`, `AgentMessage`, and `Breakpoint = "minimum" \| "standard" \| "large"` (local, no `getBreakpoint()`). |
| `screens/Agents/utils/formatTimestamp.ts` | `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` | ✅ Deployed — 33 lines. Imports `Breakpoint` from `../types` (Agents local barrel). Uses breakpoint for responsive timestamp formatting. |
| `theme/detect.ts` | `apps/tui/src/theme/detect.ts` | ✅ Deployed. `detectColorCapability()`, `isUnicodeSupported()`. |
| `theme/tokens.ts` | `apps/tui/src/theme/tokens.ts` | ✅ Deployed. `createTheme()`, semantic color tokens. |
| `providers/ThemeProvider.tsx` | `apps/tui/src/providers/ThemeProvider.tsx` | ✅ Deployed. ThemeContext provider wrapping children. |
| `e2e/tui/helpers.ts` | `e2e/tui/helpers.ts` | ✅ Deployed — 492 lines. Full `@microsoft/tui-test` integration with `launchTUI()`, `TUITestInstance`, `bunEval()`, `run()`, credential helpers, key resolution. |
| `e2e/tui/app-shell.test.ts` | `e2e/tui/app-shell.test.ts` | ✅ Deployed — 1333 lines. Tests for package scaffold, TypeScript compilation, dependency resolution, E2E infrastructure, color detection, theme tokens, ThemeProvider, and useSpinner. |

### 2.2 What exists in specs (reference implementations in `specs/tui/`)

| File | Location | Status |
|------|----------|--------|
| `types/breakpoint.ts` | `specs/tui/apps/tui/src/types/breakpoint.ts` | ✅ Complete — 33 lines. Exports `Breakpoint` type and `getBreakpoint()` (returns `null` for unsupported). |
| `types/index.ts` | `specs/tui/apps/tui/src/types/index.ts` | ✅ Complete — 2 lines. Barrel exports. |
| `hooks/useLayout.ts` | `specs/tui/apps/tui/src/hooks/useLayout.ts` | ✅ Complete — 137 lines. Composes `useSidebarState()` for sidebar toggle state. Includes `sidebar: SidebarState` field. |
| `hooks/useBreakpoint.ts` | `specs/tui/apps/tui/src/hooks/useBreakpoint.ts` | ✅ Complete — 22 lines. Thin wrapper: `useTerminalDimensions()` → `getBreakpoint()`. |
| `hooks/useSidebarState.ts` | `specs/tui/apps/tui/src/hooks/useSidebarState.ts` | ✅ Complete — 103 lines. Manages user `Ctrl+B` toggle preference + auto-collapse at minimum breakpoint. |
| `hooks/useResponsiveValue.ts` | `specs/tui/apps/tui/src/hooks/useResponsiveValue.ts` | ✅ Complete — 48 lines. Generic breakpoint→value resolver. |
| `hooks/index.ts` | `specs/tui/apps/tui/src/hooks/index.ts` | ✅ Complete — 85 lines. Barrel exports for ALL hooks (many not yet deployed). |

### 2.3 What does NOT exist in deployed code

- No `apps/tui/src/types/` directory (must be created)
- No `useLayout` hook anywhere in `apps/tui/src/`
- No `getBreakpoint()` function anywhere in `apps/tui/src/`
- No breakpoint detection logic outside `screens/Agents/types.ts`

### 2.4 Duplicate `Breakpoint` type — migration note

The `Breakpoint` type in `apps/tui/src/screens/Agents/types.ts` (line 16) is a local duplicate that will be superseded by the canonical type at `apps/tui/src/types/breakpoint.ts`. The two types are identical in shape (`"minimum" | "standard" | "large"`). Migrating existing consumers (`formatTimestamp.ts`) to import from `../../types/breakpoint.js` is a **follow-up task** (not in scope for this ticket) to avoid coupling this ticket to the Agents screen.

### 2.5 Dependencies from OpenTUI

| Hook | Package | Signature | Verified Source |
|------|---------|-----------|--------|
| `useTerminalDimensions()` | `@opentui/react` (v0.1.90) | `() => { width: number; height: number }` | `context/opentui/packages/react/src/hooks/use-terminal-dimensions.ts` |
| `useOnResize()` | `@opentui/react` (v0.1.90) | `(callback: (width: number, height: number) => void) => CliRenderer` | `context/opentui/packages/react/src/hooks/use-resize.ts` |

**Verified implementation of `useTerminalDimensions`:** Uses `useState` initialized from `renderer.width`/`renderer.height`, calls `useOnResize()` internally to update state on `SIGWINCH`. Returns `{ width, height }` which triggers React re-renders when dimensions change. The `useLayout` hook does **NOT** need `useOnResize()` separately — it derives computed values from the reactive `width`/`height` returned by `useTerminalDimensions()`, and React's re-render on state change handles the rest.

### 2.6 Reference implementation discrepancy: `null` vs `"unsupported"`

The ticket description specifies `Breakpoint` type as `'unsupported' | 'minimum' | 'standard' | 'large'`. The reference implementation at `specs/tui/apps/tui/src/types/breakpoint.ts` uses `Breakpoint = "minimum" | "standard" | "large"` with `getBreakpoint()` returning `Breakpoint | null` where `null` represents unsupported. **This spec follows the reference implementation's `null` pattern** because:

1. It matches the existing spec codebase that all downstream hooks already consume
2. `null` provides cleaner conditional checks: `if (!breakpoint)` vs `if (breakpoint === "unsupported")`
3. `null` keeps the `Breakpoint` union type clean as `"minimum" | "standard" | "large"` — three valid operational breakpoints
4. The existing deployed `Breakpoint` type in `screens/Agents/types.ts` already uses `"minimum" | "standard" | "large"` without `"unsupported"` — maintaining consistency

The ticket description's `"unsupported"` string is treated as a conceptual label, not a literal implementation directive.

---

## 3. Implementation Plan

### Step 1: Create the `types/` directory and `Breakpoint` type

**File:** `apps/tui/src/types/breakpoint.ts` (CREATE)

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

**Rationale for OR logic:** A 200-column × 20-row terminal has plenty of width but cannot fit the standard vertical layout. The narrower constraint wins. Similarly, a 100-column × 60-row terminal has vertical space but insufficient width for standard sidebar+content layout.

**Source:** Copied verbatim from `specs/tui/apps/tui/src/types/breakpoint.ts` (verified: 33 lines, identical content).

### Step 2: Create the types barrel

**File:** `apps/tui/src/types/index.ts` (CREATE)

```typescript
export { getBreakpoint } from "./breakpoint.js";
export type { Breakpoint } from "./breakpoint.js";
```

**Source:** Copied verbatim from `specs/tui/apps/tui/src/types/index.ts`.

### Step 3: Create the `useLayout` hook

**File:** `apps/tui/src/hooks/useLayout.ts` (CREATE)

The ticket description says `sidebarVisible` is simply `breakpoint !== 'minimum'`. The reference implementation composes `useSidebarState()` which adds `Ctrl+B` toggle support and a `sidebar: SidebarState` field. Since `useSidebarState` depends on `useBreakpoint` (another hook not yet deployed), and the `Ctrl+B` toggle is a **separate concern**, this ticket implements the **self-contained version** matching the ticket description exactly.

```typescript
import { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";

/**
 * Responsive layout context returned by useLayout().
 *
 * All values are derived from the current terminal dimensions and
 * recalculate synchronously on resize (no debounce, no animation).
 */
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
   * Whether the sidebar (file tree, navigation panel) should be visible.
   * Hidden when breakpoint is null or "minimum" to maximize content
   * area width.
   *
   * Future: will incorporate user Ctrl+B toggle preference via
   * useSidebarState() when that hook is deployed.
   */
  sidebarVisible: boolean;
  /**
   * Sidebar width as a CSS-like percentage string.
   * - null / "minimum": "0%" (sidebar hidden)
   * - "standard": "25%"
   * - "large": "30%"
   *
   * Consumers pass this directly to OpenTUI's `<box width={...}>`.
   */
  sidebarWidth: string;
  /**
   * Modal overlay width as a percentage string.
   * Wider at smaller breakpoints to maximize usable space.
   * - null / "minimum": "90%"
   * - "standard": "60%"
   * - "large": "50%"
   */
  modalWidth: string;
  /**
   * Modal overlay height as a percentage string.
   * Follows the same scaling as modalWidth.
   */
  modalHeight: string;
}

/**
 * Derive sidebar width from breakpoint.
 * Returns "0%" when sidebar is not visible, so consumers can
 * always use the value without checking sidebarVisible separately.
 */
function getSidebarWidth(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "30%";
    case "standard": return "25%";
    case "minimum":
    default:         return "0%";
  }
}

/**
 * Derive modal width from breakpoint.
 */
function getModalWidth(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "50%";
    case "standard": return "60%";
    default:         return "90%";
  }
}

/**
 * Derive modal height from breakpoint.
 */
function getModalHeight(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "50%";
    case "standard": return "60%";
    default:         return "90%";
  }
}

/**
 * Central responsive layout hook for the Codeplane TUI.
 *
 * Reads terminal dimensions from `@opentui/react`'s
 * `useTerminalDimensions()` and returns a memoized set of
 * breakpoint-aware layout values. The object recalculates
 * synchronously on terminal resize — no debounce, no animation.
 *
 * This hook is the ONLY place where breakpoint → layout value
 * mapping is defined. Components must NOT duplicate this logic.
 * If a component needs a responsive value not covered here, it
 * should be added to LayoutContext, not computed inline.
 *
 * @example
 * ```tsx
 * function MyScreen() {
 *   const layout = useLayout();
 *   if (!layout.breakpoint) return <TerminalTooSmall />;
 *
 *   return (
 *     <box flexDirection="row" height={layout.contentHeight}>
 *       {layout.sidebarVisible && (
 *         <box width={layout.sidebarWidth}><FileTree /></box>
 *       )}
 *       <box flexGrow={1}><Content /></box>
 *     </box>
 *   );
 * }
 * ```
 */
export function useLayout(): LayoutContext {
  const { width, height } = useTerminalDimensions();

  return useMemo((): LayoutContext => {
    const breakpoint = getBreakpoint(width, height);
    const sidebarVisible = breakpoint !== null && breakpoint !== "minimum";
    return {
      width,
      height,
      breakpoint,
      contentHeight: Math.max(0, height - 2),
      sidebarVisible,
      sidebarWidth: getSidebarWidth(breakpoint),
      modalWidth: getModalWidth(breakpoint),
      modalHeight: getModalHeight(breakpoint),
    };
  }, [width, height]);
}
```

### Step 4: Update the hooks barrel export

**File:** `apps/tui/src/hooks/index.ts` (EDIT — file already exists with 13 lines)

Append `useLayout` and `LayoutContext` exports to the existing barrel file. The existing exports are:
- `useDiffSyntaxStyle`
- `useTheme`
- `useColorTier`
- `useSpinner` + constants

**Updated file content:**

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
```

### Step 5: Append tests to existing `e2e/tui/app-shell.test.ts`

**File:** `e2e/tui/app-shell.test.ts` (EDIT — append new describe blocks after line 1333)

The test file already exists with 1333 lines covering the foundation scaffold, color detection, theme tokens, ThemeProvider, and useSpinner. New layout/breakpoint tests are appended as additional `describe()` blocks.

The `e2e/tui/helpers.ts` file already exists with the full `@microsoft/tui-test` integration including `launchTUI()`, `bunEval()`, `run()`, `TERMINAL_SIZES`, etc. **No changes to helpers.ts are needed.**

See Section 5 for full test specification.

---

## 4. Design Decisions & Rationale

### 4.1 Why `useMemo` instead of raw computation

The `useLayout` hook is expected to be called by 10–20 components simultaneously (AppShell, HeaderBar, StatusBar, every screen, every modal). While the computation itself is trivial, returning a new object reference on every render would cause all consumers to re-render on every parent re-render, even if dimensions haven't changed. `useMemo([width, height])` ensures the object reference is stable unless dimensions actually change.

### 4.2 Why NOT a React context (for this ticket)

A context provider (`LayoutProvider`) was considered and rejected for this ticket:

- **Premature complexity.** The hook is pure — it reads from `useTerminalDimensions()` (which is itself context-based in OpenTUI, using `useRenderer()` internally) and computes derived values. There is no shared state to propagate.
- **No prop drilling problem.** Any component can call `useLayout()` directly.
- **Future upgrade path.** When `useSidebarState` adds `Ctrl+B` toggle state, a `LayoutProvider` context can wrap `useLayout` without changing any consumer call sites.

### 4.3 Why `contentHeight` is `height - 2`

The AppShell layout reserves exactly 2 rows:
- 1 row for `HeaderBar` (breadcrumb, repo context, badges)
- 1 row for `StatusBar` (keybinding hints, sync status, notification count)

The content area fills the remaining space. At 80×24, `contentHeight = 22`. The `Math.max(0, ...)` guard prevents negative values in edge cases where height < 2 (which would already be unsupported by `getBreakpoint`).

### 4.4 Why sidebar returns `"0%"` at minimum instead of just being hidden

When `sidebarVisible` is `false`, the sidebar component is not rendered. However, some layout calculations need the sidebar width value regardless (e.g., for computing main content width). Returning `"0%"` keeps the interface consistent — consumers always have a valid width string.

### 4.5 Why `getBreakpoint` uses OR (not AND) for thresholds

The breakpoint classification says `cols < 120 || rows < 40` → `"minimum"`. A 200-column × 30-row terminal is still classified as "minimum" because layout requires BOTH sufficient width AND height. Verified: both the architecture spec and the reference implementation use this OR logic.

### 4.6 `useOnResize` is NOT needed

`useTerminalDimensions()` from `@opentui/react` already triggers a React re-render when the terminal is resized. Its implementation (verified in `context/opentui/packages/react/src/hooks/use-terminal-dimensions.ts`) internally calls `useOnResize(cb)` where `cb` calls `setDimensions`. Adding `useOnResize()` in `useLayout` would be redundant.

### 4.7 Why helper functions are module-private, not exported

`getSidebarWidth()`, `getModalWidth()`, and `getModalHeight()` are implementation details. No consumer should call them directly. Keeping them private allows refactoring without breaking external contracts.

### 4.8 Self-contained `useLayout` vs reference implementation's `useSidebarState` composition

The reference implementation's `useLayout` imports `useSidebarState` which manages `Ctrl+B` toggle state and a `sidebar: SidebarState` field. This ticket implements the simpler self-contained version per the ticket description (`sidebarVisible` is `breakpoint !== 'minimum'`). The evolution path is:

1. **This ticket:** `sidebarVisible = breakpoint !== null && breakpoint !== "minimum"` (no toggle)
2. **Future ticket (sidebar state):** Deploy `useBreakpoint()` and `useSidebarState()` hooks
3. **Future ticket (sidebar integration):** Update `useLayout` to compose `useSidebarState()`, adding `sidebar: SidebarState` field and making `sidebarVisible` toggle-aware

The `LayoutContext` interface is forward-compatible — adding `sidebar: SidebarState` is additive and does not break existing destructuring patterns.

---

## 5. Unit & Integration Tests

**Test file:** `e2e/tui/app-shell.test.ts` (APPEND to existing 1333-line file)

All tests follow the project testing philosophy:
- Tests that fail due to unimplemented backends are left failing — never skipped or commented out.
- Each test validates one user-facing behavior.
- No mocking of implementation details.
- Pure function tests pass immediately; E2E tests may fail until dependent components are implemented.

### 5.1 Pure function tests: `getBreakpoint()`

These tests validate `getBreakpoint()` as a pure function imported directly. They do not require launching the TUI and will pass immediately upon implementation.

```typescript
import { getBreakpoint } from "../../apps/tui/src/types/breakpoint.js";

// ---------------------------------------------------------------------------
// TUI_APP_SHELL — Breakpoint detection (types/breakpoint.ts)
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — getBreakpoint pure function", () => {
  // ── Unsupported boundaries ────────────────────────────────

  test("HOOK-LAY-001: returns null for 79x24 (below minimum cols)", () => {
    expect(getBreakpoint(79, 24)).toBeNull();
  });

  test("HOOK-LAY-002: returns null for 80x23 (below minimum rows)", () => {
    expect(getBreakpoint(80, 23)).toBeNull();
  });

  test("HOOK-LAY-003: returns null for 79x23 (both below)", () => {
    expect(getBreakpoint(79, 23)).toBeNull();
  });

  test("HOOK-LAY-004: returns null for 0x0", () => {
    expect(getBreakpoint(0, 0)).toBeNull();
  });

  // ── Minimum boundaries ────────────────────────────────────

  test("HOOK-LAY-005: returns 'minimum' for 80x24 (exact lower bound)", () => {
    expect(getBreakpoint(80, 24)).toBe("minimum");
  });

  test("HOOK-LAY-006: returns 'minimum' for 119x39 (exact upper bound)", () => {
    expect(getBreakpoint(119, 39)).toBe("minimum");
  });

  test("HOOK-LAY-007: returns 'minimum' for 200x30 (wide but short)", () => {
    expect(getBreakpoint(200, 30)).toBe("minimum");
  });

  test("HOOK-LAY-008: returns 'minimum' for 100x60 (tall but narrow)", () => {
    expect(getBreakpoint(100, 60)).toBe("minimum");
  });

  // ── Standard boundaries ───────────────────────────────────

  test("HOOK-LAY-009: returns 'standard' for 120x40 (exact lower bound)", () => {
    expect(getBreakpoint(120, 40)).toBe("standard");
  });

  test("HOOK-LAY-010: returns 'standard' for 199x59 (exact upper bound)", () => {
    expect(getBreakpoint(199, 59)).toBe("standard");
  });

  test("HOOK-LAY-011: returns 'standard' for 150x50 (mid-range)", () => {
    expect(getBreakpoint(150, 50)).toBe("standard");
  });

  // ── Large boundaries ──────────────────────────────────────

  test("HOOK-LAY-012: returns 'large' for 200x60 (exact lower bound)", () => {
    expect(getBreakpoint(200, 60)).toBe("large");
  });

  test("HOOK-LAY-013: returns 'large' for 300x80 (very large terminal)", () => {
    expect(getBreakpoint(300, 80)).toBe("large");
  });

  // ── OR logic verification ─────────────────────────────────

  test("HOOK-LAY-014: returns 'minimum' when cols >= standard but rows < standard", () => {
    expect(getBreakpoint(120, 39)).toBe("minimum");
  });

  test("HOOK-LAY-015: returns 'minimum' when rows >= standard but cols < standard", () => {
    expect(getBreakpoint(119, 40)).toBe("minimum");
  });

  test("HOOK-LAY-016: returns 'standard' when cols >= large but rows < large", () => {
    expect(getBreakpoint(200, 59)).toBe("standard");
  });

  test("HOOK-LAY-017: returns 'standard' when rows >= large but cols < large", () => {
    expect(getBreakpoint(199, 60)).toBe("standard");
  });

  // ── Edge cases ────────────────────────────────────────────

  test("HOOK-LAY-018: returns null for negative dimensions", () => {
    expect(getBreakpoint(-1, -1)).toBeNull();
  });

  test("HOOK-LAY-019: returns 'large' for extremely large terminal", () => {
    expect(getBreakpoint(500, 200)).toBe("large");
  });
});
```

### 5.2 Computed value tests: layout derivation via `bunEval()`

These tests validate the derivation logic by importing the actual module in a Bun subprocess. They verify that the deployed code is importable and produces correct values.

```typescript
// ---------------------------------------------------------------------------
// TUI_APP_SHELL — useLayout computed values
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — useLayout computed values", () => {
  test("HOOK-LAY-020: contentHeight formula: height - 2 at standard size", async () => {
    const result = await bunEval(`
      const height = 40;
      const contentHeight = Math.max(0, height - 2);
      console.log(JSON.stringify({ contentHeight }));
    `);
    const { contentHeight } = JSON.parse(result.stdout.trim());
    expect(contentHeight).toBe(38);
  });

  test("HOOK-LAY-021: contentHeight floors at 0 for height < 2", async () => {
    const result = await bunEval(`
      const height = 1;
      const contentHeight = Math.max(0, height - 2);
      console.log(JSON.stringify({ contentHeight }));
    `);
    const { contentHeight } = JSON.parse(result.stdout.trim());
    expect(contentHeight).toBe(0);
  });

  test("HOOK-LAY-022: sidebarVisible is false at minimum breakpoint", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      const bp = getBreakpoint(80, 24);
      const sidebarVisible = bp !== null && bp !== "minimum";
      console.log(JSON.stringify({ bp, sidebarVisible }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.sidebarVisible).toBe(false);
  });

  test("HOOK-LAY-023: sidebarVisible is true at standard breakpoint", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      const bp = getBreakpoint(120, 40);
      const sidebarVisible = bp !== null && bp !== "minimum";
      console.log(JSON.stringify({ bp, sidebarVisible }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.sidebarVisible).toBe(true);
  });

  test("HOOK-LAY-024: sidebarVisible is false when breakpoint is null", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      const bp = getBreakpoint(60, 20);
      const sidebarVisible = bp !== null && bp !== "minimum";
      console.log(JSON.stringify({ bp, sidebarVisible }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBeNull();
    expect(parsed.sidebarVisible).toBe(false);
  });

  test("HOOK-LAY-025: sidebarWidth is '25%' at standard, '30%' at large, '0%' otherwise", async () => {
    const result = await bunEval(`
      function getSidebarWidth(bp) {
        switch (bp) {
          case "large": return "30%";
          case "standard": return "25%";
          default: return "0%";
        }
      }
      console.log(JSON.stringify({
        standard: getSidebarWidth("standard"),
        large: getSidebarWidth("large"),
        minimum: getSidebarWidth("minimum"),
        null: getSidebarWidth(null),
      }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.standard).toBe("25%");
    expect(parsed.large).toBe("30%");
    expect(parsed.minimum).toBe("0%");
    expect(parsed.null).toBe("0%");
  });

  test("HOOK-LAY-026: modalWidth scales inversely with breakpoint", async () => {
    const result = await bunEval(`
      function getModalWidth(bp) {
        switch (bp) {
          case "large": return "50%";
          case "standard": return "60%";
          default: return "90%";
        }
      }
      console.log(JSON.stringify({
        minimum: getModalWidth("minimum"),
        standard: getModalWidth("standard"),
        large: getModalWidth("large"),
        null: getModalWidth(null),
      }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.minimum).toBe("90%");
    expect(parsed.standard).toBe("60%");
    expect(parsed.large).toBe("50%");
    expect(parsed.null).toBe("90%");
  });

  test("HOOK-LAY-027: modalHeight matches modalWidth per breakpoint", async () => {
    const result = await bunEval(`
      function getModalHeight(bp) {
        switch (bp) {
          case "large": return "50%";
          case "standard": return "60%";
          default: return "90%";
        }
      }
      console.log(JSON.stringify({
        minimum: getModalHeight("minimum"),
        standard: getModalHeight("standard"),
        large: getModalHeight("large"),
        null: getModalHeight(null),
      }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.minimum).toBe("90%");
    expect(parsed.standard).toBe("60%");
    expect(parsed.large).toBe("50%");
    expect(parsed.null).toBe("90%");
  });
});
```

### 5.3 Module resolution tests: barrel exports and import chains

These tests verify that the new files are importable from the correct locations.

```typescript
// ---------------------------------------------------------------------------
// TUI_APP_SHELL — Layout module resolution
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — Layout module resolution", () => {
  test("HOOK-LAY-028: getBreakpoint is importable from types barrel", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/index.js");
      console.log(typeof getBreakpoint);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-LAY-029: useLayout is importable from hooks barrel", async () => {
    const result = await bunEval(`
      const mod = await import("./src/hooks/index.js");
      console.log(typeof mod.useLayout);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-LAY-030: existing exports remain in hooks barrel after update", async () => {
    const result = await bunEval(`
      const mod = await import("./src/hooks/index.js");
      const exports = [
        typeof mod.useDiffSyntaxStyle,
        typeof mod.useTheme,
        typeof mod.useColorTier,
        typeof mod.useSpinner,
        typeof mod.BRAILLE_FRAMES,
        typeof mod.ASCII_FRAMES,
        typeof mod.BRAILLE_INTERVAL_MS,
        typeof mod.ASCII_INTERVAL_MS,
      ];
      console.log(exports.every(t => t !== "undefined") ? "ok" : "fail: " + exports.join(","));
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("ok");
  });

  test("HOOK-LAY-031: getBreakpoint is importable directly from types/breakpoint.js", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./src/types/breakpoint.js");
      console.log(typeof getBreakpoint);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-LAY-032: useLayout is importable directly from hooks/useLayout.js", async () => {
    const result = await bunEval(`
      const { useLayout } = await import("./src/hooks/useLayout.js");
      console.log(typeof useLayout);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-LAY-033: types/breakpoint.ts has zero React imports", async () => {
    const content = await Bun.file(join(TUI_SRC, "types/breakpoint.ts")).text();
    expect(content).not.toContain('from "react"');
    expect(content).not.toContain("from 'react'");
    expect(content).not.toContain("import React");
  });

  test("HOOK-LAY-034: types/breakpoint.ts has zero @opentui imports", async () => {
    const content = await Bun.file(join(TUI_SRC, "types/breakpoint.ts")).text();
    expect(content).not.toContain("@opentui");
  });

  test("HOOK-LAY-035: hooks/useLayout.ts imports from @opentui/react", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useLayout.ts")).text();
    expect(content).toContain('from "@opentui/react"');
  });

  test("HOOK-LAY-036: hooks/useLayout.ts imports getBreakpoint from types/breakpoint.js", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useLayout.ts")).text();
    expect(content).toContain('from "../types/breakpoint.js"');
  });

  test("HOOK-LAY-037: types directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "types/index.ts"))).toBe(true);
  });

  test("HOOK-LAY-038: tsc --noEmit passes with new layout files", async () => {
    const result = await run(["bun", "run", "check"]);
    if (result.exitCode !== 0) {
      console.error("tsc stderr:", result.stderr);
      console.error("tsc stdout:", result.stdout);
    }
    expect(result.exitCode).toBe(0);
  }, 30_000);
});
```

### 5.4 E2E responsive layout tests (full TUI launch)

These tests launch the full TUI at specific terminal sizes and verify that responsive behavior is user-visible. They will fail until the AppShell, HeaderBar, StatusBar, and ScreenRouter are implemented by downstream tickets. **Per project policy, they are left failing — never skipped or commented out.**

```typescript
// ---------------------------------------------------------------------------
// TUI_APP_SHELL — Responsive layout E2E
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — Responsive layout E2E", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  // ── Terminal too small ────────────────────────────────────

  test("RESP-LAY-001: shows 'terminal too small' at 79x24", async () => {
    terminal = await launchTUI({ cols: 79, rows: 24 });
    await terminal.waitForText("Terminal too small");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-LAY-002: shows 'terminal too small' at 80x23", async () => {
    terminal = await launchTUI({ cols: 80, rows: 23 });
    await terminal.waitForText("Terminal too small");
  });

  test("RESP-LAY-003: shows current dimensions in 'too small' message", async () => {
    terminal = await launchTUI({ cols: 60, rows: 20 });
    await terminal.waitForText("60");
    await terminal.waitForText("20");
  });

  // ── Minimum breakpoint rendering ──────────────────────────

  test("RESP-LAY-004: renders at 80x24 minimum with no sidebar", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-LAY-005: modal uses 90% width at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":"); // Open command palette
    await terminal.waitForText("Command");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  // ── Standard breakpoint rendering ─────────────────────────

  test("RESP-LAY-006: renders at 120x40 standard with full layout", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  // ── Large breakpoint rendering ────────────────────────────

  test("RESP-LAY-007: renders at 200x60 large with expanded layout", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  // ── Resize transitions ────────────────────────────────────

  test("RESP-LAY-008: resize from standard to minimum hides sidebar", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(80, 24);
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-LAY-009: resize from minimum to standard shows sidebar", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(120, 40);
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-LAY-010: resize below minimum shows 'too small' message", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(60, 20);
    await terminal.waitForText("Terminal too small");
  });

  test("RESP-LAY-011: resize back from 'too small' restores content", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(60, 20);
    await terminal.waitForText("Terminal too small");
    await terminal.resize(120, 40);
    await terminal.waitForText("Dashboard");
  });

  // ── Content height verification ───────────────────────────

  test("RESP-LAY-012: content area fills between header and status bar", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    // Header is line 0, status bar is line 39
    const headerLine = terminal.getLine(0);
    const statusLine = terminal.getLine(39);
    expect(headerLine.length).toBeGreaterThan(0);
    expect(statusLine.length).toBeGreaterThan(0);
  });

  // ── Keyboard works at all breakpoints ─────────────────────

  test("RESP-LAY-013: Ctrl+C quits at unsupported size", async () => {
    terminal = await launchTUI({ cols: 60, rows: 20 });
    await terminal.waitForText("Terminal too small");
    await terminal.sendKeys("ctrl+c");
  });

  test("RESP-LAY-014: navigation works at minimum breakpoint", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("RESP-LAY-015: rapid resize does not throw", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(80, 24);
    await terminal.resize(200, 60);
    await terminal.resize(60, 20);
    await terminal.resize(120, 40);
    await terminal.waitForText("Dashboard");
  });
});
```

### 5.5 Test classification summary

| Test Group | Count | Passes Immediately? | Reason |
|-----------|-------|---------------------|--------|
| `getBreakpoint` pure function (HOOK-LAY-001–019) | 19 | ✅ Yes | Pure function, no TUI launch needed |
| Computed values via `bunEval` (HOOK-LAY-020–027) | 8 | ✅ Yes | `bunEval` subprocess, inlined logic |
| Module resolution (HOOK-LAY-028–038) | 11 | ✅ Yes | Import checks via `bunEval`, file existence, tsc |
| E2E responsive layout (RESP-LAY-001–015) | 15 | ❌ No | Requires AppShell, HeaderBar, StatusBar, ScreenRouter |
| **Total** | **53** | **38 pass, 15 fail** | |

---

## 6. File Manifest

| File | Action | Lines (est.) | Description |
|------|--------|-------------|-------------|
| `apps/tui/src/types/breakpoint.ts` | **Create** | 33 | `Breakpoint` type and `getBreakpoint()` pure function |
| `apps/tui/src/types/index.ts` | **Create** | 2 | Barrel export for types |
| `apps/tui/src/hooks/useLayout.ts` | **Create** | ~115 | `useLayout()` hook and `LayoutContext` interface |
| `apps/tui/src/hooks/index.ts` | **Edit** | 16 (was 13) | Add `useLayout` and `LayoutContext` exports to existing barrel |
| `e2e/tui/app-shell.test.ts` | **Edit** | ~1700 (was 1333) | Append breakpoint, layout computed values, module resolution, and responsive E2E test blocks |

**Note:** No changes to `e2e/tui/helpers.ts` — the file already exists with full `@microsoft/tui-test` integration.

---

## 7. Integration Points

### 7.1 Consumers that will use `useLayout()`

Once this hook is implemented, the following components (from the architecture spec) will consume it:

| Component | Properties Used |
|-----------|------------------|
| `AppShell` | `contentHeight`, `width`, `height`, `breakpoint` |
| `HeaderBar` | `breakpoint` (breadcrumb truncation at minimum) |
| `StatusBar` | `breakpoint` (keybinding hint count: 4 at minimum, 6 at standard, all at large) |
| `ScreenRouter` | `breakpoint` (`null` → show terminal-too-small message) |
| `ScrollableList` | `contentHeight` (viewport size for page-up/page-down calculations) |
| `ModalSystem` | `modalWidth`, `modalHeight` |
| `CommandPalette` | `modalWidth`, `modalHeight` |
| `HelpOverlay` | `modalWidth`, `modalHeight` |
| `DiffViewer` | `sidebarVisible`, `sidebarWidth`, `breakpoint` (split mode unavailable at minimum) |
| `MessageBlock` | `breakpoint` (padding, label abbreviation, timestamp visibility) |

### 7.2 Replacing inline breakpoint computation

After this hook lands, the following existing code patterns should be refactored (tracked as separate follow-up work, NOT part of this ticket):

**Current pattern in `screens/Agents/types.ts` line 16:**
```typescript
export type Breakpoint = "minimum" | "standard" | "large";
```

**Future refactor (import from canonical location):**
```typescript
import { type Breakpoint } from "../../types/breakpoint.js";
```

**Current pattern in `screens/Agents/utils/formatTimestamp.ts` line 2:**
```typescript
import { Breakpoint } from "../types";
```

**Future refactor:**
```typescript
import { type Breakpoint } from "../../../types/breakpoint.js";
```

### 7.3 Future: sidebar toggle state

The design spec mentions `Ctrl+B` toggles sidebar visibility. This is NOT part of this ticket. When implemented:
1. Deploy `useBreakpoint()` from `specs/tui/apps/tui/src/hooks/useBreakpoint.ts`
2. Deploy `useSidebarState()` from `specs/tui/apps/tui/src/hooks/useSidebarState.ts`
3. Update `useLayout()` to compose `useSidebarState()` per the reference implementation
4. Add `sidebar: SidebarState` field to `LayoutContext`
5. `sidebarVisible` becomes `sidebar.visible` (incorporates toggle)
6. `getSidebarWidth(breakpoint)` becomes `getSidebarWidth(breakpoint, sidebar.visible)` (toggle-aware)

The `useLayout()` hook signature and return type remain backward-compatible.

---

## 8. Productionization Checklist

### 8.1 From spec files to deployed code

| Source | Production Target | Action |
|--------|-------------------|--------|
| `specs/tui/apps/tui/src/types/breakpoint.ts` | `apps/tui/src/types/breakpoint.ts` | Copy verbatim (verified: 33 lines, identical to spec) |
| `specs/tui/apps/tui/src/types/index.ts` | `apps/tui/src/types/index.ts` | Copy verbatim (verified: 2 lines) |
| Section 3, Step 3 (this spec) | `apps/tui/src/hooks/useLayout.ts` | Create per this spec — self-contained, no `useSidebarState` dep |
| (Existing file) | `apps/tui/src/hooks/index.ts` | Edit: append 2 export lines to existing 13-line file |
| (Existing file) | `e2e/tui/app-shell.test.ts` | Edit: append ~370 lines of new test blocks after line 1333 |

**Critical difference from reference `useLayout`:** The reference implementation (line 4) imports `useSidebarState` from `./useSidebarState.js`. That hook does not exist in deployed code and depends on `useBreakpoint` (also not deployed). The reference `LayoutContext` includes `sidebar: SidebarState` (line 59) and `getSidebarWidth` takes two parameters (lines 62-72). The version in this spec is self-contained.

### 8.2 Module resolution

The TUI uses `"jsxImportSource": "@opentui/react"` and targets ESNext with bundler module resolution (verified in `apps/tui/tsconfig.json`). All imports use `.js` extensions per the project convention, as demonstrated by existing code like `useDiffSyntaxStyle.ts` which imports from `"../lib/diff-syntax.js"`.

### 8.3 Verify OpenTUI peer dependency

The hook depends on `useTerminalDimensions` from `@opentui/react`. Verified in `apps/tui/package.json`: `@opentui/react` is listed at exact version `0.1.90`. No version change needed.

### 8.4 No native dependencies added

This ticket adds zero new dependencies. It only uses:
- `react` (already in `package.json` at `19.2.4`) — `useMemo`
- `@opentui/react` (already in `package.json` at `0.1.90`) — `useTerminalDimensions`

### 8.5 Snapshot golden files

The E2E tests include `toMatchSnapshot()` calls. On first run, these create golden files in `e2e/tui/__snapshots__/`. Golden files should be committed to the repository. These snapshots will only be generated once the full AppShell is implemented.

### 8.6 Test failure policy

Per project policy: tests that fail due to unimplemented components are **left failing**. Specifically:

- The 19 pure function tests (HOOK-LAY-001–019) **pass immediately**.
- The 8 computed value tests (HOOK-LAY-020–027) **pass immediately**.
- The 11 module resolution tests (HOOK-LAY-028–038) **pass immediately**.
- The 15 E2E tests (RESP-LAY-001–015) **fail until** `tui-foundation-scaffold` implements AppShell, HeaderBar, StatusBar, and ScreenRouter.

### 8.7 Existing `Breakpoint` type migration

The `Breakpoint` type currently defined at `apps/tui/src/screens/Agents/types.ts` (line 16) is NOT modified by this ticket. Migration is a follow-up task.

### 8.8 TypeScript compilation verification

After all files are created, run `bun run check` from `apps/tui/` to verify TypeScript compilation. The new files must compile with zero errors under the existing `tsconfig.json`. Test HOOK-LAY-038 verifies this programmatically.

### 8.9 Hooks barrel — conservative update

The hooks barrel (`apps/tui/src/hooks/index.ts`) already exists with 13 lines of exports. This ticket appends 2 lines (`useLayout` and `LayoutContext`). All existing exports are preserved. Test HOOK-LAY-030 verifies all existing exports remain accessible.

---

## 9. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|---------------|
| AC-1 | `getBreakpoint()` returns correct classification for all boundary values | Tests HOOK-LAY-001 through HOOK-LAY-019 pass |
| AC-2 | `getBreakpoint()` returns `null` for terminals below 80×24 | Tests HOOK-LAY-001 through HOOK-LAY-004, HOOK-LAY-018 |
| AC-3 | `useLayout()` returns `{ width, height, breakpoint, contentHeight, sidebarVisible, sidebarWidth, modalWidth, modalHeight }` | TypeScript compilation (HOOK-LAY-038); import test (HOOK-LAY-029) |
| AC-4 | `contentHeight` equals `height - 2`, floored at 0 | Tests HOOK-LAY-020, HOOK-LAY-021 |
| AC-5 | `sidebarVisible` is `false` when breakpoint is `null` or `"minimum"` | Tests HOOK-LAY-022, HOOK-LAY-024 |
| AC-6 | `sidebarVisible` is `true` when breakpoint is `"standard"` or `"large"` | Test HOOK-LAY-023 |
| AC-7 | `sidebarWidth` is `"25%"` at standard, `"30%"` at large, `"0%"` at minimum/null | Test HOOK-LAY-025 |
| AC-8 | `modalWidth` / `modalHeight` are `"90%"` / `"60%"` / `"50%"` per breakpoint | Tests HOOK-LAY-026, HOOK-LAY-027 |
| AC-9 | Values recalculate synchronously on terminal resize | E2E tests RESP-LAY-008 through RESP-LAY-011 |
| AC-10 | `null` breakpoint triggers "terminal too small" screen | E2E tests RESP-LAY-001, RESP-LAY-002, RESP-LAY-003 |
| AC-11 | Hook is exported from `hooks/index.ts` barrel | Test HOOK-LAY-029 |
| AC-12 | `LayoutContext` type is exported for consumer use | TypeScript import succeeds |
| AC-13 | No new runtime dependencies added | `package.json` diff is empty |
| AC-14 | All files use `.js` import extensions | Tests HOOK-LAY-035, HOOK-LAY-036 |
| AC-15 | `getBreakpoint` is exported from `types/index.ts` barrel | Test HOOK-LAY-028 |
| AC-16 | `apps/tui/src/types/` directory exists with barrel export | Test HOOK-LAY-037 |
| AC-17 | All existing hook exports preserved in hooks barrel | Test HOOK-LAY-030 |
| AC-18 | `types/breakpoint.ts` is pure (no React, no OpenTUI imports) | Tests HOOK-LAY-033, HOOK-LAY-034 |
| AC-19 | `tsc --noEmit` passes with all new files | Test HOOK-LAY-038 |

---

## 10. Appendix: Breakpoint Decision Table

| cols | rows | Breakpoint | sidebar | sidebarWidth | modalWidth | modalHeight | contentHeight |
|------|------|------------|---------|--------------|------------|-------------|---------------|
| 60 | 20 | null | hidden | 0% | 90% | 90% | 18 |
| 79 | 24 | null | hidden | 0% | 90% | 90% | 22 |
| 80 | 23 | null | hidden | 0% | 90% | 90% | 21 |
| 80 | 24 | minimum | hidden | 0% | 90% | 90% | 22 |
| 100 | 30 | minimum | hidden | 0% | 90% | 90% | 28 |
| 119 | 39 | minimum | hidden | 0% | 90% | 90% | 37 |
| 120 | 39 | minimum | hidden | 0% | 90% | 90% | 37 |
| 119 | 40 | minimum | hidden | 0% | 90% | 90% | 38 |
| 120 | 40 | standard | visible | 25% | 60% | 60% | 38 |
| 150 | 50 | standard | visible | 25% | 60% | 60% | 48 |
| 199 | 59 | standard | visible | 25% | 60% | 60% | 57 |
| 200 | 59 | standard | visible | 25% | 60% | 60% | 57 |
| 199 | 60 | standard | visible | 25% | 60% | 60% | 58 |
| 200 | 60 | large | visible | 30% | 50% | 50% | 58 |
| 300 | 80 | large | visible | 30% | 50% | 50% | 78 |
| 200 | 30 | minimum | hidden | 0% | 90% | 90% | 28 |
| 100 | 60 | minimum | hidden | 0% | 90% | 90% | 58 |
| -1 | -1 | null | hidden | 0% | 90% | 90% | 0 |
| 0 | 0 | null | hidden | 0% | 90% | 90% | 0 |
| 500 | 200 | large | visible | 30% | 50% | 50% | 198 |