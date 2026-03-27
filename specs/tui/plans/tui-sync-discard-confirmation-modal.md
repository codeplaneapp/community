# Implementation Plan: TUI Sync Discard Confirmation Modal

## Overview
Implement the `<ConfirmDialogContent />` component to handle destructive actions like discarding sync conflicts. This component integrates with the existing `OverlayManager` and `useOverlay` hook, providing a keyboard-driven confirmation dialog.

## Step 1: Create `ConfirmDialogContent` Component
**File:** `apps/tui/src/components/ConfirmDialogContent.tsx`
**Action:** Create a new React component for the confirmation dialog.

**Implementation Details:**
- Import `useOverlay` from `apps/tui/src/hooks/useOverlay.ts` to access `confirmPayload` and the `closeOverlay` function.
- Import `useKeyboard` to register local keybindings for the modal.
- Register keybindings:
  - `Enter` or `y`: Call `payload.onConfirm()` followed by `closeOverlay()`.
  - `n`: Call `payload.onCancel?.()` followed by `closeOverlay()`. 
  - Note: `Escape` is already handled globally by `OverlayManager`, but adding explicit `y`/`n` hints is standard for terminal prompts.
- Render the UI using OpenTUI components (`<box>`, `<text>`):
  - A `<box flexDirection="column" padding={1} gap={1}>` as the container.
  - A `<text bold>` for `payload.title`.
  - A `<text>` for `payload.message`.
  - A `<box flexDirection="row" gap={2}>` for the button labels.
  - Display `[Y/Enter] {payload.confirmLabel || 'Confirm'}` using a prominent or destructive color token (e.g., `theme.error` for discards).
  - Display `[N/Esc] {payload.cancelLabel || 'Cancel'}` using `theme.muted`.

## Step 2: Update `OverlayLayer` to Render the Modal
**File:** `apps/tui/src/components/OverlayLayer.tsx`
**Action:** Replace the existing placeholder for the `"confirm"` overlay.

**Implementation Details:**
- Import `<ConfirmDialogContent />` from `./ConfirmDialogContent`.
- Locate the conditional block rendering the overlays (where `activeOverlay === "confirm"`).
- Replace the static text placeholder with `<ConfirmDialogContent />`.
- Ensure the parent `<box>` for the modal has appropriate border and styling.

## Step 3: End-to-End Tests
**File:** `e2e/tui/sync.test.ts`
**Action:** Add tests to verify the confirmation modal behavior.

**Implementation Details:**
- Add a test that triggers the confirmation modal (e.g., attempting to discard a sync conflict).
- Capture a terminal snapshot to verify the modal renders with the correct title, message, and styling.
- Simulate pressing `Enter` and verify the `onConfirm` action is executed (e.g., the conflict is discarded and the modal closes).
- Simulate pressing `n` or `Esc` and verify the modal closes without executing the destructive action.