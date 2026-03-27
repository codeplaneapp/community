# Implementation Plan: tui-sync-screen-scaffold

## 1. Scaffold Sync Screen Components

Create the `Sync` directory and placeholder components utilizing OpenTUI primitives.

**File:** `apps/tui/src/screens/Sync/SyncStatusScreen.tsx`
- Define and export a functional component `SyncStatusScreen`.
- Render a centered `<box>` containing a `<text>` element with the content `"Sync Status Screen Placeholder"`.
- Utilize the `useScreen` hook (or equivalent `BaseScreen` abstraction) to register the screen context and title.

**File:** `apps/tui/src/screens/Sync/SyncConflictList.tsx`
- Define and export a functional component `SyncConflictList`.
- Render a centered `<box>` containing a `<text>` element with the content `"Sync Conflict List Placeholder"`.

**File:** `apps/tui/src/screens/Sync/index.tsx`
- Re-export the components to simplify imports:
  ```typescript
  export { SyncStatusScreen } from './SyncStatusScreen';
  export { SyncConflictList } from './SyncConflictList';
  ```

## 2. Register Screens in Router

Integrate the new screens into the TUI's stack-based navigation system.

**File:** `apps/tui/src/router/types.ts`
- Update the `ScreenName` enum to replace `Sync` with the new specific screens:
  ```typescript
  SyncStatus = "SyncStatus",
  SyncConflicts = "SyncConflicts",
  ```

**File:** `apps/tui/src/router/registry.ts`
- Import `SyncStatusScreen` and `SyncConflictList` from `../screens/Sync/index.tsx`.
- Add the screens to the `screenRegistry` object:
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
- Update the `resolveScreenName` mapping logic to point to the new screens:
  - Map `"sync"` to `ScreenName.SyncStatus`.
  - Map `"sync-conflicts"` to `ScreenName.SyncConflicts`.

## 3. Wire Go-To Keybindings

Add global keybinding sequences to enable quick navigation.

**File:** `apps/tui/src/navigation/goToBindings.ts`
- Append entries for the sync screens to the `goToBindings` array:
  ```typescript
  { key: "y", screen: ScreenName.SyncStatus, requiresRepo: false, description: "Sync Status" },
  { key: "y c", screen: ScreenName.SyncConflicts, requiresRepo: false, description: "Sync Conflicts" }
  ```

## 4. Wire Command Palette

Make the screens accessible via fuzzy search in the command overlay.

**File:** `apps/tui/src/commands/registry.ts`
- Create the `apps/tui/src/commands/` directory and `registry.ts` file.
- Export a command registry array with actions to push the new screens:
  ```typescript
  export const commandRegistry = [
    {
      name: "Sync: Status",
      description: "View daemon sync status",
      action: (navigation) => navigation.push(ScreenName.SyncStatus)
    },
    {
      name: "Sync: Conflicts",
      description: "View daemon sync conflicts",
      action: (navigation) => navigation.push(ScreenName.SyncConflicts)
    }
  ];
  ```

## 5. E2E Tests

Write tests using `@microsoft/tui-test` to simulate terminal launches and verify correct rendering and behavior.

**File:** `e2e/tui/sync.test.ts`
- **Test: `g y` navigates to Sync Status screen**
  - Launch TUI (`launchTUI()`).
  - Send keys `g`, `y`.
  - Wait for text `"Sync Status Screen Placeholder"`.
  - Assert the breadcrumb header matches `/Dashboard.*›.*Sync Status/`.
  - Expect terminal snapshot to match golden snapshot (`toMatchSnapshot()`).

- **Test: `g y c` navigates to Sync Conflict List screen**
  - Launch TUI.
  - Send keys `g`, `y`, `c`.
  - Wait for text `"Sync Conflict List Placeholder"`.
  - Assert the breadcrumb header matches `/Dashboard.*›.*Sync Status.*›.*Conflicts/`.
  - Expect terminal snapshot to match golden snapshot.

- **Test: Command palette `:sync` navigates to Sync Status**
  - Launch TUI.
  - Send keys `:`, `s`, `y`, `n`, `c`, `Enter`.
  - Wait for text `"Sync Status Screen Placeholder"`.

- **Test: Command palette `:sync conflicts` navigates to Conflicts**
  - Launch TUI.
  - Send keys `:`, `s`, `y`, `n`, `c`, ` `, `c`, `o`, `n`, `f`, `Enter`.
  - Wait for text `"Sync Conflict List Placeholder"`.

- **Test: Deep link `--screen sync` pre-populates stack**
  - Launch TUI with arguments: `args: ['--screen', 'sync']`.
  - Wait for text `"Sync Status Screen Placeholder"`.
  - Press `q` to pop the current screen.
  - Assert the screen returns to the Dashboard.

- **Test: Deep link `--screen sync-conflicts` pre-populates stack**
  - Launch TUI with arguments: `args: ['--screen', 'sync-conflicts']`.
  - Wait for text `"Sync Conflict List Placeholder"`.
  - Press `q` to pop the current screen.
  - Assert the screen returns to the Dashboard (or intermediate stack based on routing config).