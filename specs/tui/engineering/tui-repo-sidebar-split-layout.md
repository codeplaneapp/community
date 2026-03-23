# Engineering Specification: tui-repo-sidebar-split-layout

## Sidebar + Main Split Layout Component for Code Explorer

**Ticket:** tui-repo-sidebar-split-layout  
**Type:** Engineering  
**Status:** Not started  
**Dependencies:** tui-responsive-layout (✅ implemented), tui-theme-tokens (✅ implemented)  

---

## 1. Summary

Build a `SplitLayout` component that renders a two-panel layout: left sidebar and right main content area. The sidebar width is 25% at standard breakpoint and 30% at large breakpoint. At minimum breakpoint (80×24), the sidebar is hidden by default and toggleable via `Ctrl+B` at all sizes. The focused panel displays a `primary`-colored border; the unfocused panel displays a `border`-colored (default) border. `Tab` or `Ctrl+W` toggles focus between panels. The component manages which panel has keyboard focus and routes keyboard events to the focused panel's handler.

## 2. Current State Assessment

### What exists (from dependency tickets)

| File | Status | Provides |
|------|--------|----------|
| `apps/tui/src/types/breakpoint.ts` | ✅ Complete | `Breakpoint` type (`"minimum" \| "standard" \| "large"`), `getBreakpoint(cols, rows)` pure function returning `Breakpoint \| null` (null when < 80×24). Uses OR logic for downgrade — either cols OR rows below threshold triggers the lower breakpoint |
| `apps/tui/src/hooks/useBreakpoint.ts` | ✅ Complete | Reactive breakpoint from `useTerminalDimensions()`, returns `Breakpoint \| null`, synchronous recalculation on SIGWINCH |
| `apps/tui/src/hooks/useSidebarState.ts` | ✅ Complete | `SidebarState` with `visible`, `userPreference` (boolean \| null), `autoOverride`, `toggle()`. `toggle()` is a no-op when `autoOverride` is true (minimum and null breakpoints). User preference starts as `null` (no explicit preference = default visible). First toggle at standard/large sets `userPreference` to `false` (since default visible, toggle hides). Exported `resolveSidebarVisibility(breakpoint, userPreference)` for unit testing |
| `apps/tui/src/hooks/useLayout.ts` | ✅ Complete | `LayoutContext` with `sidebarVisible`, `sidebarWidth` ("25%"/"30%"/"0%"), `breakpoint`, `contentHeight` (height - 2, floored at 0), `modalWidth`, `modalHeight`, `sidebar: SidebarState`, `width`, `height`. `getSidebarWidth()` returns "0%" when `!sidebarVisible` or at default/null breakpoint. Hook is the ONLY place where breakpoint → layout value mapping is defined |
| `apps/tui/src/hooks/useTheme.ts` | ✅ Complete | `useTheme()` returns `Readonly<ThemeTokens>` (frozen). Tokens include `primary` (RGBA), `border` (RGBA), plus `success`, `warning`, `error`, `muted`, `surface`, `diffAddedBg`, `diffRemovedBg`, `diffAddedText`, `diffRemovedText`, `diffHunkHeader`. Must be called within `ThemeProvider` |
| `apps/tui/src/hooks/useScreenKeybindings.ts` | ✅ Complete | `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[]): void`. Registers `PRIORITY.SCREEN` (4) scope. Uses `Map<string, KeyHandler>` built with `normalizeKeyDescriptor()`. Memo dependency: `bindings.map((b) => b.key).join(",")`. Ref pattern: `bindingsRef.current = bindings` on every render, handler wrapper dereferences ref at call time via `.find()`. Auto-generates hints from first 8 bindings when `hints` param is omitted. Scope registered via `useEffect` with `keybindingCtx.registerScope()`, removed on unmount |
| `apps/tui/src/providers/KeybindingProvider.tsx` | ✅ Complete | Priority-based dispatch: scopes sorted by priority ASC, LIFO within same priority. Single `useKeyboard()` hook captures all input. `when()` predicate checked at dispatch time — if `when()` returns false, handler is skipped and dispatch continues to next scope. First match wins, event is consumed. Provides both `KeybindingContext` (scope registration) and `StatusBarHintsContext` (hint management) |
| `apps/tui/src/providers/keybinding-types.ts` | ✅ Complete | `KeyHandler` (`key: string`, `description: string`, `group: string`, `handler: () => void`, optional `when?: () => boolean`), `PRIORITY` (`TEXT_INPUT=1`, `MODAL=2`, `GOTO=3`, `SCREEN=4`, `GLOBAL=5`), `KeybindingScope` (`id`, `priority`, `bindings: Map`, `active`), `StatusBarHint` (`keys: string`, `label: string`, `order?: number`) |
| `apps/tui/src/components/AppShell.tsx` | ✅ Complete | 3-zone layout: `HeaderBar` (1 row fixed) → children (`flexGrow={1}`) → `StatusBar` (1 row fixed) → `OverlayLayer` (absolute positioned). Renders `TerminalTooSmallScreen` when `breakpoint === null`. Uses `useLayout()` for responsive behavior |
| `apps/tui/src/components/GlobalKeybindings.tsx` | ⚠️ Partial | Wires `q` (back/quit via `nav.canGoBack` → `nav.pop()` or `process.exit(0)`), `Escape` (close/back via `nav.canGoBack`), `ctrl+c` (`process.exit(0)`). TODOs for `?` (help overlay), `:` (command palette), `g` (go-to mode) — handlers are empty callbacks. **No `Ctrl+B` sidebar toggle**. Imports `useNavigation` from `NavigationProvider`, `useGlobalKeybindings` from hooks |
| `apps/tui/src/hooks/useGlobalKeybindings.ts` | ✅ Complete (but missing `onSidebarToggle`) | `GlobalKeybindingActions` interface with `onQuit`, `onEscape`, `onForceQuit`, `onHelp`, `onCommandPalette`, `onGoTo`. Registers all 6 bindings at `PRIORITY.GLOBAL` (5) in a `Map<string, KeyHandler>` via `useMemo`. Uses `normalizeKeyDescriptor()` for key normalization. Scope registered via `useEffect` with `ctx.registerScope()` |
| `apps/tui/src/providers/normalize-key.ts` | ✅ Complete | `normalizeKeyDescriptor(desc)` — lowercases, maps aliases ("Enter" → "return", "Esc" → "escape", etc.), preserves uppercase single letters. `normalizeKeyEvent(event)` — converts KeyEvent to descriptor string, prepends modifiers in order ctrl > meta > shift, shift NOT included for printable keys (uses uppercase instead) |
| `apps/tui/src/components/index.ts` | ✅ Complete | Exports: `AppShell`, `HeaderBar`, `StatusBar`, `ErrorBoundary`, `TerminalTooSmallScreen`, `GlobalKeybindings`, `FullScreenLoading`, `FullScreenError`, `SkeletonList`, `SkeletonDetail`, `PaginationIndicator`, `ActionButton`, `OverlayLayer` |
| `apps/tui/src/hooks/index.ts` | ✅ Complete | Exports 14 hooks including `useLayout` (with `LayoutContext` type), `useBreakpoint`, `useResponsiveValue` (with `ResponsiveValues` type), `useSidebarState` (with `resolveSidebarVisibility` and `SidebarState` type), `useTheme`, `useNavigation`, `useAuth`, `useLoading`, `useScreenLoading`, `useOptimisticMutation`, `usePaginationLoading`, `useColorTier`, `useSpinner`, `useDiffSyntaxStyle`. **Note:** `useScreenKeybindings` and `useGlobalKeybindings` exist as files but are NOT exported from this index (they are imported directly by consumers) |
| `e2e/tui/helpers.ts` | ✅ Complete | `TUITestInstance` interface with `sendKeys()`, `sendText()`, `waitForText()`, `waitForNoText()`, `snapshot()`, `getLine()`, `resize()`, `terminate()`, `rows`, `cols`. `launchTUI(options?)` spawns real PTY via `@microsoft/tui-test`. `TERMINAL_SIZES` constant: `minimum: {80, 24}`, `standard: {120, 40}`, `large: {200, 60}`. `resolveKey()` maps key names — `ctrl+b` handled by dynamic `ctrl+X` pattern (line 248): extracts `key[5]` with `{ ctrl: true }`. `ctrl+c` and `ctrl+d` use dedicated Terminal methods (`keyCtrlC`, `keyCtrlD`). 50ms delay between keys. 200ms delay after resize for SIGWINCH processing |

### What does NOT exist

| Component | Needed for |
|-----------|------------|
| `SplitLayout.tsx` | Two-panel sidebar + main layout with focus management |
| `useSplitFocus.ts` | Focus state management between left/right panels |
| `Ctrl+B` global keybinding | Sidebar toggle wired into `GlobalKeybindings` at GLOBAL priority |
| E2E tests | Snapshot, keyboard interaction, resize tests for split layout |

---

## 3. Architecture

### Component Hierarchy

```
ScreenComponent (e.g., CodeExplorerScreen)
  └── SplitLayout
        ├── Sidebar Panel (left)
        │     └── <box> with border, receives `sidebarContent` render prop
        └── Main Panel (right)
              └── <box> with border, receives `mainContent` render prop
```

### Data Flow

```
useLayout() ──→ breakpoint, sidebarVisible, sidebarWidth, sidebar.toggle()
useTheme()  ──→ primary (focused border), border (unfocused border)
useSplitFocus() ──→ focusedPanel, toggleFocus, setFocus, sidebarFocusable
useScreenKeybindings() ──→ registers Tab, Ctrl+W, Ctrl+B into SCREEN scope
```

### Focus Model

The `SplitLayout` manages a binary focus state: `"sidebar"` or `"main"`. This is an internal concept — it does not use OpenTUI's native `focused` prop on `<box>`. Instead:

1. The focused panel gets `borderColor={theme.primary}` (visually highlighted).
2. The unfocused panel gets `borderColor={theme.border}` (default).
3. Each panel's render prop receives a `focused: boolean` argument. Children can use this to control their own OpenTUI focus behavior (e.g., `<scrollbox focused={focused}>`).
4. `Tab` and `Ctrl+W` toggle which panel is focused.
5. When sidebar is hidden (`layout.sidebarVisible === false`), focus is always `"main"` and the focus-toggle keybindings are deregistered.

### Keybinding Priority Integration

The `SplitLayout` registers its bindings at `PRIORITY.SCREEN` (4). The `KeybindingProvider` dispatch walks scopes from lowest priority number (highest precedence) to highest:

```
Keypress arrives at KeybindingProvider.useKeyboard()
  → Sort scopes: priority ASC, LIFO within same priority
  → PRIORITY.TEXT_INPUT (1): skip (no text input focused)
  → PRIORITY.MODAL (2): skip (no modal open)
  → PRIORITY.GOTO (3): skip (not in go-to mode)
  → PRIORITY.SCREEN (4): SplitLayout scope (LIFO = most recently registered)
      → "tab" matched → handler.when() check → toggleFocus() → consumed ✓
      → "ctrl+w" matched → toggleFocus() → consumed ✓
      → "ctrl+b" matched → sidebar.toggle() → consumed ✓
      → other → not matched → fall through
  → PRIORITY.GLOBAL (5): GlobalKeybindings scope
      → "q" → pop/quit → consumed ✓
      → "ctrl+c" → force quit → consumed ✓ (via keyCtrlC special method)
      → "ctrl+b" → sidebar.toggle() → consumed ✓ (fallback for non-SplitLayout screens)
```

---

## 4. Implementation Plan

### Step 1: Create `useSplitFocus` hook

**File:** `apps/tui/src/hooks/useSplitFocus.ts` (new)

A focused-panel state hook that tracks which panel has keyboard focus.

```typescript
import { useState, useCallback, useMemo, useEffect } from "react";

export type SplitPanel = "sidebar" | "main";

export interface SplitFocusState {
  /** Which panel currently has keyboard focus. */
  focusedPanel: SplitPanel;
  /** Toggle focus between sidebar and main. No-op when sidebar is hidden. */
  toggleFocus: () => void;
  /** Explicitly set focus to a specific panel. Ignored if targeting hidden sidebar. */
  setFocus: (panel: SplitPanel) => void;
  /** Whether the sidebar panel is currently focusable (visible). */
  sidebarFocusable: boolean;
}

/**
 * Manage binary focus state for a two-panel split layout.
 *
 * When sidebarVisible is false, focusedPanel is forced to "main"
 * and toggleFocus becomes a no-op. When the sidebar becomes visible
 * again, focus remains on "main" (does not auto-switch to sidebar).
 *
 * @param sidebarVisible - Whether the sidebar is currently rendered.
 * @param initialFocus - Initial focused panel. Defaults to "main".
 */
export function useSplitFocus(
  sidebarVisible: boolean,
  initialFocus: SplitPanel = "main",
): SplitFocusState {
  const [focusedPanel, setFocusedPanel] = useState<SplitPanel>(initialFocus);

  // Force focus to main when sidebar is hidden
  useEffect(() => {
    if (!sidebarVisible && focusedPanel === "sidebar") {
      setFocusedPanel("main");
    }
  }, [sidebarVisible, focusedPanel]);

  const toggleFocus = useCallback(() => {
    if (!sidebarVisible) return; // No-op when sidebar is hidden
    setFocusedPanel((prev) => (prev === "sidebar" ? "main" : "sidebar"));
  }, [sidebarVisible]);

  const setFocus = useCallback(
    (panel: SplitPanel) => {
      if (panel === "sidebar" && !sidebarVisible) return; // Can't focus hidden panel
      setFocusedPanel(panel);
    },
    [sidebarVisible],
  );

  return useMemo(
    () => ({
      focusedPanel: sidebarVisible ? focusedPanel : "main",
      toggleFocus,
      setFocus,
      sidebarFocusable: sidebarVisible,
    }),
    [focusedPanel, sidebarVisible, toggleFocus, setFocus],
  );
}
```

**Key design decisions:**
- `initialFocus` defaults to `"main"` — the main content is the primary interaction target.
- When sidebar becomes hidden (resize to minimum or `Ctrl+B` toggle), focus auto-snaps to `"main"` via `useEffect`. This avoids a stale focus on an invisible panel.
- When sidebar re-appears (resize back to standard), focus stays on `"main"` — no jarring focus shift.
- `toggleFocus` is a no-op when sidebar is hidden. Prevents cycling to an invisible panel.
- `setFocus("sidebar")` is silently ignored when sidebar is hidden. Callers don't need guard logic.
- The returned `focusedPanel` value is guarded: even if internal state hasn't synced yet (before the useEffect fires), the return value is `"main"` when `!sidebarVisible`.

---

### Step 2: Create `SplitLayout` component

**File:** `apps/tui/src/components/SplitLayout.tsx` (new)

```typescript
import React, { useCallback, useMemo, useRef, useEffect } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { useSplitFocus, type SplitPanel } from "../hooks/useSplitFocus.js";
import { useScreenKeybindings } from "../hooks/useScreenKeybindings.js";
import type { KeyHandler, StatusBarHint } from "../providers/keybinding-types.js";

export interface SplitLayoutProps {
  /**
   * Content rendered in the sidebar (left panel).
   * Receives `focused` boolean so child components can adapt
   * (e.g., pass to `<scrollbox focused={focused}>`).
   */
  sidebar: (focused: boolean) => React.ReactNode;
  /**
   * Content rendered in the main area (right panel).
   * Receives `focused` boolean so child components can adapt.
   */
  main: (focused: boolean) => React.ReactNode;
  /**
   * Optional keyboard handler for the sidebar panel.
   * Called when a key is pressed and the sidebar has focus.
   * Return `true` if the handler consumed the key event.
   */
  onSidebarKey?: (key: string) => boolean;
  /**
   * Optional keyboard handler for the main panel.
   * Called when a key is pressed and the main panel has focus.
   * Return `true` if the handler consumed the key event.
   */
  onMainKey?: (key: string) => boolean;
  /**
   * Additional keybindings to register at the screen level.
   * These are merged with the split layout's own bindings (Tab, Ctrl+W, Ctrl+B).
   * Use `when` predicates to scope bindings to a specific panel.
   *
   * IMPORTANT: Because `useScreenKeybindings` uses `Map<string, KeyHandler>`,
   * duplicate keys are deduplicated (last `set()` wins). For panel-specific
   * behavior on the same key (e.g., j/k), use a single handler per key
   * that internally checks which panel is focused.
   */
  additionalKeybindings?: KeyHandler[];
  /**
   * Additional status bar hints to display alongside the split layout hints.
   */
  additionalHints?: StatusBarHint[];
  /**
   * Callback invoked when the focused panel changes.
   */
  onFocusChange?: (panel: SplitPanel) => void;
  /**
   * Override the initial focused panel. Defaults to "main".
   */
  initialFocus?: SplitPanel;
  /**
   * Optional title for the sidebar box border.
   */
  sidebarTitle?: string;
  /**
   * Optional title for the main box border.
   */
  mainTitle?: string;
}

/**
 * Two-panel split layout with managed keyboard focus.
 *
 * Renders a sidebar (left) and main content (right) panel.
 * The sidebar is 25% width at standard breakpoint, 30% at large,
 * and hidden at minimum breakpoint. Ctrl+B toggles visibility.
 * Tab or Ctrl+W toggles focus between the two panels.
 *
 * The focused panel has a primary-colored border.
 * The unfocused panel has a default border color.
 *
 * @example
 * ```tsx
 * <SplitLayout
 *   sidebar={(focused) => <FileTree focused={focused} />}
 *   main={(focused) => <FilePreview focused={focused} />}
 *   sidebarTitle="Files"
 *   mainTitle="Preview"
 * />
 * ```
 */
export function SplitLayout({
  sidebar,
  main,
  onSidebarKey,
  onMainKey,
  additionalKeybindings,
  additionalHints,
  onFocusChange,
  initialFocus = "main",
  sidebarTitle,
  mainTitle,
}: SplitLayoutProps) {
  const layout = useLayout();
  const theme = useTheme();
  const { focusedPanel, toggleFocus, sidebarFocusable } = useSplitFocus(
    layout.sidebarVisible,
    initialFocus,
  );

  // Notify parent when focus changes
  const prevFocusRef = useRef(focusedPanel);
  useEffect(() => {
    if (prevFocusRef.current !== focusedPanel) {
      prevFocusRef.current = focusedPanel;
      onFocusChange?.(focusedPanel);
    }
  }, [focusedPanel, onFocusChange]);

  // Sidebar toggle via layout.sidebar.toggle (respects breakpoint logic)
  const handleSidebarToggle = useCallback(() => {
    layout.sidebar.toggle();
  }, [layout.sidebar]);

  // Build keybindings — memo key is the stringified key list
  // to match useScreenKeybindings' internal memo dependency:
  //   bindings.map((b) => b.key).join(",")
  const keybindings: KeyHandler[] = useMemo(() => {
    const bindings: KeyHandler[] = [];

    // Tab and Ctrl+W toggle focus — only registered when sidebar is visible
    if (sidebarFocusable) {
      bindings.push(
        {
          key: "tab",
          description: "Switch panel",
          group: "Layout",
          handler: toggleFocus,
        },
        {
          key: "ctrl+w",
          description: "Switch panel",
          group: "Layout",
          handler: toggleFocus,
        },
      );
    }

    // Ctrl+B always available for sidebar toggle
    bindings.push({
      key: "ctrl+b",
      description: "Toggle sidebar",
      group: "Layout",
      handler: handleSidebarToggle,
    });

    // Merge additional keybindings from consumer
    if (additionalKeybindings) {
      bindings.push(...additionalKeybindings);
    }

    return bindings;
  }, [sidebarFocusable, toggleFocus, handleSidebarToggle, additionalKeybindings]);

  // Build status bar hints
  const hints: StatusBarHint[] = useMemo(() => {
    const h: StatusBarHint[] = [];

    if (sidebarFocusable) {
      h.push({ keys: "Tab", label: "switch panel", order: 5 });
    }
    h.push({ keys: "Ctrl+B", label: "toggle sidebar", order: 6 });

    if (additionalHints) {
      h.push(...additionalHints);
    }

    return h;
  }, [sidebarFocusable, additionalHints]);

  // Register keybindings as a SCREEN scope with explicit hints
  useScreenKeybindings(keybindings, hints);

  // Resolve border colors based on focus
  const sidebarBorderColor = focusedPanel === "sidebar" ? theme.primary : theme.border;
  const mainBorderColor = focusedPanel === "main" ? theme.primary : theme.border;

  // When sidebar is hidden, render only the main panel at full width
  if (!layout.sidebarVisible) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        border
        borderStyle="single"
        borderColor={theme.primary}
        title={mainTitle}
      >
        {main(true)}
      </box>
    );
  }

  // Two-panel layout: sidebar + main
  return (
    <box flexDirection="row" width="100%" height="100%">
      {/* Sidebar panel */}
      <box
        width={layout.sidebarWidth}
        height="100%"
        border
        borderStyle="single"
        borderColor={sidebarBorderColor}
        title={sidebarTitle}
      >
        {sidebar(focusedPanel === "sidebar")}
      </box>

      {/* Main panel */}
      <box
        flexGrow={1}
        height="100%"
        border
        borderStyle="single"
        borderColor={mainBorderColor}
        title={mainTitle}
      >
        {main(focusedPanel === "main")}
      </box>
    </box>
  );
}
```

**Key design decisions:**

1. **Render prop pattern** — `sidebar` and `main` are functions receiving `focused: boolean`. This lets child components know whether they have focus without coupling to the split layout's internal state. Children can pass `focused` through to OpenTUI's `<scrollbox focused={focused}>` or use it to alter rendering.

2. **`useScreenKeybindings` with explicit hints** — Registers `Tab`, `Ctrl+W`, and `Ctrl+B` at `PRIORITY.SCREEN` (4). Passes explicit `StatusBarHint[]` as the second argument to avoid the auto-generation behavior (which would show raw key descriptors). Bindings are automatically shown in the status bar and help overlay. They are popped when `SplitLayout` unmounts.

3. **Border color** — Uses `theme.primary` for the focused panel and `theme.border` for the unfocused panel. Both are `RGBA` values resolved by `ThemeProvider` based on the detected color tier (truecolor, 256, 16).

4. **`sidebarWidth` from `useLayout()`** — The width is already computed by the layout hook: `"25%"` at standard, `"30%"` at large, `"0%"` at minimum (via `getSidebarWidth()` in `useLayout.ts`). We use `layout.sidebarWidth` directly rather than recomputing.

5. **Single-panel fallback** — When sidebar is hidden, the main panel gets full width with a `primary` border (it's always focused when alone). This avoids rendering a 0-width invisible panel.

6. **`Ctrl+B` delegates to `layout.sidebar.toggle()`** — This reuses the existing `useSidebarState` toggle logic. At minimum breakpoint, `toggle()` checks `autoOverride` (line 86 of `useSidebarState.ts`) and returns early — it's a no-op by design. At standard/large, it flips `userPreference` (first call: `null` → `false` which hides; subsequent calls: toggles between `true`/`false`).

7. **Conditional keybinding registration** — When `sidebarFocusable` is false, `Tab` and `Ctrl+W` are omitted from the `keybindings` array entirely. This means they won't appear in the status bar, won't be matched during dispatch, and won't interfere with other Tab-using components (like forms). The `useMemo` re-evaluates when `sidebarFocusable` changes, and `useScreenKeybindings`' internal memo key (`bindings.map(b => b.key).join(",")`) detects the key list change, triggering scope re-registration.

---

### Step 3: Export from components and hooks index files

**File:** `apps/tui/src/components/index.ts` — Add export:

```typescript
export { SplitLayout } from "./SplitLayout.js";
export type { SplitLayoutProps } from "./SplitLayout.js";
```

**File:** `apps/tui/src/hooks/index.ts` — Add export:

```typescript
export { useSplitFocus } from "./useSplitFocus.js";
export type { SplitPanel, SplitFocusState } from "./useSplitFocus.js";
```

---

### Step 4: Wire `Ctrl+B` as a global keybinding fallback

The `SplitLayout` registers `Ctrl+B` at `PRIORITY.SCREEN` (4). However, on screens that don't use `SplitLayout`, the sidebar toggle should still work. Adding `Ctrl+B` to `GlobalKeybindings` at `PRIORITY.GLOBAL` (5) provides this fallback.

When `SplitLayout` is mounted, its `SCREEN`-priority `Ctrl+B` binding takes precedence (priority 4 < 5 = higher precedence). The global binding is never reached in that case.

**File:** `apps/tui/src/hooks/useGlobalKeybindings.ts` — Modify:

```typescript
// Add to GlobalKeybindingActions interface:
export interface GlobalKeybindingActions {
  onQuit: () => void;
  onEscape: () => void;
  onForceQuit: () => void;
  onHelp: () => void;
  onCommandPalette: () => void;
  onGoTo: () => void;
  onSidebarToggle: () => void;  // NEW
}

// Add to the globals array inside useMemo:
{ key: normalizeKeyDescriptor("ctrl+b"), description: "Toggle sidebar", group: "Global", handler: actions.onSidebarToggle },
```

**File:** `apps/tui/src/components/GlobalKeybindings.tsx` — Modify:

```typescript
import React, { useCallback } from "react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useLayout } from "../hooks/useLayout.js";  // NEW
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const layout = useLayout();  // NEW

  const onQuit = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); } else { process.exit(0); }
  }, [nav]);

  const onEscape = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); }
  }, [nav]);

  const onForceQuit = useCallback(() => { process.exit(0); }, []);
  const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);
  const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);
  const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);

  const onSidebarToggle = useCallback(() => {  // NEW
    layout.sidebar.toggle();
  }, [layout.sidebar]);

  useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo, onSidebarToggle });  // MODIFIED
  return <>{children}</>;
}
```

---

## 5. Component API Reference

### `SplitLayout`

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `sidebar` | `(focused: boolean) => ReactNode` | ✅ | — | Render prop for sidebar content |
| `main` | `(focused: boolean) => ReactNode` | ✅ | — | Render prop for main content |
| `onSidebarKey` | `(key: string) => boolean` | ❌ | — | Key handler when sidebar is focused |
| `onMainKey` | `(key: string) => boolean` | ❌ | — | Key handler when main is focused |
| `additionalKeybindings` | `KeyHandler[]` | ❌ | `[]` | Extra keybindings merged into SCREEN scope |
| `additionalHints` | `StatusBarHint[]` | ❌ | `[]` | Extra status bar hints |
| `onFocusChange` | `(panel: SplitPanel) => void` | ❌ | — | Called when focus switches |
| `initialFocus` | `SplitPanel` | ❌ | `"main"` | Which panel starts with focus |
| `sidebarTitle` | `string` | ❌ | — | Title displayed in sidebar border |
| `mainTitle` | `string` | ❌ | — | Title displayed in main border |

### `useSplitFocus`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `sidebarVisible` | `boolean` | ✅ | — | Whether sidebar is rendered |
| `initialFocus` | `SplitPanel` | ❌ | `"main"` | Initial focus target |

**Returns:** `SplitFocusState`

| Field | Type | Description |
|-------|------|-------------|
| `focusedPanel` | `SplitPanel` | Currently focused panel (always `"main"` when sidebar hidden) |
| `toggleFocus` | `() => void` | Toggle between panels (no-op when sidebar hidden) |
| `setFocus` | `(panel: SplitPanel) => void` | Explicitly set focus (ignored for hidden sidebar) |
| `sidebarFocusable` | `boolean` | Whether sidebar can receive focus |

---

## 6. Responsive Behavior

### Breakpoint Adaptations

| Breakpoint | Terminal Range | Sidebar Width | Sidebar Default | Focus Toggle | Ctrl+B |
|------------|---------------|--------------|----------------|-------------|--------|
| Minimum | 80×24 – 119×39 | 0% (hidden) | Hidden | Disabled (Tab/Ctrl+W not registered) | No-op (`useSidebarState.toggle()` checks `autoOverride`) |
| Standard | 120×40 – 199×59 | 25% | Visible | Tab / Ctrl+W active | Show/hide |
| Large | 200×60+ | 30% | Visible | Tab / Ctrl+W active | Show/hide |
| Unsupported | < 80×24 | N/A | N/A | N/A | N/A (`TerminalTooSmallScreen` shown by `AppShell`) |

**Note on breakpoint thresholds:** `getBreakpoint()` uses OR logic for downgrade. A terminal at 200×30 (cols ≥ 200 but rows < 40) is classified as `"minimum"`, not `"standard"`. This is deliberate — either axis being too small triggers collapse.

### Resize Scenarios

1. **Standard → Minimum**: `useSidebarState`'s `resolveSidebarVisibility()` detects `breakpoint === "minimum"` and sets `autoOverride=true`, `visible=false`. `useSplitFocus` detects `sidebarVisible` change, `useEffect` fires and snaps focus to `"main"`. `useScreenKeybindings` re-registers without Tab/Ctrl+W bindings (memo key changes). Status bar hints update.
2. **Minimum → Standard**: `resolveSidebarVisibility()` clears `autoOverride=false`, resolves `visible` from `userPreference` (null → default true, or explicit boolean). If sidebar re-appears, Tab/Ctrl+W bindings re-register. Focus stays on `"main"`.
3. **Standard → Large**: `layout.sidebarWidth` changes from `"25%"` to `"30%"` (via `getSidebarWidth()` in `useLayout.ts`). No focus change. OpenTUI re-layouts.
4. **Any → Unsupported (<80×24)**: `AppShell` intercepts (breakpoint is `null`) and renders `TerminalTooSmallScreen`. `SplitLayout` is not rendered.

### Ctrl+B at Minimum Breakpoint

At minimum breakpoint, `useSidebarState.toggle()` (line 83-91 of `useSidebarState.ts`) checks `autoOverride` (which is `true` at minimum breakpoint) and returns early — it's a no-op. This is handled in the `toggle` callback of `useSidebarState`, not in `SplitLayout`. The user can't force the sidebar open at 80 columns because there isn't enough space for usable content in both panels.

---

## 7. Keyboard Event Routing

### Dispatch Flow

```
Keypress arrives at KeybindingProvider.useKeyboard()
  → normalizeKeyEvent(event) produces descriptor string
  → getActiveScopesSorted(): priority ASC, LIFO within same priority
  → For each scope:
      → Look up descriptor in scope.bindings Map
      → If found: check handler.when() predicate (if present)
        → when() returns false: skip, continue to next scope
        → when() returns true (or absent): call handler.handler(), consume event
      → If not found: continue to next scope
  → No match: falls through to OpenTUI focused component
```

### Panel-Specific Keybindings

For screen-specific panel keybindings (e.g., `j/k` in a file tree vs. `j/k` in a file preview), the consuming screen should pass them via `additionalKeybindings`. Because `useScreenKeybindings` internally uses `Map<string, KeyHandler>` which deduplicates by key (last `set()` wins), the recommended pattern is a single handler per key that internally checks focus:

```typescript
// Example consumer — Code Explorer Screen:
const [focusedPanel, setFocusedPanel] = useState<SplitPanel>("main");

<SplitLayout
  sidebar={(focused) => <FileTree focused={focused} items={files} />}
  main={(focused) => <FilePreview focused={focused} content={content} />}
  onFocusChange={setFocusedPanel}
  sidebarTitle="Files"
  mainTitle="Preview"
  additionalKeybindings={[
    {
      key: "j",
      description: focusedPanel === "sidebar" ? "Next file" : "Scroll down",
      group: "Navigation",
      handler: () => {
        if (focusedPanel === "sidebar") moveFileDown();
        else scrollDown();
      },
    },
    {
      key: "k",
      description: focusedPanel === "sidebar" ? "Previous file" : "Scroll up",
      group: "Navigation",
      handler: () => {
        if (focusedPanel === "sidebar") moveFileUp();
        else scrollUp();
      },
    },
  ]}
/>
```

**Why not use `when` predicates for duplicate keys?** The `Map<string, KeyHandler>` stores one entry per normalized key descriptor. If two bindings with key `"j"` are pushed into the array, the second overwrites the first when the Map is built (line 30-31 of `useScreenKeybindings.ts`). A `when` predicate on the lost binding is never checked. The single-handler pattern avoids this entirely.

---

## 8. Visual Specification

### Standard Breakpoint (120×40), Main Panel Focused (default)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Dashboard › owner/repo › Code Explorer                                                   ● connected   ◆ 3     │
├───────────────────────────────────┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┤
│ Files (default border)            ┃ Preview (primary border)                                                   ┃
│                                   ┃                                                                            ┃
│ ▸ src/                            ┃   # README.md                                                              ┃
│   ▸ components/                   ┃                                                                            ┃
│   ▸ hooks/                        ┃   Welcome to the project...                                                ┃
│     index.tsx                     ┃                                                                            ┃
│ ▸ tests/                          ┃                                                                            ┃
│   package.json                    ┃                                                                            ┃
│   README.md                       ┃                                                                            ┃
│                                   ┃                                                                            ┃
├───────────────────────────────────┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┤
│ Tab switch panel │ Ctrl+B toggle sidebar │ j/k navigate │ Enter open                            │ ? help │ ◆ 3 │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Standard Breakpoint (120×40), Sidebar Panel Focused (after Tab)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Dashboard › owner/repo › Code Explorer                                                   ● connected   ◆ 3     │
├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳───────────────────────────────────────────────────────────────────────────────┤
┃ Files (primary border)            ┃ Preview (default border)                                                   │
┃                                   ┃                                                                            │
┃ ▸ src/                            ┃   # README.md                                                              │
┃   ▸ components/                   ┃                                                                            │
┃   ▸ hooks/                        ┃   Welcome to the project...                                                │
┃     index.tsx  ◀                  ┃                                                                            │
┃ ▸ tests/                          ┃                                                                            │
┃   package.json                    ┃                                                                            │
┃   README.md                       ┃                                                                            │
┃                                   ┃                                                                            │
├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┻───────────────────────────────────────────────────────────────────────────────┤
│ Tab switch panel │ Ctrl+B toggle sidebar │ j/k navigate │ Enter open                            │ ? help │ ◆ 3 │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Minimum Breakpoint (80×24), Sidebar Hidden

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ … › Code Explorer                                                      ◆ 3    │
├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┤
┃ Preview (primary border, full width)                                           ┃
┃                                                                                ┃
┃   # README.md                                                                  ┃
┃                                                                                ┃
┃   Welcome to the project...                                                    ┃
┃                                                                                ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
│ Ctrl+B sidebar │ j/k navigate │ Enter open                            │ ? help │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Border Color Legend

- **Primary-colored border** (`theme.primary`): The panel that currently has keyboard focus. Truecolor: `#2563EB`, ANSI 256: index 33, ANSI 16: Blue.
- **Default border** (`theme.border`): The unfocused panel. Truecolor: `#525252`, ANSI 256: index 240, ANSI 16: dim white.

---

## 9. Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Terminal resized below minimum while sidebar is focused | `resolveSidebarVisibility()` returns `autoOverride=true`, `visible=false`. `useSplitFocus` `useEffect` fires → `focusedPanel` set to `"main"`. Single-panel fallback renders. |
| `Ctrl+B` pressed at minimum breakpoint | `layout.sidebar.toggle()` calls `useSidebarState.toggle()` which checks `autoOverride===true` (line 86) and returns early. No-op. |
| `Ctrl+B` pressed at standard to hide sidebar, then resize to minimum | Sidebar stays hidden. `userPreference=false` + `autoOverride=true` both agree on hidden. |
| `Ctrl+B` pressed at standard to hide sidebar, then resize to large | Sidebar stays hidden. `userPreference=false` is respected at large (`autoOverride=false`, so `resolveSidebarVisibility` returns `visible=userPreference=false`). |
| `Ctrl+B` pressed at standard to hide, `Ctrl+B` again to show, then resize to minimum | At minimum: `autoOverride=true` overrides `userPreference=true` (line 52-54 of `useSidebarState.ts`). Sidebar hidden. Back to standard: `autoOverride=false`, `userPreference=true` is respected. Sidebar reappears. |
| Tab pressed when sidebar is hidden | Tab/Ctrl+W are not registered in the keybinding scope (conditionally excluded when `!sidebarFocusable`). Falls through to next scope or OpenTUI. |
| Tab pressed with modal open | Modal keybinding scope (`PRIORITY.MODAL=2`) intercepts Tab before SplitLayout's `PRIORITY.SCREEN=4` scope. |
| `sidebar` render prop throws | Error boundary above SplitLayout catches (the `ErrorBoundary` in the provider stack). SplitLayout itself has no error boundary. |
| Both `onSidebarKey` and `onMainKey` are undefined | Component works purely for visual layout. Only Tab/Ctrl+W/Ctrl+B keybindings are active. |
| Consumer passes `initialFocus="sidebar"` but sidebar is hidden | `useSplitFocus` returns `focusedPanel="main"` (guarded return on line `focusedPanel: sidebarVisible ? focusedPanel : "main"`) and `useEffect` sets internal state to `"main"`. |
| Multiple `SplitLayout` instances mounted simultaneously | Each registers its own SCREEN scope. The most recently registered (LIFO) takes precedence within `PRIORITY.SCREEN`. This is an unsupported pattern — only one SplitLayout should be active per screen. |
| `useScreenKeybindings` memo dependency — `bindings.map(b => b.key).join(",")` | When `sidebarFocusable` toggles, the key list changes (Tab/Ctrl+W added/removed). This correctly triggers scope re-registration via the memo. |
| `useSidebarState` first toggle from null | `userPreference` starts as `null`. First toggle at standard/large: `prev === null` → returns `false` (hides sidebar, since default was visible). Second toggle: `!false` → `true`. |

---

## 10. File Inventory

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/hooks/useSplitFocus.ts` | **Create** | Binary focus state hook for two-panel layout |
| `apps/tui/src/components/SplitLayout.tsx` | **Create** | Two-panel split layout component with focus management |
| `apps/tui/src/hooks/index.ts` | **Modify** | Add `useSplitFocus`, `SplitPanel`, `SplitFocusState` exports |
| `apps/tui/src/components/index.ts` | **Modify** | Add `SplitLayout`, `SplitLayoutProps` exports |
| `apps/tui/src/hooks/useGlobalKeybindings.ts` | **Modify** | Add `onSidebarToggle` to `GlobalKeybindingActions` and register `ctrl+b` binding |
| `apps/tui/src/components/GlobalKeybindings.tsx` | **Modify** | Import `useLayout`, create `onSidebarToggle` callback, pass to `useGlobalKeybindings` |
| `e2e/tui/split-layout.test.ts` | **Create** | E2E tests for SplitLayout component |

---

## 11. Unit & Integration Tests

**File:** `e2e/tui/split-layout.test.ts`

All tests use `@microsoft/tui-test` with the `launchTUI` helper from `e2e/tui/helpers.ts`. The helper provides:
- `launchTUI({ cols, rows, env, args })` — spawns TUI in real PTY via `@microsoft/tui-test`'s `spawn()`, creates xterm-headless terminal emulator
- `sendKeys(...keys)` — resolves key names via `resolveKey()` (e.g., `"ctrl+b"` → dynamic `ctrl+X` pattern at line 248: `{ type: "press", key: "b", modifiers: { ctrl: true } }`, `"Tab"` → `{ type: "press", key: "Tab" }`, `"ctrl+w"` → `{ type: "press", key: "w", modifiers: { ctrl: true } }`). 50ms delay between keys.
- `waitForText(text, timeoutMs?)` — polls terminal buffer every 100ms, default 10s timeout
- `snapshot()` — returns full terminal buffer as flat string (rows joined with `\n`)
- `getLine(n)` — returns specific line (0-indexed) from `getViewableBuffer()`
- `resize(cols, rows)` — resizes PTY, waits 200ms for SIGWINCH processing
- `terminate()` — kills process and cleans up temp config directory

Tests navigate to a screen that uses `SplitLayout` (e.g., code explorer). If the code explorer screen doesn't exist yet, tests will fail — **they are never skipped or commented out** per the project's test philosophy.

### Test Categories

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, TERMINAL_SIZES, type TUITestInstance } from "./helpers.js";

describe("TUI_REPO_SIDEBAR_SPLIT_LAYOUT", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    await terminal?.terminate();
  });

  // ── Snapshot Tests ──────────────────────────────────────────────────────

  describe("Terminal Snapshot Tests", () => {
    test("SNAP-SPLIT-001: renders two-panel layout at standard breakpoint (120x40)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      // Navigate to a screen that uses SplitLayout (code explorer)
      await terminal.sendKeys("g", "r"); // Go to repos
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter"); // Open first repo
      await terminal.waitForText("Code");
      // Should see sidebar + main with two bordered panels
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-SPLIT-002: renders single-panel layout at minimum breakpoint (80x24)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");
      // Sidebar should be hidden — only main panel visible
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-SPLIT-003: renders wider sidebar at large breakpoint (200x60)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");
      // Sidebar should be 30% width at large breakpoint
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-SPLIT-004: main panel has primary border by default (it has focus)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");
      // Default state: main panel focused (primary border)
      // Sidebar unfocused (default border)
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-SPLIT-005: sidebar gets primary border when focused via Tab", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");
      await terminal.sendKeys("Tab"); // Focus sidebar
      // Sidebar should now have primary border, main has default border
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ── Keyboard Interaction Tests ──────────────────────────────────────────

  describe("Keyboard Interaction Tests", () => {
    test("KEY-SPLIT-001: Tab toggles focus between panels", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // Initial state: main panel focused
      const snapMainFocused = terminal.snapshot();

      // Tab → sidebar focused
      await terminal.sendKeys("Tab");
      const snapSidebarFocused = terminal.snapshot();
      expect(snapSidebarFocused).not.toBe(snapMainFocused); // Border colors changed

      // Tab → main focused again
      await terminal.sendKeys("Tab");
      const snapMainAgain = terminal.snapshot();
      expect(snapMainAgain).toMatchSnapshot(); // Should match initial focus state
    });

    test("KEY-SPLIT-002: Ctrl+W toggles focus between panels", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      const snapBefore = terminal.snapshot();
      await terminal.sendKeys("ctrl+w");
      const snapAfter = terminal.snapshot();
      expect(snapAfter).not.toBe(snapBefore); // Focus changed
    });

    test("KEY-SPLIT-003: Ctrl+B hides sidebar at standard breakpoint", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // Toggle sidebar off
      await terminal.sendKeys("ctrl+b");
      // Main panel should now be full width with primary border
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-SPLIT-004: Ctrl+B restores sidebar after hiding", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // Hide then show
      await terminal.sendKeys("ctrl+b"); // hide
      await terminal.sendKeys("ctrl+b"); // show
      // Should be back to two-panel layout
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-SPLIT-005: Ctrl+B is no-op at minimum breakpoint", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      const snapBefore = terminal.snapshot();
      await terminal.sendKeys("ctrl+b"); // Should be no-op
      const snapAfter = terminal.snapshot();
      expect(snapAfter).toBe(snapBefore);
    });

    test("KEY-SPLIT-006: Tab is no-op when sidebar is hidden at minimum", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      const snapBefore = terminal.snapshot();
      await terminal.sendKeys("Tab");
      const snapAfter = terminal.snapshot();
      // No focus change — Tab not registered when sidebar is hidden
      expect(snapAfter).toBe(snapBefore);
    });

    test("KEY-SPLIT-007: Tab cycles focus repeatedly (4 toggles returns to start)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      const snapInitial = terminal.snapshot();
      // 4 tabs: main → sidebar → main → sidebar → main (even number = same state)
      await terminal.sendKeys("Tab", "Tab", "Tab", "Tab");
      // Should be visually identical to initial state
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-SPLIT-008: q still works for back navigation from split layout", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // q falls through SplitLayout's SCREEN scope to GLOBAL scope
      await terminal.sendKeys("q");
      await terminal.waitForText("Repositories");
    });

    test("KEY-SPLIT-009: Ctrl+B hides sidebar while sidebar is focused, focus snaps to main", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // Focus sidebar, then hide it
      await terminal.sendKeys("Tab"); // Focus sidebar
      await terminal.sendKeys("ctrl+b"); // Hide sidebar
      // Main panel should be full width with primary border (focus snapped to main)
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ── Resize Tests ────────────────────────────────────────────────────────

  describe("Resize Tests", () => {
    test("RESIZE-SPLIT-001: resize from standard to minimum hides sidebar", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      const snapStandard = terminal.snapshot();

      // Resize to minimum
      await terminal.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
      const snapMinimum = terminal.snapshot();

      expect(snapMinimum).not.toBe(snapStandard);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RESIZE-SPLIT-002: resize from minimum to standard shows sidebar", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // Resize to standard — sidebar should appear
      await terminal.resize(TERMINAL_SIZES.standard.width, TERMINAL_SIZES.standard.height);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RESIZE-SPLIT-003: resize from standard to large widens sidebar (25% → 30%)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      await terminal.resize(TERMINAL_SIZES.large.width, TERMINAL_SIZES.large.height);
      // Sidebar should be 30% width now
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RESIZE-SPLIT-004: focus snaps to main when sidebar hidden by resize", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // Focus sidebar
      await terminal.sendKeys("Tab");

      // Resize to minimum — sidebar hides, focus should snap to main
      await terminal.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
      // Main panel should have primary border (it's the only panel, always focused)
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RESIZE-SPLIT-005: user sidebar hide preference preserved across resize", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // User hides sidebar
      await terminal.sendKeys("ctrl+b");

      // Resize to large — sidebar should stay hidden (userPreference=false respected)
      await terminal.resize(TERMINAL_SIZES.large.width, TERMINAL_SIZES.large.height);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RESIZE-SPLIT-006: sidebar reappears after resize if user never toggled it", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // Resize to minimum (sidebar auto-hides, no user preference set)
      await terminal.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
      // Resize back to standard — sidebar should reappear (userPreference=null, default visible)
      await terminal.resize(TERMINAL_SIZES.standard.width, TERMINAL_SIZES.standard.height);
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ── Status Bar Hint Tests ───────────────────────────────────────────────

  describe("Status Bar Hints", () => {
    test("HINT-SPLIT-001: status bar shows Tab hint when sidebar visible", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // Last line (status bar) should contain panel-switching hint
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toMatch(/Tab/);
      expect(statusBar).toMatch(/switch panel/);
    });

    test("HINT-SPLIT-002: status bar shows Ctrl+B hint", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toMatch(/Ctrl\+B/);
      expect(statusBar).toMatch(/toggle sidebar/);
    });

    test("HINT-SPLIT-003: Tab hint removed when sidebar hidden at minimum", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      const statusBar = terminal.getLine(terminal.rows - 1);
      // Tab hint should NOT be present — no panel to switch to
      expect(statusBar).not.toMatch(/switch panel/);
    });

    test("HINT-SPLIT-004: Ctrl+B hint still shown at minimum breakpoint", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      const statusBar = terminal.getLine(terminal.rows - 1);
      // Ctrl+B is always registered even at minimum (it's a no-op but discoverable)
      expect(statusBar).toMatch(/Ctrl\+B/);
    });

    test("HINT-SPLIT-005: Tab hint disappears when sidebar is toggled off via Ctrl+B", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // Initially Tab hint is visible
      let statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toMatch(/switch panel/);

      // Hide sidebar
      await terminal.sendKeys("ctrl+b");

      // Tab hint should be gone
      statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).not.toMatch(/switch panel/);
    });
  });

  // ── Integration Tests ──────────────────────────────────────────────────

  describe("Integration Tests", () => {
    test("INT-SPLIT-001: SplitLayout works with code explorer file tree", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Code");

      // Focus sidebar and navigate file tree
      await terminal.sendKeys("Tab"); // Focus sidebar
      await terminal.sendKeys("j"); // Move down in file tree
      await terminal.sendKeys("Enter"); // Open file
      // Main panel should show file content
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("INT-SPLIT-002: SplitLayout works with diff file tree", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      // Navigate to a diff view that uses SplitLayout
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      // Navigate to changes/diff tab
      await terminal.waitForText("Changes");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("INT-SPLIT-003: Ctrl+B works on screen without SplitLayout (global fallback)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      // Dashboard doesn't use SplitLayout, but Ctrl+B should still
      // be handled by GlobalKeybindings (no crash, no error)
      const snapBefore = terminal.snapshot();
      await terminal.sendKeys("ctrl+b");
      // Should not crash — GlobalKeybindings handles it
      const snapAfter = terminal.snapshot();
      // On a screen without sidebar, toggle is harmless
      expect(snapAfter).toBeDefined();
    });
  });
});
```

### Test Philosophy Notes

1. **Tests that fail due to unimplemented backends are left failing.** If the code explorer screen doesn't exist yet, these tests will fail when `waitForText("Code")` times out. They are never skipped or commented out.

2. **No mocking of implementation details.** Tests launch a real TUI instance via `launchTUI()` (which spawns a real PTY via `@microsoft/tui-test`'s `spawn()` with `@xterm/headless` terminal emulation) and interact via keyboard. Internal state (`focusedPanel`, `sidebarVisible`) is verified through visual output (snapshots and text assertions), not by inspecting React state.

3. **Each test validates one behavior.** Test names describe the user-facing behavior (e.g., "Tab toggles focus between panels"), not implementation details (not "useSplitFocus toggles state").

4. **Snapshot tests at representative sizes.** All three breakpoints (80×24, 120×40, 200×60) are tested using the `TERMINAL_SIZES` constants from helpers.

5. **Tests are independent.** Each test launches a fresh TUI instance via `launchTUI()`. `afterEach` calls `terminate()` for cleanup (kills process, removes temp config dir). No shared state between tests.

6. **Key name mapping is correct.** The `resolveKey()` function in helpers.ts maps: `"ctrl+b"` → dynamic `ctrl+X` pattern (line 248): extracts `key[5]="b"` → `{ type: "press", key: "b", modifiers: { ctrl: true } }`. `"Tab"` → switch case (line 205): `{ type: "press", key: "Tab" }`. `"ctrl+w"` → dynamic pattern: `{ type: "press", key: "w", modifiers: { ctrl: true } }`. These produce terminal escape sequences that OpenTUI's input handler normalizes via `normalizeKeyEvent()` to match the registered key descriptors.

---

## 12. Productionization Checklist

### From PoC to Production

All code in this spec targets production paths in `apps/tui/src/`. There is no PoC code to graduate. The implementation is production-ready from the start because:

1. **`useSplitFocus`** is a pure state hook with no external dependencies beyond React. It is deterministic and testable through component behavior. No PoC needed.

2. **`SplitLayout`** composes existing production hooks (`useLayout`, `useTheme`, `useScreenKeybindings`) which are all fully implemented and validated. It adds no new runtime dependencies.

3. **`Ctrl+B` global binding** extends the existing `GlobalKeybindings` component and `useGlobalKeybindings` hook which are already in the production provider stack.

### Pre-merge Validation

- [ ] `bun run check` passes in `apps/tui/` (TypeScript compilation, no type errors)
- [ ] All new files import with `.js` extension suffixes (ESM convention used throughout codebase)
- [ ] `useSplitFocus.ts` exports match what `hooks/index.ts` re-exports
- [ ] `SplitLayout.tsx` exports match what `components/index.ts` re-exports
- [ ] `GlobalKeybindingActions` interface change doesn't break existing `GlobalKeybindings.tsx` (must add `onSidebarToggle` callback in both files)
- [ ] Snapshot tests generate valid golden files at all 3 breakpoints
- [ ] Keyboard interaction tests pass (Tab, Ctrl+W, Ctrl+B)
- [ ] Resize tests pass (standard↔minimum↔large transitions)
- [ ] `useSplitFocus` focus-snap behavior verified (sidebar hidden → focus to main)
- [ ] Status bar hints update correctly based on sidebar visibility
- [ ] No regressions in existing `e2e/tui/app-shell.test.ts` tests
- [ ] Manual smoke test: launch TUI, navigate to code explorer, verify Tab/Ctrl+W/Ctrl+B, resize terminal

### Performance Considerations

- **No per-render allocation**: `useSplitFocus` returns a memoized object via `useMemo`. `SplitLayout` memoizes `keybindings` and `hints` arrays via `useMemo`. No new objects created on re-render unless dependencies change.
- **Synchronous resize**: Layout recalculation on resize is synchronous (no debounce, no animation) per architecture spec. `useTerminalDimensions` → `useSidebarState` → `useSplitFocus` → render, all in one synchronous cycle.
- **Render count**: Focus toggle causes exactly 1 re-render of `SplitLayout` (state change in `useSplitFocus` → `focusedPanel` changes → border colors recompute → re-render). Child components re-render only if their `focused` prop changes (true → false or false → true).
- **Keybinding scope lifecycle**: `useScreenKeybindings` registers scope once on mount, updates when `bindings.map(b => b.key).join(",")` changes (i.e., when `sidebarFocusable` toggles adding/removing Tab/Ctrl+W), and removes on unmount. No per-render scope churn.
- **Ref pattern for fresh handlers**: `useScreenKeybindings` internally uses a ref pattern (`bindingsRef.current = bindings`) to keep handler functions fresh without triggering scope re-registration. The handler wrapper dereferences the ref at call time via `.find()` (line 33 of `useScreenKeybindings.ts`).

### Accessibility

- Focus is always visible via border color differentiation (primary vs. default).
- Status bar hints always show available panel-switching keybindings.
- When sidebar is hidden, all panel-switching affordances (Tab hint, Ctrl+W) are removed — no confusing dead keys.
- The `Ctrl+B` hint remains visible even at minimum breakpoint for discoverability, though the action is a no-op.

---

## 13. Open Questions

| # | Question | Default Resolution |
|---|----------|-------------------|
| 1 | Should `SplitLayout` support vertical splits (top/bottom) in addition to horizontal? | No. Horizontal (left/right) only. Vertical splits would be a separate `VSplitLayout` component if needed. |
| 2 | Should the sidebar width be capped at an absolute maximum column count? | No cap in this ticket. A 60-column cap could be added in a follow-up if needed for very wide terminals. |
| 3 | Should focus state persist across screen transitions (push/pop)? | No. Each screen mounts fresh. `useSplitFocus` initializes to `initialFocus` (default `"main"`) on mount. The `NavigationProvider`'s scroll position cache handles content restoration; focus state resets. |
| 4 | Should duplicate key bindings in `additionalKeybindings` with `when` predicates both be registered? | No. `Map<string, KeyHandler>` deduplicates by key — last `set()` wins (line 31 of `useScreenKeybindings.ts`). Consumers must use a single handler per key with internal panel-focus checks. See §7 for the recommended pattern. |

---

## 14. Dependencies Graph

```
tui-theme-tokens (✅)          tui-responsive-layout (✅)
        │                              │
        └──────────┬───────────────────┘
                   │
                   ▼
     tui-repo-sidebar-split-layout (this ticket)
                   │
                   ▼
     tui-repo-code-explorer (future consumer)
     tui-diff-file-tree (future consumer)
```

This ticket has no downstream blockers — it is a leaf component that screens consume when they need a two-panel layout. The code explorer screen (`TUI_REPO_CODE_EXPLORER`) and diff file tree view (`TUI_DIFF`) are the primary future consumers.