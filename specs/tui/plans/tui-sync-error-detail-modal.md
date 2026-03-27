# Implementation Plan: tui-sync-error-detail-modal

## 1. Overview
This plan details the implementation of the `SyncErrorDetailModal` component for the Codeplane TUI, used to display detailed information about sync queue conflicts and failures. It includes responsive layout adjustments, a nested confirmation dialog for discarding items, and precise ANSI code stripping for error messages.

## 2. Step-by-Step Implementation

### Step 1: Create the Component File
**File:** `apps/tui/src/components/SyncErrorDetailModal.tsx`

1.  **Imports:**
    *   React hooks (`useState`, `useMemo`, `useRef`).
    *   OpenTUI primitive components (`<box>`, `<scrollbox>`, `<text>`, `<code>`).
    *   TUI Hooks (`useTheme`, `useLayout`, and keybinding hooks from `apps/tui/src/providers/`).

2.  **Define Interfaces & Utilities:**
    *   Export the `SyncQueueItem` and `SyncErrorDetailModalProps` interfaces as defined in the spec.
    *   Implement a local `stripAnsi` function:
        ```typescript
        function stripAnsi(text: string): string {
          return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        }
        ```

3.  **Implement Nested `<ConfirmDialog>` Component (Private):**
    *   Create a local component `ConfirmDialog({ onConfirm, onCancel })`.
    *   Layout: Centered `<box>` with `zIndex={20}`, border colored with `theme.warning` or `theme.border`.
    *   Text: "Are you sure you want to discard this item?"
    *   Hints: `y: confirm, Esc/n: cancel`.
    *   Keybindings: Register a scope with `PRIORITY.MODAL + 1` (or highest) that listens to `y`, `n`, and `Esc`.

4.  **Implement `<SyncErrorDetailModal>`:**
    *   **State:** `showConfirmDiscard` (boolean, default `false`).
    *   **Hooks:**
        *   `const theme = useTheme();`
        *   `const layout = useLayout();`
    *   **Responsive Dimensions:** Calculate dimensions based on `layout.breakpoint`:
        ```typescript
        const dimensions = useMemo(() => {
          if (layout.breakpoint === 'minimum') return { width: '90%', height: '80%' };
          if (layout.breakpoint === 'large') return { width: '50%', height: '50%' };
          return { width: '60%', height: '60%' }; // standard
        }, [layout.breakpoint]);
        ```
    *   **Keybindings:** Register a keybinding scope with `PRIORITY.MODAL` active when `visible === true` and `!showConfirmDiscard`.
        *   `Esc`: `onDismiss()`
        *   `d`: `if (item?.status === 'conflict') setShowConfirmDiscard(true)`
        *   `y`: `if (item) { onRetry?.(item.id).then(() => onDismiss()); }`
    *   **Data Preparation:**
        *   Clean the error message using `stripAnsi(item.error || '')`.
        *   Truncate the body: `const displayBody = item.body ? (item.body.length > 2000 ? item.body.slice(0, 2000) + '\n… (truncated)' : item.body) : 'No request body';`

5.  **Render Function:**
    *   Return `null` if `!visible` or `!item`.
    *   Main Container: `<box position="absolute" top="center" left="center" zIndex={10} width={dimensions.width} height={dimensions.height} border="single" borderColor={theme.error} flexDirection="column">`
    *   Header: `<box flexDirection="row" justifyContent="space-between">` containing title ("Conflict Detail" / "Error Detail") and "Esc: close".
    *   Metadata Box: `<box flexDirection="row" gap={2}>` showing Status (with color badge based on status), Method (primary bold), Path, Local ID, and Timestamp.
    *   Error Section: `<scrollbox height="30%"><text>{cleanError}</text></scrollbox>`
    *   Payload Section: `<scrollbox height="50%"><code language="json">{displayBody}</code></scrollbox>`
    *   Footer: Action hints (`d: discard | y: retry`).
    *   Nested Confirmation: `{showConfirmDiscard && <ConfirmDialog ... />}`

### Step 2: Write End-to-End Tests
**File:** `e2e/tui/sync-error-detail-modal.test.ts`

1.  **Imports:**
    *   Test utilities from `@microsoft/tui-test` (e.g., `render`, `fireEvent`, `expect`).
    *   `SyncErrorDetailModal` component.

2.  **Setup Mocks:**
    *   Create a mock `SyncQueueItem` with a large JSON body (> 2000 chars) and an error message containing ANSI codes (`"\x1b[31mFailed to sync\x1b[0m"`).
    *   Mock functions for `onDismiss`, `onRetry`, and `onDiscard`.

3.  **Test Cases:**
    *   **`renders correctly at standard size (120x40)`:** Mount with standard dimensions. Assert snapshot matches (verifying border color, header, and metadata layout).
    *   **`adapts to minimum size (80x24)`:** Override layout hook to return `minimum`. Assert dimensions adjust to 90% width and 80% height.
    *   **`truncates large request bodies`:** Assert that the rendered text contains the exact string `"… (truncated)"`.
    *   **`strips ANSI codes from error messages`:** Assert that the rendered error text is purely `"Failed to sync"` without the `\x1b[31m` codes.
    *   **`handles keybindings (Esc)`:** Fire `Esc` key event. Assert `onDismiss` is called.
    *   **`handles retry action (y)`:** Fire `y` key event. Assert `onRetry` is called with the item ID, followed by `onDismiss`.
    *   **`nested discard confirmation modal works`:** 
        1. Fire `d` key event.
        2. Assert the confirmation dialog text appears ("Are you sure you want to discard this item?").
        3. Fire `y` key event.
        4. Assert `onDiscard` is called with the correct ID.
        5. Alternately, fire `n` or `Esc` to verify the confirmation modal closes without calling `onDiscard`.

### Step 3: Integration
1.  Ensure `SyncErrorDetailModal` is exported correctly (e.g., in `apps/tui/src/components/index.ts` if one exists, otherwise directly importable).
2.  Run the TypeScript compiler (`tsc --noEmit`) to verify interface compliance.
3.  Run the `@microsoft/tui-test` suite for the new test file to ensure snapshots and interactions behave as expected.