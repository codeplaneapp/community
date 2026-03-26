# Engineering Specification: tui-nav-chrome-eng-01

## 1. Overview
This specification details the implementation of the stack-based navigation model for the Codeplane TUI. It includes the `NavigationProvider` React context, screen registry, typing for screen entries, and the core router components.

## 2. Core Types (`apps/tui/src/router/types.ts`)
Define the types and interfaces for the navigation system.

```typescript
export enum ScreenName {
  Dashboard = "Dashboard",
  RepoList = "RepoList",
  RepoOverview = "RepoOverview",
  Issues = "Issues",
  IssueDetail = "IssueDetail",
  IssueCreate = "IssueCreate",
  IssueEdit = "IssueEdit",
  Landings = "Landings",
  LandingDetail = "LandingDetail",
  LandingCreate = "LandingCreate",
  LandingEdit = "LandingEdit",
  LandingReview = "LandingReview",
  DiffView = "DiffView",
  Workspaces = "Workspaces",
  WorkspaceDetail = "WorkspaceDetail",
  WorkspaceCreate = "WorkspaceCreate",
  Workflows = "Workflows",
  WorkflowRunList = "WorkflowRunList",
  WorkflowRunDetail = "WorkflowRunDetail",
  Search = "Search",
  Notifications = "Notifications",
  Agents = "Agents",
  AgentChat = "AgentChat",
  AgentSessionCreate = "AgentSessionCreate",
  Settings = "Settings",
  Organizations = "Organizations",
  OrgOverview = "OrgOverview",
  OrgTeamDetail = "OrgTeamDetail",
  Sync = "Sync",
  Wiki = "Wiki",
  WikiDetail = "WikiDetail"
}

export interface ScreenEntry {
  id: string; // Unique instance ID (e.g., UUID or nanoid)
  screen: ScreenName;
  params: Record<string, string>; // Route params (owner, repo, issueNumber, etc.)
  breadcrumb: string; // Display text for header
  scrollPosition?: number; // Cached scroll position for back-navigation
}

export interface RepoContext {
  owner: string;
  repo: string;
}

export interface OrgContext {
  org: string;
}

export interface NavigationContextValue {
  stack: ScreenEntry[];
  currentScreen: ScreenEntry | null;
  canGoBack: boolean;
  repoContext: RepoContext | null;
  orgContext: OrgContext | null;
  
  push: (screen: ScreenName, params?: Record<string, string>) => void;
  pop: () => void;
  replace: (screen: ScreenName, params?: Record<string, string>) => void;
  reset: (screen: ScreenName, params?: Record<string, string>) => void; // aka goTo()
  updateScrollPosition: (id: string, position: number) => void;
}

export interface ScreenDefinition {
  component: React.ComponentType<{ entry: ScreenEntry }>;
  requiresRepo: boolean;
  requiresOrg?: boolean;
  breadcrumbLabel: (params: Record<string, string>) => string;
}
```

## 3. Screen Registry (`apps/tui/src/router/registry.ts`)
Maps screen names to their placeholder components and metadata.

```typescript
import { ScreenName, ScreenDefinition } from './types';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';

const defaultComponent = PlaceholderScreen;

export const screenRegistry: Record<ScreenName, ScreenDefinition> = {
  [ScreenName.Dashboard]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'Dashboard' },
  [ScreenName.RepoList]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'Repositories' },
  [ScreenName.RepoOverview]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: ({ repo }) => repo || 'Repo' },
  [ScreenName.Issues]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: () => 'Issues' },
  [ScreenName.IssueDetail]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: ({ number }) => `#${number}` },
  [ScreenName.IssueCreate]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: () => 'New Issue' },
  [ScreenName.IssueEdit]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: ({ number }) => `Edit #${number}` },
  [ScreenName.Landings]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: () => 'Landings' },
  [ScreenName.LandingDetail]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: ({ id }) => `Landing ${id}` },
  [ScreenName.LandingCreate]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: () => 'New Landing' },
  [ScreenName.LandingEdit]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: ({ id }) => `Edit ${id}` },
  [ScreenName.LandingReview]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: ({ id }) => `Review ${id}` },
  [ScreenName.DiffView]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: () => 'Diff' },
  [ScreenName.Workspaces]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'Workspaces' },
  [ScreenName.WorkspaceDetail]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: ({ id }) => `Workspace ${id}` },
  [ScreenName.WorkspaceCreate]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'New Workspace' },
  [ScreenName.Workflows]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: () => 'Workflows' },
  [ScreenName.WorkflowRunList]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: ({ workflow }) => `${workflow} Runs` },
  [ScreenName.WorkflowRunDetail]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: ({ id }) => `Run ${id}` },
  [ScreenName.Search]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'Search' },
  [ScreenName.Notifications]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'Notifications' },
  [ScreenName.Agents]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'Agents' },
  [ScreenName.AgentChat]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: ({ id }) => `Chat ${id}` },
  [ScreenName.AgentSessionCreate]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'New Agent' },
  [ScreenName.Settings]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'Settings' },
  [ScreenName.Organizations]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'Organizations' },
  [ScreenName.OrgOverview]: { component: defaultComponent, requiresRepo: false, requiresOrg: true, breadcrumbLabel: ({ org }) => org || 'Org' },
  [ScreenName.OrgTeamDetail]: { component: defaultComponent, requiresRepo: false, requiresOrg: true, breadcrumbLabel: ({ team }) => `Team ${team}` },
  [ScreenName.Sync]: { component: defaultComponent, requiresRepo: false, breadcrumbLabel: () => 'Sync Status' },
  [ScreenName.Wiki]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: () => 'Wiki' },
  [ScreenName.WikiDetail]: { component: defaultComponent, requiresRepo: true, breadcrumbLabel: ({ page }) => page || 'Wiki Page' }
};
```

## 4. NavigationProvider (`apps/tui/src/providers/NavigationProvider.tsx`)
React context provider implementing the navigation stack.

```typescript
import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { ScreenName, ScreenEntry, NavigationContextValue, RepoContext, OrgContext } from '../router/types';
import { screenRegistry } from '../router/registry';

const NavigationContext = createContext<NavigationContextValue | null>(null);

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const MAX_STACK_DEPTH = 32;

export function NavigationProvider({ children, initialScreen = ScreenName.Dashboard, initialParams = {} }: { children: React.ReactNode, initialScreen?: ScreenName, initialParams?: Record<string, string> }) {
  const def = screenRegistry[initialScreen];
  const rootEntry: ScreenEntry = {
    id: generateId(),
    screen: initialScreen,
    params: initialParams,
    breadcrumb: def ? def.breadcrumbLabel(initialParams) : initialScreen,
  };

  const [stack, setStack] = useState<ScreenEntry[]>([rootEntry]);

  const currentScreen = stack[stack.length - 1] || null;
  const canGoBack = stack.length > 1;

  // Deriving Context from current stack params
  const repoContext = useMemo<RepoContext | null>(() => {
    // Traverse backwards to find the nearest repo context
    for (let i = stack.length - 1; i >= 0; i--) {
      const p = stack[i].params;
      if (p.owner && p.repo) return { owner: p.owner, repo: p.repo };
    }
    return null;
  }, [stack]);

  const orgContext = useMemo<OrgContext | null>(() => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const p = stack[i].params;
      if (p.org) return { org: p.org };
    }
    return null;
  }, [stack]);

  const push = useCallback((screen: ScreenName, params: Record<string, string> = {}) => {
    setStack(prev => {
      // Prevent push-on-duplicate (if identical screen & params)
      const top = prev[prev.length - 1];
      if (top && top.screen === screen && JSON.stringify(top.params) === JSON.stringify(params)) {
        return prev; // No-op
      }

      const def = screenRegistry[screen];
      if (!def) {
        console.warn(`Screen ${screen} not found in registry`);
        return prev;
      }

      const newEntry: ScreenEntry = {
        id: generateId(),
        screen,
        params,
        breadcrumb: def.breadcrumbLabel(params),
      };

      const nextStack = [...prev, newEntry];
      if (nextStack.length > MAX_STACK_DEPTH) {
        nextStack.shift(); // Remove oldest to respect max depth
      }
      return nextStack;
    });
  }, []);

  const pop = useCallback(() => {
    setStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  const replace = useCallback((screen: ScreenName, params: Record<string, string> = {}) => {
    setStack(prev => {
      const def = screenRegistry[screen];
      if (!def) return prev;
      
      const newEntry: ScreenEntry = {
        id: generateId(),
        screen,
        params,
        breadcrumb: def.breadcrumbLabel(params),
      };
      
      return [...prev.slice(0, -1), newEntry];
    });
  }, []);

  const reset = useCallback((screen: ScreenName, params: Record<string, string> = {}) => {
    const def = screenRegistry[screen];
    if (!def) return;
    
    const rootEntry: ScreenEntry = {
      id: generateId(),
      screen,
      params,
      breadcrumb: def.breadcrumbLabel(params),
    };
    
    setStack([rootEntry]);
  }, []);

  const updateScrollPosition = useCallback((id: string, position: number) => {
    setStack(prev => prev.map(entry => entry.id === id ? { ...entry, scrollPosition: position } : entry));
  }, []);

  const value = useMemo(() => ({
    stack,
    currentScreen,
    canGoBack,
    repoContext,
    orgContext,
    push,
    pop,
    replace,
    reset,
    updateScrollPosition
  }), [stack, currentScreen, canGoBack, repoContext, orgContext, push, pop, replace, reset, updateScrollPosition]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
```

## 5. ScreenRouter (`apps/tui/src/router/ScreenRouter.tsx`)
Consumes `useNavigation` and renders the current top-of-stack screen based on the registry.

```typescript
import React from 'react';
import { useNavigation } from '../providers/NavigationProvider';
import { screenRegistry } from './registry';
// Placeholder openTUI imports. Real usage would depend on the library.

export function ScreenRouter() {
  const { currentScreen, repoContext, orgContext } = useNavigation();

  if (!currentScreen) {
    return <text>Navigation stack is empty.</text>;
  }

  const def = screenRegistry[currentScreen.screen];

  if (!def) {
    return <text color="red">Error: Screen {currentScreen.screen} is not registered.</text>;
  }

  // Validate context requirements
  if (def.requiresRepo && !repoContext) {
    return <text color="red">Error: Screen {currentScreen.screen} requires a repository context.</text>;
  }

  if (def.requiresOrg && !orgContext) {
    return <text color="red">Error: Screen {currentScreen.screen} requires an organization context.</text>;
  }

  const Component = def.component;

  // Render the matched screen, passing the entry object to it
  return (
    <box flexGrow={1} flexDirection="column" width="100%" height="100%">
      <Component entry={currentScreen} />
    </box>
  );
}
```

## 6. PlaceholderScreen (`apps/tui/src/screens/PlaceholderScreen.tsx`)
A minimal fallback UI until real screens are built.

```typescript
import React from 'react';
import { ScreenEntry } from '../router/types';
// Placeholder openTUI imports.

export function PlaceholderScreen({ entry }: { entry: ScreenEntry }) {
  return (
    <box flexDirection="column" padding={1} width="100%" height="100%" justifyContent="center" alignItems="center">
      <text bold>[Placeholder] {entry.screen}</text>
      <text color="gray">Breadcrumb: {entry.breadcrumb}</text>
      <text color="gray">Params: {JSON.stringify(entry.params)}</text>
    </box>
  );
}
```

## 7. Implementation Plan
1. Run `mkdir -p apps/tui/src/router apps/tui/src/providers apps/tui/src/screens` to setup the skeleton directory structure.
2. Add `apps/tui/src/router/types.ts` populated with `ScreenName`, `ScreenEntry`, and `NavigationContextValue`.
3. Add `apps/tui/src/screens/PlaceholderScreen.tsx` so all placeholder implementations have a valid component to default to.
4. Add `apps/tui/src/router/registry.ts` defining all known `ScreenName` endpoints mapped to their placeholder and context definitions.
5. Add `apps/tui/src/providers/NavigationProvider.tsx` containing the logic to manage a maximum-32 depth stack preventing explicit duplicates, handling pushes/pops, and exporting the `useNavigation` hook.
6. Add `apps/tui/src/router/ScreenRouter.tsx` to handle top-level rendering of whichever screen component is requested and handle potential errors such as missing Repository or Org context.

## 8. Unit & Integration Tests
### Unit Tests: `apps/tui/src/providers/NavigationProvider.test.tsx`
- **Initial State:** Validates root screen mounts properly (length = 1).
- **Push Method:** Validates standard push, breadcrumb assignment, and ensures duplicates (pushing same screen+params consecutively) are ignored. Validates max depth is enforced (drops oldest entry beyond 32).
- **Pop Method:** Validates stack reduction and prevents popping root (stack never goes below 1 item).
- **Replace Method:** Validates replacing the top item without growing stack depth.
- **Reset Method:** Validates stack is cleared and replaced with a single new root entry.
- **Context Derivation:** Validates `repoContext` and `orgContext` are correctly derived from params of the stack (searching backwards).

### E2E Considerations (`e2e/tui/app-shell.test.ts`)
Once integrated with `AppShell`, test snapshots should verify pushing to `Issues` with repo context successfully mounts the `PlaceholderScreen` component and text properly displays the current route parameters. Simulating `Esc` and validating pop() functionality drops the user back on the correct screen index.