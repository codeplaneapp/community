# Engineering Specification: tui-workspace-screen-scaffold

## Ticket Summary

**Title:** Register workspace screens in screen router  
**Type:** Engineering  
**Dependency:** `tui-screen-router` (must be complete — this ticket is already satisfied based on codebase inspection)  
**Status:** Ready for implementation

---

## Overview

This ticket registers three workspace-related screen entries in the TUI screen registry and configures all navigation routes, keybindings, and deep-link support for workspace screens. The workspace screen entries currently exist in the registry with `PlaceholderScreen` components and default metadata. This ticket upgrades them with:

1. **Correct `requiresRepo` flags** — `WorkspaceDetail` and `WorkspaceCreate` must be updated to `requiresRepo: true` (they are currently `false`).
2. **Route param validation** — `workspaceId` must be UUID format for `WorkspaceDetail`.
3. **Dynamic breadcrumb labels** — `WorkspaceDetail` breadcrumb resolves to workspace name when available, falls back to truncated UUID.
4. **Go-to keybinding `g w`** — Already defined in `goToBindings.ts` but the go-to mode handler is a TODO stub; this ticket ensures `g w` works end-to-end.
5. **Deep-link support** — `codeplane tui --screen workspaces` already resolves via `deepLinks.ts`; this ticket adds validation for workspace-specific deep-link params.

---

## Current State Analysis

### What already exists

| Artifact | Location | Status |
|----------|----------|--------|
| `ScreenName.Workspaces` enum entry | `apps/tui/src/router/types.ts:7` | ✅ Present |
| `ScreenName.WorkspaceDetail` enum entry | `apps/tui/src/router/types.ts:30` | ✅ Present |
| `ScreenName.WorkspaceCreate` enum entry | `apps/tui/src/router/types.ts:31` | ✅ Present |
| Registry entry for `Workspaces` | `apps/tui/src/router/registry.ts:29-34` | ⚠️ `requiresRepo: false` — correct |
| Registry entry for `WorkspaceDetail` | `apps/tui/src/router/registry.ts:143-148` | ⚠️ `requiresRepo: false` — **must be `true`** |
| Registry entry for `WorkspaceCreate` | `apps/tui/src/router/registry.ts:149-154` | ⚠️ `requiresRepo: false` — **must be `true`** |
| Go-to binding `g w → Workspaces` | `apps/tui/src/navigation/goToBindings.ts:16` | ✅ Present, `requiresRepo: false` |
| Deep-link `workspaces → ScreenName.Workspaces` | `apps/tui/src/navigation/deepLinks.ts:28` | ✅ Present |
| Go-to mode handler | `apps/tui/src/components/GlobalKeybindings.tsx:19` | ❌ TODO stub |
| `PlaceholderScreen` component | `apps/tui/src/screens/PlaceholderScreen.tsx` | ✅ Present — used as placeholder |

### What needs to change

1. **`registry.ts`** — Update `WorkspaceDetail` and `WorkspaceCreate` to `requiresRepo: true`, add breadcrumb that shows workspace name.
2. **`deepLinks.ts`** — Add `WorkspaceDetail` and `WorkspaceCreate` to the `requiresRepo` check list; add workspace-specific deep-link params (`--workspace`).
3. **New file: `apps/tui/src/navigation/validateParams.ts`** — UUID validation utility for `workspaceId`.
4. **`NavigationProvider.tsx`** — Integrate param validation at push time.
5. **Workspace stub screens** — Create `WorkspaceListScreen`, `WorkspaceDetailScreen`, `WorkspaceCreateScreen` stub components (not full implementations — those are separate tickets).
6. **Tests** — `e2e/tui/workspaces.test.ts` for workspace screen navigation, routing, and deep-link behavior.

---

## Implementation Plan

### Step 1: Create route param validation utility

**File:** `apps/tui/src/navigation/validateParams.ts`

Create a lightweight, pure-function validation module for route params. This is the foundation for type-safe navigation throughout the TUI.

```typescript
// apps/tui/src/navigation/validateParams.ts

/**
 * UUID v4 regex pattern.
 * Matches standard UUID format: 8-4-4-4-12 hex characters.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID v4 format.
 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Validation rules for screen params.
 * Maps param name → validator function.
 * Returns null if valid, error message string if invalid.
 */
export type ParamValidator = (value: string) => string | null;

export const paramValidators: Record<string, ParamValidator> = {
  workspaceId: (value: string) =>
    isValidUUID(value) ? null : `Invalid workspace ID format: "${value}" (expected UUID)`,
};

/**
 * Validate params for a screen push/replace.
 * Returns null if all params are valid.
 * Returns an error message string for the first invalid param.
 */
export function validateParams(
  params: Record<string, string>,
): string | null {
  for (const [key, value] of Object.entries(params)) {
    const validator = paramValidators[key];
    if (validator) {
      const error = validator(value);
      if (error) return error;
    }
  }
  return null;
}
```

**Rationale:** Extracted as a standalone module so it can be tested independently and extended for other param types (issue numbers, org slugs, etc.) without modifying the NavigationProvider.

---

### Step 2: Update `NavigationProvider.tsx` to validate params at push time

**File:** `apps/tui/src/providers/NavigationProvider.tsx`

Integrate `validateParams()` into the `push()` and `replace()` functions. Invalid params prevent navigation and log a warning.

**Changes:**

1. Import `validateParams` from `../navigation/validateParams.js`.
2. In `push()`, after resolving params but before creating the entry, call `validateParams(resolvedParams)`. If validation fails, log the error via `console.warn` and return without modifying the stack.
3. Apply the same validation in `replace()`.
4. `reset()` does not validate because it always creates a root entry with minimal params.

```typescript
// In push():
const validationError = validateParams(resolvedParams);
if (validationError) {
  console.warn(`Navigation blocked: ${validationError}`);
  return prev; // No-op — return unchanged stack
}
```

**Why warn, not throw?** Navigation param validation failures are user-facing (e.g., a malformed URL in a deep link) and should degrade gracefully rather than crash.

---

### Step 3: Update screen registry entries

**File:** `apps/tui/src/router/registry.ts`

Update the three workspace screen definitions:

#### 3a. `Workspaces` (WorkspaceListScreen)

No change needed. Already correctly configured:
- `requiresRepo: false` — workspace list is a top-level screen
- `breadcrumbLabel: () => "Workspaces"` — static label

#### 3b. `WorkspaceDetail` → `requiresRepo: true`

```typescript
[ScreenName.WorkspaceDetail]: {
  component: WorkspaceDetailScreen,  // stub — imported from screens/Workspaces/
  requiresRepo: true,                // CHANGED from false
  requiresOrg: false,
  breadcrumbLabel: (p) => {
    if (p.workspaceName) return p.workspaceName;
    if (p.workspaceId) return p.workspaceId.slice(0, 8);
    return "Workspace";
  },
},
```

**Breadcrumb logic:** Prefers `workspaceName` if provided by the caller (set after data fetch), falls back to first 8 chars of UUID, then generic "Workspace".

#### 3c. `WorkspaceCreate` → `requiresRepo: true`

```typescript
[ScreenName.WorkspaceCreate]: {
  component: WorkspaceCreateScreen,  // stub — imported from screens/Workspaces/
  requiresRepo: true,                // CHANGED from false
  requiresOrg: false,
  breadcrumbLabel: () => "New Workspace",
},
```

---

### Step 4: Create workspace screen stub components

**Directory:** `apps/tui/src/screens/Workspaces/`

Create stub screen components that render the same placeholder UI but are distinct files ready for feature implementation in downstream tickets.

#### 4a. `apps/tui/src/screens/Workspaces/WorkspaceListScreen.tsx`

```typescript
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useNavigation } from "../../providers/NavigationProvider.js";
import { ScreenName } from "../../router/types.js";

export function WorkspaceListScreen({ entry, params }: ScreenComponentProps) {
  const nav = useNavigation();

  useScreenKeybindings(
    [
      {
        key: "c",
        description: "Create workspace",
        group: "Actions",
        handler: () => {
          // Requires repo context — will be a no-op until user navigates from a repo
          if (nav.repoContext) {
            nav.push(ScreenName.WorkspaceCreate, {
              owner: nav.repoContext.owner,
              repo: nav.repoContext.repo,
            });
          }
        },
      },
    ],
    [{ keys: "c", label: "create", order: 10 }],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>Workspaces</text>
      <text color="gray">This screen is not yet implemented.</text>
      {Object.entries(entry.params).length > 0 && (
        <box flexDirection="column" marginTop={1}>
          <text underline>Params:</text>
          {Object.entries(entry.params).map(([key, value]) => (
            <text key={key}>{`  ${key}: ${value}`}</text>
          ))}
        </box>
      )}
    </box>
  );
}
```

#### 4b. `apps/tui/src/screens/Workspaces/WorkspaceDetailScreen.tsx`

```typescript
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";

export function WorkspaceDetailScreen({ entry, params }: ScreenComponentProps) {
  useScreenKeybindings(
    [
      {
        key: "s",
        description: "Suspend workspace",
        group: "Actions",
        handler: () => { /* TODO: implement in tui-workspace-detail-screen */ },
      },
      {
        key: "r",
        description: "Resume workspace",
        group: "Actions",
        handler: () => { /* TODO: implement in tui-workspace-detail-screen */ },
      },
    ],
    [
      { keys: "s", label: "suspend", order: 10 },
      { keys: "r", label: "resume", order: 20 },
    ],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>Workspace Detail</text>
      <text color="gray">This screen is not yet implemented.</text>
      <box flexDirection="column" marginTop={1}>
        <text underline>Params:</text>
        {Object.entries(entry.params).map(([key, value]) => (
          <text key={key}>{`  ${key}: ${value}`}</text>
        ))}
      </box>
    </box>
  );
}
```

#### 4c. `apps/tui/src/screens/Workspaces/WorkspaceCreateScreen.tsx`

```typescript
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useNavigation } from "../../providers/NavigationProvider.js";

export function WorkspaceCreateScreen({ entry, params }: ScreenComponentProps) {
  const nav = useNavigation();

  useScreenKeybindings(
    [
      {
        key: "ctrl+s",
        description: "Create",
        group: "Actions",
        handler: () => { /* TODO: implement in tui-workspace-create-screen */ },
      },
      {
        key: "escape",
        description: "Cancel",
        group: "Actions",
        handler: () => nav.pop(),
      },
    ],
    [
      { keys: "Ctrl+S", label: "create", order: 10 },
      { keys: "Esc", label: "cancel", order: 20 },
    ],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>New Workspace</text>
      <text color="gray">This screen is not yet implemented.</text>
      <box flexDirection="column" marginTop={1}>
        <text underline>Params:</text>
        {Object.entries(entry.params).map(([key, value]) => (
          <text key={key}>{`  ${key}: ${value}`}</text>
        ))}
      </box>
    </box>
  );
}
```

#### 4d. `apps/tui/src/screens/Workspaces/index.ts`

```typescript
export { WorkspaceListScreen } from "./WorkspaceListScreen.js";
export { WorkspaceDetailScreen } from "./WorkspaceDetailScreen.js";
export { WorkspaceCreateScreen } from "./WorkspaceCreateScreen.js";
```

---

### Step 5: Update deep-link resolution for workspace screens

**File:** `apps/tui/src/navigation/deepLinks.ts`

#### 5a. Add `WorkspaceDetail` and `WorkspaceCreate` to `requiresRepo` list

In `buildInitialStack()`, the `requiresRepo` array (line 81-86) must include the two new repo-scoped workspace screens:

```typescript
const requiresRepo = [
  ScreenName.RepoOverview, ScreenName.Issues, ScreenName.IssueDetail,
  ScreenName.IssueCreate, ScreenName.IssueEdit, ScreenName.Landings,
  ScreenName.LandingDetail, ScreenName.LandingCreate, ScreenName.LandingEdit,
  ScreenName.DiffView, ScreenName.Workflows, ScreenName.WorkflowRunDetail,
  ScreenName.Wiki, ScreenName.WikiDetail,
  ScreenName.WorkspaceDetail,   // ADDED
  ScreenName.WorkspaceCreate,   // ADDED
].includes(screenName);
```

**Note:** Alternatively, this list should be derived from the registry's `requiresRepo` flag to avoid duplication. Consider a refactor:

```typescript
const requiresRepo = screenRegistry[screenName].requiresRepo;
```

This is a minor improvement that eliminates the hardcoded list entirely. Recommended as part of this ticket since the registry is the source of truth.

#### 5b. Add `workspace-detail` and `workspace-create` deep-link aliases

In `resolveScreenName()`, add aliases:

```typescript
"workspace-detail": ScreenName.WorkspaceDetail,
"workspace-create": ScreenName.WorkspaceCreate,
```

#### 5c. Add `--workspace` CLI arg for deep-linking to workspace detail

**File:** `apps/tui/src/lib/terminal.ts`

Add `workspace?: string` to `TUILaunchOptions` and parse `--workspace` flag.

**File:** `apps/tui/src/navigation/deepLinks.ts`

Add `workspaceId?: string` to `DeepLinkArgs`. When `--screen workspace-detail --workspace <uuid> --repo owner/repo` is provided:

```typescript
if (args.workspaceId) {
  params.workspaceId = args.workspaceId;
}
```

Note: `workspaceId` format validation is handled by `validateParams()` at push time — no need to duplicate it here.

---

### Step 6: Update navigation barrel exports

**File:** `apps/tui/src/navigation/index.ts`

Add the new validation module:

```typescript
export { validateParams, isValidUUID, paramValidators } from "./validateParams.js";
export type { ParamValidator } from "./validateParams.js";
```

---

### Step 7: Update screens barrel export

**File:** `apps/tui/src/screens/index.ts`

Add workspace screen re-exports:

```typescript
export { WorkspaceListScreen, WorkspaceDetailScreen, WorkspaceCreateScreen } from "./Workspaces/index.js";
```

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/navigation/validateParams.ts` | **CREATE** | UUID validation, param validator registry, `validateParams()` function |
| `apps/tui/src/navigation/index.ts` | **EDIT** | Add `validateParams` exports |
| `apps/tui/src/providers/NavigationProvider.tsx` | **EDIT** | Integrate `validateParams()` in `push()` and `replace()` |
| `apps/tui/src/router/registry.ts` | **EDIT** | Update `WorkspaceDetail` and `WorkspaceCreate` to `requiresRepo: true`, swap to stub components, update breadcrumb label |
| `apps/tui/src/navigation/deepLinks.ts` | **EDIT** | Use registry-driven `requiresRepo`, add workspace deep-link aliases, support `workspaceId` param |
| `apps/tui/src/lib/terminal.ts` | **EDIT** | Add `--workspace` CLI arg parsing |
| `apps/tui/src/screens/Workspaces/index.ts` | **CREATE** | Barrel export for workspace screen stubs |
| `apps/tui/src/screens/Workspaces/WorkspaceListScreen.tsx` | **CREATE** | Stub list screen with `c` keybinding |
| `apps/tui/src/screens/Workspaces/WorkspaceDetailScreen.tsx` | **CREATE** | Stub detail screen with `s`/`r` keybindings |
| `apps/tui/src/screens/Workspaces/WorkspaceCreateScreen.tsx` | **CREATE** | Stub create screen with `Ctrl+S`/`Esc` keybindings |
| `apps/tui/src/screens/index.ts` | **EDIT** | Re-export workspace screens |
| `e2e/tui/workspaces.test.ts` | **CREATE** | Full E2E test suite for workspace screen routing |

---

## Detailed Implementation Notes

### Go-to keybinding `g w`

The `g w` binding is already defined in `goToBindings.ts` (line 16) with `requiresRepo: false`, which is correct — the workspace list is a top-level screen.

The go-to mode handler in `GlobalKeybindings.tsx` is currently a TODO stub (line 19). **This ticket depends on the go-to mode handler being implemented.** If it is not yet implemented when this ticket is worked, the `g w` deep integration test (`WS-GOTO-001`) will fail, which is correct per testing philosophy — tests that fail due to unimplemented functionality are left failing.

The `g w` binding is already exercised by the existing test `NAV-007` in `app-shell.test.ts` (line 4154) which sends `g`, `w` and waits for "Workspaces" — confirming the binding works when go-to mode is active.

### `requiresRepo` change impact

Changing `WorkspaceDetail.requiresRepo` and `WorkspaceCreate.requiresRepo` from `false` to `true` means:

1. **`push()` auto-inherits** `owner` and `repo` from the navigation stack when not explicitly provided.
2. **Deep-link validation** requires `--repo` flag when using `--screen workspace-detail` or `--screen workspace-create`.
3. **Go-to binding** for Workspaces list (`g w`) is unaffected — it has `requiresRepo: false`.

This matches the product design: workspace detail and create screens are scoped to a repository (workspaces are created within a repo context, and workspace API endpoints are under `/api/repos/{owner}/{repo}/workspaces`).

### Deep-link refactor: derive `requiresRepo` from registry

The current `deepLinks.ts` hardcodes a list of repo-scoped screens. This is brittle — adding a new repo-scoped screen requires updating two files. The refactor:

```typescript
// Before (hardcoded list)
const requiresRepo = [
  ScreenName.RepoOverview, ScreenName.Issues, ...
].includes(screenName);

// After (registry-driven)
const definition = screenRegistry[screenName];
const requiresRepo = definition?.requiresRepo ?? false;
```

This is a safe change because `screenName` is already validated to be non-null by this point in the function. The `screenRegistry` is imported from the same package and is guaranteed to have entries for all `ScreenName` values (enforced by the completeness check at load time).

---

## Unit & Integration Tests

**File:** `e2e/tui/workspaces.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI()` helper from `e2e/tui/helpers.ts`. Tests run against a real API server. Tests that fail due to unimplemented backend features are left failing.

### Test Organization

```
e2e/tui/workspaces.test.ts
├── TUI_WORKSPACES — Screen registry
│   ├── WS-REG-001: Workspaces screen registered with requiresRepo: false
│   ├── WS-REG-002: WorkspaceDetail screen registered with requiresRepo: true
│   ├── WS-REG-003: WorkspaceCreate screen registered with requiresRepo: true
│   ├── WS-REG-004: Workspaces breadcrumb returns "Workspaces"
│   ├── WS-REG-005: WorkspaceDetail breadcrumb shows truncated UUID
│   ├── WS-REG-006: WorkspaceDetail breadcrumb shows workspaceName when provided
│   └── WS-REG-007: WorkspaceCreate breadcrumb returns "New Workspace"
│
├── TUI_WORKSPACES — Param validation
│   ├── WS-PARAM-001: valid UUID is accepted as workspaceId
│   ├── WS-PARAM-002: non-UUID workspaceId is rejected
│   ├── WS-PARAM-003: empty workspaceId is rejected
│   └── WS-PARAM-004: uppercase UUID is accepted (case-insensitive)
│
├── TUI_WORKSPACES — Go-to navigation
│   ├── WS-GOTO-001: g w navigates to Workspaces screen
│   ├── WS-GOTO-002: g w updates breadcrumb to show "Workspaces"
│   └── WS-GOTO-003: g w from repo context preserves repo in stack
│
├── TUI_WORKSPACES — Deep-link launch
│   ├── WS-DEEP-001: --screen workspaces opens workspace list
│   ├── WS-DEEP-002: --screen workspaces shows "Workspaces" in breadcrumb
│   ├── WS-DEEP-003: --screen workspace-detail --repo owner/repo --workspace <uuid> opens detail
│   ├── WS-DEEP-004: --screen workspace-detail without --repo shows error
│   ├── WS-DEEP-005: --screen workspace-create --repo owner/repo opens create form
│   └── WS-DEEP-006: --screen workspace-create without --repo shows error
│
├── TUI_WORKSPACES — Back navigation
│   ├── WS-NAV-001: q from Workspaces returns to Dashboard
│   ├── WS-NAV-002: q from WorkspaceDetail returns to Workspaces or RepoOverview
│   └── WS-NAV-003: q from WorkspaceCreate returns to previous screen
│
├── TUI_WORKSPACES — Snapshot tests
│   ├── WS-SNAP-001: Workspaces list at 80x24 (minimum breakpoint)
│   ├── WS-SNAP-002: Workspaces list at 120x40 (standard breakpoint)
│   ├── WS-SNAP-003: Workspaces list at 200x60 (large breakpoint)
│   ├── WS-SNAP-004: WorkspaceDetail placeholder at 120x40
│   └── WS-SNAP-005: WorkspaceCreate placeholder at 120x40
│
└── TUI_WORKSPACES — Screen keybinding hints
    ├── WS-HINT-001: Workspaces screen shows 'c' hint in status bar
    ├── WS-HINT-002: WorkspaceDetail shows suspend/resume hints
    └── WS-HINT-003: WorkspaceCreate shows Ctrl+S/Esc hints
```

### Full Test File

```typescript
// e2e/tui/workspaces.test.ts

import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, TERMINAL_SIZES } from "./helpers.ts";

// ---------------------------------------------------------------------------
// TUI_WORKSPACES — Screen registry (unit-style, direct import)
// ---------------------------------------------------------------------------

describe("TUI_WORKSPACES — Screen registry", () => {
  test("WS-REG-001: Workspaces screen registered with requiresRepo: false", async () => {
    const { screenRegistry, ScreenName } = await import(
      "../../apps/tui/src/router/index.js"
    );
    const def = screenRegistry[ScreenName.Workspaces];
    expect(def).toBeDefined();
    expect(def.requiresRepo).toBe(false);
    expect(typeof def.component).toBe("function");
  });

  test("WS-REG-002: WorkspaceDetail screen registered with requiresRepo: true", async () => {
    const { screenRegistry, ScreenName } = await import(
      "../../apps/tui/src/router/index.js"
    );
    const def = screenRegistry[ScreenName.WorkspaceDetail];
    expect(def).toBeDefined();
    expect(def.requiresRepo).toBe(true);
    expect(typeof def.component).toBe("function");
  });

  test("WS-REG-003: WorkspaceCreate screen registered with requiresRepo: true", async () => {
    const { screenRegistry, ScreenName } = await import(
      "../../apps/tui/src/router/index.js"
    );
    const def = screenRegistry[ScreenName.WorkspaceCreate];
    expect(def).toBeDefined();
    expect(def.requiresRepo).toBe(true);
    expect(typeof def.component).toBe("function");
  });

  test("WS-REG-004: Workspaces breadcrumb returns 'Workspaces'", async () => {
    const { screenRegistry, ScreenName } = await import(
      "../../apps/tui/src/router/index.js"
    );
    const label = screenRegistry[ScreenName.Workspaces].breadcrumbLabel({});
    expect(label).toBe("Workspaces");
  });

  test("WS-REG-005: WorkspaceDetail breadcrumb shows truncated UUID", async () => {
    const { screenRegistry, ScreenName } = await import(
      "../../apps/tui/src/router/index.js"
    );
    const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const label = screenRegistry[ScreenName.WorkspaceDetail].breadcrumbLabel({
      workspaceId: uuid,
    });
    expect(label).toBe("a1b2c3d4");
  });

  test("WS-REG-006: WorkspaceDetail breadcrumb shows workspaceName when provided", async () => {
    const { screenRegistry, ScreenName } = await import(
      "../../apps/tui/src/router/index.js"
    );
    const label = screenRegistry[ScreenName.WorkspaceDetail].breadcrumbLabel({
      workspaceId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      workspaceName: "my-dev-env",
    });
    expect(label).toBe("my-dev-env");
  });

  test("WS-REG-007: WorkspaceCreate breadcrumb returns 'New Workspace'", async () => {
    const { screenRegistry, ScreenName } = await import(
      "../../apps/tui/src/router/index.js"
    );
    const label = screenRegistry[ScreenName.WorkspaceCreate].breadcrumbLabel({});
    expect(label).toBe("New Workspace");
  });
});

// ---------------------------------------------------------------------------
// TUI_WORKSPACES — Param validation (unit-style, direct import)
// ---------------------------------------------------------------------------

describe("TUI_WORKSPACES — Param validation", () => {
  test("WS-PARAM-001: valid UUID is accepted as workspaceId", async () => {
    const { validateParams } = await import(
      "../../apps/tui/src/navigation/validateParams.js"
    );
    const result = validateParams({
      workspaceId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    expect(result).toBeNull();
  });

  test("WS-PARAM-002: non-UUID workspaceId is rejected", async () => {
    const { validateParams } = await import(
      "../../apps/tui/src/navigation/validateParams.js"
    );
    const result = validateParams({ workspaceId: "not-a-uuid" });
    expect(result).not.toBeNull();
    expect(result).toContain("Invalid workspace ID format");
  });

  test("WS-PARAM-003: empty workspaceId is rejected", async () => {
    const { validateParams } = await import(
      "../../apps/tui/src/navigation/validateParams.js"
    );
    const result = validateParams({ workspaceId: "" });
    expect(result).not.toBeNull();
  });

  test("WS-PARAM-004: uppercase UUID is accepted (case-insensitive)", async () => {
    const { validateParams } = await import(
      "../../apps/tui/src/navigation/validateParams.js"
    );
    const result = validateParams({
      workspaceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
    });
    expect(result).toBeNull();
  });

  test("WS-PARAM-005: params without workspaceId pass validation", async () => {
    const { validateParams } = await import(
      "../../apps/tui/src/navigation/validateParams.js"
    );
    const result = validateParams({ owner: "acme", repo: "widget" });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TUI_WORKSPACES — Go-to navigation (E2E, terminal interaction)
// ---------------------------------------------------------------------------

describe("TUI_WORKSPACES — Go-to navigation", () => {
  let terminal: import("./helpers.js").TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("WS-GOTO-001: g w navigates to Workspaces screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
  });

  test("WS-GOTO-002: g w updates breadcrumb to show Workspaces", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Workspaces/);
  });

  test("WS-GOTO-003: g w from repo context still navigates (workspaces are top-level)", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/widget"],
    });
    await terminal.waitForText("Issues");
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
  });
});

// ---------------------------------------------------------------------------
// TUI_WORKSPACES — Deep-link launch (E2E, terminal interaction)
// ---------------------------------------------------------------------------

describe("TUI_WORKSPACES — Deep-link launch", () => {
  let terminal: import("./helpers.js").TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("WS-DEEP-001: --screen workspaces opens workspace list", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "workspaces"],
    });
    await terminal.waitForText("Workspaces");
  });

  test("WS-DEEP-002: --screen workspaces shows Workspaces in breadcrumb", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "workspaces"],
    });
    await terminal.waitForText("Workspaces");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Workspaces/);
  });

  test("WS-DEEP-003: --screen workspace-detail --repo owner/repo --workspace <uuid> opens detail", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: [
        "--screen", "workspace-detail",
        "--repo", "acme/widget",
        "--workspace", "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      ],
    });
    await terminal.waitForText("Workspace Detail");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/a1b2c3d4/);
  });

  test("WS-DEEP-004: --screen workspace-detail without --repo shows error fallback", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "workspace-detail"],
    });
    // Should fall back to Dashboard because workspace-detail requires repo
    await terminal.waitForText("Dashboard");
  });

  test("WS-DEEP-005: --screen workspace-create --repo owner/repo opens create form", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "workspace-create", "--repo", "acme/widget"],
    });
    await terminal.waitForText("New Workspace");
  });

  test("WS-DEEP-006: --screen workspace-create without --repo shows error fallback", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "workspace-create"],
    });
    await terminal.waitForText("Dashboard");
  });
});

// ---------------------------------------------------------------------------
// TUI_WORKSPACES — Back navigation (E2E, terminal interaction)
// ---------------------------------------------------------------------------

describe("TUI_WORKSPACES — Back navigation", () => {
  let terminal: import("./helpers.js").TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("WS-NAV-001: q from Workspaces returns to Dashboard", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("WS-NAV-002: q from deep-linked WorkspaceDetail returns toward stack root", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: [
        "--screen", "workspace-detail",
        "--repo", "acme/widget",
        "--workspace", "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      ],
    });
    await terminal.waitForText("Workspace Detail");
    await terminal.sendKeys("q");
    // Should navigate back toward RepoOverview or Dashboard
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/acme\/widget|Dashboard/);
  });

  test("WS-NAV-003: q from WorkspaceCreate returns to previous screen", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "workspace-create", "--repo", "acme/widget"],
    });
    await terminal.waitForText("New Workspace");
    await terminal.sendKeys("q");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/acme\/widget|Dashboard/);
  });
});

// ---------------------------------------------------------------------------
// TUI_WORKSPACES — Snapshot tests
// ---------------------------------------------------------------------------

describe("TUI_WORKSPACES — Snapshot tests", () => {
  let terminal: import("./helpers.js").TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("WS-SNAP-001: Workspaces list at 80x24 (minimum breakpoint)", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      args: ["--screen", "workspaces"],
    });
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("WS-SNAP-002: Workspaces list at 120x40 (standard breakpoint)", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "workspaces"],
    });
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("WS-SNAP-003: Workspaces list at 200x60 (large breakpoint)", async () => {
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      args: ["--screen", "workspaces"],
    });
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("WS-SNAP-004: WorkspaceDetail placeholder at 120x40", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: [
        "--screen", "workspace-detail",
        "--repo", "acme/widget",
        "--workspace", "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      ],
    });
    await terminal.waitForText("Workspace Detail");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("WS-SNAP-005: WorkspaceCreate placeholder at 120x40", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "workspace-create", "--repo", "acme/widget"],
    });
    await terminal.waitForText("New Workspace");
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// TUI_WORKSPACES — Screen keybinding hints
// ---------------------------------------------------------------------------

describe("TUI_WORKSPACES — Screen keybinding hints", () => {
  let terminal: import("./helpers.js").TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("WS-HINT-001: Workspaces screen shows create hint in status bar", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "workspaces"],
    });
    await terminal.waitForText("Workspaces");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/c.*create|create.*c/i);
  });

  test("WS-HINT-002: WorkspaceDetail shows suspend/resume hints", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: [
        "--screen", "workspace-detail",
        "--repo", "acme/widget",
        "--workspace", "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      ],
    });
    await terminal.waitForText("Workspace Detail");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/suspend|resume/i);
  });

  test("WS-HINT-003: WorkspaceCreate shows Ctrl+S and Esc hints", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "workspace-create", "--repo", "acme/widget"],
    });
    await terminal.waitForText("New Workspace");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/create|cancel/i);
  });
});

// ---------------------------------------------------------------------------
// TUI_WORKSPACES — Go-to binding definition (unit-style, direct import)
// ---------------------------------------------------------------------------

describe("TUI_WORKSPACES — Go-to binding definition", () => {
  test("WS-GOTO-DEF-001: goToBindings includes 'w' for Workspaces", async () => {
    const { goToBindings } = await import(
      "../../apps/tui/src/navigation/goToBindings.js"
    );
    const wsBinding = goToBindings.find((b) => b.key === "w");
    expect(wsBinding).toBeDefined();
    expect(wsBinding!.screen).toBe("Workspaces");
    expect(wsBinding!.requiresRepo).toBe(false);
  });
});
```

---

## Productionizing POC Code

This ticket introduces no proof-of-concept code. All changes are production-quality from the start:

1. **`validateParams.ts`** — Pure functions with no side effects, fully typed, tested via unit-style imports in E2E tests. No external dependencies. Ready for production use across all screens.

2. **Workspace screen stubs** — Follow the identical pattern as `PlaceholderScreen` but with screen-specific keybinding registrations. They are intentionally minimal (no data fetching, no real UI) because the full implementations are covered by downstream tickets (`tui-workspace-list-screen`, `tui-workspace-detail-screen`, `tui-workspace-create-screen`). The stubs:
   - Register correct screen-specific keybindings via `useScreenKeybindings()`
   - Show placeholder UI that confirms the screen is reachable
   - Display params for debugging deep-link and navigation correctness
   - Are importable and renderable without any additional dependencies

3. **Registry changes** — Direct production edits to existing registry entries. No feature flags needed.

4. **Deep-link refactor** — The change from hardcoded `requiresRepo` list to registry-driven lookup is a strict improvement that eliminates a maintenance burden. The existing deep-link tests in `app-shell.test.ts` serve as regression coverage.

---

## Acceptance Criteria

- [ ] `ScreenName.Workspaces` is registered with `requiresRepo: false`, renders `WorkspaceListScreen`
- [ ] `ScreenName.WorkspaceDetail` is registered with `requiresRepo: true`, renders `WorkspaceDetailScreen`, params include `{ owner, repo, workspaceId }`
- [ ] `ScreenName.WorkspaceCreate` is registered with `requiresRepo: true`, renders `WorkspaceCreateScreen`, params include `{ owner, repo }`
- [ ] `WorkspaceDetail` breadcrumb shows workspace name when available, falls back to truncated UUID
- [ ] `WorkspaceCreate` breadcrumb shows "New Workspace"
- [ ] `workspaceId` param is validated as UUID format at navigation push time
- [ ] Invalid `workspaceId` format blocks navigation with a console warning
- [ ] `g w` go-to binding navigates to Workspaces screen (when go-to mode is implemented)
- [ ] `codeplane tui --screen workspaces` opens workspace list directly
- [ ] `codeplane tui --screen workspace-detail --repo owner/repo --workspace <uuid>` opens workspace detail
- [ ] `codeplane tui --screen workspace-create --repo owner/repo` opens workspace create
- [ ] `--screen workspace-detail` without `--repo` falls back to Dashboard with error
- [ ] `--screen workspace-create` without `--repo` falls back to Dashboard with error
- [ ] `tsc --noEmit` passes with zero errors
- [ ] All tests in `e2e/tui/workspaces.test.ts` are present and not skipped
- [ ] Existing tests in `e2e/tui/app-shell.test.ts` continue to pass (especially NAV-REG-004 which asserts 32 registry entries)

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Go-to mode handler is still a TODO stub | Medium | Tests `WS-GOTO-001`–`WS-GOTO-003` will fail if go-to mode is not implemented. This is expected per testing philosophy — failing tests are signals, not problems to hide. |
| Changing `requiresRepo` on `WorkspaceDetail`/`WorkspaceCreate` breaks existing test NAV-REG-004 count | Low | The count (32) stays the same — we're updating flags, not adding/removing entries. |
| Deep-link refactor from hardcoded list to registry lookup has subtle behavior difference | Low | The registry is the canonical source. Both paths produce the same result. Existing deep-link tests provide regression coverage. |
| `validateParams()` blocks navigation for params that were previously allowed | Low | Only `workspaceId` has a validator. Other params (owner, repo, number, etc.) have no validators and pass through unchanged. New validators for other params can be added incrementally in future tickets. |