# TUI Workspace Create Form - Context Research Document

## 1. Directory Structure Context
The development environment is located under `specs/tui/`. The application and package structures are as follows:
- **TUI Application**: `specs/tui/apps/tui/src/` (screens, hooks, providers, lib)
- **UI Core Package**: `specs/tui/packages/ui-core/src/` (data hooks, API types, error handling)

## 2. Shared Data Hooks (`@codeplane/ui-core`)
Located in `specs/tui/packages/ui-core/src/hooks/workspaces/`.

### `useCreateWorkspace`
```typescript
// Signature
export function useCreateWorkspace(owner: string, repo: string): {
  mutate: (input: CreateWorkspaceRequest) => void; // Uses `useMutation` internally
  isLoading: boolean;
  error: Error | null; // Usually ApiError
}

// CreateWorkspaceRequest type
export interface CreateWorkspaceRequest {
  name: string;
  snapshot_id?: string;
}
```
*Note*: The mutation function takes the request payload directly and internally handles JSON stringification and API communication. It throws an `ApiError` on failure.

### `useWorkspaceSnapshots`
```typescript
// Signature
export function useWorkspaceSnapshots(
  owner: string,
  repo: string,
  options?: WorkspaceSnapshotsOptions
): {
  snapshots: WorkspaceSnapshot[];
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
}

// WorkspaceSnapshot type
export interface WorkspaceSnapshot {
  id: string;
  name: string;
  created_at: string;
  // ... other fields
}
```

## 3. TUI Hooks (`apps/tui/src/hooks/`)

### Navigation (`useNavigation.ts`)
- Returns an object providing `push`, `pop`, and `replace`.
- **Signatures**:
  - `pop()`: Pops the current screen off the stack.
  - `replace(screen: ScreenName, params: Record<string, string>)`: Replaces the current screen with another screen.
  - `repoContext` can be extracted or derived from the parameters.

### UI & Theme
- **`useTheme()`**: Returns `Readonly<ThemeTokens>` with properties like `theme.primary`, `theme.error`, `theme.muted`, `theme.border`.
- **`useSpinner(active: boolean)`**: Returns a single frame character of the spinner (`"⠋"`, `"⠙"`, etc.) or an empty string if inactive.
- **`useLayout()`**: Returns `{ width, height, breakpoint, contentHeight, sidebarVisible, ... }`.
- **`useResponsiveValue(values, fallback)`**: Accepts `{ minimum, standard, large }` and returns the responsive value based on the current breakpoint.
- **`useOverlay()`**: Exposes `openOverlay`. Used for the discard confirmation dialog:
  ```typescript
  openOverlay("confirm", {
    title: "Discard changes?",
    message: "Your workspace name and snapshot selection will be lost.",
    confirmLabel: "Discard",
    cancelLabel: "Keep editing",
    onConfirm: () => { ... }
  });
  ```

### Keybindings (`useScreenKeybindings.ts`)
- **Signature**: `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[])`
- Registers keybindings tied to the component lifecycle.
- `KeyHandler` requires `key`, `description`, `group`, `handler`, and optionally `when` (a boolean-returning guard function).

## 4. Application State & Telemetry

### Logging (`apps/tui/src/lib/logger.ts`)
- Exposes `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`.

### Telemetry (`apps/tui/src/lib/telemetry.ts`)
- Exposes `emit(name: string, properties: Record<string, string | number | boolean>)` for tracking user interactions.

### Error Types (`specs/tui/packages/ui-core/src/types/errors.ts`)
- `ApiError` class is thrown on API errors, featuring `status` (number), `detail` (string), and `fieldErrors` (array).

## 5. Screen Registry (`apps/tui/src/router/registry.ts`)
- Currently configures `WorkspaceCreate` with `requiresRepo: false`.
- **Action Item**: This must be updated to `requiresRepo: true` during implementation to align with the spec.
- Component must be mapped properly in the registry from `PlaceholderScreen` to `WorkspaceCreateScreen`.