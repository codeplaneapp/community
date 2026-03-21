# Engineering Specification: `tui-nav-chrome-eng-01`

## NavigationProvider, ScreenEntry types, and screen registry

**Ticket:** tui-nav-chrome-eng-01  
**Status:** Implemented  
**Depends on:** tui-bootstrap-and-renderer  
**Feature flags:** TUI_SCREEN_ROUTER (from TUI_APP_SHELL), TUI_DEEP_LINK_LAUNCH, TUI_GOTO_KEYBINDINGS  

---

## 1. Overview

This ticket implements the stack-based navigation system for the Codeplane TUI. It provides the core routing abstraction that all screens depend on: a `NavigationProvider` React context, a `ScreenEntry` type system, a central screen registry, and a `ScreenRouter` component that renders the top-of-stack screen.

Every other TUI feature screen depends on this system. It is complete, type-safe, and tested as a foundation before any screen-level work begins.

### 1.1 Scope Boundary

This ticket is responsible for:
- The type system that defines all navigable screens (`ScreenName` enum, 32 entries)
- The navigation context that manages the screen stack
- The screen registry that maps screen names to components and metadata
- The `ScreenRouter` component that renders the active screen
- Deep-link parsing for CLI launch arguments
- Go-to keybinding definitions and execution logic
- Placeholder screen component for unimplemented screens
- Integration with `HeaderBar` for breadcrumb rendering

This ticket is NOT responsible for:
- Real screen component implementations (subsequent feature tickets swap `PlaceholderScreen` → real components)
- Keybinding dispatch infrastructure (`KeybindingProvider` — separate ticket)
- SSE streaming or API client setup (separate provider tickets)
- The `AppShell` layout structure (separate ticket, but consumed here)

---

## 2. File Inventory

| File | Purpose | Status | Lines |
|------|---------|--------|-------|
| `apps/tui/src/router/types.ts` | `ScreenName` enum (32 entries), `ScreenEntry`, `NavigationContext`, `ScreenDefinition`, `ScreenComponentProps` interfaces, constants | Implemented | 105 |
| `apps/tui/src/router/registry.ts` | Screen registry map: `ScreenName` → `ScreenDefinition`; import-time completeness assertion | Implemented | 217 |
| `apps/tui/src/router/ScreenRouter.tsx` | Component that renders the top-of-stack screen from the registry | Implemented | 31 |
| `apps/tui/src/router/index.ts` | Barrel export for router module | Implemented | 12 |
| `apps/tui/src/providers/NavigationProvider.tsx` | React context provider managing the navigation stack, push/pop/replace/reset, context inheritance | Implemented | 243 |
| `apps/tui/src/providers/index.ts` | Barrel export for providers module (includes NavigationProvider + all other providers) | Implemented | 14 |
| `apps/tui/src/screens/PlaceholderScreen.tsx` | Generic placeholder component used for all unimplemented screens | Implemented | 24 |
| `apps/tui/src/navigation/deepLinks.ts` | Deep-link argument parsing and initial stack construction | Implemented | 227 |
| `apps/tui/src/navigation/goToBindings.ts` | Go-to keybinding definitions and execution logic | Implemented | 58 |
| `apps/tui/src/navigation/index.ts` | Barrel export for navigation module | Implemented | 7 |
| `apps/tui/src/components/HeaderBar.tsx` | Consumes `useNavigation()` for breadcrumb rendering | Implemented | 56 |
| `apps/tui/src/components/AppShell.tsx` | Root layout with HeaderBar, content area, and StatusBar | Implemented | 27 |
| `apps/tui/src/index.tsx` | Entry point with provider stack and deep-link wiring | Implemented | 88 |
| `e2e/tui/app-shell.test.ts` | E2E tests for loading states, keybindings, and navigation integration | Implemented | 875 |

---

## 3. Detailed Design

### 3.1 `apps/tui/src/router/types.ts` — Type Definitions

#### ScreenName Enum

A string enum covering every navigable screen in the TUI. Currently 32 entries covering top-level, repo-scoped, workspace, agent, and organization screens.

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
- Agent screens have 4 entries: `AgentSessionList`, `AgentChat`, `AgentSessionCreate`, `AgentSessionReplay` — reflecting the fully-planned agent screen set. The `Agents` entry serves as the go-to navigation target (`g a`) and is distinct from `AgentSessionList` to allow future divergence (e.g., `Agents` might become a dashboard-like overview).

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
- `params` is `Record<string, string>` — simple, serializable, no nested objects. Param names are not validated by the entry — screen components validate their own required params.
- `breadcrumb` is computed once at entry creation time via `ScreenDefinition.breadcrumbLabel(params)` and stored immutably.
- `scrollPosition` is optional and populated lazily by the scroll cache system.

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

This is the contract all screen components must satisfy. When a real screen component replaces `PlaceholderScreen`, it accepts these props.

#### Stack Constants

```typescript
/** Maximum navigation stack depth. Push beyond this drops the bottom-most entry. */
export const MAX_STACK_DEPTH = 32;

/** Default root screen when no deep-link is specified */
export const DEFAULT_ROOT_SCREEN = ScreenName.Dashboard;
```

---

### 3.2 `apps/tui/src/router/registry.ts` — Screen Registry

The registry is a `Record<ScreenName, ScreenDefinition>` mapping every screen name to its definition. Currently all screens use `PlaceholderScreen` as their component — real screen components are swapped in by subsequent feature tickets.

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
| `RepoOverview` | `true` | `false` | `(p) => \`${p.owner}/${p.repo}\`` | PlaceholderScreen |
| `Issues` | `true` | `false` | `() => "Issues"` | PlaceholderScreen |
| `IssueDetail` | `true` | `false` | `(p) => \`#${p.number}\`` | PlaceholderScreen |
| `IssueCreate` | `true` | `false` | `() => "New Issue"` | PlaceholderScreen |
| `IssueEdit` | `true` | `false` | `(p) => \`Edit #${p.number}\`` | PlaceholderScreen |
| `Landings` | `true` | `false` | `() => "Landings"` | PlaceholderScreen |
| `LandingDetail` | `true` | `false` | `(p) => \`!${p.number}\`` | PlaceholderScreen |
| `LandingCreate` | `true` | `false` | `() => "New Landing"` | PlaceholderScreen |
| `LandingEdit` | `true` | `false` | `(p) => \`Edit !${p.number}\`` | PlaceholderScreen |
| `DiffView` | `true` | `false` | `() => "Diff"` | PlaceholderScreen |
| `Workflows` | `true` | `false` | `() => "Workflows"` | PlaceholderScreen |
| `WorkflowRunDetail` | `true` | `false` | `(p) => \`Run #${p.runId}\`` | PlaceholderScreen |
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

This prevents drift: adding a new `ScreenName` value without a registry entry crashes at startup with a clear error message. The crash is intentional — a missing registry entry means the TUI cannot render that screen, so it is better to fail loudly than silently.

---

### 3.3 `apps/tui/src/screens/PlaceholderScreen.tsx` — Placeholder Component

A simple screen component rendered for all screens until real implementations are built:

```typescript
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
- "not yet implemented" message in gray provides unambiguous signal that this is a placeholder.
- No data fetching — purely a visual placeholder with zero side effects.
- Uses only OpenTUI `<box>` and `<text>` primitives.

---

### 3.4 `apps/tui/src/providers/NavigationProvider.tsx` — Navigation Provider

The `NavigationProvider` is a React context provider that manages the navigation stack. It is placed in the provider hierarchy between `SSEProvider` and `LoadingProvider`.

#### Provider Stack Placement (as implemented in `index.tsx`)

```
ErrorBoundary
  → ThemeProvider
    → KeybindingProvider
      → AuthProvider(token, apiUrl)
        → APIClientProvider
          → SSEProvider
            → NavigationProvider(initialStack)    ← THIS TICKET
              → LoadingProvider
                → GlobalKeybindings
                  → AppShell
```

**Note on ordering:** `ThemeProvider` and `KeybindingProvider` are above `AuthProvider` (not below `NavigationProvider` as the architecture doc originally proposed). This is correct because theme tokens and keybinding dispatch are needed before auth resolution completes — the error screen for "unauthenticated" state still needs theme colors and keybinding dispatch.

#### Provider Props

```typescript
export interface NavigationProviderProps {
  /** Initial screen to render. Defaults to Dashboard. */
  initialScreen?: ScreenName;
  /** Initial params for the initial screen. */
  initialParams?: Record<string, string>;
  /** Pre-built initial stack for deep-link launch. Overrides initialScreen. */
  initialStack?: ScreenEntry[];
  children: React.ReactNode;
}
```

Three initialization modes:
1. **Default:** No props → stack is `[Dashboard]`.
2. **Single screen:** `initialScreen` + `initialParams` → stack is `[createEntry(screen, params)]`.
3. **Deep-link stack:** `initialStack` → stack is the provided array verbatim. This overrides `initialScreen`.

#### State Shape

```typescript
// React state: triggers re-renders
const [stack, setStack] = useState<ScreenEntry[]>(...);

// React ref: does not trigger re-renders
const scrollCacheRef = useRef<Map<string, number>>(new Map());
```

The scroll cache is a ref (not state) because changing scroll position values should never trigger re-renders of the navigation tree.

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

Both use top-down traversal so the most recently pushed context wins. This is important when navigating between repositories — the nearest repo context is always the one the user most recently entered.

#### Navigation Actions

**`push(screen, params?)`**

1. Spread provided params into `resolvedParams`.
2. If screen `requiresRepo` and no `owner`/`repo` in resolvedParams → inherit from stack via `extractRepoContext(prev)`.
3. If screen `requiresOrg` and no `org` in resolvedParams → inherit from stack via `extractOrgContext(prev)`.
4. **Duplicate prevention:** Compare top-of-stack screen name and sorted param key-value pairs. If identical, return `prev` unchanged (no-op). Comparison is structural: keys are sorted, then each key and value is compared pairwise.
5. Create new `ScreenEntry` via `createEntry(screen, resolvedParams)`.
6. Append to stack: `[...prev, entry]`.
7. **Max depth enforcement:** If `next.length > MAX_STACK_DEPTH`, `next.slice(next.length - MAX_STACK_DEPTH)` drops the oldest entries from the bottom.

**Implementation detail:** Uses functional `setStack(prev => ...)` for correct serialization under React 19's batching. The `useCallback` has no dependencies because all mutation logic is self-contained within the functional updater.

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

**Note:** `reset()` does NOT use the functional updater form. It directly calls `setStack([entry])`. This is intentional — `reset` is a full replacement, so there's no need to read the previous state. The scroll cache clear happens synchronously before the state update.

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

Memoization is keyed on `stack` (changes on every navigation) and the four action callbacks (stable references via `useCallback` with empty deps).

#### Exported Hooks

**`useNavigation()`**

Returns `NavigationContext`. Throws `"useNavigation() must be used within a <NavigationProvider>"` if called outside the provider tree.

**`useScrollPositionCache()`**

Returns `{ saveScrollPosition, getScrollPosition }`. **Currently a stub** — both functions are no-ops:

```typescript
return {
  saveScrollPosition: () => {},
  getScrollPosition: () => undefined,
};
```

The ref-based cache exists in the provider but isn't exposed to external consumers yet. Productionization path is documented in Section 8.

---

### 3.5 `apps/tui/src/router/ScreenRouter.tsx` — Screen Router Component

```typescript
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

Design decisions:
- **No `React.lazy`/Suspense.** All screen components are statically imported via the registry. Lazy loading can be introduced screen-by-screen if startup time is impacted, but with `PlaceholderScreen` as the universal component today, there is zero import cost.
- **No `key` prop on Component.** React reuses the component instance when navigating between screens of the same type. Screen components react to `entry` prop changes. If a specific screen needs full remount on param change, it uses `key={entry.id}` internally.
- **Error fallback for unknown screens** prevents crashes even though the registry completeness check makes this theoretically impossible at runtime.
- The `ScreenRouter` component is rendered as a child of `AppShell` inside `<box flexGrow={1}>`, giving it the full content area between header bar and status bar.

---

### 3.6 `apps/tui/src/navigation/deepLinks.ts` — Deep Link Stack Construction

#### Interfaces

```typescript
export interface DeepLinkArgs {
  screen?: string;
  repo?: string;
  sessionId?: string;  // For agent-chat and agent-replay
  org?: string;
}

export interface DeepLinkResult {
  /** Pre-populated stack entries for NavigationProviderProps.initialStack */
  stack: Array<{ screen: string; params?: Record<string, string> }>;
  /** Non-empty when validation failed. Displayed in status bar for 5 seconds. */
  error?: string;
}
```

#### SCREEN_ID_MAP

Maps lowercase CLI screen names to `ScreenName` enum values:

| CLI name | ScreenName |
|----------|------------|
| `dashboard` | `Dashboard` |
| `repos` | `RepoList` |
| `issues` | `Issues` |
| `landings` | `Landings` |
| `workspaces` | `Workspaces` |
| `workflows` | `Workflows` |
| `search` | `Search` |
| `notifications` | `Notifications` |
| `settings` | `Settings` |
| `orgs` | `Organizations` |
| `sync` | `Sync` |
| `wiki` | `Wiki` |
| `agents` | `Agents` |
| `agent-chat` | `AgentChat` |
| `agent-replay` | `AgentSessionReplay` |

15 total mappings.

#### `parseCliArgs(argv: string[]): DeepLinkArgs`

Simple loop-based parser that handles `--screen`, `--repo`, `--session-id`, `--org` flags. Each flag consumes the next argument as its value. `--screen` values are lowercased for case-insensitive matching.

#### `buildInitialStack(args: DeepLinkArgs): DeepLinkResult`

Validation and stack construction:

1. **No screen specified:** Returns `{ stack: [Dashboard] }`.
2. **Unknown screen name:** Returns `{ stack: [Dashboard], error: 'Unknown screen: "..."' }`.
3. **Invalid repo format:** Returns `{ stack: [Dashboard], error: 'Invalid repository format: "..."' }`.
4. **Invalid session ID:** Validates non-empty, no whitespace, max 255 chars.

Stack construction rules per screen:

| Screen | Stack Built | Validation |
|--------|-------------|------------|
| `Dashboard` | `[Dashboard]` | None |
| `RepoList` | `[Dashboard]` | None |
| `Agents` | `[Dashboard, RepoOverview, Agents]` | `--repo` required |
| `AgentChat` | `[Dashboard, RepoOverview, Agents, AgentChat]` | `--repo` and `--session-id` required |
| `AgentSessionReplay` | `[Dashboard, RepoOverview, Agents, AgentSessionReplay]` | `--repo` and `--session-id` required |
| `AgentSessionCreate` | Error: "not a valid deep-link screen" | Always fails |
| All others | Error: "deep-link not yet implemented" | Falls back to Dashboard |

**Known limitation:** Deep-link support for repo-scoped screens (Issues, Landings, Workflows, Wiki, etc.) is not yet implemented. The `default` case returns an error with Dashboard fallback. These will be implemented as the corresponding screen tickets are completed.

**Known bug:** Line 114 uses `\\s` (escaped backslash + s) instead of `\s` in the regex for sessionId whitespace validation: `/\\s/.test(args.sessionId)`. This regex will never match actual whitespace characters. It will match the literal string `\s` instead. This should be fixed to `/\s/` when the deep-link system is hardened.

---

### 3.7 `apps/tui/src/navigation/goToBindings.ts` — Go-to Navigation

#### GoToBinding Interface

```typescript
export interface GoToBinding {
  key: string;           // Single character pressed after 'g'
  screen: ScreenName;    // Destination screen
  requiresRepo: boolean; // If true and no repo context, show error
  description: string;   // Human-readable label for help overlay
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
  { key: "a", screen: ScreenName.Agents,             requiresRepo: true,  description: "Agents" },
] as const;
```

11 bindings total. 5 require repo context (`i`, `l`, `f`, `k`, `a`), 6 do not.

#### `executeGoTo(nav, binding, repoContext): { error?: string }`

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

**Atomicity note:** `executeGoTo()` calls `reset()` then `push()` (potentially twice) in sequence. Because React 19 batches state updates within the same synchronous event handler, the intermediate states are never rendered — the user sees the final state in a single frame.

---

### 3.8 `apps/tui/src/components/HeaderBar.tsx` — Breadcrumb Rendering

Consumes `useNavigation()` to build the breadcrumb trail:

1. Maps `stack` entries to their `breadcrumb` strings via `useMemo`.
2. Uses `truncateBreadcrumb()` utility to fit within `width - rightWidth - 2` characters.
3. Splits breadcrumb at the last ` › ` separator for styling: prefix in muted color, current segment in bold.
4. Shows repo context (`owner/repo`) in primary color at standard+ breakpoints (hidden at minimum).
5. Shows connection status indicator (`●`) colored by connection state.
6. Shows unread notification badge count if > 0.

**Current placeholder values:** `connectionState = "connected"`, `unreadCount = 0`. These will be wired to SSE hooks when the notification streaming ticket is implemented.

---

### 3.9 Barrel Exports

**`apps/tui/src/router/index.ts`:**
```typescript
export { ScreenRouter } from "./ScreenRouter.js";
export { screenRegistry } from "./registry.js";
export {
  ScreenName, MAX_STACK_DEPTH, DEFAULT_ROOT_SCREEN,
  type ScreenEntry, type NavigationContext,
  type ScreenDefinition, type ScreenComponentProps,
} from "./types.js";
```

**`apps/tui/src/providers/index.ts`:**
Exports `NavigationProvider`, `useNavigation`, `useScrollPositionCache`, `NavigationProviderProps`, and all other provider exports (ThemeProvider, SSEProvider, AuthProvider, APIClientProvider, LoadingProvider).

**`apps/tui/src/navigation/index.ts`:**
```typescript
export { ScreenName, screenRegistry } from "./screenRegistry.js";
export type { ScreenDefinition } from "./screenRegistry.js";
export { goToBindings, executeGoTo } from "./goToBindings.js";
export type { GoToBinding } from "./goToBindings.js";
export { parseCliArgs, buildInitialStack } from "./deepLinks.js";
export type { DeepLinkArgs, DeepLinkResult } from "./deepLinks.js";
```

**Note:** The navigation barrel imports from `"./screenRegistry.js"` rather than `"../router/registry.js"` — this appears to be a re-export alias. The canonical registry source is `apps/tui/src/router/registry.ts`.

---

## 4. Implementation Plan

Since all files are implemented, this section serves as the verification and hardening plan with vertical steps.

### Step 1: Type Definitions Verification (`apps/tui/src/router/types.ts`)

1. **Verify** the `ScreenName` enum has exactly 32 entries covering all screens from `features.ts`:
   - 9 top-level: Dashboard, RepoList, Search, Notifications, Workspaces, Agents, Settings, Organizations, Sync
   - 14 repo-scoped: RepoOverview, Issues, IssueDetail, IssueCreate, IssueEdit, Landings, LandingDetail, LandingCreate, LandingEdit, DiffView, Workflows, WorkflowRunDetail, Wiki, WikiDetail
   - 2 workspace detail: WorkspaceDetail, WorkspaceCreate
   - 4 agent detail: AgentSessionList, AgentChat, AgentSessionCreate, AgentSessionReplay
   - 3 org detail: OrgOverview, OrgTeamDetail, OrgSettings
2. **Verify** `ScreenEntry`, `NavigationContext`, `ScreenDefinition`, `ScreenComponentProps` interfaces match the architecture doc contracts.
3. **Verify** `MAX_STACK_DEPTH = 32` and `DEFAULT_ROOT_SCREEN = ScreenName.Dashboard` are exported.
4. **Action:** Run `bun run typecheck` to confirm no type errors.

### Step 2: Placeholder Screen Verification (`apps/tui/src/screens/PlaceholderScreen.tsx`)

1. **Verify** component accepts `ScreenComponentProps`.
2. **Verify** it renders screen name in bold, "not yet implemented" message in gray, and param list with underlined "Params:" header.
3. **Verify** it uses only OpenTUI `<box>` and `<text>` components.
4. **Verify** no data fetching or side effects.

### Step 3: Screen Registry Verification (`apps/tui/src/router/registry.ts`)

1. **Verify** every `ScreenName` value has a corresponding entry (32 entries).
2. **Verify** import-time completeness assertion throws on missing entries.
3. **Verify** `breadcrumbLabel` functions produce correct output for representative param sets:
   - `RepoOverview({ owner: "acme", repo: "api" })` → `"acme/api"`
   - `IssueDetail({ number: "42" })` → `"#42"`
   - `LandingDetail({ number: "7" })` → `"!7"`
   - `WorkflowRunDetail({ runId: "123" })` → `"Run #123"`
   - `AgentChat({ sessionId: "abc123def456" })` → `"abc123de"` (8-char truncation)
   - `WikiDetail({})` → `"Page"` (fallback)
4. **Verify** `requiresRepo` and `requiresOrg` flags match the table in Section 3.2.

### Step 4: NavigationProvider Verification (`apps/tui/src/providers/NavigationProvider.tsx`)

1. **Verify** `push()` — duplicate prevention, context inheritance, max depth enforcement.
2. **Verify** `pop()` — root protection (stack length ≤ 1), scroll cache cleanup.
3. **Verify** `replace()` — top-swap, context inheritance, scroll cache cleanup.
4. **Verify** `reset()` — stack clear, scroll cache clear, direct `setStack` call.
5. **Verify** `canGoBack`, `repoContext`, `orgContext` derived correctly from stack.
6. **Verify** `useNavigation()` throws descriptive error outside provider.
7. **Verify** `useScrollPositionCache()` throws outside provider, returns stub functions.

### Step 5: ScreenRouter Verification (`apps/tui/src/router/ScreenRouter.tsx`)

1. **Verify** reads `currentScreen` from `useNavigation()`.
2. **Verify** looks up `ScreenDefinition` from `screenRegistry`.
3. **Verify** renders component with `{ entry, params }` props.
4. **Verify** error fallback renders red text for unknown screens.

### Step 6: Deep Link Verification (`apps/tui/src/navigation/deepLinks.ts`)

1. **Verify** `parseCliArgs` handles all 4 flags: `--screen`, `--repo`, `--session-id`, `--org`.
2. **Verify** `SCREEN_ID_MAP` has 15 entries covering all deep-linkable screens.
3. **Verify** `buildInitialStack` builds correct stacks for Dashboard, RepoList, Agents, AgentChat, AgentSessionReplay.
4. **Verify** error cases: unknown screen, invalid repo format, missing session ID, too-long session ID.
5. **Fix** the `\\s` regex bug on line 114: change to `/\s/`.
6. **Verify** default case returns error for unimplemented deep-links.

### Step 7: Go-to Bindings Verification (`apps/tui/src/navigation/goToBindings.ts`)

1. **Verify** all 11 bindings map to correct screens with correct `requiresRepo` values.
2. **Verify** `executeGoTo()` correctly uses `reset(Dashboard)` → `push(RepoOverview)` → `push(target)` pattern.
3. **Verify** error handling for missing repo context on repo-scoped screens returns `{ error: "No repository in context" }`.

### Step 8: Integration Verification

1. **Verify** `index.tsx` constructs initial stack from `buildInitialStack(launchOptions)`.
2. **Verify** `NavigationProvider` receives `initialStack` prop.
3. **Verify** `HeaderBar.tsx` consumes `useNavigation()` for breadcrumb rendering.
4. **Verify** `AppShell.tsx` renders children (which includes `ScreenRouter` via the provider hierarchy) between HeaderBar and StatusBar.
5. **Verify** provider hierarchy order in `index.tsx` matches the documented stack.

### Step 9: Harden `useScrollPositionCache()`

The current implementation is a stub. To fully productionize:

1. **Create a `ScrollCacheContext`** (or add a ref accessor to `NavigationCtx` value).
2. **Wire `saveScrollPosition`** to `scrollCacheRef.current.set(entryId, position)`.
3. **Wire `getScrollPosition`** to `scrollCacheRef.current.get(entryId)`.
4. **Integrate with `ScreenRouter`:** Before rendering a popped-to screen, check for a cached scroll position and pass it as a prop to the screen component.
5. **Integrate with `<scrollbox>`:** Screen components that use `<scrollbox>` should save their scroll position via the hook on `push`/navigation and restore on back-navigation.

Estimated effort: 2–3 hours. Should be done as part of the first screen that uses `<scrollbox>` (likely Issue list or Landing list).

### Step 10: Fix Deep Link Regex Bug

In `apps/tui/src/navigation/deepLinks.ts`, line 114:

```typescript
// Current (buggy):
if (!args.sessionId || /\\s/.test(args.sessionId)) {

// Fix:
if (!args.sessionId || /\s/.test(args.sessionId)) {
```

The double backslash causes the regex to match the literal string `\s` instead of whitespace characters.

---

## 5. Integration Points

### 5.1 Provider Stack Placement

As implemented in `apps/tui/src/index.tsx`:

```
ErrorBoundary
  → ThemeProvider
    → KeybindingProvider
      → AuthProvider(token, apiUrl)
        → APIClientProvider
          → SSEProvider
            → NavigationProvider(initialStack)    ← THIS TICKET
              → LoadingProvider
                → GlobalKeybindings
                  → AppShell
```

### 5.2 HeaderBar Breadcrumb Consumption

The `HeaderBar` component consumes `useNavigation()` to render breadcrumbs:

```typescript
const nav = useNavigation();
const breadcrumbSegments = useMemo(() => {
  return nav.stack.map((entry) => entry.breadcrumb);
}, [nav.stack]);
const breadcrumbText = truncateBreadcrumb(breadcrumbSegments, maxBreadcrumbWidth);
```

Breadcrumbs are split at the last ` › ` separator: prefix in `theme.muted` color, current segment in bold.

### 5.3 Go-to Keybindings

The `GlobalKeybindings` component and `KeybindingProvider` use go-to bindings:

```typescript
const { reset, push, repoContext } = useNavigation();
// g d → executeGoTo(nav, binding, repoContext)
// g i → executeGoTo(nav, binding, repoContext) // requires repo context
```

### 5.4 Deep-link Launch

The CLI entry point in `index.tsx` parses args and constructs initial stack:

```typescript
const deepLinkResult = buildInitialStack({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
});
const initialStack = deepLinkResult.stack;

<NavigationProvider initialStack={initialStack}>
```

### 5.5 Screen Component Contract

Every screen component must accept `ScreenComponentProps`. When real screen components are implemented, they replace `PlaceholderScreen` in the registry:

```typescript
// In registry.ts, swap:
[ScreenName.Issues]: {
  component: IssueListScreen,  // was PlaceholderScreen
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "Issues",
},
```

The screen component receives `{ entry, params }` and is responsible for:
- Data fetching via `@codeplane/ui-core` hooks
- Keybinding registration via `useScreenKeybindings()`
- Rendering with OpenTUI components
- Validating required params from `entry.params`

---

## 6. Edge Cases and Constraints

### 6.1 Pop at Root

When the stack has exactly one entry and `pop()` is called, the stack is unchanged. `canGoBack` is `false`. The `q` global keybinding at root screen triggers TUI quit (handled by `GlobalKeybindings`, not `NavigationProvider`).

### 6.2 Push-on-Duplicate Prevention

If the top-of-stack already shows the same `ScreenName` with identical params (sorted key-value comparison), `push()` returns `prev` unchanged. This prevents double-taps or repeated go-to bindings from cluttering the stack.

Comparison algorithm:
1. Check `top.screen === screen`.
2. Sort both param key arrays.
3. Verify same length.
4. Verify every key matches positionally and `top.params[k] === resolvedParams[k]`.

### 6.3 Max Stack Depth

When push would exceed 32 entries, bottom-most entries are dropped via `next.slice(next.length - MAX_STACK_DEPTH)`. The user retains the 32 most recent screens. This bounds memory without requiring explicit stack management.

### 6.4 Repo/Org Context Inheritance

When pushing a `requiresRepo` screen without explicit `owner`/`repo` params, the provider searches the stack top-down for the nearest ancestor with these params. If no ancestor has repo context and the screen requires it, the push still succeeds — the screen component is responsible for showing an error if required params are missing.

This design avoids coupling the navigation system to business logic about what constitutes valid navigation.

### 6.5 Scroll Position Cache Lifecycle

- **On push:** No scroll cache action. New screen starts at position 0.
- **On pop:** Popped screen's cache entry deleted. Revealed screen's cached position is available.
- **On replace:** Old top's cache entry deleted.
- **On reset:** Entire cache cleared.
- **Memory bound:** Bounded by MAX_STACK_DEPTH (32 entries max in cache).

### 6.6 Concurrent Push Safety

All stack mutations (push, pop, replace) use functional `setStack(prev => ...)`. React 19's state batching correctly serializes rapid consecutive pushes. `reset()` uses direct `setStack([entry])` which is also safe because it doesn't depend on previous state.

### 6.7 Deep Link Error Recovery

All deep-link failures fall back to `{ stack: [Dashboard], error: "..." }`. The TUI always launches to a working state. Error messages are intended for status bar display (5 seconds on launch) — the user sees where they are and why the deep-link failed.

### 6.8 Go-to Navigation Atomicity

`executeGoTo()` calls `reset()` then `push()` (up to twice) in sequence. Because React batches state updates within the same synchronous event handler, the intermediate states (just Dashboard, then Dashboard + RepoOverview) are never rendered — the user sees the final state in a single frame.

### 6.9 Navigation Module Barrel Export Inconsistency

The `apps/tui/src/navigation/index.ts` barrel imports from `"./screenRegistry.js"` which appears to be a separate re-export of the router's registry. The canonical source is `apps/tui/src/router/registry.ts`. This works but creates two import paths for the same data. Consumers should prefer importing from `apps/tui/src/router/index.ts` for the canonical registry.

---

## 7. Unit & Integration Tests

All tests target `e2e/tui/app-shell.test.ts` using `@microsoft/tui-test` via the `launchTUI()` helper.

### 7.1 Existing Test Coverage

The existing test file (875 lines) contains comprehensive tests organized into two major groups:

#### Group 1: TUI_LOADING_STATES (37 tests)

| ID | Description | Type | Navigation Coverage |
|---|---|---|---|
| LOAD-SNAP-001–003 | Full-screen loading spinner at 80×24, 120×40, 200×60 | Snapshot | Deep-link launch with `--screen issues --repo acme/api` |
| LOAD-SNAP-004 | Spinner uses primary color | Regex | — |
| LOAD-SNAP-005 | Header/status bar stable during loading | Regex | Breadcrumb rendering with nav stack |
| LOAD-SNAP-006 | Context-specific loading labels | Text | Go-to navigation (`g n`) |
| LOAD-SNAP-010–014 | Skeleton rendering | Snapshot | — |
| LOAD-SNAP-020–022 | Pagination loading | Snapshot | — |
| LOAD-SNAP-030–031 | Action loading | Snapshot | — |
| LOAD-SNAP-040–043 | Full-screen error | Snapshot + regex | — |
| LOAD-SNAP-050 | Optimistic UI revert | Snapshot | — |
| LOAD-SNAP-060–061 | No-color terminal | Regex | — |
| LOAD-SNAP-070 | Loading timeout | Text | — |
| LOAD-KEY-001 | `q` pops during loading | Navigation | `pop()` during loading |
| LOAD-KEY-002 | `Ctrl+C` exits during loading | Exit | — |
| LOAD-KEY-003–004 | `R` retry (single + debounced) | Keyboard | — |
| LOAD-KEY-005 | `?` help during loading | Overlay | — |
| LOAD-KEY-006 | `:` palette during loading | Overlay | — |
| LOAD-KEY-007 | Go-to during loading | Navigation | `reset` + `push` via go-to |
| LOAD-KEY-008–011 | Pagination retry, scroll, navigate, fast API | Various | `pop()` via `q` |
| LOAD-RSP-001–008 | Responsive behavior at various sizes | Snapshot | — |

#### Group 2: KeybindingProvider — Priority Dispatch (38 tests)

| ID | Description | Type | Navigation Coverage |
|---|---|---|---|
| KEY-SNAP-001 | Status bar hints on Dashboard | Snapshot | Dashboard render |
| KEY-SNAP-002 | Hints update on navigation | Comparison | Go-to (`g r`) + waitForText |
| KEY-SNAP-003–004 | Hints at 80×24 and 200×60 | Snapshot | — |
| KEY-KEY-001 | `q` pops screen | Navigation | `push` via go-to, `pop` via `q` |
| KEY-KEY-002 | `Escape` pops screen | Navigation | `push` via go-to, `pop` via Escape |
| KEY-KEY-003 | `Ctrl+C` exits | Exit | — |
| KEY-KEY-004 | `?` toggles help | Overlay | — |
| KEY-KEY-005 | `:` opens palette | Overlay | — |
| KEY-KEY-006 | `g` activates go-to mode | Mode | Go-to mode activation |
| KEY-KEY-010–015 | Priority layering | Priority | Modal, go-to, text input interactions |
| KEY-KEY-020–021 | Scope lifecycle | Lifecycle | Navigation between screens |
| KEY-KEY-030–031 | Status bar hints | Hints | — |
| KEY-INT-001 | Help overlay integration | Integration | — |
| KEY-EDGE-001–003 | Edge cases | Edge | Rapid navigation |
| KEY-RSP-001–004 | Responsive keybindings | Responsive | Navigation at various sizes |

### 7.2 Additional Tests for Navigation-Specific Coverage

The following test cases should be added to `e2e/tui/app-shell.test.ts` to complete navigation stack coverage. These tests exercise navigation behaviors not covered by the existing loading/keybinding tests:

```typescript
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

  test("NAV-002: go-to navigation renders new screen and updates breadcrumb", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    // Breadcrumb should show Repositories
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

  test("NAV-004: q on root screen exits or remains on Dashboard", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("q");
    // TUI should quit or remain on Dashboard — either is acceptable.
    // The key assertion is that it doesn't crash.
  });

  test("NAV-005: reset clears stack — q after go-to does not return to intermediate", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "n");
    await terminal.waitForText("Notifications");
    // After reset-style go-to, q should go back to Dashboard, not Repositories
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

  test("NAV-007: multiple sequential navigations build correct stack", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
    await terminal.sendKeys("g", "o");
    await terminal.waitForText("Organizations");
    // Pop back through stack
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });
});

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
    // Should navigate back to RepoOverview or Dashboard
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/acme\/api|Dashboard/);
  });

  test("NAV-DEEP-006: --screen repos opens Dashboard (RepoList maps to Dashboard)", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos"],
    });
    await terminal.waitForText("Dashboard");
  });
});

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
    // Params should be visible
    expect(snapshot).toMatch(/owner.*acme|acme.*owner/);
  });
});

describe("TUI_SCREEN_ROUTER — registry completeness", () => {
  test("NAV-REG-001: every ScreenName has a registry entry", async () => {
    // Import-time validation — if this test file loads, the registry is complete.
    // The registry module throws at import time if any ScreenName is missing.
    const { screenRegistry, ScreenName } = await import(
      "../../apps/tui/src/router/index.js"
    );
    for (const name of Object.values(ScreenName)) {
      expect(screenRegistry[name]).toBeDefined();
    }
  });

  test("NAV-REG-002: every registry entry has a breadcrumbLabel function", async () => {
    const { screenRegistry } = await import(
      "../../apps/tui/src/router/index.js"
    );
    for (const def of Object.values(screenRegistry)) {
      expect(typeof def.breadcrumbLabel).toBe("function");
    }
  });

  test("NAV-REG-003: every registry entry has a component", async () => {
    const { screenRegistry } = await import(
      "../../apps/tui/src/router/index.js"
    );
    for (const def of Object.values(screenRegistry)) {
      expect(typeof def.component).toBe("function");
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
```

### 7.3 Test File Summary

| Test Group | Test File | Count | Status |
|---|---|---|---|
| TUI_LOADING_STATES | `e2e/tui/app-shell.test.ts` | 37 | Implemented |
| KeybindingProvider Priority | `e2e/tui/app-shell.test.ts` | 38 | Implemented |
| TUI_SCREEN_ROUTER navigation | `e2e/tui/app-shell.test.ts` | 7 | Pending |
| TUI_SCREEN_ROUTER breadcrumbs | `e2e/tui/app-shell.test.ts` | 3 | Pending |
| TUI_SCREEN_ROUTER deep links | `e2e/tui/app-shell.test.ts` | 6 | Pending |
| TUI_SCREEN_ROUTER placeholder | `e2e/tui/app-shell.test.ts` | 3 | Pending |
| TUI_SCREEN_ROUTER registry | `e2e/tui/app-shell.test.ts` | 4 | Pending |
| TUI_SCREEN_ROUTER snapshots | `e2e/tui/app-shell.test.ts` | 5 | Pending |
| **Total** | | **103** | 75 implemented, 28 pending |

### 7.4 Test Philosophy Notes

1. **Tests that fail due to unimplemented backends are left failing.** Deep-link tests that navigate to screens requiring API data will hit the real API or fail — they are never skipped or commented out.

2. **No mocking of NavigationProvider internals.** Tests drive the TUI through keyboard input (`g` + key, `q`, etc.) and assert on terminal output (breadcrumb text, screen content). The internal stack state is never directly inspected via programmatic access.

3. **Registry completeness tests** import the registry module directly and assert structural correctness. This is acceptable because the registry is a public API surface, not an implementation detail.

4. **Snapshot tests at representative sizes.** Captured at 80×24 (minimum), 120×40 (standard), and 200×60 (large) to catch layout regressions across all breakpoints.

5. **Existing tests already cover navigation integration.** The `KEY-KEY-*` tests exercise `push`, `pop`, `reset`, and go-to navigation through the full TUI. The `LOAD-*` tests exercise deep-link launch and navigation during loading states. The new `NAV-*` tests add focused, single-concern coverage for stack-specific behaviors.

---

## 8. Productionizing Notes

The implementation is in production shape with documented gaps. Key areas to monitor and harden:

### 8.1 `useScrollPositionCache()` Stub → Full Implementation

The hook currently returns no-op functions. To productionize:

1. **Expose `scrollCacheRef` via a secondary `ScrollCacheContext`** or by adding a ref accessor to the `NavigationCtx` value.
2. **Wire `saveScrollPosition`** to `scrollCacheRef.current.set(entryId, position)` before `push()` calls.
3. **Wire `getScrollPosition`** to `scrollCacheRef.current.get(entryId)` on mount of a popped-to screen.
4. **Add `onScroll` prop to `<scrollbox>`** wrappers in screen components that writes to the cache continuously.
5. **Add `initialScrollPosition` prop to screen components** so `ScreenRouter` can pass the cached value when rendering a popped-to screen.

Estimated effort: 2–3 hours. Should be done as part of the first `ScrollableList` screen (Issue list or Landing list).

### 8.2 Deep Link Regex Bug Fix

Line 114 of `deepLinks.ts` uses `\\s` instead of `\s`. Fix by changing the regex from `/\\s/` to `/\s/`. This is a correctness bug — sessionId strings containing whitespace will not be rejected.

### 8.3 Deep Link Expansion

Currently only 5 screens have full deep-link support (Dashboard, RepoList, Agents, AgentChat, AgentSessionReplay). The remaining screens return a "not yet implemented" error. Each feature ticket for a screen should add its deep-link case to `buildInitialStack()`. The pattern is:

```typescript
case ScreenName.Issues: {
  if (!repo) {
    return { stack: [dashboardEntry()], error: "--repo required for issues screen" };
  }
  return {
    stack: [
      dashboardEntry(),
      repoOverviewEntry(repo),
      { screen: ScreenName.Issues, params: { owner: repo.owner, repo: repo.repo } },
    ],
  };
}
```

### 8.4 Navigation Module Barrel Export Cleanup

The `apps/tui/src/navigation/index.ts` barrel imports from `"./screenRegistry.js"` which is a re-export alias for the router's registry. This creates two import paths for the same module. Consider:
- Option A: Remove the re-export from the navigation barrel. Consumers import registry from `apps/tui/src/router/index.ts`.
- Option B: Keep the alias but document it as a convenience re-export.

### 8.5 Type Safety

- The `ScreenName` enum ensures all screen references are compile-time checked.
- The registry completeness check at import time ensures no screen can be forgotten.
- `ScreenComponentProps` provides a contract all screen components must satisfy.
- `Record<ScreenName, ScreenDefinition>` type ensures the registry is exhaustive.

### 8.6 Memory Management

- Scroll position cache bounded by MAX_STACK_DEPTH (32). No unbounded growth.
- Popped entries cleaned up immediately via `scrollCacheRef.current.delete()`.
- No closures or subscriptions leak from unmounted screens because `ScreenRouter` only renders top-of-stack.
- `useMemo` on context value prevents unnecessary re-renders of the entire tree.

### 8.7 Performance

- `useMemo` on context value with stable `useCallback` action methods ensures re-renders only propagate when `stack` actually changes.
- Functional `setStack(prev => ...)` for correct React 19 batching.
- Context extraction (`extractRepoContext`, `extractOrgContext`) walks at most 32 entries — negligible cost.

### 8.8 Error Recovery

- Unknown screen names render a fallback error message (red text).
- Pop at root is a safe no-op.
- Missing repo/org context doesn't crash — screen component handles missing params.
- Deep-link failures fall back to Dashboard with descriptive error.
- Registry completeness check prevents startup with missing screen definitions.

### 8.9 Future Extensions

- **Lazy loading:** Replace `PlaceholderScreen` with `React.lazy()` imports per screen. Add `<Suspense>` boundary in `ScreenRouter` with a loading fallback component.
- **Navigation guards:** Extend `push()` with validation that shows a repo-selection modal instead of navigating to a broken screen when repo context is missing.
- **Screen lifecycle hooks:** The `useScreenKeybindings()` hook (already implemented in `apps/tui/src/hooks/useScreenKeybindings.ts`) provides screen-level keybinding registration. Combined with `useNavigation()`, this forms the `BaseScreen` abstraction described in the architecture doc.
- **URL-style routing:** If the TUI needs shareable deep-links for agent automation, the `ScreenEntry` stack can be serialized to/from a URL-like path.
- **Transition animations:** OpenTUI's `useTimeline` hook could be used to animate screen transitions, though this is low priority given the performance-first design.

---

## 9. Acceptance Criteria

1. ✅ `apps/tui/src/router/types.ts` exports `ScreenName` enum with 32 screen identifiers.
2. ✅ `apps/tui/src/router/types.ts` exports `ScreenEntry`, `NavigationContext`, `ScreenDefinition`, `ScreenComponentProps` interfaces.
3. ✅ `apps/tui/src/router/registry.ts` maps every `ScreenName` to a `ScreenDefinition` with `PlaceholderScreen` as component.
4. ✅ Registry throws at import time if any `ScreenName` is missing.
5. ✅ `apps/tui/src/providers/NavigationProvider.tsx` provides `NavigationContext` via React context.
6. ✅ `push()` creates a new `ScreenEntry`, adds it to the stack, and renders the new screen.
7. ✅ `push()` prevents duplicate pushes (same screen + same params).
8. ✅ `push()` enforces MAX_STACK_DEPTH by dropping oldest entries.
9. ✅ `push()` inherits repo/org context from ancestor stack entries when not provided.
10. ✅ `pop()` removes the top entry and renders the previous screen.
11. ✅ `pop()` is a no-op when stack has one entry.
12. ✅ `replace()` swaps the top entry without changing stack depth.
13. ✅ `reset()` clears the stack and pushes a single new root entry.
14. ✅ `canGoBack` is `true` when stack depth > 1.
15. ✅ `repoContext` is derived by walking the stack for nearest owner/repo params.
16. ✅ `orgContext` is derived by walking the stack for nearest org param.
17. ✅ `useNavigation()` throws with descriptive error outside provider.
18. ✅ `ScreenRouter` renders the component from the registry for the current top-of-stack screen.
19. ✅ `PlaceholderScreen` renders screen name, params, and "not yet implemented" message.
20. ✅ `apps/tui/src/navigation/deepLinks.ts` parses CLI args and constructs initial stack.
21. ✅ `apps/tui/src/navigation/goToBindings.ts` defines all 11 go-to bindings with `executeGoTo()`.
22. ✅ `e2e/tui/app-shell.test.ts` contains loading state, keybinding priority, and navigation integration tests (75 tests).
23. ✅ Tests that depend on unimplemented features are present and allowed to fail.
24. ⬜ `useScrollPositionCache()` stub should be wired to the internal ref (tracked as follow-up, see Section 8.1).
25. ⬜ Navigation-specific E2E tests (NAV-001 through NAV-007, NAV-BREAD-001 through NAV-BREAD-003, NAV-DEEP-001 through NAV-DEEP-006, NAV-PH-001 through NAV-PH-003, NAV-REG-001 through NAV-REG-004, SNAP-NAV-001 through SNAP-NAV-005) should be added to `e2e/tui/app-shell.test.ts` (28 tests).
26. ⬜ Deep link regex bug fix: `\\s` → `\s` on line 114 of `deepLinks.ts` (see Section 8.2).
27. ✅ `bun run typecheck` passes with no errors from the navigation/router files.