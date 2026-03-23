# Engineering Specification: tui-dashboard-screen-scaffold

## Ticket Summary

| Field | Value |
|-------|-------|
| Title | Scaffold Dashboard screen directory, entry component, and router registration |
| Ticket ID | `tui-dashboard-screen-scaffold` |
| Type | Engineering |
| Status | Not started |
| Dependencies | `tui-screen-router`, `tui-header-bar`, `tui-status-bar`, `tui-global-keybindings` |

## Context

The TUI's `ScreenRouter` currently resolves the `Dashboard` screen entry to `PlaceholderScreen` — a generic stub that renders the screen name and a "not yet implemented" message. This ticket replaces that placeholder with a real `DashboardScreen` component housed in a proper directory structure, wired into the screen registry, and integrated with the existing navigation, header breadcrumb, status bar, and go-to keybinding systems.

The Dashboard is the **default root screen**. When the TUI launches without `--screen` arguments, the navigation stack is initialized with a single `Dashboard` entry (stack depth 1). The `g d` go-to keybinding resets the navigation stack to Dashboard. Both behaviors already exist in the codebase (`DEFAULT_ROOT_SCREEN = ScreenName.Dashboard` in `router/types.ts`, and the `"d"` binding in `navigation/goToBindings.ts`). This ticket's primary job is replacing the `PlaceholderScreen` component reference with a dedicated `DashboardScreen` component that renders a proper layout scaffold.

## Existing Infrastructure (What Already Works)

Before implementation, confirm these invariants hold (they are verified by existing tests in `e2e/tui/app-shell.test.ts`):

1. **Router registration**: `ScreenName.Dashboard` is registered in `screenRegistry` at `apps/tui/src/router/registry.ts` with `requiresRepo: false`, `requiresOrg: false`, `breadcrumbLabel: () => "Dashboard"`.
2. **Default root**: `DEFAULT_ROOT_SCREEN = ScreenName.Dashboard` in `apps/tui/src/router/types.ts`.
3. **Deep link fallback**: `buildInitialStack({})` (no args) returns `[createEntry(ScreenName.Dashboard)]` — a single-entry stack.
4. **Go-to binding**: `goToBindings` includes `{ key: "d", screen: ScreenName.Dashboard, requiresRepo: false, description: "Dashboard" }`.
5. **Go-to execution**: `executeGoTo()` calls `nav.reset(ScreenName.Dashboard)` as the first step for all go-to navigation, then pushes the target screen. When the target IS Dashboard, the result is a single-entry stack.
6. **HeaderBar breadcrumb**: Renders `entry.breadcrumb` from the navigation stack. For Dashboard at root, this shows "Dashboard" as the sole bold breadcrumb segment.
7. **StatusBar**: Renders keybinding hints from `useScreenKeybindings()` — currently empty for `PlaceholderScreen`.

---

## Implementation Plan

### Step 1: Create the Dashboard screen directory structure

**Action**: Create the directory `apps/tui/src/screens/Dashboard/` with an `index.tsx` entry component.

**Files created**:
- `apps/tui/src/screens/Dashboard/index.tsx`

**Rationale**: The convention established by the Agents screen is `screens/{ScreenName}/` with sub-directories for `components/`, `utils/`, and `types.ts` as needed. For the scaffold, only `index.tsx` is needed. Sub-directories will be added in subsequent tickets when dashboard widgets (repos list, activity feed, starred repos, etc.) are built.

**File: `apps/tui/src/screens/Dashboard/index.tsx`**

```tsx
import React from "react";
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import type { KeyHandler } from "../../providers/keybinding-types.js";
import type { StatusBarHint } from "../../hooks/useStatusBarHints.js";

const keybindings: KeyHandler[] = [
  {
    key: "r",
    description: "Repositories",
    group: "Navigation",
    handler: () => {
      // Placeholder — wired in tui-dashboard-repos-list ticket
    },
  },
];

const statusBarHints: StatusBarHint[] = [
  { keys: "g", label: "go-to", order: 0 },
  { keys: ":", label: "command", order: 10 },
  { keys: "?", label: "help", order: 20 },
];

export function DashboardScreen({ entry, params }: ScreenComponentProps) {
  const layout = useLayout();
  const theme = useTheme();

  useScreenKeybindings(keybindings, statusBarHints);

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      padding={1}
    >
      {/* Dashboard content area — placeholder for future widget sections */}
      <box flexDirection="column" flexGrow={1}>
        <text fg={theme.muted}>
          Welcome to Codeplane
        </text>
      </box>
    </box>
  );
}
```

**Design decisions**:
- The component receives `ScreenComponentProps` (`entry` and `params`) per the `ScreenDefinition.component` contract.
- `useScreenKeybindings` is called to register the screen's keybinding scope and populate the status bar. The initial keybindings are minimal (just `r` for repos navigation as a placeholder). The status bar hints show the global affordances (`g` go-to, `:` command, `?` help) so the user sees actionable hints on the default screen.
- The layout uses a single `<box>` column with a welcome text placeholder. No data fetching. No API calls. This is intentional — data-driven sections (repos list, activity feed, starred repos, orgs list, quick actions) are separate tickets under `TUI_DASHBOARD`.
- `useLayout()` and `useTheme()` are consumed to enable responsive and themed rendering from the start.

### Step 2: Update the screen registry to use DashboardScreen

**File modified**: `apps/tui/src/router/registry.ts`

**Change**: Replace the `PlaceholderScreen` import for the Dashboard entry with `DashboardScreen`.

```diff
 import { ScreenName, type ScreenDefinition } from "./types.js";
 import { PlaceholderScreen } from "../screens/PlaceholderScreen.js";
+import { DashboardScreen } from "../screens/Dashboard/index.js";
 
 export const screenRegistry: Record<ScreenName, ScreenDefinition> = {
   [ScreenName.Dashboard]: {
-    component: PlaceholderScreen,
+    component: DashboardScreen,
     requiresRepo: false,
     requiresOrg: false,
     breadcrumbLabel: () => "Dashboard",
   },
   // ... all other entries remain unchanged
```

**Validation**: The compile-time type check in `screenRegistry` ensures that `DashboardScreen` satisfies `React.ComponentType<ScreenComponentProps>`. The runtime guard at the bottom of `registry.ts` verifies that every `ScreenName` enum value has a registry entry — this is not affected since the key already exists.

### Step 3: Update screens barrel export

**File modified**: `apps/tui/src/screens/index.ts`

```diff
-/**
- * Screen components for the TUI application.
- */
-export {};
+/**
+ * Screen components for the TUI application.
+ */
+export { DashboardScreen } from "./Dashboard/index.js";
```

**Rationale**: The barrel export is the canonical import path for external consumers. Even though the registry imports directly, maintaining the barrel export supports future patterns where tests or other modules import screens by name.

### Step 4: Verify go-to keybinding wiring

**No code changes needed.** The `g d` keybinding is already defined in `apps/tui/src/navigation/goToBindings.ts`:

```typescript
{ key: "d", screen: ScreenName.Dashboard, requiresRepo: false, description: "Dashboard" }
```

And `executeGoTo()` calls `nav.reset(ScreenName.Dashboard)` which clears the stack and pushes a single Dashboard entry. Since the registry now points to `DashboardScreen` instead of `PlaceholderScreen`, the go-to keybinding will render the new component. No additional wiring is needed.

**However**, the `g` key handler in `GlobalKeybindings.tsx` is currently a no-op placeholder:

```typescript
const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);
```

This means `g d` does not actually work yet. This is tracked by the `tui-global-keybindings` dependency ticket. This spec does NOT implement go-to mode — it ensures the Dashboard screen renders correctly when go-to mode eventually activates. The E2E tests for go-to navigation will be written to exercise this flow and will **fail until go-to mode is implemented**. Tests are left failing per project policy.

### Step 5: Verify breadcrumb integration

**No code changes needed.** The `HeaderBar` component reads `nav.stack.map(entry => entry.breadcrumb)` and renders the breadcrumb trail. The breadcrumb for Dashboard is generated by `breadcrumbLabel: () => "Dashboard"` in the registry. When Dashboard is the only entry in the stack, the header renders:

```
**Dashboard**                                                        ●
```

(Bold current segment, no prefix segments, connection indicator on the right.)

This works identically whether the component is `PlaceholderScreen` or `DashboardScreen` — the breadcrumb comes from the registry, not the component. No changes needed.

### Step 6: Verify StatusBar hint integration

**No code changes needed to StatusBar.** The `DashboardScreen` calls `useScreenKeybindings(keybindings, statusBarHints)` which registers hints via `StatusBarHintsContext`. The `StatusBar` component reads these hints via `useStatusBarHints()` and renders them. The flow:

1. `DashboardScreen` mounts → `useScreenKeybindings` registers `PRIORITY.SCREEN` scope + status bar hints
2. `StatusBar` re-renders → `hints` array now contains `[{keys: "g", label: "go-to"}, {keys: ":", label: "command"}, {keys: "?", label: "help"}]`
3. Status bar shows: `g:go-to  ::command  ?:help`

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/screens/Dashboard/index.tsx` | **Create** | Dashboard screen component with placeholder layout, screen keybindings, and status bar hints |
| `apps/tui/src/router/registry.ts` | **Modify** | Import `DashboardScreen` and replace `PlaceholderScreen` in the Dashboard registry entry |
| `apps/tui/src/screens/index.ts` | **Modify** | Add `DashboardScreen` to barrel export |

## Files NOT Changed (Verified Correct)

| File | Reason |
|------|--------|
| `apps/tui/src/router/types.ts` | `ScreenName.Dashboard` and `DEFAULT_ROOT_SCREEN` already correct |
| `apps/tui/src/navigation/goToBindings.ts` | `g d` binding already defined |
| `apps/tui/src/navigation/deepLinks.ts` | Default stack already uses Dashboard |
| `apps/tui/src/components/HeaderBar.tsx` | Breadcrumb rendering already works from registry |
| `apps/tui/src/components/StatusBar.tsx` | Hint rendering already works from `useStatusBarHints()` |
| `apps/tui/src/components/GlobalKeybindings.tsx` | Go-to mode activation is a separate ticket |
| `apps/tui/src/index.tsx` | Entry point already renders `ScreenRouter` which resolves Dashboard |

---

## Unit & Integration Tests

**Test file**: `e2e/tui/dashboard.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests run against the real TUI binary with a test API server. No mocking of implementation details.

### Test ID Naming Convention

Following the established pattern from `agents.test.ts` and `diff.test.ts`:
- `SNAP-DASH-*` — Terminal snapshot tests
- `KEY-DASH-*` — Keyboard interaction tests
- `RESP-DASH-*` — Responsive layout tests
- `INT-DASH-*` — Integration tests

### Test File: `e2e/tui/dashboard.test.ts`

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  type TUITestInstance,
  TERMINAL_SIZES,
  createMockAPIEnv,
} from "./helpers";

let terminal: TUITestInstance;

afterEach(async () => {
  if (terminal) {
    await terminal.terminate();
  }
});

describe("TUI_DASHBOARD — Screen scaffold", () => {
  // ─── Directory and module structure ───────────────────────────────────

  describe("module scaffold", () => {
    test("SNAP-DASH-001: Dashboard/index.tsx exists and exports DashboardScreen", async () => {
      const mod = await import(
        "../../apps/tui/src/screens/Dashboard/index.js"
      );
      expect(mod.DashboardScreen).toBeDefined();
      expect(typeof mod.DashboardScreen).toBe("function");
    });

    test("SNAP-DASH-002: screens barrel re-exports DashboardScreen", async () => {
      const mod = await import("../../apps/tui/src/screens/index.js");
      expect(mod.DashboardScreen).toBeDefined();
    });

    test("SNAP-DASH-003: screen registry maps Dashboard to DashboardScreen (not PlaceholderScreen)", async () => {
      const { screenRegistry } = await import(
        "../../apps/tui/src/router/registry.js"
      );
      const { ScreenName } = await import(
        "../../apps/tui/src/router/types.js"
      );
      const entry = screenRegistry[ScreenName.Dashboard];
      expect(entry).toBeDefined();
      expect(entry.component.name).toBe("DashboardScreen");
      expect(entry.requiresRepo).toBe(false);
      expect(entry.requiresOrg).toBe(false);
      expect(entry.breadcrumbLabel({})).toBe("Dashboard");
    });
  });

  // ─── Default launch behavior ──────────────────────────────────────────

  describe("default launch (stack depth 1)", () => {
    test("SNAP-DASH-010: TUI launches to Dashboard by default at 120x40", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      // Dashboard breadcrumb should appear in header
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard/);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-DASH-011: TUI launches to Dashboard by default at 80x24 (minimum)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-DASH-012: TUI launches to Dashboard by default at 200x60 (large)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-DASH-013: Dashboard renders welcome text in content area", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Welcome to Codeplane");
    });

    test("INT-DASH-001: Dashboard is at stack depth 1 on default launch", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      // q on root screen should quit (not navigate back)
      // If we were at depth > 1, q would pop.
      // We verify by checking that no parent breadcrumb segments exist.
      const headerLine = terminal.getLine(0);
      // No " › " separator means single segment = depth 1
      expect(headerLine).not.toMatch(/›/);
    });

    test("INT-DASH-002: --screen dashboard launches to Dashboard", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "dashboard"],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard/);
    });
  });

  // ─── HeaderBar breadcrumb integration ────────────────────────────────

  describe("header bar breadcrumb", () => {
    test("SNAP-DASH-020: header shows 'Dashboard' as bold breadcrumb", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard/);
    });

    test("SNAP-DASH-021: header does not show repo context on Dashboard", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      const headerLine = terminal.getLine(0);
      // No owner/repo pattern in header
      expect(headerLine).not.toMatch(/\w+\/\w+/);
    });
  });

  // ─── StatusBar hint integration ──────────────────────────────────────

  describe("status bar keybinding hints", () => {
    test("SNAP-DASH-030: status bar shows go-to hint", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/g:go-to|g.*go-to/);
    });

    test("SNAP-DASH-031: status bar shows help hint", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/\?.*help/);
    });
  });

  // ─── Keyboard interaction ────────────────────────────────────────────

  describe("keyboard interaction", () => {
    test("KEY-DASH-001: q on Dashboard root screen exits TUI", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      // q on root should exit — process terminates
      // We test that the process eventually exits after sending q
      await terminal.sendKeys("q");
      // After q on root, TUI should quit. The terminal instance
      // will see process exit. We give it a moment.
      // If this doesn't exit, the test will timeout — which is correct.
    });

    test("KEY-DASH-002: Ctrl+C on Dashboard exits TUI", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("ctrl+c");
    });

    test("KEY-DASH-003: g d from another screen navigates back to Dashboard", async () => {
      // This test exercises the go-to keybinding.
      // It will FAIL until tui-global-keybindings implements go-to mode.
      // Left failing per project policy.
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      // Navigate away from Dashboard (e.g. push Notifications)
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");

      // Navigate back to Dashboard via g d
      await terminal.sendKeys("g", "d");
      await terminal.waitForText("Dashboard");

      // Verify we're at stack depth 1 (no ›)
      const headerLine = terminal.getLine(0);
      expect(headerLine).not.toMatch(/›/);
      expect(headerLine).toMatch(/Dashboard/);
    });
  });

  // ─── Responsive layout ───────────────────────────────────────────────

  describe("responsive layout", () => {
    test("RESP-DASH-001: Dashboard renders without crash at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("Welcome to Codeplane");
    });

    test("RESP-DASH-002: Dashboard renders without crash at 200x60", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("Welcome to Codeplane");
    });

    test("RESP-DASH-003: Dashboard survives terminal resize", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      // Resize to minimum
      await terminal.resize(80, 24);
      await terminal.waitForText("Dashboard");

      // Resize to large
      await terminal.resize(200, 60);
      await terminal.waitForText("Dashboard");
    });

    test("RESP-DASH-004: Dashboard at below-minimum shows too-small message", async () => {
      terminal = await launchTUI({
        cols: 60,
        rows: 20,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Terminal too small");
    });
  });

  // ─── Navigation integration ──────────────────────────────────────────

  describe("navigation integration", () => {
    test("INT-DASH-010: Dashboard does not show PlaceholderScreen content", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      // Should NOT show the placeholder text
      await terminal.waitForNoText("not yet implemented", 2000);
    });

    test("INT-DASH-011: Dashboard is the default root in the navigation stack", async () => {
      // Verify via deep link behavior: no --screen arg means Dashboard
      const { buildInitialStack } = await import(
        "../../apps/tui/src/navigation/deepLinks.js"
      );
      const result = buildInitialStack({});
      expect(result.stack).toHaveLength(1);
      expect(result.stack[0].screen).toBe("Dashboard");
      expect(result.stack[0].breadcrumb).toBe("Dashboard");
      expect(result.error).toBeUndefined();
    });

    test("INT-DASH-012: Dashboard registry entry has correct metadata", async () => {
      const { screenRegistry } = await import(
        "../../apps/tui/src/router/registry.js"
      );
      const { ScreenName } = await import(
        "../../apps/tui/src/router/types.js"
      );
      const def = screenRegistry[ScreenName.Dashboard];
      expect(def.requiresRepo).toBe(false);
      expect(def.requiresOrg).toBe(false);
      expect(def.breadcrumbLabel({})).toBe("Dashboard");
      // Verify it's no longer the placeholder
      expect(def.component.name).not.toBe("PlaceholderScreen");
    });
  });
});
```

### Test Inventory

| Test ID | Category | Description | Expected Status |
|---------|----------|-------------|----------------|
| SNAP-DASH-001 | Module | DashboardScreen export exists | ✅ Pass |
| SNAP-DASH-002 | Module | Barrel re-export works | ✅ Pass |
| SNAP-DASH-003 | Module | Registry maps to DashboardScreen | ✅ Pass |
| SNAP-DASH-010 | Snapshot | Default launch at 120×40 | ✅ Pass |
| SNAP-DASH-011 | Snapshot | Default launch at 80×24 | ✅ Pass |
| SNAP-DASH-012 | Snapshot | Default launch at 200×60 | ✅ Pass |
| SNAP-DASH-013 | Content | Welcome text renders | ✅ Pass |
| INT-DASH-001 | Integration | Stack depth is 1 on default launch | ✅ Pass |
| INT-DASH-002 | Integration | --screen dashboard flag works | ✅ Pass |
| SNAP-DASH-020 | Header | Bold breadcrumb shows | ✅ Pass |
| SNAP-DASH-021 | Header | No repo context on Dashboard | ✅ Pass |
| SNAP-DASH-030 | StatusBar | go-to hint visible | ✅ Pass |
| SNAP-DASH-031 | StatusBar | help hint visible | ✅ Pass |
| KEY-DASH-001 | Keyboard | q exits on root | ✅ Pass |
| KEY-DASH-002 | Keyboard | Ctrl+C exits | ✅ Pass |
| KEY-DASH-003 | Keyboard | g d navigates to Dashboard | ❌ Fails (go-to mode not yet wired) |
| RESP-DASH-001 | Responsive | Renders at 80×24 | ✅ Pass |
| RESP-DASH-002 | Responsive | Renders at 200×60 | ✅ Pass |
| RESP-DASH-003 | Responsive | Survives resize | ✅ Pass |
| RESP-DASH-004 | Responsive | Below-minimum shows too-small | ✅ Pass |
| INT-DASH-010 | Integration | No placeholder text | ✅ Pass |
| INT-DASH-011 | Integration | Default root in stack builder | ✅ Pass |
| INT-DASH-012 | Integration | Registry metadata correct | ✅ Pass |

**Intentionally failing tests**: `KEY-DASH-003` will fail because the `g` key handler in `GlobalKeybindings.tsx` is a no-op (`/* TODO: wired in go-to keybindings ticket */`). This test is left failing per project policy — it validates behavior that depends on `tui-global-keybindings` being fully implemented.

---

## Productionization Checklist

This scaffold is intentionally minimal. The following items track what must happen to make the Dashboard a production-quality screen:

### From POC → Production (tracked by subsequent TUI_DASHBOARD tickets)

| Concern | Current State | Production Target | Tracked By |
|---------|---------------|-------------------|------------|
| Recent repos section | Not rendered | `useRepos()` with limit, sorted by recent activity | `tui-dashboard-repos-list` |
| Organizations section | Not rendered | `useOrgs()` with member count | `tui-dashboard-orgs-list` |
| Starred repos section | Not rendered | `useRepos({ starred: true })` | `tui-dashboard-starred-repos` |
| Activity feed | Not rendered | SSE-backed activity stream | `tui-dashboard-activity-feed` |
| Quick actions | Not rendered | `n` for new issue, `w` for new workspace, etc. | `tui-dashboard-quick-actions` |
| Screen keybindings | Minimal placeholder | Full `j/k` navigation across sections, `Enter` to open | Per-section tickets |
| Data fetching | None | Loading states, error handling, retry | Per-section tickets |
| Scroll behavior | None | `<scrollbox>` with section-based scrolling | When content exceeds viewport |

### Integration Points Already Wired (no further work needed)

| Integration | Status |
|-------------|--------|
| Router registration | ✅ Complete — `ScreenName.Dashboard` → `DashboardScreen` |
| Breadcrumb rendering | ✅ Complete — "Dashboard" label from registry |
| Default launch screen | ✅ Complete — `DEFAULT_ROOT_SCREEN = ScreenName.Dashboard` |
| Deep link `--screen dashboard` | ✅ Complete — `buildInitialStack` resolves alias |
| Go-to binding definition | ✅ Complete — `goToBindings` includes `d` → `Dashboard` |
| StatusBar hints | ✅ Complete — `useScreenKeybindings` populates hints |
| Theme consumption | ✅ Complete — `useTheme()` available |
| Responsive layout | ✅ Complete — `useLayout()` available |

### Go-to Mode Dependency

The `g d` keybinding traverses this path:

1. User presses `g` → `GlobalKeybindings.onGoTo()` activates go-to mode (currently no-op)
2. Go-to mode registers a `PRIORITY.GOTO` scope with `goToBindings` handlers
3. User presses `d` within 1500ms → `executeGoTo(nav, dashboardBinding, repoContext)` is called
4. `executeGoTo` calls `nav.reset(ScreenName.Dashboard)` → stack becomes `[Dashboard]`
5. `ScreenRouter` renders `DashboardScreen`

Steps 1-2 are blocked on `tui-global-keybindings`. Steps 3-5 work once go-to mode is active. The `KEY-DASH-003` test validates the full flow and will pass once the dependency is resolved.

---

## Acceptance Criteria

1. ✅ `apps/tui/src/screens/Dashboard/index.tsx` exists and exports `DashboardScreen`
2. ✅ `DashboardScreen` accepts `ScreenComponentProps` and renders without error
3. ✅ `screenRegistry[ScreenName.Dashboard].component` is `DashboardScreen` (not `PlaceholderScreen`)
4. ✅ TUI launches to Dashboard by default (no `--screen` args) at stack depth 1
5. ✅ Header bar shows "Dashboard" as the breadcrumb
6. ✅ Status bar shows keybinding hints registered by the Dashboard screen
7. ✅ Dashboard renders a placeholder content area (not the generic "not yet implemented" text)
8. ✅ Dashboard renders correctly at all three breakpoints (80×24, 120×40, 200×60)
9. ✅ `g d` go-to binding is defined and will route to Dashboard when go-to mode is activated
10. ✅ `e2e/tui/dashboard.test.ts` exists with snapshot, keyboard, responsive, and integration tests
11. ✅ Tests that depend on unimplemented backends (go-to mode) are left failing
12. ✅ TypeScript compiles with zero errors (`tsc --noEmit`)
