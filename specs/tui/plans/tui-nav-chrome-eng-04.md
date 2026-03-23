# Implementation Plan: `tui-nav-chrome-eng-04` - OverlayManager Context

## Overview
This plan details the implementation of the `OverlayManager` for the Codeplane TUI. The `OverlayManager` is a React context provider that ensures mutual exclusion of modals (help, command palette, confirm dialogs). It coordinates with the `KeybindingProvider` to trap focus and handles rendering via the `OverlayLayer` component.

## Step-by-Step Implementation

### Step 1: Define Overlay Types
**File:** `apps/tui/src/providers/overlay-types.ts`
- Create a types-only file defining the contract for the overlay system.
- Define `OverlayType` union (`"help" | "command-palette" | "confirm"`).
- Define `OverlayState` (`OverlayType | null`).
- Define `ConfirmPayload` interface (title, message, confirmLabel, cancelLabel, onConfirm, onCancel).
- Define `OverlayContextType` interface with `activeOverlay`, overloaded `openOverlay`, `closeOverlay`, `isOpen`, and `confirmPayload`.

### Step 2: Implement `OverlayManager` Provider
**File:** `apps/tui/src/providers/OverlayManager.tsx`
- Implement the `OverlayManager` React context provider.
- State: `activeOverlay` and `confirmPayload`.
- Context integration: Use `KeybindingContext` and `StatusBarHintsContext`.
- Lifecycle:
  - `openOverlay(type, payload)`: Toggles overlay if same type, swaps if different. Sets `confirmPayload` if type is `"confirm"`. Registers a `PRIORITY.MODAL` scope with an `Escape` keybinding to close the overlay. Overrides status bar hints to show `Esc: close`.
  - `closeOverlay()`: Clears `activeOverlay`, removes the MODAL scope, restores status bar hints, and triggers `onCancel` if it was a confirm overlay.
- Use `useRef` to track the `modalScopeId` and `hintsCleanup` functions to avoid stale closures.
- Handle cleanup on unmount.

### Step 3: Implement `useOverlay` Hook
**File:** `apps/tui/src/hooks/useOverlay.ts`
- Create a custom hook to consume `OverlayContext`.
- Throw a helpful error if used outside the `OverlayManager` provider stack.

### Step 4: Implement `OverlayLayer` Component
**File:** `apps/tui/src/components/OverlayLayer.tsx`
- Create the presentational component for the active overlay.
- Consume `useOverlay`, `useLayout`, and `useTheme`.
- Return `null` if `activeOverlay === null`.
- Render an absolutely positioned `<box>` with `zIndex={100}`, centered (`top="center"`, `left="center"`).
- Apply responsive sizing using `layout.modalWidth` and `layout.modalHeight`.
- Apply border and background colors from `useTheme`.
- Render a title bar and a placeholder content area based on the `activeOverlay` type (to be replaced by actual content components in future tickets).

### Step 5: Integration and Exports
**File 1:** `apps/tui/src/providers/index.ts`
- Export `OverlayManager`, `OverlayContext`, and types from `overlay-types.ts`.

**File 2:** `apps/tui/src/components/index.ts`
- Export `OverlayLayer`.

**File 3:** `apps/tui/src/components/AppShell.tsx`
- Import `OverlayLayer`.
- Add `<OverlayLayer />` as the last child inside the root `<box>`, ensuring it sits above other content due to its absolute positioning and zIndex.

### Step 6: End-to-End Tests
**File:** `e2e/tui/app-shell.test.ts`
- Add a new `describe` block: `"TUI_OVERLAY_MANAGER — overlay mutual exclusion"`.
- Implement tests verifying:
  - Basic open/close lifecycle for all overlay types.
  - Mutual exclusion (opening one overlay closes another).
  - Toggle behavior.
  - Focus trapping (verifying background screen keybindings like `g r`, `q`, `j`/`k` are suppressed).
  - Status bar hint overriding.
  - Responsive sizing via snapshot tests at different terminal dimensions (80x24, 120x40, 200x60).
  - Edge cases (rapid toggling, Ctrl+C exit, state restoration after close).

*(Note: Tests involving `?` and `:` will fail until `GlobalKeybindings.tsx` is wired in a subsequent ticket. Leave these tests failing as per project policy.)*