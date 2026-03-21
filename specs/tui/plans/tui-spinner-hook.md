# Implementation Plan: `tui-spinner-hook`

## Overview
Implement a canonical, shared `useSpinner` hook that provides a synchronized, performant braille or ASCII animation powered by OpenTUI's `Timeline` engine. This replaces duplicated `setInterval`-based spinner implementations.

## Step 1: Create the Canonical Spinner Hook
**File:** `apps/tui/src/hooks/useSpinner.ts`
- **Action:** Create a new file for the `useSpinner` hook.
- **Details:**
  - Define `BRAILLE_FRAMES` (10 frames) and `ASCII_FRAMES` (4 frames) constants.
  - Define `BRAILLE_INTERVAL_MS = 80` and `ASCII_INTERVAL_MS = 120`.
  - Import `isUnicodeSupported` from `../theme/detect.js`.
  - Create a module-scoped state object `{ frameIndex: 0 }` and an `activeCount` counter.
  - Implement a singleton OpenTUI `Timeline` that loops over the frames, mutating `frameIndex` in its `onUpdate` callback. Register it with `@opentui/core`'s `engine`.
  - Implement subscribe/emit logic for `useSyncExternalStore`.
  - Export the `useSpinner(active: boolean)` hook which calls `useSyncExternalStore` and manages the `activeCount` (starting/stopping the timeline) via a `useEffect`.

## Step 2: Export the Hook
**File:** `apps/tui/src/hooks/index.ts`
- **Action:** Add export for the new hook.
- **Details:**
  - Add `export { useSpinner, BRAILLE_FRAMES, ASCII_FRAMES, BRAILLE_INTERVAL_MS, ASCII_INTERVAL_MS } from "./useSpinner.js";`

## Step 3: Migrate `MessageBlock.tsx`
**File:** `apps/tui/src/screens/Agents/components/MessageBlock.tsx`
- **Action:** Replace inline spinner with canonical hook.
- **Details:**
  - Delete the inline `useSpinner` function, `BRAILLE_FRAMES`, and `SPINNER_INTERVAL_MS`.
  - Import `useSpinner` from `../../../hooks/useSpinner.js`.
  - Ensure the usage `const spinner = useSpinner(message.role === "assistant" && !!message.streaming);` remains functionally equivalent.

## Step 4: Migrate `useAgentStream.ts`
**File:** `apps/tui/src/hooks/useAgentStream.ts`
- **Action:** Replace inline `setInterval` logic with canonical hook.
- **Details:**
  - Delete `SPINNER_FRAMES` and `SPINNER_INTERVAL_MS`.
  - Delete the `useState` and `useEffect` blocks that manage the local `frameIndex` and interval.
  - Import `useSpinner` from `./useSpinner.js`.
  - Update to `const spinnerFrame = useSpinner(stream.streaming);`.

## Step 5: Write Unit Tests
**File:** `apps/tui/src/hooks/__tests__/useSpinner.test.ts`
- **Action:** Implement test coverage for the new hook.
- **Details:**
  - Test that `useSpinner(false)` returns `""`.
  - Test that `useSpinner(true)` returns a braille character (when unicode is supported).
  - Mock `isUnicodeSupported` to test the ASCII fallback (`TERM=dumb`).
  - Test synchronization: multiple renders with `active: true` should yield the same frame index at the same time.
  - Verify that the timeline is paused when `activeCount` drops to 0.

## Step 6: Validate E2E Tests
**Files:** `e2e/tui/agents.test.ts`
- **Action:** Verify that migration did not break existing agent stream snapshots.
- **Details:**
  - Run the `agents.test.ts` suite using `@microsoft/tui-test`.
  - Tests like `SNAP-STREAM-001`, `SNAP-STREAM-003`, and `SNAP-AGENT-LIST-008` exercise the replaced logic.
  - If snapshot differences occur strictly due to precise timing changes (since the new hook syncs globally and might align differently than isolated `setInterval`s), review and update the snapshots accordingly.