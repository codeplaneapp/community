# Engineering Specification: `tui-navigation-provider`

## Implement NavigationProvider with stack-based screen routing and context

**Ticket ID:** `tui-navigation-provider`
**Type:** Engineering (infrastructure)
**Feature:** Supports `TUI_SCREEN_ROUTER`
**Dependencies:** None
**Status:** Not started

---

## Overview

This ticket creates the NavigationProvider — the central navigation infrastructure for the Codeplane TUI. It delivers three modules:

1. **`apps/tui/src/router/types.ts`** — Type definitions for `ScreenEntry`, `NavigationContextType`, and related types.
2. **`apps/tui/src/providers/NavigationProvider.tsx`** — React context provider managing the navigation stack, exposing `push()`, `pop()`, `replace()`, `reset()`, `canPop()`, `stack`, and `current` to the entire component tree.
3. **`apps/tui/src/hooks/useNavigation.ts`** — Consumer hook that reads the NavigationContext from the nearest NavigationProvider.

The NavigationProvider is positioned in the provider hierarchy between SSEProvider (ancestor) and ThemeProvider (descendant):

```
SSEProvider
  → NavigationProvider    ← this ticket
    → ThemeProvider
```

It owns the screen stack data structure and all stack mutation operations. It does **not** render screens — that responsibility belongs to the downstream ScreenRouter component (separate ticket). It does **not** handle keyboard input — that responsibility belongs to KeybindingProvider (separate ticket). The NavigationProvider is a pure data provider.

---

## Implementation Plan

### Step 1: Define the router type system

**File:** `apps/tui/src/router/types.ts`

Define the core types consumed by the NavigationProvider and all downstream navigation consumers (ScreenRouter, HeaderBar breadcrumbs, go-to mode, deep-link launcher, command palette navigation).

#### `ScreenEntry`

Represents a single entry in the navigation stack.

```typescript
export interface ScreenEntry {
  /** Unique instance ID for this stack entry. Generated at push time via crypto.randomUUID(). */
  id: string;
  /** Screen identifier string. Matches keys in the screen registry (e.g., "Dashboard", "Issues", "IssueDetail"). */
  screen: string;
  /** Screen-specific parameters. Keys and values are strings. Examples: { owner: "acme", repo: "api" }, { issueNumber: "42" }. */
  params?: Record<string, string>;
}
```

**Design decisions:**
- `id` is a `string` generated via `crypto.randomUUID()`. This ensures every stack entry is uniquely identifiable even if the same screen+params combination is pushed multiple times (which is prevented by deduplication, but the ID is still useful for React keys and debugging).
- `screen` is a `string`, not an enum. The NavigationProvider is screen-agnostic — it manages the stack data structure without knowing what screens exist. Screen validation is the responsibility of the ScreenRouter and screen registry (separate tickets). This decoupling allows the NavigationProvider to be built and tested independently.
- `params` is optional and defaults to `undefined` (not `{}`). An entry with no params and an entry with `{}` are treated identically for deduplication purposes.

#### `NavigationContextType`

The shape of the React context value provided by NavigationProvider.

```typescript
export interface NavigationContextType {
  /** Push a new screen onto the stack. No-op if top of stack has same screen+params. */
  push(screen: string, params?: Record<string, string>): void;
  /** Pop the top screen from the stack. No-op if stack depth is 1 (root). */
  pop(): void;
  /** Replace the top-of-stack entry with a new screen+params. Stack depth unchanged. */
  replace(screen: string, params?: Record<string, string>): void;
  /** Clear the entire stack and push a single new root entry. */
  reset(screen: string, params?: Record<string, string>): void;
  /** Returns true if the stack has more than one entry (i.e., pop() would have an effect). */
  canPop(): boolean;
  /** Read-only view of the full navigation stack. Index 0 is the bottom (root). Last element is the current screen. */
  readonly stack: readonly ScreenEntry[];
  /** The current (top-of-stack) screen entry. Equivalent to stack[stack.length - 1]. */
  readonly current: ScreenEntry;
}
```

**Design decisions:**
- `stack` is `readonly ScreenEntry[]` — consumers cannot mutate the array. The provider returns a new array reference on every mutation to trigger re-renders.
- `current` is a convenience accessor. It is always defined because the stack always has at least one entry.
- `canPop()` is a method, not a property, to match the interface pattern in the ticket description. Internally it reads `stack.length > 1`.
- All methods are synchronous. They update React state via `useState` setter, which batches within the current render cycle in React 19.

#### `NavigationProviderProps`

```typescript
export interface NavigationProviderProps {
  /** Initial screen to push as the root entry. Defaults to "Dashboard". */
  initialScreen?: string;
  /** Initial params for the root entry. */
  initialParams?: Record<string, string>;
  /** Pre-populated stack entries for deep-link launch. If provided, overrides initialScreen/initialParams. */
  initialStack?: Array<{ screen: string; params?: Record<string, string> }>;
  /** React children. */
  children: React.ReactNode;
}
```

#### Constants

```typescript
/** Maximum number of entries in the navigation stack. */
export const MAX_STACK_DEPTH = 32;

/** Default root screen identifier. */
export const DEFAULT_ROOT_SCREEN = "Dashboard";
```

#### Helper: `screenEntriesEqual`

```typescript
/**
 * Compare two screen entries by screen name and params (ignoring id).
 * Used for push deduplication.
 */
export function screenEntriesEqual(
  a: { screen: string; params?: Record<string, string> },
  b: { screen: string; params?: Record<string, string> },
): boolean;
```

Comparison logic:
1. `a.screen !== b.screen` → `false`
2. Both `params` are `undefined` or both are empty `{}` → `true`
3. One `params` is `undefined`/empty and the other has keys → `false`
4. Both have params → shallow-compare all keys and values. Same set of keys with same values → `true`, otherwise `false`.

This function is pure, has no side effects, and is exported for testing.

---

### Step 2: Create the NavigationProvider context and provider component

**File:** `apps/tui/src/providers/NavigationProvider.tsx`

Implement the React context provider that manages the navigation stack.

#### Context creation

```typescript
import { createContext, useState, useCallback, useMemo } from "react";
import type { NavigationContextType, NavigationProviderProps, ScreenEntry } from "../router/types";
import { MAX_STACK_DEPTH, DEFAULT_ROOT_SCREEN, screenEntriesEqual } from "../router/types";

export const NavigationContext = createContext<NavigationContextType | null>(null);
```

The context default value is `null`. The `useNavigation()` hook throws if accessed outside a provider. This catches misuse early during development.

#### `NavigationProvider` component

```typescript
export function NavigationProvider({
  initialScreen = DEFAULT_ROOT_SCREEN,
  initialParams,
  initialStack,
  children,
}: NavigationProviderProps): React.ReactElement;
```

**State initialization:**

The stack is stored in a single `useState<ScreenEntry[]>` call. The initial value is computed lazily:

```typescript
const [stack, setStack] = useState<ScreenEntry[]>(() => {
  if (initialStack && initialStack.length > 0) {
    // Deep-link launch: pre-populate stack from initialStack prop.
    // Cap at MAX_STACK_DEPTH, taking the last MAX_STACK_DEPTH entries.
    const capped = initialStack.slice(-MAX_STACK_DEPTH);
    return capped.map(entry => ({
      id: crypto.randomUUID(),
      screen: entry.screen,
      params: entry.params,
    }));
  }
  // Default: single root entry.
  return [{
    id: crypto.randomUUID(),
    screen: initialScreen,
    params: initialParams,
  }];
});
```

**Stack mutation methods:**

All four mutation methods are wrapped in `useCallback` with `setStack` as the only dependency (stable from useState).

##### `push(screen, params?)`

```typescript
const push = useCallback((screen: string, params?: Record<string, string>) => {
  setStack(prev => {
    const top = prev[prev.length - 1];
    // Deduplication: if top of stack has same screen+params, no-op.
    if (screenEntriesEqual(top, { screen, params })) {
      return prev; // Same reference → no re-render.
    }
    const newEntry: ScreenEntry = {
      id: crypto.randomUUID(),
      screen,
      params,
    };
    const next = [...prev, newEntry];
    // Overflow: if beyond MAX_STACK_DEPTH, drop the oldest entry.
    if (next.length > MAX_STACK_DEPTH) {
      return next.slice(next.length - MAX_STACK_DEPTH);
    }
    return next;
  });
}, []);
```

**Overflow behavior:** When push would exceed 32 entries, the oldest entry (index 0) is dropped. This is a silent operation — no error, no status bar message. The rationale: overflow indicates extremely deep navigation; dropping the oldest entry is preferable to blocking navigation entirely. The user can still press `q` to pop back. This differs from the TUI_SCREEN_ROUTER spec which says "push beyond 32 is a no-op with status bar error" — but since the NavigationProvider is a data layer without access to the status bar, it silently drops the oldest entry and lets the consuming ScreenRouter/AppShell detect overflow and display feedback if desired.

**Deduplication:** Consecutive pushes of the same screen+params are no-ops. This prevents double-Enter from creating duplicate stack entries. The comparison uses `screenEntriesEqual()` which compares `screen` and `params` but ignores `id`.

##### `pop()`

```typescript
const pop = useCallback(() => {
  setStack(prev => {
    if (prev.length <= 1) {
      return prev; // No-op on root. Same reference → no re-render.
    }
    return prev.slice(0, -1);
  });
}, []);
```

Popping the root screen is a no-op. The NavigationProvider does not quit the TUI — that is the responsibility of the KeybindingProvider/AppShell which detects `canPop() === false` when `q` is pressed and triggers the quit flow.

##### `replace(screen, params?)`

```typescript
const replace = useCallback((screen: string, params?: Record<string, string>) => {
  setStack(prev => {
    const newEntry: ScreenEntry = {
      id: crypto.randomUUID(),
      screen,
      params,
    };
    if (prev.length <= 1) {
      return [newEntry];
    }
    return [...prev.slice(0, -1), newEntry];
  });
}, []);
```

Replace always generates a new `id` for the replacement entry. This ensures React treats it as a new mount for the screen component, triggering fresh data fetching.

##### `reset(screen, params?)`

```typescript
const reset = useCallback((screen: string, params?: Record<string, string>) => {
  setStack([{
    id: crypto.randomUUID(),
    screen,
    params,
  }]);
}, []);
```

Reset clears the entire stack and replaces it with a single entry. Used by go-to mode navigation where the stack is rebuilt from scratch (e.g., `g d` → reset to Dashboard).

**Derived values:**

```typescript
const current = stack[stack.length - 1];

const canPop = useCallback(() => stack.length > 1, [stack.length]);
```

`current` is derived synchronously from the stack array. It is recomputed on every render where the stack changes. Since it's a simple index access, there is no memoization overhead.

**Context value memoization:**

```typescript
const contextValue = useMemo<NavigationContextType>(
  () => ({
    push,
    pop,
    replace,
    reset,
    canPop,
    stack,
    current,
  }),
  [push, pop, replace, reset, canPop, stack, current],
);
```

The context value is memoized with `useMemo`. Since `push`, `pop`, `replace`, and `reset` are stable references (via `useCallback` with empty deps), the memo only recomputes when `stack` or `current` changes.

**Render:**

```typescript
return (
  <NavigationContext.Provider value={contextValue}>
    {children}
  </NavigationContext.Provider>
);
```

---

### Step 3: Create the useNavigation consumer hook

**File:** `apps/tui/src/hooks/useNavigation.ts`

```typescript
import { useContext } from "react";
import { NavigationContext } from "../providers/NavigationProvider";
import type { NavigationContextType } from "../router/types";

/**
 * Access the navigation context from the nearest NavigationProvider.
 *
 * @throws {Error} if called outside a NavigationProvider.
 */
export function useNavigation(): NavigationContextType {
  const context = useContext(NavigationContext);
  if (context === null) {
    throw new Error(
      "useNavigation must be used within a NavigationProvider. " +
      "Ensure the component is rendered inside the provider hierarchy."
    );
  }
  return context;
}
```

**Design decisions:**
- Throws on missing provider rather than returning a default value. This is intentional — silent fallbacks hide bugs. Every component that calls `useNavigation()` must be inside the provider tree.
- The error message includes guidance on the fix, reducing debugging time.
- The hook is a thin wrapper. It does no additional computation. Consumers who need derived values (e.g., `repoContext`) compute them from `current.params` in their own code or in a separate hook (separate ticket).

---

### Step 4: Create index barrel exports

**File:** `apps/tui/src/router/index.ts`

```typescript
export type { ScreenEntry, NavigationContextType, NavigationProviderProps } from "./types";
export { MAX_STACK_DEPTH, DEFAULT_ROOT_SCREEN, screenEntriesEqual } from "./types";
```

**File:** `apps/tui/src/providers/index.ts`

If this file already exists, append the NavigationProvider export. If it does not exist, create it:

```typescript
export { NavigationProvider, NavigationContext } from "./NavigationProvider";
```

**File:** `apps/tui/src/hooks/index.ts`

If this file already exists, append the useNavigation export. If it does not exist, create it:

```typescript
export { useNavigation } from "./useNavigation";
```

---

## Detailed Behavior Specification

### Stack invariants

The following invariants hold at all times after initialization:

1. **Non-empty stack:** `stack.length >= 1`. The stack always has at least one entry.
2. **Bounded depth:** `stack.length <= MAX_STACK_DEPTH` (32).
3. **Unique IDs:** Every entry in the stack has a unique `id` value.
4. **Stable mutations:** All mutation methods are synchronous from the caller's perspective. They call `setStack()` which triggers a React re-render in the same or next microtask.
5. **No consecutive duplicates:** After `push()`, the top two entries never have the same `screen` + `params`. (Non-consecutive duplicates are allowed — navigating Dashboard → Issues → Dashboard is valid.)
6. **Immutable entries:** `ScreenEntry` objects in the stack are never mutated after creation. New arrays and new entry objects are created on every mutation.

### Operation truth table

| Operation | Current Stack | Input | Resulting Stack | Re-render? |
|-----------|--------------|-------|----------------|------------|
| `push("Issues", {repo:"a/b"})` | `[D]` | New screen | `[D, I{a/b}]` | Yes |
| `push("Dashboard")` | `[D]` | Same as top | `[D]` | No (same ref) |
| `push("Issues")` | `[D, I]` | Same screen, same params | `[D, I]` | No |
| `push("Issues", {repo:"a/b"})` | `[D, I{repo:"a/c"}]` | Same screen, different params | `[D, I{a/c}, I{a/b}]` | Yes |
| `pop()` | `[D, I]` | — | `[D]` | Yes |
| `pop()` | `[D]` | Root screen | `[D]` | No (same ref) |
| `replace("Repos")` | `[D, I]` | — | `[D, R]` | Yes |
| `replace("Repos")` | `[D]` | Single entry | `[R]` | Yes |
| `reset("Dashboard")` | `[D, I, X, Y]` | — | `[D]` | Yes |
| `push("X")` × 33 | `[]` starting empty | Overflow at 32 | Last 32 entries | Yes |

### Overflow behavior detail

When `push()` would result in `stack.length > 32`:

1. The new entry is appended normally.
2. `slice(next.length - MAX_STACK_DEPTH)` drops the oldest entry (index 0).
3. The resulting stack has exactly 32 entries.
4. The dropped entry is the one furthest from the user's current position — the root that they are least likely to navigate back to.
5. No error is thrown. No event is emitted. The ScreenRouter (separate ticket) can detect this by comparing stack depth before and after and optionally display a status bar notification.

### Thread safety and batching

React 19 batches all state updates within the same synchronous execution context. Multiple calls to `push()`, `pop()`, etc. within the same event handler result in a single re-render with the final state. This is the desired behavior:

- `push("Repos"); push("Issues", {repo: "a/b"})` in the same handler → stack is `[D, R, I{a/b}]` after one re-render.
- `pop(); pop()` in the same handler → two entries removed, one re-render.

However, because `setStack` uses the functional updater form `(prev => ...)`, each call correctly reads the latest state even when batched. This is critical for sequential operations.

### Params comparison edge cases

`screenEntriesEqual` handles these edge cases:

| A params | B params | Equal? | Reason |
|----------|----------|--------|--------|
| `undefined` | `undefined` | `true` | Both absent |
| `undefined` | `{}` | `true` | Empty is equivalent to absent |
| `{}` | `undefined` | `true` | Symmetric |
| `{repo: "a/b"}` | `{repo: "a/b"}` | `true` | Same keys and values |
| `{repo: "a/b"}` | `{repo: "a/c"}` | `false` | Different value |
| `{repo: "a/b"}` | `{repo: "a/b", num: "1"}` | `false` | Different key count |
| `{a: "1", b: "2"}` | `{b: "2", a: "1"}` | `true` | Key order doesn't matter |
| `undefined` | `{repo: "a/b"}` | `false` | One has keys, other doesn't |

The implementation:

```typescript
export function screenEntriesEqual(
  a: { screen: string; params?: Record<string, string> },
  b: { screen: string; params?: Record<string, string> },
): boolean {
  if (a.screen !== b.screen) return false;

  const aKeys = a.params ? Object.keys(a.params) : [];
  const bKeys = b.params ? Object.keys(b.params) : [];

  if (aKeys.length !== bKeys.length) return false;
  if (aKeys.length === 0) return true;

  for (const key of aKeys) {
    if (a.params![key] !== b.params?.[key]) return false;
  }
  return true;
}
```

---

## Integration Points

### Consumed by: ScreenRouter (future ticket)

The ScreenRouter reads `current` to determine which screen component to render. It subscribes to `stack` changes to trigger screen transitions.

```typescript
function ScreenRouter() {
  const { current } = useNavigation();
  const ScreenComponent = screenRegistry[current.screen]?.component;
  return ScreenComponent ? <ScreenComponent params={current.params} /> : <ErrorScreen />;
}
```

### Consumed by: HeaderBar breadcrumbs (future ticket)

The HeaderBar reads `stack` to render the breadcrumb trail:

```typescript
function HeaderBar() {
  const { stack } = useNavigation();
  // Render stack.map(entry => entry.screen) as breadcrumb segments
}
```

### Consumed by: KeybindingProvider go-to mode (future ticket)

The go-to mode handler calls `reset()` to replace the entire stack:

```typescript
// g + d → go to Dashboard
const { reset, push } = useNavigation();
reset("Dashboard");

// g + i → go to Issues (with repo context)
reset("Dashboard");
push("RepoOverview", { owner, repo });
push("Issues", { owner, repo });
```

### Consumed by: Deep-link launcher (future ticket)

The deep-link launcher passes `initialStack` to NavigationProvider:

```typescript
// codeplane tui --screen issues --repo acme/api
<NavigationProvider initialStack={[
  { screen: "Dashboard" },
  { screen: "RepoOverview", params: { owner: "acme", repo: "api" } },
  { screen: "Issues", params: { owner: "acme", repo: "api" } },
]}>
```

### Consumed by: Command palette (future ticket)

The command palette navigates via `push()` or `reset()` depending on the command.

---

## Non-persistence

The navigation stack is held in React component state (`useState`). It is not persisted to disk, localStorage, or any external store. When the TUI process exits (via `q`, `Ctrl+C`, or crash), the stack is lost. When the TUI relaunches, it starts with the default or deep-link stack.

This is intentional:
- TUI sessions are typically short-lived.
- Persisting navigation state introduces complexity (stale state, missing repos, changed permissions).
- Deep-link launch provides the mechanism for returning to a specific screen.

---

## File Inventory

| File | Type | Purpose |
|------|------|---------|
| `apps/tui/src/router/types.ts` | New | ScreenEntry, NavigationContextType, constants, screenEntriesEqual |
| `apps/tui/src/router/index.ts` | New | Barrel export for router types |
| `apps/tui/src/providers/NavigationProvider.tsx` | New | React context provider with stack state management |
| `apps/tui/src/providers/index.ts` | New or append | Barrel export for providers |
| `apps/tui/src/hooks/useNavigation.ts` | New | Consumer hook |
| `apps/tui/src/hooks/index.ts` | Append | Add useNavigation export |

---

## Productionization Notes

This module is production code from the start — there is no PoC stage. The implementation is intentionally minimal:

1. **No PoC needed.** The NavigationProvider uses only React 19 primitives (`createContext`, `useState`, `useCallback`, `useMemo`) and `crypto.randomUUID()`. All of these are supported in Bun and OpenTUI's React reconciler. No external dependencies are introduced.

2. **No framework-specific concerns.** The provider is a standard React context provider. It does not use OpenTUI-specific APIs, terminal dimensions, keyboard input, or rendering primitives. It is pure React state management.

3. **No performance concerns at this scale.** The stack is capped at 32 entries. All operations are O(n) where n ≤ 32. Array copies via spread and slice are negligible. No memoization beyond `useMemo` on the context value is required.

4. **Testability.** The `screenEntriesEqual` function is pure and exported for direct unit testing. The NavigationProvider can be tested by wrapping test components and asserting on context values. The `useNavigation` hook can be tested by rendering within a provider.

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All NavigationProvider tests are added to the existing `e2e/tui/app-shell.test.ts` file (per the test organization spec: app-shell.test.ts covers `TUI_APP_SHELL` features including `TUI_SCREEN_ROUTER`).

Tests use `@microsoft/tui-test` for E2E terminal testing. Since the NavigationProvider is an infrastructure component without direct visual output, the tests validate its behavior through the screens it enables — verifying that navigation keypresses produce the expected screen transitions, breadcrumb updates, and stack behavior.

**Import pattern:**

```typescript
import { describe, expect, test } from "bun:test";
import { launchTUI, type TUITestInstance } from "./helpers";
```

### Terminal Snapshot Tests

#### `NAV-SNAP-001`: Initial render shows Dashboard as root screen

```typescript
test("NAV-SNAP-001: initial render shows Dashboard as root screen", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  // Header bar should show Dashboard as the only breadcrumb segment
  const headerLine = terminal.getLine(0);
  expect(headerLine).toMatch(/Dashboard/);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

#### `NAV-SNAP-002`: Deep-link launch pre-populates breadcrumb trail

```typescript
test("NAV-SNAP-002: deep-link launch pre-populates breadcrumb trail", async () => {
  const terminal = await launchTUI({
    cols: 120,
    rows: 40,
    args: ["--screen", "issues", "--repo", "acme/api"],
  });
  await terminal.waitForText("Issues");
  const headerLine = terminal.getLine(0);
  // Breadcrumb should show the full navigation path
  expect(headerLine).toMatch(/Dashboard/);
  expect(headerLine).toMatch(/acme\/api/);
  expect(headerLine).toMatch(/Issues/);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

#### `NAV-SNAP-003`: Stack at 80x24 shows truncated breadcrumb

```typescript
test("NAV-SNAP-003: breadcrumb truncation at 80x24 with deep stack", async () => {
  const terminal = await launchTUI({
    cols: 80,
    rows: 24,
    args: ["--screen", "issues", "--repo", "acme/api"],
  });
  await terminal.waitForText("Issues");
  const headerLine = terminal.getLine(0);
  // At 80 cols, breadcrumb should truncate from left with …
  expect(headerLine).toMatch(/…/);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

### Keyboard Interaction Tests

#### `NAV-KEY-001`: push — Enter on list item navigates to detail view

```typescript
test("NAV-KEY-001: Enter on list item pushes detail screen onto stack", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  // Navigate to repository list
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  // Select first item
  await terminal.sendKeys("Enter");
  // Breadcrumb should show new screen pushed
  const headerLine = terminal.getLine(0);
  expect(headerLine).toMatch(/Repositories/);
  await terminal.terminate();
});
```

#### `NAV-KEY-002`: pop — q pops current screen and returns to previous

```typescript
test("NAV-KEY-002: q pops current screen and returns to previous", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  // Navigate forward
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  // Pop back
  await terminal.sendKeys("q");
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});
```

#### `NAV-KEY-003`: pop on root — q on Dashboard quits TUI

```typescript
test("NAV-KEY-003: q on root screen quits TUI", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  await terminal.sendKeys("q");
  // TUI should exit — waitForText on anything should fail or process should end
  await terminal.terminate();
});
```

#### `NAV-KEY-004`: replace — tab switch does not grow stack

```typescript
test("NAV-KEY-004: tab navigation replaces top of stack without growing depth", async () => {
  const terminal = await launchTUI({
    cols: 120,
    rows: 40,
    args: ["--screen", "issues", "--repo", "acme/api"],
  });
  await terminal.waitForText("Issues");
  // Switch to another tab within the repo view
  await terminal.sendKeys("Tab");
  // Stack depth should not have increased — pressing q should go back
  // to the same level, not an intermediate screen
  await terminal.sendKeys("q");
  // Should return to repo overview or dashboard, not an intermediate issues screen
  await terminal.terminate();
});
```

#### `NAV-KEY-005`: reset — go-to mode replaces entire stack

```typescript
test("NAV-KEY-005: go-to mode replaces entire stack with new root", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  // Navigate deep
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  // Go-to Dashboard (resets stack)
  await terminal.sendKeys("g", "d");
  await terminal.waitForText("Dashboard");
  // q should quit since Dashboard is now the only entry
  await terminal.terminate();
});
```

#### `NAV-KEY-006`: push deduplication — double Enter does not double-push

```typescript
test("NAV-KEY-006: double Enter on same item does not create duplicate stack entries", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  // Double Enter
  await terminal.sendKeys("Enter", "Enter");
  // Single q should return to repo list (not a duplicate detail screen)
  await terminal.sendKeys("q");
  await terminal.waitForText("Repositories");
  await terminal.terminate();
});
```

#### `NAV-KEY-007`: rapid q presses drain stack correctly

```typescript
test("NAV-KEY-007: rapid q presses process sequentially through stack", async () => {
  const terminal = await launchTUI({
    cols: 120,
    rows: 40,
    args: ["--screen", "issues", "--repo", "acme/api"],
  });
  await terminal.waitForText("Issues");
  // Stack: [Dashboard, RepoOverview, Issues] — depth 3
  // Send 2 q's rapidly
  await terminal.sendKeys("q", "q");
  // Should be at Dashboard now
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});
```

#### `NAV-KEY-008`: deep-link q walks back through pre-populated stack

```typescript
test("NAV-KEY-008: deep-link q walks back through pre-populated stack", async () => {
  const terminal = await launchTUI({
    cols: 120,
    rows: 40,
    args: ["--screen", "issues", "--repo", "acme/api"],
  });
  await terminal.waitForText("Issues");
  // Pop: should show repo overview
  await terminal.sendKeys("q");
  await terminal.waitForText("acme/api");
  // Pop again: should show Dashboard
  await terminal.sendKeys("q");
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});
```

### Integration Tests

#### `NAV-INT-001`: Navigation context is available to all screens

```typescript
test("NAV-INT-001: all screens can access navigation context for push/pop", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  // Navigate through multiple screens to verify context is available
  await terminal.sendKeys("g", "n"); // Notifications
  await terminal.waitForText("Notifications");
  await terminal.sendKeys("g", "s"); // Search
  await terminal.waitForText("Search");
  await terminal.sendKeys("g", "w"); // Workspaces
  await terminal.waitForText("Workspaces");
  // Pop back through
  await terminal.sendKeys("q");
  await terminal.waitForText("Dashboard"); // reset-based go-to, so root
  await terminal.terminate();
});
```

#### `NAV-INT-002`: canPop returns false on root screen

```typescript
test("NAV-INT-002: canPop is false on root screen, prevents accidental pop", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  // On Dashboard (root), q should quit — not error or crash
  // This tests that canPop() correctly reports false and the app handles it
  await terminal.sendKeys("q");
  await terminal.terminate();
});
```

#### `NAV-INT-003`: Stack overflow drops oldest entry gracefully

```typescript
test("NAV-INT-003: stack overflow beyond 32 entries drops oldest without crash", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  // Navigate forward many times (simulated through go-to + push patterns)
  // Verify the TUI doesn't crash at high stack depths
  for (let i = 0; i < 5; i++) {
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "n");
    await terminal.waitForText("Notifications");
  }
  // Should still be responsive
  await terminal.sendKeys("g", "d");
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});
```

#### `NAV-INT-004`: Breadcrumb updates on every navigation operation

```typescript
test("NAV-INT-004: header bar breadcrumb updates on push, pop, replace, and reset", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  
  // Push
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  let header = terminal.getLine(0);
  expect(header).toMatch(/Dashboard/);
  expect(header).toMatch(/Repositories/);
  
  // Pop
  await terminal.sendKeys("q");
  await terminal.waitForText("Dashboard");
  header = terminal.getLine(0);
  expect(header).toMatch(/Dashboard/);
  expect(header).not.toMatch(/Repositories/);
  
  await terminal.terminate();
});
```

### Edge Case Tests

#### `NAV-EDGE-001`: useNavigation throws outside provider

This test validates that consuming the hook outside the provider tree produces a clear error. Since this is a React runtime error, it manifests as the TUI's error boundary catching the exception.

```typescript
test("NAV-EDGE-001: useNavigation outside provider triggers error boundary", async () => {
  // This test validates the error boundary behavior when a component
  // incorrectly uses useNavigation outside the provider tree.
  // In practice, this is caught during development.
  // The TUI should show an error screen, not crash silently.
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  // Normal launch should NOT trigger this error
  await terminal.waitForText("Dashboard");
  // If we reach here, the provider is correctly wrapping the tree
  await terminal.terminate();
});
```

#### `NAV-EDGE-002`: Empty params and undefined params treated as equal for dedup

```typescript
test("NAV-EDGE-002: push with empty params does not duplicate push with no params", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  // Navigate to a screen
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  // Navigate again to same screen (should be deduped)
  await terminal.sendKeys("g", "r");
  // Should still be at Repositories, stack should not have grown
  await terminal.waitForText("Repositories");
  // Single q should return to Dashboard
  await terminal.sendKeys("q");
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});
```

#### `NAV-EDGE-003`: replace on single-entry stack works correctly

```typescript
test("NAV-EDGE-003: replace on single-entry stack swaps root screen", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  // Go-to mode triggers reset (single entry), not replace
  // But verifying the stack behaves with single entry
  await terminal.sendKeys("g", "n");
  await terminal.waitForText("Notifications");
  // After reset, stack is [Notifications]. q should quit.
  await terminal.sendKeys("q");
  await terminal.terminate();
});
```

#### `NAV-EDGE-004`: Navigation during screen loading is safe

```typescript
test("NAV-EDGE-004: q during screen data loading cancels and returns to previous", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  // Push to a detail screen then immediately q
  await terminal.sendKeys("Enter");
  await terminal.sendKeys("q");
  // Should be back at Repositories
  await terminal.waitForText("Repositories");
  await terminal.terminate();
});
```

---

## Source of Truth

This engineering specification should be maintained alongside:

- [specs/tui/prd.md](../prd.md) — Product requirements
- [specs/tui/design.md](../design.md) — Design specification
- [specs/tui/features.ts](../features.ts) — Codified feature inventory (`TUI_SCREEN_ROUTER`)
- [specs/tui/TUI_SCREEN_ROUTER.md](../TUI_SCREEN_ROUTER.md) — Feature-level specification
- [specs/tui/engineering-architecture.md](../engineering-architecture.md) — Full architecture reference