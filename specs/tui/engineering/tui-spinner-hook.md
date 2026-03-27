# Engineering Specification: TUI Spinner Hook (tui-spinner-hook)

## Overview
This specification details the implementation of a shared `useSpinner` hook and an optional `SpinnerProvider` for the Codeplane TUI. The hook provides a standardized, animated loading indicator character (either Braille or ASCII) for use within `<text>` components. By centralizing the spinner logic and timeline management, we ensure visual consistency across the application and allow multiple spinners rendered simultaneously to be perfectly synchronized.

## Architecture & Design Considerations
- **Pure Hook**: The `useSpinner` hook will not render DOM or OpenTUI primitives directly. It simply returns the current frame (string) so the consuming component maintains full control over layout and color styling (e.g., `<text color="primary">{spinner}</text>`).
- **Synchronization**: A standard `useTimeline` call per spinner could result in out-of-sync frames if multiple spinners mount at different times. We will implement an optional `SpinnerContext` that acts as a global metronome. If a component is wrapped in `SpinnerProvider`, it uses the global tick; if not, it falls back to a local `useTimeline`.
- **Environment Detection**: The terminal's Unicode support will dictate the character set and frame rate. Braille characters (`⠋`, `⠙`, etc.) run at 80ms, while traditional ASCII (`|`, `/`, `-`, `\`) run at 120ms to avoid a visual blur.

## Implementation Plan

### 1. Create Environment Utility for Unicode Detection
**File**: `apps/tui/src/utils/env.ts` (Create if it doesn't exist)
- Add a helper function `isUnicodeSupported()` to detect if the terminal can render Braille characters cleanly.
- Logic: Check `process.env` for indicators of poor Unicode support. By default, assume true unless running on strict Windows `cmd.exe` without Windows Terminal (`WT_SESSION`) or specifically inside a degraded `TERM=linux` TTY.

### 2. Implement the Spinner Hook and Context
**File**: `apps/tui/src/hooks/useSpinner.tsx`
- Export `SpinnerContext`, `SpinnerProvider`, and `useSpinner`.
- Define the frame arrays at the module level.
- Implement `SpinnerProvider` to manage a global tick via `@opentui/react`'s `useTimeline`.
- Implement `useSpinner(active: boolean = true)`:
  - Return an empty string `""` if `active` is false.
  - Determine if we are using the global context or a local tick.
  - Calculate the current frame using the tick modulo the length of the frames array.

### 3. Integrate with AppShell
**File**: `apps/tui/src/components/AppShell.tsx`
- Wrap the main application content in `<SpinnerProvider>` so that all globally rendered spinners (e.g., in lists, detail views, and status bars) tick in unison.

## Unit & Integration Tests

**File**: `e2e/tui/spinner.test.ts`
Using `@microsoft/tui-test`, we will verify that the spinner hook correctly animates, respects the `active` toggle, and falls back to ASCII gracefully.