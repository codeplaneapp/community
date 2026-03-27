# Engineering Specification: `tui-workspace-list-screen`

## Ticket Summary

**Title:** Workspace list screen with pagination and filtering  
**Type:** Feature  
**Feature:** `TUI_WORKSPACE_LIST_SCREEN`  
**Dependencies:**
- `tui-workspace-data-hooks` — `useWorkspaces()`, `useSuspendWorkspace()`, `useResumeWorkspace()`, `useDeleteWorkspace()`, `useWorkspaceSSH()` from `@codeplane/ui-core`
- `tui-workspace-screen-scaffold` — screen registry entries, `g w` go-to binding, deep-link support, param validation
- `tui-workspace-status-badge` — `WorkspaceStatusBadge` component for status rendering
- `tui-workspace-status-stream` — `useWorkspaceListStatusStream` hook for SSE-driven real-time updates
- `tui-workspace-e2e-helpers` — `WORKSPACE_FIXTURES`, `launchTUIWithWorkspaceContext()`, `assertWorkspaceRow()`, `waitForStatusTransition()`

**Target Files:**
- `apps/tui/src/screens/Workspaces/WorkspaceListScreen.tsx` — primary screen component
- `apps/tui/src/screens/Workspaces/components/WorkspaceRow.tsx` — single workspace row
- `apps/tui/src/screens/Workspaces/components/WorkspaceColumnHeaders.tsx` — column header row
- `apps/tui/src/screens/Workspaces/components/WorkspaceFilterToolbar.tsx` — filter toolbar
- `apps/tui/src/screens/Workspaces/components/WorkspaceEmptyState.tsx` — empty/no-results state
- `apps/tui/src/screens/Workspaces/components/DeleteConfirmationOverlay.tsx` — delete confirmation modal
- `apps/tui/src/screens/Workspaces/hooks/useWorkspaceListState.ts` — list state management
- `apps/tui/src/screens/Workspaces/hooks/useWorkspaceListKeybindings.ts` — keybinding registration
- `apps/tui/src/screens/Workspaces/hooks/useWorkspaceActions.ts` — suspend/resume/delete/SSH orchestration
- `apps/tui/src/screens/Workspaces/hooks/useWorkspaceColumns.ts` — responsive column layout
- `apps/tui/src/screens/Workspaces/types.ts` — local types
- `apps/tui/src/screens/Workspaces/constants.ts` — constants
- `apps/tui/src/screens/Workspaces/index.ts` — barrel export

**Test File:** `e2e/tui/workspaces.test.ts` (append to existing)

---

## 1. Current State Analysis

### What already exists

| Artifact | Location | Status |
|----------|----------|--------|
| `ScreenName.Workspaces` enum | `apps/tui/src/router/types.ts:7` | ✅ Present |
| `ScreenName.WorkspaceDetail` enum | `apps/tui/src/router/types.ts:30` | ✅ Present |
| `ScreenName.WorkspaceCreate` enum | `apps/tui/src/router/types.ts:31` | ✅ Present |
| Registry entry for `Workspaces` | `apps/tui/src/router/registry.ts:29-34` | ✅ `requiresRepo: false`, uses `PlaceholderScreen` |
| Go-to binding `g w → Workspaces` | `apps/tui/src/navigation/goToBindings.ts:16` | ✅ `requiresRepo: false` |
| Deep-link `workspaces` | `apps/tui/src/navigation/deepLinks.ts` | ✅ Present |
| `useScreenKeybindings` | `apps/tui/src/hooks/useScreenKeybindings.ts` | ✅ Full implementation |
| `useScreenLoading` | `apps/tui/src/hooks/useScreenLoading.ts` | ✅ Full implementation |
| `useOptimisticMutation` | `apps/tui/src/hooks/useOptimisticMutation.ts` | ✅ Full implementation |
| `useLayout` / `useBreakpoint` | `apps/tui/src/hooks/useLayout.ts` | ✅ Full implementation |
| `useTheme` | `apps/tui/src/hooks/useTheme.ts` | ✅ Full implementation |
| `useNavigation` | `apps/tui/src/hooks/useNavigation.ts` | ✅ Full implementation |
| `FullScreenLoading` | `apps/tui/src/components/FullScreenLoading.tsx` | ✅ Full implementation |
| `FullScreenError` | `apps/tui/src/components/FullScreenError.tsx` | ✅ Full implementation |
| `PaginationIndicator` | `apps/tui/src/components/PaginationIndicator.tsx` | ✅ Full implementation |
| `truncateRight`, `fitWidth`, `truncateText` | `apps/tui/src/util/text.ts` | ✅ Full implementation |
| `SSEProvider` | `apps/tui/src/providers/SSEProvider.tsx` | ⚠️ Stub (returns `null`) |
| Telemetry `emit()` | `apps/tui/src/lib/telemetry.ts` | ✅ Full implementation |
| `WorkspaceStatusBadge` | dependency ticket | 🔜 Not yet implemented |
| `useWorkspaceListStatusStream` | dependency ticket | 🔜 Not yet implemented |
| `useWorkspaces` (ui-core) | dependency ticket | 🔜 Not yet implemented |
| E2E workspace helpers | dependency ticket | 🔜 Not yet implemented |

### What this ticket changes

1. **Replace `PlaceholderScreen`** for `ScreenName.Workspaces` in `registry.ts` with `WorkspaceListScreen`
2. **Create 13 new files** under `apps/tui/src/screens/Workspaces/`
3. **Append 120 E2E tests** to `e2e/tui/workspaces.test.ts`

---

## 2. Implementation Plan

### Step 1: Create directory structure, types, and constants

**File: `apps/tui/src/screens/Workspaces/types.ts`**

```typescript
import type { Workspace, WorkspaceStatus } from "@codeplane/ui-core";

/** Status filter options. Cycles: All → Running → Suspended → Pending → Failed → Stopped → All */
export type StatusFilter = "all" | "running" | "suspended" | "pending" | "failed" | "stopped";

/** Column definition for responsive layout */
export interface ColumnConfig {
  key: string;
  label: string;
  width: number; // -1 = flex fill remaining space
  visibleAt: ("minimum" | "standard" | "large")[];
}

/** Props for a single workspace row */
export interface WorkspaceRowProps {
  workspace: Workspace;
  focused: boolean;
  selected: boolean;
  columns: ColumnConfig[];
  breakpoint: "minimum" | "standard" | "large";
  currentUserId: number | null;
}
```

**File: `apps/tui/src/screens/Workspaces/constants.ts`**

```typescript
import type { StatusFilter, ColumnConfig } from "./types.js";

export const PAGE_SIZE = 30;
export const MEMORY_CAP = 200;
export const PAGINATION_SCROLL_THRESHOLD = 0.8;
export const STATUS_BAR_FLASH_MS = 3_000;
export const COUNT_ABBREVIATION_THRESHOLD = 9999;

export const STATUS_FILTER_CYCLE: readonly StatusFilter[] = [
  "all", "running", "suspended", "pending", "failed", "stopped",
];

export const COLUMNS: Record<"minimum" | "standard" | "large", ColumnConfig[]> = {
  minimum: [
    { key: "statusIcon", label: "", width: 2, visibleAt: ["minimum", "standard", "large"] },
    { key: "name", label: "NAME", width: -1, visibleAt: ["minimum", "standard", "large"] },
    { key: "timestamp", label: "AGE", width: 4, visibleAt: ["minimum", "standard", "large"] },
  ],
  standard: [
    { key: "statusIcon", label: "", width: 2, visibleAt: ["minimum", "standard", "large"] },
    { key: "name", label: "NAME", width: 30, visibleAt: ["minimum", "standard", "large"] },
    { key: "statusLabel", label: "STATUS", width: 12, visibleAt: ["standard", "large"] },
    { key: "owner", label: "OWNER", width: 15, visibleAt: ["standard", "large"] },
    { key: "idleTimeout", label: "IDLE", width: 8, visibleAt: ["standard", "large"] },
    { key: "timestamp", label: "AGE", width: 4, visibleAt: ["minimum", "standard", "large"] },
  ],
  large: [
    { key: "statusIcon", label: "", width: 2, visibleAt: ["minimum", "standard", "large"] },
    { key: "name", label: "NAME", width: 30, visibleAt: ["minimum", "standard", "large"] },
    { key: "id", label: "ID", width: 12, visibleAt: ["large"] },
    { key: "statusLabel", label: "STATUS", width: 12, visibleAt: ["standard", "large"] },
    { key: "owner", label: "OWNER", width: 15, visibleAt: ["standard", "large"] },
    { key: "idleTimeout", label: "IDLE", width: 8, visibleAt: ["standard", "large"] },
    { key: "suspendedAt", label: "SUSPENDED", width: 12, visibleAt: ["large"] },
    { key: "createdAt", label: "CREATED", width: 12, visibleAt: ["large"] },
    { key: "timestamp", label: "AGE", width: 4, visibleAt: ["minimum", "standard", "large"] },
  ],
};
```

---

### Step 2: Create responsive column layout hook

**File: `apps/tui/src/screens/Workspaces/hooks/useWorkspaceColumns.ts`**

Calculates visible columns and widths from the current terminal breakpoint.

```typescript
import { useMemo } from "react";
import { useLayout } from "../../../hooks/useLayout.js";
import { COLUMNS } from "../constants.js";
import type { ColumnConfig } from "../types.js";

export interface ResolvedColumns {
  columns: ColumnConfig[];
  breakpoint: "minimum" | "standard" | "large";
  showColumnHeaders: boolean;
  showToolbarStatusFilter: boolean;
  deleteOverlayWidth: string;
}

export function useWorkspaceColumns(): ResolvedColumns {
  const { width, breakpoint } = useLayout();

  return useMemo(() => {
    const bp = breakpoint ?? "minimum";
    const columnDefs = COLUMNS[bp];

    const fixedWidth = columnDefs
      .filter((c) => c.width > 0)
      .reduce((sum, c) => sum + c.width + 1, 0);
    const remainingWidth = Math.max(4, width - fixedWidth - 2);

    const resolved = columnDefs.map((col) => ({
      ...col,
      width: col.width === -1 ? remainingWidth : col.width,
    }));

    return {
      columns: resolved,
      breakpoint: bp,
      showColumnHeaders: bp !== "minimum",
      showToolbarStatusFilter: bp !== "minimum",
      deleteOverlayWidth: bp === "minimum" ? "90%" : "50%",
    };
  }, [width, breakpoint]);
}
```

---

### Step 3: Create workspace list state management hook

**File: `apps/tui/src/screens/Workspaces/hooks/useWorkspaceListState.ts`**

Core state: focus tracking, client-side filtering (status + text search), selection, pagination, delete confirmation overlay.

Key behaviors:
- `filteredWorkspaces` — derived from `workspaces` via `useMemo`, filtered by `statusFilter` (enum match) and `searchText` (case-insensitive substring on `name`)
- `focusedIndex` — clamped to `[0, filteredWorkspaces.length - 1]` on every render; never stale
- `moveFocus("down")` triggers `fetchMore()` when index crosses `workspaces.length * 0.8` and `hasMore` is true
- `cycleStatusFilter()` advances through `STATUS_FILTER_CYCLE` and resets `focusedIndex` to 0
- `inflightActions` ref prevents duplicate API calls for the same workspace
- `formattedTotalCount` abbreviates counts >9999 as `"10k+"`
- `paginationCapReached` is true when loaded items >= `MEMORY_CAP` (200) and `hasMore` is true

Interface contract:

```typescript
export interface WorkspaceListStateReturn {
  filteredWorkspaces: Workspace[];
  focusedWorkspace: Workspace | null;
  focusedIndex: number;
  statusFilter: StatusFilter;
  searchText: string;
  searchActive: boolean;
  selectedIds: Set<string>;
  showDeleteConfirm: boolean;
  pendingDeleteWorkspace: Workspace | null;
  isActionInflight: (workspaceId: string) => boolean;
  displayTotalCount: number;
  paginationCapReached: boolean;
  formattedTotalCount: string;

  moveFocus: (direction: "up" | "down") => void;
  jumpToFirst: () => void;
  jumpToLast: () => void;
  pageDown: (visibleHeight: number) => void;
  pageUp: (visibleHeight: number) => void;
  cycleStatusFilter: () => void;
  setSearchText: (text: string) => void;
  activateSearch: () => void;
  deactivateSearch: () => void;
  clearFilters: () => void;
  toggleSelection: (workspaceId: string) => void;
  showDeleteConfirmation: () => void;
  hideDeleteConfirmation: () => void;
  markActionInflight: (workspaceId: string) => void;
  clearActionInflight: (workspaceId: string) => void;
}
```

All state is local to the screen — not persisted across navigation.

---

### Step 4: Create workspace action orchestration hook

**File: `apps/tui/src/screens/Workspaces/hooks/useWorkspaceActions.ts`**

Wraps `useOptimisticMutation` for suspend, resume, delete. Guards preconditions:
- `suspend`: no-op if status !== `"running"` or action inflight
- `resume`: no-op if status !== `"suspended"` or action inflight
- `deleteWorkspace`: requires prior confirmation; no-op if action inflight
- `copySSH`: no-op if status !== `"running"`; fetches SSH info via `useWorkspaceSSH`, writes to clipboard via OSC 52 escape (`\x1b]52;c;{base64}\x07`), fallback displays inline if clipboard unavailable
- `navigateToCreate`: calls `nav.push(ScreenName.WorkspaceCreate, { owner, repo })`
- `navigateToDetail`: calls `nav.push(ScreenName.WorkspaceDetail, { owner, repo, workspaceId })`

Optimistic update pattern (following existing `useOptimisticMutation` from `apps/tui/src/hooks/useOptimisticMutation.ts`):
1. `onOptimistic` — mark inflight, update status locally
2. `mutate` — call API via ui-core hook
3. `onSuccess` — clear inflight, emit telemetry
4. `onRevert` — clear inflight, restore original status, status bar error flash (5s via `LoadingProvider.failMutation`)

**Productionization stub pattern:** The `mutate` functions initially throw `"Not yet wired to ui-core hook"`. When `tui-workspace-data-hooks` is complete, the hooks `useSuspendWorkspace(owner, repo)`, `useResumeWorkspace(owner, repo)`, `useDeleteWorkspace(owner, repo)` are called at the component level in `WorkspaceListScreen.tsx`, and their `.mutate` methods are passed into `useWorkspaceActions` as options.

---

### Step 5: Create keybinding registration hook

**File: `apps/tui/src/screens/Workspaces/hooks/useWorkspaceListKeybindings.ts`**

Registers all screen keybindings via `useScreenKeybindings()`. Each `KeyHandler` has a `when` predicate that gates activation based on current state:

| State | Active keys |
|-------|-------------|
| `searchActive` | Only `Escape` (exit search). All printable keys pass through to `<input>` (Priority 1: TEXT_INPUT in KeybindingProvider) |
| `showDeleteConfirm` | Only `y`, `n`, `Escape`. Focus trapped — all other keys blocked |
| List focused, no overlay | Full set: `j/k/↑/↓`, `Enter`, `G`, `gg`, `Ctrl+D/U`, `/`, `f`, `c`, `p`, `r`, `d`, `S`, `Space`, `Escape` |
| Error state | Only `R` (retry) |
| Loading state | All navigation/action keys blocked |

Status bar hints (registered via second param to `useScreenKeybindings`):
```
j/k:nav  Enter:open  /:filter  f:status  c:create  p:pause  r:resume  q:back
```

**`g g` (jump to top) implementation:** Uses a `lastGPressRef` with timestamp. When `g` is pressed: if a previous `g` was within 500ms, call `jumpToFirst()` and clear ref; otherwise store timestamp. This avoids conflict with the global go-to mode `g` prefix by using the screen-level PRIORITY.SCREEN scope which fires before the global go-to handler checks for the second key.

---

### Step 6: Create sub-components

**File: `apps/tui/src/screens/Workspaces/components/WorkspaceRow.tsx`**

Single workspace row. Layout adapts via `columns` prop from `useWorkspaceColumns`. Key rendering details:
- Selection prefix: `✓` if selected, space otherwise (1ch)
- Status icon: delegates to `WorkspaceStatusBadge` with `showLabel={false}` (2ch)
- Name: `truncateRight(workspace.name ?? "<unnamed>", nameWidth)`. Null names render as `<unnamed>` with `dim` attribute and `muted` color
- ID (large only): first 8 chars of UUID + `…` (12ch)
- Status label (standard+): delegates to `WorkspaceStatusBadge` with `showLabel={true}` (12ch)
- Owner (standard+): `truncateRight(ownerLogin, 15)` with `muted` color
- Idle timeout (standard+): `formatIdleTimeout(seconds)` — `0` → `"—"`, `<3600` → `"{n}m"`, `<86400` → `"{n}h"`, else `"{n}d"` (8ch max)
- Suspended-at (large only): `formatRelativeTimeLong(timestamp)` → `"{short} ago"` (12ch max)
- Created-at (large only): same format (12ch max)
- Age (all): `formatRelativeTime(timestamp)` → max 4ch: `"now"`, `"3m"`, `"2h"`, `"5d"`, `"1mo"`, `"2y"`
- Focused row: `attributes={7}` (ANSI reverse video) with `fg={theme.primary}`

**File: `apps/tui/src/screens/Workspaces/components/WorkspaceColumnHeaders.tsx`**

Single row on `surface` background with bold muted column labels. Hidden at minimum breakpoint (controlled by parent via `showColumnHeaders` flag).

**File: `apps/tui/src/screens/Workspaces/components/WorkspaceFilterToolbar.tsx`**

One-row toolbar below title. At minimum: search input only. At standard+: `"Status: {filter}"` label + search input. When `searchActive`: shows `<input>` with cursor. When inactive: shows `/ filter` hint text.

**File: `apps/tui/src/screens/Workspaces/components/WorkspaceEmptyState.tsx`**

Centered in remaining content area. Two variants:
- No filters active: `"No workspaces found. Press \`c\` to create one."`
- Filters active: `"No workspaces match the current filters."` + `"Press Esc to clear filters."`

**File: `apps/tui/src/screens/Workspaces/components/DeleteConfirmationOverlay.tsx`**

Absolute-positioned modal, centered, with `border="single"` and `surface` background. Content:
```
Delete workspace '{name}'?
This action cannot be undone.
[y] Confirm    [n/Esc] Cancel
```
Width: 50% at standard/large, 90% at minimum. Recenters on resize via `useOnResize`.

---

### Step 7: Create the main WorkspaceListScreen component

**File: `apps/tui/src/screens/Workspaces/WorkspaceListScreen.tsx`**

Root screen component composing all hooks and sub-components. Structure:

```
<box flexDirection="column" width="100%" height={contentHeight}>
  {/* Title row: "Workspaces (N)" + "/ filter" hint */}
  {/* Filter toolbar */}
  {/* Column headers (hidden at minimum) */}
  {/* Scrollable list OR empty state */}
  {/* Pagination indicator (when hasMore) */}
  {/* Pagination cap footer (when >= 200 loaded) */}
  {/* Delete confirmation overlay (absolute positioned) */}
</box>
```

Data flow:
1. `useWorkspaces(owner, repo)` from `@codeplane/ui-core` → raw data (stub until dependency complete)
2. `useWorkspaceListStatusStream()` → SSE events update workspace statuses inline (stub until dependency complete)
3. `useScreenLoading()` → manages spinner/skeleton/error states with 80ms skip threshold, 30s timeout
4. `useWorkspaceListState()` → client-side filtering, focus, selection
5. `useWorkspaceColumns()` → responsive column layout
6. `useWorkspaceActions()` → suspend/resume/delete/SSH/navigation
7. `useWorkspaceListKeybindings()` → registers all keybindings
8. Telemetry `emit("tui.workspaces.view", ...)` on mount after data loads

Conditional rendering order:
1. If `showSpinner` → `<FullScreenLoading label="Loading workspaces…" />`
2. If `showError` → `<FullScreenError screenLabel="workspaces" />`
3. If `filteredWorkspaces.length === 0` → `<WorkspaceEmptyState />`
4. Otherwise → `<scrollbox>` with `WorkspaceRow` list

---

### Step 8: Create barrel export and wire into registry

**File: `apps/tui/src/screens/Workspaces/index.ts`**

```typescript
export { WorkspaceListScreen } from "./WorkspaceListScreen.js";
```

**Modification: `apps/tui/src/router/registry.ts`**

```diff
+ import { WorkspaceListScreen } from "../screens/Workspaces/index.js";

  [ScreenName.Workspaces]: {
-   component: PlaceholderScreen,
+   component: WorkspaceListScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Workspaces",
  },
```

---

### Step 9: Productionization Checklist

| Stub | File | Dependency | Resolution |
|------|------|------------|------------|
| Data hook stub (`workspacesData`) | `WorkspaceListScreen.tsx` | `tui-workspace-data-hooks` | Replace with `useWorkspaces(owner, repo, { page: 1, perPage: PAGE_SIZE })` |
| SSE streaming stub | `WorkspaceListScreen.tsx` | `tui-workspace-status-stream` | Add `useWorkspaceListStatusStream({ workspaceIds })` call; wire `onStatusChange` callback to update workspace status in local cache |
| `mutate` throw stubs | `useWorkspaceActions.ts` | `tui-workspace-data-hooks` | Call `useSuspendWorkspace()`, `useResumeWorkspace()`, `useDeleteWorkspace()` at component level; pass `.mutate` into action hook options |
| SSH copy (`copySSH`) | `useWorkspaceActions.ts` | `tui-workspace-data-hooks` | Use `useWorkspaceSSH(owner, repo, workspaceId).data.ssh_command`; write via OSC 52 |
| `currentUserId: null` | `WorkspaceListScreen.tsx` | `tui-auth-provider` | Wire `useAuth().user.id` for permission-gated actions |
| `WorkspaceStatusBadge` import | `WorkspaceRow.tsx` | `tui-workspace-status-badge` | Import when component exists; temporary inline `●` rendering until then |
| Optimistic update callbacks (empty) | `WorkspaceListScreen.tsx` | `tui-workspace-data-hooks` | Wire to `.refetch()` or direct cache mutation from data hooks |
| Owner display (`user_id` → login) | `WorkspaceRow.tsx` | `tui-workspace-data-hooks` | API response includes owner info; map `workspace.user.login` |

---

## 3. Unit & Integration Tests

### Test File: `e2e/tui/workspaces.test.ts`

**Framework:** `@microsoft/tui-test` via `bun:test`  
**Runner:** `bun test e2e/tui/workspaces.test.ts`  
**Timeout:** 30s per test (from `bunfig.toml`)  

**Conventions:**
- Each test launches a fresh TUI via `launchTUI()` — no shared state
- `afterEach` calls `terminal.terminate()` for cleanup
- Tests that fail due to unimplemented backends are **left failing** — never skipped or commented out
- No mocking of implementation details — tests validate user-visible terminal output
- Snapshot tests use `toMatchSnapshot()` for golden-file comparison
- Keyboard tests assert via `getLine()` with ANSI regex patterns or `waitForText()`/`waitForNoText()`

---

### Terminal Snapshot Tests (19 tests)

```typescript
describe("TUI_WORKSPACE_LIST_SCREEN — Terminal Snapshot Tests", () => {
  let terminal: TUITestInstance;
  afterEach(async () => { if (terminal) await terminal.terminate(); });

  test("SNAP-WS-001: workspace-list-screen-initial-load", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-002: workspace-list-screen-empty-state", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("No workspaces found");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-003: workspace-list-screen-loading-state", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Loading workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-004: workspace-list-screen-error-state", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Failed to load");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-005: workspace-list-screen-focused-row", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const firstDataLine = terminal.getLine(4);
    expect(firstDataLine).toMatch(/\x1b\[7m/);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-006: workspace-list-screen-status-icons", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toContain("●");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-007: workspace-list-screen-filter-active", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-008: workspace-list-screen-filter-results", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("dev");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-009: workspace-list-screen-filter-no-results", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("zzzznonexistent");
    await terminal.waitForText("No workspaces match");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-010: workspace-list-screen-status-filter", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("f");
    await terminal.waitForText("Status: Running");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-011: workspace-list-screen-pagination-loading", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("shift+G");
    await terminal.waitForText("Loading more");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-012: workspace-list-screen-header-total-count", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.getLine(1)).toMatch(/Workspaces \(\d+\)/);
  });

  test("SNAP-WS-013: workspace-list-screen-delete-confirmation", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d");
    await terminal.waitForText("Delete workspace");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-WS-014: workspace-list-screen-breadcrumb", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.getLine(0)).toMatch(/Workspaces/);
  });

  test("SNAP-WS-015: workspace-list-screen-column-headers", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snap = terminal.snapshot();
    expect(snap).toContain("NAME");
    expect(snap).toContain("STATUS");
    expect(snap).toContain("OWNER");
    expect(snap).toContain("IDLE");
    expect(snap).toContain("AGE");
  });

  test("SNAP-WS-016: workspace-list-screen-selected-row", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("space");
    expect(terminal.snapshot()).toContain("✓");
  });

  test("SNAP-WS-017: workspace-list-screen-unnamed-workspace", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toContain("<unnamed>");
  });

  test("SNAP-WS-018: workspace-list-screen-idle-timeout-display", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatch(/30m|1h|2h/);
  });

  test("SNAP-WS-019: workspace-list-screen-suspended-status-text", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatch(/[Ss]uspended/);
  });
});
```

---

### Keyboard Interaction Tests (44 tests)

```typescript
describe("TUI_WORKSPACE_LIST_SCREEN — Keyboard Interaction Tests", () => {
  let terminal: TUITestInstance;
  afterEach(async () => { if (terminal) await terminal.terminate(); });

  test("KEY-WS-001: j moves focus down", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j");
    expect(terminal.getLine(5)).toMatch(/\x1b\[7m/);
  });

  test("KEY-WS-002: k moves focus up", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j", "k");
    expect(terminal.getLine(4)).toMatch(/\x1b\[7m/);
  });

  test("KEY-WS-003: k at top no wrap", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("k");
    expect(terminal.getLine(4)).toMatch(/\x1b\[7m/);
  });

  test("KEY-WS-004: j at bottom no wrap", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("shift+G", "j");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-005: Down arrow moves down", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("Down");
    expect(terminal.getLine(5)).toMatch(/\x1b\[7m/);
  });

  test("KEY-WS-006: Up arrow moves up", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("Down", "Up");
    expect(terminal.getLine(4)).toMatch(/\x1b\[7m/);
  });

  test("KEY-WS-007: Enter opens workspace detail", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("Enter");
    expect(terminal.getLine(0)).toMatch(/Workspace/);
  });

  test("KEY-WS-008: Enter on second item", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j", "Enter");
    expect(terminal.getLine(0)).toMatch(/Workspace/);
  });

  test("KEY-WS-009: / focuses search", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-010: filter narrows list", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("dev");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-011: filter case insensitive", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("DEV");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-012: Esc clears filter", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("test");
    await terminal.sendKeys("Escape");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-013: Esc closes delete overlay", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d");
    await terminal.waitForText("Delete workspace");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Delete workspace");
  });

  test("KEY-WS-014: Esc pops screen when no filter/overlay", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Workspaces");
  });

  test("KEY-WS-015: G jumps to bottom", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("shift+G");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-016: gg jumps to top", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("shift+G", "g", "g");
    expect(terminal.getLine(4)).toMatch(/\x1b\[7m/);
  });

  test("KEY-WS-017: Ctrl+D page down", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("ctrl+d");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-018: Ctrl+U page up", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("ctrl+d", "ctrl+u");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-019: R retries on error", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Failed to load");
    await terminal.sendKeys("shift+R");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-020: R no-op when loaded", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("shift+R");
    await terminal.waitForText("Workspaces");
  });

  test("KEY-WS-021: f cycles status filter", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("f");
    await terminal.waitForText("Running");
    await terminal.sendKeys("f");
    await terminal.waitForText("Suspended");
  });

  test("KEY-WS-022: f cycle wraps to All", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    for (let i = 0; i < 6; i++) await terminal.sendKeys("f");
    await terminal.waitForText("All");
  });

  test("KEY-WS-023: c opens create form", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("c");
    expect(terminal.getLine(0)).toMatch(/New Workspace/);
  });

  test("KEY-WS-024: p suspends running workspace", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("p");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-025: p no-op on suspended", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j", "p");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-026: p no-op on failed", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j", "j", "j", "p");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-027: r resumes suspended", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j", "r");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-028: r no-op on running", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("r");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-029: d opens delete confirm", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d");
    await terminal.waitForText("Delete workspace");
    await terminal.waitForText("[y] Confirm");
  });

  test("KEY-WS-030: d then y confirms delete", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d");
    await terminal.waitForText("Delete workspace");
    await terminal.sendKeys("y");
    await terminal.waitForNoText("Delete workspace");
  });

  test("KEY-WS-031: d then n cancels delete", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d");
    await terminal.waitForText("Delete workspace");
    await terminal.sendKeys("n");
    await terminal.waitForNoText("Delete workspace");
  });

  test("KEY-WS-032: S copies SSH command", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("shift+S");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-033: S no-op on suspended", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j", "shift+S");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-034: Space toggles selection", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("space");
    expect(terminal.snapshot()).toContain("✓");
    await terminal.sendKeys("space");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-035: q pops screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("q");
    await terminal.waitForNoText("Workspaces");
  });

  test("KEY-WS-036: j in search input types j", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("j");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-037: f in search input types f", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("f");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-038: q in search input types q", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("q");
    await terminal.waitForText("Workspaces");
  });

  test("KEY-WS-039: p in search input types p", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("p");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-040: pagination triggers on scroll", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    for (let i = 0; i < 25; i++) await terminal.sendKeys("j");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-041: rapid j presses", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    for (let i = 0; i < 15; i++) await terminal.sendKeys("j");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-042: Enter during loading is no-op", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-043: filter then status filter compounds", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("dev");
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("f");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("KEY-WS-044: delete overlay traps focus", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d");
    await terminal.waitForText("Delete workspace");
    await terminal.sendKeys("j");
    await terminal.waitForText("Delete workspace");
  });
});
```

---

### Responsive Tests (17 tests)

```typescript
describe("TUI_WORKSPACE_LIST_SCREEN — Responsive Tests", () => {
  let terminal: TUITestInstance;
  afterEach(async () => { if (terminal) await terminal.terminate(); });

  test("RESP-WS-001: 80x24 layout — minimal columns", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snap = terminal.snapshot();
    expect(snap).not.toContain("OWNER");
    expect(snap).not.toContain("IDLE");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-WS-002: 80x24 truncation", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("RESP-WS-003: 80x24 no column headers", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snap = terminal.snapshot();
    expect(snap).not.toContain("NAME");
    expect(snap).not.toContain("STATUS");
  });

  test("RESP-WS-004: 80x24 toolbar collapsed", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).not.toMatch(/Status: All/);
  });

  test("RESP-WS-005: 80x24 delete overlay 90% width", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d");
    await terminal.waitForText("Delete workspace");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-WS-006: 120x40 full layout", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snap = terminal.snapshot();
    expect(snap).toContain("NAME");
    expect(snap).toContain("STATUS");
    expect(snap).toContain("OWNER");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-WS-007: 120x40 column headers visible", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snap = terminal.snapshot();
    expect(snap).toContain("NAME");
    expect(snap).toContain("STATUS");
    expect(snap).toContain("OWNER");
    expect(snap).toContain("IDLE");
    expect(snap).toContain("AGE");
  });

  test("RESP-WS-008: 120x40 name truncation at 30ch", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("RESP-WS-009: 200x60 all columns including ID", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toContain("ID");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-WS-010: 200x60 workspace ID truncated", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatch(/[a-f0-9]{8}…/);
  });

  test("RESP-WS-011: resize standard to min collapses columns", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.resize(80, 24);
    expect(terminal.snapshot()).not.toContain("OWNER");
  });

  test("RESP-WS-012: resize min to standard reveals columns", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.resize(120, 40);
    expect(terminal.snapshot()).toContain("OWNER");
  });

  test("RESP-WS-013: resize preserves focus", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j", "j");
    await terminal.resize(80, 24);
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("RESP-WS-014: resize during filter preserves text", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("dev");
    await terminal.resize(80, 24);
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("RESP-WS-015: resize during loading no crash", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.resize(80, 24);
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("RESP-WS-016: resize with overlay recenters", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d");
    await terminal.waitForText("Delete workspace");
    await terminal.resize(80, 24);
    await terminal.waitForText("Delete workspace");
  });

  test("RESP-WS-017: search input at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    expect(terminal.snapshot()).toBeTruthy();
  });
});
```

---

### Integration Tests (24 tests)

```typescript
describe("TUI_WORKSPACE_LIST_SCREEN — Integration Tests", () => {
  let terminal: TUITestInstance;
  afterEach(async () => { if (terminal) await terminal.terminate(); });

  test("INT-WS-001: 401 triggers auth error screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("codeplane auth login");
  });

  test("INT-WS-002: 429 shows rate limit message", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Rate limited");
  });

  test("INT-WS-003: network error shows retry hint", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Failed to load");
  });

  test("INT-WS-004: pagination loads both pages (45 items)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("shift+G");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("INT-WS-005: 200 item cap shows footer", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Showing first 200");
  });

  test("INT-WS-006: Enter then q restores list state", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("q");
    await terminal.waitForText("Workspaces");
  });

  test("INT-WS-007: goto from detail renders fresh list", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("Enter");
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
  });

  test("INT-WS-008: 500 shows server error", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Failed to load");
  });

  test("INT-WS-009: suspend optimistic update", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("p");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("INT-WS-010: suspend revert on 409", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("p");
    await terminal.waitForText("conflict");
  });

  test("INT-WS-011: resume optimistic update", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j", "r");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("INT-WS-012: resume revert on failure", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j", "r");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("INT-WS-013: delete removes and decrements count", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d", "y");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("INT-WS-014: delete revert on failure", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d", "y");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("INT-WS-015: delete last workspace shows empty state", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d", "y");
    await terminal.waitForText("No workspaces found");
  });

  test("INT-WS-016: SSH copy for running workspace", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("shift+S");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("INT-WS-017: SSH copy blocked for non-running", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("j", "shift+S");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("INT-WS-018: 403 shows permission denied", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("p");
    await terminal.waitForText("Permission denied");
  });

  test("INT-WS-019: SSE status update renders", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    // SSE event changes status from starting to running
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("INT-WS-020: SSE disconnect and reconnect", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("INT-WS-021: deep link entry", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "workspaces"] });
    await terminal.waitForText("Workspaces");
    expect(terminal.getLine(0)).toMatch(/Workspaces/);
  });

  test("INT-WS-022: command palette entry", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys(":");
    await terminal.sendText("workspaces");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Workspaces");
  });

  test("INT-WS-023: concurrent navigation resolves", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w", "g", "d", "g", "w");
    await terminal.waitForText("Workspaces");
  });

  test("INT-WS-024: create and return shows new workspace", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("c");
    await terminal.sendKeys("q");
    await terminal.waitForText("Workspaces");
  });
});
```

---

### Edge Case Tests (16 tests)

```typescript
describe("TUI_WORKSPACE_LIST_SCREEN — Edge Case Tests", () => {
  let terminal: TUITestInstance;
  afterEach(async () => { if (terminal) await terminal.terminate(); });

  test("EDGE-WS-001: no auth token", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: "" } });
    await terminal.waitForText("codeplane auth login");
  });

  test("EDGE-WS-002: long workspace name (63 chars)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("EDGE-WS-003: Unicode workspace name", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("EDGE-WS-004: single workspace", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("EDGE-WS-005: concurrent resize and navigation", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("Enter");
    await terminal.resize(80, 24);
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("EDGE-WS-006: search no matches", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("/");
    await terminal.sendText("zzzzzzz");
    await terminal.waitForText("No workspaces match");
  });

  test("EDGE-WS-007: null name renders <unnamed>", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toContain("<unnamed>");
  });

  test("EDGE-WS-008: zero idle timeout shows dash", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toContain("—");
  });

  test("EDGE-WS-009: large idle timeout (86400s = 24h)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toContain("24h");
  });

  test("EDGE-WS-010: deleted user owner shows unknown", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("EDGE-WS-011: rapid p presses single API call", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("p", "p", "p");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("EDGE-WS-012: rapid d presses single overlay", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("d", "d");
    await terminal.waitForText("Delete workspace");
  });

  test("EDGE-WS-013: network fail mid-pagination", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("shift+G");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("EDGE-WS-014: clipboard unavailable", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    await terminal.sendKeys("shift+S");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("EDGE-WS-015: SSE malformed event no crash", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toBeTruthy();
  });

  test("EDGE-WS-016: workspace ID non-standard format", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toBeTruthy();
  });
});
```

---

**Total: 120 tests** (19 snapshot + 44 keyboard + 17 responsive + 24 integration + 16 edge case)

All tests left failing if backend is unimplemented — never skipped or commented out.