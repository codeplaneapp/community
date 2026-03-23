# Engineering Specification: ManagedList Component

## 1. Objective
Build a reusable `ManagedList` component for the Codeplane TUI that standardizes inline CRUD (Create, Read, Update, Delete) patterns across settings and organization management screens. This component will extend the foundational `ScrollableList` to provide a consistent, keyboard-first experience for managing collections like Emails, SSH Keys, Personal Access Tokens, Connected Accounts, Members, and Teams.

## 2. Requirements
- **Inline Add Form**: Render an addition form immediately above the list when triggered.
- **Inline Delete/Revoke Prompts**: Render a confirmation prompt directly below the currently focused list row when a deletion action is triggered.
- **Keybinding Registration**: 
  - `a` or `c`: Trigger "Add/Create" mode.
  - `d` or `x`: Trigger "Delete/Remove" mode for the currently focused row.
  - `p` or `v`: Expose hooks for contextual actions (e.g., "make primary" or "view details").
  - `Esc`: Cancel the current inline action.
- **Action Guards**: Prevent double-submission while async actions are in-flight.
- **Empty State Rendering**: Display clear, formatted empty states with actionable keybinding hints (e.g., "Press 'a' to add a new SSH key").
- **Flash Messages**: Integrate with the existing toast/flash system (`tui-sync-toast-flash-system` dependency). Display green success confirmations for 3 seconds, or red error messages with a retry hint upon failure.
- **Optimistic Updates**: Optimistically add/remove items from the local view during async operations, reverting the state if the server request fails.
- **Focus Management**: Intelligently restore or shift the cursor focus after item addition (focus new item) or deletion (focus adjacent item).

## 3. Architecture & Design

The `ManagedList` component acts as a higher-order wrapper around the existing `<ScrollableList>` (or standard list iteration pattern). It intercepts list state, augments row rendering, and manages local modes.

### 3.1 Component Signature
```typescript
interface ManagedListProps<T> {
  items: T[];
  itemName: string; // e.g., "SSH Key"
  renderItem: (item: T, isFocused: boolean) => React.ReactNode;
  renderAddForm?: (onSubmit: (data: any) => Promise<void>, onCancel: () => void) => React.ReactNode;
  renderDeleteConfirm?: (item: T, onConfirm: () => Promise<void>, onCancel: () => void) => React.ReactNode;
  onDelete?: (item: T) => Promise<void>;
  onAdd?: (data: any) => Promise<void>;
  onCustomAction?: (action: string, item: T) => Promise<void>;
  emptyMessage?: string;
  keyExtractor: (item: T) => string;
}
```

### 3.2 State Machine
- `mode`: `'list' | 'add' | 'delete' | 'custom'`
- `inFlight`: `boolean` (true during async operations to disable inputs/keybindings)
- `optimisticItems`: `T[] | null` (shadow state to hold list mutations before server confirmation)
- `flash`: `{ type: 'success' | 'error', message: string } | null`

### 3.3 Layout Structure
```xml
<box flexDirection="column" height="100%">
  {/* Flash Message Banner */}
  {flash && <FlashBanner type={flash.type} message={flash.message} />}

  {/* Inline Add Form (Visible if mode === 'add') */}
  {mode === 'add' && renderAddForm(...)}

  {/* Main List Area */}
  {items.length === 0 && mode !== 'add' ? (
    <EmptyState message={emptyMessage} hint={`Press 'a' to add a new ${itemName}`} />
  ) : (
    <ScrollableList
      items={optimisticItems ?? items}
      renderItem={(item, isFocused) => (
        <box flexDirection="column">
          {renderItem(item, isFocused)}
          {/* Inline Delete Confirmation */}
          {mode === 'delete' && isFocused && renderDeleteConfirm(...)}
        </box>
      )}
    />
  )}
</box>
```

## 4. Implementation Plan

### Step 1: Create the Component Skeleton
- **File**: `apps/tui/src/components/ManagedList.tsx`
- Define the `ManagedListProps<T>` interface.
- Scaffold the basic React component utilizing `@opentui/core` components (`<box>`, `<text>`).

### Step 2: Implement State and Action Handlers
- **File**: `apps/tui/src/components/ManagedList.tsx`
- Implement `useState` for `mode` (`'list' | 'add' | 'delete'`), `inFlight`, and `flash`.
- Create the wrapper execution function `runAction(promise, successMsg)` that:
  1. Sets `inFlight = true`.
  2. Awaits the promise.
  3. On success: sets a success flash (cleared via `setTimeout` after 3s), resets `mode` to `'list'`.
  4. On error: catches the error, reverts optimistic state, and sets an error flash.
  5. Sets `inFlight = false`.

### Step 3: Implement Keybinding Integration
- **File**: `apps/tui/src/components/ManagedList.tsx`
- Use the TUI's keybinding provider/hook (e.g., `useScreenKeybindings` or local `useKeyboard`).
- Map standard keys:
  - `a` / `c` -> `setMode('add')` (only if `!inFlight` and `renderAddForm` is provided).
  - `d` / `x` -> `setMode('delete')` (only if `!inFlight`, list has items, and `onDelete` is provided).
  - `Esc` -> `setMode('list')` (cancel current inline action).
  - `p` / `v` -> trigger `onCustomAction`.

### Step 4: Augment `ScrollableList` Rendering
- **File**: `apps/tui/src/components/ManagedList.tsx`
- Pass the items to `ScrollableList`. If `optimisticItems` is set, prefer it over the prop `items`.
- Wrap the consumer's `renderItem` to append the `renderDeleteConfirm` block directly below the focused item when `mode === 'delete'`.

### Step 5: Focus Management and Empty States
- **File**: `apps/tui/src/components/ManagedList.tsx`
- Ensure that entering `add` mode shifts input focus to the form.
- Upon successful deletion, adjust the `ScrollableList` selected index so the cursor doesn't disappear if the last item is removed.
- Implement the `EmptyState` component fallback when `items.length === 0`.

## 5. Unit & Integration Tests

All tests will be implemented using `@microsoft/tui-test` to verify key sequences, snapshot renderings, and optimistic state reversions.

- **File**: `e2e/tui/managed-list.test.ts`

### Test Cases
1. **Empty State & Hint Rendering**:
   - Render a `ManagedList` with zero items.
   - **Assert**: Terminal buffer matches regex `/Press 'a' to add a new/`. Snapshot matches empty layout.
2. **Inline Add Workflow**:
   - Press `a`.
   - **Assert**: Inline add form renders above the list. Focus is trapped in the form.
   - Submit form.
   - **Assert**: Item is optimistically added to the list. Green success flash banner (`\x1b[32m`) appears containing the success message.
3. **Inline Delete Workflow**:
   - Navigate to the second item using `j`. Press `d`.
   - **Assert**: Inline confirmation prompt renders immediately below the second item.
   - Press `y` or `Enter` (depending on confirmation prompt design).
   - **Assert**: Item is removed. Focus gracefully shifts to the adjacent item.
4. **Action Guards & Error Recovery**:
   - Press `d` to delete, mock API to delay and then fail.
   - Try pressing `d` or `a` while in-flight.
   - **Assert**: Keypresses are ignored (action guard).
   - **Assert**: Upon mock failure, the optimistically removed item reappears. Red error flash banner (`\x1b[31m`) appears.
5. **Cancellation**:
   - Press `a` to open add form. Press `Esc`.
   - **Assert**: Add form unmounts, mode returns to `'list'`, focus returns to the list items.