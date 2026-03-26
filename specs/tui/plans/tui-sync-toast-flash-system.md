# Implementation Plan: Toast and Flash Message System

This document outlines the step-by-step implementation for adding the transient message system (Toasts and Flashes) to the Codeplane TUI, ensuring alignment with the engineering specifications, OpenTUI constraints, and existing utilities.

## Phase 1: Toast System Implementation

### Step 1: Create the Toast Context and Hook
**File:** `apps/tui/src/hooks/useToast.tsx`
(We will combine the context provider and the hook in one file for simplicity, standard for React 19).
- Define `ToastVariant` (`'success' | 'warning' | 'error'`) and `ToastState` (`{ message: string; variant: ToastVariant; id: number }`).
- Create `ToastContext` with `showToast` and `dismissToast` signatures.
- Export a `ToastProvider` component:
  - Use `useState<ToastState | null>(null)` for `activeToast`.
  - Use `useRef<NodeJS.Timeout | null>(null)` for the active timer.
  - Implement `showToast(message, variant, duration = 5000)`: clear existing timer, set new state with `Date.now()` ID, and start a new `setTimeout` calling `dismissToast`.
  - Implement `dismissToast()`: clear timer, set state to `null`.
  - Add `useEffect` cleanup to clear the timer on unmount.
- Export `useToast()` hook that consumes `ToastContext`.

### Step 2: Implement the `<Toast>` Component
**File:** `apps/tui/src/components/Toast.tsx`
- Import `useTerminalDimensions` from `@opentui/react`.
- Import `useTheme` from `apps/tui/src/hooks/useTheme.ts`.
- Import `truncateRight` from `apps/tui/src/util/text.ts`.
- Props: Accept `toast: ToastState | null`.
- Logic:
  - Return `null` if `toast` is null.
  - Calculate max width: `width - 4` (accounting for padding and icons).
  - Truncate the message: `truncateRight(toast.message, Math.max(80, maxWidth))`.
  - Map `toast.variant` to `color` (e.g., `theme.success`, `theme.warning`, `theme.error`) and `icon` (`✓`, `⚠`, `✗`).
- Render:
  - Use `<box position="absolute" top={1} left={0} width="100%" height={1} paddingX={1} zIndex={5}>`.
  - Render inner `<text fg={color}>{icon} {truncatedMessage}</text>`.

### Step 3: Integrate Toast Provider and Component
**File:** `apps/tui/src/components/AppShell.tsx` (or equivalent root layout component)
- Wrap the main layout in `<ToastProvider>`.
- Render the `<Toast>` component (consuming `useToast().activeToast`) directly below the Header component so it floats at `top={1}`.

## Phase 2: Flash System Implementation

### Step 4: Create the Flash Context and Hook
**File:** `apps/tui/src/hooks/useFlash.tsx`
- Define `FlashState` (`{ message: string; id: number }`).
- Create `FlashContext` with `showFlash` signature.
- Export a `FlashProvider` component:
  - Use `useState<FlashState | null>(null)` for `activeFlash`.
  - Use `useRef<NodeJS.Timeout | null>(null)` for the timer.
  - Implement `showFlash(message, duration = 2000)`: clear existing timer, set new state, and start `setTimeout` to clear it.
  - Add unmount cleanup for the timer.
- Export `useFlash()` hook that consumes `FlashContext`.

### Step 5: Implement the `<Flash>` Component
**File:** `apps/tui/src/components/Flash.tsx`
- Import `useTheme` and `truncateRight`.
- Props: Accept `message: string`.
- Logic: `const truncatedMessage = truncateRight(message, 40);`
- Render: `<text fg={theme.muted} italic={true}>{truncatedMessage}</text>`.

### Step 6: Integrate Flash into StatusBar
**File:** `apps/tui/src/components/StatusBar.tsx`
- Import `useFlash` hook.
- Update the left-most layout section:
  - Check `const { activeFlash } = useFlash();`.
  - If `activeFlash` is present, render `<Flash message={activeFlash.message} />`.
  - If `activeFlash` is null, render the standard `useStatusBarHints()` iteration as it currently does.

### Step 7: Integrate Flash Provider
**File:** `apps/tui/src/components/AppShell.tsx` (or equivalent root layout component)
- Wrap the main layout in `<FlashProvider>` (can be nested with `<ToastProvider>`).

## Phase 3: E2E Testing

### Step 8: Write Unit and Integration Tests
**File:** `e2e/tui/sync.test.ts`
- Create the new test file.
- Import `launchTUI` and testing helpers from `e2e/tui/helpers.ts`.
- **Test 1: Toast Mechanics & Rendering**
  - Render the TUI at `cols: 80, rows: 24`.
  - Trigger a success toast (e.g., mock a sync success action).
  - Assert screen output contains `✓` and ANSI color `34` (green).
  - Assert the message is on line 1.
  - Wait 5 seconds, assert the toast is removed.
- **Test 2: Toast Truncation**
  - Trigger a toast with a message > 80 characters.
  - Assert that the rendered output contains `…` (from `truncateRight`).
- **Test 3: Flash Integration in StatusBar**
  - Trigger a flash message (e.g., 'Nothing to sync').
  - Assert the status bar (bottom line) renders the flash message with italic ANSI codes.
  - Assert standard keybindings are hidden.
  - Wait 2 seconds, assert the flash is cleared and standard keybindings return.