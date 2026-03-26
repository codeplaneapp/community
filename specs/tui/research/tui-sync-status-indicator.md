# Research: TUI Sync Status Indicator

## 1. Relevant Existing Code & Context

### `StatusBar` Component
**File:** `apps/tui/src/components/StatusBar.tsx`
- The current status bar uses a placeholder for the sync state: 
  ```tsx
  const syncState = "connected"; // placeholder
  const syncColor = theme[statusToToken(syncState)];
  const syncLabel = syncState === "connected" ? "synced" : syncState;
  ```
- **Action:** This placeholder logic should be removed and replaced with the new `<SyncStatusIndicator />` component.
- **Layout Context:** The status bar consists of three `box` sections within a `flexDirection="row"` layout with `justifyContent="space-between"`. The new indicator must be embedded in the center section with `flexShrink={0}`.

### Project Utilities Directory
- The engineering spec suggests creating `apps/tui/src/utils/env.ts` and `apps/tui/src/utils/time.ts`.
- **Correction:** The repository uses `apps/tui/src/util/` (singular), not `utils`. To maintain existing conventions, the new files should be created at:
  - `apps/tui/src/util/env.ts`
  - `apps/tui/src/util/time.ts`

### OpenTUI & Data Hooks
- **Animation (`useTimeline`):** OpenTUI exposes `useTimeline({ fps, active })` which should be used to cycle through the spinner sequence without triggering expensive component remounts.
- **Dimensions (`useTerminalDimensions`):** Available via `@opentui/react` to read the current `width` and determine if the view should be compact (`< 120`), standard (`120–199`), or large (`>= 200`).
- **Data (`useSyncState`, `useSSEConnectionState`):** These hooks must be imported from `@codeplane/ui-core`. They provide the necessary context: `{ status, conflictCount, lastSyncAt }` and `{ connected, backoffMs }`.

## 2. Implementation Strategy & Patterns

### Constants & Definitions
Define static frames and fallbacks globally to avoid re-allocation during renders:
```tsx
const UTF8_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ASCII_SPINNER = ["-", "\\", "|", "/"];
```

### State Derivation Logic
Map the state of `useSyncState` and `useSSEConnectionState` to a single derived `displayState` (`connected`, `syncing`, `conflict`, `disconnected`) inside the indicator.

```tsx
// Example derivation:
if (!sse.connected || !syncState || syncState.status === 'offline') return 'disconnected';
if (syncState.status === 'error' && syncState.conflictCount > 0) return 'conflict';
if (syncState.status === 'syncing') return 'syncing';
return 'connected';
```

### Responsive Layout Strategy
The component needs to react synchronously to width changes. Using `useTerminalDimensions().width`, return the specific layout block:

```tsx
const { width } = useTerminalDimensions();
const isCompact = width < 120;
const isLarge = width >= 200;

// Frame logic (active only if syncing)
const frame = useTimeline({ fps: 10, active: displayState === 'syncing' });
```

### Non-UTF-8 Fallback (`util/env.ts`)
A function like `detectUtf8()` should inspect `process.env.LANG` and `process.env.LC_ALL`. If they do not include "UTF-8" or "UTF8" (case-insensitive), the component should fallback to:
- Connected: `*` (from `●`)
- Conflict: `!` (from `▲`)
- Spinner: `ASCII_SPINNER`

### Relative Time formatting (`util/time.ts`)
The large breakpoint `200+` columns requires `synced {relative_time}`. A function like `relativeTime(timestamp)` should format timestamps into "Ns ago", "Nm ago", etc.

## 3. Recommended File Structure Additions
1. `apps/tui/src/util/env.ts` -> Exposes `isUtf8Supported()`.
2. `apps/tui/src/util/time.ts` -> Exposes `formatRelativeTime(date)`.
3. `apps/tui/src/components/SyncStatusIndicator.tsx` -> The main implementation.
4. `e2e/tui/sync.test.ts` -> Include E2E snapshot tests, responsive checks, and fallback scenarios.