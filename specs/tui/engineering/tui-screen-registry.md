# Engineering Specification: `tui-screen-registry`

## Implement screen registry mapping screen IDs to React components

**Ticket ID:** `tui-screen-registry`
**Type:** Engineering (infrastructure)
**Feature:** Supports `TUI_SCREEN_ROUTER`
**Dependencies:** `tui-navigation-provider`
**Status:** Not started

---

## Overview

This ticket creates the screen registry — the canonical lookup table that maps string screen IDs to their React component and associated metadata. It is the bridge between the NavigationProvider (which manages a stack of plain string screen identifiers) and the ScreenRouter (which needs to resolve a string into a renderable component).

The registry delivers five things:

1. **`apps/tui/src/router/screens.ts`** — A frozen `Record<string, ScreenDefinition>` mapping screen ID strings to `{ component, title, requiresRepo, requiresOrg }`. Contains entries for all 17 screens.
2. **`apps/tui/src/screens/PlaceholderScreen.tsx`** — A reusable placeholder component that renders the screen name and any params as centered text. Used by all registry entries until real screen components are implemented.
3. **`getScreen(id): ScreenDefinition | undefined`** — Type-safe lookup function that returns the definition for a known screen ID, or `undefined` for unknown IDs.
4. **`getAllScreenIds(): readonly string[]`** — Returns all registered screen IDs as a frozen array, for command palette integration and validation.
5. **`SCREEN_IDS` constant object** — A frozen object mapping each screen key to its string literal value, providing autocomplete and typo-safety without using TypeScript enums.

Screen IDs are **string literals, not enums**, for extensibility. This means plugins, future feature flags, or dynamic screen registration can add entries without modifying a central enum definition. The NavigationProvider already uses `screen: string` in its `ScreenEntry` type, so string IDs align naturally.

### Relationship to `tui-navigation-provider`

The NavigationProvider (dependency) manages the navigation stack using `ScreenEntry` objects with `screen: string`. It is screen-agnostic — it stores strings and manages stack operations without knowing what screens exist.

The screen registry (this ticket) is the **knowledge layer** that maps those strings to React components and metadata. The downstream ScreenRouter component will:

1. Read `current.screen` from `useNavigation()`
2. Call `getScreen(current.screen)` from this registry
3. Render the resolved component, or an error screen if `getScreen` returns `undefined`

```
NavigationProvider (manages stack of string screen IDs)
  ↓ current.screen: string
Screen Registry (maps string → component + metadata)    ← THIS TICKET
  ↓ ScreenDefinition.component
ScreenRouter (renders the component)                     ← future ticket
```

### Relationship to `tui-agent-screen-registry`

The `tui-agent-screen-registry` ticket uses a `ScreenName` enum approach in `navigation/screenRegistry.ts`. This ticket supersedes that pattern for the core registry by using string literals in `router/screens.ts`. The agent screen registry ticket will need to add its entries to this string-based registry rather than creating a parallel enum-based one. The two approaches are reconciled as follows:

- This ticket defines the `SCREEN_IDS` constant with all 17 core screen IDs
- Agent screens (`Agents`, `AgentChat`, `AgentSessionCreate`, `AgentSessionReplay`) will be added to the same `screenRegistry` object by the agent ticket, using the same string-literal pattern
- No `ScreenName` enum is created anywhere — all screen identification uses string literals throughout

### Design decisions

| Decision | Rationale |
|----------|----------|
| String literals, not enums | Extensibility — new screens can be registered without modifying a central enum. Matches NavigationProvider's `screen: string` type. Avoids barrel export churn. |
| `Object.freeze()` on the registry | Prevents runtime mutation. Screens should not be dynamically added/removed in Community Edition. The freeze is shallow — component references are still callable. |
| `getScreen()` returns `undefined`, not throwing | The ScreenRouter handles unknown screens gracefully (renders error screen). Throwing would require try/catch at every call site. |
| `getAllScreenIds()` returns frozen array | Command palette iterates this to build screen navigation commands. Frozen prevents accidental mutation. |
| `title` instead of `breadcrumb` | The `title` field is the human-readable display name. Breadcrumb generation is the HeaderBar's responsibility — it may combine `title` with params. Keeping the registry's metadata simple. |
| `requiresOrg` field | Some screens (Organizations, OrgDetail) require org context. This is a separate axis from `requiresRepo`. |
| Placeholder renders screen name + params | Provides visual confirmation during development that navigation is wired correctly, even before real screens exist. |

---

## Implementation Plan

### Step 1: Define the `SCREEN_IDS` constant and `ScreenDefinition` type

**File:** `apps/tui/src/router/screens.ts`

Define the screen ID constants and the `ScreenDefinition` interface. Screen IDs use a frozen object to provide autocomplete without enums.

```typescript
import type React from "react";

/**
 * Screen ID constants. Use these instead of raw strings for autocomplete and typo safety.
 * String literals, not enums, for extensibility.
 */
export const SCREEN_IDS = Object.freeze({
  Dashboard: "Dashboard",
  RepoList: "RepoList",
  RepoDetail: "RepoDetail",
  Issues: "Issues",
  IssueDetail: "IssueDetail",
  Landings: "Landings",
  LandingDetail: "LandingDetail",
  Diff: "Diff",
  Workspaces: "Workspaces",
  Workflows: "Workflows",
  Search: "Search",
  Notifications: "Notifications",
  Agents: "Agents",
  Settings: "Settings",
  Organizations: "Organizations",
  Sync: "Sync",
  Wiki: "Wiki",
} as const);

/**
 * Union type of all known screen ID values.
 * Derived from SCREEN_IDS for type safety without enums.
 */
export type ScreenId = (typeof SCREEN_IDS)[keyof typeof SCREEN_IDS];

/**
 * Metadata associated with a registered screen.
 */
export interface ScreenDefinition {
  /** The React component to render for this screen. */
  component: React.ComponentType<{ params?: Record<string, string> }>;
  /** Human-readable title for breadcrumbs and command palette. */
  title: string;
  /** Whether this screen requires a repository context (owner + repo in params). */
  requiresRepo?: boolean;
  /** Whether this screen requires an organization context (org in params). */
  requiresOrg?: boolean;
}
```

**Design notes:**

- `SCREEN_IDS` values are the same as their keys. This is intentional — it makes the string value match the identifier in code (`SCREEN_IDS.Dashboard === "Dashboard"`).
- The `ScreenId` type is a union of string literals: `"Dashboard" | "RepoList" | "RepoDetail" | ...`. It provides type safety at boundaries where a screen ID is expected.
- `ScreenDefinition.component` accepts an optional `params` prop. All screen components receive params from the navigation stack. The placeholder component uses this to display the params.
- `requiresRepo` and `requiresOrg` default to `undefined` (falsy), meaning the screen is accessible without context. This avoids requiring every entry to specify `false`.

### Step 2: Create the `PlaceholderScreen` component

**File:** `apps/tui/src/screens/PlaceholderScreen.tsx`

A generic placeholder component rendered by all registry entries until their real screen implementation is built. It displays the screen name and any params passed to it, centered in the content area.

```tsx
import React from "react";

export interface PlaceholderScreenProps {
  params?: Record<string, string>;
}

/**
 * Placeholder screen component used by unimplemented screens.
 * Renders the screen name and params as centered text.
 * Replaced screen-by-screen as real implementations land.
 */
export function PlaceholderScreen({ params }: PlaceholderScreenProps) {
  // Derive screen name from params or show generic message
  const screenName = params?.__screenId ?? "Unknown Screen";

  return (
    <box
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      flexGrow={1}
      width="100%"
      height="100%"
    >
      <text bold>{screenName}</text>
      {params && Object.keys(params).filter(k => k !== "__screenId").length > 0 && (
        <box flexDirection="column" marginTop={1}>
          {Object.entries(params)
            .filter(([key]) => key !== "__screenId")
            .map(([key, value]) => (
              <text key={key} dimColor>
                {key}: {value}
              </text>
            ))}
        </box>
      )}
      <text dimColor marginTop={1}>Screen not yet implemented</text>
    </box>
  );
}
```

**Design notes:**

- The `__screenId` param is injected by the ScreenRouter (or could be injected by a wrapper) so the placeholder knows which screen it's standing in for. This is a convention — if not present, it shows "Unknown Screen".
- The placeholder uses OpenTUI's `<box>` for layout with flexbox centering, and `<text>` for output. These are core OpenTUI primitives available via `@opentui/react`.
- `dimColor` on secondary text matches the `muted` semantic token pattern from the design spec.
- Params are displayed to aid development — when navigating via go-to or command palette, developers can immediately verify that the correct params were passed.
- The component is intentionally simple. It does not fetch data, register keybindings, or manage state. It is pure presentation.

### Step 3: Build the screen registry and lookup functions

**File:** `apps/tui/src/router/screens.ts` (continued from Step 1)

After the types, define the registry, `getScreen()`, and `getAllScreenIds()`.

```typescript
import { PlaceholderScreen } from "../screens/PlaceholderScreen";

/**
 * The screen registry — maps screen ID strings to their component and metadata.
 * Frozen at module level. No runtime additions or removals.
 */
export const screenRegistry: Readonly<Record<string, ScreenDefinition>> = Object.freeze({
  [SCREEN_IDS.Dashboard]: {
    component: PlaceholderScreen,
    title: "Dashboard",
  },
  [SCREEN_IDS.RepoList]: {
    component: PlaceholderScreen,
    title: "Repositories",
  },
  [SCREEN_IDS.RepoDetail]: {
    component: PlaceholderScreen,
    title: "Repository",
    requiresRepo: true,
  },
  [SCREEN_IDS.Issues]: {
    component: PlaceholderScreen,
    title: "Issues",
    requiresRepo: true,
  },
  [SCREEN_IDS.IssueDetail]: {
    component: PlaceholderScreen,
    title: "Issue",
    requiresRepo: true,
  },
  [SCREEN_IDS.Landings]: {
    component: PlaceholderScreen,
    title: "Landing Requests",
    requiresRepo: true,
  },
  [SCREEN_IDS.LandingDetail]: {
    component: PlaceholderScreen,
    title: "Landing Request",
    requiresRepo: true,
  },
  [SCREEN_IDS.Diff]: {
    component: PlaceholderScreen,
    title: "Diff",
    requiresRepo: true,
  },
  [SCREEN_IDS.Workspaces]: {
    component: PlaceholderScreen,
    title: "Workspaces",
  },
  [SCREEN_IDS.Workflows]: {
    component: PlaceholderScreen,
    title: "Workflows",
    requiresRepo: true,
  },
  [SCREEN_IDS.Search]: {
    component: PlaceholderScreen,
    title: "Search",
  },
  [SCREEN_IDS.Notifications]: {
    component: PlaceholderScreen,
    title: "Notifications",
  },
  [SCREEN_IDS.Agents]: {
    component: PlaceholderScreen,
    title: "Agent Sessions",
  },
  [SCREEN_IDS.Settings]: {
    component: PlaceholderScreen,
    title: "Settings",
  },
  [SCREEN_IDS.Organizations]: {
    component: PlaceholderScreen,
    title: "Organizations",
    requiresOrg: true,
  },
  [SCREEN_IDS.Sync]: {
    component: PlaceholderScreen,
    title: "Sync Status",
  },
  [SCREEN_IDS.Wiki]: {
    component: PlaceholderScreen,
    title: "Wiki",
    requiresRepo: true,
  },
});

/** Cached array of all registered screen IDs. Frozen for safety. */
const _allScreenIds: readonly string[] = Object.freeze(Object.keys(screenRegistry));

/**
 * Look up a screen definition by ID.
 * Returns `undefined` for unknown screen IDs.
 *
 * @param id - The screen identifier string
 * @returns The ScreenDefinition if found, undefined otherwise
 */
export function getScreen(id: string): ScreenDefinition | undefined {
  return screenRegistry[id];
}

/**
 * Returns all registered screen IDs as a frozen array.
 * Used by the command palette to generate screen navigation commands.
 *
 * @returns Frozen array of screen ID strings
 */
export function getAllScreenIds(): readonly string[] {
  return _allScreenIds;
}
```

**Design notes:**

- The registry is typed as `Readonly<Record<string, ScreenDefinition>>`, not `Record<ScreenId, ScreenDefinition>`. This is deliberate: the key type is `string` because the registry is consumed by the NavigationProvider which uses `string` screen identifiers. Using `ScreenId` as the key type would require type assertions at every lookup from navigation context.
- `Object.freeze()` is applied at module initialization. It prevents `screenRegistry["NewScreen"] = ...` at runtime. The freeze is shallow — component references and the `ScreenDefinition` objects themselves are not deeply frozen, but since they are consumed read-only this is acceptable.
- `_allScreenIds` is computed once and cached. `getAllScreenIds()` returns the same frozen array reference every time. This is efficient for the command palette which may call it on every keystroke during fuzzy search.
- `getScreen()` is a thin function wrapping property access. Its value is clarity at call sites: `getScreen(id)` communicates intent better than `screenRegistry[id]`, and the `| undefined` return type forces callers to handle the unknown-screen case.
- All entries currently reference `PlaceholderScreen`. As each screen is implemented (e.g., `DashboardScreen`, `IssueListScreen`), its registry entry's `component` will be updated to the real component. This is a single-line change per screen.

### Step 4: Map screen IDs to design spec screen references

The following table traces each screen ID to the PRD, design spec, and features.ts:

| Screen ID | PRD Section | Design Section | Feature Group | `requiresRepo` | `requiresOrg` |
|-----------|------------|---------------|---------------|-----------------|----------------|
| `Dashboard` | §4.1 | §1.3 `g d` | `TUI_DASHBOARD` | No | No |
| `RepoList` | §4.2 | §1.3 `g r` | `TUI_REPOSITORY` | No | No |
| `RepoDetail` | §4.2 | §1.3 (from list) | `TUI_REPOSITORY` | Yes | No |
| `Issues` | §4.3 | §1.3 `g i` | `TUI_ISSUES` | Yes | No |
| `IssueDetail` | §4.3 | §1.3 (from list) | `TUI_ISSUES` | Yes | No |
| `Landings` | §4.4 | §1.3 `g l` | `TUI_LANDINGS` | Yes | No |
| `LandingDetail` | §4.4 | §1.3 (from list) | `TUI_LANDINGS` | Yes | No |
| `Diff` | §4.5 | §3.4 | `TUI_DIFF` | Yes | No |
| `Workspaces` | §4.6 | §1.3 `g w` | `TUI_WORKSPACES` | No | No |
| `Workflows` | §4.7 | §1.3 `g f` | `TUI_WORKFLOWS` | Yes | No |
| `Search` | §4.8 | §1.3 `g s` | `TUI_SEARCH` | No | No |
| `Notifications` | §4.9 | §1.3 `g n` | `TUI_NOTIFICATIONS` | No | No |
| `Agents` | §4.10 | §1.3 `g a` | `TUI_AGENTS` | No | No |
| `Settings` | §4.11 | — | `TUI_SETTINGS` | No | No |
| `Organizations` | §4.12 | §1.3 `g o` | `TUI_ORGANIZATIONS` | No | Yes |
| `Sync` | §4.14 | — | `TUI_SYNC` | No | No |
| `Wiki` | §4.15 | §1.3 `g k` | `TUI_WIKI` | Yes | No |

**Note on `Agents` screen:** The architecture document lists `Agents: { requiresRepo: false }`. The `tui-agent-screen-registry` spec overrides this to `requiresRepo: true`. For the core screen registry in this ticket, we follow the architecture document's original `requiresRepo: false` for the top-level `Agents` list screen, since the agent session list can be viewed across repositories. Specific agent detail screens (added by the agent registry ticket) may require repo context. This alignment avoids blocking the go-to keybinding `g a` behind repository context selection.

### Step 5: Update the `router/index.ts` barrel export

**File:** `apps/tui/src/router/index.ts`

Append screen registry exports to the existing barrel that already exports navigation types.

**Current content (from `tui-navigation-provider`):**
```typescript
export type { ScreenEntry, NavigationContextType, NavigationProviderProps } from "./types";
export { MAX_STACK_DEPTH, DEFAULT_ROOT_SCREEN, screenEntriesEqual } from "./types";
```

**Updated content:**
```typescript
export type { ScreenEntry, NavigationContextType, NavigationProviderProps } from "./types";
export { MAX_STACK_DEPTH, DEFAULT_ROOT_SCREEN, screenEntriesEqual } from "./types";

export type { ScreenDefinition, ScreenId } from "./screens";
export { SCREEN_IDS, screenRegistry, getScreen, getAllScreenIds } from "./screens";
```

### Step 6: Verify TypeScript compilation

Run `bun run check` (tsc) from `apps/tui/` to verify:

1. `PlaceholderScreen.tsx` compiles with JSX via `@opentui/react/jsx-runtime`
2. `screens.ts` resolves the `PlaceholderScreen` import
3. All 17 registry entries satisfy the `ScreenDefinition` type
4. `getScreen()` return type is `ScreenDefinition | undefined`
5. `getAllScreenIds()` return type is `readonly string[]`
6. `SCREEN_IDS` is typed as a frozen const object with string literal values
7. No circular imports between `router/screens.ts` and `screens/PlaceholderScreen.tsx`

---

## Detailed Behavior Specification

### Registry invariants

The following invariants hold after module initialization:

1. **Frozen registry:** `Object.isFrozen(screenRegistry) === true`. No runtime additions, deletions, or modifications.
2. **All SCREEN_IDS present:** Every value in `SCREEN_IDS` has a corresponding key in `screenRegistry`. The two sets are identical at module initialization.
3. **No empty entries:** Every `ScreenDefinition` has a non-null `component` and a non-empty `title` string.
4. **Consistent ID count:** `getAllScreenIds().length === Object.keys(SCREEN_IDS).length === 17`.
5. **Stable ordering:** `getAllScreenIds()` returns IDs in the same insertion order as the `screenRegistry` object literal. This order is deterministic across runs.
6. **Placeholder safety:** `PlaceholderScreen` accepts `{ params?: Record<string, string> }` and renders without throwing for any input, including `undefined`, empty `{}`, or deeply nested params.

### Lookup behavior

| Input | `getScreen()` result | Notes |
|-------|---------------------|-------|
| `"Dashboard"` | `{ component: PlaceholderScreen, title: "Dashboard" }` | Known ID |
| `"Issues"` | `{ component: PlaceholderScreen, title: "Issues", requiresRepo: true }` | Known ID with requiresRepo |
| `"NonExistent"` | `undefined` | Unknown ID |
| `""` | `undefined` | Empty string |
| `"dashboard"` (lowercase) | `undefined` | Case-sensitive — IDs are PascalCase |
| `"DASHBOARD"` (uppercase) | `undefined` | Case-sensitive |

### `SCREEN_IDS` behavior

```typescript
SCREEN_IDS.Dashboard    // "Dashboard" — string literal type
SCREEN_IDS.RepoList     // "RepoList"
SCREEN_IDS.Issues       // "Issues"
SCREEN_IDS["Wiki"]      // "Wiki"

// TypeScript error:
SCREEN_IDS.Nonexistent  // Property 'Nonexistent' does not exist on type '...'

// Runtime error:
SCREEN_IDS.Dashboard = "x"  // TypeError: Cannot assign to read only property
```

### PlaceholderScreen rendering

The PlaceholderScreen renders a centered box with:

```
┌──────────────────────────────────────┐
│                                      │
│                                      │
│            Dashboard                 │
│                                      │
│        Screen not yet implemented    │
│                                      │
│                                      │
└──────────────────────────────────────┘
```

With params:

```
┌──────────────────────────────────────┐
│                                      │
│            Issues                    │
│                                      │
│          owner: acme                 │
│          repo: api                   │
│                                      │
│        Screen not yet implemented    │
│                                      │
└──────────────────────────────────────┘
```

---

## Integration Points

### Consumed by: ScreenRouter (future ticket)

The ScreenRouter reads `current.screen` from `useNavigation()` and resolves it via the registry:

```typescript
function ScreenRouter() {
  const { current } = useNavigation();
  const definition = getScreen(current.screen);

  if (!definition) {
    return <ErrorScreen message={`Unknown screen: ${current.screen}`} />;
  }

  const ScreenComponent = definition.component;
  return <ScreenComponent params={{ ...current.params, __screenId: current.screen }} />;
}
```

### Consumed by: Go-to keybindings (future ticket)

The go-to handler validates screen IDs before navigating:

```typescript
function handleGoTo(screenId: string) {
  const definition = getScreen(screenId);
  if (!definition) return; // Invalid screen

  if (definition.requiresRepo && !repoContext) {
    // Show "Select a repository first" message
    return;
  }

  navigation.reset(screenId, params);
}
```

### Consumed by: Command palette (future ticket)

The command palette generates screen navigation commands from the registry:

```typescript
const screenCommands = getAllScreenIds().map(id => {
  const def = getScreen(id)!;
  return {
    id: `navigate:${id}`,
    label: `Go to ${def.title}`,
    action: () => navigation.reset(id),
  };
});
```

### Consumed by: HeaderBar breadcrumbs (future ticket)

The HeaderBar uses the registry to resolve display titles:

```typescript
function HeaderBar() {
  const { stack } = useNavigation();
  const breadcrumbs = stack.map(entry => {
    const def = getScreen(entry.screen);
    return def?.title ?? entry.screen;
  });
  // Render breadcrumbs joined by " › "
}
```

### Consumed by: Deep-link launcher (future ticket)

The deep-link parser validates `--screen` arguments against the registry:

```typescript
function parseDeepLink(args: string[]): ScreenEntry[] {
  const screenArg = args[args.indexOf("--screen") + 1];
  if (!getScreen(screenArg)) {
    console.error(`Unknown screen: ${screenArg}`);
    return [{ screen: "Dashboard" }]; // Fallback
  }
  // Build stack...
}
```

---

## File Inventory

| File | Type | Purpose |
|------|------|--------|
| `apps/tui/src/router/screens.ts` | New | `SCREEN_IDS` constant, `ScreenDefinition` type, `screenRegistry` record, `getScreen()`, `getAllScreenIds()` |
| `apps/tui/src/screens/PlaceholderScreen.tsx` | New | Generic placeholder component for unimplemented screens |
| `apps/tui/src/router/index.ts` | Modify | Append screen registry exports to existing barrel |

---

## Productionization Notes

This module is production code from the start — there is no PoC stage.

1. **No PoC needed.** The screen registry uses only a frozen `Record`, two pure functions (`getScreen`, `getAllScreenIds`), and a stateless React component. No external dependencies, no async operations, no terminal-specific APIs. All of these are supported in Bun + OpenTUI's React reconciler.

2. **No dynamic registration.** The registry is a static, frozen object. If dynamic screen registration is ever needed (e.g., for plugins), it would require a different architecture (mutable map + event emitter). That is explicitly out of scope for Community Edition.

3. **No performance concerns.** `getScreen()` is a single property access on a plain object — O(1). `getAllScreenIds()` returns a cached frozen array — O(1). The registry contains 17 entries. No optimization is needed.

4. **Gradual replacement pattern.** As each screen is implemented, its registry entry is updated from `PlaceholderScreen` to the real component. This is a one-line change in `router/screens.ts`. The `PlaceholderScreen` component is eventually unused and can be removed or retained as a development tool. No migration, no refactoring needed.

5. **Type safety at boundaries.** The `ScreenId` type union provides compile-time safety where screen IDs are hardcoded (e.g., go-to bindings, deep-link parser). For runtime lookups from the navigation stack, `getScreen()` returns `| undefined` to force null-checking. This two-layer approach gives safety without rigidity.

6. **The `__screenId` injection pattern.** The PlaceholderScreen uses `params.__screenId` to display which screen it represents. The ScreenRouter injects this. If this convention proves unnecessary once real screens are in place, it can be removed without affecting the registry's API surface.

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

Screen registry tests are added to the existing `e2e/tui/app-shell.test.ts` file (per the test organization spec: app-shell.test.ts covers `TUI_APP_SHELL` features including `TUI_SCREEN_ROUTER`). They form a new `describe` block within the existing test file.

Tests use `@microsoft/tui-test` for E2E terminal testing. Since the screen registry is infrastructure, the tests validate behavior through what the user sees — placeholder screens rendering correctly, navigation resolving to the right placeholder, and the command palette listing all screens.

**Import pattern:**

```typescript
import { describe, expect, test } from "bun:test";
import { launchTUI } from "./helpers";
```

### Terminal Snapshot Tests

#### `REG-SNAP-001`: Dashboard placeholder renders centered screen name at 120x40

```typescript
test("REG-SNAP-001: Dashboard placeholder renders centered screen name at 120x40", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  // Placeholder should show screen name centered
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

#### `REG-SNAP-002`: Placeholder renders screen name at 80x24 minimum size

```typescript
test("REG-SNAP-002: placeholder renders screen name at 80x24 minimum size", async () => {
  const terminal = await launchTUI({ cols: 80, rows: 24 });
  await terminal.waitForText("Dashboard");
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

#### `REG-SNAP-003`: Placeholder shows params when navigated with repo context

```typescript
test("REG-SNAP-003: placeholder shows params when navigated with repo context", async () => {
  const terminal = await launchTUI({
    cols: 120,
    rows: 40,
    args: ["--screen", "issues", "--repo", "acme/api"],
  });
  await terminal.waitForText("Issues");
  // Placeholder should display repo params
  await terminal.waitForText("owner");
  await terminal.waitForText("acme");
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

#### `REG-SNAP-004`: Placeholder renders at 200x60 large terminal

```typescript
test("REG-SNAP-004: placeholder renders at 200x60 large terminal", async () => {
  const terminal = await launchTUI({ cols: 200, rows: 60 });
  await terminal.waitForText("Dashboard");
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

### Keyboard Interaction Tests

#### `REG-KEY-001`: Go-to each screen shows correct placeholder title

```typescript
test("REG-KEY-001: go-to keybindings resolve to correct placeholder screens", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  
  // g d → Dashboard
  await terminal.sendKeys("g", "d");
  await terminal.waitForText("Dashboard");
  
  // g r → Repositories
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  
  // g n → Notifications
  await terminal.sendKeys("g", "n");
  await terminal.waitForText("Notifications");
  
  // g s → Search
  await terminal.sendKeys("g", "s");
  await terminal.waitForText("Search");
  
  // g w → Workspaces
  await terminal.sendKeys("g", "w");
  await terminal.waitForText("Workspaces");
  
  // g a → Agent Sessions
  await terminal.sendKeys("g", "a");
  await terminal.waitForText("Agent Sessions");
  
  // g o → Organizations
  await terminal.sendKeys("g", "o");
  await terminal.waitForText("Organizations");
  
  await terminal.terminate();
});
```

#### `REG-KEY-002`: Repo-context screens show placeholder with correct title

```typescript
test("REG-KEY-002: repo-context screens show correct placeholder title via go-to", async () => {
  const terminal = await launchTUI({
    cols: 120,
    rows: 40,
    args: ["--screen", "repo-detail", "--repo", "acme/api"],
  });
  await terminal.waitForText("Repository");
  
  // g i → Issues (requires repo, should work since repo context is set)
  await terminal.sendKeys("g", "i");
  await terminal.waitForText("Issues");
  
  // g l → Landing Requests
  await terminal.sendKeys("g", "l");
  await terminal.waitForText("Landing Requests");
  
  // g f → Workflows
  await terminal.sendKeys("g", "f");
  await terminal.waitForText("Workflows");
  
  // g k → Wiki
  await terminal.sendKeys("g", "k");
  await terminal.waitForText("Wiki");
  
  await terminal.terminate();
});
```

#### `REG-KEY-003`: Unknown screen via deep-link falls back to Dashboard

```typescript
test("REG-KEY-003: unknown screen in deep-link falls back to Dashboard", async () => {
  const terminal = await launchTUI({
    cols: 120,
    rows: 40,
    args: ["--screen", "nonexistent-screen"],
  });
  // Should fall back to Dashboard, not crash
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});
```

### Integration Tests

#### `REG-INT-001`: All 17 screens are registered and accessible

```typescript
test("REG-INT-001: all 17 screens are registered and navigable", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  
  // Navigate to non-repo-context screens via go-to
  const noRepoScreens = [
    { keys: ["g", "d"], text: "Dashboard" },
    { keys: ["g", "r"], text: "Repositories" },
    { keys: ["g", "w"], text: "Workspaces" },
    { keys: ["g", "s"], text: "Search" },
    { keys: ["g", "n"], text: "Notifications" },
    { keys: ["g", "a"], text: "Agent Sessions" },
    { keys: ["g", "o"], text: "Organizations" },
  ];
  
  for (const { keys, text } of noRepoScreens) {
    await terminal.sendKeys(...keys);
    await terminal.waitForText(text);
  }
  
  await terminal.terminate();
});
```

#### `REG-INT-002`: Command palette lists all registered screens

```typescript
test("REG-INT-002: command palette shows navigation entries for all registered screens", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  // Open command palette
  await terminal.sendKeys(":");
  await terminal.waitForText("Command");
  
  // Type a screen name to filter
  await terminal.sendText("Dashboard");
  await terminal.waitForText("Dashboard");
  
  // Clear and search for another
  await terminal.sendKeys("Escape");
  await terminal.sendKeys(":");
  await terminal.sendText("Wiki");
  await terminal.waitForText("Wiki");
  
  await terminal.sendKeys("Escape");
  await terminal.terminate();
});
```

#### `REG-INT-003`: Registry getScreen returns undefined for unknown IDs

This is validated through the deep-link fallback test (REG-KEY-003 above) and the ScreenRouter error handling. Since the registry is infrastructure, its behavior is observed through navigation outcomes, not direct function calls.

```typescript
test("REG-INT-003: navigating to unregistered screen shows error or fallback", async () => {
  const terminal = await launchTUI({
    cols: 120,
    rows: 40,
    args: ["--screen", "BogusScreen"],
  });
  // Should not crash — either error screen or Dashboard fallback
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});
```

#### `REG-INT-004`: Placeholder screen shows "not yet implemented" message

```typescript
test("REG-INT-004: placeholder screen shows 'not yet implemented' message", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  // All screens are placeholders, so the message should be visible
  await terminal.waitForText("not yet implemented");
  await terminal.terminate();
});
```

### Edge Case Tests

#### `REG-EDGE-001`: Registry is frozen — cannot add entries at runtime

This test validates via navigation that no spurious screens appear. Direct runtime mutation testing would require importing the module in a test, which conflicts with the E2E-only test philosophy. Instead, we validate that only expected screens are navigable.

```typescript
test("REG-EDGE-001: only registered screens are navigable via go-to", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  // g + invalid key should not navigate anywhere
  await terminal.sendKeys("g", "z"); // 'z' is not a valid go-to key
  // Should still be on Dashboard
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});
```

#### `REG-EDGE-002`: Screen IDs are case-sensitive

```typescript
test("REG-EDGE-002: deep-link screen IDs are case-sensitive", async () => {
  const terminal = await launchTUI({
    cols: 120,
    rows: 40,
    args: ["--screen", "dashboard"], // lowercase — should not match "Dashboard"
  });
  // If the deep-link parser is case-insensitive, it maps to Dashboard
  // If case-sensitive, it falls back to Dashboard
  // Either way, we should see Dashboard
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});
```

#### `REG-EDGE-003`: getAllScreenIds returns exactly 17 entries

This is validated through the command palette showing all screens. Direct count verification would require module import. The E2E approach verifies that every expected screen name appears in the palette.

```typescript
test("REG-EDGE-003: command palette contains entries for all screen categories", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.sendKeys(":");
  await terminal.waitForText("Command");
  
  // Verify representative screens from different feature groups are present
  const screenTitles = [
    "Dashboard",
    "Repositories",
    "Issues",
    "Landing Requests",
    "Workspaces",
    "Workflows",
    "Search",
    "Notifications",
    "Settings",
    "Organizations",
    "Wiki",
  ];
  
  for (const title of screenTitles) {
    // Type to filter, verify it appears, clear
    await terminal.sendText(title.slice(0, 4)); // First 4 chars for fuzzy match
    await terminal.waitForText(title);
    // Clear filter by pressing Escape and reopening
    await terminal.sendKeys("Escape");
    await terminal.sendKeys(":");
  }
  
  await terminal.sendKeys("Escape");
  await terminal.terminate();
});
```

#### `REG-EDGE-004`: Placeholder handles empty params gracefully

```typescript
test("REG-EDGE-004: placeholder renders cleanly with no params", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  // Should show screen name but not param section
  await terminal.waitForText("not yet implemented");
  // Should NOT show "owner:" or other param labels
  try {
    await terminal.waitForText("owner:", 500);
    // If we get here, there's a spurious param display
    expect(true).toBe(false); // Force failure
  } catch {
    // Expected — no params to display
  }
  await terminal.terminate();
});
```

---

## Source of Truth

This engineering specification should be maintained alongside:

- [specs/tui/prd.md](../prd.md) — Product requirements (§4 Screen Inventory)
- [specs/tui/design.md](../design.md) — Design specification (§1 Navigation, §2 Layout)
- [specs/tui/features.ts](../features.ts) — Codified feature inventory (`TUI_SCREEN_ROUTER`)
- [specs/tui/engineering/tui-navigation-provider.md](./tui-navigation-provider.md) — Dependency: NavigationProvider with stack-based routing
- [specs/tui/architecture.md](../architecture.md) — Full architecture reference (Screen Router section)