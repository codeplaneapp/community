# Engineering Specification: tui-sync-screen-scaffold

## Implementation Plan

### 1. Scaffold Sync Screen Components
Create the directory structure and placeholder components for the Sync functionality using OpenTUI primitives.

**File:** `apps/tui/src/screens/Sync/SyncStatusScreen.tsx`
- Define and export a functional component `SyncStatusScreen`.
- Render a centered `<box>` containing a `<text>` element with the content `"Sync Status Screen Placeholder"`.
- Use the `useScreen` hook (or equivalent `BaseScreen` abstraction) to register the screen context and title if applicable.

**File:** `apps/tui/src/screens/Sync/SyncConflictList.tsx`
- Define and export a functional component `SyncConflictList`.
- Render a centered `<box>` containing a `<text>` element with the content `"Sync Conflict List Placeholder"`.

**File:** `apps/tui/src/screens/Sync/index.tsx`
- Re-export the components to simplify imports elsewhere:
  ```typescript
  export { SyncStatusScreen } from './SyncStatusScreen';
  export { SyncConflictList } from './SyncConflictList';
  ```

### 2. Register Screens in Router
Integrate the new screens into the TUI's stack-based navigation system.

**File:** `apps/tui/src/router/screens.ts`
- Import `SyncStatusScreen` and `SyncConflictList` from `../screens/Sync`.
- Extend the `ScreenName` type/enum to include `"SyncStatus"` and `"SyncConflicts"`.
- Add both screens to the `screenRegistry`:
  - `"SyncStatus"`: `{ component: SyncStatusScreen, requiresRepo: false }`
  - `"SyncConflicts"`: `{ component: SyncConflictList, requiresRepo: false }`
- Update the deep-link parsing logic (likely in `apps/tui/src/router/deepLink.ts` or similar router bootstrap file):
  - Map `--screen sync` to push `SyncStatus` with the breadcrumb `Dashboard > Sync Status`.
  - Map `--screen sync-conflicts` to push `SyncConflicts` with the breadcrumb `Dashboard > Sync Status > Conflicts`.
  - Ensure the stack prepopulates `Dashboard` underneath so `q` navigates back correctly.

### 3. Wire Go-To Keybindings
Add global keybinding sequences for quick navigation.

**File:** `apps/tui/src/bindings/goto.ts` (or where the global `KeybindingProvider` resolves the `g` prefix)
- Register `g y` to execute `navigation.push('SyncStatus')`.
- Register `g y c` to execute `navigation.push('SyncConflicts')`.
- Assign descriptive metadata (e.g., `"Go to Sync Status"`) for the help overlay (`?`).

### 4. Wire Command Palette
Make the screens accessible via fuzzy search in the command overlay.

**File:** `apps/tui/src/commands/registry.ts` (or the `commandRegistry` file)
- Register a new command for `:sync`:
  - Name: `"Sync: Status"`
  - Description: `"View daemon sync status"`
  - Action: `() => navigation.push('SyncStatus')`
- Register a new command for `:sync conflicts`:
  - Name: `"Sync: Conflicts"`
  - Description: `"View daemon sync conflicts"`
  - Action: `() => navigation.push('SyncConflicts')`

## Unit & Integration Tests

### E2E Tests
Tests will simulate terminal launches and keypress sequences to verify behavior against the real TUI application using `@microsoft/tui-test`.

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