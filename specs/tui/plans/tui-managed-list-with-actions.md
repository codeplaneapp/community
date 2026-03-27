# Implementation Plan: ManagedList Component

## 1. Overview
Build the `ManagedList` component for the Codeplane TUI. This reusable component will standardize inline CRUD operations (Create, Read, Update, Delete) for list-based settings and organizations screens. It will provide a keyboard-first experience with optimistic updates, inline forms, confirmation prompts, and flash messages.

## 2. Implementation Steps

### Step 1: Scaffold Component Skeleton
- **File**: `apps/tui/src/components/ManagedList.tsx`
- **Action**: Create the file and define the generic `ManagedListProps<T>` interface.
- **Details**:
  - Import React hooks (`useState`, `useEffect`, `useCallback`).
  - Import OpenTUI primitives (`<box>`, `<scrollbox>`, `<text>`, `useKeyboard`) from `@opentui/react`.
  - Define the `ManagedListProps<T>` interface exactly as specified in the architecture section.
  - Export the `ManagedList` functional component shell.

### Step 2: Implement State Management and Action Handlers
- **File**: `apps/tui/src/components/ManagedList.tsx`
- **Action**: Add internal state for modes, selection, and optimistic updates.
- **Details**:
  - Define states:
    - `mode`: `'list' | 'add' | 'delete' | 'custom'` (default: `'list'`).
    - `inFlight`: `boolean` (default: `false`).
    - `optimisticItems`: `T[] | null` (default: `null`).
    - `flash`: `{ type: 'success' | 'error', message: string } | null` (default: `null`).
    - `selectedIndex`: `number` (default: `0`).
  - Implement a `runAction(promise: Promise<void>, successMsg: string, fallbackItems: T[])` utility function to handle async state:
    1. Set `inFlight` to `true`.
    2. Await the promise.
    3. On success: set success `flash`, reset `mode` to `'list'`, set `optimisticItems` to `null`.
    4. On error: set error `flash`, revert `optimisticItems` to `fallbackItems`.
    5. Set `inFlight` to `false`.
    6. Automatically clear the flash message after 3 seconds using `setTimeout`.

### Step 3: Implement Focus Management and Keybindings
- **File**: `apps/tui/src/components/ManagedList.tsx`
- **Action**: Handle keyboard navigation and mode transitions.
- **Details**:
  - Use `@opentui/react`'s `useKeyboard` hook to intercept keystrokes.
  - Guard all actions: if `inFlight` is true, ignore keystrokes.
  - **Navigation (`mode === 'list'`):**
    - `j` / `Down`: Increment `selectedIndex` (bounded by `currentItems.length - 1`).
    - `k` / `Up`: Decrement `selectedIndex` (bounded to `0`).
  - **Actions (`mode === 'list'`):**
    - `a` / `c`: If `renderAddForm` exists, set `mode` to `'add'`.
    - `d` / `x`: If `onDelete` exists and list is not empty, set `mode` to `'delete'`.
    - `p` / `v`: If `onCustomAction` exists, trigger it for the focused item.
  - **Cancellation:**
    - `Esc`: If `mode !== 'list'`, set `mode` to `'list'` and revert any `optimisticItems` if applicable.
  - Ensure `selectedIndex` stays within bounds when the list shrinks (e.g., after deletion).

### Step 4: Implement Rendering Logic
- **File**: `apps/tui/src/components/ManagedList.tsx`
- **Action**: Render the layout hierarchy (Flash, Add Form, Empty State, List).
- **Details**:
  - **Flash Banner**: Render at the top if `flash` is set (Green for success, Red for error).
  - **Add Form**: If `mode === 'add'`, render the `renderAddForm` prop. Pass it an `onSubmit` wrapper (that uses `runAction` and sets `optimisticItems` to include the new item) and an `onCancel` callback.
  - **Empty State**: If `currentItems.length === 0` and `mode !== 'add'`, render a centered `<box>` with the `emptyMessage` and a hint: `"Press 'a' to add a new {itemName}"`.
  - **Main List**: Use a `<scrollbox>` wrapping a `<box flexDirection="column">`. Map over `currentItems`.
    - For each item, call `renderItem(item, isFocused)`.
    - If `mode === 'delete'` and `isFocused`, render the `renderDeleteConfirm` block directly below the item. Pass it an `onConfirm` wrapper (uses `runAction` and filters out the deleted item from `optimisticItems`) and an `onCancel` callback.

### Step 5: Unit and Integration Tests
- **File**: `e2e/tui/managed-list.test.ts`
- **Action**: Write E2E tests using `@microsoft/tui-test`.
- **Details**:
  - **Setup**: Create a mock implementation of `ManagedList` with dummy `renderItem`, `renderAddForm`, and `renderDeleteConfirm` functions.
  - **Test Case 1 (Empty State)**: Mount with `[]`. Assert output contains `"Press 'a' to add a new"`.
  - **Test Case 2 (Inline Add)**: Press `a`. Assert form appears. Simulate submit. Assert item appears optimistically and success flash banner is rendered (`\x1b[32m`).
  - **Test Case 3 (Inline Delete)**: Navigate with `j`. Press `d`. Assert delete confirmation appears under the active item. Simulate confirm. Assert item disappears and focus shifts gracefully.
  - **Test Case 4 (Action Guards & Error Recovery)**: Mock a failing API call for delete. Press `d` and confirm. Assert keystrokes are ignored while waiting. Assert item reappears after failure and red error flash (`\x1b[31m`) is displayed.
  - **Test Case 5 (Cancellation)**: Press `a`. Press `Esc`. Assert form unmounts and mode returns to `'list'`.