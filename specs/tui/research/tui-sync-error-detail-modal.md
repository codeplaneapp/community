## Research Notes for `tui-sync-error-detail-modal`

### 1. Existing Modal and Overlay System
- **File**: `apps/tui/src/components/OverlayLayer.tsx`
  - Defines the global overlay layer using `<box position="absolute" top="auto" left="auto" zIndex={100} ...>`.
  - Responsive dimensions are retrieved from `useLayout()`.
  - Mentions a pending `ConfirmDialogContent` component, indicating that a standalone `<ConfirmDialog>` component has not been fully extracted into `apps/tui/src/components/` yet.
- **File**: `apps/tui/src/hooks/useLayout.ts`
  - Exposes `modalWidth` and `modalHeight` (e.g., `90%` for minimum, `60%` for standard, `50%` for large breakpoints).
  - The PRD dictates an `80%` height for minimum screens. Since `useLayout` maps the minimum height to `90%`, you can compute `layout.breakpoint === null ? "80%" : layout.modalHeight` locally if strict adherence to the spec's height is required.
- **File**: `apps/tui/src/hooks/useTheme.ts`
  - Provides semantic color tokens (`theme.error`, `theme.primary`, `theme.muted`, `theme.surface`, `theme.border`).

### 2. Keybindings & Focus Trapping
- **Files**: `apps/tui/src/providers/KeybindingProvider.tsx` & `apps/tui/src/providers/keybinding-types.ts`
  - Defines `PRIORITY.MODAL` (priority 2), which correctly intercepts events before `PRIORITY.SCREEN` (priority 4).
  - To properly trap focus when `visible === true`, utilize `KeybindingContext` to `registerScope({ priority: PRIORITY.MODAL, bindings: map, active: true })`.
  - Map `Esc` to `onDismiss`, `d` to toggle confirmation, `y` to retry (or confirm discard when the nested modal is active).
  - Include mappings for `j`/`k` to enable vertical scrolling in the inner `<scrollbox>` elements.

### 3. Confirmation Dialog Integration
- Search results confirm that a reusable `<ConfirmDialog>` is not currently exported from `apps/tui/src/components/`.
- **Implementation Strategy**: Create a private `ConfirmDialog` component inside `apps/tui/src/components/SyncErrorDetailModal.tsx` utilizing `<box position="absolute" top="center" left="center" zIndex={20}>`. When `showConfirmDiscard` is active, render this nested component and push a distinct keybinding scope that exclusively listens for `y` (confirm) and `Esc`/`n` (cancel).

### 4. ANSI Stripping Utility
- The codebase contains custom `stripAnsi` functions in CLI files (`apps/cli/src/commands/workspace.ts`) and test helpers (`specs/tui/e2e/tui/helpers/workspaces.ts`), but no shared export for TUI components exists in `apps/tui/src/utils/`.
- **Implementation Strategy**: Include a localized `stripAnsi` function in the modal file using the regex pattern standard to the codebase:
  ```typescript
  function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }
  ```

### 5. Layout Constraints & Body Truncation
- Wrap both the error message and the request body in `<scrollbox>` tags.
- Use OpenTUI's `<code>` component with `language="json"` for the payload preview.
- Enforce the 2000 character limit by checking `body.length > 2000`, slicing it, and appending `\n… (truncated)` before passing it to `<code>`.