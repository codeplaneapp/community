# Codebase Research: TUI Sync Conflict List

This document outlines the existing patterns, file structures, and data types necessary to implement the `tui-sync-conflict-list` feature.

## 1. Routing and Navigation

Screens in the TUI are managed by a centralized router system.

**Files to modify:**
- `apps/tui/src/router/types.ts`: Currently defines `ScreenName.Sync`. You will likely need to add `SyncConflicts = "SyncConflicts"` to the `ScreenName` enum.
- `apps/tui/src/router/registry.ts`: Register the new screen in the `screenRegistry` object, providing its `breadcrumbLabel: () => "Conflicts"`, `requiresRepo: false`, and `requiresOrg: false`.
- `apps/tui/src/hooks/useGlobalKeybindings.ts`: Contains the always-active global bindings. For `g y c` (go-to sync conflicts), you may need to update the `actions.onGoTo` logic or the global bindings mapper, depending on how sub-keys are handled.
- Deep linking (`--screen sync-conflicts`) is handled in `apps/tui/src/navigation/deepLinks.ts` (needs mapping to the new ScreenName).

## 2. Layout and Responsive Design

The TUI has strict responsive requirements based on terminal dimensions. 

**Pattern:**
Use the `useLayout()` hook (`apps/tui/src/hooks/useLayout.ts`) which recalculates synchronously on terminal resize.
```tsx
import { useLayout } from "../hooks/useLayout.js";

const { width, height, breakpoint, contentHeight } = useLayout();
```
- **Breakpoints**: The hook provides a `breakpoint` property (`"large"` for 200x60+, `"standard"` for 120x40, and `null` for minimum 80x24).
- Conditionally render or truncate the `error preview` and `full API path` columns based on the `breakpoint` value to fulfill the RESP-CL-001–017 test requirements.

## 3. Keybindings

Local screen keybindings are registered using `useScreenKeybindings()` (`apps/tui/src/hooks/useScreenKeybindings.ts`).

**Pattern:**
```tsx
import { useScreenKeybindings } from "../hooks/useScreenKeybindings.js";

useScreenKeybindings([
  { key: "j", description: "Navigate down", group: "Navigation", handler: moveDown },
  { key: "k", description: "Navigate up",   group: "Navigation", handler: moveUp },
  { key: "enter", description: "Open Detail", group: "Actions", handler: openDetail },
  { key: "d", description: "Discard", group: "Actions", handler: promptDiscard },
  { key: "X", description: "Bulk discard", group: "Actions", handler: promptBulkDiscard },
]);
```
This hook automatically pushes the scope on mount, pops on unmount, and registers status bar hints.

## 4. Theming and Colors

Colors MUST be applied via semantic tokens, never raw ANSI codes, from `apps/tui/src/theme/tokens.ts`.

**Relevant Tokens:**
- `theme.success` (Green 34): Use for "No Conflicts — All Clear ✓".
- `theme.warning` (Yellow 178): Use for `failed` items or pending states.
- `theme.error` (Red 196): Use for "Sync Conflicts (N)" and `conflict` queue items.
- `theme.muted` (Gray 245): Use for secondary metadata like the timestamp.

## 5. SDK Sync Queue Types

The fundamental data type for a conflict is defined in `packages/sdk/src/services/sync-queue.ts`.

**Type Definitions:**
```typescript
export type SyncQueueStatus = "pending" | "synced" | "conflict" | "failed";

export interface SyncQueueItem {
  id: string;
  method: string;
  path: string;
  body: unknown | null;
  localId: string | null;
  remoteId: string | null;
  status: SyncQueueStatus;
  errorMessage: string;
  createdAt: Date;
  syncedAt: Date | null;
}
```

## 6. Data Hooks (Client Side)

According to `specs/tui/engineering/tui-sync-data-hooks.md`, the TUI consumes these via `@codeplane/ui-core` wrapped hooks, which handle the 3s polling.

- `useSyncConflicts()`: Returns a `PaginatedResult<SyncQueueItem>` including `items` and `fetchMore()`.
- `useDaemonStatus()`: Returns daemon status metadata (used for global sync state).
- `useConflictResolve()`: Returns `{ resolve: (id, data) => Promise<void>, isResolving: (id) => boolean, error }`.
- `useConflictRetry()`: Returns `{ retry: (id) => Promise<void>, isRetrying: (id) => boolean, error }`.

Since `packages/ui-core` implementation hooks are in progress or stubbed (found inside `specs/tui/packages/ui-core/`), you should import them from `../hooks/` (e.g., `import { useSyncConflicts } from "../../hooks/useSyncConflicts.js"`) and mock/implement the local usage.

## 7. Component File Structure

Create the exact file structure specified in the engineering ticket:
- `apps/tui/src/screens/Sync/SyncConflictList.tsx`
- `apps/tui/src/screens/Sync/components/ConflictRow.tsx`
- `apps/tui/src/screens/Sync/components/ConflictSummaryBar.tsx`
- `apps/tui/src/screens/Sync/components/FilterToolbar.tsx`
- `apps/tui/src/screens/Sync/components/BulkConfirmModal.tsx`
- `apps/tui/src/screens/Sync/utils/parseResourceDescription.ts`

Use `<box>`, `<scrollbox>`, `<text>`, and `<input>` from `@opentui/react` to assemble these elements.