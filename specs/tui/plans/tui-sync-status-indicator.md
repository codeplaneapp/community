# Implementation Plan: TUI Sync Status Indicator

This plan details the steps to implement the Sync Status Indicator for the Codeplane TUI, based on the engineering specification and research context.

## Step 1: Create Utility Functions

We need utilities for UTF-8 detection (to handle non-UTF-8 fallbacks) and relative time formatting (for the large terminal breakpoint).

**1.1. Create `apps/tui/src/util/env.ts`**
- Implement `isUtf8Supported()`.
- Check `process.env.LANG` and `process.env.LC_ALL` for case-insensitive matches of `utf-8` or `utf8`.

```typescript
// apps/tui/src/util/env.ts
export function isUtf8Supported(): boolean {
  const env = process.env;
  const lang = env.LANG || '';
  const lcAll = env.LC_ALL || '';
  const isUtf8 = (val: string) => /utf-?8/i.test(val);
  return isUtf8(lang) || isUtf8(lcAll);
}
```

**1.2. Create `apps/tui/src/util/time.ts`**
- Implement `formatRelativeTime(date: string | Date)` to return short relative time formats like "12s ago", "5m ago", "2h ago", "1d ago".

```typescript
// apps/tui/src/util/time.ts
export function formatRelativeTime(date: string | Date | undefined | null): string {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}
```

## Step 2: Implement `SyncStatusIndicator` Component

**File Path:** `apps/tui/src/components/SyncStatusIndicator.tsx`

- **Imports:**
  - `useTerminalDimensions`, `useTimeline` from `@opentui/react`
  - `useSyncState`, `useSSEConnectionState` from `@codeplane/ui-core`
  - `useTheme` from `../providers/ThemeProvider` (assuming this exists, or use OpenTUI's built-in colors if applicable, but standardizing on ANSI codes as per spec).
  - `isUtf8Supported` and `formatRelativeTime`.

- **Constants:**
  ```typescript
  const UTF8_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const ASCII_SPINNER = ["-", "\\", "|", "/"];
  const UTF8_DOT = "●";
  const ASCII_DOT = "*";
  const UTF8_TRIANGLE = "▲";
  const ASCII_TRIANGLE = "!";
  ```

- **Component Logic:**
  1. Detect UTF-8 support on mount.
  2. Fetch data: `syncState` and `sseState`.
  3. Determine `displayState`: `'connected'`, `'syncing'`, `'conflict'`, or `'disconnected'`.
     - `'disconnected'`: If `!sseState?.connected` or `syncState?.status === 'offline'`.
     - `'conflict'`: If `syncState?.status === 'error'` and `syncState?.conflictCount > 0`.
     - `'syncing'`: If `syncState?.status === 'syncing'`.
     - `'connected'`: Default fallback (online/idle).
  4. Get terminal dimensions: `const { width } = useTerminalDimensions();`
     - `isCompact`: `width < 120`
     - `isStandard`: `width >= 120 && width < 200`
     - `isLarge`: `width >= 200`
  5. Handle Animation: `const frame = useTimeline({ fps: 10, active: displayState === 'syncing' });`
  6. Render Output:
     - Base wrapper: `<box flexDirection="row" flexShrink={0} alignItems="center" gap={1}>`
     - Resolve Icon & Color based on state and UTF-8.
       - Connected: Green (34), Dot
       - Syncing: Yellow (178), Spinner at `frame % spinnerArray.length`
       - Conflict: Yellow (178), Triangle
       - Disconnected: Red (196), Dot
     - Resolve Label Text.
       - Connected: "Connected"
       - Syncing: "Syncing…"
       - Conflict: `1 conflict` or `99+ conflicts`
       - Disconnected: "Disconnected" + optional backoff timer.
     - Conditionally render label and timestamp based on `isCompact` and `isLarge`.

## Step 3: Integrate into `StatusBar`

**File Path:** `apps/tui/src/components/StatusBar.tsx`

- Import `<SyncStatusIndicator />`.
- Locate the center section of the `StatusBar` layout.
- Remove the hardcoded placeholder logic (`const syncState = "connected"; ...`).
- Replace with the new component wrapped in a layout container:
  ```tsx
  <box flexShrink={0} justifyContent="center" alignItems="center">
    <SyncStatusIndicator />
  </box>
  ```

## Step 4: End-to-End Tests

**File Path:** `e2e/tui/sync.test.ts`

- Use `@microsoft/tui-test` to build out test scenarios.
- **Dependencies:** Mock responses for `@codeplane/ui-core` hooks if using a mocked environment, or interact with the test daemon to trigger state changes.
- **Test Cases to Implement:**
  1. **Snapshots:** Render at 120x40. Mock states: online, syncing, conflict (count=3), offline.
  2. **Responsive:** Render at 80x24 (compact - icon only), 120x40 (standard - icon+label), 200x60 (large - icon+label+time).
  3. **Fallbacks:** Set `process.env.LANG='C'` and verify `*`, `!`, and ASCII spinner render correctly in snapshots.
  4. **Dynamic Update:** Start TUI in 'connected' state, emit 'syncing' event, assert terminal output updates to spinner and 'Syncing…'.
  5. **Conflict Counts:** Test count exactly 1, exactly 99, and >99 (e.g., 5000 caps at "99+").
  6. **Reconnection Timer:** Mock offline state with `backoffMs=4000` and assert "(retry 4s)" appears.
