# Engineering Specification: tui-sync-error-detail-modal

## 1. Overview
This specification details the implementation of the `SyncErrorDetailModal`, an overlay component used to inspect sync queue items (conflicts or failures) in the Codeplane TUI. It provides a detailed view of the sync operation, including metadata, error messages, and request payloads, along with actions to retry or discard the operation.

## 2. Scope
*   **Component:** `apps/tui/src/components/SyncErrorDetailModal.tsx`
*   **Visuals:** Centered modal overlay with an `error`-colored border (red 196).
*   **Responsive Sizing:**
    *   Minimum (80x24): 90% width, 80% height.
    *   Standard (120x40): 60% width, 60% height.
    *   Large (200x60): 50% width, 50% height.
*   **Content Sections:**
    *   Title bar: "Conflict Detail" (or "Error Detail" based on status) + "Esc: close".
    *   Metadata fields: Status (with color badge), Method (primary bold), API path, Local ID (if present), Timestamp (absolute + relative).
    *   Error message: Rendered inside a `<scrollbox>` with ANSI escape codes stripped.
    *   Request body preview: Rendered inside a `<scrollbox>` using `<code language="json">` for syntax highlighting. Truncated at 2000 characters with a "… (truncated)" marker. Displays "No request body" for null payloads.
*   **Interactions:**
    *   Keyboard navigation (`j`/`k`) for scrolling content within `<scrollbox>`es when they overflow.
    *   `d`: Discard (for conflict items). Opens a stacked discard confirmation modal at `zIndex` 20.
    *   `y`: Retry (for conflict/failed items). Fires retry action and auto-closes the modal on success.
    *   `Esc`: Closes the modal and returns focus to the queue list.
*   **Contextual Action Hints:** Displayed at the bottom (e.g., `d: discard`, `y: retry`, `Esc: close`).
*   **Z-Index:** Set to 10 (to sit below the confirmation modal at 20).

## 3. Architecture & Design
*   **Modal System Integration:** Built on top of the established `ModalSystem` (or `<OverlayLayer>`).
*   **Theme Integration:** Uses `useTheme()` to fetch semantic colors (`error`, `primary`, `muted`, etc.).
*   **Responsive Layout:** Uses `useLayout()` to recalculate dimensions on resize, ensuring the modal adapts to the terminal size seamlessly.
*   **ANSI Stripping:** Utility function to strip ANSI escape codes from raw error messages.

## 4. Implementation Plan

1.  **Create Component File:** `apps/tui/src/components/SyncErrorDetailModal.tsx`
2.  **Define Props Interface:**
    ```typescript
    interface SyncQueueItem {
      id: string;
      status: 'conflict' | 'failed' | 'pending';
      method: string;
      path: string;
      localId?: string;
      timestamp: string;
      error?: string;
      body?: string | null;
    }

    interface SyncErrorDetailModalProps {
      visible: boolean;
      item: SyncQueueItem | null;
      onDismiss: () => void;
      onRetry?: (id: string) => Promise<void>;
      onDiscard?: (id: string) => Promise<void>;
    }
    ```
3.  **Implement Layout & Responsive Sizing:**
    *   Use `useLayout()` to map terminal dimensions to modal sizes (90%x80% for minimum, 60%x60% for standard, 50%x50% for large).
    *   Use `<box position="absolute" top="center" left="center" zIndex={10} ...>` for the main container.
4.  **Implement Content Rendering:**
    *   **Header:** Title and close hint.
    *   **Metadata:** Use `<box flexDirection="row">` to align status, method, path, etc. Apply theme colors.
    *   **Error Message:** Strip ANSI codes. Render inside a `<scrollbox>`.
    *   **Request Body:** Truncate if `body.length > 2000`. Render using `<code>` inside a `<scrollbox>`.
5.  **Implement Keybindings:**
    *   Use a local keybinding scope or `useKeyboard` block active when `visible` is true.
    *   Handle `Esc` -> `onDismiss()`.
    *   Handle `d` -> Trigger confirmation state, then call `onDiscard()`.
    *   Handle `y` -> Call `onRetry()`, then `onDismiss()` if successful.
6.  **Confirmation Modal Integration:**
    *   Add internal state `showConfirmDiscard`.
    *   Render a nested `<ConfirmDialog>` with `zIndex={20}` when `showConfirmDiscard` is true.

## 5. Unit & Integration Tests

*   **File:** `e2e/tui/sync-error-detail-modal.test.ts`
*   **Test Cases:**
    *   `renders correctly at standard size (120x40)`: Snapshot test to verify layout, border color, and metadata rendering.
    *   `adapts to minimum size (80x24)`: Snapshot test to verify the 90%x80% layout.
    *   `truncates large request bodies`: Verify that bodies over 2000 chars show the "… (truncated)" marker.
    *   `strips ANSI codes from error messages`: Verify that raw error messages containing ANSI color codes are rendered cleanly.
    *   `handles keybindings (Esc, d, y)`: Simulate key presses and verify that the appropriate callbacks (`onDismiss`, `onDiscard`, `onRetry`) are fired or confirmation modals are shown.
    *   `nested discard confirmation modal works`: Press `d`, verify the confirmation modal appears over the detail modal, then press `y` (yes) to confirm discard.
