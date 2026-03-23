# Engineering Specification: `tui-nav-chrome-eng-04`

## OverlayManager context for mutual exclusion of modals

**Ticket ID:** `tui-nav-chrome-eng-04`
**Type:** Engineering (infrastructure)
**Dependencies:** `tui-nav-chrome-eng-02` (KeybindingProvider with layered priority dispatch)
**Status:** Not started
**Estimate:** 4 hours

---

## Overview

This ticket creates the `OverlayManager` — a React context provider that guarantees only one overlay (help, command palette, or confirmation dialog) is visible at any time, plus the `OverlayLayer` component that renders the active overlay as an absolutely-positioned box above all other content.

The system delivers two modules:

1. **`apps/tui/src/providers/OverlayManager.tsx`** — React context provider managing `OverlayState`. Exposes `useOverlay()` hook. Coordinates with `KeybindingProvider` for focus trapping via MODAL priority scopes.
2. **`apps/tui/src/components/OverlayLayer.tsx`** — Presentational component rendering the active overlay as an absolutely-positioned `<box>` with `zIndex`. Consumes `useOverlay()` to determine which overlay to show and `useLayout()` for responsive sizing.

### Where it fits in the provider stack

```
ThemeProvider
  → KeybindingProvider     ← tui-nav-chrome-eng-02 (exists)
    → OverlayManager       ← THIS TICKET
      → AppShell
```

The `OverlayManager` must be a **child** of `KeybindingProvider` because it calls `registerScope()` / `removeScope()` to push and pop MODAL priority scopes as overlays open and close. It must be a **parent** of `AppShell` so that `OverlayLayer` (rendered inside `AppShell`) can access overlay state.

### How it integrates with GlobalKeybindings

The existing `GlobalKeybindings` component has TODO stubs for `onHelp` and `onCommandPalette`. After this ticket, those stubs will be wired to `useOverlay().openOverlay("help")` and `useOverlay().openOverlay("command-palette")` respectively. This wiring is not part of this ticket — it is called out in the productionization section. This ticket delivers the context and rendering infrastructure.

### Dependencies

| Dependency | Status | Location |
|------------|--------|----------|
| `tui-nav-chrome-eng-02` | Implemented | `apps/tui/src/providers/KeybindingProvider.tsx` |
| `keybinding-types.ts` | Implemented | `apps/tui/src/providers/keybinding-types.ts` (PRIORITY.MODAL, KeyHandler, KeybindingScope) |
| `useLayout()` | Implemented | `apps/tui/src/hooks/useLayout.ts` (modalWidth, modalHeight, breakpoint) |
| `useTheme()` | Implemented | `apps/tui/src/hooks/useTheme.ts` (semantic color tokens) |
| `@opentui/react` | External | React reconciler, `<box>` with `position="absolute"`, `zIndex` |

### Non-Goals

- This ticket does **not** implement the help overlay content, the command palette UI, or the confirmation dialog UI. Those are separate feature tickets that will register as overlay content consumers.
- This ticket does **not** modify `GlobalKeybindings.tsx` to wire `?` and `:` to `openOverlay()`. That wiring is documented in the productionization plan and happens when the individual overlay content components land.
- This ticket does **not** implement backdrop dimming or semi-transparent backgrounds. OpenTUI does not support alpha-blended backgrounds in terminals. The overlay renders over content with an opaque `surface` background color.

---

## Implementation Plan

### Step 1: Define overlay types

**File:** `apps/tui/src/providers/overlay-types.ts`

A small types-only file defining the overlay state and context contract. Separate from the provider for clean imports by any component that needs type-only access.

```typescript
/**
 * Overlay type discriminator.
 *
 * Each value corresponds to a distinct modal overlay surface:
 * - "help": Keybinding help overlay (triggered by `?`)
 * - "command-palette": Command palette overlay (triggered by `:`)
 * - "confirm": Confirmation dialog for destructive actions
 */
export type OverlayType = "help" | "command-palette" | "confirm";

/**
 * Current overlay state.
 * `null` means no overlay is open.
 */
export type OverlayState = OverlayType | null;

/**
 * Payload passed to confirm overlays.
 * Other overlay types do not carry payloads.
 */
export interface ConfirmPayload {
  /** Title shown in the confirm dialog header. */
  title: string;
  /** Body message explaining the action. */
  message: string;
  /** Label for the confirm button. Default: "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Default: "Cancel". */
  cancelLabel?: string;
  /** Called when user confirms. */
  onConfirm: () => void;
  /** Called when user cancels or dismisses. */
  onCancel?: () => void;
}

/**
 * Context value exposed by OverlayManager and consumed via useOverlay().
 */
export interface OverlayContextType {
  /** Currently active overlay, or null if none open. */
  activeOverlay: OverlayState;

  /**
   * Open an overlay by type.
   *
   * - If no overlay is open, opens the requested overlay.
   * - If the SAME overlay type is already open, closes it (toggle).
   * - If a DIFFERENT overlay type is open, closes it first then opens the new one.
   *
   * For "confirm" type, a ConfirmPayload must be provided.
   */
  openOverlay(type: "confirm", payload: ConfirmPayload): void;
  openOverlay(type: Exclude<OverlayType, "confirm">): void;
  openOverlay(type: OverlayType, payload?: ConfirmPayload): void;

  /** Close the currently active overlay. No-op if none open. */
  closeOverlay(): void;

  /**
   * Check if a specific overlay type is currently open.
   * Convenience over `activeOverlay === type`.
   */
  isOpen(type: OverlayType): boolean;

  /**
   * Current confirm payload, or null if no confirm overlay is open.
   * Only non-null when activeOverlay === "confirm".
   */
  confirmPayload: ConfirmPayload | null;
}
```

**Design decisions:**

- `OverlayType` is a string union, not an enum, for simpler comparison and serialization.
- `ConfirmPayload` is the only overlay type with a payload. Help and command palette derive their content from other contexts (keybinding registry, command registry).
- `openOverlay()` uses function overloads so TypeScript enforces that "confirm" always passes a payload.

---

### Step 2: Implement OverlayManager provider

**File:** `apps/tui/src/providers/OverlayManager.tsx`

The provider manages overlay state and coordinates with `KeybindingProvider` for focus trapping.

```typescript
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { KeybindingContext, StatusBarHintsContext } from "./KeybindingProvider.js";
import { PRIORITY, type KeyHandler, type StatusBarHint } from "./keybinding-types.js";
import { normalizeKeyDescriptor } from "./normalize-key.js";
import type {
  OverlayContextType,
  OverlayState,
  OverlayType,
  ConfirmPayload,
} from "./overlay-types.js";

export const OverlayContext = createContext<OverlayContextType | null>(null);

interface OverlayManagerProps {
  children: ReactNode;
}

export function OverlayManager({ children }: OverlayManagerProps) {
  const [activeOverlay, setActiveOverlay] = useState<OverlayState>(null);
  const [confirmPayload, setConfirmPayload] = useState<ConfirmPayload | null>(null);

  // ── KeybindingProvider integration ──────────────────────────────
  const keybindingCtx = useContext(KeybindingContext);
  const statusBarCtx = useContext(StatusBarHintsContext);

  if (!keybindingCtx) {
    throw new Error("OverlayManager must be used within a KeybindingProvider");
  }
  if (!statusBarCtx) {
    throw new Error("OverlayManager must be used within a StatusBarHintsContext");
  }

  // Ref tracks current scope ID to avoid stale closures
  const modalScopeIdRef = useRef<string | null>(null);
  const hintsCleanupRef = useRef<(() => void) | null>(null);

  // ── MODAL scope lifecycle ───────────────────────────────────────
  //
  // When an overlay opens, we register a MODAL priority scope with
  // an Escape binding that closes the overlay. This scope sits at
  // priority 2, capturing keys before GOTO (3), SCREEN (4), and
  // GLOBAL (5) scopes. This is the focus trapping mechanism.
  //
  // When the overlay closes, we remove the scope.

  const closeOverlay = useCallback(() => {
    setActiveOverlay((prev) => {
      if (prev === null) return null;

      // Clean up MODAL scope
      if (modalScopeIdRef.current) {
        keybindingCtx.removeScope(modalScopeIdRef.current);
        modalScopeIdRef.current = null;
      }

      // Clean up status bar hint override
      if (hintsCleanupRef.current) {
        hintsCleanupRef.current();
        hintsCleanupRef.current = null;
      }

      // If this was a confirm overlay, call onCancel
      if (prev === "confirm") {
        setConfirmPayload((p) => {
          p?.onCancel?.();
          return null;
        });
      } else {
        setConfirmPayload(null);
      }

      return null;
    });
  }, [keybindingCtx]);

  // closeOverlayRef avoids stale closure in the MODAL scope handler
  const closeOverlayRef = useRef(closeOverlay);
  closeOverlayRef.current = closeOverlay;

  const openOverlay = useCallback(
    (type: OverlayType, payload?: ConfirmPayload) => {
      setActiveOverlay((prev) => {
        // Toggle: same type → close
        if (prev === type) {
          // Clean up existing scope
          if (modalScopeIdRef.current) {
            keybindingCtx.removeScope(modalScopeIdRef.current);
            modalScopeIdRef.current = null;
          }
          if (hintsCleanupRef.current) {
            hintsCleanupRef.current();
            hintsCleanupRef.current = null;
          }
          setConfirmPayload(null);
          return null;
        }

        // Different type open → close first
        if (prev !== null && modalScopeIdRef.current) {
          keybindingCtx.removeScope(modalScopeIdRef.current);
          modalScopeIdRef.current = null;
        }
        if (hintsCleanupRef.current) {
          hintsCleanupRef.current();
          hintsCleanupRef.current = null;
        }

        // Set confirm payload if applicable
        if (type === "confirm" && payload) {
          setConfirmPayload(payload);
        } else {
          setConfirmPayload(null);
        }

        // Register MODAL scope with Escape binding
        const escapeBinding: KeyHandler = {
          key: normalizeKeyDescriptor("escape"),
          description: "Close overlay",
          group: "Overlay",
          handler: () => closeOverlayRef.current(),
        };

        const bindings = new Map<string, KeyHandler>();
        bindings.set(escapeBinding.key, escapeBinding);

        const scopeId = keybindingCtx.registerScope({
          priority: PRIORITY.MODAL,
          bindings,
          active: true,
        });
        modalScopeIdRef.current = scopeId;

        // Override status bar hints to show overlay-specific hints
        const overlayHints: StatusBarHint[] = [
          { keys: "Esc", label: "close", order: 0 },
        ];
        hintsCleanupRef.current = statusBarCtx.overrideHints(overlayHints);

        return type;
      });
    },
    [keybindingCtx, statusBarCtx],
  );

  // Cleanup on unmount — remove any lingering scope
  useEffect(() => {
    return () => {
      if (modalScopeIdRef.current) {
        keybindingCtx.removeScope(modalScopeIdRef.current);
      }
      if (hintsCleanupRef.current) {
        hintsCleanupRef.current();
      }
    };
  }, [keybindingCtx]);

  const isOpen = useCallback(
    (type: OverlayType): boolean => activeOverlay === type,
    [activeOverlay],
  );

  const contextValue: OverlayContextType = {
    activeOverlay,
    openOverlay,
    closeOverlay,
    isOpen,
    confirmPayload,
  };

  return (
    <OverlayContext.Provider value={contextValue}>
      {children}
    </OverlayContext.Provider>
  );
}
```

**Key implementation details:**

1. **Single source of truth:** `activeOverlay` state (`null | "help" | "command-palette" | "confirm"`) is the only state variable controlling visibility. All derived logic keys off this value.

2. **Toggle semantics in `openOverlay()`:** Uses `setActiveOverlay` functional updater to atomically read `prev` and decide behavior:
   - Same type → close (toggle off)
   - Different type → swap (close old, open new)
   - No overlay → open

3. **MODAL scope lifecycle:** Each `openOverlay()` call registers a fresh MODAL scope with an `Escape` handler. The scope is removed on `closeOverlay()` or on toggle-off. This integrates directly with `KeybindingProvider`'s priority dispatch — while the MODAL scope is active, it captures `Escape` before any SCREEN or GLOBAL handlers can process it.

4. **Status bar hint override:** While an overlay is open, the status bar shows `Esc: close` instead of screen-specific hints. This uses the existing `overrideHints()` API from `StatusBarHintsContext`.

5. **Ref pattern for `closeOverlay`:** `closeOverlayRef` prevents stale closures when the Escape handler registered in the MODAL scope fires. Without this, the handler would capture the `closeOverlay` from the render where the scope was created, which might reference stale state.

6. **Confirm cancel callback:** When a confirm overlay is dismissed via Escape (not confirm), `onCancel` from the `ConfirmPayload` is called. This ensures callers can handle cancellation.

---

### Step 3: Implement the `useOverlay()` hook

**File:** `apps/tui/src/hooks/useOverlay.ts`

Convenience hook with a helpful error message if used outside the provider.

```typescript
import { useContext } from "react";
import { OverlayContext } from "../providers/OverlayManager.js";
import type { OverlayContextType } from "../providers/overlay-types.js";

/**
 * Access the OverlayManager context.
 *
 * Returns the overlay state and control functions.
 * Must be used within an <OverlayManager> provider.
 *
 * @example
 * const { activeOverlay, openOverlay, closeOverlay, isOpen } = useOverlay();
 *
 * // Toggle help overlay
 * openOverlay("help");
 *
 * // Check if command palette is open
 * if (isOpen("command-palette")) { ... }
 *
 * // Open confirmation dialog
 * openOverlay("confirm", {
 *   title: "Delete issue?",
 *   message: "This action cannot be undone.",
 *   onConfirm: () => deleteIssue(id),
 * });
 */
export function useOverlay(): OverlayContextType {
  const ctx = useContext(OverlayContext);
  if (!ctx) {
    throw new Error(
      "useOverlay() must be used within an <OverlayManager> provider. " +
      "Ensure OverlayManager is in the provider stack above this component."
    );
  }
  return ctx;
}
```

---

### Step 4: Implement the `OverlayLayer` component

**File:** `apps/tui/src/components/OverlayLayer.tsx`

The presentational component that renders the active overlay surface. It does not own overlay content — it provides the container (positioned box with zIndex) and delegates content rendering to child components registered per overlay type.

```typescript
import React from "react";
import { useOverlay } from "../hooks/useOverlay.js";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";

/**
 * Overlay rendering layer.
 *
 * Renders an absolutely-positioned <box> with zIndex when an overlay
 * is active. The box uses responsive sizing from useLayout() and
 * semantic colors from useTheme().
 *
 * Content for each overlay type is rendered by child components:
 * - "help": <HelpOverlayContent /> (implemented in a separate ticket)
 * - "command-palette": <CommandPaletteContent /> (implemented in a separate ticket)
 * - "confirm": <ConfirmDialogContent /> (implemented in a separate ticket)
 *
 * Until those components are implemented, the OverlayLayer renders
 * placeholder text indicating which overlay is active.
 */
export function OverlayLayer() {
  const { activeOverlay, closeOverlay, confirmPayload } = useOverlay();
  const layout = useLayout();
  const theme = useTheme();

  if (activeOverlay === null) return null;

  // Responsive sizing from layout context
  const width = layout.modalWidth;
  const height = layout.modalHeight;

  // Determine overlay title for placeholder rendering
  const titleMap: Record<string, string> = {
    "help": "Keybindings",
    "command-palette": "Command Palette",
    "confirm": confirmPayload?.title ?? "Confirm",
  };
  const title = titleMap[activeOverlay] ?? activeOverlay;

  return (
    <box
      position="absolute"
      top="center"
      left="center"
      width={width}
      height={height}
      zIndex={100}
      flexDirection="column"
      border={true}
      borderColor={theme.border}
      backgroundColor={theme.surface}
      padding={1}
    >
      {/* Title bar */}
      <box flexDirection="row" width="100%">
        <text bold fg={theme.primary}>
          {title}
        </text>
        <box flexGrow={1} />
        <text fg={theme.muted}>
          Esc close
        </text>
      </box>

      {/* Separator */}
      <text fg={theme.border}>
        {"─".repeat(40)}
      </text>

      {/* Content area — placeholder until overlay content components land */}
      <box flexGrow={1} flexDirection="column">
        {activeOverlay === "help" && (
          <text fg={theme.muted}>[Help overlay content — pending TUI_HELP_OVERLAY implementation]</text>
        )}
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
    </box>
  );
}
```

**Key implementation details:**

1. **Conditional rendering:** Returns `null` when no overlay is active. This means no DOM nodes are created in the idle state — zero overhead.

2. **Absolute positioning with `zIndex: 100`:** Follows the pattern established in the OpenTUI examples (`scrollbox-overlay-hit-test.ts`) where overlays use `position="absolute"` and a high zIndex. The value `100` is chosen to sit well above normal content (zIndex 0) while leaving room for stacking if needed.

3. **Responsive sizing:** Delegates to `layout.modalWidth` and `layout.modalHeight` which already handle breakpoint-specific percentages (90% at minimum, 60% at standard, 50% at large).

4. **Placeholder content:** Each overlay type renders placeholder text. This is intentional — the actual overlay content components (HelpOverlayContent, CommandPaletteContent, ConfirmDialogContent) are separate tickets. The placeholder allows end-to-end testing of the overlay management lifecycle without depending on those implementations.

5. **Centering:** Uses `top="center"` and `left="center"` for centered positioning. OpenTUI's Yoga layout engine supports percentage-based centering via absolute positioning.

---

### Step 5: Integrate into AppShell and provider stack

**File changes:**

#### `apps/tui/src/components/AppShell.tsx` — Add `<OverlayLayer />`

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

The `<OverlayLayer />` is the last child in the `<box>`. Because it uses `position="absolute"`, it does not participate in the normal flex layout — it renders on top. The `zIndex={100}` ensures it visually sits above the header bar, content area, and status bar.

#### `apps/tui/src/providers/index.ts` — Export new provider

Add exports:

```typescript
export { OverlayManager, OverlayContext } from "./OverlayManager.js";
export type { OverlayContextType, OverlayState, OverlayType, ConfirmPayload } from "./overlay-types.js";
```

#### `apps/tui/src/components/index.ts` — Export OverlayLayer

Add export:

```typescript
export { OverlayLayer } from "./OverlayLayer.js";
```

#### Provider stack integration

Wherever the provider stack is composed (root `App.tsx` or `index.tsx`), `OverlayManager` wraps `AppShell`:

```typescript
<KeybindingProvider>
  <OverlayManager>
    <GlobalKeybindings>
      <AppShell>
        <ScreenRouter />
      </AppShell>
    </GlobalKeybindings>
  </OverlayManager>
</KeybindingProvider>
```

---

### Step 6: Future wiring points (not implemented in this ticket)

These are the integration points that downstream tickets will use:

1. **`GlobalKeybindings.tsx`** — Wire `onHelp` to `openOverlay("help")` and `onCommandPalette` to `openOverlay("command-palette")`. Currently stubbed with TODO comments.

2. **Help overlay content** — A `<HelpOverlayContent />` component will be rendered inside `OverlayLayer` when `activeOverlay === "help"`. It will consume `getAllBindings()` from `KeybindingContext` to display grouped keybindings. It will register additional MODAL-level keybindings for scrolling (`j`, `k`, `G`, `gg`, `Ctrl+D`, `Ctrl+U`) by calling `useOverlay()` to extend the modal scope.

3. **Command palette content** — A `<CommandPaletteContent />` component with fuzzy search input. The input component will capture keys at TEXT_INPUT priority (handled by OpenTUI's focus system), while the palette's `Escape` and `Enter` bindings are handled by the MODAL scope.

4. **Confirmation dialog** — Any component can call `openOverlay("confirm", { title, message, onConfirm })` to show a blocking confirmation. The confirm dialog component will add `Enter` (confirm) and `n` (cancel) bindings to the MODAL scope.

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All overlay manager tests are added to the existing `app-shell.test.ts` file under a new `describe` block. These tests validate user-visible overlay lifecycle behavior using the standard `launchTUI()` helper.

**Test naming convention:** `OVERLAY-###: description`

```typescript
// ── OverlayManager — mutual exclusion and lifecycle ──────────────

describe("TUI_OVERLAY_MANAGER — overlay mutual exclusion", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  // ── Basic open/close lifecycle ────────────────────────────────

  test("OVERLAY-001: ? opens help overlay", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    // Overlay should be visible with title
    expect(terminal.snapshot()).toContain("Keybindings");
    expect(terminal.snapshot()).toContain("Esc close");
  });

  test("OVERLAY-002: Esc closes help overlay", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");
    // Should be back to dashboard
    await terminal.waitForText("Dashboard");
  });

  test("OVERLAY-003: ? toggles help overlay off when already open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("?");
    await terminal.waitForNoText("Keybindings");
    await terminal.waitForText("Dashboard");
  });

  test("OVERLAY-004: : opens command palette overlay", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    expect(terminal.snapshot()).toContain("Esc close");
  });

  test("OVERLAY-005: Esc closes command palette overlay", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Command Palette");
    await terminal.waitForText("Dashboard");
  });

  test("OVERLAY-006: : toggles command palette off when already open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    await terminal.sendKeys(":");
    await terminal.waitForNoText("Command Palette");
  });

  // ── Mutual exclusion ──────────────────────────────────────────

  test("OVERLAY-007: opening help while command palette is open swaps overlays", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    // Open command palette
    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    // Now press ? — should swap to help
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.waitForNoText("Command Palette");
  });

  test("OVERLAY-008: opening command palette while help is open swaps overlays", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    // Open help
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    // Now press : — should swap to command palette
    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    await terminal.waitForNoText("Keybindings");
  });

  test("OVERLAY-009: only one overlay is visible at any time (snapshot check)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    const helpSnapshot = terminal.snapshot();
    // Help visible, command palette not
    expect(helpSnapshot).toContain("Keybindings");
    expect(helpSnapshot).not.toContain("Command Palette");

    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    const paletteSnapshot = terminal.snapshot();
    // Command palette visible, help not
    expect(paletteSnapshot).toContain("Command Palette");
    expect(paletteSnapshot).not.toContain("Keybindings");
  });

  // ── Focus trapping (keyboard priority) ────────────────────────

  test("OVERLAY-010: q does not navigate back while overlay is open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("q");
    // Should still show overlay, not quit
    await terminal.waitForText("Keybindings");
    await terminal.waitForText("Dashboard");
  });

  test("OVERLAY-011: screen keybindings suppressed while overlay open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    // j/k should not move list focus underneath
    await terminal.sendKeys("j");
    await terminal.sendKeys("k");
    // Overlay should still be showing
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Repositories");
  });

  test("OVERLAY-012: go-to mode does not activate while overlay open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    // g d should not navigate to dashboard
    await terminal.sendKeys("g");
    await terminal.sendKeys("d");
    // Should still be on command palette
    await terminal.waitForText("Command Palette");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Dashboard");
  });

  // ── Status bar hint override ──────────────────────────────────

  test("OVERLAY-013: status bar shows Esc close hint while overlay open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/Esc.*close/i);
  });

  test("OVERLAY-014: status bar hints restore after overlay closes", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const beforeHints = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");
    const afterHints = terminal.getLine(terminal.rows - 1);
    // Hints should be restored (same as before overlay)
    expect(afterHints).toBe(beforeHints);
  });

  // ── Responsive overlay sizing ─────────────────────────────────

  test("OVERLAY-015: overlay uses 90% width at minimum breakpoint (80x24)", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("OVERLAY-016: overlay uses 60% width at standard breakpoint (120x40)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("OVERLAY-017: overlay uses 50% width at large breakpoint (200x60)", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  // ── Edge cases ────────────────────────────────────────────────

  test("OVERLAY-018: rapid ? ? does not leave overlay in inconsistent state", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    // Rapid toggle: open then close
    await terminal.sendKeys("?");
    await terminal.sendKeys("?");
    // Should be closed
    await terminal.waitForNoText("Keybindings");
    await terminal.waitForText("Dashboard");
  });

  test("OVERLAY-019: Ctrl+C still exits even with overlay open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("\x03"); // Ctrl+C
    // TUI should exit — terminate will succeed
    await terminal.terminate();
  });

  test("OVERLAY-020: closing overlay after screen navigation restores correct screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");
    // Should still be on Repositories screen
    await terminal.waitForText("Repositories");
  });

  test("OVERLAY-021: overlay renders with border and surface background color", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    // Snapshot captures colors and borders
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("OVERLAY-022: multiple open-close cycles work correctly", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");

    // Cycle 1: help
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");

    // Cycle 2: command palette
    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Command Palette");

    // Cycle 3: help again
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("?"); // toggle off
    await terminal.waitForNoText("Keybindings");

    // Should still be on dashboard with no overlays
    await terminal.waitForText("Dashboard");
  });
});
```

### Test notes

1. **Tests OVERLAY-001 through OVERLAY-006** validate basic open/close lifecycle for each overlay type including toggle behavior.

2. **Tests OVERLAY-007 through OVERLAY-009** validate mutual exclusion — the core requirement of this ticket. Only one overlay is visible at any time; opening a different overlay type swaps them atomically.

3. **Tests OVERLAY-010 through OVERLAY-012** validate focus trapping via KeybindingProvider integration. The MODAL scope prevents screen navigation (`q`), list navigation (`j`/`k`), and go-to mode (`g d`) from leaking through while an overlay is active.

4. **Tests OVERLAY-013 and OVERLAY-014** validate status bar hint override and restore.

5. **Tests OVERLAY-015 through OVERLAY-017** are snapshot tests at each breakpoint, validating responsive sizing.

6. **Tests OVERLAY-018 through OVERLAY-022** are edge case tests: rapid toggling, Ctrl+C escape hatch, navigation context preservation, color rendering, and multi-cycle stability.

7. **No mocking:** All tests run against the real TUI process with the full provider stack. Overlay behavior is validated through terminal text content and snapshots, not by inspecting React state.

8. **Tests that depend on GlobalKeybindings wiring will fail** until `GlobalKeybindings.tsx` is updated to call `openOverlay("help")` / `openOverlay("command-palette")` instead of the current no-op TODO stubs. Per project policy, these tests are **left failing** — they are not skipped or commented out. They will pass when the downstream wiring ticket lands.

---

## Productionization Plan

### From infrastructure to feature completeness

This ticket delivers overlay management infrastructure with placeholder content. The following steps are required to move from placeholder to production-quality overlays:

#### 1. Wire GlobalKeybindings to OverlayManager

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`

Replace the TODO stubs:

```typescript
// Before (current)
const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);
const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);

// After (wiring ticket)
const { openOverlay } = useOverlay();
const onHelp = useCallback(() => openOverlay("help"), [openOverlay]);
const onCommandPalette = useCallback(() => openOverlay("command-palette"), [openOverlay]);
```

This unblocks all E2E tests that send `?` or `:` keypresses expecting an overlay to appear.

#### 2. Replace placeholder content in OverlayLayer

When the `TUI_HELP_OVERLAY` feature ticket lands, the placeholder `<text>` in `OverlayLayer.tsx` for `activeOverlay === "help"` is replaced with the actual `<HelpOverlayContent />` component. The component receives `closeOverlay` from `useOverlay()` and registers its own scroll keybindings by extending the MODAL scope.

Pattern for overlay content components to extend the MODAL scope:

```typescript
// Inside HelpOverlayContent
const keybindingCtx = useContext(KeybindingContext);
const { closeOverlay } = useOverlay();

useEffect(() => {
  // Register additional MODAL bindings for scrolling
  const scrollBindings = new Map<string, KeyHandler>([
    ["j", { key: "j", description: "Scroll down", group: "Help", handler: scrollDown }],
    ["k", { key: "k", description: "Scroll up", group: "Help", handler: scrollUp }],
    // ... G, gg, Ctrl+D, Ctrl+U
  ]);
  const scopeId = keybindingCtx.registerScope({
    priority: PRIORITY.MODAL,
    bindings: scrollBindings,
    active: true,
  });
  return () => keybindingCtx.removeScope(scopeId);
}, [keybindingCtx]);
```

Because multiple MODAL scopes are allowed and sorted LIFO within the same priority, the overlay content's scroll bindings will be checked before the OverlayManager's base Escape binding. This is correct behavior — the content component gets first crack at keys, and only unhandled keys fall through to the Escape handler.

#### 3. Swap overlay toggle keys through GLOBAL bindings

The current design has `?` and `:` registered as GLOBAL priority bindings that call `openOverlay()`. When an overlay is open and the user presses `?` or `:`:

- The MODAL scope's Escape binding does NOT match `?` or `:`.
- The key falls through to the GLOBAL scope.
- The GLOBAL handler calls `openOverlay("help")` or `openOverlay("command-palette")`.
- `openOverlay()` detects same-type → toggle close, or different-type → swap.

This means **the toggle and swap behavior works through the existing priority dispatch** without needing special handling in the MODAL scope. The MODAL scope only needs `Escape` — the GLOBAL scope handles the toggle keys.

#### 4. OverlayLayer content slot pattern

As overlay content components are implemented, `OverlayLayer.tsx` evolves to use a direct import pattern:

```typescript
// Final production OverlayLayer
{activeOverlay === "help" && <HelpOverlayContent />}
{activeOverlay === "command-palette" && <CommandPaletteContent />}
{activeOverlay === "confirm" && confirmPayload && (
  <ConfirmDialogContent
    payload={confirmPayload}
    onConfirm={() => { confirmPayload.onConfirm(); closeOverlay(); }}
    onCancel={closeOverlay}
  />
)}
```

---

## File Manifest

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/providers/overlay-types.ts` | **Create** | Type definitions: OverlayType, OverlayState, ConfirmPayload, OverlayContextType |
| `apps/tui/src/providers/OverlayManager.tsx` | **Create** | Context provider with open/close/toggle logic and KeybindingProvider integration |
| `apps/tui/src/hooks/useOverlay.ts` | **Create** | Convenience hook for consuming OverlayContext |
| `apps/tui/src/components/OverlayLayer.tsx` | **Create** | Absolutely-positioned overlay rendering component with placeholder content |
| `apps/tui/src/components/AppShell.tsx` | **Modify** | Add `<OverlayLayer />` as last child in root box |
| `apps/tui/src/providers/index.ts` | **Modify** | Export OverlayManager, OverlayContext, and overlay types |
| `apps/tui/src/components/index.ts` | **Modify** | Export OverlayLayer |
| `e2e/tui/app-shell.test.ts` | **Modify** | Add `describe("TUI_OVERLAY_MANAGER")` block with 22 tests |

---

## Acceptance Criteria Verification

| Criterion | How verified |
|-----------|-------------|
| Only one overlay visible at any time | Tests OVERLAY-007, OVERLAY-008, OVERLAY-009 |
| Opening overlay when another is open closes the first | Tests OVERLAY-007, OVERLAY-008 |
| Toggle behavior: opening same overlay type closes it | Tests OVERLAY-003, OVERLAY-006 |
| OverlayLayer renders absolutely positioned content with zIndex | Tests OVERLAY-015, OVERLAY-016, OVERLAY-017 (snapshots) |
| closeOverlay restores focus to underlying screen | Tests OVERLAY-002, OVERLAY-005, OVERLAY-014, OVERLAY-020 |
| Esc in any overlay triggers closeOverlay | Tests OVERLAY-002, OVERLAY-005 |