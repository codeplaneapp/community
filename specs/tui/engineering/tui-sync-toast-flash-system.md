# Engineering Specification: Toast and flash message system for sync screens

## 1. Overview
The Codeplane TUI requires a transient message system to provide users with immediate, non-blocking feedback during sync operations. This system consists of two distinct UI patterns:
1. **Toast messages**: Floating alerts displayed below the header bar, used for operation results (e.g., force sync success, conflict resolved).
2. **Flash messages**: Temporary status bar hint overrides, used for guard messages and brief informational feedback (e.g., 'Nothing to sync').

## 2. Architecture & Design

### 2.1 Toast System
- **State Management**: A local or context-based hook `useToast()` manages the toast state. The state holds the active message, its variant (success, warning, error), and handles automatic dismissal via `setTimeout`.
- **Component**: `<Toast />` renders an absolute positioned `<box>` at `zIndex={5}` directly below the top layout components. It adapts its text length based on the current terminal width.
- **Styling**: Uses the theme system for semantic colors (success: green 34, warning: yellow 178, error: red 196) and includes standard Unicode icons (✓, ⚠, ✗).

### 2.2 Flash System
- **State Management**: `useFlash()` manages a short-lived string state. 
- **Component**: `<Flash />` is a specialized `<text>` component that renders in italicized, muted colors. It replaces the standard keybinding hints in the `StatusBar` when active.
- **Styling**: Muted, italic text, strictly limited to 40 characters to prevent status bar overflow.

## 3. Implementation Plan

### Step 1: Implement `useToast` Hook
**File:** `apps/tui/src/hooks/useToast.ts`
- Define the `ToastVariant` type: `'success' | 'warning' | 'error'`.
- Define the `ToastState` interface: `{ message: string; variant: ToastVariant; id: number }`.
- Export `useToast` hook:
  - Initialize state: `const [activeToast, setActiveToast] = useState<ToastState | null>(null);`
  - Use `useRef<NodeJS.Timeout | null>(null)` to track the active timer.
  - Implement `showToast(message: string, variant: ToastVariant, duration = 5000)`:
    - Clear existing timer if one is active.
    - Set `activeToast` with a new unique ID (e.g., `Date.now()`).
    - Start a new `setTimeout` that calls `dismissToast` after `duration`.
  - Implement `dismissToast()`: clears the timer and sets `activeToast` to `null`.
  - Use a `useEffect` cleanup function to clear the timer on component unmount.
  - Return `{ showToast, dismissToast, activeToast }`.

### Step 2: Implement `<Toast>` Component
**File:** `apps/tui/src/components/Toast.tsx`
- Props: `toast: ToastState | null`.
- Hooks: `useTerminalDimensions()` from `@opentui/react`, `useTheme()` from `@codeplane/ui-core` (or equivalent theme context).
- Logic:
  - If `toast` is null, return `null`.
  - Calculate max width based on terminal width. Cap toast message at 80 characters minimum, truncating with `...` if it exceeds the available space.
  - Determine `color` and `icon` based on `toast.variant`:
    - `'success'`: color `theme.success`, icon `✓`
    - `'warning'`: color `theme.warning`, icon `⚠`
    - `'error'`: color `theme.error`, icon `✗`
- Render:
  - `<box position="absolute" top={1} left={0} width="100%" height={1} paddingX={1} zIndex={5}>`
  - Inner `<text fg={color}>{icon} {truncatedMessage}</text>`

### Step 3: Implement `useFlash` Hook
**File:** `apps/tui/src/hooks/useFlash.ts`
- Define `FlashState` interface: `{ message: string; id: number }`.
- Export `useFlash` hook:
  - Initialize state: `const [activeFlash, setActiveFlash] = useState<FlashState | null>(null);`
  - Use `useRef<NodeJS.Timeout | null>(null)` to track the active timer.
  - Implement `showFlash(message: string, duration = 2000)`:
    - Clear existing timer.
    - Set `activeFlash`.
    - Start a new `setTimeout` to clear `activeFlash` after `duration`.
  - Use a `useEffect` cleanup function to clear the timer on component unmount.
  - Return `{ showFlash, activeFlash }`.

### Step 4: Implement `<Flash>` Component
**File:** `apps/tui/src/components/Flash.tsx`
- Props: `message: string`.
- Hooks: `useTheme()`.
- Logic:
  - Truncate `message` to a maximum of 40 characters.
- Render:
  - `<text fg={theme.muted} italic={true}>{truncatedMessage}</text>`

## 4. Unit & Integration Tests

### Test 1: `useToast` Hook Mechanics
- **File:** `e2e/tui/sync.test.ts`
- **Behavior:**
  - Verify that invoking `showToast` updates `activeToast` immediately.
  - Verify that `activeToast` becomes `null` after the default 5-second duration.
  - Verify that calling `showToast` sequentially resets the timer, preventing premature dismissal.

### Test 2: `<Toast>` Component Rendering & Responsiveness
- **File:** `e2e/tui/sync.test.ts`
- **Behavior:**
  - Trigger a success toast and assert the presence of `✓` and ANSI color code for `success` (green 34).
  - Trigger a warning toast and assert `⚠` and ANSI color code for `warning` (yellow 178).
  - Trigger an error toast and assert `✗` and ANSI color code for `error` (red 196).
  - Use the resizing helper (`launchTUI({ cols: 80, rows: 24 })`) to verify that messages exceeding 80 characters are correctly truncated with `...`.
  - Assert that the toast is rendered at the correct position (line 1, just below header).

### Test 3: `useFlash` & `<Flash>` Integration
- **File:** `e2e/tui/sync.test.ts`
- **Behavior:**
  - Trigger `showFlash` with a message longer than 40 characters.
  - Assert that the rendered output in the status bar (bottom line) contains the truncated message with italic and muted ANSI codes.
  - Wait 2 seconds, and assert that the status bar returns to its original keybinding hint text.