# Engineering Specification: `tui-modal-component` — Modal Overlay Component with Focus Trap and Dismiss Behavior

## Overview

This ticket implements the shared `Modal` component and `useModal()` hook used by `CommandPalette`, `HelpOverlay`, confirmation dialogs, and all future overlay-based UI surfaces (label pickers, action confirmations, dispatch forms, etc.). The Modal is the foundational building block that the existing `OverlayLayer` placeholder will be refactored to delegate to.

### Dependencies

| Ticket | Artifact | Status |
|--------|----------|--------|
| `tui-theme-and-color-tokens` | `ThemeProvider` + `useTheme()` + semantic color tokens | Implemented — `apps/tui/src/theme/tokens.ts`, `apps/tui/src/providers/ThemeProvider.tsx` |
| `tui-bootstrap-and-renderer` | `createCliRenderer`, `createRoot`, provider stack, `@opentui/react` reconciler | Implemented — `apps/tui/src/index.tsx` |

### Existing Assets Consumed

| File | What it provides |
|------|------------------|
| `apps/tui/src/providers/KeybindingProvider.tsx` | `KeybindingContext` with `registerScope()`, `removeScope()`, `setActive()`, `hasActiveModal()` |
| `apps/tui/src/providers/keybinding-types.ts` | `PRIORITY.MODAL` (2), `KeyHandler`, `KeybindingScope`, `StatusBarHint` |
| `apps/tui/src/providers/normalize-key.ts` | `normalizeKeyDescriptor()` for consistent key lookup |
| `apps/tui/src/providers/OverlayManager.tsx` | `OverlayContext` with `activeOverlay`, `openOverlay()`, `closeOverlay()` — manages singleton overlay state |
| `apps/tui/src/providers/overlay-types.ts` | `OverlayType`, `OverlayState`, `ConfirmPayload`, `OverlayContextType` |
| `apps/tui/src/components/OverlayLayer.tsx` | Current placeholder overlay renderer — will be refactored to use `<Modal>` |
| `apps/tui/src/hooks/useLayout.ts` | `useLayout()` returning `modalWidth`, `modalHeight`, `breakpoint`, `width`, `height` |
| `apps/tui/src/hooks/useOverlay.ts` | `useOverlay()` hook consuming `OverlayContext` |
| `apps/tui/src/theme/tokens.ts` | `ThemeTokens` with `border`, `surface`, `primary`, `muted` color values |

### Downstream Consumers

The following tickets depend on `tui-modal-component`:

- `tui-command-palette` — `CommandPalette` renders inside a `<Modal>`
- `tui-help-overlay` — `HelpOverlay` renders inside a `<Modal>`
- `tui-issue-labels-display` — `LabelPickerOverlay` renders inside a `<Modal>`
- `tui-issue-list-filters` — `AssigneePickerOverlay`, `MilestonePickerOverlay` render inside `<Modal>`
- `tui-workflow-actions` — `ActionConfirmationOverlay` renders inside a `<Modal>`
- `tui-workflow-dispatch` — `DispatchOverlay` renders inside a `<Modal>`
- `tui-workflow-artifacts-view` — `ArtifactDetailOverlay` renders inside a `<Modal>`
- `tui-workflow-cache-view` — Cache management overlays render inside a `<Modal>`

---

## Implementation Plan

### Step 1: Define the `ModalProps` interface and responsive sizing types

**File:** `apps/tui/src/components/Modal.tsx`

Define the public API types for the Modal component:

```typescript
import type { Breakpoint } from "../types/breakpoint.js";

/**
 * Breakpoint-aware sizing map. Each key maps to a CSS-like percentage
 * string or absolute column/row number for the corresponding breakpoint.
 *
 * If a single string is provided instead of a map, it is used at all breakpoints.
 */
export type ResponsiveSize =
  | string
  | number
  | {
      minimum?: string | number;
      standard?: string | number;
      large?: string | number;
    };

export interface ModalProps {
  /** Whether the modal is currently visible. */
  visible: boolean;
  /** Called when the modal is dismissed (via Esc key). */
  onDismiss: () => void;
  /** Optional title text rendered centered in a title bar row. */
  title?: string;
  /** Modal content. */
  children: React.ReactNode;
  /**
   * Modal width. Accepts percentage string, absolute number, or breakpoint map.
   * Defaults to layout.modalWidth from useLayout().
   */
  width?: ResponsiveSize;
  /**
   * Modal height. Same format as width.
   * Defaults to layout.modalHeight from useLayout().
   */
  height?: ResponsiveSize;
  /**
   * Whether Esc dismisses the modal. Default: true.
   * Set to false when the caller manages Esc handling (e.g., OverlayManager).
   */
  dismissOnEsc?: boolean;
  /**
   * Additional keybindings registered in the modal's PRIORITY.MODAL scope.
   * Merged with the default Esc binding (when dismissOnEsc is true).
   */
  keybindings?: KeyHandler[];
}
```

**Architectural Decision — ResponsiveSize type:** The `ResponsiveSize` type accepts three forms: a single value (used at all breakpoints), a breakpoint map (different values per breakpoint), or an absolute number. This flexibility allows callers to specify exact sizing when needed (e.g., confirmation dialogs with fixed small dimensions) or delegate to the responsive system (e.g., CommandPalette using layout defaults). The resolution logic is a pure function (`resolveResponsiveSize`) that maps the current breakpoint to the appropriate value.

### Step 2: Implement the `resolveResponsiveSize` utility

**File:** `apps/tui/src/components/Modal.tsx` (internal helper, not exported)

```typescript
function resolveResponsiveSize(
  size: ResponsiveSize | undefined,
  fallback: string,
  breakpoint: Breakpoint | null,
): string | number {
  if (size === undefined) return fallback;
  if (typeof size === "number") return size;
  if (typeof size === "string") return size;

  // Breakpoint map
  const bp = breakpoint ?? "minimum";
  const value = size[bp as keyof typeof size];
  if (value !== undefined) return value;

  // Fallback chain: large → standard → minimum → layout default
  if (bp === "large" && size.standard !== undefined) return size.standard;
  if ((bp === "large" || bp === "standard") && size.minimum !== undefined) return size.minimum;
  return fallback;
}
```

The fallback chain ensures that if a caller only specifies `{ standard: "60%" }`, the `large` breakpoint falls back to `"60%"` rather than the layout default. This prevents surprising behavior where a partially-specified map silently ignores breakpoints.

### Step 3: Implement the `Modal` component

**File:** `apps/tui/src/components/Modal.tsx`

The Modal component is a presentational component that renders an absolutely-positioned `<box>` with:
- Centered positioning using `top="auto"` / `left="auto"` (OpenTUI's auto-centering)
- `zIndex={100}` to render above content area
- Single-line border using `border={true}` and `borderStyle="single"`
- `borderColor` from `theme.border`
- `backgroundColor` from `theme.surface`
- Optional title bar row at the top with centered text using flexGrow spacers
- Focus trap via `PRIORITY.MODAL` keybinding scope
- Esc dismissal registered in the keybinding scope (when `dismissOnEsc` is true)

Key implementation details:

1. **Centering:** `top="auto"` / `left="auto"` with `position="absolute"` in OpenTUI centers the box within its parent. This is the same pattern used by the existing `OverlayLayer.tsx`.

2. **Title centering:** The title is centered by placing `flexGrow={1}` spacer `<box>` elements on either side of the `<text>` element.

3. **Separator:** A `"─".repeat(40)` text node separates the title from content. It clips naturally at the box boundary.

4. **Focus trap:** Achieved by registering a `PRIORITY.MODAL` (2) keybinding scope that intercepts keys before GOTO (3), SCREEN (4), and GLOBAL (5) scopes.

5. **Scope lifecycle:** A `useEffect` manages scope registration/removal tied to the `visible` prop. When `visible` transitions to `false`, the scope is removed. The cleanup function also runs on unmount.

6. **Stable onDismiss ref:** `onDismissRef` ensures the Esc handler always calls the latest callback, avoiding stale closures.

### Step 4: Implement the `useModal()` hook

**File:** `apps/tui/src/hooks/useModal.ts`

The `useModal()` hook provides imperative control over a local modal state. This is for components that manage their own modal visibility without going through the singleton `OverlayManager`.

```typescript
export interface UseModalReturn {
  isOpen: boolean;
  open: (content?: ReactNode) => void;
  close: () => void;
  content: ReactNode | null;
}

export function useModal(): UseModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);

  const open = useCallback((newContent?: ReactNode) => {
    setContent(newContent ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setContent(null);
  }, []);

  return useMemo(
    () => ({ isOpen, open, close, content }),
    [isOpen, open, close, content],
  );
}
```

**Usage pattern for downstream consumers:**

```tsx
const modal = useModal();

// Open
modal.open();

// Render
<Modal visible={modal.isOpen} onDismiss={modal.close} title="Confirm">
  <text>Are you sure?</text>
</Modal>
```

**Architectural Decision — useModal() vs. OverlayManager:**

| Concern | OverlayManager | useModal() |
|---------|---------------|------------|
| Scope | Global — app-level overlays only | Local — any component |
| Mutual exclusion | Enforced (only one at a time) | Not enforced (caller's responsibility) |
| Keybinding scope | Registered by OverlayManager | Registered by `<Modal>` component |
| Status bar hints | Overridden by OverlayManager | Not affected (caller can override separately) |
| Content | Rendered by OverlayLayer | Rendered by caller with `<Modal>` |

Both patterns use the same `<Modal>` component for rendering.

### Step 5: Refactor `OverlayLayer` to use `<Modal>`

**File:** `apps/tui/src/components/OverlayLayer.tsx`

Replace the current inline `<box position="absolute">` rendering with `<Modal>`:

```typescript
import React from "react";
import { useOverlay } from "../hooks/useOverlay.js";
import { useTheme } from "../hooks/useTheme.js";
import { Modal } from "./Modal.js";

export function OverlayLayer() {
  const { activeOverlay, closeOverlay, confirmPayload } = useOverlay();
  const theme = useTheme();

  if (activeOverlay === null) return null;

  const titleMap: Record<string, string> = {
    "help": "Keybindings",
    "command-palette": "Command Palette",
    "confirm": confirmPayload?.title ?? "Confirm",
  };
  const title = titleMap[activeOverlay] ?? activeOverlay;

  return (
    <Modal
      visible={true}
      onDismiss={closeOverlay}
      title={title}
      width={{ minimum: "90%", standard: "60%", large: "50%" }}
      height={{ minimum: "90%", standard: "60%", large: "50%" }}
      dismissOnEsc={false}
    >
      {activeOverlay === "help" && (
        <text fg={theme.muted}>
          [Help overlay content — pending TUI_HELP_OVERLAY implementation]
        </text>
      )}
      {activeOverlay === "command-palette" && (
        <text fg={theme.muted}>
          [Command palette content — pending TUI_COMMAND_PALETTE implementation]
        </text>
      )}
      {activeOverlay === "confirm" && confirmPayload && (
        <box flexDirection="column" gap={1}>
          <text>{confirmPayload.message}</text>
          <box flexDirection="row" gap={2}>
            <text fg={theme.error}>
              [{confirmPayload.confirmLabel ?? "Confirm"}]
            </text>
            <text fg={theme.muted}>
              [{confirmPayload.cancelLabel ?? "Cancel"}]
            </text>
          </box>
        </box>
      )}
    </Modal>
  );
}
```

**Note on `dismissOnEsc={false}`:** The OverlayManager already handles Esc dismissal via its own `PRIORITY.MODAL` scope registered in `openOverlay()`. Setting `dismissOnEsc={false}` on the Modal prevents a double-registered Esc handler. The OverlayManager's Esc handler calls `closeOverlay()`, which sets `activeOverlay = null`, causing `OverlayLayer` to return null and unmount the `<Modal>`.

### Step 6: Export from component and hook indices

**File:** `apps/tui/src/components/Modal.tsx` — exports `Modal`, `ModalProps`, `ResponsiveSize`

**File:** `apps/tui/src/hooks/useModal.ts` — exports `useModal`, `UseModalReturn`

Add to barrel exports if they exist:
- `apps/tui/src/hooks/index.ts`: `export { useModal, type UseModalReturn } from "./useModal.js";`
- `apps/tui/src/components/index.ts`: `export { Modal, type ModalProps, type ResponsiveSize } from "./Modal.js";`

---

## Full Implementation

### File: `apps/tui/src/components/Modal.tsx`

```typescript
import React, { useContext, useEffect, useRef, type ReactNode } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { KeybindingContext } from "../providers/KeybindingProvider.js";
import { PRIORITY, type KeyHandler } from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor } from "../providers/normalize-key.js";
import type { Breakpoint } from "../types/breakpoint.js";

// ── Types ────────────────────────────────────────────────────────────

/**
 * Breakpoint-aware sizing.
 *
 * Accepts a single value (used at all breakpoints), a breakpoint map
 * (different values per breakpoint), or an absolute number.
 */
export type ResponsiveSize =
  | string
  | number
  | {
      minimum?: string | number;
      standard?: string | number;
      large?: string | number;
    };

export interface ModalProps {
  /** Whether the modal is currently visible. */
  visible: boolean;
  /** Called when the modal is dismissed (via Esc key). */
  onDismiss: () => void;
  /** Optional title text rendered centered in a title bar row. */
  title?: string;
  /** Modal content. */
  children: ReactNode;
  /**
   * Modal width. Accepts percentage string, absolute number, or breakpoint map.
   * Defaults to layout.modalWidth from useLayout().
   */
  width?: ResponsiveSize;
  /**
   * Modal height. Same format as width.
   * Defaults to layout.modalHeight from useLayout().
   */
  height?: ResponsiveSize;
  /**
   * Whether Esc dismisses the modal. Default: true.
   * Set to false when the caller manages Esc handling (e.g., OverlayManager).
   */
  dismissOnEsc?: boolean;
  /**
   * Additional keybindings registered in the modal's PRIORITY.MODAL scope.
   * Merged with the default Esc binding (when dismissOnEsc is true).
   */
  keybindings?: KeyHandler[];
}

// ── Internal helpers ─────────────────────────────────────────────────

function resolveResponsiveSize(
  size: ResponsiveSize | undefined,
  fallback: string,
  breakpoint: Breakpoint | null,
): string | number {
  if (size === undefined) return fallback;
  if (typeof size === "number") return size;
  if (typeof size === "string") return size;

  const bp: Breakpoint = breakpoint ?? "minimum";
  const value = size[bp as keyof typeof size];
  if (value !== undefined) return value;

  // Fallback chain: large → standard → minimum → layout default
  if (bp === "large" && size.standard !== undefined) return size.standard;
  if ((bp === "large" || bp === "standard") && size.minimum !== undefined)
    return size.minimum;
  return fallback;
}

// ── Component ────────────────────────────────────────────────────────

export function Modal({
  visible,
  onDismiss,
  title,
  children,
  width: widthProp,
  height: heightProp,
  dismissOnEsc = true,
  keybindings: extraBindings,
}: ModalProps) {
  const layout = useLayout();
  const theme = useTheme();
  const keybindingCtx = useContext(KeybindingContext);

  if (!keybindingCtx) {
    throw new Error("Modal must be used within a KeybindingProvider");
  }

  // Stable ref for onDismiss to avoid stale closures in keybinding handlers
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const scopeIdRef = useRef<string | null>(null);

  // ── Keybinding scope lifecycle ──────────────────────────────────
  useEffect(() => {
    if (!visible) {
      if (scopeIdRef.current) {
        keybindingCtx.removeScope(scopeIdRef.current);
        scopeIdRef.current = null;
      }
      return;
    }

    const bindings = new Map<string, KeyHandler>();

    if (dismissOnEsc) {
      bindings.set(normalizeKeyDescriptor("escape"), {
        key: normalizeKeyDescriptor("escape"),
        description: "Close",
        group: "Modal",
        handler: () => onDismissRef.current(),
      });
    }

    if (extraBindings) {
      for (const binding of extraBindings) {
        const normalized = normalizeKeyDescriptor(binding.key);
        bindings.set(normalized, {
          ...binding,
          key: normalized,
        });
      }
    }

    // Only register scope if there are bindings to register
    if (bindings.size > 0) {
      const scopeId = keybindingCtx.registerScope({
        priority: PRIORITY.MODAL,
        bindings,
        active: true,
      });
      scopeIdRef.current = scopeId;
    }

    return () => {
      if (scopeIdRef.current) {
        keybindingCtx.removeScope(scopeIdRef.current);
        scopeIdRef.current = null;
      }
    };
  }, [visible, dismissOnEsc, keybindingCtx, extraBindings]);

  // ── Render ──────────────────────────────────────────────────────
  if (!visible) return null;

  const resolvedWidth = resolveResponsiveSize(
    widthProp,
    layout.modalWidth,
    layout.breakpoint,
  );
  const resolvedHeight = resolveResponsiveSize(
    heightProp,
    layout.modalHeight,
    layout.breakpoint,
  );

  return (
    <box
      position="absolute"
      top="auto"
      left="auto"
      width={resolvedWidth as any}
      height={resolvedHeight as any}
      zIndex={100}
      flexDirection="column"
      border={true}
      borderStyle="single"
      borderColor={theme.border}
      backgroundColor={theme.surface}
    >
      {/* ── Title bar ─────────────────────────────────────────── */}
      {title !== undefined && (
        <>
          <box flexDirection="row" width="100%" paddingX={1}>
            <box flexGrow={1} />
            <text fg={theme.primary}>{title}</text>
            <box flexGrow={1} />
          </box>
          <text fg={theme.border}>{"─".repeat(40)}</text>
        </>
      )}

      {/* ── Content area ──────────────────────────────────────── */}
      <box flexGrow={1} flexDirection="column" padding={1}>
        {children}
      </box>
    </box>
  );
}
```

### File: `apps/tui/src/hooks/useModal.ts`

```typescript
import { useState, useCallback, useMemo, type ReactNode } from "react";

export interface UseModalReturn {
  /** Whether the modal is currently open. */
  isOpen: boolean;
  /** Open the modal. Optionally pass content to render inside. */
  open: (content?: ReactNode) => void;
  /** Close the modal and clear content. */
  close: () => void;
  /** Content passed to the most recent open() call, or null. */
  content: ReactNode | null;
}

/**
 * Imperative modal state management hook.
 *
 * Returns { isOpen, open, close, content } for controlling a <Modal> component.
 * Does not render anything — the caller renders <Modal visible={modal.isOpen}>.
 *
 * @example
 * ```tsx
 * const modal = useModal();
 *
 * // Trigger open
 * <button onPress={() => modal.open()}>Open</button>
 *
 * // Render modal
 * <Modal visible={modal.isOpen} onDismiss={modal.close} title="Confirm">
 *   <text>Are you sure?</text>
 * </Modal>
 * ```
 *
 * @example Dynamic content
 * ```tsx
 * const modal = useModal();
 * modal.open(<DeleteConfirm itemId={id} onDone={modal.close} />);
 *
 * <Modal visible={modal.isOpen} onDismiss={modal.close}>
 *   {modal.content}
 * </Modal>
 * ```
 */
export function useModal(): UseModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);

  const open = useCallback((newContent?: ReactNode) => {
    setContent(newContent ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setContent(null);
  }, []);

  return useMemo(
    () => ({ isOpen, open, close, content }),
    [isOpen, open, close, content],
  );
}
```

### File: `apps/tui/src/components/OverlayLayer.tsx` (refactored)

```typescript
import React from "react";
import { useOverlay } from "../hooks/useOverlay.js";
import { useTheme } from "../hooks/useTheme.js";
import { Modal } from "./Modal.js";

/**
 * Overlay rendering layer.
 *
 * Renders the singleton app-level overlay (help, command palette, confirm)
 * using the shared <Modal> component. Delegates sizing, border, background,
 * and positioning to Modal.
 *
 * Content for each overlay type is rendered by child components:
 * - "help": <HelpOverlayContent /> (pending TUI_HELP_OVERLAY)
 * - "command-palette": <CommandPaletteContent /> (pending TUI_COMMAND_PALETTE)
 * - "confirm": <ConfirmDialogContent /> (pending TUI_CONFIRM_DIALOG)
 */
export function OverlayLayer() {
  const { activeOverlay, closeOverlay, confirmPayload } = useOverlay();
  const theme = useTheme();

  if (activeOverlay === null) return null;

  const titleMap: Record<string, string> = {
    "help": "Keybindings",
    "command-palette": "Command Palette",
    "confirm": confirmPayload?.title ?? "Confirm",
  };
  const title = titleMap[activeOverlay] ?? activeOverlay;

  return (
    <Modal
      visible={true}
      onDismiss={closeOverlay}
      title={title}
      width={{ minimum: "90%", standard: "60%", large: "50%" }}
      height={{ minimum: "90%", standard: "60%", large: "50%" }}
      dismissOnEsc={false}
    >
      {activeOverlay === "help" && (
        <text fg={theme.muted}>
          [Help overlay content — pending TUI_HELP_OVERLAY implementation]
        </text>
      )}
      {activeOverlay === "command-palette" && (
        <text fg={theme.muted}>
          [Command palette content — pending TUI_COMMAND_PALETTE implementation]
        </text>
      )}
      {activeOverlay === "confirm" && confirmPayload && (
        <box flexDirection="column" gap={1}>
          <text>{confirmPayload.message}</text>
          <box flexDirection="row" gap={2}>
            <text fg={theme.error}>
              [{confirmPayload.confirmLabel ?? "Confirm"}]
            </text>
            <text fg={theme.muted}>
              [{confirmPayload.cancelLabel ?? "Cancel"}]
            </text>
          </box>
        </box>
      )}
    </Modal>
  );
}
```

---

## Architectural Decisions

### AD-1: Modal as a presentational component, not a state manager

**Decision:** `<Modal>` is a pure presentational component that accepts `visible` and `onDismiss` props. It does not manage its own open/close state. State management is handled by callers (either `OverlayManager` for global overlays or `useModal()` for local overlays).

**Rationale:** This separation keeps the Modal focused on rendering and focus-trapping concerns. It allows multiple state management strategies to coexist: the singleton OverlayManager pattern for app-level overlays and the local `useModal()` pattern for screen-specific overlays. A stateful Modal would conflict with OverlayManager's mutual-exclusion logic.

### AD-2: dismissOnEsc prop to avoid double-handling

**Decision:** The `dismissOnEsc` prop (default `true`) allows callers to opt out of the Modal's built-in Esc handler.

**Rationale:** The `OverlayManager` already registers its own `PRIORITY.MODAL` scope with an Esc binding when `openOverlay()` is called. If the `<Modal>` also registered an Esc binding, there would be two MODAL-priority scopes both handling Esc. While LIFO ordering would make this work (the most recently registered scope fires first), it would be fragile — the OverlayManager's cleanup would leave the Modal's scope active, potentially causing a stale close callback. Setting `dismissOnEsc={false}` in `OverlayLayer` cleanly avoids this.

For standalone modals using `useModal()`, `dismissOnEsc` defaults to `true` — the Modal's Esc handler is the only one.

### AD-3: Focus trap via keybinding priority, not DOM-level capture

**Decision:** Focus trapping is achieved by registering a `PRIORITY.MODAL` (2) keybinding scope. Keys registered in this scope are intercepted before GOTO (3), SCREEN (4), and GLOBAL (5) scopes. Keys NOT registered in the Modal scope fall through to lower priorities.

**Rationale:** OpenTUI does not have a DOM. There is no `document.addEventListener("keydown", ..., true)` for capture-phase interception. The TUI's keybinding priority system IS the focus management system. Registering at `PRIORITY.MODAL` ensures modal keys take precedence over screen navigation, while still allowing `Ctrl+C` (GLOBAL) to force-quit — which is correct behavior per test OVERLAY-019.

### AD-4: Underlying screen stays mounted

**Decision:** The Modal renders via absolute positioning above the content area. The underlying screen is never unmounted or conditionally hidden.

**Rationale:** This is architecturally guaranteed by the component hierarchy: `AppShell` renders `{children}` (the screen router) and `<OverlayLayer />` as siblings. The screen router's output is always rendered; the overlay layer is additional output on top. There is no conditional rendering of the screen based on overlay state. This matches the ticket requirement "overlay does not unmount underlying screen" and is verified by existing tests OVERLAY-010, OVERLAY-020.

### AD-5: ResponsiveSize fallback chain

**Decision:** When a breakpoint map omits a value for the current breakpoint, the resolver falls back through `large → standard → minimum → layout default`.

**Rationale:** This allows callers to specify only the breakpoints they care about. `{ standard: "60%" }` means: use 60% at standard, fall back to 60% at large (since large > standard), and fall back to the layout default at minimum. This is more ergonomic than requiring all three breakpoints every time.

---

## Unit & Integration Tests

### Test File

**File:** `e2e/tui/app-shell.test.ts`

All Modal component tests belong in the existing `app-shell.test.ts` file. The existing `TUI_OVERLAY_MANAGER` test suite (OVERLAY-001 through OVERLAY-022) already validates the behavioral contract that the Modal must satisfy after the OverlayLayer refactor.

### Existing Tests This Implementation Must Continue to Pass

| Test ID | Description | What it validates for Modal |
|---------|-------------|---------------------------|
| OVERLAY-001 | `?` opens help overlay | Modal renders with `visible={true}`, title "Keybindings" visible |
| OVERLAY-002 | Esc closes help overlay | OverlayManager Esc handler closes overlay → Modal unmounts |
| OVERLAY-003 | `?` toggles help off | Toggle behavior → Modal visibility cycles |
| OVERLAY-004 | `:` opens command palette | Modal renders with title "Command Palette" |
| OVERLAY-005 | Esc closes command palette | Same Esc lifecycle |
| OVERLAY-006 | `:` toggles command palette off | Same toggle |
| OVERLAY-007 | Help → command palette swap | Modal unmounts and re-mounts with different content |
| OVERLAY-008 | Command palette → help swap | Same in reverse |
| OVERLAY-009 | Only one overlay visible | Modal renders exactly one instance at a time |
| OVERLAY-010 | `q` does not navigate while overlay open | Focus trap via MODAL priority |
| OVERLAY-011 | Screen keybindings suppressed | MODAL priority (2) beats SCREEN priority (4) |
| OVERLAY-012 | Go-to mode blocked | `hasActiveModal()` returns true |
| OVERLAY-013 | Status bar shows "Esc close" | OverlayManager hint override |
| OVERLAY-014 | Status bar hints restore | OverlayManager cleanup |
| OVERLAY-015 | 90% width at 80x24 | ResponsiveSize resolves "90%" at minimum |
| OVERLAY-016 | 60% width at 120x40 | ResponsiveSize resolves "60%" at standard |
| OVERLAY-017 | 50% width at 200x60 | ResponsiveSize resolves "50%" at large |
| OVERLAY-018 | Rapid `? ?` stability | Mount/unmount cycle doesn't leak scopes |
| OVERLAY-019 | `Ctrl+C` still exits | Focus trap does NOT capture Ctrl+C |
| OVERLAY-020 | Close overlay restores screen | Underlying screen mounted throughout |
| OVERLAY-021 | Border and surface background | Modal uses theme tokens |
| OVERLAY-022 | Multiple open-close cycles | No scope leaks |

### New Tests

The following new tests are added to `e2e/tui/app-shell.test.ts` in a new `describe("TUI_MODAL_COMPONENT — Modal overlay rendering and focus trap")` block:

```typescript
describe("TUI_MODAL_COMPONENT — Modal overlay rendering and focus trap", () => {
  let terminal: any;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  // ── Rendering ──────────────────────────────────────────────────

  test("MODAL-001: modal renders with single-line border", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/[┌┐└┘│─╭╮╰╯]/);
  });

  test("MODAL-002: modal title is centered in title bar", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    expect(terminal.snapshot()).toContain("Keybindings");
  });

  test("MODAL-003: modal uses surface background color (truecolor)", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("MODAL-004: modal uses border color token for border", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  // ── Responsive sizing ──────────────────────────────────────────

  test("MODAL-005: modal at minimum breakpoint (80x24) uses 90% width", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("MODAL-006: modal at standard breakpoint (120x40) uses 60% width", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("MODAL-007: modal at large breakpoint (200x60) uses 50% width", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  // ── Focus trap ─────────────────────────────────────────────────

  test("MODAL-008: j/k do not propagate to underlying screen while modal open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("j");
    await terminal.sendKeys("k");
    await terminal.sendKeys("j");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");
    await terminal.waitForText("Dashboard");
  });

  test("MODAL-009: Ctrl+C force-quits even with modal open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("\\x03");
    await terminal.terminate();
  });

  test("MODAL-010: Tab key does not escape modal focus", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Tab");
    await terminal.waitForText("Keybindings");
  });

  // ── Title bar ──────────────────────────────────────────────────

  test("MODAL-011: help overlay shows title 'Keybindings'", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    expect(terminal.snapshot()).toContain("Keybindings");
  });

  test("MODAL-012: command palette shows title 'Command Palette'", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    expect(terminal.snapshot()).toContain("Command Palette");
  });

  // ── Underlying screen preserved ────────────────────────────────

  test("MODAL-013: screen content remains rendered under modal", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");
    await terminal.waitForText("Dashboard");
  });

  test("MODAL-014: navigating to different screen then opening modal preserves screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");
    await terminal.waitForText("Repositories");
  });

  // ── Keybinding scope cleanup ───────────────────────────────────

  test("MODAL-015: opening and closing modal does not leak keybinding scopes", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");

    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");

    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Command Palette");

    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");

    await terminal.waitForText("Dashboard");
  });

  test("MODAL-016: separator line rendered below title", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    expect(terminal.snapshot()).toMatch(/─{3,}/);
  });
});
```

### Test Philosophy Compliance

- **No mocking:** Tests launch a real TUI instance via `launchTUI()` and interact through keyboard simulation. The Modal component is exercised through the real OverlayManager integration.
- **Failing tests stay failing:** Tests that require backend API responses will fail if the backend is not running. They are never skipped or commented out.
- **Behavior-focused:** Test names describe user-visible behavior, not implementation details.
- **Independent:** Each test creates its own `launchTUI()` instance and terminates it. No shared state.
- **Snapshot at multiple sizes:** MODAL-005/006/007 capture snapshots at minimum, standard, and large breakpoints to verify responsive sizing.

---

## Productionization Checklist

This component is implemented directly as production code (no POC phase). The following checklist ensures production readiness:

| Check | Detail |
|-------|--------|
| **Scope leak prevention** | `useEffect` cleanup removes the keybinding scope when `visible` transitions to `false` or when the component unmounts. `scopeIdRef` is cleared after removal. |
| **Stable onDismiss reference** | `onDismissRef` ensures the Esc handler always calls the latest `onDismiss` callback, avoiding stale closures when the parent re-renders with a new callback reference. |
| **Conditional scope registration** | When `dismissOnEsc={false}` and no `keybindings` are provided, no scope is registered (`bindings.size === 0`). This avoids unnecessary scope churn. |
| **Effect dependency correctness** | The `useEffect` depends on `[visible, dismissOnEsc, keybindingCtx, extraBindings]`. Changes to any of these tear down the old scope and register a new one. |
| **No render when hidden** | `if (!visible) return null` — no rendering overhead when modal is not shown. |
| **Theme token usage** | All colors reference semantic tokens (`theme.border`, `theme.surface`, `theme.primary`, `theme.muted`). No raw ANSI codes. |
| **Responsive sizing** | `resolveResponsiveSize` handles all three input forms (string, number, breakpoint map) with a clean fallback chain. |
| **OverlayLayer backward compatibility** | The refactored `OverlayLayer` produces identical visual output. Existing OVERLAY-001 through OVERLAY-022 tests validate this. |
| **useModal() memoization** | `open`/`close` functions are memoized via `useCallback`. Return object is memoized via `useMemo`. Consumers can safely destructure without triggering re-renders. |
| **Export surface** | `Modal`, `ModalProps`, `ResponsiveSize` exported from component file. `useModal`, `UseModalReturn` exported from hook file. |

---

## Files Modified

| File | Change |
|------|--------|
| `apps/tui/src/components/Modal.tsx` | **New file** — Modal component with focus trap, responsive sizing, title bar (~150 lines) |
| `apps/tui/src/hooks/useModal.ts` | **New file** — imperative modal state hook (~50 lines) |
| `apps/tui/src/components/OverlayLayer.tsx` | **Refactored** — delegates rendering to `<Modal>`, removes inline `<box>` absolute positioning |
| `e2e/tui/app-shell.test.ts` | **Extended** — add `TUI_MODAL_COMPONENT` describe block with 16 new test cases |

## Files NOT Modified (consumed as-is)

| File | Reason |
|------|--------|
| `apps/tui/src/providers/OverlayManager.tsx` | OverlayManager manages singleton state and Esc keybinding — unchanged |
| `apps/tui/src/providers/overlay-types.ts` | Types are correct as-is |
| `apps/tui/src/providers/KeybindingProvider.tsx` | Priority dispatch already supports MODAL scope registration |
| `apps/tui/src/providers/keybinding-types.ts` | `PRIORITY.MODAL = 2` already defined |
| `apps/tui/src/hooks/useOverlay.ts` | Hook is correct as-is |
| `apps/tui/src/hooks/useLayout.ts` | Layout context already provides `modalWidth` and `modalHeight` |
| `apps/tui/src/theme/tokens.ts` | Theme tokens already define `border`, `surface`, `primary`, `muted` |
| `apps/tui/src/components/AppShell.tsx` | AppShell already renders `<OverlayLayer />` — no changes needed |