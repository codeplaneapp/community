# Context Research: tui-sync-screen-scaffold

## 1. Scaffold Sync Screen Components
The directory `apps/tui/src/screens/Sync` needs to be created along with the required files (`SyncStatusScreen.tsx`, `SyncConflictList.tsx`, and `index.tsx`).

Currently, `apps/tui/src/screens/` has a `PlaceholderScreen.tsx` that acts as the default stub for registered screens, but the specification requires concrete OpenTUI component stubs using `<box>` and `<text>` primitives for the Sync UI.

## 2. Register Screens in Router
The routing layer in the TUI uses an enum and a registry object to map screens.

**File:** `apps/tui/src/router/types.ts`
- Currently, the `ScreenName` enum contains `Sync = "Sync"`.
- We need to modify this file to include `SyncStatus = "SyncStatus"` and `SyncConflicts = "SyncConflicts"`, replacing the existing `Sync` entry.

**File:** `apps/tui/src/router/registry.ts`
- The `screenRegistry` object currently maps `[ScreenName.Sync]` to `PlaceholderScreen`.
- We need to import the newly scaffolded components from `../screens/Sync/index.js` (or `.tsx`) and update the registry:
  ```typescript
  [ScreenName.SyncStatus]: {
    component: SyncStatusScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Sync Status",
  },
  [ScreenName.SyncConflicts]: {
    component: SyncConflictList,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Conflicts",
  },
  ```

**File:** `apps/tui/src/navigation/deepLinks.ts`
- Contains the `resolveScreenName` mapping logic.
- Currently maps `"sync": ScreenName.Sync`.
- This needs to be updated to map `"sync"` to `ScreenName.SyncStatus` and `"sync-conflicts"` to `ScreenName.SyncConflicts`.

## 3. Wire Go-To Keybindings
Global Go-To bindings are triggered after pressing `g`.

**File:** `apps/tui/src/navigation/goToBindings.ts`
- This file exports the `goToBindings` array (e.g. `{ key: "d", screen: ScreenName.Dashboard, ... }`).
- We need to append entries for the new sync screens:
  ```typescript
  { key: "y", screen: ScreenName.SyncStatus, requiresRepo: false, description: "Sync Status" },
  { key: "y c", screen: ScreenName.SyncConflicts, requiresRepo: false, description: "Sync Conflicts" }
  ```
*Note:* Existing bindings only use single letters. The `goToBindings` engine will need to handle or currently already handles multi-key sequences separated by spaces if `y c` is configured.

## 4. Wire Command Palette
The TUI's command palette is mostly stubbed at the moment (the directory `apps/tui/src/commands/` is completely empty).
- A grep search reveals a placeholder string in `apps/tui/src/components/OverlayLayer.tsx`: `[Command palette content — pending TUI_COMMAND_PALETTE implementation]`.

To satisfy the implementation spec:
**File:** `apps/tui/src/commands/registry.ts`
- We will need to create the `commands` directory and `registry.ts` file.
- In this file, we should export a registry/list of commands for `:sync` and `:sync conflicts` that accept a navigation context to execute `navigation.push(ScreenName.SyncStatus)` and `navigation.push(ScreenName.SyncConflicts)`.

## 5. E2E Tests
**File:** `e2e/tui/sync.test.ts`
- To be created using `@microsoft/tui-test`.
- Will contain the test scenarios outlined in the spec (launching TUI, sending `g y`, `g y c`, testing deep linking, testing command palette invocation, and asserting against breadcrumbs and golden snapshots).