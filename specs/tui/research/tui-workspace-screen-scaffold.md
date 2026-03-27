# TUI Workspace Screen Scaffold: Codebase Research

Based on an inspection of the `apps/tui/` directory and related documentation, here are the comprehensive findings regarding the current state of the TUI workspace screen routing and navigation implementation. This research provides the context necessary for implementing the `tui-workspace-screen-scaffold` engineering specification.

## 1. TUI Architecture & OpenTUI Integration

- The Codeplane TUI is built using **React 19** and **OpenTUI**. 
- OpenTUI provides terminal-native layout primitives like `<box>`, `<scrollbox>`, `<text>`, and `<diff>` which are expected to be used exclusively instead of HTML elements.
- Navigation relies heavily on hooks such as `useNavigation()` and `useScreenKeybindings()` to manage the navigation stack and dispatch keyboard events appropriately across different active screens.

## 2. Navigation State and Providers

### `apps/tui/src/providers/NavigationProvider.tsx`
- The application uses a `NavigationProvider` component that wraps the TUI. It holds the screen navigation stack.
- Exposes methods `push()`, `pop()`, `replace()`, and `reset()`.
- **Current Gap**: The `push()` and `replace()` functions process the `params` before pushing an entry into the stack, but they currently lack any generalized format validation for those parameters (such as verifying that a `workspaceId` is a valid UUID). The `validateParams` utility needs to be injected here.

## 3. Deep Linking & Terminal CLI

### `apps/tui/src/lib/terminal.ts`
- `parseCLIArgs(argv)` processes arguments passed directly to the TUI (e.g., `--repo`, `--screen`).
- **Current Gap**: It lacks parsing logic for `--workspace` which is required for deep-linking into specific workspaces via `codeplane tui --screen workspace-detail --repo owner/repo --workspace <uuid>`.

### `apps/tui/src/navigation/deepLinks.ts`
- `buildInitialStack()` consumes CLI arguments and resolves them into initial navigation state.
- **Current Pattern**: Uses a hardcoded list of `requiresRepo` screen names (e.g., `ScreenName.RepoOverview`, `ScreenName.Issues`, etc.) to enforce repo context. 
- **Current Gap**: `WorkspaceDetail` and `WorkspaceCreate` are not included in this hardcoded `requiresRepo` list. Furthermore, per the specification, this logic should preferably be refactored to read directly from the `screenRegistry[screenName].requiresRepo` flag rather than maintaining a duplicate list.
- Deep link aliases for `workspace-detail` and `workspace-create` need to be mapped to their `ScreenName` equivalents.

## 4. Screen Registry

### `apps/tui/src/router/registry.ts`
- The registry maps `ScreenName` enums to `ScreenDefinition` metadata, which dictates routing behavior.
- **Current State for Workspaces**:
  - `Workspaces`: Registered with `requiresRepo: false` and mapped to `PlaceholderScreen`.
  - `WorkspaceDetail`: Registered with `requiresRepo: false` (Incorrect) and mapped to `PlaceholderScreen`. Breadcrumb simply outputs `"Workspace"`.
  - `WorkspaceCreate`: Registered with `requiresRepo: false` (Incorrect) and mapped to `PlaceholderScreen`.
- **Required Updates**:
  - Update `requiresRepo` flags for `WorkspaceDetail` and `WorkspaceCreate` to `true`.
  - Refactor their respective `breadcrumbLabel` functions to dynamically show truncated UUIDs/names or "New Workspace".
  - Swap out `PlaceholderScreen` for the new dedicated stubs (`WorkspaceListScreen`, `WorkspaceDetailScreen`, `WorkspaceCreateScreen`).

## 5. Screen Components

### Existing: `apps/tui/src/screens/PlaceholderScreen.tsx`
- A basic template rendering a `<box>` with flex-direction column. It lists the screen name and dumps the active parameters via `entry.params`. This is a clean structural pattern to reuse when authoring the new workspace stubs.

### Missing Stubs
- The directory `apps/tui/src/screens/Workspaces/` does not currently exist. 
- The three workspace-related stub components (`WorkspaceListScreen.tsx`, `WorkspaceDetailScreen.tsx`, and `WorkspaceCreateScreen.tsx`) along with their `index.ts` barrel export must be created.
- `apps/tui/src/screens/index.ts` currently exists but is essentially empty (`export {};`). It needs to re-export the newly created workspace stubs.

## 6. Keybindings

### `apps/tui/src/navigation/goToBindings.ts`
- Contains a `goToBindings` array mapping single-letter keys to destination screens.
- **Current State**: `{ key: "w", screen: ScreenName.Workspaces, requiresRepo: false, description: "Workspaces" }` is already defined correctly.
- **Observation**: `GlobalKeybindings.tsx` has a TODO for the `onGoTo` implementation. We only need to ensure the stubs handle their *screen-specific* keybindings using the `useScreenKeybindings` hook (e.g., `c` to create, `s`/`r` for suspend/resume).

## 7. Validation

### Missing File: `apps/tui/src/navigation/validateParams.ts`
- Does not currently exist.
- Needs to be implemented to validate UUIDs for `workspaceId` parameters inside the `push` and `replace` lifecycle hooks without crashing the TUI entirely (i.e. using `console.warn` safely).

## 8. E2E Testing

### `e2e/tui/workspaces.test.ts`
- Does not currently exist.
- E2E testing framework (`@microsoft/tui-test`) is in use across other areas like `app-shell.test.ts` and `agents.test.ts`. 
- A new suite is necessary for validating registry configurations, param validation, terminal navigation, deep linking, and verifying UI snapshots using OpenTUI's test runners.