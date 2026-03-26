# Research Document: TUI Force Sync Action

## 1. Existing Router and Screens

The TUI application defines its screens in `apps/tui/src/router/registry.ts` and `apps/tui/src/router/types.ts`.
- `ScreenName.Sync` is defined and currently mapped to a `PlaceholderScreen`.
- Implementation will involve creating `apps/tui/src/screens/Sync/SyncStatusScreen.tsx` and updating `registry.ts` to point to it instead of the placeholder.

## 2. OpenTUI Components and Hooks

- **UI Components:** The UI is constructed using intrinsic tags like `<box>` and `<text>`. No explicit imports are needed for these components (managed via JSX pragma). Example from `PlaceholderScreen.tsx`:
  ```tsx
  <box flexDirection="column" padding={1} width="100%" height="100%">
    <text bold>{entry.screen}</text>
  </box>
  ```
- **Hooks:** OpenTUI hooks must be imported directly from `@opentui/react`. Common patterns in the codebase show:
  ```tsx
  import { useKeyboard, useTerminalDimensions, useOnResize } from "@opentui/react";
  ```
  The spec explicitly mentions using `useTimeline(80)` from `@opentui/react` for the braille spinner (frames: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`).

## 3. Data Hooks Architecture (`@codeplane/ui-core`)

The `@codeplane/ui-core` package is currently located at `specs/tui/packages/ui-core/`. New hooks (e.g., `useSyncForce`, `useDaemonStatus`, `useSyncConflicts`) should be placed in a directory like `specs/tui/packages/ui-core/src/hooks/sync/` and exported from `specs/tui/packages/ui-core/src/index.ts`.

Existing mutation hooks (e.g., `useDeleteWorkspace.ts`) reveal the standard setup:
- Imports `useAPIClient` from `../../client/APIClientProvider.js` to extract `fetch`.
- Returns `{ mutate, isLoading, error }` (or similar).
- Implements an `AbortController` to handle timeouts.

```typescript
import { useState, useRef, useCallback, useEffect } from "react";
import { useAPIClient } from "../../client/APIClientProvider.js";
import { ApiError, HookError, NetworkError, parseResponseError } from "../../types/errors.js";

export function useSyncForce() {
  const { fetch } = useAPIClient();
  // Maintain state: error, loading counts, AbortControllers, etc.
  // ...
}
```

## 4. Implementation Details Mapping

Based on the specs, the required files and responsibilities are:
- **`specs/tui/packages/ui-core/src/hooks/sync/useSyncForce.ts`**:
  - Wraps `POST /api/daemon/sync`.
  - Supports passing an `AbortSignal` for the 30s timeout.
- **`apps/tui/src/screens/Sync/hooks/useForceSyncAction.ts`**:
  - Orchestrates the state (`isSyncing`, `toast`, `flashMessage`).
  - Handles the 2-second flash timeout and the 5-second toast timeout.
  - Reacts to `width` from `useTerminalDimensions()` to format the message differently at the 80x24 breakpoint.
- **`apps/tui/src/screens/Sync/SyncStatusScreen.tsx`**:
  - Binds the `S` (Shift+S) key via `useKeyboard((event) => { ... })`.
  - Leverages `<box>` and `<text>` to conditionally show the `◐ Syncing… {spinnerFrame}` and the toast notification based on `toast.type` (`success`, `warning`, `error`).
- **`e2e/tui/sync.test.ts`**:
  - New E2E file utilizing `@microsoft/tui-test`.
  - Test segments mapped to `SNAP-FORCE-*`, `KEY-FORCE-*`, `RESP-FORCE-*`, `INT-FORCE-*`, and `EDGE-FORCE-*`.