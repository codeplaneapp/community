# Research: `tui-workflow-run-list` — Workflow Run List with Status Filtering, Animated Spinners, and SSE Status Updates

## 1. Ticket Context

**Ticket ID:** `tui-workflow-run-list`
**Feature Group:** `TUI_WORKFLOWS` → `TUI_WORKFLOW_RUN_LIST` (line 118 in `specs/tui/features.ts`)
**Eng Spec:** `specs/tui/engineering/tui-workflow-run-list.md` — currently empty (needs to be written)
**Target Directory:** `apps/tui/src/screens/Workflows/`
**Test File:** `e2e/tui/workflows.test.ts`

### What this ticket implements
The workflow run list screen — accessed by navigating into a workflow definition from the workflow list screen. Shows a paginated, filterable list of workflow runs with:
- Status icons with semantic colors (✓ success, ✗ failure, ◎ running, ◌ queued, ✕ cancelled, ⚠ error)
- Animated braille spinners for in-progress runs
- Status filtering (cycle through: all → queued → running → success → failure → cancelled → error)
- Real-time SSE status updates via `useWorkflowRunSSE`
- Keyboard navigation (j/k, Enter to open run detail, f to cycle filters)
- Pagination via scroll-to-end
- Actions: cancel (c), rerun (r), resume (m) from the list

---

## 2. Current State of Implementation

### 2.1 Router & Screen Registry

**ScreenName enum** (`apps/tui/src/router/types.ts`, lines 24-25):
- `Workflows = "Workflows"` — ✅ exists
- `WorkflowRunDetail = "WorkflowRunDetail"` — ✅ exists
- ❌ `WorkflowRunList` does NOT exist in enum yet (needs to be added per scaffold spec)

**Screen Registry** (`apps/tui/src/router/registry.ts`, lines 119-130):
- Both `Workflows` and `WorkflowRunDetail` currently point to `PlaceholderScreen`
- No `WorkflowRunList` entry exists yet

**Deep Links** (`apps/tui/src/navigation/deepLinks.ts`, lines 21-39):
- `"workflows"` maps to `ScreenName.Workflows` — ✅ exists
- `"workflow-runs"` → `ScreenName.WorkflowRunList` — ❌ missing

### 2.2 Screens Directory
- `apps/tui/src/screens/Workflows/` — ❌ directory does NOT exist yet
- All screens currently use `PlaceholderScreen` (`apps/tui/src/screens/PlaceholderScreen.tsx`)

### 2.3 Workflow Hooks
- `apps/tui/src/hooks/workflow-types.ts` — ❌ does NOT exist in apps/ yet
- `apps/tui/src/hooks/useWorkflowRuns.ts` — ❌ does NOT exist in apps/ yet
- `apps/tui/src/hooks/useWorkflowRunSSE.ts` — ❌ does NOT exist in apps/ yet
- `apps/tui/src/hooks/useWorkflowActions.ts` — ❌ does NOT exist in apps/ yet

All hooks have complete reference implementations in `specs/tui/apps/tui/src/hooks/`.

---

## 3. Dependency Chain

This ticket depends on (or includes):

1. **`tui-workflow-screen-scaffold`** — Creates directory structure, adds `ScreenName.WorkflowRunList` enum, registers screens, wires deep-links
2. **`tui-workflow-data-hooks`** — `useWorkflowRuns()`, `useWorkflowActions()`, shared types
3. **`tui-workflow-sse-hooks`** — `useWorkflowRunSSE()` for real-time status
4. **`tui-workflow-ui-utils`** — `getRunStatusIcon()`, `formatDuration()`, `formatRelativeTime()`, `abbreviateSHA()`, etc.

---

## 4. Reference Implementations (specs/tui/apps/)

### 4.1 Workflow Types (`specs/tui/apps/tui/src/hooks/workflow-types.ts`)

Key types for the run list:

```typescript
export interface WorkflowRun {
  id: number;
  repository_id: number;
  workflow_definition_id: number;
  status: WorkflowRunStatus;
  trigger_event: string;
  trigger_ref: string;
  trigger_commit_sha: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  workflow_name?: string;  // enriched by v2 endpoint
  workflow_path?: string;
}

export type WorkflowRunStatus = "queued" | "running" | "success" | "failure" | "cancelled" | "error";

export const TERMINAL_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set(["success", "failure", "cancelled", "error"]);

export interface WorkflowRunFilters {
  state?: string;           // Server-side filter
  definition_id?: number;   // Filter by workflow definition
  page?: number;
  per_page?: number;
}

export interface RepoIdentifier { owner: string; repo: string; }

export interface PaginatedQueryResult<T> {
  data: T[];
  loading: boolean;
  error: HookError | null;
  loadMore: () => void;
  hasMore: boolean;
  totalCount: number;
  refetch: () => void;
}
```

### 4.2 useWorkflowRuns Hook (`specs/tui/apps/tui/src/hooks/useWorkflowRuns.ts`)

57 lines. Key implementation:
- Composes `usePaginatedQuery` from `@codeplane/ui-core`
- Endpoint: `GET /api/repos/:owner/:repo/workflows/runs`
- Filter params: `state`, `definition_id` via URLSearchParams
- `cacheKey` includes serialized query string — filter change triggers hard reset
- `parseResponse`: extracts `data?.runs || []` and `data?.total_count ?? null`
- Memory cap: `MAX_RUNS = 500`

### 4.3 useWorkflowRunSSE Hook (`specs/tui/apps/tui/src/hooks/useWorkflowRunSSE.ts`)

7 lines. Direct re-export of core hook from `@codeplane/ui-core/hooks/workflows`.

Core hook (312 lines in `packages/ui-core/src/hooks/workflows/useWorkflowRunSSE.ts`):
- Endpoint: `GET /api/repos/:owner/:repo/runs/status?run_ids=X,Y,Z`
- Returns `WorkflowRunSSEState { runStatuses: Map<number, WorkflowRunStatus>, connectionHealth, reconnect }`
- Auto-disconnect when ALL monitored runs reach terminal state
- Reconnects on `runIds` change (new pages loaded)
- Same backoff/keepalive pattern as log stream (1s→30s, 20 max attempts, 45s keepalive)

### 4.4 useWorkflowActions Hook (`specs/tui/apps/tui/src/hooks/useWorkflowActions.ts`)

243 lines. Provides:
- `useWorkflowRunCancel(repo, callbacks)` → POST `.../runs/:id/cancel`
- `useWorkflowRunRerun(repo, callbacks)` → POST `.../runs/:id/rerun` → returns `WorkflowRunResult`
- `useWorkflowRunResume(repo, callbacks)` → POST `.../runs/:id/resume`
- All use optimistic rollback pattern via function expandos

### 4.5 Workflow UI Utils (`specs/tui/apps/tui/src/screens/Workflows/utils.ts`)

156 lines. Pure functions:

```typescript
// Status icons
getRunStatusIcon(status: WorkflowRunStatus): WorkflowStatusIcon
  // success→{icon:"✓",color:"success"}, failure→{icon:"✗",color:"error",bold:true}
  // running→{icon:"◎",color:"warning",bold:true}, queued→{icon:"◌",color:"primary"}
  // cancelled→{icon:"✕",color:"muted"}, error→{icon:"⚠",color:"error",bold:true}

getRunStatusIconNoColor(status): WorkflowStatusIcon  // Forces muted color

// Duration formatting
formatDuration(seconds: number | null): string  // "45s", "1m 23s", "2h 5m"
getDurationColor(seconds: number | null): CoreTokenName  // <60s→success, <300→muted, <900→warning, 900+→error

// Time formatting
formatRelativeTime(timestamp: string | null, now?: Date): string  // "now", "3m", "2h", "5d", "1w"

// Git formatting
abbreviateSHA(sha: string | null): string  // First 7 chars or "—"

// Byte formatting
formatBytes(bytes: number | null): string  // "0 B", "89 B", "1.2 KB"
```

### 4.6 Stream Types (`specs/tui/apps/tui/src/hooks/workflow-stream-types.ts`)

116 lines. Key types for SSE:
```typescript
interface StatusEvent {
  run_id: number;
  run_status: WorkflowRunStatus;
  step_id?: string;
  step_status?: string;
}

interface WorkflowRunSSEState {
  runStatuses: Map<number, WorkflowRunStatus>;
  connectionHealth: ConnectionHealth;
  reconnect: () => void;
}

type WorkflowStreamConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "completed" | "errored" | "failed";
```

---

## 5. API Contract

### 5.1 List Runs Endpoint

**`GET /api/repos/:owner/:repo/workflows/runs`** (v2, server line 608-639)

Query params:
- `page` (default: 1)
- `per_page` (default: 30, max: 100)
- `state` (optional) — server normalizes: `completed/done` → `success`, `failed/error` → `failure`, `canceled` → `cancelled`, `pending` → `queued`, `in_progress` → `running`, `finished/terminal` → matches all terminal states

Response:
```json
{
  "runs": [
    {
      "id": 42,
      "repository_id": 1,
      "workflow_definition_id": 5,
      "status": "running",
      "trigger_event": "push",
      "trigger_ref": "main",
      "trigger_commit_sha": "abc1234567890...",
      "started_at": "2026-03-24T10:00:00Z",
      "completed_at": null,
      "created_at": "2026-03-24T10:00:00Z",
      "updated_at": "2026-03-24T10:01:00Z",
      "workflow_name": "CI",
      "workflow_path": ".codeplane/workflows/ci.ts"
    }
  ]
}
```

### 5.2 SSE Status Events Endpoint

**`GET /api/repos/:owner/:repo/workflows/runs/:id/events`** (server line 910-916)
- Channel: `workflow_run_events_{runId}`
- Event types: `status`, `done`

### 5.3 Run Actions
- `POST .../runs/:id/cancel` → 204
- `POST .../runs/:id/rerun` → 201 with `WorkflowRunResult`
- `POST .../runs/:id/resume` → 204 (only if cancelled/failure status)

---

## 6. Existing Patterns to Follow

### 6.1 Spinner Animation (`apps/tui/src/hooks/useSpinner.ts`, 178 lines)

Global singleton using OpenTUI's `Timeline` engine:
- Braille frames: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms intervals
- ASCII fallback: `-\|/` at 120ms
- `useSyncExternalStore` for minimal re-renders
- Per-caller gating: returns `""` when `active=false`

**Usage pattern:**
```typescript
const spinner = useSpinner(isLoading);
return <text>{spinner} Loading…</text>;
```

For the run list, spinner should show on rows with `status === "running"` or `status === "queued"`.

### 6.2 Skeleton List (`apps/tui/src/components/SkeletonList.tsx`, 84 lines)

- Renders `▓` block characters at deterministic widths (seeded by row index)
- Row count matches `contentHeight` from `useLayout()`
- 3 columns: title, metadata, status
- Uses `useTheme()` for muted color

### 6.3 Pagination Indicator (`apps/tui/src/components/PaginationIndicator.tsx`, 60 lines)

- Status types: `"idle" | "loading" | "error"`
- Loading: `"{spinnerFrame} Loading more…"` in muted
- Error: `"✗ Failed to load — R to retry"` in error
- Text capped at `terminal_width - 4`

### 6.4 Screen Keybindings (`apps/tui/src/hooks/useScreenKeybindings.ts`, 55 lines)

```typescript
useScreenKeybindings([
  { key: "j", description: "Navigate down", group: "Navigation", handler: moveDown },
  { key: "k", description: "Navigate up", group: "Navigation", handler: moveUp },
  { key: "Enter", description: "Open", group: "Actions", handler: openDetail },
], [
  { keys: "j/k", label: "navigate", order: 10 },
  { keys: "Enter", label: "open", order: 20 },
]);
```

Registers at `PRIORITY.SCREEN` (4), auto-generates status bar hints from first 8 bindings.

### 6.5 Layout System (`apps/tui/src/hooks/useLayout.ts`, 111 lines)

Breakpoints:
- `"large"`: >120 cols (show all columns)
- `"standard"`: 80-120 cols (show core columns)
- `"minimum"`: 80 cols (title + status only)
- `null`: <80 cols (terminal too small)

`contentHeight = height - 2` (header + status bar)

### 6.6 Theme Tokens (`apps/tui/src/theme/tokens.ts`)

Semantic colors: `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`.

`statusToToken()` exists but workflow utils use their own mapping (different semantics — e.g., `queued` → `primary` instead of `warning`, `running` → `warning` instead of `success`).

### 6.7 Navigation Pattern

From `apps/tui/src/providers/NavigationProvider.tsx`:
```typescript
const { push, pop, replace, repoContext } = useNavigation();
// Push to run detail:
push(ScreenName.WorkflowRunDetail, { owner, repo, runId: String(run.id) });
```

### 6.8 Two-Key State Machine (gg)

From `apps/tui/src/components/ErrorScreen.tsx` (lines 260-271):
```typescript
const lastKeyRef = useRef<{ key: string; time: number }>({ key: "", time: 0 });
if (key === "g" && lastKeyRef.current.key === "g" && Date.now() - lastKeyRef.current.time < 500) {
  scrollToTop();
}
```

---

## 7. Screen Registry Changes Required

Per the scaffold spec (`specs/tui/engineering/tui-workflow-screen-scaffold.md`):

### 7.1 New ScreenName enum entries

```typescript
// In apps/tui/src/router/types.ts
WorkflowRunList = "WorkflowRunList",    // NEW
WorkflowLogViewer = "WorkflowLogViewer", // NEW
WorkflowArtifacts = "WorkflowArtifacts", // NEW
WorkflowCaches = "WorkflowCaches",       // NEW
```

### 7.2 Registry entry for WorkflowRunList

```typescript
[ScreenName.WorkflowRunList]: {
  component: WorkflowRunListScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => p.workflowName ? `${p.workflowName} Runs` : "Runs",
},
```

### 7.3 Deep-link support

Add to `resolveScreenName()` map:
```typescript
"workflow-runs": ScreenName.WorkflowRunList,
```

---

## 8. E2E Test Patterns

### 8.1 Test Infrastructure (`e2e/tui/helpers.ts`, 491 lines)

```typescript
interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>;
  sendText(text: string): Promise<void>;
  waitForText(text: string, timeoutMs?: number): Promise<void>;
  waitForNoText(text: string, timeoutMs?: number): Promise<void>;
  snapshot(): string;
  getLine(lineNumber: number): string;
  resize(cols: number, rows: number): Promise<void>;
  terminate(): Promise<void>;
}

const TERMINAL_SIZES = {
  minimum: { width: 80, height: 24 },
  standard: { width: 120, height: 40 },
  large: { width: 200, height: 60 },
};

// Launch: creates real PTY with @microsoft/tui-test
const terminal = await launchTUI({ cols: 120, rows: 40, args: [...], env: {...} });
```

### 8.2 Existing Test Patterns from `specs/tui/e2e/tui/workflows.test.ts` (422 lines)

Key test patterns for the run list:
- `HOOK-WFR-001`: Runs load with correct columns
- `HOOK-WFR-002`: Runs filter by state re-fetches from page 1 (press `f` to cycle)
- `HOOK-WFR-003`: Runs show enriched `workflow_name` and `workflow_path`
- `HOOK-WFR-004`: Runs pagination loads more on scroll to bottom (`G` key)
- `HOOK-WFR-005`: Runs empty state when no runs match filter
- `HOOK-WFA-001`: Cancel on running run shows immediate status change (`c` key)
- `HOOK-WFA-002`: Cancel on terminal run shows state-gated message
- `HOOK-WFA-003`: Rerun on completed run creates new run (`r` key)
- `HOOK-WFA-004`: Resume on failed run triggers resume (`m` key)
- `HOOK-RSP-001`: Workflow list at 80x24 shows minimal columns
- `HOOK-RSP-002`: Workflow list at 200x60 shows all columns

### 8.3 Test Philosophy (from MEMORY.md)
- Tests that fail due to unimplemented backends are left failing — NEVER skip or comment them out

---

## 9. SSE Integration Pattern

### 9.1 Architecture

Per-endpoint SSE hooks (NOT multiplexed through SSEProvider). Same pattern as `useAgentStream`.

### 9.2 Integration with Run List

From the SSE hooks spec (line 537-541):
> The Workflow Run List screen will call `useWorkflowRunSSE(owner, repo, visibleRunIds)` to update status badges in real-time. The screen should:
> - Extract `runIds` from the paginated run list data
> - Merge `runStatuses` from SSE with initial data from `useWorkflowRuns()`
> - Update `runIds` when pagination loads new pages (triggers SSE reconnect)

### 9.3 Status Merging Pattern

```typescript
// In the screen component:
const { data: runs, loading, ... } = useWorkflowRuns(repo, filters);
const nonTerminalRunIds = runs.filter(r => !TERMINAL_STATUSES.has(r.status)).map(r => r.id);
const { runStatuses } = useWorkflowRunSSE(owner, repo, nonTerminalRunIds, { enabled: nonTerminalRunIds.length > 0 });

// Merge SSE statuses into display:
const displayRuns = runs.map(run => ({
  ...run,
  status: runStatuses.get(run.id) ?? run.status,  // SSE overrides initial
}));
```

### 9.4 Spinner for Running Rows

Use `useSpinner(hasActiveRuns)` where `hasActiveRuns = displayRuns.some(r => r.status === "running" || r.status === "queued")`.

Replace the status icon for running rows with the spinner frame:
```typescript
const icon = run.status === "running" 
  ? spinnerFrame  // Animated braille character
  : getRunStatusIcon(run.status).icon;
```

---

## 10. Filter State Machine

### 10.1 Filter Cycle Order

The `f` key cycles through filter states:
```
All (no filter) → Queued → Running → Success → Failure → Cancelled → Error → All
```

Based on `WorkflowRunStatus` union: `"queued" | "running" | "success" | "failure" | "cancelled" | "error"`

### 10.2 Server-Side Normalization

From `apps/server/src/routes/workflows.ts` (lines 292-330):
- The server's `normalizeWorkflowState()` accepts aliases
- The TUI passes raw status strings; normalization is server-side
- Special filter `"finished"` matches all terminal states

### 10.3 Filter Display in UI

Status bar should show current filter: `"Filter: All"`, `"Filter: Running"`, etc.
Should also show as a header element (e.g., `"Runs [Running]"` vs `"Runs [All]"`).

---

## 11. Row Layout

### 11.1 Columns by Breakpoint

| Column | Min (80) | Standard (120) | Large (200+) |
|--------|----------|----------------|--------------|
| Status icon | ✅ 2ch | ✅ 2ch | ✅ 2ch |
| Run ID | ✅ `#42` 6ch | ✅ `#42` 6ch | ✅ `#42` 6ch |
| Workflow name | ❌ hidden | ✅ truncated | ✅ full |
| Trigger ref | ❌ hidden | ✅ truncated | ✅ full |
| Commit SHA | ❌ hidden | ❌ hidden | ✅ 7ch |
| Duration | ✅ 6ch | ✅ 8ch | ✅ 8ch |
| Relative time | ✅ 4ch | ✅ 4ch | ✅ 4ch |

### 11.2 Row Rendering

```
✓ #42  CI                main    abc1234  1m 23s  3m
◎ #41  Deploy            staging         2m 5s   5m
✗ #40  CI                main    def5678  45s     1h
```

Focused row: reverse video or accent color highlight.

---

## 12. Key File Inventory

### Files to CREATE

| File | Purpose |
|------|---------|
| `apps/tui/src/screens/Workflows/WorkflowRunListScreen.tsx` | Main screen component |
| `apps/tui/src/screens/Workflows/utils.ts` | Status icons, formatting utils |
| `apps/tui/src/screens/Workflows/index.ts` | Barrel export |
| `apps/tui/src/hooks/workflow-types.ts` | Shared types |
| `apps/tui/src/hooks/workflow-stream-types.ts` | SSE types |
| `apps/tui/src/hooks/useWorkflowRuns.ts` | Run list data hook |
| `apps/tui/src/hooks/useWorkflowRunSSE.ts` | SSE status hook |
| `apps/tui/src/hooks/useWorkflowActions.ts` | Cancel/rerun/resume mutations |
| `e2e/tui/workflows.test.ts` | E2E tests |

### Files to MODIFY

| File | Change |
|------|--------|
| `apps/tui/src/router/types.ts` | Add `WorkflowRunList` to `ScreenName` enum |
| `apps/tui/src/router/registry.ts` | Register `WorkflowRunListScreen` |
| `apps/tui/src/navigation/deepLinks.ts` | Add `"workflow-runs"` mapping |
| `apps/tui/src/hooks/index.ts` | Export new workflow hooks |

### Reference Files (copy from specs/)

| Source | Target |
|--------|--------|
| `specs/tui/apps/tui/src/hooks/workflow-types.ts` | `apps/tui/src/hooks/workflow-types.ts` |
| `specs/tui/apps/tui/src/hooks/workflow-stream-types.ts` | `apps/tui/src/hooks/workflow-stream-types.ts` |
| `specs/tui/apps/tui/src/hooks/useWorkflowRuns.ts` | `apps/tui/src/hooks/useWorkflowRuns.ts` |
| `specs/tui/apps/tui/src/hooks/useWorkflowRunSSE.ts` | `apps/tui/src/hooks/useWorkflowRunSSE.ts` |
| `specs/tui/apps/tui/src/hooks/useWorkflowActions.ts` | `apps/tui/src/hooks/useWorkflowActions.ts` |
| `specs/tui/apps/tui/src/screens/Workflows/utils.ts` | `apps/tui/src/screens/Workflows/utils.ts` |
| `specs/tui/e2e/tui/workflows.test.ts` | `e2e/tui/workflows.test.ts` |

### Existing Files to CONSUME (read-only)

| File | Purpose |
|------|---------|
| `apps/tui/src/hooks/useSpinner.ts` | Animated braille spinners |
| `apps/tui/src/hooks/useScreenKeybindings.ts` | Screen keybinding registration |
| `apps/tui/src/hooks/useLayout.ts` | Responsive layout/breakpoints |
| `apps/tui/src/hooks/useScreenLoading.ts` | Loading state management |
| `apps/tui/src/hooks/usePaginationLoading.ts` | Pagination loading state |
| `apps/tui/src/hooks/useTheme.ts` | Theme token access |
| `apps/tui/src/components/SkeletonList.tsx` | Skeleton loading placeholder |
| `apps/tui/src/components/PaginationIndicator.tsx` | Inline pagination indicator |
| `apps/tui/src/providers/NavigationProvider.tsx` | Navigation stack (push/pop) |
| `apps/tui/src/providers/KeybindingProvider.tsx` | Keybinding dispatch |
| `apps/tui/src/theme/tokens.ts` | Color tokens, `CoreTokenName` type |
| `apps/tui/src/theme/detect.ts` | `isUnicodeSupported()` |
| `@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js` | Paginated data fetching |
| `@codeplane/ui-core/src/hooks/internal/useMutation.js` | Mutation execution |
| `@codeplane/ui-core/src/sse/createSSEReader.ts` | SSE connection |
| `@codeplane/ui-core/src/sse/getSSETicket.ts` | SSE ticket auth |

---

## 13. Design Decisions to Document in Eng Spec

1. **Spinner placement**: Running/queued rows show animated spinner in place of static status icon
2. **SSE scope**: Only subscribe to non-terminal run IDs to avoid unnecessary connections
3. **Status merge**: SSE statuses override initial data; final render uses `runStatuses.get(id) ?? run.status`
4. **Filter state**: Client-side cycle with server-side filtering (debounce 150ms before API request)
5. **Empty state**: Different messages for "no runs" vs "no runs matching filter"
6. **Action gating**: Cancel only for non-terminal, Resume only for cancelled/failure, Rerun for any
7. **Responsive columns**: Progressive disclosure by breakpoint (see §11.1)
8. **Workflow-specific color mapping**: Different from generic `statusToToken()` (see utils.ts §4.5)