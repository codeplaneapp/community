# Engineering Specification: Discard confirmation modal for sync conflict resolution

## 1. Overview

This document specifies the implementation of the `SyncDiscardConfirmModal` component for the Codeplane TUI. This modal is a critical safety mechanism that guards destructive sync conflict resolutions, ensuring users do not accidentally discard local state or dismiss conflicts without explicit confirmation. It renders on top of the sync screen and any active error details modal.

## 2. Architecture & Design

The modal integrates with the TUI's existing `ModalSystem` (which renders within the `<OverlayLayer>`) and uses `ThemeProvider` for consistent styling.

### 2.1 Visual Layout
- **Container**: Centered `<box>` with `border="single"` colored in `theme.error` to visually indicate a destructive action.
- **Z-Index**: `20`, ensuring it floats above the underlying sync list and the optional error detail modal (which is at `zIndex: 10`).
- **Dimensions**:
  - Responsive width based on terminal size:
    - Minimum (<80x24): 90% width
    - Standard (120x40): 50% width
    - Large (200x60+): 40% width
  - Fixed minimum width: 40 columns to prevent text clipping.
  - Height: Fixed to 7 rows (or auto-expanding up to a max depending on text wrapping, but baseline is ~7 rows).
- **Content Structure**:
  1.  **Title**: "Discard Conflict?" (Warning color, bold)
  2.  **Context**: 
      - Local ID (truncated to 12 chars with `…`)
      - Operation summary: HTTP Method (Primary color, bold) + API Path (wrapped if long)
  3.  **Error Preview**: Truncated to max 500 characters, colored in `theme.error`.
  4.  **Warning**: "This action is permanent and cannot be undone." (Muted color)
  5.  **Action Hints**: Bottom row aligned right or center.
      - `[Enter] confirm discard` (Error color, bold)
      - `[Esc] cancel` (Muted color)

### 2.2 Behavior & Input Handling
- **Focus Trap**: When mounted, the modal captures keyboard input.
- **Keybindings**:
  - `Enter`: Invokes the `onConfirm` callback.
  - `Esc`: Invokes the `onCancel` callback.
  - `Ctrl+C`: Bubbles up or handles standard application exit.
- **Rapid Input Guard**: To prevent accidental confirmation when users type rapidly (e.g., hitting `d` to discard and immediately hitting `Enter`), the modal should impose a brief render-tick guard (<50ms) before accepting the `Enter` keystroke.

## 3. Implementation Plan

### 3.1 File: `apps/tui/src/components/SyncDiscardConfirmModal.tsx`

1. **Imports**:
   - React hooks (`useState`, `useEffect`, `useCallback`)
   - OpenTUI layout primitives (`<box>`, `<text>`)
   - Internal hooks (`useTheme`, `useTerminalDimensions`, `useLayout`, `useKeyboard`)

2. **Component Interface**:
   ```typescript
   export interface SyncConflictItem {
     id: string; // local ID
     method: string;
     path: string;
     errorMessage?: string;
     timestamp: string;
   }

   export interface SyncDiscardConfirmModalProps {
     conflict: SyncConflictItem;
     visible: boolean;
     onConfirm: () => void;
     onCancel: () => void;
   }
   ```

3. **Responsive Sizing Logic**:
   - Utilize `useLayout()` or `useTerminalDimensions()` to determine the percentage width.
   - Calculate width: `Math.max(40, Math.floor(cols * widthPercentage))`.
   - Set height to `7` rows minimum, allowing content flex wrapping for `path` and `errorMessage`.

4. **Rapid Input Guard**:
   - Use a `mountedAt` timestamp via `Date.now()` when the component renders.
   - Inside the key handler for `Enter`, check if `Date.now() - mountedAt < 50`. If true, ignore the input.

5. **Keybinding Implementation**:
   - Use the `useKeyboard` hook scoped to this component when `visible === true`.
   - Prevent event propagation for handled keys to ensure the list behind it doesn't scroll.

6. **Render Tree**:
   ```tsx
   if (!visible) return null;

   return (
     <box
       position="absolute"
       top="center"
       left="center"
       width={computedWidth}
       height={computedHeight}
       border="single"
       borderColor={theme.error}
       flexDirection="column"
       paddingX={1}
       zIndex={20}
     >
       <text bold color={theme.warning}>Discard Conflict?</text>
       
       <box flexDirection="row" marginTop={1}>
         <text color={theme.muted}>{truncateId(conflict.id)} </text>
         <text bold color={theme.primary}>{conflict.method}</text>
         <text> </text>
         <text flexShrink={1}>{conflict.path}</text>
       </box>

       {conflict.errorMessage && (
         <box marginTop={1}>
           <text color={theme.error}>{truncateError(conflict.errorMessage)}</text>
         </box>
       )}

       <box marginTop={1}>
         <text color={theme.muted}>This action is permanent and cannot be undone.</text>
       </box>

       <box flexDirection="row" marginTop={1} justifyContent="flex-end" gap={2}>
         <text color={theme.muted}>[Esc] cancel</text>
         <text bold color={theme.error}>[Enter] confirm discard</text>
       </box>
     </box>
   );
   ```

## 4. Unit & Integration Tests

### 4.1 File: `e2e/tui/sync.test.ts`

1. **Snapshot Test: Rendering at different breakpoints**
   - **Setup**: Launch TUI, navigate to Sync screen, trigger discard on a conflict.
   - **Action**: Render at 80x24, 120x40, and 200x60.
   - **Assertion**: Validate snapshots match the expected layout, z-index overlays properly, and borders are colored correctly. Ensure width minimum of 40 columns is respected at small sizes.

2. **Interaction Test: Dismissal**
   - **Setup**: Trigger discard modal.
   - **Action**: Press `Esc`.
   - **Assertion**: Modal unmounts. `onCancel` is called. Sync conflict remains in the list.

3. **Interaction Test: Confirmation**
   - **Setup**: Trigger discard modal.
   - **Action**: Wait > 50ms, press `Enter`.
   - **Assertion**: Modal unmounts. `onConfirm` is called. Sync conflict is removed from the list optimistically (or triggers toast).

4. **Interaction Test: Rapid Input Guard**
   - **Setup**: Focus a conflict item.
   - **Action**: Rapidly simulate pressing `d` (to discard) and `Enter` within 10ms.
   - **Assertion**: Modal mounts, but the `Enter` keypress is ignored. Modal remains visible waiting for user confirmation.

5. **Truncation & Wrapping Tests**
   - **Setup**: Pass a conflict with a >500ch error message and a very long API path.
   - **Assertion**: Snapshot matches expected truncation (`...` for local ID, clipped error string, wrapped API path).