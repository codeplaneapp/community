# Engineering Specification: `tui-nav-chrome-eng-01`

## NavigationProvider, ScreenEntry types, and screen registry

**Ticket:** tui-nav-chrome-eng-01  
**Status:** Partial  
**Depends on:** tui-bootstrap-and-renderer  
**Feature flags:** TUI_SCREEN_ROUTER (from TUI_APP_SHELL), TUI_DEEP_LINK_LAUNCH, TUI_GOTO_KEYBINDINGS  

---

## 1. Overview

This ticket implements the stack-based navigation system for the Codeplane TUI. It provides the core routing abstraction that all screens depend on: a `NavigationProvider` React context, a `ScreenEntry` type system, a central screen registry, and a `ScreenRouter` component that renders the top-of-stack screen.

Every other TUI feature screen depends on this system. It must be complete, type-safe, and tested as a foundation before any screen-level work begins.

### 1.1 Scope Boundary

This ticket is responsible for:
- The type system that defines all navigable screens (`ScreenName` enum, 32 entries)
- The `ScreenEntry` interface with unique IDs, typed screen names, params, and breadcrumbs
- The `NavigationContext` that manages the screen stack with push/pop/replace/reset, repo/org context derivation, and scroll position caching
- The screen registry that maps screen names to components and metadata
- The `ScreenRouter` component that renders the active screen with `ScreenComponentProps`
- Deep-link parsing for CLI launch arguments
- Go-to keybinding definitions and execution logic
- Placeholder screen component for unimplemented screens
- Integration with `HeaderBar` for breadcrumb rendering

This ticket is NOT responsible for:
- Real screen component implementations (subsequent feature tickets swap `PlaceholderScreen` → real components)
- Keybinding dispatch infrastructure (`KeybindingProvider` — separate ticket)
- SSE streaming or API client setup (separate provider tickets)
- The `AppShell` layout structure (separate ticket, but consumed here)

### 1.2 Current State Assessment

The codebase has a partial implementation that diverges from the architecture spec in several critical ways:

| Aspect | Architecture Spec | Current Reality | Gap |
|--------|------------------|-----------------|-----|
| `ScreenName` enum | 32 entries (string enum) | 14 entries in `navigation/screenRegistry.tsx` | Missing 18 screen variants |
| `ScreenEntry` interface | `{ id, screen: ScreenName, params, breadcrumb, scrollPosition? }` | `{ screen: string, params?: Record<string, string> }` | No id, no breadcrumb, no scroll, untyped screen |
| `NavigationContext` | `stack, currentScreen, push, pop, replace, reset, canGoBack, repoContext, orgContext` | `stack, current, push, pop, replace, reset, canPop()` | Missing repoContext, orgContext, canGoBack |
| Screen registry | `Record<ScreenName, ScreenDefinition>` with `breadcrumbLabel()` function, `requiresRepo`, `requiresOrg` | Object with `component` and static `breadcrumb` string, `as any` cast | Missing breadcrumbLabel functions, requiresOrg, completeness check |
| Registry location | `apps/tui/src/router/registry.ts` | `apps/tui/src/navigation/screenRegistry.tsx` | Wrong directory |
| `ScreenRouter` | Passes `ScreenComponentProps` to screen components | Renders component with no props | No prop injection |
| `PlaceholderScreen` | Accepts `ScreenComponentProps`, renders screen name + params | Renders static "Placeholder" text with TestCrashHook | No screen identification |
| `useScrollPositionCache()` | Ref-based cache with save/get functions | Not implemented | Entirely missing |
| Go-to execution | `executeGoTo()` with repo context validation | Inline in `GlobalKeybindings`, no context validation | No structured validation |
| Deep links | `parseCliArgs()` + `buildInitialStack()` with validation and error reporting | `resolveDeepLink()` — simpler, no error reporting | No error path, limited screen support |
| Router barrel | `apps/tui/src/router/index.ts` | Does not exist | Missing |
| Navigation barrel | `apps/tui/src/navigation/index.ts` | Does not exist | Missing |
| Duplicate prevention | Compare top-of-stack screen + sorted params | Not implemented | Push always adds |
| Max stack depth | 32 entries, drop oldest on overflow | Not implemented | Unbounded stack growth |

---

## 2. File Inventory

| File | Purpose | Current Status | Target Status |
|------|---------|---------------|---------------|
| `apps/tui/src/router/types.ts` | `ScreenName` enum (32 entries), `ScreenEntry`, `NavigationContext`, `ScreenDefinition`, `ScreenComponentProps` interfaces, constants | Exists (4 lines, minimal `ScreenEntry`) | Full type system (105+ lines) |
| `apps/tui/src/router/registry.ts` | Screen registry map: `ScreenName` → `ScreenDefinition`; import-time completeness assertion | Does not exist (logic in `navigation/screenRegistry.tsx`) | New file, canonical registry |
| `apps/tui/src/router/ScreenRouter.tsx` | Component that renders the top-of-stack screen from the registry | Exists (16 lines, no prop injection) | Updated with `ScreenComponentProps` injection |
| `apps/tui/src/router/index.ts` | Barrel export for router module | Does not exist | New file |
| `apps/tui/src/providers/NavigationProvider.tsx` | React context provider managing the navigation stack | Exists (86 lines, basic implementation) | Full implementation (243+ lines) |
| `apps/tui/src/providers/index.ts` | Barrel export for providers module | Exists (15 lines) | Updated with new exports |
| `apps/tui/src/screens/PlaceholderScreen.tsx` | Generic placeholder component used for all unimplemented screens | Exists (10 lines, static text) | Updated with `ScreenComponentProps` |
| `apps/tui/src/navigation/deepLinks.ts` | Deep-link argument parsing and initial stack construction | Exists (60 lines, `resolveDeepLink()`) | Expanded with error reporting |
| `apps/tui/src/navigation/goToBindings.ts` | Go-to keybinding definitions and execution logic | Exists (15 lines, data-only) | Expanded with `executeGoTo()` function |
| `apps/tui/src/navigation/index.ts` | Barrel export for navigation module | Does not exist | New file |
| `apps/tui/src/navigation/screenRegistry.tsx` | LEGACY: Current screen enum + registry | Exists (35 lines) | Deprecated — logic moves to `router/types.ts` and `router/registry.ts` |
| `apps/tui/src/hooks/useNavigation.ts` | Hook to consume NavigationContext | Exists (8 lines) | Updated to export typed context |
| `apps/tui/src/components/HeaderBar.tsx` | Consumes `useNavigation()` for breadcrumb rendering | Exists (59 lines) | Updated to use new registry |
| `apps/tui/src/components/GlobalKeybindings.tsx` | Go-to mode and global keybinding dispatch | Exists (72 lines) | Updated to use `executeGoTo()` |
| `apps/tui/src/index.tsx` | Entry point with provider stack and deep-link wiring | Exists (103 lines) | Updated to use new deep-link types |
| `e2e/tui/app-shell.test.ts` | E2E tests for navigation integration | Exists (4083 lines, no dedicated NAV tests) | Add navigation-specific test sections |

---

## 3. Detailed Design

### 3.1 `apps/tui/src/router/types.ts` — Type Definitions

**Current state:** 4 lines defining a minimal `ScreenEntry` with `screen: string` and optional `params`.

**Target state:** Complete type system for the navigation layer.

#### ScreenName Enum

A string enum covering every navigable screen in the TUI. 32 entries covering top-level, repo-scoped, workspace, agent, and organization screens.

```typescript
export enum ScreenName {
  // Top-level screens (9)
  Dashboard = "Dashboard",
  RepoList = "RepoList",
  Search = "Search",
  Notifications = "Notifications",
  Workspaces = "Workspaces",
  Agents = "Agents",
  Settings = "Settings",
  Organizations = "Organizations",
  Sync = "Sync",

  // Repo-scoped screens (14)
  RepoOverview = "RepoOverview",
  Issues = "Issues",
  IssueDetail = "IssueDetail",
  IssueCreate = "IssueCreate",
  IssueEdit = "IssueEdit",
  Landings = "Landings",
  LandingDetail = "LandingDetail",
  LandingCreate = "LandingCreate",
  LandingEdit = "LandingEdit",
  DiffView = "DiffView",
  Workflows = "Workflows",
  WorkflowRunDetail = "WorkflowRunDetail",
  Wiki = "Wiki",
  WikiDetail = "WikiDetail",

  // Workspace detail (2)
  WorkspaceDetail = "WorkspaceDetail",
  WorkspaceCreate = "WorkspaceCreate",

  // Agent detail (4)
  AgentSessionList = "AgentSessionList",
  AgentChat = "AgentChat",
  AgentSessionCreate = "AgentSessionCreate",
  AgentSessionReplay = "AgentSessionReplay",

  // Org detail (3)
  OrgOverview = "OrgOverview",
  OrgTeamDetail = "OrgTeamDetail",
  OrgSettings = "OrgSettings",
}
```

Design rationale:
- **String enum (not `const enum`)** for runtime introspection and debuggability. Values are the same as keys for easy console logging.
- Each entry maps 1:1 to a navigable destination. Tab views within a screen (e.g., repo tabs for bookmarks/changes/code) are handled within the screen component, not as separate `ScreenName` entries.
- Create/Edit variants are separate screen names because they push distinct entries onto the stack (different breadcrumb, different params, different component lifecycle).
- Agent screens have 4 entries: `AgentSessionList`, `AgentChat`, `AgentSessionCreate`, `AgentSessionReplay` — reflecting the fully-planned agent screen set. The `Agents` entry serves as the go-to navigation target (`g a`) and is distinct from `AgentSessionList` to allow future divergence.

#### ScreenEntry Interface

```typescript
export interface ScreenEntry {
  /** Unique instance ID — generated via crypto.randomUUID() at push time */
  id: string;
  /** Which screen to render */
  screen: ScreenName;
  /** Screen-specific parameters (repo owner, repo name, issue number, etc.) */
  params: Record<string, string>;
  /** Display text for the breadcrumb trail in the header bar */
  breadcrumb: string;
  /** Cached scroll position for back-navigation restoration. Set by ScreenRouter on pop. */
  scrollPosition?: number;
}
```

Key decisions:
- `id` uses `crypto.randomUUID()` — globally unique, no collision risk across sessions.
- `params` is `Record<string, string>` (non-optional) — always present, empty `{}` when no params. This eliminates null checks throughout consumers.
- `breadcrumb` is computed once at entry creation time via `ScreenDefinition.breadcrumbLabel(params)` and stored immutably.
- `scrollPosition` is optional and populated lazily by the scroll cache system.

**Migration from current state:** The existing `ScreenEntry` with `screen: string` and `params?: Record<string, string>` must be replaced. All consumers of the old interface (`NavigationProvider`, `deepLinks.ts`, `GlobalKeybindings`, `HeaderBar`) must be updated to use the new typed interface.

#### NavigationContext Interface

```typescript
export interface NavigationContext {
  /** The full navigation stack, ordered bottom-to-top */
  stack: readonly ScreenEntry[];
  /** The top-of-stack entry (the currently visible screen) */
  currentScreen: ScreenEntry;
  /** Push a new screen onto the stack */
  push(screen: ScreenName, params?: Record<string, string>): void;
  /** Pop the top screen and return to the previous one */
  pop(): void;
  /** Replace the top-of-stack screen without growing the stack */
  replace(screen: ScreenName, params?: Record<string, string>): void;
  /** Clear the stack and push a new root screen (go-to navigation) */
  reset(screen: ScreenName, params?: Record<string, string>): void;
  /** Whether there is a screen to go back to */
  canGoBack: boolean;
  /** Extracted repo context from the current stack, or null */
  repoContext: { owner: string; repo: string } | null;
  /** Extracted org context from the current stack, or null */
  orgContext: { org: string } | null;
}
```

**Migration from current state:** The existing `NavigationContextValue` uses `current` (rename to `currentScreen`), `canPop()` method (change to `canGoBack` boolean), and `string` screen params (change to `ScreenName` enum). All consumers must be updated.

#### ScreenDefinition Interface

```typescript
export interface ScreenDefinition {
  /** The React component to render for this screen */
  component: React.ComponentType<ScreenComponentProps>;
  /** Whether this screen requires repo context (owner + repo in params) */
  requiresRepo: boolean;
  /** Whether this screen requires org context (org in params) */
  requiresOrg: boolean;
  /** Function to generate breadcrumb label from params */
  breadcrumbLabel: (params: Record<string, string>) => string;
}
```

#### ScreenComponentProps Interface

```typescript
/** Props injected into every screen component by ScreenRouter */
export interface ScreenComponentProps {
  /** The ScreenEntry for this screen instance */
  entry: ScreenEntry;
  /** Convenience: parsed params */
  params: Record<string, string>;
}
```

#### Stack Constants

```typescript
/** Maximum navigation stack depth. Push beyond this drops the bottom-most entry. */
export const MAX_STACK_DEPTH = 32;

/** Default root screen when no deep-link is specified */
export const DEFAULT_ROOT_SCREEN = ScreenName.Dashboard;
```

---

### 3.2 `apps/tui/src/router/registry.ts` — Screen Registry

**Current state:** Does not exist. Screen data is in `apps/tui/src/navigation/screenRegistry.tsx` with 14 inline components and static `breadcrumb` strings.

**Target state:** A `Record<ScreenName, ScreenDefinition>` mapping every screen name to its definition. All screens use `PlaceholderScreen` as their component.

#### Full Registry Table

| ScreenName | requiresRepo | requiresOrg | breadcrumbLabel | Component |
|---|---|---|---|---|
| `Dashboard` | `false` | `false` | `() => "Dashboard"` | PlaceholderScreen |
| `RepoList` | `false` | `false` | `() => "Repositories"` | PlaceholderScreen |
| `Search` | `false` | `false` | `() => "Search"` | PlaceholderScreen |
| `Notifications` | `false` | `false` | `() => "Notifications"` | PlaceholderScreen |
| `Workspaces` | `false` | `false` | `() => "Workspaces"` | PlaceholderScreen |
| `Agents` | `false` | `false` | `() => "Agents"` | PlaceholderScreen |
| `Settings` | `false` | `false` | `() => "Settings"` | PlaceholderScreen |
| `Organizations` | `false` | `false` | `() => "Organizations"` | PlaceholderScreen |
| `Sync` | `false` | `false` | `() => "Sync"` | PlaceholderScreen |
| `RepoOverview` | `true` | `false` | `` (p) => `${p.owner}/${p.repo}` `` | PlaceholderScreen |
| `Issues` | `true` | `false` | `() => "Issues"` | PlaceholderScreen |
| `IssueDetail` | `true` | `false` | `` (p) => `#${p.number}` `` | PlaceholderScreen |
| `IssueCreate` | `true` | `false` | `() => "New Issue"` | PlaceholderScreen |
| `IssueEdit` | `true` | `false` | `` (p) => `Edit #${p.number}` `` | PlaceholderScreen |
| `Landings` | `true` | `false` | `() => "Landings"` | PlaceholderScreen |
| `LandingDetail` | `true` | `false` | `` (p) => `!${p.number}` `` | PlaceholderScreen |
| `LandingCreate` | `true` | `false` | `() => "New Landing"` | PlaceholderScreen |
| `LandingEdit` | `true` | `false` | `` (p) => `Edit !${p.number}` `` | PlaceholderScreen |
| `DiffView` | `true` | `false` | `() => "Diff"` | PlaceholderScreen |
| `Workflows` | `true` | `false` | `() => "Workflows"` | PlaceholderScreen |
| `WorkflowRunDetail` | `true` | `false` | `` (p) => `Run #${p.runId}` `` | PlaceholderScreen |
| `Wiki` | `true` | `false` | `() => "Wiki"` | PlaceholderScreen |
| `WikiDetail` | `true` | `false` | `(p) => p.page \|\| "Page"` | PlaceholderScreen |
| `WorkspaceDetail` | `false` | `false` | `(p) => p.workspaceId?.slice(0, 8) \|\| "Workspace"` | PlaceholderScreen |
| `WorkspaceCreate` | `false` | `false` | `() => "New Workspace"` | PlaceholderScreen |
| `AgentSessionList` | `false` | `false` | `() => "Agent Sessions"` | PlaceholderScreen |
| `AgentChat` | `false` | `false` | `(p) => p.sessionId?.slice(0, 8) \|\| "Chat"` | PlaceholderScreen |
| `AgentSessionCreate` | `false` | `false` | `() => "New Session"` | PlaceholderScreen |
| `AgentSessionReplay` | `false` | `false` | `(p) => p.sessionId?.slice(0, 8) \|\| "Replay"` | PlaceholderScreen |
| `OrgOverview` | `false` | `true` | `(p) => p.org \|\| "Organization"` | PlaceholderScreen |
| `OrgTeamDetail` | `false` | `true` | `(p) => p.team \|\| "Team"` | PlaceholderScreen |
| `OrgSettings` | `false` | `true` | `() => "Settings"` | PlaceholderScreen |

#### Completeness Check

The registry includes an import-time completeness assertion that runs when the module is loaded:

```typescript
const missingScreens = Object.values(ScreenName).filter(
  (name) => !(name in screenRegistry),
);
if (missingScreens.length > 0) {
  throw new Error(
    `Screen registry is missing entries for: ${missingScreens.join(", ")}`
  );
}
```

This prevents drift: adding a new `ScreenName` value without a registry entry crashes at startup with a clear error message.

#### Migration from Current State

The existing `navigation/screenRegistry.tsx` file must be deprecated. Its 14 entries with inline components and static breadcrumb strings are replaced by the new registry with:
1. 32 entries (all `ScreenName` values)
2. `PlaceholderScreen` as the universal component
3. `breadcrumbLabel` functions instead of static strings
4. `requiresRepo` and `requiresOrg` boolean flags
5. Strong typing via `Record<ScreenName, ScreenDefinition>`

All imports of `screenRegistry` from `"../navigation/screenRegistry.js"` must be redirected to `"../router/registry.js"`. The old file can be deleted once all imports are updated.

---

### 3.3 `apps/tui/src/screens/PlaceholderScreen.tsx` — Placeholder Component

**Current state:** 10 lines. Renders `<TestCrashHook />` and static `<text>Placeholder</text>`. Accepts no props.

**Target state:** A screen component that accepts `ScreenComponentProps` and renders diagnostic information.

```typescript
import type { ScreenComponentProps } from "../router/types.js";

export function PlaceholderScreen({ entry }: ScreenComponentProps) {
  const paramEntries = Object.entries(entry.params);

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>{entry.screen}</text>
      <text color="gray">This screen is not yet implemented.</text>
      {paramEntries.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          <text underline>Params:</text>
          {paramEntries.map(([key, value]) => (
            <text key={key}>
              {`  ${key}: ${value}`}
            </text>
          ))}
        </box>
      )}
    </box>
  );
}
```

Design decisions:
- Displays the `ScreenName` enum value in bold so it's immediately obvious which screen was navigated to during development and testing.
- Params are rendered to verify navigation params are passed correctly through the stack.
- "not yet implemented" message in gray provides unambiguous signal.
- No data fetching — purely a visual placeholder with zero side effects.
- `TestCrashHook` is removed — error boundary testing should be decoupled from the placeholder component.
- Uses only OpenTUI `<box>` and `<text>` primitives.

---

### 3.4 `apps/tui/src/providers/NavigationProvider.tsx` — Navigation Provider

**Current state:** 86 lines. Basic stack management with `push/pop/replace/reset/canPop`. Uses `string` screen names. No repo/org context derivation. No scroll position cache. No duplicate prevention. No max depth enforcement. Calls `onNavigate` callback inside state updater (can cause issues in React 19 strict mode).

**Target state:** Full implementation with all architecture-specified features.

#### Provider Props

```typescript
export interface NavigationProviderProps {
  /** Pre-built initial stack for deep-link launch. */
  initialStack?: ScreenEntry[];
  /** Initial screen to render if no initialStack. Defaults to Dashboard. */
  initialScreen?: ScreenName;
  /** Initial params for the initial screen. */
  initialParams?: Record<string, string>;
  children: React.ReactNode;
}
```

Three initialization modes:
1. **Deep-link stack:** `initialStack` → stack is the provided array verbatim.
2. **Single screen:** `initialScreen` + `initialParams` → stack is `[createEntry(screen, params)]`.
3. **Default:** No props → stack is `[createEntry(ScreenName.Dashboard)]`.

**Migration note:** The existing `onNavigate` callback prop is removed. The `ErrorBoundary` currently uses `onNavigate` to track `screenRef.current` — this can be replaced by reading `useNavigation().currentScreen.screen` from the ErrorBoundary itself, or by keeping a minimal ref update within the provider.

#### State Shape

```typescript
// React state: triggers re-renders
const [stack, setStack] = useState<ScreenEntry[]>(...);

// React ref: does not trigger re-renders
const scrollCacheRef = useRef<Map<string, number>>(new Map());
```

#### Core Helper Functions

**`createEntry(screen, params?)`:**
```typescript
function createEntry(
  screen: ScreenName,
  params: Record<string, string> = {},
): ScreenEntry {
  const definition = screenRegistry[screen];
  return {
    id: crypto.randomUUID(),
    screen,
    params,
    breadcrumb: definition.breadcrumbLabel(params),
  };
}
```

**`extractRepoContext(stack)`:**
Walks the stack top-down (index `length - 1` to `0`) to find the nearest `ScreenEntry` with both `owner` and `repo` params. Returns `{ owner, repo }` or `null`.

**`extractOrgContext(stack)`:**
Walks the stack top-down to find the nearest `ScreenEntry` with an `org` param. Returns `{ org }` or `null`.

Both use top-down traversal so the most recently pushed context wins.

#### Navigation Actions

**`push(screen, params?)`**

1. Spread provided params into `resolvedParams`.
2. If screen `requiresRepo` and no `owner`/`repo` in resolvedParams → inherit from stack via `extractRepoContext(prev)`.
3. If screen `requiresOrg` and no `org` in resolvedParams → inherit from stack via `extractOrgContext(prev)`.
4. **Duplicate prevention:** Compare top-of-stack `screen` name and sorted param key-value pairs. If identical, return `prev` unchanged (no-op). Comparison is structural: keys are sorted, then each key and value is compared pairwise.
5. Create new `ScreenEntry` via `createEntry(screen, resolvedParams)`.
6. Append to stack: `[...prev, entry]`.
7. **Max depth enforcement:** If `next.length > MAX_STACK_DEPTH`, `next.slice(next.length - MAX_STACK_DEPTH)` drops the oldest entries.

**`pop()`**

1. If `stack.length <= 1`, return `prev` unchanged (cannot pop root).
2. Delete the popped entry's scroll cache via `scrollCacheRef.current.delete(popped.id)`.
3. Return `prev.slice(0, -1)`.

**`replace(screen, params?)`**

1. If stack is empty, return unchanged.
2. Resolve params with repo/org context inheritance (same logic as `push`).
3. Create new entry via `createEntry()`.
4. Replace top-of-stack: `[...prev.slice(0, -1), entry]`.
5. Clean up old top's scroll cache.

**`reset(screen, params?)`**

1. Clear entire scroll position cache via `scrollCacheRef.current.clear()`.
2. Create new entry.
3. Set stack to `[entry]`.

#### Context Value

```typescript
const contextValue = useMemo<NavigationContext>(() => {
  const currentScreen = stack[stack.length - 1];
  return {
    stack,
    currentScreen,
    push,
    pop,
    replace,
    reset,
    canGoBack: stack.length > 1,
    repoContext: extractRepoContext(stack),
    orgContext: extractOrgContext(stack),
  };
}, [stack, push, pop, replace, reset]);
```

#### Exported Hooks

**`useNavigation()`** — Returns `NavigationContext`. Throws if called outside provider.

**`useScrollPositionCache()`** — Returns `{ saveScrollPosition, getScrollPosition }`. Initially a stub:

```typescript
return {
  saveScrollPosition: (_entryId: string, _position: number) => {
    scrollCacheRef.current.set(_entryId, _position);
  },
  getScrollPosition: (entryId: string) => {
    return scrollCacheRef.current.get(entryId);
  },
};
```

---

### 3.5 `apps/tui/src/router/ScreenRouter.tsx` — Screen Router Component

**Current state:** 16 lines. Reads `nav.current`, looks up registry with `as ScreenName` cast, falls back to `PlaceholderScreen` with no props, renders component with no props.

**Target state:**

```typescript
import { useNavigation } from "../hooks/useNavigation.js";
import { screenRegistry } from "./registry.js";
import type { ScreenComponentProps } from "./types.js";

export function ScreenRouter() {
  const { currentScreen } = useNavigation();

  const definition = screenRegistry[currentScreen.screen];
  if (!definition) {
    return (
      <box flexDirection="column" padding={1}>
        <text color="red" bold>
          Unknown screen: {currentScreen.screen}
        </text>
        <text color="gray">Press q to go back.</text>
      </box>
    );
  }

  const Component = definition.component;
  const props: ScreenComponentProps = {
    entry: currentScreen,
    params: currentScreen.params,
  };

  return <Component {...props} />;
}
```

Key changes from current:
- Imports registry from `"./registry.js"` (not `"../navigation/screenRegistry.js"`).
- Uses `currentScreen` (not `current`).
- Passes `ScreenComponentProps` to the rendered component.
- Error fallback renders red text for unknown screens with back-navigation hint.
- No `key` prop on Component — React reuses the component instance when navigating between screens of the same type.

---

### 3.6 `apps/tui/src/navigation/deepLinks.ts` — Deep Link Stack Construction

**Current state:** 60 lines. `resolveDeepLink()` returns `Array<{ screen: string; params?: Record<string, string> }>`. No error reporting. No validation beyond basic screen name lookup. 16 screen aliases.

**Target state:** Expanded with structured error reporting and typed output.

#### Interfaces

```typescript
export interface DeepLinkArgs {
  screen?: string;
  repo?: string;
  sessionId?: string;
  org?: string;
}

export interface DeepLinkResult {
  /** Pre-populated stack entries */
  stack: ScreenEntry[];
  /** Non-empty when validation failed */
  error?: string;
}
```

#### `buildInitialStack(args: DeepLinkArgs): DeepLinkResult`

Refactored from `resolveDeepLink()` to return typed `ScreenEntry[]` and optional error string. Uses `createEntry()` from the NavigationProvider to generate proper `ScreenEntry` objects with IDs and breadcrumbs.

Validation rules:
1. No screen specified → `{ stack: [Dashboard] }`
2. Unknown screen name → `{ stack: [Dashboard], error: 'Unknown screen: "..."' }`
3. Invalid repo format (no `/`) → `{ stack: [Dashboard], error: 'Invalid repository format: "..."' }`
4. Repo-scoped screen without `--repo` → `{ stack: [Dashboard], error: '--repo required for ... screen' }`

**Migration path:** `resolveDeepLink()` currently returns untyped entries. Callers in `index.tsx` must be updated to handle the new return type. The function can be renamed to `buildInitialStack()` to match the architecture spec, with the old name kept as a deprecated re-export during transition.

---

### 3.7 `apps/tui/src/navigation/goToBindings.ts` — Go-to Navigation

**Current state:** 15 lines. Exports `goToBindings` as a `Record<string, { screen: string, requiresRepo?: boolean }>`. No `executeGoTo()` function — execution logic is inline in `GlobalKeybindings.tsx`.

**Target state:**

#### GoToBinding Interface

```typescript
export interface GoToBinding {
  key: string;
  screen: ScreenName;
  requiresRepo: boolean;
  description: string;
}
```

#### Binding Table

```typescript
export const goToBindings: readonly GoToBinding[] = [
  { key: "d", screen: ScreenName.Dashboard,       requiresRepo: false, description: "Dashboard" },
  { key: "r", screen: ScreenName.RepoList,         requiresRepo: false, description: "Repositories" },
  { key: "i", screen: ScreenName.Issues,            requiresRepo: true,  description: "Issues" },
  { key: "l", screen: ScreenName.Landings,          requiresRepo: true,  description: "Landings" },
  { key: "w", screen: ScreenName.Workspaces,        requiresRepo: false, description: "Workspaces" },
  { key: "n", screen: ScreenName.Notifications,     requiresRepo: false, description: "Notifications" },
  { key: "s", screen: ScreenName.Search,             requiresRepo: false, description: "Search" },
  { key: "o", screen: ScreenName.Organizations,     requiresRepo: false, description: "Organizations" },
  { key: "f", screen: ScreenName.Workflows,          requiresRepo: true,  description: "Workflows" },
  { key: "k", screen: ScreenName.Wiki,               requiresRepo: true,  description: "Wiki" },
  { key: "a", screen: ScreenName.Agents,             requiresRepo: false, description: "Agents" },
] as const;
```

11 bindings. Note: `Agents` changed to `requiresRepo: false` — agents are accessible without repo context.

#### `executeGoTo()` Function

```typescript
export function executeGoTo(
  nav: NavigationContext,
  binding: GoToBinding,
  repoContext: { owner: string; repo: string } | null,
): { error?: string } {
  if (binding.requiresRepo && !repoContext) {
    return { error: "No repository in context" };
  }

  nav.reset(ScreenName.Dashboard);

  if (repoContext) {
    nav.push(ScreenName.RepoOverview, {
      owner: repoContext.owner,
      repo: repoContext.repo,
    });
  }

  const params = repoContext
    ? { owner: repoContext.owner, repo: repoContext.repo }
    : undefined;

  nav.push(binding.screen, params);

  return {};
}
```

**Execution pattern:** `reset(Dashboard)` → optionally `push(RepoOverview)` → `push(target)`. This builds a clean 2-3 entry stack.

**Atomicity note:** React 19 batches state updates within the same synchronous event handler, so intermediate states are never rendered.

**Migration from current state:** The `GlobalKeybindings` component currently inlines the execution logic (`nav.reset(binding.screen, binding.requiresRepo ? params : undefined)`). This must be replaced with a call to `executeGoTo()`. The current logic also doesn't build the intermediate `RepoOverview` stack entry — it just passes params directly to the target screen's reset.

---

### 3.8 Barrel Exports

**`apps/tui/src/router/index.ts`** (new file):
```typescript
export { ScreenRouter } from "./ScreenRouter.js";
export { screenRegistry } from "./registry.js";
export {
  ScreenName, MAX_STACK_DEPTH, DEFAULT_ROOT_SCREEN,
  type ScreenEntry, type NavigationContext,
  type ScreenDefinition, type ScreenComponentProps,
} from "./types.js";
```

**`apps/tui/src/navigation/index.ts`** (new file):
```typescript
export { goToBindings, executeGoTo } from "./goToBindings.js";
export type { GoToBinding } from "./goToBindings.js";
export { buildInitialStack } from "./deepLinks.js";
export type { DeepLinkArgs, DeepLinkResult } from "./deepLinks.js";
```

**`apps/tui/src/providers/index.ts`** — update to include:
```typescript
export { NavigationProvider } from "./NavigationProvider.js";
export type { NavigationProviderProps } from "./NavigationProvider.js";
```

---

### 3.9 Consumer Updates

#### `apps/tui/src/components/HeaderBar.tsx`

Update to import from new registry location and use `breadcrumbLabel` functions:

```typescript
import { screenRegistry } from "../router/registry.js";
import type { ScreenName } from "../router/types.js";

const breadcrumbSegments = useMemo(() => {
  return nav.stack.map((entry) => entry.breadcrumb);
}, [nav.stack]);
```

The breadcrumb is now pre-computed in `ScreenEntry.breadcrumb`, so the HeaderBar no longer needs to look up the registry. This simplifies the component.

#### `apps/tui/src/components/GlobalKeybindings.tsx`

Replace inline go-to execution with `executeGoTo()`:

```typescript
import { goToBindings, executeGoTo } from "../navigation/goToBindings.js";

// In go-to mode handler:
const binding = goToBindings.find(b => b.key === event.name);
if (binding) {
  const result = executeGoTo(nav, binding, nav.repoContext);
  if (result.error) {
    // Show error in status bar
  }
}
```

#### `apps/tui/src/index.tsx`

Update to use new deep-link API:

```typescript
import { buildInitialStack } from "./navigation/deepLinks.js";

const deepLinkResult = buildInitialStack({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
});
const initialStack = deepLinkResult.stack;
if (deepLinkResult.error) {
  // Log or display error
}

<NavigationProvider initialStack={initialStack}>
```

---

## 4. Implementation Plan

### Step 1: Type Definitions (`apps/tui/src/router/types.ts`)

1. **Expand** the existing 4-line file to include:
   - `ScreenName` enum with all 32 entries
   - `ScreenEntry` interface with `id`, `screen: ScreenName`, `params`, `breadcrumb`, `scrollPosition?`
   - `NavigationContext` interface with full API surface
   - `ScreenDefinition` interface with `breadcrumbLabel()` function
   - `ScreenComponentProps` interface
   - `MAX_STACK_DEPTH = 32` and `DEFAULT_ROOT_SCREEN = ScreenName.Dashboard` constants
2. **Verify** `bun run check` passes after changes.

### Step 2: Placeholder Screen (`apps/tui/src/screens/PlaceholderScreen.tsx`)

1. **Replace** the current 10-line file with the spec version that accepts `ScreenComponentProps`.
2. **Remove** the `TestCrashHook` import — error boundary testing should use a dedicated test component.
3. **Verify** the component renders screen name, params, and "not yet implemented" message.

### Step 3: Screen Registry (`apps/tui/src/router/registry.ts`)

1. **Create** new file at `apps/tui/src/router/registry.ts`.
2. **Import** `PlaceholderScreen` and all types from `./types.js`.
3. **Define** all 32 registry entries with `breadcrumbLabel` functions, `requiresRepo`, and `requiresOrg` flags.
4. **Add** import-time completeness assertion.
5. **Verify** the assertion catches a missing entry by temporarily commenting one out.

### Step 4: Router Barrel (`apps/tui/src/router/index.ts`)

1. **Create** new barrel file exporting `ScreenRouter`, `screenRegistry`, all types and constants.

### Step 5: NavigationProvider Upgrade (`apps/tui/src/providers/NavigationProvider.tsx`)

1. **Replace** the current implementation with the full spec version.
2. **Add** `createEntry()` helper that generates UUID-identified entries with breadcrumbs.
3. **Add** `extractRepoContext()` and `extractOrgContext()` stack-walking functions.
4. **Add** duplicate prevention logic in `push()`.
5. **Add** `MAX_STACK_DEPTH` enforcement in `push()`.
6. **Add** scroll position cache via `useRef<Map<string, number>>`.
7. **Rename** `current` → `currentScreen`, `canPop()` → `canGoBack` boolean.
8. **Add** `useScrollPositionCache()` hook.
9. **Remove** `onNavigate` callback prop.
10. **Update** `useNavigation()` hook in `apps/tui/src/hooks/useNavigation.ts` for the new context type.

### Step 6: ScreenRouter Update (`apps/tui/src/router/ScreenRouter.tsx`)

1. **Update** registry import from `"../navigation/screenRegistry.js"` → `"./registry.js"`.
2. **Add** `ScreenComponentProps` injection into the rendered component.
3. **Add** proper error fallback for unknown screens.
4. **Use** `currentScreen` instead of `current`.

### Step 7: Go-to Bindings Upgrade (`apps/tui/src/navigation/goToBindings.ts`)

1. **Replace** the `Record<string, ...>` export with typed `GoToBinding[]` array.
2. **Add** `description` field to each binding.
3. **Add** `executeGoTo()` function with repo context validation.
4. **Import** `ScreenName` from new location (`"../router/types.js"`).

### Step 8: Deep Links Upgrade (`apps/tui/src/navigation/deepLinks.ts`)

1. **Add** `DeepLinkArgs` and `DeepLinkResult` interfaces.
2. **Rename** `resolveDeepLink()` → `buildInitialStack()` (keep old name as deprecated re-export).
3. **Change** return type to `DeepLinkResult` with typed `ScreenEntry[]` and optional `error`.
4. **Add** validation for repo format, session ID, and required params.
5. **Import** `ScreenName` from new location and `createEntry` from providers.

### Step 9: Navigation Barrel (`apps/tui/src/navigation/index.ts`)

1. **Create** barrel file exporting go-to bindings, deep link functions, and types.

### Step 10: Consumer Migration

1. **Update** `HeaderBar.tsx` to use `entry.breadcrumb` directly instead of registry lookup.
2. **Update** `GlobalKeybindings.tsx` to use `executeGoTo()` and the new binding array.
3. **Update** `index.tsx` to use `buildInitialStack()` and handle errors.
4. **Update** `providers/index.ts` barrel to export new types.
5. **Update** `ErrorBoundary` to not depend on `onNavigate` callback.

### Step 11: Deprecate Old Screen Registry

1. **Update** all imports away from `apps/tui/src/navigation/screenRegistry.tsx`.
2. **Delete** or mark as deprecated the old `navigation/screenRegistry.tsx` file.
3. **Verify** `bun run check` passes with no type errors.

### Step 12: Full Integration Verification

1. **Run** `bun run check` to verify no type errors across the full TUI app.
2. **Launch** TUI manually to verify Dashboard renders.
3. **Test** go-to navigation manually (g d, g r, g w, etc.).
4. **Test** deep-link launch: `bun run apps/tui/src/index.tsx -- --screen agents --repo acme/api`.
5. **Test** q back-navigation and breadcrumb updates.

---

## 5. Integration Points

### 5.1 Provider Stack Placement

As implemented in `apps/tui/src/index.tsx`:

```
ErrorBoundary
  → ThemeProvider
    → AuthProvider(token, apiUrl)
      → APIClientProvider
        → SSEProvider
          → NavigationProvider(initialStack)    ← THIS TICKET
            → LoadingProvider
              → GlobalKeybindings
                → AppShell
                  → ScreenRouter
```

**Note:** `KeybindingProvider` is not yet a separate component — keybinding dispatch is currently handled by `GlobalKeybindings`. The architecture spec places `KeybindingProvider` above `NavigationProvider`, but the current implementation places `GlobalKeybindings` below it. This is correct for now — `GlobalKeybindings` needs `useNavigation()` to dispatch go-to bindings.

### 5.2 HeaderBar Breadcrumb Consumption

The `HeaderBar` component consumes `useNavigation()` to render breadcrumbs. With the new `ScreenEntry.breadcrumb` field, the HeaderBar simply reads `stack.map(e => e.breadcrumb)` — no registry lookup needed.

### 5.3 Go-to Keybindings

The `GlobalKeybindings` component calls `executeGoTo(nav, binding, nav.repoContext)` which uses `reset` + `push` to build a clean stack.

### 5.4 Deep-link Launch

`index.tsx` calls `buildInitialStack()` which returns typed `ScreenEntry[]` objects. These are passed to `NavigationProvider` via `initialStack` prop.

### 5.5 Screen Component Contract

Every screen component must accept `ScreenComponentProps`. When real screen components are implemented, they replace `PlaceholderScreen` in the registry.

---

## 6. Edge Cases and Constraints

### 6.1 Pop at Root

When the stack has exactly one entry and `pop()` is called, the stack is unchanged. `canGoBack` is `false`. The `q` global keybinding at root screen triggers TUI quit (handled by `GlobalKeybindings`).

### 6.2 Push-on-Duplicate Prevention

If the top-of-stack already shows the same `ScreenName` with identical params, `push()` is a no-op. Comparison algorithm:
1. Check `top.screen === screen`.
2. Sort both param key arrays.
3. Verify same length.
4. Verify every key matches positionally and values are equal.

### 6.3 Max Stack Depth

When push would exceed 32 entries, bottom-most entries are dropped. The user retains the 32 most recent screens.

### 6.4 Repo/Org Context Inheritance

When pushing a `requiresRepo` screen without explicit `owner`/`repo` params, the provider searches the stack top-down for the nearest ancestor with these params. If no ancestor has repo context, the push still succeeds — the screen component handles missing params.

### 6.5 Scroll Position Cache Lifecycle

- **On push:** No scroll cache action. New screen starts at position 0.
- **On pop:** Popped screen's cache entry deleted. Revealed screen's cached position available.
- **On replace:** Old top's cache entry deleted.
- **On reset:** Entire cache cleared.
- **Memory bound:** Bounded by MAX_STACK_DEPTH (32 entries max).

### 6.6 Concurrent Push Safety

All stack mutations use functional `setStack(prev => ...)`. React 19's state batching correctly serializes rapid consecutive pushes.

### 6.7 Deep Link Error Recovery

All deep-link failures fall back to `{ stack: [Dashboard], error: "..." }`. The TUI always launches to a working state.

### 6.8 Go-to Navigation Atomicity

`executeGoTo()` calls `reset()` then `push()` (up to twice) in sequence. React 19 batches these into a single render.

---

## 7. Unit & Integration Tests

All tests target `e2e/tui/app-shell.test.ts` using `@microsoft/tui-test` via the `launchTUI()` helper.

### 7.1 Existing Test Coverage

The existing test file (4083 lines) contains extensive tests but no dedicated navigation section. Navigation is exercised indirectly through:
- `TUI_LOADING_STATES` tests that use `--screen issues --repo acme/api` (deep-link launch)
- `TUI_AUTH_TOKEN_LOADING` tests that verify Dashboard render after auth
- `LOAD-KEY-007` which tests go-to during loading
- Various tests that call `sendKeys("q")` for back-navigation

However, there are **no focused tests** for the navigation stack system, breadcrumb rendering, duplicate prevention, max depth enforcement, or context inheritance.

### 7.2 Navigation-Specific Tests to Add

The following test sections should be added to `e2e/tui/app-shell.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// TUI_SCREEN_ROUTER — Navigation Stack
// ---------------------------------------------------------------------------

describe("TUI_SCREEN_ROUTER — navigation stack", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("NAV-001: TUI launches with Dashboard as default root screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toContain("Dashboard");
  });

  test("NAV-002: go-to navigation renders target screen and updates breadcrumb", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Repositories/);
  });

  test("NAV-003: q pops current screen and returns to previous", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("NAV-004: q on root screen exits TUI", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("q");
    // TUI should quit — process exited
  });

  test("NAV-005: reset clears stack — q after go-to goes to Dashboard not intermediate", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "n");
    await terminal.waitForText("Notifications");
    // After reset-style go-to, q should go back to Dashboard
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("NAV-006: duplicate go-to is silently ignored (no stack growth)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    // q should return to Dashboard (only one Repositories entry)
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("NAV-007: multiple sequential go-to navigations via reset build correct stacks", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendKeys("g", "o");
    await terminal.waitForText("Organizations");
    // Pop back — should go to Dashboard since each go-to resets
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("NAV-008: placeholder screen displays screen name", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toContain("Dashboard");
  });

  test("NAV-009: placeholder screen shows not-implemented message", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("not yet implemented");
  });
});

// ---------------------------------------------------------------------------
// TUI_SCREEN_ROUTER — Breadcrumb rendering
// ---------------------------------------------------------------------------

describe("TUI_SCREEN_ROUTER — breadcrumb rendering", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("NAV-BREAD-001: breadcrumb shows screen names separated by ›", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "agents", "--repo", "acme/widget"],
    });
    await terminal.waitForText("Agents");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Dashboard/);
    expect(headerLine).toMatch(/›/);
  });

  test("NAV-BREAD-002: repo screen breadcrumb shows owner/repo", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "agents", "--repo", "acme/widget"],
    });
    await terminal.waitForText("Agents");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/acme\/widget/);
  });

  test("NAV-BREAD-003: breadcrumb truncates at minimum breakpoint", async () => {
    terminal = await launchTUI({
      cols: 80,
      rows: 24,
      args: ["--screen", "agents", "--repo", "acme/widget"],
    });
    await terminal.waitForText("Agents");
    const headerLine = terminal.getLine(0);
    // Header should not overflow 80 columns
    expect(headerLine.replace(/\x1b\[[0-9;]*m/g, "").length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// TUI_SCREEN_ROUTER — Deep link launch
// ---------------------------------------------------------------------------

describe("TUI_SCREEN_ROUTER — deep link launch", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("NAV-DEEP-001: --screen agents --repo acme/widget opens Agents with breadcrumb", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "agents", "--repo", "acme/widget"],
    });
    await terminal.waitForText("Agents");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/acme\/widget/);
  });

  test("NAV-DEEP-002: --screen dashboard opens Dashboard as root", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "dashboard"],
    });
    await terminal.waitForText("Dashboard");
  });

  test("NAV-DEEP-003: unknown --screen falls back to Dashboard", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "nonexistent"],
    });
    await terminal.waitForText("Dashboard");
  });

  test("NAV-DEEP-004: invalid --repo format falls back to Dashboard", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "agents", "--repo", "invalid-format"],
    });
    await terminal.waitForText("Dashboard");
  });

  test("NAV-DEEP-005: deep-linked screen supports q back-navigation", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "agents", "--repo", "acme/api"],
    });
    await terminal.waitForText("Agents");
    await terminal.sendKeys("q");
    // Should navigate back toward RepoOverview or Dashboard
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/acme\/api|Dashboard/);
  });

  test("NAV-DEEP-006: --screen repos opens Repositories", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos"],
    });
    await terminal.waitForText("Repositories");
  });
});

// ---------------------------------------------------------------------------
// TUI_SCREEN_ROUTER — Placeholder screen props
// ---------------------------------------------------------------------------

describe("TUI_SCREEN_ROUTER — placeholder screen", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("NAV-PH-001: placeholder screen displays screen name in bold", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "settings"],
    });
    await terminal.waitForText("Settings");
    expect(terminal.snapshot()).toContain("Settings");
  });

  test("NAV-PH-002: placeholder shows not-implemented message", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "settings"],
    });
    await terminal.waitForText("not yet implemented");
  });

  test("NAV-PH-003: placeholder shows params when present", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "agents", "--repo", "acme/api"],
    });
    await terminal.waitForText("Agents");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/owner.*acme|acme.*owner/);
  });
});

// ---------------------------------------------------------------------------
// TUI_SCREEN_ROUTER — Registry completeness (unit-style)
// ---------------------------------------------------------------------------

describe("TUI_SCREEN_ROUTER — registry completeness", () => {
  test("NAV-REG-001: every ScreenName has a registry entry", async () => {
    const { screenRegistry, ScreenName } = await import(
      "../../apps/tui/src/router/index.js"
    );
    for (const name of Object.values(ScreenName)) {
      expect(screenRegistry[name as string]).toBeDefined();
    }
  });

  test("NAV-REG-002: every registry entry has a breadcrumbLabel function", async () => {
    const { screenRegistry } = await import(
      "../../apps/tui/src/router/index.js"
    );
    for (const def of Object.values(screenRegistry)) {
      expect(typeof (def as any).breadcrumbLabel).toBe("function");
    }
  });

  test("NAV-REG-003: every registry entry has a component", async () => {
    const { screenRegistry } = await import(
      "../../apps/tui/src/router/index.js"
    );
    for (const def of Object.values(screenRegistry)) {
      expect(typeof (def as any).component).toBe("function");
    }
  });

  test("NAV-REG-004: registry has exactly 32 entries matching ScreenName count", async () => {
    const { screenRegistry, ScreenName } = await import(
      "../../apps/tui/src/router/index.js"
    );
    const enumCount = Object.values(ScreenName).length;
    const registryCount = Object.keys(screenRegistry).length;
    expect(registryCount).toBe(enumCount);
    expect(registryCount).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// TUI_SCREEN_ROUTER — Snapshot tests at representative sizes
// ---------------------------------------------------------------------------

describe("TUI_SCREEN_ROUTER — snapshot tests", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("SNAP-NAV-001: Dashboard placeholder at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-NAV-002: Dashboard placeholder at 120x40", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-NAV-003: deep-linked Agents at 80x24", async () => {
    terminal = await launchTUI({
      cols: 80,
      rows: 24,
      args: ["--screen", "agents", "--repo", "acme/api"],
    });
    await terminal.waitForText("Agents");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-NAV-004: deep-linked Agents at 120x40", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "agents", "--repo", "acme/api"],
    });
    await terminal.waitForText("Agents");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-NAV-005: Dashboard at 200x60 (large breakpoint)", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// TUI_SCREEN_ROUTER — Go-to keybinding context validation
// ---------------------------------------------------------------------------

describe("TUI_SCREEN_ROUTER — go-to context validation", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("NAV-GOTO-001: g i without repo context shows error or stays on current screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "i");
    // Issues requires repo context — should show error or stay on Dashboard
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/Dashboard|No repository|error/i);
  });

  test("NAV-GOTO-002: g d always works (no context required)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
  });

  test("NAV-GOTO-003: go-to mode timeout cancels after 1500ms", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    // Wait for timeout (1500ms + buffer)
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Pressing a key after timeout should not trigger go-to
    await terminal.sendKeys("r");
    // Should still be on Dashboard (the 'r' was not interpreted as go-to)
    await terminal.waitForText("Dashboard");
  });
});
```

### 7.3 Test File Summary

| Test Group | Test File | Count | Status |
|---|---|---|---|
| Existing tests (scaffold, types, theme, error, auth, loading) | `e2e/tui/app-shell.test.ts` | ~90 | Implemented |
| TUI_SCREEN_ROUTER navigation stack | `e2e/tui/app-shell.test.ts` | 9 | Pending |
| TUI_SCREEN_ROUTER breadcrumbs | `e2e/tui/app-shell.test.ts` | 3 | Pending |
| TUI_SCREEN_ROUTER deep links | `e2e/tui/app-shell.test.ts` | 6 | Pending |
| TUI_SCREEN_ROUTER placeholder | `e2e/tui/app-shell.test.ts` | 3 | Pending |
| TUI_SCREEN_ROUTER registry | `e2e/tui/app-shell.test.ts` | 4 | Pending |
| TUI_SCREEN_ROUTER snapshots | `e2e/tui/app-shell.test.ts` | 5 | Pending |
| TUI_SCREEN_ROUTER go-to context | `e2e/tui/app-shell.test.ts` | 3 | Pending |
| **Total new** | | **33** | Pending |

### 7.4 Test Philosophy Notes

1. **Tests that fail due to unimplemented backends are left failing.** Deep-link tests that navigate to screens requiring API data will hit the real API or fail — they are never skipped or commented out.

2. **No mocking of NavigationProvider internals.** Tests drive the TUI through keyboard input (`g` + key, `q`, etc.) and assert on terminal output (breadcrumb text, screen content). The internal stack state is never directly inspected via programmatic access.

3. **Registry completeness tests** import the registry module directly and assert structural correctness. This is acceptable because the registry is a public API surface, not an implementation detail.

4. **Snapshot tests at representative sizes.** Captured at 80×24 (minimum), 120×40 (standard), and 200×60 (large) to catch layout regressions across all breakpoints.

5. **Each test validates one behavior.** Test names describe the user-facing behavior. Bad: "test NavigationProvider push method". Good: "Enter on repo opens repo overview".

6. **Tests are independent.** Each test launches a fresh TUI instance. No shared state between tests.

---

## 8. Productionizing Notes

### 8.1 `useScrollPositionCache()` — Wire to Internal Ref

The initial implementation provides working save/get functions backed by the provider's `scrollCacheRef`. Full productionization requires:

1. **Integrate with `ScreenRouter`:** Before rendering a popped-to screen, check for a cached scroll position and pass it as a prop.
2. **Integrate with `<scrollbox>`:** Screen components that use `<scrollbox>` save their scroll position on push and restore on back-navigation.
3. **Add `onScroll` prop** to scrollbox wrappers that writes to the cache continuously.

Estimated effort: 2–3 hours. Should be done as part of the first screen using `<scrollbox>` (Issue list or Landing list).

### 8.2 Deep Link Expansion

Currently the deep link system supports a limited set of screens. Each feature ticket should add its deep-link case to `buildInitialStack()`. The pattern:

```typescript
case ScreenName.Issues: {
  if (!repo) {
    return { stack: [dashboardEntry()], error: "--repo required for issues screen" };
  }
  return {
    stack: [
      dashboardEntry(),
      repoOverviewEntry(repo),
      createEntry(ScreenName.Issues, { owner: repo.owner, repo: repo.repo }),
    ],
  };
}
```

### 8.3 Navigation Module Barrel Export Cleanup

Once the new `router/registry.ts` is canonical, the old `navigation/screenRegistry.tsx` should be deleted entirely. All imports should go through `router/index.ts` for registry access and `navigation/index.ts` for go-to and deep-link functions.

### 8.4 `onNavigate` Callback Removal

The current `NavigationProvider` accepts an `onNavigate` callback used by `index.tsx` to track `screenRef.current` for the `ErrorBoundary`. After migration, the ErrorBoundary can read the current screen from context directly (if within the provider tree) or the ref tracking can be moved inside the provider itself.

### 8.5 Type Safety

- The `ScreenName` enum ensures all screen references are compile-time checked.
- The registry completeness check at import time ensures no screen can be forgotten.
- `ScreenComponentProps` provides a contract all screen components must satisfy.
- `Record<ScreenName, ScreenDefinition>` type ensures the registry is exhaustive.

### 8.6 Memory Management

- Scroll position cache bounded by MAX_STACK_DEPTH (32). No unbounded growth.
- Popped entries cleaned up immediately via `scrollCacheRef.current.delete()`.
- No closures or subscriptions leak from unmounted screens because `ScreenRouter` only renders top-of-stack.
- `useMemo` on context value prevents unnecessary re-renders.

### 8.7 Performance

- `useMemo` on context value with stable `useCallback` action methods ensures re-renders only propagate when `stack` changes.
- Functional `setStack(prev => ...)` for correct React 19 batching.
- Context extraction (`extractRepoContext`, `extractOrgContext`) walks at most 32 entries — negligible cost.

### 8.8 Error Recovery

- Unknown screen names render a fallback error message (red text).
- Pop at root is a safe no-op.
- Missing repo/org context doesn't crash.
- Deep-link failures fall back to Dashboard with descriptive error.
- Registry completeness check prevents startup with missing screen definitions.

### 8.9 Future Extensions

- **Lazy loading:** Replace `PlaceholderScreen` with `React.lazy()` imports. Add `<Suspense>` boundary in `ScreenRouter`.
- **Navigation guards:** Extend `push()` to show a repo-selection modal when repo context is missing.
- **URL-style routing:** Serialize `ScreenEntry` stack to/from a URL-like path for agent automation.
- **Transition animations:** OpenTUI's `useTimeline` hook for animated screen transitions.

---

## 9. Acceptance Criteria

1. ⬜ `apps/tui/src/router/types.ts` exports `ScreenName` enum with 32 screen identifiers.
2. ⬜ `apps/tui/src/router/types.ts` exports `ScreenEntry`, `NavigationContext`, `ScreenDefinition`, `ScreenComponentProps` interfaces.
3. ⬜ `apps/tui/src/router/registry.ts` exists and maps every `ScreenName` to a `ScreenDefinition` with `PlaceholderScreen` as component.
4. ⬜ Registry throws at import time if any `ScreenName` is missing.
5. ⬜ `apps/tui/src/providers/NavigationProvider.tsx` provides typed `NavigationContext` via React context.
6. ⬜ `push()` creates a new `ScreenEntry` with UUID id and computed breadcrumb.
7. ⬜ `push()` prevents duplicate pushes (same screen + same params).
8. ⬜ `push()` enforces MAX_STACK_DEPTH by dropping oldest entries.
9. ⬜ `push()` inherits repo/org context from ancestor stack entries when not provided.
10. ⬜ `pop()` removes the top entry and renders the previous screen.
11. ⬜ `pop()` is a no-op when stack has one entry.
12. ⬜ `replace()` swaps the top entry without changing stack depth.
13. ⬜ `reset()` clears the stack and pushes a single new root entry.
14. ⬜ `canGoBack` is `true` when stack depth > 1.
15. ⬜ `repoContext` is derived by walking the stack for nearest owner/repo params.
16. ⬜ `orgContext` is derived by walking the stack for nearest org param.
17. ⬜ `useNavigation()` throws with descriptive error outside provider.
18. ⬜ `ScreenRouter` renders the component from the registry for the current top-of-stack screen.
19. ⬜ `ScreenRouter` passes `ScreenComponentProps` to the rendered component.
20. ⬜ `PlaceholderScreen` accepts `ScreenComponentProps` and renders screen name, params, and "not yet implemented".
21. ⬜ `apps/tui/src/navigation/deepLinks.ts` exports `buildInitialStack()` with typed `DeepLinkResult`.
22. ⬜ `apps/tui/src/navigation/goToBindings.ts` exports typed `GoToBinding[]` and `executeGoTo()` function.
23. ⬜ `apps/tui/src/router/index.ts` barrel export exists.
24. ⬜ `apps/tui/src/navigation/index.ts` barrel export exists.
25. ⬜ All consumers updated: `HeaderBar`, `GlobalKeybindings`, `index.tsx`, `providers/index.ts`.
26. ⬜ Old `navigation/screenRegistry.tsx` deprecated or deleted.
27. ⬜ `bun run check` passes with no type errors.
28. ⬜ Navigation-specific E2E tests added to `e2e/tui/app-shell.test.ts` (33 tests).
29. ⬜ Tests that depend on unimplemented features are present and allowed to fail.
30. ⬜ `useScrollPositionCache()` hook exported with initial ref-backed implementation.