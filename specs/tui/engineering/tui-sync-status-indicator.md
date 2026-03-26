# TUI_SYNC_STATUS_INDICATOR Engineering Specification

## High-Level User POV

The Sync Status Indicator is a compact, always-visible component embedded in the center section of the global status bar on every TUI screen. It provides ambient, at-a-glance awareness of the daemon's synchronization health — the developer never has to navigate to a dedicated screen to know whether their local changes are reaching the remote server.

The indicator presents one of four visual states. When the daemon is connected and idle, the user sees a small green dot (●) followed by the word "Connected". When the daemon is actively flushing queued operations to the remote, the dot is replaced by a spinning braille character (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) cycling at 100ms per frame in yellow, followed by "Syncing…". If the sync engine has encountered conflicts that require user attention, a yellow warning triangle (▲) appears followed by a count ("3 conflicts"). And when the SSE connection to the daemon drops or the daemon itself is unreachable, a red dot (●) with "Disconnected" appears, optionally appended with "(retry 4s)" to show the auto-reconnect backoff timer.

The indicator is purely informational — it captures no keyboard focus and the user never interacts with it directly. At small terminal sizes (80 columns), the indicator collapses to just the icon character — no text label — to conserve horizontal space. At standard widths (120+ columns), the full icon-plus-label renders. At large widths (200+ columns), additional context like the last sync timestamp ("synced 12s ago") appears alongside the label.

The spinner animation is smooth and lightweight. It uses OpenTUI's `useTimeline()` hook to advance frames without triggering layout reflows or allocating new strings. SSE-driven state changes propagate immediately — the user sees the indicator update within one render frame of the underlying state change.

## Acceptance Criteria

### Core rendering
- [ ] The Sync Status Indicator renders inside the center section of the global status bar on every TUI screen with no exceptions.
- [ ] The indicator renders as a single horizontal element: icon character + optional text label + optional timestamp.
- [ ] The indicator does not wrap to multiple lines regardless of content or terminal width.
- [ ] The indicator has `flexShrink={0}` — it is never compressed or hidden by adjacent status bar sections.
- [ ] The indicator uses the status bar's `surface` background color (ANSI 236) matching the rest of the bar.
- [ ] The indicator is horizontally centered between the left keybinding hints section and the right notification/help section.

### State: Connected (online)
- [ ] When the daemon sync status is `online`, the indicator renders a green dot character `●` (U+25CF) followed by the text "Connected".
- [ ] The dot and text use `success` semantic color (ANSI 34).
- [ ] No animation is active in this state.

### State: Syncing
- [ ] When the daemon sync status is `syncing`, the indicator renders a braille spinner character cycling through the sequence ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ at 100ms per frame.
- [ ] The spinner and "Syncing…" label text use `warning` semantic color (ANSI 178).
- [ ] The spinner animation is driven by `useTimeline()` from `@opentui/react`.
- [ ] The spinner runs only when `status === "syncing"` — the timer is inactive in other states.

### State: Conflicts
- [ ] When the daemon sync status is `error` and `conflictCount > 0`, the indicator renders a yellow warning triangle `▲` (U+25B2) followed by "{N} conflicts".
- [ ] The triangle and text use `warning` semantic color (ANSI 178).
- [ ] The conflict count is a live integer from `SyncState.conflictCount`.
- [ ] When `conflictCount` is exactly 1, the label reads "1 conflict" (singular). When > 99, "99+ conflicts".

### State: Disconnected (offline)
- [ ] When the daemon sync status is `offline`, or `error` with `conflictCount === 0`, the indicator renders a red dot `●` (U+25CF) followed by "Disconnected".
- [ ] The dot and text use `error` semantic color (ANSI 196).
- [ ] When auto-reconnection is in progress, the label appends " (retry {N}s)" where N is `Math.ceil(backoffMs / 1000)`.

### Responsive behavior
- [ ] At terminal widths 80–119 columns: icon character only, no text label, no timestamp.
- [ ] At terminal widths 120–199 columns: icon character + text label.
- [ ] At terminal widths 200+ columns: icon character + text label + " · {relative_time}".
- [ ] Terminal resize causes the indicator to re-evaluate its display mode synchronously within one render frame.

### Data integration & Non-UTF-8 fallback
- [ ] The indicator consumes `useSyncState()`, `useSSEConnectionState()`, `useTerminalDimensions()`, and `useTimeline()`.
- [ ] When `LANG` or `LC_ALL` does not contain "UTF-8", braille spinner characters are replaced with ASCII fallback cycle: `- \ | /`.
- [ ] Unicode dot `●` is replaced with `*` and triangle `▲` is replaced with `!` in non-UTF-8 mode.

## Implementation Plan

### 1. Utilities and Helpers
- **UTF-8 Detection:** Create or update `apps/tui/src/utils/env.ts` with a `detectUtf8()` function. This should check `process.env.LANG` and `process.env.LC_ALL` to determine if UTF-8 characters are supported.
- **Relative Time:** Create or update `apps/tui/src/utils/time.ts` with a `relativeTime(dateString)` function to handle the formatting logic for timestamps ("Ns ago", "Nm ago", "Nh ago", "Nd ago").

### 2. Component: `SyncStatusIndicator`
- **File Path:** `apps/tui/src/components/SyncStatusIndicator.tsx`
- **Imports:** 
  - `useTerminalDimensions`, `useTimeline` from `@opentui/react`.
  - `useSyncState`, `useSSEConnectionState` from `@codeplane/ui-core`.
  - `useTheme` from `../providers/ThemeProvider`.
- **Constants:** Define `SPINNER_FRAMES` and `ASCII_SPINNER` arrays globally to prevent re-allocation.
- **State Resolution Logic:**
  - Calculate derived state: `connected`, `syncing`, `conflict`, `disconnected` based on the mapping criteria.
  - E.g., if `!sseState?.connected || !syncState || syncState.status === 'offline'` -> `'disconnected'`.
- **Responsive Logic:**
  - Use `useTerminalDimensions()` to get the current `width`.
  - Map width to breakpoint constants: `< 120` (compact), `< 200` (standard), `>= 200` (large).
- **Animation Logic:**
  - Call `useTimeline({ fps: 10, active: displayState === 'syncing' })` to drive the spinner frame index.
- **Render Output:**
  - Use OpenTUI `<box flexDirection="row" flexShrink={0}>` for the wrapper.
  - Determine icon, color, and label strings based on derived state, UTF-8 mode, and breakpoint.
  - Conditionally render the label text and timestamp `<text>` elements based on the breakpoint.
  - Wrap the entire component logic in a lightweight Error Boundary returning a safe "Disconnected" fallback on hook failure.

### 3. Integration: `StatusBar`
- **File Path:** `apps/tui/src/components/StatusBar.tsx`
- **Changes:**
  - Import `SyncStatusIndicator`.
  - Locate the center section of the `StatusBar`'s flex layout.
  - Mount `<SyncStatusIndicator />` inside a `<box>` that has `flexShrink={0}`, `justifyContent="center"`, and `alignItems="center"`.

## Unit & Integration Tests

### 1. Component Unit Tests
- **File Path:** `apps/tui/src/components/SyncStatusIndicator.test.tsx` (if isolated component tests are standard, otherwise rely entirely on E2E testing).
- If implementing component tests: Mock the context providers (`useSyncState`, `useSSEConnectionState`, `useTerminalDimensions`, `useTheme`, `useTimeline`).
- Assert that `displayState` resolution correctly matches the required visual outputs (icon, color, text).
- Mock `process.env.LANG='C'` to verify the ASCII fallback values (`*`, `!`, `- \ | /`).

### 2. End-to-End Tests
- **File Path:** `e2e/tui/sync.test.ts`
- Implement the 49 test cases outlined in the Verification section using `@microsoft/tui-test`.
- **Snapshot Tests (SNAP-SI-001 to 016):**
  - Render TUI at specific dimensions (`{cols: 120, rows: 40}`). 
  - Mock daemon states (online, syncing, conflict=3, offline).
  - Assert the rendered status bar matches the snapshot.
- **Keyboard Tests (KEY-SI-001 to 006):**
  - Send keystrokes (`Tab`, `?`, `:`) to verify the indicator does not capture focus and is not obscured by layouts inappropriately.
- **Responsive Resize Tests (RESIZE-SI-001 to 007):**
  - Resize terminal window dynamically via test runner (`terminal.resize()`).
  - Assert the label is hidden at 80 cols and appears at 120 cols via regex matching on the last line buffer (`terminal.getLine(terminal.rows - 1)`).
- **Real-time Update Tests (RT-SI-001 to 009):**
  - Transition mocked daemon state while TUI is running.
  - Assert the indicator reflects the new state immediately without a full screen refresh.
- **Edge Case Tests (EDGE-SI-001 to 011):**
  - Test with no auth token, test with null/undefined sync states, and test with massive conflict counts (`conflictCount=5000`) ensuring the count caps at "99+" and the component doesn't crash.