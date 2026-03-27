# Engineering Specification: `tui-workflow-screen-scaffold`

## Scaffold Workflows screen directory structure and screen registry entries

**Ticket ID:** `tui-workflow-screen-scaffold`
**Type:** Engineering
**Dependencies:** `tui-screen-router`, `tui-global-keybindings`
**Feature Group:** `TUI_WORKFLOWS`

---

## Summary

Create the `apps/tui/src/screens/Workflows/` directory structure with six placeholder screen components, register four new `ScreenName` enum entries in the screen router, update the screen registry, wire the `g f` go-to keybinding (already defined in `goToBindings.ts`), and extend deep-link argument parsing to support `--screen workflows`, `--screen workflow-runs`, `--screen workflow-run`, and `--screen workflow-caches`.

This ticket establishes the structural foundation for all subsequent workflow feature tickets. No data fetching, SSE streaming, or business logic is implemented here — only placeholder screens, registry wiring, navigation integration, and deep-link support.

---

## Context & Current State

### Existing ScreenName entries

The `ScreenName` enum in `apps/tui/src/router/types.ts` already defines two workflow-related entries:

- `Workflows = "Workflows"` — used by go-to binding `g f` and deep-link `--screen workflows`
- `WorkflowRunDetail = "WorkflowRunDetail"` — used for individual run detail navigation

Both currently point to `PlaceholderScreen` in the registry.

### Missing ScreenName entries

The ticket requires six screen IDs. Four are **not yet defined** in the `ScreenName` enum:

| Required Screen ID | Current Status |
|---|---|
| `workflow-list` → `ScreenName.Workflows` | ✅ Exists |
| `workflow-run-list` → `ScreenName.WorkflowRunList` | ❌ Missing from enum |
| `workflow-run-detail` → `ScreenName.WorkflowRunDetail` | ✅ Exists |
| `workflow-log-viewer` → `ScreenName.WorkflowLogViewer` | ❌ Missing from enum |
| `workflow-artifacts` → `ScreenName.WorkflowArtifacts` | ❌ Missing from enum |
| `workflow-caches` → `ScreenName.WorkflowCaches` | ❌ Missing from enum |

### Go-to binding

The `g f` binding already exists in `apps/tui/src/navigation/goToBindings.ts` mapping to `ScreenName.Workflows` with `requiresRepo: true`. The binding is defined but the go-to mode dispatch in `KeybindingProvider` may need verification that it actually activates. This ticket should confirm it works end-to-end.

### Deep-link support

The `resolveScreenName()` function in `apps/tui/src/navigation/deepLinks.ts` maps `"workflows"` → `ScreenName.Workflows`. The new deep-link aliases (`workflow-runs`, `workflow-run`, `workflow-caches`) must be added.

---

## Implementation Plan

### Step 1: Add new ScreenName enum entries

**File:** `apps/tui/src/router/types.ts`

Add four new entries to the `ScreenName` enum under the `// Repo-scoped screens` section:

```typescript
// Repo-scoped screens
// ... existing entries ...
Workflows = "Workflows",              // already exists
WorkflowRunList = "WorkflowRunList",   // NEW
WorkflowRunDetail = "WorkflowRunDetail", // already exists
WorkflowLogViewer = "WorkflowLogViewer", // NEW
WorkflowArtifacts = "WorkflowArtifacts", // NEW
WorkflowCaches = "WorkflowCaches",       // NEW
```

**Placement:** Insert the new entries after the existing `WorkflowRunDetail` line, maintaining alphabetical grouping of workflow screens. The final enum should list all six workflow screens contiguously:

```typescript
// Workflow screens (6)
Workflows = "Workflows",
WorkflowRunList = "WorkflowRunList",
WorkflowRunDetail = "WorkflowRunDetail",
WorkflowLogViewer = "WorkflowLogViewer",
WorkflowArtifacts = "WorkflowArtifacts",
WorkflowCaches = "WorkflowCaches",
```

**Validation:** The existing runtime check at the bottom of `registry.ts` will catch any mismatch between enum values and registry entries, so the registry update in Step 3 must happen in the same commit.

---

### Step 2: Create Workflows screen directory and placeholder components

**Directory:** `apps/tui/src/screens/Workflows/`

Create the following files:

#### 2a. `apps/tui/src/screens/Workflows/WorkflowListScreen.tsx`

```tsx
import type { ScreenComponentProps } from "../../router/types.js";

export function WorkflowListScreen({ entry }: ScreenComponentProps) {
  const paramEntries = Object.entries(entry.params);

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>Workflows</text>
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

#### 2b. `apps/tui/src/screens/Workflows/WorkflowRunListScreen.tsx`

Same pattern as above with title `"Workflow Runs"`.

```tsx
import type { ScreenComponentProps } from "../../router/types.js";

export function WorkflowRunListScreen({ entry }: ScreenComponentProps) {
  const paramEntries = Object.entries(entry.params);

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>Workflow Runs</text>
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

#### 2c. `apps/tui/src/screens/Workflows/WorkflowRunDetailScreen.tsx`

Title: `"Workflow Run Detail"`. Renders `Run #{runId}` from params if available.

```tsx
import type { ScreenComponentProps } from "../../router/types.js";

export function WorkflowRunDetailScreen({ entry }: ScreenComponentProps) {
  const paramEntries = Object.entries(entry.params);
  const runId = entry.params.runId;

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>{runId ? `Workflow Run #${runId}` : "Workflow Run Detail"}</text>
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

#### 2d. `apps/tui/src/screens/Workflows/WorkflowLogViewer.tsx`

Title: `"Workflow Log Viewer"`.

```tsx
import type { ScreenComponentProps } from "../../router/types.js";

export function WorkflowLogViewer({ entry }: ScreenComponentProps) {
  const paramEntries = Object.entries(entry.params);

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>Workflow Log Viewer</text>
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

#### 2e. `apps/tui/src/screens/Workflows/WorkflowArtifactsView.tsx`

Title: `"Workflow Artifacts"`.

```tsx
import type { ScreenComponentProps } from "../../router/types.js";

export function WorkflowArtifactsView({ entry }: ScreenComponentProps) {
  const paramEntries = Object.entries(entry.params);

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>Workflow Artifacts</text>
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

#### 2f. `apps/tui/src/screens/Workflows/WorkflowCacheView.tsx`

Title: `"Workflow Caches"`.

```tsx
import type { ScreenComponentProps } from "../../router/types.js";

export function WorkflowCacheView({ entry }: ScreenComponentProps) {
  const paramEntries = Object.entries(entry.params);

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>Workflow Caches</text>
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

#### 2g. `apps/tui/src/screens/Workflows/index.ts`

Barrel export following the project convention (`.js` extension for ESM):

```typescript
export { WorkflowListScreen } from "./WorkflowListScreen.js";
export { WorkflowRunListScreen } from "./WorkflowRunListScreen.js";
export { WorkflowRunDetailScreen } from "./WorkflowRunDetailScreen.js";
export { WorkflowLogViewer } from "./WorkflowLogViewer.js";
export { WorkflowArtifactsView } from "./WorkflowArtifactsView.js";
export { WorkflowCacheView } from "./WorkflowCacheView.js";
```

---

### Step 3: Update screen registry

**File:** `apps/tui/src/router/registry.ts`

Import the new screen components and update the existing workflow entries while adding four new entries.

**Import change:**

Add import for the new Workflows barrel:

```typescript
import {
  WorkflowListScreen,
  WorkflowRunListScreen,
  WorkflowRunDetailScreen,
  WorkflowLogViewer,
  WorkflowArtifactsView,
  WorkflowCacheView,
} from "../screens/Workflows/index.js";
```

**Registry entries:**

Replace the existing `ScreenName.Workflows` and `ScreenName.WorkflowRunDetail` entries that currently use `PlaceholderScreen`, and add four new entries:

```typescript
[ScreenName.Workflows]: {
  component: WorkflowListScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "Workflows",
},
[ScreenName.WorkflowRunList]: {
  component: WorkflowRunListScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => p.workflowName ? `${p.workflowName} Runs` : "Runs",
},
[ScreenName.WorkflowRunDetail]: {
  component: WorkflowRunDetailScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.runId ? `Run #${p.runId}` : "Run"),
},
[ScreenName.WorkflowLogViewer]: {
  component: WorkflowLogViewer,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.stepName ? `Logs: ${p.stepName}` : "Logs"),
},
[ScreenName.WorkflowArtifacts]: {
  component: WorkflowArtifactsView,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "Artifacts",
},
[ScreenName.WorkflowCaches]: {
  component: WorkflowCacheView,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "Caches",
},
```

**Key design decisions:**

- `WorkflowRunList` accepts `workflowName` param for the breadcrumb label (e.g., `"CI Runs"` or `"Deploy Runs"`). Falls back to `"Runs"` if not provided.
- `WorkflowLogViewer` accepts `stepName` param for breadcrumb (e.g., `"Logs: build"`). Falls back to `"Logs"`.
- `WorkflowArtifacts` requires repo context but also accepts `runId` param for scoping to a specific run.
- `WorkflowCaches` requires repo context. It is a repository-level screen, not run-scoped.
- All six screens set `requiresRepo: true` — workflows are always scoped to a repository.
- All six screens set `requiresOrg: false` — workflows are accessed via repo context, not org context.

---

### Step 4: Update screens barrel export

**File:** `apps/tui/src/screens/index.ts`

Update the empty barrel export to re-export the Workflows module:

```typescript
/**
 * Screen components for the TUI application.
 */
export * from "./Workflows/index.js";
```

---

### Step 5: Wire deep-link argument parsing

**File:** `apps/tui/src/navigation/deepLinks.ts`

Add new entries to the `resolveScreenName()` function's `map` object:

```typescript
const map: Record<string, ScreenName> = {
  // ... existing entries ...
  workflows: ScreenName.Workflows,                   // already exists
  "workflow-runs": ScreenName.WorkflowRunList,        // NEW
  "workflow-run": ScreenName.WorkflowRunDetail,       // NEW
  "workflow-run-detail": ScreenName.WorkflowRunDetail, // NEW (alias)
  "workflow-log": ScreenName.WorkflowLogViewer,       // NEW
  "workflow-logs": ScreenName.WorkflowLogViewer,      // NEW (alias)
  "workflow-artifacts": ScreenName.WorkflowArtifacts, // NEW
  "workflow-caches": ScreenName.WorkflowCaches,       // NEW
};
```

Also update the `requiresRepo` array to include the four new screen names:

```typescript
const requiresRepo = [
  // ... existing entries ...
  ScreenName.Workflows, ScreenName.WorkflowRunDetail,  // already present
  ScreenName.WorkflowRunList,                          // NEW
  ScreenName.WorkflowLogViewer,                        // NEW
  ScreenName.WorkflowArtifacts,                        // NEW
  ScreenName.WorkflowCaches,                           // NEW
].includes(screenName);
```

**Deep-link usage examples:**

```bash
codeplane tui --screen workflows --repo alice/myapp
# Stack: [Dashboard, RepoOverview(alice/myapp), Workflows(alice/myapp)]

codeplane tui --screen workflow-runs --repo alice/myapp
# Stack: [Dashboard, RepoOverview(alice/myapp), WorkflowRunList(alice/myapp)]

codeplane tui --screen workflow-run --repo alice/myapp
# Stack: [Dashboard, RepoOverview(alice/myapp), WorkflowRunDetail(alice/myapp)]
# Note: runId not provided via deep-link, screen handles gracefully

codeplane tui --screen workflow-caches --repo alice/myapp
# Stack: [Dashboard, RepoOverview(alice/myapp), WorkflowCaches(alice/myapp)]
```

---

### Step 6: Verify `g f` go-to binding wiring

The `g f` binding is already defined in `apps/tui/src/navigation/goToBindings.ts`:

```typescript
{ key: "f", screen: ScreenName.Workflows, requiresRepo: true, description: "Workflows" },
```

And `executeGoTo()` handles the navigation:

```typescript
export function executeGoTo(nav, binding, repoContext) {
  if (binding.requiresRepo && !repoContext) {
    return { error: "No repository in context" };
  }
  nav.reset(ScreenName.Dashboard);
  if (repoContext) {
    nav.push(ScreenName.RepoOverview, { owner: repoContext.owner, repo: repoContext.repo });
  }
  nav.push(binding.screen, params);
  return {};
}
```

**Verification needed:** Confirm that the go-to mode activation in `KeybindingProvider` (the `g` key handler and subsequent key dispatch with 1500ms timeout) is fully wired. If go-to mode is marked as TODO in `GlobalKeybindings.tsx` or `useGlobalKeybindings.ts`, this ticket must complete the wiring or document the gap.

**Expected behavior:**

1. User presses `g` → status bar shows go-to hints → 1500ms timeout starts
2. User presses `f` within timeout → `executeGoTo()` called with `ScreenName.Workflows`
3. If `repoContext` is non-null: stack resets to `[Dashboard, RepoOverview, Workflows]`
4. If `repoContext` is null: status bar shows "No repository in context" error for 3s
5. After timeout without second key: go-to mode silently cancels

**If go-to mode is not yet wired in the keybinding provider:** This ticket should note the dependency gap but NOT implement the full go-to mode system (that belongs to `tui-global-keybindings`). The binding definition in `goToBindings.ts` is sufficient for this scaffold ticket. The E2E test for `g f` should be written and left failing until go-to mode is fully wired.

---

## File Inventory

### New files (7)

| File | Purpose |
|---|---|
| `apps/tui/src/screens/Workflows/index.ts` | Barrel export for all workflow screen components |
| `apps/tui/src/screens/Workflows/WorkflowListScreen.tsx` | Placeholder for workflow definition list |
| `apps/tui/src/screens/Workflows/WorkflowRunListScreen.tsx` | Placeholder for workflow run list |
| `apps/tui/src/screens/Workflows/WorkflowRunDetailScreen.tsx` | Placeholder for workflow run detail |
| `apps/tui/src/screens/Workflows/WorkflowLogViewer.tsx` | Placeholder for full-screen log viewer |
| `apps/tui/src/screens/Workflows/WorkflowArtifactsView.tsx` | Placeholder for artifacts browser |
| `apps/tui/src/screens/Workflows/WorkflowCacheView.tsx` | Placeholder for cache management |

### Modified files (4)

| File | Change |
|---|---|
| `apps/tui/src/router/types.ts` | Add 4 new `ScreenName` enum entries |
| `apps/tui/src/router/registry.ts` | Replace 2 placeholder entries, add 4 new entries with dedicated components |
| `apps/tui/src/navigation/deepLinks.ts` | Add deep-link aliases and `requiresRepo` entries |
| `apps/tui/src/screens/index.ts` | Add barrel re-export for Workflows module |

---

## Acceptance Criteria

1. **All 6 workflow screen IDs are registered in the screen registry** — `Workflows`, `WorkflowRunList`, `WorkflowRunDetail`, `WorkflowLogViewer`, `WorkflowArtifacts`, `WorkflowCaches` all map to dedicated component files (not generic `PlaceholderScreen`).

2. **`g f` with repo context navigates to workflow-list screen** — When a repository is in the navigation stack context, pressing `g` then `f` resets the stack to `[Dashboard, RepoOverview, Workflows]`.

3. **Deep-link `--screen workflows --repo owner/repo` opens workflow list** — And analogously for `--screen workflow-runs`, `--screen workflow-run`, `--screen workflow-caches`.

4. **Each placeholder screen renders its title and pops on `q`** — Each screen shows its name in bold and "This screen is not yet implemented." in gray. The global `q` keybinding pops the screen.

5. **Breadcrumb trail renders correctly for each screen** — Breadcrumbs show `Dashboard › owner/repo › Workflows`, `Dashboard › owner/repo › Workflows › Runs`, `Dashboard › owner/repo › Workflows › Run #42`, etc.

6. **Runtime registry validation passes** — The exhaustive check at the bottom of `registry.ts` confirms all `ScreenName` values have registry entries.

7. **TypeScript compilation succeeds** — `tsc --noEmit` passes with no errors.

---

## Unit & Integration Tests

**File:** `e2e/tui/workflows.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests that depend on go-to mode being fully wired or backend APIs will be left failing — they are never skipped or commented out.

### Test Structure

```typescript
import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  TUI_ROOT,
  TUI_SRC,
  launchTUI,
  TERMINAL_SIZES,
  type TUITestInstance,
} from "./helpers";
```

### Test Group 1: Directory structure and file scaffold

```typescript
describe("TUI_WORKFLOWS — Screen scaffold", () => {
  test("Workflows screen directory exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Workflows"))).toBe(true);
  });

  test("Workflows barrel export exists at screens/Workflows/index.ts", () => {
    expect(existsSync(join(TUI_SRC, "screens/Workflows/index.ts"))).toBe(true);
  });

  test("WorkflowListScreen.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Workflows/WorkflowListScreen.tsx"))).toBe(true);
  });

  test("WorkflowRunListScreen.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Workflows/WorkflowRunListScreen.tsx"))).toBe(true);
  });

  test("WorkflowRunDetailScreen.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Workflows/WorkflowRunDetailScreen.tsx"))).toBe(true);
  });

  test("WorkflowLogViewer.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Workflows/WorkflowLogViewer.tsx"))).toBe(true);
  });

  test("WorkflowArtifactsView.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Workflows/WorkflowArtifactsView.tsx"))).toBe(true);
  });

  test("WorkflowCacheView.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Workflows/WorkflowCacheView.tsx"))).toBe(true);
  });
});
```

### Test Group 2: Screen registry validation

```typescript
describe("TUI_WORKFLOWS — Screen registry", () => {
  test("ScreenName enum includes Workflows", async () => {
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(ScreenName.Workflows).toBe("Workflows");
  });

  test("ScreenName enum includes WorkflowRunList", async () => {
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(ScreenName.WorkflowRunList).toBe("WorkflowRunList");
  });

  test("ScreenName enum includes WorkflowRunDetail", async () => {
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(ScreenName.WorkflowRunDetail).toBe("WorkflowRunDetail");
  });

  test("ScreenName enum includes WorkflowLogViewer", async () => {
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(ScreenName.WorkflowLogViewer).toBe("WorkflowLogViewer");
  });

  test("ScreenName enum includes WorkflowArtifacts", async () => {
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(ScreenName.WorkflowArtifacts).toBe("WorkflowArtifacts");
  });

  test("ScreenName enum includes WorkflowCaches", async () => {
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(ScreenName.WorkflowCaches).toBe("WorkflowCaches");
  });

  test("screenRegistry maps Workflows to WorkflowListScreen (not PlaceholderScreen)", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const def = screenRegistry[ScreenName.Workflows];
    expect(def).toBeDefined();
    expect(def.component.name).toBe("WorkflowListScreen");
    expect(def.requiresRepo).toBe(true);
    expect(def.requiresOrg).toBe(false);
  });

  test("screenRegistry maps WorkflowRunList to WorkflowRunListScreen", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const def = screenRegistry[ScreenName.WorkflowRunList];
    expect(def).toBeDefined();
    expect(def.component.name).toBe("WorkflowRunListScreen");
    expect(def.requiresRepo).toBe(true);
  });

  test("screenRegistry maps WorkflowRunDetail to WorkflowRunDetailScreen", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const def = screenRegistry[ScreenName.WorkflowRunDetail];
    expect(def).toBeDefined();
    expect(def.component.name).toBe("WorkflowRunDetailScreen");
    expect(def.requiresRepo).toBe(true);
  });

  test("screenRegistry maps WorkflowLogViewer to WorkflowLogViewer", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const def = screenRegistry[ScreenName.WorkflowLogViewer];
    expect(def).toBeDefined();
    expect(def.component.name).toBe("WorkflowLogViewer");
    expect(def.requiresRepo).toBe(true);
  });

  test("screenRegistry maps WorkflowArtifacts to WorkflowArtifactsView", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const def = screenRegistry[ScreenName.WorkflowArtifacts];
    expect(def).toBeDefined();
    expect(def.component.name).toBe("WorkflowArtifactsView");
    expect(def.requiresRepo).toBe(true);
  });

  test("screenRegistry maps WorkflowCaches to WorkflowCacheView", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const def = screenRegistry[ScreenName.WorkflowCaches];
    expect(def).toBeDefined();
    expect(def.component.name).toBe("WorkflowCacheView");
    expect(def.requiresRepo).toBe(true);
  });

  test("screenRegistry exhaustive check passes at import time", async () => {
    // The registry module throws at module evaluation time if any ScreenName is missing.
    // If this import succeeds, all enum values are mapped.
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const allNames = Object.values(ScreenName);
    for (const name of allNames) {
      expect(screenRegistry[name]).toBeDefined();
    }
  });
});
```

### Test Group 3: Breadcrumb labels

```typescript
describe("TUI_WORKFLOWS — Breadcrumb labels", () => {
  test("Workflows breadcrumb returns 'Workflows'", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(screenRegistry[ScreenName.Workflows].breadcrumbLabel({})).toBe("Workflows");
  });

  test("WorkflowRunList breadcrumb returns workflow name when provided", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(screenRegistry[ScreenName.WorkflowRunList].breadcrumbLabel({ workflowName: "CI" })).toBe("CI Runs");
  });

  test("WorkflowRunList breadcrumb falls back to 'Runs' when no workflowName", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(screenRegistry[ScreenName.WorkflowRunList].breadcrumbLabel({})).toBe("Runs");
  });

  test("WorkflowRunDetail breadcrumb includes run ID", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(screenRegistry[ScreenName.WorkflowRunDetail].breadcrumbLabel({ runId: "42" })).toBe("Run #42");
  });

  test("WorkflowRunDetail breadcrumb falls back to 'Run'", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(screenRegistry[ScreenName.WorkflowRunDetail].breadcrumbLabel({})).toBe("Run");
  });

  test("WorkflowLogViewer breadcrumb includes step name", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(screenRegistry[ScreenName.WorkflowLogViewer].breadcrumbLabel({ stepName: "build" })).toBe("Logs: build");
  });

  test("WorkflowLogViewer breadcrumb falls back to 'Logs'", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(screenRegistry[ScreenName.WorkflowLogViewer].breadcrumbLabel({})).toBe("Logs");
  });

  test("WorkflowArtifacts breadcrumb returns 'Artifacts'", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(screenRegistry[ScreenName.WorkflowArtifacts].breadcrumbLabel({})).toBe("Artifacts");
  });

  test("WorkflowCaches breadcrumb returns 'Caches'", async () => {
    const { screenRegistry } = await import("../../apps/tui/src/router/registry.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    expect(screenRegistry[ScreenName.WorkflowCaches].breadcrumbLabel({})).toBe("Caches");
  });
});
```

### Test Group 4: Deep-link argument parsing

```typescript
describe("TUI_WORKFLOWS — Deep-link parsing", () => {
  test("--screen workflows resolves to Workflows screen", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const result = buildInitialStack({ screen: "workflows", repo: "alice/myapp" });
    expect(result.error).toBeUndefined();
    const top = result.stack[result.stack.length - 1];
    expect(top.screen).toBe(ScreenName.Workflows);
  });

  test("--screen workflow-runs resolves to WorkflowRunList screen", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const result = buildInitialStack({ screen: "workflow-runs", repo: "alice/myapp" });
    expect(result.error).toBeUndefined();
    const top = result.stack[result.stack.length - 1];
    expect(top.screen).toBe(ScreenName.WorkflowRunList);
  });

  test("--screen workflow-run resolves to WorkflowRunDetail screen", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const result = buildInitialStack({ screen: "workflow-run", repo: "alice/myapp" });
    expect(result.error).toBeUndefined();
    const top = result.stack[result.stack.length - 1];
    expect(top.screen).toBe(ScreenName.WorkflowRunDetail);
  });

  test("--screen workflow-caches resolves to WorkflowCaches screen", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const result = buildInitialStack({ screen: "workflow-caches", repo: "alice/myapp" });
    expect(result.error).toBeUndefined();
    const top = result.stack[result.stack.length - 1];
    expect(top.screen).toBe(ScreenName.WorkflowCaches);
  });

  test("--screen workflow-runs without --repo returns error", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const result = buildInitialStack({ screen: "workflow-runs" });
    expect(result.error).toBeDefined();
    expect(result.error).toContain("--repo required");
  });

  test("--screen workflow-caches without --repo returns error", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const result = buildInitialStack({ screen: "workflow-caches" });
    expect(result.error).toBeDefined();
    expect(result.error).toContain("--repo required");
  });

  test("deep-link workflows builds correct stack: Dashboard > RepoOverview > Workflows", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const result = buildInitialStack({ screen: "workflows", repo: "alice/myapp" });
    expect(result.stack.length).toBe(3);
    expect(result.stack[0].screen).toBe(ScreenName.Dashboard);
    expect(result.stack[1].screen).toBe(ScreenName.RepoOverview);
    expect(result.stack[1].params.owner).toBe("alice");
    expect(result.stack[1].params.repo).toBe("myapp");
    expect(result.stack[2].screen).toBe(ScreenName.Workflows);
    expect(result.stack[2].params.owner).toBe("alice");
    expect(result.stack[2].params.repo).toBe("myapp");
  });

  test("deep-link workflow-runs builds correct stack: Dashboard > RepoOverview > WorkflowRunList", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const result = buildInitialStack({ screen: "workflow-runs", repo: "alice/myapp" });
    expect(result.stack.length).toBe(3);
    expect(result.stack[0].screen).toBe(ScreenName.Dashboard);
    expect(result.stack[1].screen).toBe(ScreenName.RepoOverview);
    expect(result.stack[2].screen).toBe(ScreenName.WorkflowRunList);
  });

  test("--screen workflow-run-detail is alias for WorkflowRunDetail", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const result = buildInitialStack({ screen: "workflow-run-detail", repo: "alice/myapp" });
    expect(result.error).toBeUndefined();
    const top = result.stack[result.stack.length - 1];
    expect(top.screen).toBe(ScreenName.WorkflowRunDetail);
  });

  test("--screen workflow-logs resolves to WorkflowLogViewer", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const result = buildInitialStack({ screen: "workflow-logs", repo: "alice/myapp" });
    expect(result.error).toBeUndefined();
    const top = result.stack[result.stack.length - 1];
    expect(top.screen).toBe(ScreenName.WorkflowLogViewer);
  });

  test("--screen workflow-artifacts resolves to WorkflowArtifacts", async () => {
    const { buildInitialStack } = await import("../../apps/tui/src/navigation/deepLinks.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const result = buildInitialStack({ screen: "workflow-artifacts", repo: "alice/myapp" });
    expect(result.error).toBeUndefined();
    const top = result.stack[result.stack.length - 1];
    expect(top.screen).toBe(ScreenName.WorkflowArtifacts);
  });
});
```

### Test Group 5: Go-to binding definition

```typescript
describe("TUI_WORKFLOWS — Go-to binding", () => {
  test("goToBindings includes 'f' mapping to Workflows screen", async () => {
    const { goToBindings } = await import("../../apps/tui/src/navigation/goToBindings.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");
    const workflowBinding = goToBindings.find((b) => b.key === "f");
    expect(workflowBinding).toBeDefined();
    expect(workflowBinding!.screen).toBe(ScreenName.Workflows);
    expect(workflowBinding!.requiresRepo).toBe(true);
  });

  test("executeGoTo with 'f' binding and repo context navigates to Workflows", async () => {
    const { goToBindings, executeGoTo } = await import("../../apps/tui/src/navigation/goToBindings.js");
    const { ScreenName } = await import("../../apps/tui/src/router/types.js");

    const workflowBinding = goToBindings.find((b) => b.key === "f")!;
    const repoContext = { owner: "alice", repo: "myapp" };

    // Create a mock NavigationContext
    const navActions: Array<{ action: string; screen?: string; params?: Record<string, string> }> = [];
    const mockNav = {
      stack: [] as any[],
      currentScreen: { id: "1", screen: ScreenName.Dashboard, params: {}, breadcrumb: "Dashboard" },
      push: (screen: string, params?: Record<string, string>) => { navActions.push({ action: "push", screen, params }); },
      pop: () => { navActions.push({ action: "pop" }); },
      replace: (screen: string, params?: Record<string, string>) => { navActions.push({ action: "replace", screen, params }); },
      reset: (screen: string, params?: Record<string, string>) => { navActions.push({ action: "reset", screen, params }); },
      canGoBack: false,
      repoContext,
      orgContext: null,
      saveScrollPosition: () => {},
      getScrollPosition: () => undefined,
    } as any;

    const result = executeGoTo(mockNav, workflowBinding, repoContext);
    expect(result.error).toBeUndefined();

    // Should reset to Dashboard, push RepoOverview, push Workflows
    expect(navActions[0]).toEqual({ action: "reset", screen: ScreenName.Dashboard, params: undefined });
    expect(navActions[1]).toEqual({
      action: "push",
      screen: ScreenName.RepoOverview,
      params: { owner: "alice", repo: "myapp" },
    });
    expect(navActions[2].action).toBe("push");
    expect(navActions[2].screen).toBe(ScreenName.Workflows);
  });

  test("executeGoTo with 'f' binding and no repo context returns error", async () => {
    const { goToBindings, executeGoTo } = await import("../../apps/tui/src/navigation/goToBindings.js");

    const workflowBinding = goToBindings.find((b) => b.key === "f")!;
    const mockNav = { reset: () => {}, push: () => {}, pop: () => {} } as any;

    const result = executeGoTo(mockNav, workflowBinding, null);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("No repository in context");
  });
});
```

### Test Group 6: Placeholder screen rendering (E2E)

These tests launch the actual TUI and verify rendered output. They will fail if the TUI cannot start (e.g., missing API server), but should NOT be skipped.

```typescript
describe("TUI_WORKFLOWS — Placeholder screen rendering", () => {
  test("Workflows placeholder renders title via deep-link launch", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", "alice/myapp"],
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    try {
      await tui.waitForText("Workflows");
      await tui.waitForText("not yet implemented");
      const snap = tui.snapshot();
      expect(snap).toContain("Workflows");
      expect(snap).toContain("not yet implemented");
    } finally {
      await tui.terminate();
    }
  });

  test("WorkflowRunList placeholder renders title via deep-link launch", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflow-runs", "--repo", "alice/myapp"],
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    try {
      await tui.waitForText("Workflow Runs");
      await tui.waitForText("not yet implemented");
    } finally {
      await tui.terminate();
    }
  });

  test("WorkflowCaches placeholder renders title via deep-link launch", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflow-caches", "--repo", "alice/myapp"],
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    try {
      await tui.waitForText("Workflow Caches");
      await tui.waitForText("not yet implemented");
    } finally {
      await tui.terminate();
    }
  });

  test("q on Workflows placeholder pops back to previous screen", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", "alice/myapp"],
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    try {
      await tui.waitForText("Workflows");
      await tui.sendKeys("q");
      // Should pop to RepoOverview (or its placeholder)
      await tui.waitForNoText("not yet implemented");
    } finally {
      await tui.terminate();
    }
  });

  test("Workflows placeholder shows repo params", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", "alice/myapp"],
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    try {
      await tui.waitForText("Workflows");
      const snap = tui.snapshot();
      expect(snap).toContain("alice");
      expect(snap).toContain("myapp");
    } finally {
      await tui.terminate();
    }
  });

  test("Workflows placeholder renders at minimum terminal size (80x24)", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", "alice/myapp"],
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    try {
      await tui.waitForText("Workflows");
      const snap = tui.snapshot();
      expect(snap).toContain("Workflows");
    } finally {
      await tui.terminate();
    }
  });

  test("Workflows placeholder renders at large terminal size (200x60)", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", "alice/myapp"],
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
    });
    try {
      await tui.waitForText("Workflows");
      const snap = tui.snapshot();
      expect(snap).toContain("Workflows");
    } finally {
      await tui.terminate();
    }
  });
});
```

### Test Group 7: Go-to mode E2E (may fail if go-to mode not fully wired)

```typescript
describe("TUI_WORKFLOWS — Go-to keybinding E2E", () => {
  test("g f navigates to Workflows screen when repo context exists", async () => {
    // Launch with a repo context via deep-link
    const tui = await launchTUI({
      args: ["--screen", "issues", "--repo", "alice/myapp"],
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    try {
      await tui.waitForText("Issues");
      // Activate go-to mode and navigate to workflows
      await tui.sendKeys("g", "f");
      await tui.waitForText("Workflows");
      const snap = tui.snapshot();
      expect(snap).toContain("Workflows");
    } finally {
      await tui.terminate();
    }
  });

  test("g f without repo context shows error", async () => {
    // Launch on Dashboard (no repo context)
    const tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    try {
      await tui.waitForText("Dashboard");
      await tui.sendKeys("g", "f");
      // Should show error in status bar, NOT navigate
      // The text "No repository in context" should appear
      await tui.waitForText("No repository");
    } finally {
      await tui.terminate();
    }
  });
});
```

### Test Group 8: Breadcrumb rendering E2E

```typescript
describe("TUI_WORKFLOWS — Breadcrumb E2E", () => {
  test("Workflows screen breadcrumb shows correct path", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", "alice/myapp"],
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    try {
      await tui.waitForText("Workflows");
      // Header bar (line 0) should contain breadcrumb segments
      const headerLine = tui.getLine(0);
      expect(headerLine).toContain("Workflows");
    } finally {
      await tui.terminate();
    }
  });

  test("WorkflowCaches screen breadcrumb shows 'Caches'", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflow-caches", "--repo", "alice/myapp"],
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    try {
      await tui.waitForText("Caches");
      const headerLine = tui.getLine(0);
      expect(headerLine).toContain("Caches");
    } finally {
      await tui.terminate();
    }
  });
});
```

---

## Productionization Notes

### What this scaffold provides

This ticket creates the minimal structural foundation:

1. **Directory convention** — All subsequent workflow feature tickets add files into `apps/tui/src/screens/Workflows/` and `apps/tui/src/screens/Workflows/components/`.
2. **Screen identity** — Six `ScreenName` entries that downstream tickets can import and reference for navigation.
3. **Registry completeness** — The runtime exhaustive check in `registry.ts` will catch any future enum addition that forgets a registry entry.
4. **Deep-link surface** — CLI users can immediately start using `--screen workflow-*` flags.
5. **Test harness** — The `e2e/tui/workflows.test.ts` file is established with the test structure that downstream tickets will append to.

### What subsequent tickets must do

1. **Replace placeholder components** — Each feature ticket (e.g., `tui-workflow-list-screen`) replaces the placeholder with a full implementation. The registry entry import path stays the same.
2. **Add `components/` subdirectory** — Feature tickets create `apps/tui/src/screens/Workflows/components/` for shared sub-components (WorkflowRow, RunRow, etc.).
3. **Add `hooks/` subdirectory** — Data hook tickets may add `apps/tui/src/screens/Workflows/hooks/` for screen-specific hooks (useWorkflowAction, useOptimisticRunAction, useDispatchForm).
4. **Add `types.ts`** — The `tui-workflow-ui-utils` ticket creates `apps/tui/src/screens/Workflows/types.ts` for shared workflow type definitions.
5. **Update barrel exports** — As components are added, `apps/tui/src/screens/Workflows/index.ts` is extended.

### No POC code to productionize

This ticket creates only production-grade structural code. There are no proof-of-concept scripts, no temporary workarounds, and no experimental patterns. Every file created in this ticket will remain in the codebase as-is through subsequent feature tickets — only the placeholder component bodies will be replaced.

### Compatibility considerations

- Adding new entries to the `ScreenName` enum is backward-compatible — existing code that uses `ScreenName.Workflows` or `ScreenName.WorkflowRunDetail` is unaffected.
- The registry exhaustive check ensures all new enum values are mapped at module load time. Any omission causes a hard error at TUI startup, not a silent failure.
- Deep-link additions are purely additive — the existing `"workflows"` mapping is unchanged.
- The go-to binding for `g f` is already defined and references `ScreenName.Workflows`, which remains unchanged.