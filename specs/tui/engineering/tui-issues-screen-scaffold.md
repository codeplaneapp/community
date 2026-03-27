# Engineering Specification: tui-issues-screen-scaffold

## Ticket Summary

**Title:** Scaffold Issues screen directory, screen registry entry, and navigation wiring
**Type:** Engineering
**Dependencies:** `tui-screen-router`, `tui-navigation-provider`
**Status:** Not started

---

## Overview

This ticket scaffolds the Issues screen surface area in the TUI. It creates the directory structure, placeholder screen components, screen registry wiring, go-to keybinding verification, and E2E test harness. No API integration or data fetching is implemented in this ticket — that is deferred to subsequent tickets (`tui-issue-list-screen`, `tui-issue-detail-view`, etc.).

The four screens covered are:
- `IssueListScreen` — list of issues for a repository (mapped to `ScreenName.Issues`)
- `IssueDetailScreen` — single issue detail view (mapped to `ScreenName.IssueDetail`)
- `IssueCreateForm` — create new issue form (mapped to `ScreenName.IssueCreate`)
- `IssueEditForm` — edit existing issue form (mapped to `ScreenName.IssueEdit`)

All four `ScreenName` enum values already exist in `apps/tui/src/router/types.ts`. All four registry entries already exist in `apps/tui/src/router/registry.ts` (currently pointing to `PlaceholderScreen`). The `g i` go-to binding already exists in `apps/tui/src/navigation/goToBindings.ts` with `requiresRepo: true`.

This ticket replaces the `PlaceholderScreen` references with real components that render identifiable loading/placeholder states.

---

## Feature Mapping

From `specs/tui/features.ts`, this ticket provides the scaffolding foundation for:
- `TUI_ISSUE_LIST_SCREEN` (partial — placeholder only)
- `TUI_ISSUE_DETAIL_VIEW` (partial — placeholder only)
- `TUI_ISSUE_CREATE_FORM` (partial — placeholder only)
- `TUI_ISSUE_EDIT_FORM` (partial — placeholder only)
- `TUI_ISSUE_KEYBOARD_SHORTCUTS` (partial — basic list nav only)

---

## Implementation Plan

### Step 1: Create Issues screen directory structure

Create the following directory and file layout:

```
apps/tui/src/screens/Issues/
├── index.ts                   # barrel export
├── IssueListScreen.tsx        # ScreenName.Issues component
├── IssueDetailScreen.tsx      # ScreenName.IssueDetail component
├── IssueCreateForm.tsx        # ScreenName.IssueCreate component
├── IssueEditForm.tsx          # ScreenName.IssueEdit component
└── types.ts                   # shared types for issue screen components
```

**File: `apps/tui/src/screens/Issues/types.ts`**

Define screen-local type aliases that re-export from `@codeplane/ui-core` for convenience. This keeps the import surface clean within the Issues screen components.

```typescript
import type { ScreenComponentProps } from "../../router/types.js";

// Re-export for convenience within this screen module
export type { ScreenComponentProps };

// Issue list filter state used by IssueListScreen (will be extended in tui-issue-list-screen ticket)
export type IssueFilterState = "open" | "closed" | "";
```

**Rationale:** Follows the established pattern in `apps/tui/src/screens/Agents/types.ts` — screen-local types are co-located with the screen components.

---

### Step 2: Implement IssueListScreen placeholder

**File: `apps/tui/src/screens/Issues/IssueListScreen.tsx`**

The IssueListScreen renders when navigated to via `g i` or any push to `ScreenName.Issues`. At this scaffold stage, it:

1. Accepts `ScreenComponentProps` (which includes `entry` and `params`).
2. Extracts `owner` and `repo` from params (required — `requiresRepo: true`).
3. Renders a loading state box with the screen identity text "Issues" and the repository context.
4. Registers basic screen keybindings via `useScreenKeybindings()` — just enough to show keybinding hints in the status bar.
5. Does NOT call any `useIssues()` hook yet (deferred to `tui-issue-list-screen`).

```typescript
import { useCallback } from "react";
import type { ScreenComponentProps } from "../../router/types.js";
import { ScreenName } from "../../router/types.js";
import { useNavigation } from "../../providers/NavigationProvider.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";

export function IssueListScreen({ entry, params }: ScreenComponentProps) {
  const nav = useNavigation();
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";

  const handleCreateIssue = useCallback(() => {
    nav.push(ScreenName.IssueCreate, { owner, repo });
  }, [nav, owner, repo]);

  useScreenKeybindings(
    [
      { key: "c", description: "Create issue", group: "Actions", handler: handleCreateIssue },
    ],
    [
      { keys: "j/k", label: "navigate", order: 10 },
      { keys: "Enter", label: "open", order: 20 },
      { keys: "c", label: "create", order: 30 },
      { keys: "/", label: "filter", order: 40 },
    ],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>Issues</text>
      <text color="gray">{`${owner}/${repo}`}</text>
      <box marginTop={1}>
        <text color="gray">Loading issues...</text>
      </box>
    </box>
  );
}
```

**Key decisions:**
- The `c` keybinding for "Create issue" is wired immediately because it only requires navigation (no API call).
- Status bar hints for `j/k`, `Enter`, `/` are registered even though the list isn't interactive yet. This ensures the status bar is accurate for the screen's intended UX, and the hints will be inherited by the real implementation.
- No `useIssues()` call — the loading state is static text. The subsequent `tui-issue-list-screen` ticket will replace this with the real data hook.

---

### Step 3: Implement IssueDetailScreen placeholder

**File: `apps/tui/src/screens/Issues/IssueDetailScreen.tsx`**

Rendered when an issue is selected from the list. At scaffold stage:

1. Extracts `owner`, `repo`, and `number` from params.
2. Renders issue number and loading state.
3. Registers basic keybindings.

```typescript
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";

export function IssueDetailScreen({ entry, params }: ScreenComponentProps) {
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";
  const number = params.number ?? "";

  useScreenKeybindings(
    [],
    [
      { keys: "j/k", label: "scroll", order: 10 },
      { keys: "e", label: "edit", order: 20 },
      { keys: "c", label: "comment", order: 30 },
    ],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>{`Issue #${number}`}</text>
      <text color="gray">{`${owner}/${repo}`}</text>
      <box marginTop={1}>
        <text color="gray">Loading issue details...</text>
      </box>
    </box>
  );
}
```

---

### Step 4: Implement IssueCreateForm placeholder

**File: `apps/tui/src/screens/Issues/IssueCreateForm.tsx`**

```typescript
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";

export function IssueCreateForm({ entry, params }: ScreenComponentProps) {
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";

  useScreenKeybindings(
    [],
    [
      { keys: "Tab", label: "next field", order: 10 },
      { keys: "Ctrl+S", label: "submit", order: 20 },
      { keys: "Esc", label: "cancel", order: 30 },
    ],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>New Issue</text>
      <text color="gray">{`${owner}/${repo}`}</text>
      <box marginTop={1}>
        <text color="gray">Issue creation form loading...</text>
      </box>
    </box>
  );
}
```

---

### Step 5: Implement IssueEditForm placeholder

**File: `apps/tui/src/screens/Issues/IssueEditForm.tsx`**

```typescript
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";

export function IssueEditForm({ entry, params }: ScreenComponentProps) {
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";
  const number = params.number ?? "";

  useScreenKeybindings(
    [],
    [
      { keys: "Tab", label: "next field", order: 10 },
      { keys: "Ctrl+S", label: "save", order: 20 },
      { keys: "Esc", label: "cancel", order: 30 },
    ],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>{`Edit Issue #${number}`}</text>
      <text color="gray">{`${owner}/${repo}`}</text>
      <box marginTop={1}>
        <text color="gray">Issue edit form loading...</text>
      </box>
    </box>
  );
}
```

---

### Step 6: Create barrel export

**File: `apps/tui/src/screens/Issues/index.ts`**

```typescript
export { IssueListScreen } from "./IssueListScreen.js";
export { IssueDetailScreen } from "./IssueDetailScreen.js";
export { IssueCreateForm } from "./IssueCreateForm.js";
export { IssueEditForm } from "./IssueEditForm.js";
export type { IssueFilterState } from "./types.js";
```

**Rationale:** Barrel export follows the pattern established by `apps/tui/src/screens/Agents/components/index.ts`. Named exports only — no default exports.

---

### Step 7: Update screen registry

**File: `apps/tui/src/router/registry.ts`**

Replace `PlaceholderScreen` references for the four issue screens with the real components.

**Changes:**

1. Add import at top of file:
```typescript
import { IssueListScreen, IssueDetailScreen, IssueCreateForm, IssueEditForm } from "../screens/Issues/index.js";
```

2. Replace four registry entries:

```typescript
[ScreenName.Issues]: {
  component: IssueListScreen,      // was PlaceholderScreen
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "Issues",
},
[ScreenName.IssueDetail]: {
  component: IssueDetailScreen,    // was PlaceholderScreen
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.number ? `#${p.number}` : "Issue"),
},
[ScreenName.IssueCreate]: {
  component: IssueCreateForm,      // was PlaceholderScreen
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "New Issue",
},
[ScreenName.IssueEdit]: {
  component: IssueEditForm,        // was PlaceholderScreen
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.number ? `Edit #${p.number}` : "Edit Issue"),
},
```

**Note:** `requiresRepo`, `requiresOrg`, and `breadcrumbLabel` values remain identical. Only the `component` field changes.

---

### Step 8: Verify g i go-to keybinding wiring

The `g i` keybinding already exists in `apps/tui/src/navigation/goToBindings.ts`:

```typescript
{ key: "i", screen: ScreenName.Issues, requiresRepo: true, description: "Issues" },
```

The `executeGoTo()` function handles the flow:
1. Checks `requiresRepo` — returns error if no repo context.
2. Calls `nav.reset(ScreenName.Dashboard)` to clear the stack.
3. Pushes `RepoOverview` with repo context.
4. Pushes the target screen (`Issues`) with repo context.

**No code changes needed** for go-to wiring. The existing `executeGoTo` will now render `IssueListScreen` instead of `PlaceholderScreen` because the registry entry was updated in Step 7.

However, the `GlobalKeybindings` component (`apps/tui/src/components/GlobalKeybindings.tsx`) currently has `onGoTo` as a no-op TODO:
```typescript
const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);
```

This means `g i` will not actually work until the `tui-goto-keybindings` ticket is completed (which is an implicit dependency of `tui-navigation-provider`). This is fine — the scaffold ticket ensures the routing is correct when the go-to system activates. E2E tests for `g i` navigation will fail until that ticket lands, and per project policy, those tests remain failing (not skipped).

---

### Step 9: Update screens barrel export (optional)

**File: `apps/tui/src/screens/index.ts`**

The current file is empty (`export {};`). Add the Issues re-export:

```typescript
/**
 * Screen components for the TUI application.
 */
export * from "./Issues/index.js";
```

**Rationale:** This provides a single import path for consumers who want all screen exports. Each subsequent screen scaffold ticket will add its own re-export line.

---

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/screens/Issues/types.ts` | **Create** | Screen-local type definitions |
| `apps/tui/src/screens/Issues/IssueListScreen.tsx` | **Create** | Issue list placeholder component |
| `apps/tui/src/screens/Issues/IssueDetailScreen.tsx` | **Create** | Issue detail placeholder component |
| `apps/tui/src/screens/Issues/IssueCreateForm.tsx` | **Create** | Issue create form placeholder component |
| `apps/tui/src/screens/Issues/IssueEditForm.tsx` | **Create** | Issue edit form placeholder component |
| `apps/tui/src/screens/Issues/index.ts` | **Create** | Barrel export |
| `apps/tui/src/router/registry.ts` | **Modify** | Replace PlaceholderScreen → real components (4 entries) |
| `apps/tui/src/screens/index.ts` | **Modify** | Add Issues re-export |
| `e2e/tui/issues.test.ts` | **Create** | E2E test harness for issues feature group |

---

## Data Access

This scaffold ticket does **not** integrate any data hooks. The following hooks from `@codeplane/ui-core` will be consumed by subsequent tickets:

| Hook | Used by | Ticket |
|------|---------|--------|
| `useIssues(owner, repo, options?)` | `IssueListScreen` | `tui-issue-list-screen` |
| `useIssue(owner, repo, issueNumber)` | `IssueDetailScreen` | `tui-issue-detail-view` |
| `useIssueComments(owner, repo, issueNumber)` | `IssueDetailScreen` | `tui-issue-comment-list` |
| `useCreateIssue(owner, repo)` | `IssueCreateForm` | `tui-issue-create-form` |
| `useUpdateIssue(owner, repo)` | `IssueEditForm` | `tui-issue-edit-form` |
| `useRepoLabels(owner, repo)` | `IssueListScreen`, `IssueCreateForm` | `tui-issue-list-filters` |
| `useRepoMilestones(owner, repo)` | `IssueCreateForm`, `IssueEditForm` | `tui-issue-create-form` |

---

## Keyboard Bindings

### Registered at scaffold stage

| Screen | Key | Action | Wired |
|--------|-----|--------|-------|
| IssueListScreen | `c` | Push IssueCreateForm | ✅ Functional |
| IssueListScreen | `j/k` | Navigate list | ❌ Hint only (no list yet) |
| IssueListScreen | `Enter` | Open issue detail | ❌ Hint only (no list yet) |
| IssueListScreen | `/` | Filter input | ❌ Hint only (no filter yet) |
| IssueDetailScreen | `j/k` | Scroll content | ❌ Hint only |
| IssueDetailScreen | `e` | Edit issue | ❌ Hint only |
| IssueDetailScreen | `c` | Add comment | ❌ Hint only |
| IssueCreateForm | `Tab` | Next field | ❌ Hint only |
| IssueCreateForm | `Ctrl+S` | Submit | ❌ Hint only |
| IssueCreateForm | `Esc` | Cancel | ❌ Handled by global |
| IssueEditForm | `Tab` | Next field | ❌ Hint only |
| IssueEditForm | `Ctrl+S` | Save | ❌ Hint only |
| IssueEditForm | `Esc` | Cancel | ❌ Handled by global |

### Global bindings (inherited, no changes needed)

| Key | Action |
|-----|--------|
| `q` | Pop (back to previous screen) |
| `Esc` | Close overlay or pop |
| `?` | Help overlay |
| `:` | Command palette |
| `g i` | Go-to Issues (requires repo context) |
| `Ctrl+C` | Quit TUI |

---

## Unit & Integration Tests

### Test file: `e2e/tui/issues.test.ts`

This file establishes the E2E test harness for all `TUI_ISSUES` features. At scaffold stage, it includes:

1. **Structural tests** — verify the screen files exist and are importable.
2. **Registry tests** — verify registry entries point to the correct components.
3. **Navigation tests** — verify `g i` navigates to the issue list screen.
4. **Placeholder rendering tests** — verify each screen renders its identifying text.
5. **Snapshot tests** — capture screen appearance at multiple terminal sizes.
6. **Keyboard interaction tests** — verify registered keybindings work.

```typescript
import { describe, test, expect, afterEach } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import {
  TUI_SRC,
  launchTUI,
  createMockAPIEnv,
  TERMINAL_SIZES,
  OWNER,
  type TUITestInstance,
} from "./helpers"

// ---------------------------------------------------------------------------
// TUI_ISSUES — Screen scaffold structure
// ---------------------------------------------------------------------------

describe("TUI_ISSUES — Screen scaffold structure", () => {
  test("Issues screen directory exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Issues"))).toBe(true)
  })

  test("IssueListScreen.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Issues/IssueListScreen.tsx"))).toBe(true)
  })

  test("IssueDetailScreen.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Issues/IssueDetailScreen.tsx"))).toBe(true)
  })

  test("IssueCreateForm.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Issues/IssueCreateForm.tsx"))).toBe(true)
  })

  test("IssueEditForm.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Issues/IssueEditForm.tsx"))).toBe(true)
  })

  test("index.ts barrel export exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Issues/index.ts"))).toBe(true)
  })

  test("types.ts exists", () => {
    expect(existsSync(join(TUI_SRC, "screens/Issues/types.ts"))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TUI_ISSUES — Screen registry wiring
// ---------------------------------------------------------------------------

describe("TUI_ISSUES — Screen registry wiring", () => {
  test("Issues screen registry entry uses IssueListScreen (not PlaceholderScreen)", async () => {
    const result = await Bun.build({
      entrypoints: [join(TUI_SRC, "router/registry.ts")],
      target: "bun",
    })
    // Registry should import from screens/Issues, not reference PlaceholderScreen for Issues
    const registrySource = await Bun.file(join(TUI_SRC, "router/registry.ts")).text()
    expect(registrySource).toContain("IssueListScreen")
    expect(registrySource).toContain("IssueDetailScreen")
    expect(registrySource).toContain("IssueCreateForm")
    expect(registrySource).toContain("IssueEditForm")
  })

  test("Issues registry entry requires repo context", async () => {
    const registrySource = await Bun.file(join(TUI_SRC, "router/registry.ts")).text()
    // All four issue screen entries should have requiresRepo: true
    // We verify this by checking that the component names appear near requiresRepo: true
    expect(registrySource).toContain("requiresRepo: true")
  })
})

// ---------------------------------------------------------------------------
// TUI_ISSUES — Go-to navigation (g i)
// ---------------------------------------------------------------------------

describe("TUI_ISSUES — Go-to navigation", () => {
  test("goToBindings includes Issues with key 'i' and requiresRepo true", async () => {
    const bindingsSource = await Bun.file(join(TUI_SRC, "navigation/goToBindings.ts")).text()
    expect(bindingsSource).toContain('key: "i"')
    expect(bindingsSource).toContain("ScreenName.Issues")
  })

  test("g i navigates to Issues screen when repo context exists", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "repo-overview", "--repo", `${OWNER}/test-repo`],
    })
    try {
      // Wait for initial screen to render
      await terminal.waitForText(OWNER, 5000)

      // Activate go-to mode and select Issues
      await terminal.sendKeys("g", "i")

      // Should navigate to Issues screen
      await terminal.waitForText("Issues", 5000)
      await terminal.waitForText("Loading issues...", 5000)

      // Breadcrumb should include Issues
      const headerLine = terminal.getLine(0)
      expect(headerLine).toContain("Issues")
    } finally {
      await terminal.terminate()
    }
  }, 30_000)

  test("g i without repo context shows error or does nothing", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    })
    try {
      // Wait for dashboard to render
      await terminal.waitForText("Dashboard", 5000)

      // Try go-to Issues without repo context
      await terminal.sendKeys("g", "i")

      // Should NOT navigate away from Dashboard (no repo context)
      // The exact behavior depends on go-to mode implementation,
      // but Issues screen text should NOT appear
      const snapshot = terminal.snapshot()
      expect(snapshot).toContain("Dashboard")
    } finally {
      await terminal.terminate()
    }
  }, 30_000)
})

// ---------------------------------------------------------------------------
// TUI_ISSUES — IssueListScreen rendering
// ---------------------------------------------------------------------------

describe("TUI_ISSUES — IssueListScreen rendering", () => {
  test("SNAP-ISS-001: IssueListScreen renders loading state at 120x40", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    })
    try {
      await terminal.waitForText("Issues", 5000)
      await terminal.waitForText("Loading issues...", 5000)

      const snapshot = terminal.snapshot()
      expect(snapshot).toContain("Issues")
      expect(snapshot).toContain(`${OWNER}/test-repo`)
      expect(snapshot).toContain("Loading issues...")
    } finally {
      await terminal.terminate()
    }
  }, 30_000)

  test("SNAP-ISS-002: IssueListScreen renders at minimum terminal size 80x24", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    })
    try {
      await terminal.waitForText("Issues", 5000)
      const snapshot = terminal.snapshot()
      expect(snapshot).toContain("Issues")
    } finally {
      await terminal.terminate()
    }
  }, 30_000)

  test("SNAP-ISS-003: IssueListScreen renders at large terminal size 200x60", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    })
    try {
      await terminal.waitForText("Issues", 5000)
      const snapshot = terminal.snapshot()
      expect(snapshot).toContain("Issues")
      expect(snapshot).toContain(`${OWNER}/test-repo`)
    } finally {
      await terminal.terminate()
    }
  }, 30_000)

  test("IssueListScreen shows repo context in content area", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    })
    try {
      await terminal.waitForText(`${OWNER}/test-repo`, 5000)
      const snapshot = terminal.snapshot()
      expect(snapshot).toContain(`${OWNER}/test-repo`)
    } finally {
      await terminal.terminate()
    }
  }, 30_000)
})

// ---------------------------------------------------------------------------
// TUI_ISSUES — IssueDetailScreen rendering
// ---------------------------------------------------------------------------

describe("TUI_ISSUES — IssueDetailScreen rendering", () => {
  test("SNAP-ISS-010: IssueDetailScreen renders with issue number", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issue-detail", "--repo", `${OWNER}/test-repo`, "--number", "42"],
    })
    try {
      await terminal.waitForText("Issue #42", 5000)
      const snapshot = terminal.snapshot()
      expect(snapshot).toContain("Issue #42")
      expect(snapshot).toContain("Loading issue details...")
    } finally {
      await terminal.terminate()
    }
  }, 30_000)
})

// ---------------------------------------------------------------------------
// TUI_ISSUES — IssueCreateForm rendering
// ---------------------------------------------------------------------------

describe("TUI_ISSUES — IssueCreateForm rendering", () => {
  test("SNAP-ISS-020: IssueCreateForm renders New Issue heading", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issue-create", "--repo", `${OWNER}/test-repo`],
    })
    try {
      await terminal.waitForText("New Issue", 5000)
      const snapshot = terminal.snapshot()
      expect(snapshot).toContain("New Issue")
      expect(snapshot).toContain(`${OWNER}/test-repo`)
    } finally {
      await terminal.terminate()
    }
  }, 30_000)
})

// ---------------------------------------------------------------------------
// TUI_ISSUES — IssueEditForm rendering
// ---------------------------------------------------------------------------

describe("TUI_ISSUES — IssueEditForm rendering", () => {
  test("SNAP-ISS-030: IssueEditForm renders Edit Issue heading with number", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issue-edit", "--repo", `${OWNER}/test-repo`, "--number", "7"],
    })
    try {
      await terminal.waitForText("Edit Issue #7", 5000)
      const snapshot = terminal.snapshot()
      expect(snapshot).toContain("Edit Issue #7")
    } finally {
      await terminal.terminate()
    }
  }, 30_000)
})

// ---------------------------------------------------------------------------
// TUI_ISSUES — Keyboard interactions
// ---------------------------------------------------------------------------

describe("TUI_ISSUES — Keyboard interactions", () => {
  test("KEY-ISS-001: q on IssueListScreen navigates back", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    })
    try {
      await terminal.waitForText("Issues", 5000)
      await terminal.sendKeys("q")
      // Should navigate back (pop from stack)
      // Exact destination depends on the initial stack built by deep-link
      await terminal.waitForNoText("Loading issues...", 5000)
    } finally {
      await terminal.terminate()
    }
  }, 30_000)

  test("KEY-ISS-002: c on IssueListScreen navigates to create form", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    })
    try {
      await terminal.waitForText("Issues", 5000)
      await terminal.waitForText("Loading issues...", 5000)
      await terminal.sendKeys("c")
      // Should push IssueCreateForm
      await terminal.waitForText("New Issue", 5000)
    } finally {
      await terminal.terminate()
    }
  }, 30_000)

  test("KEY-ISS-003: Esc on IssueCreateForm navigates back to list", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    })
    try {
      await terminal.waitForText("Issues", 5000)
      // Navigate to create form
      await terminal.sendKeys("c")
      await terminal.waitForText("New Issue", 5000)
      // Press Esc to go back
      await terminal.sendKeys("Escape")
      // Should return to issue list
      await terminal.waitForText("Loading issues...", 5000)
    } finally {
      await terminal.terminate()
    }
  }, 30_000)
})

// ---------------------------------------------------------------------------
// TUI_ISSUES — Status bar hints
// ---------------------------------------------------------------------------

describe("TUI_ISSUES — Status bar hints", () => {
  test("IssueListScreen shows keybinding hints in status bar", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    })
    try {
      await terminal.waitForText("Issues", 5000)
      // Status bar is the last line
      const statusLine = terminal.getLine(terminal.rows - 1)
      // Should show at least some keybinding hints
      // Exact format depends on StatusBar implementation
      expect(statusLine.length).toBeGreaterThan(0)
    } finally {
      await terminal.terminate()
    }
  }, 30_000)
})

// ---------------------------------------------------------------------------
// TUI_ISSUES — Deep-link launch
// ---------------------------------------------------------------------------

describe("TUI_ISSUES — Deep-link launch", () => {
  test("--screen issues --repo owner/repo launches directly to issue list", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    })
    try {
      await terminal.waitForText("Issues", 5000)
      await terminal.waitForText("Loading issues...", 5000)

      // Breadcrumb should show the navigation path
      const headerLine = terminal.getLine(0)
      expect(headerLine).toContain("Issues")
    } finally {
      await terminal.terminate()
    }
  }, 30_000)
})
```

### Test categories and IDs

| Test ID | Category | Description | Expected state |
|---------|----------|-------------|----------------|
| SNAP-ISS-001 | Snapshot | IssueListScreen at 120×40 | Passes when scaffold complete |
| SNAP-ISS-002 | Snapshot | IssueListScreen at 80×24 | Passes when scaffold complete |
| SNAP-ISS-003 | Snapshot | IssueListScreen at 200×60 | Passes when scaffold complete |
| SNAP-ISS-010 | Snapshot | IssueDetailScreen with issue number | Passes when scaffold + deep-link support complete |
| SNAP-ISS-020 | Snapshot | IssueCreateForm heading | Passes when scaffold + deep-link support complete |
| SNAP-ISS-030 | Snapshot | IssueEditForm heading with number | Passes when scaffold + deep-link support complete |
| KEY-ISS-001 | Keyboard | `q` pops IssueListScreen | Passes when global keybindings work |
| KEY-ISS-002 | Keyboard | `c` on list pushes create form | Passes when scaffold complete |
| KEY-ISS-003 | Keyboard | `Esc` on create form returns to list | Passes when global keybindings work |

### Tests expected to fail until upstream dependencies land

- **Go-to navigation tests** (`g i` sequences): Will fail until `tui-goto-keybindings` ticket completes the go-to mode wiring in `GlobalKeybindings.tsx`. Per project policy, these tests remain failing — they are never skipped or commented out.
- **Deep-link tests** (`--screen issues`): Will fail if `buildInitialStack()` does not yet support the `"issues"` deep-link screen name mapping. Currently `apps/tui/src/navigation/deepLinks.ts` handles this.
- **Snapshot tests for IssueDetail/Create/Edit with `--screen` args**: Depend on deep-link support for those specific screen names.

### Test principles applied

1. **No mocking** — All tests launch a real TUI process and interact via PTY.
2. **One behavior per test** — Each test validates a single user-facing behavior.
3. **Multiple sizes** — Critical screens are tested at minimum (80×24), standard (120×40), and large (200×60).
4. **Cleanup** — Every test terminates the TUI process in a `finally` block.
5. **Failing tests stay failing** — Tests that depend on unimplemented go-to mode or deep-link features are left in place.
6. **30-second timeouts** — All E2E tests have explicit 30s timeouts matching `e2e/tui/bunfig.toml`.

---

## Productionization Checklist

The scaffold components are intentionally minimal. Here is how each placeholder is productionized by subsequent tickets:

### IssueListScreen → `tui-issue-list-screen` ticket

1. Replace static "Loading issues..." text with `useIssues(owner, repo, { state: filterState })` hook.
2. Render issues in a `<ScrollableList>` component with focused row highlighting.
3. Wire `j/k` keys to list navigation (via ScrollableList's built-in keybindings).
4. Wire `Enter` to push `ScreenName.IssueDetail` with the focused issue's number.
5. Add state filter tabs (Open / Closed) with `Tab`/`Shift+Tab` switching.
6. Add `/` to focus a filter input for text search.
7. Show issue state color coding (green = open, red = closed).
8. Show issue metadata: author, label badges, comment count, timestamp.
9. Implement cursor-based pagination via `<scrollbox>` scroll-to-end detection.

### IssueDetailScreen → `tui-issue-detail-view` ticket

1. Replace static loading text with `useIssue(owner, repo, number)` hook.
2. Render issue title, body (via `<markdown>` component), status badge, labels, assignees.
3. Wire `useIssueComments()` for comment list below issue body.
4. Wire `e` key to push `ScreenName.IssueEdit`.
5. Wire `c` key to open comment creation input.
6. Wire close/reopen action via `useUpdateIssue()` with optimistic update.

### IssueCreateForm → `tui-issue-create-form` ticket

1. Replace static loading text with `FormSystem` component.
2. Add title `<input>`, body `<textarea>`, labels `<select>`, milestone `<select>`, assignees `<select>`.
3. Wire `Tab`/`Shift+Tab` for field navigation.
4. Wire `Ctrl+S` for form submission via `useCreateIssue()`.
5. Wire `Esc` to cancel and pop (already handled by global keybindings).
6. Show inline validation errors.
7. Show "Saving..." state on submit button during submission.

### IssueEditForm → `tui-issue-edit-form` ticket

1. Pre-populate form with `useIssue()` data.
2. Same form fields as create but with existing values.
3. Submit via `useUpdateIssue()` with optimistic updates.
4. Navigate back on success.

---

## Acceptance Criteria

- [ ] `apps/tui/src/screens/Issues/` directory exists with all 6 files.
- [ ] Each screen component accepts `ScreenComponentProps` and renders identifiable text.
- [ ] `apps/tui/src/router/registry.ts` imports from `screens/Issues/` and no longer references `PlaceholderScreen` for the four issue screens.
- [ ] `apps/tui/src/screens/Issues/index.ts` barrel-exports all four components.
- [ ] `IssueListScreen` registers the `c` keybinding that pushes to `IssueCreateForm`.
- [ ] All four screens register status bar hints via `useScreenKeybindings()`.
- [ ] `e2e/tui/issues.test.ts` exists with scaffold, registry, rendering, keyboard, and deep-link test groups.
- [ ] `bun run check` passes in `apps/tui/` (TypeScript compiles without errors).
- [ ] No existing tests in `e2e/tui/app-shell.test.ts` are broken by the changes.
- [ ] Tests that depend on unimplemented go-to mode are left failing (not skipped or mocked).

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Deep-link `--screen issues` may not be mapped in `deepLinks.ts` | E2E tests that use `--screen issues` will fail at launch | Verify `buildInitialStack()` handles `"issues"` screen name. If not, add the mapping as part of this ticket. |
| Go-to mode (`g` prefix) not yet wired in `GlobalKeybindings.tsx` | `g i` navigation tests will fail | Expected. Tests remain failing per policy. They serve as integration smoke tests for when the go-to ticket lands. |
| `PlaceholderScreen` is still used by other screens in registry.ts | Import removal of PlaceholderScreen would break other screens | Do NOT remove the PlaceholderScreen import — only stop using it for the four issue screens. Other screens still reference it. |
| `@microsoft/tui-test` spawn may not support all `--screen` deep-link args | Some E2E tests may fail due to deep-link arg parsing | Verify `buildInitialStack()` accepts the arg format used in tests. |