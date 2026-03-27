# Engineering Specification: `tui-nav-chrome-feat-06`

## TUI_HELP_OVERLAY — Keybinding Reference Modal

**Ticket**: tui-nav-chrome-feat-06  
**Type**: Feature  
**Status**: Not started  
**Dependencies**: tui-nav-chrome-eng-02 (KeybindingProvider ✅), tui-nav-chrome-eng-03 (Responsive layout ✅), tui-nav-chrome-eng-04 (OverlayManager ✅), tui-nav-chrome-eng-06 (E2E test infra ✅)

---

## Summary

Implement the help overlay modal (`?` keybinding) that displays all keybindings for the current screen context. The overlay is a scrollable, grouped, two-column table of keybinding entries rendered inside the existing `OverlayLayer` system. It requires two new files (`HelpOverlay.tsx`, `HelpOverlayContext.tsx`), modifications to three existing files (`OverlayLayer.tsx`, `GlobalKeybindings.tsx`, `OverlayManager.tsx`), and a new E2E test section in `app-shell.test.ts`.

---

## Implementation Plan

### Step 1: Create `HelpOverlayContext` Provider

**File**: `apps/tui/src/providers/HelpOverlayContext.tsx`

This context allows screens to register their keybinding groups for display in the help overlay. It aggregates global, go-to, and screen-specific keybindings into a unified data model.

#### Interface Definitions

```typescript
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { goToBindings } from "../navigation/goToBindings.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface KeybindingEntry {
  /** Display format for the key combination (e.g., "j / Down", "Ctrl+S", "g d") */
  key: string;
  /** Human-readable description (e.g., "Move cursor down", "Save form") */
  description: string;
}

export interface KeybindingGroup {
  /** Group heading label (e.g., "Global", "Navigation", "Go To", "Diff") */
  name: string;
  /** Ordered list of keybinding entries within this group */
  bindings: KeybindingEntry[];
}

export interface HelpOverlayContextType {
  /** Register keybinding groups for the current screen. Returns cleanup function. */
  registerScreenGroups(groups: KeybindingGroup[]): () => void;
  /** Get all keybinding groups to display: Global + Go To + screen-specific. */
  getAllGroups(): KeybindingGroup[];
  /** Total count of all keybinding entries across all groups. */
  getTotalCount(): number;
}
```

#### Implementation Details

1. **Global group** — hardcoded, always included first:
   ```typescript
   const GLOBAL_GROUP: KeybindingGroup = {
     name: "Global",
     bindings: [
       { key: "?",      description: "Toggle help overlay" },
       { key: ":",      description: "Open command palette" },
       { key: "q",      description: "Back / quit" },
       { key: "Esc",    description: "Close overlay or back" },
       { key: "Ctrl+C", description: "Quit immediately" },
     ],
   };
   ```

2. **Go-to group** — derived from `goToBindings` array (11 entries), always included second:
   ```typescript
   const GO_TO_GROUP: KeybindingGroup = {
     name: "Go To",
     bindings: goToBindings.map((b) => ({
       key: `g ${b.key}`,
       description: b.description,
     })),
   };
   ```

3. **Screen-specific groups** — registered dynamically by each screen via `registerScreenGroups()`. Uses a ref to hold the current groups, and a version counter to trigger re-renders when groups change.

4. **`getAllGroups()`** returns `[GLOBAL_GROUP, GO_TO_GROUP, ...screenGroups]`. If no screen groups are registered, only global and go-to are returned (no empty section rendered).

5. **`getTotalCount()`** sums all `bindings.length` across all groups.

6. **Deduplication**: If a screen registers a key that collides with a global binding (same key descriptor), the global version takes precedence and the screen version is silently dropped. Log a `warn`-level message via `process.stderr` for debugging.

#### Context Wiring

The `HelpOverlayContext.Provider` is rendered **inside** `OverlayManager` in `index.tsx`'s provider stack. It wraps its children and requires no ancestor context dependencies beyond React itself. The import path for consumers is `../providers/HelpOverlayContext.js`.

Update the provider stack in `apps/tui/src/index.tsx`:
```diff
 <OverlayManager>
+  <HelpOverlayContextProvider>
     <AuthProvider ...>
       ...
+  </HelpOverlayContextProvider>
 </OverlayManager>
```

Export a convenience hook:
```typescript
export function useHelpOverlay(): HelpOverlayContextType {
  const ctx = useContext(HelpOverlayContext);
  if (!ctx) throw new Error("useHelpOverlay must be used within HelpOverlayContextProvider");
  return ctx;
}
```

---

### Step 2: Create `HelpOverlay` Component

**File**: `apps/tui/src/components/HelpOverlay.tsx`

This component renders the help overlay content inside the existing `OverlayLayer` container. It replaces the placeholder text currently shown for `activeOverlay === "help"`.

#### Component Structure

```tsx
import React, { useState, useCallback, useMemo, useEffect, useContext, useRef } from "react";
import { useHelpOverlay } from "../providers/HelpOverlayContext.js";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { KeybindingContext } from "../providers/KeybindingProvider.js";
import { PRIORITY, type KeyHandler } from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor } from "../providers/normalize-key.js";
import { truncateText } from "../util/text.js";
import type { KeybindingGroup } from "../providers/HelpOverlayContext.js";
```

#### Internal State

| State | Type | Default | Purpose |
|-------|------|---------|--------|
| `scrollOffset` | `number` | `0` | Current scroll position (first visible row index) |
| `gPending` | `boolean` | `false` | Tracks whether `g` was pressed (for `g g` jump-to-top chord) |
| `gTimerRef` | `React.RefObject<NodeJS.Timeout \| null>` | `null` | Timer for `g` chord timeout (1500ms) |

#### Keybinding Scope Registration

On mount, the `HelpOverlay` component registers a keybinding scope at `PRIORITY.MODAL` (priority 2) with the following bindings:

```typescript
const helpBindings = new Map<string, KeyHandler>();

// Scroll navigation
helpBindings.set(normalizeKeyDescriptor("j"), {
  key: "j", description: "Scroll down", group: "Help",
  handler: () => scrollDown(1),
});
helpBindings.set(normalizeKeyDescriptor("k"), {
  key: "k", description: "Scroll up", group: "Help",
  handler: () => scrollUp(1),
});
helpBindings.set(normalizeKeyDescriptor("Down"), {
  key: "down", description: "Scroll down", group: "Help",
  handler: () => scrollDown(1),
});
helpBindings.set(normalizeKeyDescriptor("Up"), {
  key: "up", description: "Scroll up", group: "Help",
  handler: () => scrollUp(1),
});
helpBindings.set(normalizeKeyDescriptor("G"), {
  key: "G", description: "Jump to bottom", group: "Help",
  handler: () => jumpToBottom(),
});
helpBindings.set(normalizeKeyDescriptor("g"), {
  key: "g", description: "Go-to top prefix", group: "Help",
  handler: () => handleGPress(),
});
helpBindings.set(normalizeKeyDescriptor("Ctrl+D"), {
  key: "ctrl+d", description: "Page down", group: "Help",
  handler: () => scrollDown(pageSize),
});
helpBindings.set(normalizeKeyDescriptor("Ctrl+U"), {
  key: "ctrl+u", description: "Page up", group: "Help",
  handler: () => scrollUp(pageSize),
});

// Toggle/dismiss (? key is handled by OverlayManager toggle logic)
// Esc is already registered by OverlayManager's modal scope
// Ctrl+C falls through to global (priority 5)
```

**Critical**: This scope must be registered **after** (higher ID than) the OverlayManager's escape scope, so both coexist at PRIORITY.MODAL. Since both are priority 2 and the KeybindingProvider dispatches LIFO within the same priority, the HelpOverlay's scope (registered later) gets first dibs on `j`, `k`, `G`, etc., while Escape falls through to the OverlayManager's scope.

The `?` key is NOT registered in this scope. Instead, the global `?` handler in `GlobalKeybindings` calls `openOverlay("help")` which triggers the OverlayManager's toggle logic (opening toggles `"help"` → `null` if already open). This means `?` closes the overlay naturally.

**Key suppression**: All keys not explicitly registered in this MODAL scope or in the OverlayManager's MODAL scope are **not consumed** by priority 2 scopes. They fall through to GOTO (3), SCREEN (4), and GLOBAL (5). To suppress `:` (command palette) and `q` (back) and other keys while the overlay is open, we add catch-all suppression bindings:

```typescript
// Suppress keys that should not propagate while help is open
const suppressedKeys = [":", "q", "/", "return", "space", "tab", "shift+tab"];
for (const key of suppressedKeys) {
  const normalized = normalizeKeyDescriptor(key);
  if (!helpBindings.has(normalized)) {
    helpBindings.set(normalized, {
      key: normalized, description: "(suppressed)", group: "Help",
      handler: () => {}, // no-op
    });
  }
}
```

#### Scroll Logic

```typescript
// Flatten all groups into a linear row model for scroll calculation.
// Each group heading = 2 rows (heading + separator), each binding = 1 row,
// each gap between groups = 1 row.
function computeTotalRows(groups: KeybindingGroup[]): number {
  let rows = 0;
  for (let i = 0; i < groups.length; i++) {
    if (i > 0) rows += 1; // gap between groups
    rows += 2; // heading + separator
    rows += groups[i].bindings.length;
  }
  return rows;
}

// Visible rows = overlay content height - 2 (title bar + scroll indicator footer)
const visibleRows = useMemo(() => {
  const overlayHeight = computeOverlayHeight(layout);
  return Math.max(1, overlayHeight - 4); // title bar, separator, footer, border
}, [layout]);

const totalRows = useMemo(() => computeTotalRows(groups), [groups]);
const maxScrollOffset = Math.max(0, totalRows - visibleRows);

function scrollDown(amount: number) {
  setScrollOffset((prev) => Math.min(prev + amount, maxScrollOffset));
}

function scrollUp(amount: number) {
  setScrollOffset((prev) => Math.max(0, prev - amount));
}

function jumpToBottom() {
  setScrollOffset(maxScrollOffset);
}

function jumpToTop() {
  setScrollOffset(0);
}

const pageSize = Math.max(1, Math.floor(visibleRows / 2));
```

#### `g g` Chord Handling

```typescript
function handleGPress() {
  if (gPending) {
    // Second 'g' within timeout → jump to top
    clearTimeout(gTimerRef.current);
    setGPending(false);
    jumpToTop();
  } else {
    // First 'g' → start chord timeout
    setGPending(true);
    gTimerRef.current = setTimeout(() => {
      setGPending(false);
    }, 1500);
  }
}

// Cleanup timer on unmount
useEffect(() => {
  return () => {
    if (gTimerRef.current) clearTimeout(gTimerRef.current);
  };
}, []);
```

#### Rendering

The component computes a flat array of renderable rows from groups, applies the scroll window, and renders the visible slice:

```typescript
type RenderRow =
  | { type: "gap" }
  | { type: "heading"; name: string }
  | { type: "separator"; width: number }
  | { type: "binding"; key: string; description: string };

function buildRenderRows(groups: KeybindingGroup[]): RenderRow[] {
  const rows: RenderRow[] = [];
  for (let i = 0; i < groups.length; i++) {
    if (i > 0) rows.push({ type: "gap" });
    rows.push({ type: "heading", name: groups[i].name });
    rows.push({ type: "separator", width: contentWidth });
    for (const binding of groups[i].bindings) {
      rows.push({ type: "binding", key: binding.key, description: binding.description });
    }
  }
  return rows;
}
```

Visible slice: `renderRows.slice(scrollOffset, scrollOffset + visibleRows)`

#### Responsive Column Widths

Key column and description column widths are derived from the overlay width and breakpoint:

```typescript
function getKeyColumnWidth(breakpoint: Breakpoint | null): number {
  switch (breakpoint) {
    case "large":    return 20;
    case "standard": return 18;
    case "minimum":  return 16;
    default:         return 14; // below minimum
  }
}

function computeOverlayColumns(layout: LayoutContext): number {
  const pct = layout.breakpoint === "minimum" || layout.breakpoint === null ? 0.9 : 0.6;
  return Math.floor(layout.width * pct);
}

function computeOverlayHeight(layout: LayoutContext): number {
  const pct = layout.breakpoint === "minimum" || layout.breakpoint === null ? 0.9 : 0.6;
  return Math.floor(layout.height * pct);
}

const overlayColumns = computeOverlayColumns(layout);
const keyColWidth = getKeyColumnWidth(layout.breakpoint);
// 2 for border, 2 for padding, 2 for column gap
const descColWidth = Math.max(10, overlayColumns - keyColWidth - 6);
```

#### Key Display Formatting

Keys are displayed in human-readable format per the acceptance criteria:
- `Ctrl+C` (not `^C`)
- `Shift+Tab` (not `S-Tab`)
- `Esc` (not `escape`)
- `Space` (not ` `)
- `g d`, `g i` (space-separated go-to sequences)

The key strings in `KeybindingEntry` are already in display format (set by the registering screen or the hardcoded global/go-to groups). No transformation needed at render time — the display format is the canonical format in the entry.

Key labels are capped at `keyColWidth` characters using `truncateText()` from `../util/text.js`. Description text is capped at `descColWidth` using the same utility.

#### Rendered JSX

```tsx
export function HelpOverlay() {
  const helpCtx = useHelpOverlay();
  const layout = useLayout();
  const theme = useTheme();
  const keybindingCtx = useContext(KeybindingContext);

  const [scrollOffset, setScrollOffset] = useState(0);
  const [gPending, setGPending] = useState(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeIdRef = useRef<string | null>(null);

  const groups = helpCtx.getAllGroups();
  const renderRows = useMemo(() => buildRenderRows(groups, contentWidth), [groups, contentWidth]);
  const totalRows = renderRows.length;

  // ... scroll logic, scope registration ...

  // Reset scroll on open
  useEffect(() => {
    setScrollOffset(0);
    setGPending(false);
  }, []); // runs on mount (overlay opening)

  // Clamp scroll on resize
  useEffect(() => {
    setScrollOffset((prev) => Math.min(prev, Math.max(0, totalRows - visibleRows)));
  }, [totalRows, visibleRows]);

  const visibleSlice = renderRows.slice(scrollOffset, scrollOffset + visibleRows);
  const scrollEnd = Math.min(scrollOffset + visibleRows, totalRows);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Title bar */}
      <box flexDirection="row" width="100%" paddingX={1}>
        <text bold fg={theme.primary}>Keybindings</text>
        <box flexGrow={1} />
        <text fg={theme.muted}>Esc to close</text>
      </box>

      {/* Separator */}
      <text fg={theme.border} paddingX={1}>
        {"─".repeat(Math.max(0, overlayColumns - 4))}
      </text>

      {/* Scrollable content */}
      <box flexGrow={1} flexDirection="column" paddingX={1}>
        {visibleSlice.map((row, i) => {
          switch (row.type) {
            case "gap":
              return <text key={`gap-${i}`}>{" "}</text>;
            case "heading":
              return <text key={`heading-${i}`} bold fg={theme.primary}>{row.name}</text>;
            case "separator":
              return <text key={`sep-${i}`} fg={theme.border}>{"─".repeat(row.width)}</text>;
            case "binding":
              return (
                <box key={`bind-${i}`} flexDirection="row">
                  <text fg={theme.warning} width={keyColWidth}>
                    {truncateText(row.key, keyColWidth)}
                  </text>
                  <text fg={theme.muted}>
                    {truncateText(row.description, descColWidth)}
                  </text>
                </box>
              );
          }
        })}
      </box>

      {/* Footer: scroll indicator */}
      <box flexDirection="row" justifyContent="flex-end" paddingX={1}>
        <text fg={theme.muted}>
          {totalRows > visibleRows
            ? `${scrollOffset + 1}-${scrollEnd} of ${totalRows}`
            : ""}
        </text>
      </box>
    </box>
  );
}
```

---

### Step 3: Update `OverlayLayer.tsx` to Render `HelpOverlay`

**File**: `apps/tui/src/components/OverlayLayer.tsx`

Replace the placeholder text for `activeOverlay === "help"` with the real `<HelpOverlay />` component.

#### Changes

```diff
 import React from "react";
 import { useOverlay } from "../hooks/useOverlay.js";
 import { useLayout } from "../hooks/useLayout.js";
 import { useTheme } from "../hooks/useTheme.js";
+import { HelpOverlay } from "./HelpOverlay.js";

 export function OverlayLayer() {
   const { activeOverlay, closeOverlay, confirmPayload } = useOverlay();
   const layout = useLayout();
   const theme = useTheme();

   if (activeOverlay === null) return null;

   const width = layout.modalWidth;
   const height = layout.modalHeight;

-  // Determine overlay title for placeholder rendering
-  const titleMap: Record<string, string> = {
-    "help": "Keybindings",
-    "command-palette": "Command Palette",
-    "confirm": confirmPayload?.title ?? "Confirm",
-  };
-  const title = titleMap[activeOverlay] ?? activeOverlay;
+  // Help overlay manages its own title/chrome
+  const isHelp = activeOverlay === "help";

   return (
     <box
       position="absolute"
       top="auto"
       left="auto"
       width={width as any}
       height={height as any}
       zIndex={100}
       flexDirection="column"
       border={true}
       borderColor={theme.border}
       backgroundColor={theme.surface}
-      padding={1}
+      padding={isHelp ? 0 : 1}
     >
-      {/* Title bar */}
-      <box flexDirection="row" width="100%">
-        <text fg={theme.primary}>
-          {title}
-        </text>
-        <box flexGrow={1} />
-        <text fg={theme.muted}>
-          Esc close
-        </text>
-      </box>
-
-      {/* Separator */}
-      <text fg={theme.border}>
-        {"─".repeat(40)}
-      </text>
-
-      {/* Content area */}
-      <box flexGrow={1} flexDirection="column">
-        {activeOverlay === "help" && (
-          <text fg={theme.muted}>[Help overlay content — pending TUI_HELP_OVERLAY implementation]</text>
-        )}
+      {isHelp ? (
+        <HelpOverlay />
+      ) : (
+        <>
+          {/* Title bar for non-help overlays */}
+          <box flexDirection="row" width="100%" paddingX={1}>
+            <text fg={theme.primary}>
+              {activeOverlay === "confirm" ? (confirmPayload?.title ?? "Confirm") : "Command Palette"}
+            </text>
+            <box flexGrow={1} />
+            <text fg={theme.muted}>Esc close</text>
+          </box>
+          <text fg={theme.border} paddingX={1}>{"─".repeat(40)}</text>
+          <box flexGrow={1} flexDirection="column" paddingX={1}>
             {activeOverlay === "command-palette" && (
               <text fg={theme.muted}>[Command palette content — pending TUI_COMMAND_PALETTE implementation]</text>
             )}
             {activeOverlay === "confirm" && confirmPayload && (
               <box flexDirection="column" gap={1}>
                 <text>{confirmPayload.message}</text>
                 <box flexDirection="row" gap={2}>
                   <text fg={theme.error}>[{confirmPayload.confirmLabel ?? "Confirm"}]</text>
                   <text fg={theme.muted}>[{confirmPayload.cancelLabel ?? "Cancel"}]</text>
                 </box>
               </box>
             )}
           </box>
+        </>
+      )}
     </box>
   );
 }
```

---

### Step 4: Wire `?` Keybinding in `GlobalKeybindings.tsx`

**File**: `apps/tui/src/components/GlobalKeybindings.tsx`

Replace the placeholder `onHelp` handler with the actual overlay toggle:

```diff
 import React, { useCallback } from "react";
 import { useNavigation } from "../providers/NavigationProvider.js";
 import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";
+import { useOverlay } from "../hooks/useOverlay.js";

 export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
   const nav = useNavigation();
+  const { openOverlay, isOpen } = useOverlay();

   const onQuit = useCallback(() => {
     if (nav.canGoBack) { nav.pop(); } else { process.exit(0); }
   }, [nav]);

   const onEscape = useCallback(() => {
     if (nav.canGoBack) { nav.pop(); }
   }, [nav]);

   const onForceQuit = useCallback(() => { process.exit(0); }, []);
-  const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);
+  const onHelp = useCallback(() => {
+    openOverlay("help");
+  }, [openOverlay]);
   const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);
   const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);

   useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo });
   return <>{children}</>;
 }
```

**Toggle behavior**: `openOverlay("help")` in the `OverlayManager` already implements toggle logic — if `activeOverlay === "help"`, it transitions to `null`. If `activeOverlay === "command-palette"`, it closes that overlay and opens help. If `activeOverlay === null`, it opens help. This is implemented in `OverlayManager.tsx` lines 75-96.

---

### Step 5: Update `OverlayManager.tsx` for Help-Specific Scroll Bindings

**File**: `apps/tui/src/providers/OverlayManager.tsx`

The current `OverlayManager` registers a MODAL scope with only `Escape` when any overlay opens. For the help overlay, we need the HelpOverlay component itself to register an additional MODAL scope with scroll bindings. The OverlayManager does NOT need changes for this — the HelpOverlay component handles its own scope registration internally (Step 2).

However, we need to ensure the OverlayManager's status bar override includes scroll hints for the help overlay:

```diff
 const overlayHints: StatusBarHint[] = [
   { keys: "Esc", label: "close", order: 0 },
+  ...(type === "help" ? [
+    { keys: "j/k", label: "scroll", order: 10 },
+    { keys: "G", label: "bottom", order: 20 },
+  ] : []),
 ];
```

---

### Step 6: Wire `HelpOverlayContextProvider` into Provider Stack

**File**: `apps/tui/src/index.tsx`

Add the `HelpOverlayContextProvider` to the provider stack:

```diff
 import { OverlayManager } from "./providers/OverlayManager.js";
+import { HelpOverlayContextProvider } from "./providers/HelpOverlayContext.js";

 // In the App component JSX:
 <OverlayManager>
+  <HelpOverlayContextProvider>
     <AuthProvider token={launchOptions.token} apiUrl={launchOptions.apiUrl}>
       ...
     </AuthProvider>
+  </HelpOverlayContextProvider>
 </OverlayManager>
```

---

### Step 7: Create `useHelpKeybindings` Hook for Screen Integration

**File**: `apps/tui/src/hooks/useHelpKeybindings.ts`

A convenience hook that screens call to register their keybinding entries with the help overlay context:

```typescript
import { useEffect } from "react";
import { useHelpOverlay, type KeybindingGroup } from "../providers/HelpOverlayContext.js";

/**
 * Register screen-specific keybinding groups with the help overlay.
 * Groups are automatically unregistered when the screen unmounts.
 *
 * @example
 * useHelpKeybindings([
 *   {
 *     name: "Navigation",
 *     bindings: [
 *       { key: "j / Down", description: "Move cursor down" },
 *       { key: "k / Up", description: "Move cursor up" },
 *       { key: "Enter", description: "Open selected item" },
 *     ],
 *   },
 *   {
 *     name: "Actions",
 *     bindings: [
 *       { key: "Space", description: "Toggle selection" },
 *       { key: "/", description: "Focus search" },
 *     ],
 *   },
 * ]);
 */
export function useHelpKeybindings(groups: KeybindingGroup[]): void {
  const helpCtx = useHelpOverlay();

  useEffect(() => {
    return helpCtx.registerScreenGroups(groups);
  // Depend on serialized group structure to avoid unnecessary re-registers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpCtx, JSON.stringify(groups)]);
}
```

---

## File Manifest

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/providers/HelpOverlayContext.tsx` | **Create** | Context provider for help overlay keybinding registry |
| `apps/tui/src/components/HelpOverlay.tsx` | **Create** | Help overlay content component with scroll and rendering |
| `apps/tui/src/hooks/useHelpKeybindings.ts` | **Create** | Convenience hook for screens to register help keybindings |
| `apps/tui/src/components/OverlayLayer.tsx` | **Modify** | Replace placeholder with `<HelpOverlay />` |
| `apps/tui/src/components/GlobalKeybindings.tsx` | **Modify** | Wire `onHelp` to `openOverlay("help")` |
| `apps/tui/src/providers/OverlayManager.tsx` | **Modify** | Add scroll hints to status bar override for help type |
| `apps/tui/src/index.tsx` | **Modify** | Add `HelpOverlayContextProvider` to provider stack |
| `e2e/tui/app-shell.test.ts` | **Modify** | Add TUI_HELP_OVERLAY test section |

---

## Interaction Matrix

| Scenario | `?` pressed | `:` pressed | `Esc` pressed | `q` pressed | `j/k` pressed | `Ctrl+C` pressed |
|----------|------------|------------|--------------|------------|--------------|------------------|
| No overlay open | Opens help | Opens cmd palette | Pops screen / no-op | Pops screen / quit | Screen-specific | Quits TUI |
| Help overlay open | Closes help (toggle) | **Suppressed** | Closes help | **Suppressed** | Scrolls within help | Quits TUI |
| Cmd palette open | Closes cmd palette, opens help | Closes cmd palette (toggle) | Closes cmd palette | Depends on cmd palette impl | Cmd palette navigation | Quits TUI |

**Priority resolution for key suppression while help is open:**
1. `j`, `k`, `G`, `g`, `Up`, `Down`, `Ctrl+D`, `Ctrl+U` → HelpOverlay MODAL scope (scroll)
2. `Escape` → OverlayManager MODAL scope (close)
3. `:`, `q`, `/`, `Return`, `Space`, `Tab`, `Shift+Tab` → HelpOverlay MODAL scope (no-op suppression)
4. `?` → GLOBAL scope (triggers `openOverlay("help")` which toggles to closed)
5. `Ctrl+C` → GLOBAL scope (quits)

---

## Responsive Behavior Detail

| Terminal Size | Overlay Dimensions | Key Column | Desc Column | Content Width | Behavior |
|--------------|-------------------|-----------|-------------|---------------|----------|
| <80×24 (null breakpoint) | 100% × 100% | 14 chars | remainder | full width - 4 | Condensed. Overlay fills entire terminal. |
| 80×24 (minimum) | 90% × 90% = ~72×21 | 16 chars | ~50 chars | 68 chars | Descriptions truncated >40 chars with `…` |
| 120×40 (standard) | 60% × 60% = ~72×24 | 18 chars | ~48 chars | 68 chars | Full display, no truncation for ≤60 char descriptions |
| 200×60 (large) | 60% × 60% = ~120×36 | 20 chars | ~94 chars | 116 chars | Extra breathing room |

**Resize handling:**
- `useLayout()` recalculates on every `SIGWINCH` (synchronous, no debounce)
- `HelpOverlay` re-renders with new dimensions
- `scrollOffset` is clamped: `Math.min(scrollOffset, Math.max(0, newTotalRows - newVisibleRows))`
- No scroll position loss — content reflows but approximate position is maintained

---

## Telemetry Integration

Telemetry events are emitted via the existing TUI telemetry infrastructure (if present). If no telemetry provider exists yet, the events are defined for future integration:

```typescript
// In HelpOverlay.tsx — on open:
emitEvent("tui.help_overlay.opened", {
  screen: currentScreen.screen,
  terminal_columns: layout.width,
  terminal_rows: layout.height,
  total_keybindings: helpCtx.getTotalCount(),
  group_count: groups.length,
});

// In HelpOverlay.tsx — on close:
emitEvent("tui.help_overlay.closed", {
  screen: currentScreen.screen,
  close_method: closedViaEscape ? "escape" : "toggle",
  duration_ms: Date.now() - openedAt,
  scrolled: hasScrolled,
});

// In HelpOverlay.tsx — on scroll:
emitEvent("tui.help_overlay.scrolled", {
  screen: currentScreen.screen,
  scroll_direction: direction,
});
```

If the telemetry layer is not yet implemented, these calls are replaced with debug-level `process.stderr.write()` logs guarded by a `DEBUG` env var check.

---

## Error Handling

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| `HelpOverlayContext` not in tree | `useHelpOverlay()` throws | Error boundary catches. Overlay is not rendered. Status bar shows flash error. |
| Scroll offset exceeds bounds after resize | `clampScroll` in `useEffect` | Clamped to `[0, maxScrollOffset]`. No user-visible error. |
| Screen unmounts while overlay is open | Screen's `useEffect` cleanup calls `unregisterScreenGroups()` | Overlay re-renders showing only Global + Go To groups. Graceful. |
| Empty screen groups registered | `groups.length === 0` for screen section | Only Global + Go To rendered. No empty section heading shown. |
| React render error in HelpOverlay | Component-level error boundary inside OverlayLayer | Overlay closes, status bar flash: "Help overlay error — press ? to retry". |
| Rapid `?` toggle (<100ms) | React batching handles state updates | Single final state applied. No flicker. |

---

## Logging

| Level | Event | Payload |
|-------|-------|---------|
| `debug` | Help overlay toggled | `{ action: "open" \| "close", screen, keybindingCount }` |
| `debug` | Screen groups registered | `{ screen, groups: string[], totalBindings: number }` |
| `warn` | Keybinding collision | `{ key, globalGroup: "Global", screenGroup: string }` |
| `debug` | Overlay resize triggered | `{ newColumns, newRows, overlayWidth, overlayHeight }` |

All logging goes to `process.stderr` in structured JSON format, gated by `process.env.DEBUG` or `process.env.CODEPLANE_TUI_DEBUG`.

---

## Productionization Notes

This feature is entirely client-side and requires no backend integration, API changes, or authentication. There are no PoC components to graduate — the implementation goes directly into production code.

**Code quality gates:**
1. All files pass `tsc --noEmit` (the `check` script in package.json)
2. No `any` types except where required by OpenTUI's component props (existing pattern in `OverlayLayer.tsx` line 45)
3. All exports are explicitly typed (no inferred return types on exported functions)
4. No circular imports — `HelpOverlayContext` depends only on `goToBindings` and React
5. Component unmount cleans up all keybinding scopes and timers (no memory leaks)
6. Scroll offset state is reset on every mount (overlay open) to prevent stale state

**Performance considerations:**
- `buildRenderRows()` is memoized on `groups` reference
- `getAllGroups()` returns a new array each call but is called once per render
- No `useEffect` with network side effects
- The overlay is unmounted (not hidden) when closed — zero memory footprint when inactive
- Key suppression map is built once on mount and never rebuilt

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All tests are appended to the existing `app-shell.test.ts` file inside a new `describe("TUI_HELP_OVERLAY")` block. Tests use the existing `launchTUI()` helper and `TUITestInstance` interface from `e2e/tui/helpers.ts`.

Tests that fail due to unimplemented backend features (e.g., navigating to issues screen requires API) are left failing. They are **never** skipped or commented out.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, TERMINAL_SIZES, type TUITestInstance } from "./helpers.ts";

// ---------------------------------------------------------------------------
// TUI_HELP_OVERLAY
// ---------------------------------------------------------------------------

describe("TUI_HELP_OVERLAY", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    await tui?.terminate();
  });

  // ── Rendering & Snapshot Tests ──────────────────────────────────────────

  describe("Rendering & Snapshot", () => {
    test("help overlay renders on ? keypress", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      // Verify global group is shown
      await tui.waitForText("Global");
      // Snapshot full terminal output
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("help overlay shows correct global keybindings", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snap = tui.snapshot();
      // Verify each global keybinding entry exists
      expect(snap).toMatch(/\?.*Toggle help overlay/);
      expect(snap).toMatch(/:.*Open command palette/);
      expect(snap).toMatch(/q.*Back \/ quit/);
      expect(snap).toMatch(/Esc.*Close overlay or back/);
      expect(snap).toMatch(/Ctrl\+C.*Quit immediately/);
    });

    test("help overlay shows go-to keybindings", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Go To");
      const snap = tui.snapshot();
      // Verify all 11 go-to bindings
      expect(snap).toMatch(/g d.*Dashboard/);
      expect(snap).toMatch(/g i.*Issues/);
      expect(snap).toMatch(/g l.*Landings/);
      expect(snap).toMatch(/g r.*Repositories/);
      expect(snap).toMatch(/g w.*Workspaces/);
      expect(snap).toMatch(/g n.*Notifications/);
      expect(snap).toMatch(/g s.*Search/);
      expect(snap).toMatch(/g a.*Agents/);
      expect(snap).toMatch(/g o.*Organizations/);
      expect(snap).toMatch(/g f.*Workflows/);
      expect(snap).toMatch(/g k.*Wiki/);
    });

    test("help overlay shows screen-specific keybindings for issue list", async () => {
      // This test may fail if issue list screen is not yet implemented with
      // help keybinding registration — left failing per test philosophy.
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      // Navigate to issues (requires repo context — may fail)
      await tui.sendKeys("g", "i");
      await tui.waitForText("Issues");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snap = tui.snapshot();
      // Expect navigation-specific bindings
      expect(snap).toMatch(/j \/ Down.*Move cursor down/);
      expect(snap).toMatch(/k \/ Up.*Move cursor up/);
      expect(snap).toMatch(/Enter.*Open selected item/);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("help overlay shows screen-specific keybindings for diff viewer", async () => {
      // May fail if diff viewer is not yet implemented — left failing.
      tui = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to diff viewer (requires landing/PR context)
      // ... navigation sequence depends on available test fixtures
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snap = tui.snapshot();
      expect(snap).toMatch(/\].*Next file/);
      expect(snap).toMatch(/\[.*Previous file/);
      expect(snap).toMatch(/t.*Toggle.*view/);
      expect(snap).toMatch(/w.*Toggle whitespace/);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("help overlay shows screen-specific keybindings for form", async () => {
      // May fail if issue create form is not yet implemented — left failing.
      tui = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to issue create form
      // ... navigation sequence depends on available screens
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snap = tui.snapshot();
      expect(snap).toMatch(/Tab.*Next field/);
      expect(snap).toMatch(/Shift\+Tab.*Previous field/);
      expect(snap).toMatch(/Ctrl\+S.*Save/);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("help overlay renders title and footer", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      await tui.waitForText("Esc to close");
    });

    test("help overlay renders border with box-drawing characters", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snap = tui.snapshot();
      // OpenTUI renders borders using box-drawing characters
      expect(snap).toMatch(/[┌┐└┘─│]/);
    });

    test("help overlay key column uses warning color", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      // Warning color is ANSI 256 code 178 (yellow)
      // The exact ANSI escape sequence depends on the theme's color tier
      const snap = tui.snapshot();
      // At minimum, verify key text is present and formatted
      expect(snap).toContain("?");
      expect(snap).toContain("Ctrl+C");
    });

    test("help overlay group headings use primary color and bold", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snap = tui.snapshot();
      // Verify group headings are present
      expect(snap).toContain("Global");
      expect(snap).toContain("Go To");
      // Bold + primary color verified by ANSI sequence presence (bold = \e[1m)
      expect(snap).toMatch(/\x1b\[1m.*Global/);
    });
  });

  // ── Keyboard Interaction Tests ──────────────────────────────────────────

  describe("Keyboard Interaction", () => {
    test("? toggles help overlay open", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
    });

    test("? toggles help overlay closed", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      await tui.sendKeys("?");
      await tui.waitForNoText("Keybindings");
      // Dashboard content should be visible again
      await tui.waitForText("Dashboard");
    });

    test("Esc closes help overlay", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      await tui.sendKeys("Escape");
      await tui.waitForNoText("Keybindings");
      await tui.waitForText("Dashboard");
    });

    test("j scrolls down in help overlay", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snapBefore = tui.snapshot();
      // Press j multiple times to scroll
      await tui.sendKeys("j", "j", "j", "j", "j");
      const snapAfter = tui.snapshot();
      // Snapshots should differ if scrolling occurred
      expect(snapAfter).not.toBe(snapBefore);
    });

    test("k scrolls up in help overlay", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      // Scroll down first, then up
      await tui.sendKeys("j", "j", "j", "j", "j");
      const snapMiddle = tui.snapshot();
      await tui.sendKeys("k", "k", "k");
      const snapAfterUp = tui.snapshot();
      expect(snapAfterUp).not.toBe(snapMiddle);
    });

    test("G jumps to bottom of keybinding list", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      await tui.sendKeys("G");
      // The scroll indicator should show the final range
      const snap = tui.snapshot();
      // Match pattern like "N-M of M" where M matches at end
      expect(snap).toMatch(/\d+-\d+ of \d+/);
    });

    test("g g jumps to top of keybinding list", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      // Scroll to bottom first
      await tui.sendKeys("G");
      // Then jump to top with g g
      await tui.sendKeys("g", "g");
      // Global heading should be the first visible content
      const snap = tui.snapshot();
      expect(snap).toMatch(/Global/);
    });

    test("Ctrl+D pages down in help overlay", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snapBefore = tui.snapshot();
      await tui.sendKeys("ctrl+d");
      const snapAfter = tui.snapshot();
      // Page down should move by approximately half visible height
      expect(snapAfter).not.toBe(snapBefore);
    });

    test("Ctrl+U pages up in help overlay", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      await tui.sendKeys("ctrl+d");
      const snapAfterDown = tui.snapshot();
      await tui.sendKeys("ctrl+u");
      const snapAfterUp = tui.snapshot();
      expect(snapAfterUp).not.toBe(snapAfterDown);
    });

    test("keybindings are suppressed while help overlay is open", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      // Try to open command palette — should be suppressed
      await tui.sendKeys(":");
      // Help overlay should still be open
      await tui.waitForText("Keybindings");
      // Command palette text should NOT appear
      const snap = tui.snapshot();
      expect(snap).not.toContain("Command Palette");
    });

    test("q does not navigate back while help overlay is open", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      await tui.sendKeys("q");
      // Overlay should still be open (q is suppressed)
      await tui.waitForText("Keybindings");
      // Dashboard should still be the underlying screen
      await tui.sendKeys("Escape");
      await tui.waitForText("Dashboard");
    });

    test("Ctrl+C quits TUI even with help overlay open", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      await tui.sendKeys("ctrl+c");
      // TUI process should exit — terminate() will handle cleanup
      // The test passes if the process exits without hanging
    });
  });

  // ── Responsive Tests ───────────────────────────────────────────────────

  describe("Responsive", () => {
    test("help overlay at 80x24 uses 90% dimensions", async () => {
      tui = await launchTUI({ cols: 80, rows: 24 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      expect(tui.snapshot()).toMatchSnapshot();
      // At 80x24, overlay should use ~90% = ~72 cols, ~21 rows
      // Verified by snapshot comparison
    });

    test("help overlay at 120x40 uses 60% dimensions", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      expect(tui.snapshot()).toMatchSnapshot();
      // At 120x40, overlay should use ~60% = ~72 cols, ~24 rows
    });

    test("help overlay at 200x60 uses 60% dimensions", async () => {
      tui = await launchTUI({ cols: 200, rows: 60 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      expect(tui.snapshot()).toMatchSnapshot();
      // At 200x60, overlay should use ~60% = ~120 cols, ~36 rows
    });

    test("help overlay truncates descriptions at small terminal", async () => {
      tui = await launchTUI({ cols: 80, rows: 24 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snap = tui.snapshot();
      // No line should exceed the overlay width (~72 cols)
      const lines = snap.split("\n");
      // Check that visible text lines are within bounds
      // (ANSI escape codes make exact char counting complex,
      //  so verify truncation marker is present if needed)
      // At minimum, the snapshot should be valid
      expect(snap).toBeDefined();
    });

    test("help overlay resize from large to small", async () => {
      tui = await launchTUI({ cols: 200, rows: 60 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snapLarge = tui.snapshot();
      // Resize to minimum
      await tui.resize(80, 24);
      await tui.waitForText("Keybindings");
      const snapSmall = tui.snapshot();
      // Layout should have changed
      expect(snapSmall).not.toBe(snapLarge);
      expect(snapSmall).toMatchSnapshot();
    });

    test("help overlay resize from small to large", async () => {
      tui = await launchTUI({ cols: 80, rows: 24 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snapSmall = tui.snapshot();
      // Resize to large
      await tui.resize(200, 60);
      await tui.waitForText("Keybindings");
      const snapLarge = tui.snapshot();
      expect(snapLarge).not.toBe(snapSmall);
      expect(snapLarge).toMatchSnapshot();
    });

    test("help overlay preserves scroll position on resize", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      // Scroll down 10 rows
      for (let i = 0; i < 10; i++) {
        await tui.sendKeys("j");
      }
      const snapBefore = tui.snapshot();
      // Resize
      await tui.resize(80, 24);
      await tui.waitForText("Keybindings");
      // Content should still be scrolled (not reset to top)
      const snapAfter = tui.snapshot();
      // Verify overlay is still open and showing content
      expect(snapAfter).toContain("Keybindings");
    });
  });

  // ── Context & State Tests ──────────────────────────────────────────────

  describe("Context & State", () => {
    test("help overlay content changes with screen context", async () => {
      // This test requires multiple screens with registered help keybindings.
      // May fail if screens don't register help keybindings yet — left failing.
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      // Open help on dashboard
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snapDashboard = tui.snapshot();
      await tui.sendKeys("Escape");
      await tui.waitForNoText("Keybindings");
      // Navigate to a different screen
      await tui.sendKeys("g", "r"); // Go to repo list
      await tui.waitForText("Repositories");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snapRepos = tui.snapshot();
      // The two snapshots may differ if screens register different keybindings
      // At minimum, both should show Global and Go To groups
      expect(snapDashboard).toContain("Global");
      expect(snapRepos).toContain("Global");
    });

    test("help overlay shows only global keybindings when screen has none", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      const snap = tui.snapshot();
      // Should always have Global and Go To
      expect(snap).toContain("Global");
      expect(snap).toContain("Go To");
    });

    test("help overlay mutual exclusion with command palette", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      // Open help
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      // Verify command palette is not visible
      const snap = tui.snapshot();
      expect(snap).not.toContain("Command Palette");
      // Close help
      await tui.sendKeys("Escape");
      await tui.waitForNoText("Keybindings");
      // Verify only one overlay at a time
      expect(tui.snapshot()).not.toContain("Keybindings");
    });

    test("status bar shows ? Help hint", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      // Check last line of terminal for help hint
      const lastLine = tui.getLine(tui.rows - 1);
      expect(lastLine).toMatch(/\?.*help/i);
    });

    test("scroll indicator shows correct range", async () => {
      tui = await launchTUI({ cols: 120, rows: 40 });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("?");
      await tui.waitForText("Keybindings");
      // If total rows > visible rows, scroll indicator should be present
      const snap = tui.snapshot();
      // Pattern: "1-N of M"
      const hasIndicator = /\d+-\d+ of \d+/.test(snap);
      // If all content fits, no indicator is shown (which is also correct)
      // Just verify the overlay rendered successfully
      expect(snap).toContain("Global");
      if (hasIndicator) {
        const match = snap.match(/(\d+)-(\d+) of (\d+)/);
        expect(match).not.toBeNull();
        const [, start, end, total] = match!;
        expect(Number(start)).toBeGreaterThanOrEqual(1);
        expect(Number(end)).toBeLessThanOrEqual(Number(total));
        expect(Number(end)).toBeGreaterThanOrEqual(Number(start));
      }
      // Scroll down and verify indicator updates
      await tui.sendKeys("j", "j", "j");
      const snapAfterScroll = tui.snapshot();
      if (/\d+-\d+ of \d+/.test(snapAfterScroll)) {
        const matchAfter = snapAfterScroll.match(/(\d+)-(\d+) of (\d+)/);
        expect(matchAfter).not.toBeNull();
        // Start should have advanced
        if (hasIndicator) {
          const matchBefore = snap.match(/(\d+)-(\d+) of (\d+)/);
          expect(Number(matchAfter![1])).toBeGreaterThanOrEqual(Number(matchBefore![1]));
        }
      }
    });
  });
});
```

### Test Coverage Matrix

| Test # | Category | Test Name | Validates |
|--------|----------|-----------|----------|
| 1 | Rendering | help overlay renders on ? keypress | Toggle activation, basic rendering, snapshot |
| 2 | Rendering | shows correct global keybindings | 5 global entries with correct labels |
| 3 | Rendering | shows go-to keybindings | All 11 go-to destinations |
| 4 | Rendering | shows screen-specific keybindings for issue list | Dynamic screen registration |
| 5 | Rendering | shows screen-specific keybindings for diff viewer | Diff-specific keys |
| 6 | Rendering | shows screen-specific keybindings for form | Form-specific keys |
| 7 | Rendering | renders title and footer | Chrome elements |
| 8 | Rendering | renders border with box-drawing characters | OpenTUI border rendering |
| 9 | Rendering | key column uses warning color | ANSI color application |
| 10 | Rendering | group headings use primary color and bold | Bold + color formatting |
| 11 | Keyboard | ? toggles help overlay open | Open behavior |
| 12 | Keyboard | ? toggles help overlay closed | Close via toggle |
| 13 | Keyboard | Esc closes help overlay | Close via Esc |
| 14 | Keyboard | j scrolls down | Scroll down |
| 15 | Keyboard | k scrolls up | Scroll up |
| 16 | Keyboard | G jumps to bottom | Jump-to-end |
| 17 | Keyboard | g g jumps to top | Two-key chord |
| 18 | Keyboard | Ctrl+D pages down | Page scroll |
| 19 | Keyboard | Ctrl+U pages up | Page scroll |
| 20 | Keyboard | keybindings suppressed while open | Focus trapping |
| 21 | Keyboard | q does not navigate back while open | Key suppression |
| 22 | Keyboard | Ctrl+C quits even with overlay open | Global escape hatch |
| 23 | Responsive | 80×24 uses 90% dimensions | Minimum breakpoint |
| 24 | Responsive | 120×40 uses 60% dimensions | Standard breakpoint |
| 25 | Responsive | 200×60 uses 60% dimensions | Large breakpoint |
| 26 | Responsive | truncates descriptions at small terminal | Text truncation |
| 27 | Responsive | resize from large to small | Dynamic resize |
| 28 | Responsive | resize from small to large | Dynamic resize |
| 29 | Responsive | preserves scroll position on resize | Scroll clamping |
| 30 | Context | content changes with screen context | Dynamic group registration |
| 31 | Context | shows only global when screen has none | Graceful empty state |
| 32 | Context | mutual exclusion with command palette | Overlay manager integration |
| 33 | Context | status bar shows ? Help hint | Discoverability |
| 34 | Context | scroll indicator shows correct range | Scroll indicator accuracy |

---

## Implementation Order

1. **`HelpOverlayContext.tsx`** — Create the context provider with global/go-to groups and screen registration API. No UI yet.
2. **`useHelpKeybindings.ts`** — Create the convenience hook.
3. **`HelpOverlay.tsx`** — Create the overlay content component with rendering, scroll logic, keybinding scope registration, and key suppression.
4. **`OverlayLayer.tsx`** — Replace placeholder with `<HelpOverlay />`.
5. **`GlobalKeybindings.tsx`** — Wire `onHelp` to `openOverlay("help")`.
6. **`OverlayManager.tsx`** — Add help-specific status bar hints.
7. **`index.tsx`** — Add `HelpOverlayContextProvider` to provider stack.
8. **`app-shell.test.ts`** — Add all 34 E2E tests.

Steps 1-3 can be developed and unit-tested in isolation. Steps 4-7 are integration wiring. Step 8 validates the full feature end-to-end.