# Research for tui-sync-discard-confirmation-modal

## Context & Architecture
The TUI uses a centralized overlay system managed by `OverlayManager` (`apps/tui/src/providers/OverlayManager.tsx`). The state is exposed via the `useOverlay` hook (`apps/tui/src/hooks/useOverlay.ts`). The `"confirm"` overlay is one of the three core overlay types (`help`, `command-palette`, `confirm`).

The `OverlayLayer` component (`apps/tui/src/components/OverlayLayer.tsx`) is responsible for rendering the active overlay. Currently, the `"confirm"` overlay renders a static text placeholder. The ticket instructs the implementation of the `<ConfirmDialogContent />` component, which is intended to handle destructive actions like discarding sync conflicts, utilizing the existing `ConfirmPayload` structure.

## Relevant Files & Code

1. **`apps/tui/src/providers/overlay-types.ts`**
   - Contains the payload structure the modal will consume:
     ```ts
     export interface ConfirmPayload {
       title: string;
       message: string;
       confirmLabel?: string;
       cancelLabel?: string;
       onConfirm: () => void;
       onCancel?: () => void;
     }
     ```

2. **`apps/tui/src/components/OverlayLayer.tsx`**
   - Renders an absolutely positioned `<box>` with `zIndex={100}`, `width={layout.modalWidth}`, and `height={layout.modalHeight}`.
   - Currently contains a placeholder for the confirm dialog between lines 83-91. This block needs to be replaced with the new `<ConfirmDialogContent />` component.
   - Mentions in its docblock: `- "confirm": <ConfirmDialogContent /> (implemented in a separate ticket)`.

3. **`apps/tui/src/providers/OverlayManager.tsx`**
   - The manager already intercepts `openOverlay("confirm", payload)` and registers a `PRIORITY.MODAL` keybinding scope with an `Escape` keybinding that triggers `closeOverlay()`.
   - It automatically invokes `payload.onCancel?.()` when the overlay is closed via `Escape`.
   - This means the new component only needs to provide keybindings for confirming the action (e.g., `Enter` or `y`) and rendering the UI.

4. **`apps/tui/src/theme/tokens.ts`**
   - Provides the semantic color tokens. Destructive actions (like discarding a sync conflict) should likely render the confirm button or text in `theme.error`, while the `cancelLabel` can use `theme.muted`.

5. **`apps/tui/src/router/registry.ts`**
   - The `ScreenName.Sync` route currently points to a `PlaceholderScreen`. The confirmation modal is being pre-emptively built (or built in tandem) for the sync conflict resolution interface, which will eventually render a conflict list and allow users to discard conflicting changes.

## Implementation Path
- **Component**: Create `apps/tui/src/components/ConfirmDialogContent.tsx`.
- **State**: Consume `useOverlay()` to retrieve the `confirmPayload` and `closeOverlay()` function.
- **Keybindings**: Register an explicit keybinding (likely `Enter`) to trigger `payload.onConfirm()` followed by `closeOverlay()`. `Escape` is already globally handled by the `OverlayManager`, but you may want to add `y` / `n` shortcuts.
- **Integration**: Update `apps/tui/src/components/OverlayLayer.tsx` to import and render `<ConfirmDialogContent />` when `activeOverlay === "confirm"`.