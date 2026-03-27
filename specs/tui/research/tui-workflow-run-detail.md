# Research Document: `tui-workflow-run-detail`

## Implement workflow run detail with step list, inline log expansion, and SSE streaming

---

## 1. Current Codebase State

### 1.1 Files That Exist (Dependencies consumed by this ticket)

#### Router & Navigation Infrastructure

| File | Path | Lines | Key Exports |
|------|------|-------|-------------|
| Screen types | `apps/tui/src/router/types.ts` | 103 | `ScreenName` enum (includes `WorkflowRunDetail` at line 25), `ScreenEntry`, `NavigationContext`, `ScreenComponentProps`, `ScreenDefinition`, `MAX_STACK_DEPTH=32` |
| Screen registry | `apps/tui/src/router/registry.ts` | 208 | `screenRegistry` — maps `ScreenName.WorkflowRunDetail` to `PlaceholderScreen` (lines 125-130), breadcrumb: `Run #${p.runId}` |
| Screen router | `apps/tui/src/router/ScreenRouter.tsx` | 28 | `ScreenRouter` — looks up `screenRegistry[currentScreen.screen]` and renders `Component` with `ScreenComponentProps` |
| Placeholder screen | `apps/tui/src/screens/PlaceholderScreen.tsx` | 23 | `PlaceholderScreen` — renders screen name + params; THIS IS WHAT GETS REPLACED |
| Navigation provider | `apps/tui/src/providers/NavigationProvider.tsx` | 194 | `NavigationProvider`, `createEntry()`, `useNavigation()`, `useScrollPositionCache()`. Key: `push(screen, params)` auto-inherits repo context (line 53-58). `pop()` removes top entry. `repoContext` extracted via `extractRepoContext()`. |
| Deep links | `apps/tui/src/navigation/deepLinks.ts` | 119 | `buildInitialStack()`, `resolveScreenName()` — maps `"workflows"` → `ScreenName.Workflows`. Note: `WorkflowRunDetail` is NOT in the deep-link alias map yet (line 86 lists it in `requiresRepo` array). Need `--run` param support. |
| Go-to bindings | `apps/tui/src/navigation/goToBindings.ts` | 51 | `goToBindings` — `g f` → `ScreenName.Workflows` (line 20), `requiresRepo: true`. No direct go-to for WorkflowRunDetail. |

#### Keybinding & Overlay Infrastructure

| File | Path | Lines | Key Exports |
|------|------|-------|-------------|
| Keybinding types | `apps/tui/src/providers/keybinding-types.ts` | 90 | `KeyHandler` interface (`key`, `description`, `group`, `handler`, optional `when`), `PRIORITY` (TEXT_INPUT=1, MODAL=2, GOTO=3, SCREEN=4, GLOBAL=5), `KeybindingScope`, `StatusBarHint`, `StatusBarHintsContextType` |
| Keybinding provider | `apps/tui/src/providers/KeybindingProvider.tsx` | 165 | `KeybindingProvider`, `KeybindingContext`, `StatusBarHintsContext`. Key: scopes sorted by priority ASC then LIFO. First match wins at dispatch. |
| Overlay types | `apps/tui/src/providers/overlay-types.ts` | 27 | `OverlayType = "help" \| "command-palette" \| "confirm"`, `ConfirmPayload` (`title`, `message`, `confirmLabel?`, `cancelLabel?`, `onConfirm`, `onCancel?`), `OverlayContextType` |
| Overlay manager | `apps/tui/src/providers/OverlayManager.tsx` | 162 | `OverlayManager`, `OverlayContext`. Key: `openOverlay("confirm", payload)` registers PRIORITY.MODAL scope + Esc binding + hint override. Toggle behavior (same type closes). Mutual exclusion. |
| useOverlay hook | `apps/tui/src/hooks/useOverlay.ts` | 36 | `useOverlay()` — returns `{ activeOverlay, openOverlay, closeOverlay, isOpen, confirmPayload }` |
| useScreenKeybindings | `apps/tui/src/hooks/useScreenKeybindings.ts` | 55 | `useScreenKeybindings(bindings, hints?)` — registers PRIORITY.SCREEN scope, auto-generates status bar hints from first 8 bindings |

#### Layout & Responsive Hooks

| File | Path | Lines | Key Exports |
|------|------|-------|-------------|
| Breakpoint types | `apps/tui/src/types/breakpoint.ts` | 33 | `Breakpoint = "minimum" \| "standard" \| "large"`, `getBreakpoint(cols, rows)` — null if <80×24, "minimum" if <120×40, "standard" if <200×60, "large" otherwise |
| useLayout | `apps/tui/src/hooks/useLayout.ts` | 110 | `useLayout()` → `LayoutContext` { width, height, breakpoint, contentHeight (height-2), sidebarVisible, sidebarWidth, modalWidth (50%/60%/90%), modalHeight, sidebar } |
| useBreakpoint | `apps/tui/src/hooks/useBreakpoint.ts` | 18 | `useBreakpoint()` → `Breakpoint \| null` |
| useResponsiveValue | `apps/tui/src/hooks/useResponsiveValue.ts` | 35 | `useResponsiveValue<T>(values: ResponsiveValues<T>, fallback?)` → `T \| undefined` |

#### Theme & Tokens

| File | Path | Lines | Key Exports |
|------|------|-------|-------------|
| Theme tokens | `apps/tui/src/theme/tokens.ts` | 263 | `ThemeTokens` (primary/success/warning/error/muted/surface/border + diff tokens), `createTheme(tier)`, `statusToToken(status)` — maps "running"→success, "queued"→warning, "failed"→error, "cancelled"→error, "success"→success, "error"→error. `TextAttributes` (BOLD=1, DIM=2, UNDERLINE=4, REVERSE=8). `CoreTokenName` type. |

#### Spinner & Loading

| File | Path | Lines | Key Exports |
|------|------|-------|-------------|
| useSpinner | `apps/tui/src/hooks/useSpinner.ts` | 178 | `useSpinner(active: boolean)` → string (braille frame or ""). Module-level singleton via `useSyncExternalStore`. Braille: 10 frames at 80ms. ASCII: 4 frames at 120ms. Timeline-driven. |
| Loading types | `apps/tui/src/loading/types.ts` | 151 | `LoadingError` { type, httpStatus?, summary }, `ScreenLoadingStatus`, `ActionStatus`, `LoadingContextValue` |
| Loading constants | `apps/tui/src/loading/constants.ts` | 40 | `LOADING_TIMEOUT_MS=30000`, `MIN_SAVING_BUTTON_WIDTH=10`, `LOADING_LABEL_PADDING=6` |

#### Shared Components (implemented)

| File | Path | Lines | Key Props |
|------|------|-------|----------|
| ActionButton | `apps/tui/src/components/ActionButton.tsx` | 58 | `label`, `isLoading?`, `loadingLabel?="Saving…"`, `onPress?`, `disabled?`. Shows spinner + loadingLabel when isLoading. |
| FullScreenError | `apps/tui/src/components/FullScreenError.tsx` | 52 | `screenLabel: string`, `error: LoadingError`. Renders `✗ Failed to load {screenLabel}` centered, with summary. |
| FullScreenLoading | `apps/tui/src/components/FullScreenLoading.tsx` | 48 | `spinnerFrame: string`, `label: string`. Renders `{spinnerFrame} {label}` centered. |
| SkeletonDetail | `apps/tui/src/components/SkeletonDetail.tsx` | 64 | `sections?: string[]` (default: ["Description", "Comments"]). Shows block-char placeholders per section. |
| OverlayLayer | `apps/tui/src/components/OverlayLayer.tsx` | 91 | Renders overlay positioned absolute, z-index 100. Has placeholder content for help/command-palette/confirm. Confirm shows `confirmPayload.message` with Confirm/Cancel labels. |
| AppShell | `apps/tui/src/components/AppShell.tsx` | 26 | Wraps children with HeaderBar, StatusBar, OverlayLayer. Shows TerminalTooSmallScreen if breakpoint is null. |

#### Hooks Index

| File | Path | Lines | Notable |
|------|------|-------|--------|
| hooks/index.ts | `apps/tui/src/hooks/index.ts` | 41 | Exports: useDiffSyntaxStyle, useTheme, useColorTier, useSpinner, useLayout, useNavigation, useAuth, useLoading, useScreenLoading, useOptimisticMutation, usePaginationLoading, useBreakpoint, useResponsiveValue, useSidebarState, useRepoTree, useFileContent, useBookmarks. NO workflow hooks yet. |

---

### 1.2 Files That DO NOT Exist Yet (must be created by dependency tickets or this ticket)

#### From dependency tickets (assumed pre-existing per spec):

| File | Dependency Ticket | Purpose |
|------|-------------------|--------|
| `apps/tui/src/hooks/workflow-types.ts` | `tui-workflow-data-hooks` | `WorkflowRun`, `WorkflowRunNode`, `WorkflowRunDetailResponse`, `WorkflowRunStatus`, `TERMINAL_STATUSES`, `QueryResult<T>`, `MutationResult<T>`, `RepoIdentifier` |
| `apps/tui/src/hooks/workflow-stream-types.ts` | `tui-workflow-sse-hooks` | `LogLine`, `StatusEvent`, `DoneEvent`, `WorkflowLogStreamState`, `ConnectionHealth`, `StepState`, `VIRTUAL_SCROLL_WINDOW` |
| `apps/tui/src/hooks/useWorkflowRunDetail.ts` | `tui-workflow-data-hooks` | `useWorkflowRunDetail(repo, runId, options?)` → `QueryResult<WorkflowRunDetailResponse>` |
| `apps/tui/src/hooks/useWorkflowActions.ts` | `tui-workflow-data-hooks` | `useWorkflowRunCancel(repo)`, `useWorkflowRunRerun(repo)`, `useWorkflowRunResume(repo)` |
| `apps/tui/src/hooks/useWorkflowLogStream.ts` | `tui-workflow-sse-hooks` | `useWorkflowLogStream(owner, repo, runId, options?)` → `WorkflowLogStreamState` (includes `spinnerFrame`) |
| `apps/tui/src/screens/Workflows/utils.ts` | `tui-workflow-ui-utils` | `getRunStatusIcon()`, `getStepStatusIcon()`, `formatDuration()`, `formatRelativeTime()`, `abbreviateSHA()`, `getDurationColor()`, `WorkflowStatusIcon` type |
| `apps/tui/src/components/DetailView.tsx` | `tui-detail-view-component` | `<DetailView>`, `<DetailHeader>`, `<DetailSection>`, `useDetailNavigation()` |
| `apps/tui/src/components/Modal.tsx` | `tui-modal-component` | `<Modal>`, `useModal()`, `<ConfirmDialog>` |
| `apps/tui/src/screens/Workflows/index.ts` | `tui-workflow-screen-scaffold` | Barrel export for all workflow screens |

#### Created by THIS ticket:

| File | Purpose |
|------|--------|
| `apps/tui/src/screens/Workflows/WorkflowRunDetailScreen.tsx` | **REPLACE** placeholder — main screen component |
| `apps/tui/src/screens/Workflows/components/RunHeader.tsx` | Run metadata header sub-component |
| `apps/tui/src/screens/Workflows/components/StepRow.tsx` | Step row with status icon, name, duration, focus highlight |
| `apps/tui/src/screens/Workflows/components/InlineLogPanel.tsx` | Log lines with ANSI passthrough, line numbers, auto-follow |
| `apps/tui/src/screens/Workflows/components/DispatchInputsSection.tsx` | Collapsible key-value display for dispatch inputs |
| `apps/tui/src/screens/Workflows/components/ActionConfirmOverlay.tsx` | Confirmation modal for cancel/rerun/resume |
| `apps/tui/src/screens/Workflows/components/index.ts` | Barrel export |
| `apps/tui/src/screens/Workflows/hooks/useRunDetailState.ts` | Orchestrator hook |
| `apps/tui/src/screens/Workflows/hooks/useStepNavigation.ts` | Step focus, expand/collapse, Esc chain |
| `apps/tui/src/screens/Workflows/hooks/useRunActions.ts` | Action confirmation state machine |
| `apps/tui/src/screens/Workflows/hooks/useElapsedTime.ts` | 1s-tick elapsed time |
| `apps/tui/src/screens/Workflows/hooks/index.ts` | Barrel export |
| `e2e/tui/workflows.test.ts` | E2E tests (132 tests) |

---

## 2. Dependency Contract Details

### 2.1 WorkflowRunDetailResponse (from `tui-workflow-data-hooks`)

```typescript
export interface WorkflowRunDetailResponse {
  run: WorkflowRun;
  workflow: { id: number; name: string; path: string };
  nodes: WorkflowRunNode[];
  mermaid: string;
  plan_xml: string;
}

export interface WorkflowRun {
  id: number;
  workflow_id: number;
  name: string;
  status: WorkflowRunStatus;
  conclusion: string | null;
  head_branch: string;
  head_sha: string;
  workflow_name: string;
  workflow_path: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration: string;
  duration_seconds: number;
}

export interface WorkflowRunNode {
  id: number;
  name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number;
}

export type WorkflowRunStatus = "success" | "failure" | "running" | "queued" | "cancelled" | "error";
export const TERMINAL_STATUSES: ReadonlySet<WorkflowRunStatus>;
```

**Hook signature:**
```typescript
export function useWorkflowRunDetail(
  repo: RepoIdentifier,
  runId: number,
  options?: { enabled?: boolean },
): QueryResult<WorkflowRunDetailResponse>;
// QueryResult = { data: T | null, loading: boolean, error: HookError | null, refetch: () => void }
```

### 2.2 WorkflowLogStreamState (from `tui-workflow-sse-hooks`)

```typescript
export interface WorkflowLogStreamState {
  logs: Map<string, LogLine[]>;       // step_id → LogLine[]
  steps: Map<string, StepState>;      // step_id → StepState
  runStatus: WorkflowRunStatus | null;
  connectionHealth: ConnectionHealth;
  reconnect: () => void;
  spinnerFrame: string;               // from useSpinner
}

export interface LogLine {
  log_id: string;
  step_id: string;
  timestamp: string;
  line_number: number;
  text: string;          // may contain ANSI escape codes
}

export interface StepState {
  step_id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ConnectionHealth {
  state: "idle" | "connecting" | "connected" | "reconnecting" | "failed";
  attemptCount: number;
  lastConnectedAt: string | null;
  lastError: Error | null;
}
```

**Hook signature:**
```typescript
export function useWorkflowLogStream(
  owner: string,
  repo: string,
  runId: number,
  options?: { enabled?: boolean },
): WorkflowLogStreamState;
```

### 2.3 UI Utilities (from `tui-workflow-ui-utils`)

```typescript
export interface WorkflowStatusIcon {
  icon: string;           // Unicode character (e.g., "✓", "✗", "◎")
  fallback: string;       // ASCII fallback (e.g., "[OK]", "[FL]")
  color: CoreTokenName;   // Semantic color token name
  bold: boolean;
  label: string;          // Human-readable (e.g., "Success")
}

export function getRunStatusIcon(status: WorkflowRunStatus): WorkflowStatusIcon;
export function getStepStatusIcon(status: string): WorkflowStatusIcon;
export function formatDuration(seconds: number | null | undefined): string;
export function getDurationColor(seconds: number | null | undefined): CoreTokenName;
export function formatRelativeTime(timestamp: string | null | undefined): string;
export function abbreviateSHA(sha: string | null | undefined): string;
```

### 2.4 Action Hooks (from `tui-workflow-data-hooks`)

```typescript
export function useWorkflowRunCancel(repo: RepoIdentifier): MutationResult<{id: number}, void>;
// POST /api/repos/:owner/:repo/workflows/runs/:id/cancel → 204

export function useWorkflowRunRerun(repo: RepoIdentifier): MutationResult<{id: number}, {workflow_run_id: number}>;
// POST /api/repos/:owner/:repo/workflows/runs/:id/rerun → 201

export function useWorkflowRunResume(repo: RepoIdentifier): MutationResult<{id: number}, void>;
// POST /api/repos/:owner/:repo/workflows/runs/:id/resume → 204

// MutationResult = { execute: (input) => Promise<T>, loading: boolean, error: HookError | null, reset: () => void }
```

---

## 3. Key Patterns to Follow

### 3.1 Screen Component Pattern

From `ScreenRouter.tsx` (line 20-26): screens receive `ScreenComponentProps { entry, params }` where `params = entry.params`. The `entry.params` contains `runId`, `owner`, `repo` for WorkflowRunDetail.

From `PlaceholderScreen.tsx`: the current pattern destructures `{ entry }` from props.

### 3.2 Keybinding Registration Pattern

From `useScreenKeybindings.ts` (lines 17-55):
```typescript
useScreenKeybindings([
  { key: "j", description: "Navigate down", group: "Navigation", handler: moveDown },
  { key: "k", description: "Navigate up", group: "Navigation", handler: moveUp },
  { key: "Enter", description: "Open", group: "Actions", handler: open },
]);
```
- Registers `PRIORITY.SCREEN` scope on mount, removes on unmount.
- Auto-generates status bar hints from first 8 bindings.
- Use `when` predicate on handlers to gate when overlay is active.

### 3.3 Overlay/Confirm Dialog Pattern

From `OverlayManager.tsx` (lines 73-130) and `overlay-types.ts`:
```typescript
const { openOverlay, closeOverlay, isOpen, confirmPayload } = useOverlay();

// Open confirmation:
openOverlay("confirm", {
  title: "Cancel Run?",
  message: "This will cancel workflow run #42.",
  confirmLabel: "Cancel Run",
  onConfirm: () => cancelRun(),
  onCancel: () => {},
});
```
- `openOverlay` registers `PRIORITY.MODAL` scope with Esc binding
- Mutual exclusion: only one overlay at a time
- Toggle: same type reopens → closes

### 3.4 Navigation Pattern

From `NavigationProvider.tsx` (lines 46-85):
```typescript
const nav = useNavigation();
nav.push(ScreenName.WorkflowRunDetail, { runId: "42", owner: "alice", repo: "myrepo" });
nav.pop(); // go back
```
- `push()` auto-inherits `repoContext` if not provided in params (lines 53-58)
- Duplicate prevention: won't push same screen+params as top of stack
- `repoContext` extracted by walking stack bottom-up for first entry with `owner`+`repo`

### 3.5 Responsive Layout Pattern

From `useLayout.ts`:
- `contentHeight = height - 2` (header + status bar)
- `modalWidth/modalHeight`: "50%" (large), "60%" (standard), "90%" (minimum)
- `breakpoint`: null (too small), "minimum" (80×24), "standard" (120×40), "large" (200×60)

### 3.6 Theme Color Usage

From `tokens.ts` (lines 209-256):
- `statusToToken("running")` → `"success"` (green)
- `statusToToken("queued")` → `"warning"` (yellow)
- `statusToToken("failed")` → `"error"` (red)
- `statusToToken("cancelled")` → `"error"` (red)
- `statusToToken("success")` → `"success"` (green)
- `statusToToken("error")` → `"error"` (red)

### 3.7 Existing Sub-component Pattern (Agents)

From `apps/tui/src/screens/Agents/`:
- `types.ts` — local type definitions
- `components/index.ts` — barrel export: `export * from "./MessageBlock.js"; export * from "./ToolBlock.js";`
- `utils/formatTimestamp.ts` — utility functions co-located with screen

---

## 4. E2E Test Infrastructure

### 4.1 Test Helpers

**File:** `e2e/tui/helpers.ts` (492 lines)

**Key exports:**
- `launchTUI(options?)` → `TUITestInstance` — spawns real PTY via `@microsoft/tui-test`, returns control object
- `TUITestInstance` interface: `sendKeys(...keys)`, `sendText(text)`, `waitForText(text, timeout?)`, `waitForNoText(text, timeout?)`, `snapshot()`, `getLine(n)`, `resize(cols, rows)`, `terminate()`
- `TERMINAL_SIZES`: `{ minimum: { width: 80, height: 24 }, standard: { width: 120, height: 40 }, large: { width: 200, height: 60 } }`
- `createMockAPIEnv(options?)` — configures `CODEPLANE_API_URL`, `CODEPLANE_TOKEN`, optional `CODEPLANE_DISABLE_SSE`
- `createTestCredentialStore(token?)` — temp credential file
- `run(cmd, opts?)` — subprocess exec for tsc/bun verification
- `bunEval(expression)` — `bun -e` in TUI package context
- `BUN`, `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY` — path constants

**Key input mapping (resolveKey):**
- Arrow keys: `"Up"` → `keyUp()` method, `"Down"` → `keyDown()` method
- Enter, Escape, Tab, Space, Backspace: mapped to press with key names
- `"ctrl+c"` → `keyCtrlC()`, `"ctrl+d"` → `keyCtrlD()`
- `"shift+Tab"` → press Tab with shift modifier
- Single chars passed through
- 50ms delay between keys

### 4.2 Test Organization Pattern

From existing test files:
```typescript
import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TUI_ROOT, TUI_SRC, run, bunEval, launchTUI, TERMINAL_SIZES, createMockAPIEnv } from "./helpers.ts";

// File structure tests
describe("TUI_FEATURE — Hook file structure", () => {
  test("file.ts exists", () => {
    expect(existsSync(join(HOOKS_DIR, "file.ts"))).toBe(true);
  });
  test("exports function", async () => {
    const result = await bunEval(`import { fn } from '${path}'; console.log(typeof fn)`);
    expect(result.stdout.trim()).toBe("function");
  });
});

// Integration tests with PTY
describe("TUI_FEATURE — Integration", () => {
  test("screen renders correctly", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.sendKeys("g", "r");  // go to repos
      await terminal.waitForText("Repositories");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });
});
```

**Test naming convention:** `"SNAP-XXX-NNN: description"`, `"KEY-XXX-NNN: description"`, `"RSP-XXX-NNN: description"`, `"INT-XXX-NNN: description"`, `"EDGE-XXX-NNN: description"`

### 4.3 Test File Location

`e2e/tui/workflows.test.ts` — does NOT exist yet. Must be created.

---

## 5. Screen Registry Entry

From `registry.ts` (lines 125-130):
```typescript
[ScreenName.WorkflowRunDetail]: {
  component: PlaceholderScreen,  // REPLACE with WorkflowRunDetailScreen
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.runId ? `Run #${p.runId}` : "Run"),
},
```

The registry entry already exists. Implementation only needs to:
1. Create the actual `WorkflowRunDetailScreen` component
2. Update the `component` field in registry to point to it (or update the import in `registry.ts`)

---

## 6. Feature Group in features.ts

From `specs/tui/features.ts` (lines 116-125):
```typescript
TUI_WORKFLOWS: [
  "TUI_WORKFLOW_LIST_SCREEN",
  "TUI_WORKFLOW_RUN_LIST",
  "TUI_WORKFLOW_RUN_DETAIL",    // ← THIS TICKET
  "TUI_WORKFLOW_LOG_STREAM",
  "TUI_WORKFLOW_ACTIONS",
  "TUI_WORKFLOW_DISPATCH",
  "TUI_WORKFLOW_ARTIFACTS_VIEW",
  "TUI_WORKFLOW_CACHE_VIEW",
],
```

---

## 7. Acceptance Criteria

From `specs/tui/tickets-TUI_EPIC_09_WORKFLOWS.json` (lines 201-216):
1. Screen renders with breadcrumb ending in `#{run-number}`
2. Run metadata header shows status badge, workflow name, run #, trigger info, timing
3. Elapsed time updates every 1s for running workflows
4. Step list renders all nodes ordered by position with status icons
5. Enter toggles inline log expansion with left-border panel below step
6. Inline log panel renders lines with line numbers and ANSI passthrough
7. SSE log events render incrementally in expanded step
8. SSE status events update step statuses and run status in real-time
9. Auto-follow scrolls to latest log line (toggleable with `f`)
10. `l` opens full-screen log viewer for focused step
11. `e` toggles dispatch inputs section for manually dispatched runs
12. Action confirmation overlays work with spinner and error handling
13. Rerun navigates to new run; resume re-establishes SSE; cancel closes SSE
14. Responsive at all 3 breakpoints

---

## 8. Architecture Decisions from Eng Spec

### 8.1 Component Hierarchy

```
WorkflowRunDetailScreen
├── useRunDetailState() — orchestrator
│   ├── useWorkflowRunDetail(repo, runId)
│   ├── useWorkflowLogStream(owner, repo, runId)
│   ├── useStepNavigation(nodes)
│   ├── useRunActions(repo, runId, status)
│   └── useElapsedTime(startedAt, isLive)
├── Loading → <FullScreenLoading spinnerFrame={} label="Loading run…" />
├── Error → <FullScreenError screenLabel="Workflow Run" error={} />
├── Data:
│   ├── <scrollbox ref={scrollboxRef}>
│   │   ├── <RunHeader />
│   │   ├── <DispatchInputsSection />
│   │   └── nodes.map → <StepRow /> + optional <InlineLogPanel />
│   └── <ActionConfirmOverlay />
```

### 8.2 State Machines

**Screen state:** loading → error | not_found | ready (live | terminal | action_pending)

**Step navigation:** j/k moves focus, Enter toggles expand, l opens log viewer, Esc collapses most recently expanded then pops screen

**Action confirmation:** c/r/R opens → confirm/esc/tab → executing → success (navigate/refresh) or error (show in overlay)

### 8.3 Keybinding Table

| Key | Action | When |
|-----|--------|------|
| `j`/`Down` | Focus next step | Always |
| `k`/`Up` | Focus prev step | Always |
| `Enter` | Toggle expand focused step | Always |
| `l` | Open log viewer for focused step | Focused step exists |
| `f` | Toggle auto-follow | Step expanded |
| `e` | Toggle dispatch inputs | dispatch_inputs exist |
| `c` | Cancel run | Status is running/queued |
| `r` | Rerun workflow | Status is terminal |
| `R` | Resume run | Status is cancelled/failed |
| `Esc` | Collapse latest → pop | Always |
| `G` | Focus last step | Always |
| `g g` | Focus first step | Always |
| `Ctrl+D` | Page down steps | Always |
| `Ctrl+U` | Page up steps | Always |

---

## 9. Responsive Behavior Requirements

### Minimum (80×24)
- Content height: 22 rows
- Modal: 90% width/height
- Single-line compact RunHeader
- Step rows: status icon + truncated name only (no duration column)
- InlineLogPanel: 4-char line number gutter
- Hide dispatch inputs section header counts

### Standard (120×40)
- Content height: 38 rows
- Modal: 60% width/height
- Two-row RunHeader
- Step rows: full name + duration column
- InlineLogPanel: 6-char line number gutter
- Full dispatch inputs display

### Large (200×60)
- Content height: 58 rows
- Modal: 50% width/height
- Two-row RunHeader with extra metadata
- Step rows: full name + duration + iteration
- InlineLogPanel: 8-char line number gutter
- Expanded metadata in RunHeader

---

## 10. SSE Integration Points

**API Endpoint:** `GET /api/repos/:owner/:repo/runs/:id/logs`

**Event types consumed:**
- `"log"` events → populate `logs Map<stepId, LogLine[]>`
- `"status"` events → update `steps Map<stepId, StepState>` and `runStatus`
- `"done"` event → `connectionHealth.state="completed"`, final `runStatus`

**Connection lifecycle:**
- Enabled when `isLive` (run is running/queued and not in terminal status)
- Auto-reconnect with exponential backoff (1s→2s→4s→8s→…30s cap)
- Deduplication via `log_id` Set
- Batched flush: 100 lines or 200ms
- Memory cap: 10,000 lines per step (FIFO eviction)
- `spinnerFrame` from `useSpinner()` injected into state

---

## 11. Error Handling Matrix

| Error | Display | Retry |
|-------|---------|-------|
| 401 | `Session expired. Run codeplane auth login` | No |
| 403 | `Permission denied` in FullScreenError | `R` refetch |
| 404 | `Run #{runId} not found` in FullScreenError | No |
| 409 | Error in ActionConfirmOverlay | Dismiss + retry action |
| 429 | `Rate limited` in FullScreenError | `R` refetch |
| 500 | `Server error` in FullScreenError | `R` refetch |
| Network timeout | `Connection timed out` in FullScreenError | `R` refetch |
| SSE disconnect | Status bar indicator + auto-reconnect | Automatic |
| SSE reconnect failure | Status bar `⬤` red + `R` reconnect hint | `R` manual |
| Component crash | Error boundary with `r` restart / `q` quit | `r` key |

---

## 12. Performance Constraints

- Render budget: <16ms per frame
- Memory budget: <20MB typical
- Log line cap: 10,000 per step (FIFO eviction)
- SSE batch flush: 100 lines or 200ms
- Dedup set: pruned at 50K → 25K entries
- Elapsed time: 1s `setInterval` (not animation frame)
- Spinner: shared singleton via `useSyncExternalStore`

---

## 13. Critical Implementation Notes

### 13.1 Esc Priority Chain
The Esc key must follow this priority chain:
1. If action confirm overlay is open → close overlay (handled by OverlayManager PRIORITY.MODAL)
2. If any step is expanded → collapse most recently expanded (`collapseLatest()` returns true)
3. If no step expanded → pop screen (`navigation.pop()`)

This means the screen's Esc handler must check `collapseLatest()` before calling `pop()`. The OverlayManager already handles case 1 via PRIORITY.MODAL scope.

### 13.2 Screen Entry Params
From `registry.ts` line 129: `breadcrumbLabel: (p) => (p.runId ? \`Run #${p.runId}\` : "Run")`. Params expected: `{ runId, owner, repo }`.

### 13.3 Live vs Terminal Detection
`isLive` is derived from `TERMINAL_STATUSES` set: `{ "success", "failure", "cancelled", "error" }`. If `effectiveRunStatus` is NOT in this set, the run is live.

`effectiveRunStatus` merges SSE `runStatus` with API `run.status`, preferring SSE when connected.

### 13.4 Rerun Navigation
On successful rerun, the API returns `{ workflow_run_id }`. Use `navigation.replace(ScreenName.WorkflowRunDetail, { runId: String(newId), owner, repo })` to navigate to the new run without growing the stack.

### 13.5 No Existing Workflow Directory
The `apps/tui/src/screens/Workflows/` directory does NOT exist yet. It will be created by the `tui-workflow-screen-scaffold` dependency ticket. This ticket assumes that directory structure exists.