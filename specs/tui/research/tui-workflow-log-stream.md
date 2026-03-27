# Research Document: `tui-workflow-log-stream`

## 1. Executive Summary

This ticket implements a full-screen workflow log viewer with SSE streaming, ANSI passthrough, step navigation, and search. The implementation replaces a placeholder component at `apps/tui/src/screens/Workflows/WorkflowLogViewer.tsx` with a production-quality log viewer. The Workflows screen directory **does not yet exist** — it must be created by the `tui-workflow-screen-scaffold` dependency ticket first.

**Critical finding:** The dependency chain (`tui-workflow-screen-scaffold`, `tui-workflow-sse-hooks`, `tui-workflow-ui-utils`) has NOT been implemented yet. The `ScreenName` enum lacks `WorkflowLogViewer`, `WorkflowRunList`, `WorkflowArtifacts`, and `WorkflowCaches` entries. All workflow screens currently point to `PlaceholderScreen`. The specification files for dependency hooks exist in `specs/tui/` but have not been copied to production `apps/tui/src/`.

---

## 2. Current Codebase State

### 2.1 Missing Production Files (Dependencies Not Yet Implemented)

| Required File | Current State | Spec Location |
|---|---|---|
| `apps/tui/src/screens/Workflows/` directory | **Does not exist** | `specs/tui/apps/tui/src/screens/Workflows/` |
| `apps/tui/src/hooks/workflow-types.ts` | **Does not exist** | `specs/tui/apps/tui/src/hooks/workflow-types.ts` (174 lines) |
| `apps/tui/src/hooks/workflow-stream-types.ts` | **Does not exist** | `specs/tui/apps/tui/src/hooks/workflow-stream-types.ts` (116 lines) |
| `apps/tui/src/hooks/useWorkflowLogStream.ts` | **Does not exist** | `specs/tui/apps/tui/src/hooks/useWorkflowLogStream.ts` (29 lines, TUI wrapper) |
| `apps/tui/src/hooks/useWorkflowRunDetail.ts` | **Does not exist** | `specs/tui/apps/tui/src/hooks/useWorkflowRunDetail.ts` (14 lines) |
| `apps/tui/src/screens/Workflows/utils.ts` | **Does not exist** | `specs/tui/apps/tui/src/screens/Workflows/utils.ts` (156 lines) |
| `ScreenName.WorkflowLogViewer` enum entry | **Missing from enum** | Defined in scaffold spec |
| `e2e/tui/helpers/workflows.ts` | **Does not exist** | Referenced in `specs/tui/e2e/tui/workflow-sse.test.ts` |

### 2.2 Existing Production Files (Infrastructure Ready)

| File | Path | Status | Key Exports |
|---|---|---|---|
| ScreenName enum | `apps/tui/src/router/types.ts` (L1-43) | Has `Workflows` and `WorkflowRunDetail` only | `ScreenName`, `ScreenEntry`, `ScreenComponentProps`, `ScreenDefinition` |
| Screen registry | `apps/tui/src/router/registry.ts` (L119-130) | Both map to `PlaceholderScreen` | `screenRegistry` |
| Screen router | `apps/tui/src/router/ScreenRouter.tsx` | Working | Renders `definition.component` |
| AppShell | `apps/tui/src/components/AppShell.tsx` | Working | Wraps `HeaderBar` + content + `StatusBar` + `OverlayLayer` |
| PlaceholderScreen | `apps/tui/src/screens/PlaceholderScreen.tsx` | Working reference | Shows screen name and params |
| useScreenKeybindings | `apps/tui/src/hooks/useScreenKeybindings.ts` (L1-55) | Working | Registers `PRIORITY.SCREEN` scopes + status bar hints |
| useSpinner | `apps/tui/src/hooks/useSpinner.ts` (L1-177) | Working | Braille/ASCII animation via OpenTUI Timeline |
| useBreakpoint | `apps/tui/src/hooks/useBreakpoint.ts` (L1-17) | Working | Returns `"minimum"` / `"standard"` / `"large"` / `null` |
| useLayout | `apps/tui/src/hooks/useLayout.ts` (L1-110) | Working | Returns `LayoutContext` with `contentHeight = height - 2` |
| useTheme | `apps/tui/src/hooks/useTheme.ts` (L1-30) | Working | Returns frozen `ThemeTokens` |
| KeybindingProvider | `apps/tui/src/providers/KeybindingProvider.tsx` (L1-165) | Working | Priority dispatch, scope management |
| NavigationProvider | `apps/tui/src/providers/NavigationProvider.tsx` | Working | Stack-based navigation, `push`, `pop`, `reset` |
| SSEProvider | `apps/tui/src/providers/SSEProvider.tsx` (L1-16) | **Stub — returns null** | Not usable for workflow SSE |
| normalize-key | `apps/tui/src/providers/normalize-key.ts` (L1-74) | Working | `normalizeKeyEvent()`, `normalizeKeyDescriptor()` |
| Deep links | `apps/tui/src/navigation/deepLinks.ts` (L1-118) | Missing `workflow-log` alias | `buildInitialStack()` |
| Go-to bindings | `apps/tui/src/navigation/goToBindings.ts` (L1-50) | `g f` → `Workflows` present | `goToBindings`, `executeGoTo()` |
| Theme tokens | `apps/tui/src/theme/tokens.ts` (L1-263) | Working | `ThemeTokens`, `CoreTokenName`, `statusToToken()` |
| Breakpoint types | `apps/tui/src/types/breakpoint.ts` (L1-33) | Working | `Breakpoint`, `getBreakpoint()` |
| E2E helpers | `e2e/tui/helpers.ts` (492 lines) | Working | `launchTUI()`, `TUITestInstance`, `TERMINAL_SIZES` |

---

## 3. Architecture & Patterns

### 3.1 Screen Component Pattern

All screens receive `ScreenComponentProps`:
```typescript
// apps/tui/src/router/types.ts, L83-88
export interface ScreenComponentProps {
  entry: ScreenEntry;    // { id, screen, params, breadcrumb, scrollPosition? }
  params: Record<string, string>;  // convenience: parsed params
}
```

ScreenRouter (`apps/tui/src/router/ScreenRouter.tsx`) looks up the screen in `screenRegistry` and renders:
```typescript
const Component = definition.component;
const props: ScreenComponentProps = { entry: currentScreen, params: currentScreen.params };
return <Component {...props} />;
```

### 3.2 Keybinding System

**Priority levels** (`apps/tui/src/providers/keybinding-types.ts`):
- `PRIORITY.TEXT_INPUT = 1` — OpenTUI input focus
- `PRIORITY.MODAL = 2` — overlays, command palette
- `PRIORITY.GOTO = 3` — active 1500ms after `g`
- `PRIORITY.SCREEN = 4` — per-screen bindings
- `PRIORITY.GLOBAL = 5` — always-active (`q`, `Esc`, `Ctrl+C`, `?`, `:`, `g`)

**Dispatch flow** (`apps/tui/src/providers/KeybindingProvider.tsx`, L70-88):
```typescript
useKeyboard((event: KeyEvent) => {
  if (event.eventType === "release") return;
  const descriptor = normalizeKeyEvent(event);
  const scopes = getActiveScopesSorted(); // ASC priority, LIFO within same
  for (const scope of scopes) {
    const handler = scope.bindings.get(descriptor);
    if (handler) {
      if (handler.when && !handler.when()) continue;
      handler.handler();
      event.preventDefault();
      event.stopPropagation();
      return; // First match wins
    }
  }
});
```

**`useScreenKeybindings` usage** (`apps/tui/src/hooks/useScreenKeybindings.ts`, L17):
```typescript
export function useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[]): void
```
- Registers a `PRIORITY.SCREEN` scope on mount, removes on unmount
- Uses ref pattern for stable handler references without re-registering scope
- Auto-generates status bar hints from first 8 bindings if `hints` not provided
- Keys normalized via `normalizeKeyDescriptor()` before registration

**Key normalization** (`apps/tui/src/providers/normalize-key.ts`):
- Single uppercase letter: `"G"` stays `"G"` (shift not shown)
- Ctrl combos: `"ctrl+d"`, `"ctrl+u"`
- Aliases: `"Enter"` → `"return"`, `"Esc"` → `"escape"`
- **Note:** No built-in `"gg"` compound descriptor support. The spec says `normalizeKeyDescriptor` treats `"gg"` as compound, but current implementation does NOT — it would lowercase to `"gg"`. The go-to mode handling is done at the `PRIORITY.GOTO` level in `useGlobalKeybindings`, not in the key normalizer. The `g g` jump-to-top will need to integrate with go-to mode or use a separate mechanism.

### 3.3 Layout System

**Breakpoints** (`apps/tui/src/types/breakpoint.ts`, L25-33):
- `null`: cols < 80 OR rows < 24 (unsupported)
- `"minimum"`: 80×24 – 119×39
- `"standard"`: 120×40 – 199×59
- `"large"`: 200×60+

**`useLayout()` return** (`apps/tui/src/hooks/useLayout.ts`):
- `contentHeight = Math.max(0, height - 2)` — excludes 1-row header + 1-row status bar
- `sidebarVisible`, `sidebarWidth` — from `useSidebarState()`
- `modalWidth`, `modalHeight` — breakpoint-dependent percentages

**Key detail for log viewer:** The log viewer's viewport height calculation is `layout.contentHeight - 1 - (searchActive ? 1 : 0)`, subtracting 1 for the step selector bar row and optionally 1 for the search overlay.

### 3.4 Theme System

**ThemeTokens** (`apps/tui/src/theme/tokens.ts`, L13-41):
```typescript
interface ThemeTokens {
  primary: RGBA;    // Blue - focused items, links
  success: RGBA;    // Green - passed checks, additions
  warning: RGBA;    // Yellow - pending states, syncing
  error: RGBA;      // Red - errors, failures
  muted: RGBA;      // Gray - secondary text, metadata
  surface: RGBA;    // Dark gray - modal backgrounds
  border: RGBA;     // Gray - box borders
  // + 5 diff-specific tokens
}
```

**CoreTokenName** (`apps/tui/src/theme/tokens.ts`, L198):
```typescript
type CoreTokenName = "primary" | "success" | "warning" | "error" | "muted" | "surface" | "border";
```

The `WorkflowStatusIcon.color` field in `utils.ts` uses `CoreTokenName`, and `useTheme()` returns tokens indexed by these names.

### 3.5 SSE Architecture

**Current state:** The `SSEProvider` (`apps/tui/src/providers/SSEProvider.tsx`) is a stub — `useSSE()` returns `null`. The workflow log stream does NOT use this provider. Instead, `useWorkflowLogStream` (spec at `specs/tui/packages/ui-core/src/hooks/workflows/useWorkflowLogStream.ts`) manages its own `EventSource`/`fetch` SSE connection internally via `createSSEReader`.

**Core SSE hook** (spec at `specs/tui/packages/ui-core/src/hooks/workflows/useWorkflowLogStream.ts`, 383 lines):
- Uses `getSSETicket()` for ticket-based auth, falls back to Bearer token
- Connects to `GET /api/repos/{owner}/{repo}/runs/{runId}/logs` with `Accept: text/event-stream`
- Supports `Last-Event-ID` header for reconnection replay
- Deduplicates via `Set<log_id>` with LRU pruning at 50K entries
- Batches log lines: flushes at 100 lines or 200ms, whichever comes first
- FIFO eviction at 10,000 lines per step (`VIRTUAL_SCROLL_WINDOW`)
- Reconnection: exponential backoff 1s → 2s → 4s → ... → 30s max, 20 attempts max
- Keepalive timeout: 45s dead-connection detector
- Returns: `{ logs: Map, steps: Map, runStatus, connectionHealth, reconnect, lastEventId }`

**TUI wrapper** (spec at `specs/tui/apps/tui/src/hooks/useWorkflowLogStream.ts`):
- Wraps core hook with `useSpinner(isStreaming)` for braille animation
- Adds `spinnerFrame` to return type

**Server endpoint** (`apps/server/src/routes/workflows.ts`, L825-908):
- `GET /api/repos/:owner/:repo/runs/:id/logs` — SSE stream
- Event types: `"log"`, `"status"`, `"done"`
- For terminal runs: sends initial events + done, then closes
- Supports `Last-Event-ID` for replay of missed logs
- Log event format: `{ log_id, step, line, content, stream }`
- Status event format: `{ run, steps: [...] }`

### 3.6 Navigation Stack

**Max depth:** 32 (`apps/tui/src/router/types.ts`, L101)
**Default root:** `ScreenName.Dashboard`
**Auto-inheritance:** `owner`/`repo` params auto-inherited from parent when pushing child screens

The log viewer will be reached via:
1. `Dashboard → RepoOverview → Workflows → WorkflowRunDetail → WorkflowLogViewer`
2. Deep-link: `codeplane tui --screen workflow-log --repo owner/repo --run-id 123`

For the deep-link to work, `deepLinks.ts` needs the `"workflow-log"` alias added to `resolveScreenName()`, plus `ScreenName.WorkflowLogViewer` in the `requiresRepo` array.

---

## 4. Dependency Specifications (Full Content)

### 4.1 workflow-types.ts

**Location (spec):** `specs/tui/apps/tui/src/hooks/workflow-types.ts` (174 lines)

Key types consumed by this ticket:
```typescript
type WorkflowRunStatus = "queued" | "running" | "success" | "failure" | "cancelled" | "error";
const TERMINAL_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set(["success", "failure", "cancelled", "error"]);
interface WorkflowRun { id, status, started_at, completed_at, ... }
interface WorkflowRunDetailResponse { run, workflow, nodes, mermaid, plan_xml }
interface QueryResult<T> { data, loading, error, refetch }
```

### 4.2 workflow-stream-types.ts

**Location (spec):** `specs/tui/apps/tui/src/hooks/workflow-stream-types.ts` (116 lines)

Key types consumed by this ticket:
```typescript
interface LogLine { log_id, step_id, timestamp, content, stream: "stdout" | "stderr" }
interface StatusEvent { run_id, run_status, step_id?, step_status?, started_at?, completed_at? }
interface DoneEvent { run_id, final_status, completed_at }
type WorkflowStreamConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "completed" | "errored" | "failed"
interface ConnectionHealth { state, reconnectAttempts, maxReconnectAttempts, lastConnectedAt, lastError }
interface WorkflowLogStreamState { logs: Map, steps: Map, runStatus, connectionHealth, reconnect, lastEventId, spinnerFrame }
interface StepState { step_id, status, started_at, completed_at, log_count }
const VIRTUAL_SCROLL_WINDOW = 10_000
```

### 4.3 utils.ts

**Location (spec):** `specs/tui/apps/tui/src/screens/Workflows/utils.ts` (156 lines)

Key functions consumed by this ticket:
```typescript
getRunStatusIcon(status: WorkflowRunStatus): WorkflowStatusIcon
  // Returns { icon, fallback, color: CoreTokenName, bold, label }
getStepStatusIcon(status: string): WorkflowStatusIcon
formatDuration(seconds: number | null | undefined): string
  // Returns "5s", "2m 30s", "1h 30m"
getDurationColor(seconds): CoreTokenName
formatBytes(bytes): string
  // Returns "1.2 KB", "5 MB"
```

Status icons:
- success: `✓` / `[OK]` / green
- failure: `✗` / `[FL]` / red / bold
- running: `◎` / `[..]` / yellow / bold  
- queued: `◌` / `[__]` / primary
- cancelled: `✕` / `[XX]` / muted
- error: `⚠` / `[ER]` / red / bold

### 4.4 useWorkflowRunDetail

**Location (spec):** `specs/tui/apps/tui/src/hooks/useWorkflowRunDetail.ts` (14 lines)

```typescript
function useWorkflowRunDetail(
  repo: RepoIdentifier,  // Note: takes { owner, repo } object, NOT separate params
  runId: number,
  options?: { enabled?: boolean },
): QueryResult<WorkflowRunDetailResponse>
```

**Important API mismatch with spec:** The eng spec's Step 9 calls `useWorkflowRunDetail(owner, repo, runId)` with separate string params, but the actual hook signature takes `RepoIdentifier` object: `useWorkflowRunDetail({ owner, repo }, runId)`. This must be reconciled during implementation.

---

## 5. E2E Test Infrastructure

### 5.1 Test helpers (`e2e/tui/helpers.ts`, 492 lines)

**Key exports:**
```typescript
interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>
  sendText(text: string): Promise<void>
  waitForText(text: string, timeoutMs?: number): Promise<void>
  waitForNoText(text: string, timeoutMs?: number): Promise<void>
  snapshot(): string
  getLine(lineNumber: number): string
  resize(cols: number, rows: number): Promise<void>
  terminate(): Promise<void>
  rows: number; cols: number;
}

const TERMINAL_SIZES = {
  minimum: { width: 80, height: 24 },
  standard: { width: 120, height: 40 },
  large: { width: 200, height: 60 },
};

function launchTUI(options?: LaunchTUIOptions): Promise<TUITestInstance>
```

**LaunchTUI options:** `{ cols?, rows?, env?, args?, launchTimeoutMs? }`

**Timeouts:** `DEFAULT_WAIT_TIMEOUT_MS = 10_000`, `POLL_INTERVAL_MS = 100`

### 5.2 Missing E2E helpers

The test spec references helpers that don't exist yet:
- `e2e/tui/helpers/workflows.ts` — `navigateToWorkflowRunDetail()`, `waitForLogStreaming()`
- No existing `e2e/tui/workflows.test.ts` file

The `helpers/` subdirectory does not exist under `e2e/tui/`.

### 5.3 Test patterns from existing files

**From `e2e/tui/agents.test.ts` (4,331 lines):**
```typescript
let terminal: TUITestInstance;
afterEach(async () => { if (terminal) await terminal.terminate(); });

async function navigateToAgents(terminal: TUITestInstance): Promise<void> {
  await terminal.sendKeys("g", "a");
  await terminal.waitForText("Agent Sessions");
}

test("KEY-AGENT-LIST-001: description", async () => {
  terminal = await launchTUI({ cols: 120, rows: 40 });
  await navigateToAgents(terminal);
  await terminal.sendKeys("j");
  expect(terminal.snapshot()).toMatchSnapshot();
});
```

**From `e2e/tui/repository.test.ts` (610 lines):**
```typescript
test("HOOK-001: useRepoTree returns function type", async () => {
  const result = await bunEval(`...`);
  expect(result.stdout.trim()).toBe("function");
});
```

### 5.4 Unit test pattern from hooks

**From `apps/tui/src/hooks/__tests__/useSpinner.test.ts`:**
- Uses `bun:test` (`describe`, `test`, `expect`, `spyOn`, `beforeEach`)
- Mocks React hooks (`useSyncExternalStore`, `useEffect`) via `spyOn`
- Simulates mount/unmount via helper functions
- No actual renderer needed for pure hook tests

---

## 6. OpenTUI Component API

### 6.1 Available JSX elements

From the component reference and existing code:
- `<box>` — flexbox container: `flexDirection`, `width`, `height`, `padding`, `margin`, `flexGrow`, `flexShrink`, `gap`, `justifyContent`, `alignItems`, `position`, `border`, `borderColor`
- `<text>` — text node: `color`, `bold`, `underline`, `inverse`, `dim`
- `<scrollbox>` — scrollable container
- `<input>` — text input: `value`, `onChange`, `autoFocus`, `placeholder`
- `<select>` — dropdown
- `<code>` — syntax highlighted code
- `<diff>` — diff viewer
- `<markdown>` — markdown renderer

### 6.2 Available hooks from OpenTUI

- `useKeyboard(handler)` — keyboard input (used internally by KeybindingProvider)
- `useTerminalDimensions()` — returns `{ width, height }` from `@opentui/react`
- `Timeline`, `engine` — animation engine from `@opentui/core` (used by useSpinner)

---

## 7. Implementation Risks & Gaps

### 7.1 Dependency chain not implemented

All three dependency tickets are NOT yet implemented:
1. **`tui-workflow-screen-scaffold`** — No `WorkflowLogViewer` enum entry, no directory structure
2. **`tui-workflow-sse-hooks`** — No production `useWorkflowLogStream` hook, no `workflow-stream-types.ts`
3. **`tui-workflow-ui-utils`** — No production `utils.ts`

**Mitigation:** All spec files exist with full implementations. They can be copied from `specs/tui/apps/tui/src/` to `apps/tui/src/` as part of the dependency implementation.

### 7.2 SSEProvider is a stub

The `SSEProvider` returns `null`. The workflow log stream hook manages its own SSE connection directly (via `createSSEReader` from `@codeplane/ui-core`), so this is NOT a blocker. However, the `@codeplane/ui-core` package may need the workflow hooks added.

### 7.3 `useWorkflowRunDetail` API mismatch

The spec hook takes `RepoIdentifier` object: `useWorkflowRunDetail({ owner, repo }, runId)`, but the eng spec's component code calls it as `useWorkflowRunDetail(owner, repo, runId)` with separate params. The implementation must match the hook signature.

### 7.4 `gg` compound keybinding

The `normalizeKeyDescriptor` function does NOT have special handling for `"gg"`. It would normalize to `"gg"` (lowercase, 2 chars). The KeybindingProvider's dispatch loop checks `scope.bindings.get(descriptor)` for a single normalized key. For `g g` to work, the go-to mode system (at `PRIORITY.GOTO`) must intercept the first `g`, enter go-to mode, and then dispatch the second `g` to the screen's `"gg"` binding. This needs verification that the current `useGlobalKeybindings` go-to implementation supports screen-level `g g` bindings.

### 7.5 No `useQuery` hook in production

The `useWorkflowRunDetail` hook imports `useQuery` from `"./useQuery.js"`, but no `useQuery.ts` exists in the production `apps/tui/src/hooks/` directory. This is part of the `tui-workflow-data-hooks` dependency.

### 7.6 ANSI passthrough assumption

The spec states "OpenTUI's native Zig renderer interprets ANSI escape sequences natively — no stripping, no re-encoding." This needs verification. The `<text>` component receives a string with embedded ANSI codes; OpenTUI must pass them through to the terminal. If OpenTUI strips ANSI, the log viewer will need to use a raw text rendering mode.

### 7.7 Virtual scrolling without `<scrollbox>`

The spec implements manual virtual scrolling (computing `visibleStart`/`visibleEnd` and slicing) rather than using OpenTUI's `<scrollbox>`. This is intentional — `<scrollbox>` would render all 10,000 lines into the React tree, while the manual approach only renders viewport-sized lines (~36 elements).

---

## 8. Files to Create (This Ticket)

| File | Type | Est. Lines | Purpose |
|---|---|---|---|
| `apps/tui/src/screens/Workflows/log-viewer-types.ts` | Types | ~60 | SearchMatch, component props, constants |
| `apps/tui/src/screens/Workflows/strip-ansi.ts` | Utility | ~15 | ANSI escape stripping for search |
| `apps/tui/src/screens/Workflows/search-utils.ts` | Utility | ~50 | Case-insensitive search with ANSI stripping |
| `apps/tui/src/screens/Workflows/useElapsedTime.ts` | Hook | ~50 | Live elapsed time for running runs |
| `apps/tui/src/screens/Workflows/StepSelectorBar.tsx` | Component | ~120 | Horizontal step tabs with badges |
| `apps/tui/src/screens/Workflows/LogContentPanel.tsx` | Component | ~180 | Virtual scrolling log lines with ANSI passthrough |
| `apps/tui/src/screens/Workflows/SearchOverlay.tsx` | Component | ~40 | Single-line search input with match count |
| `apps/tui/src/screens/Workflows/ConnectionHealthDot.tsx` | Component | ~30 | Status bar connection indicator |
| `apps/tui/src/screens/Workflows/WorkflowLogViewer.tsx` | Screen | ~350 | Main screen component |
| `apps/tui/src/screens/Workflows/__tests__/strip-ansi.test.ts` | Unit test | ~40 | ANSI stripping tests |
| `apps/tui/src/screens/Workflows/__tests__/search-utils.test.ts` | Unit test | ~60 | Search match tests |
| `apps/tui/src/screens/Workflows/__tests__/useElapsedTime.test.ts` | Unit test | ~20 | Elapsed time hook tests |
| `e2e/tui/workflows.test.ts` | E2E test | ~900 | 93 E2E tests across 12 categories |
| `e2e/tui/helpers/workflows.ts` | E2E helper | ~30 | `navigateToWorkflowRunDetail()`, `waitForLogStreaming()` |

## 9. Files to Modify (This Ticket)

| File | Change |
|---|---|
| `apps/tui/src/screens/Workflows/index.ts` | Add exports for all new modules |
| `apps/tui/src/router/registry.ts` (L125-130) | Update `WorkflowLogViewer` breadcrumb label |
| `apps/tui/src/screens/Workflows/WorkflowRunDetailScreen.tsx` | Add `l` keybinding to push log viewer |

---

## 10. Key Technical Decisions

### 10.1 Virtual scrolling approach
Manual slice-based: `currentLogs.slice(scrollOffset, scrollOffset + viewportHeight)`. This avoids mounting 10K React elements.

### 10.2 Per-step scroll position preservation
Using a mutable `Map<string, number>` ref (not state) — avoids re-renders on step switch.

### 10.3 Search implementation
- Case-insensitive literal matching (no regex)
- ANSI-stripped text for matching via custom `stripAnsi()` 
- All occurrences per line (overlapping allowed)
- Match navigation wraps around (modular arithmetic)

### 10.4 Auto-follow behavior
- Default ON for in-progress runs, OFF for terminal runs
- Disabled by any upward scroll (j↑, k↑, Ctrl+U, g g)
- Re-enabled by G (jump to bottom) or f toggle
- Disabled automatically when SSE `done` event arrives

### 10.5 Reconnection debounce
- `R` key debounced at 2 seconds via `lastReconnectRef` timestamp
- Resets attempt counter and backoff on manual reconnect

### 10.6 ANSI passthrough
Log `content` strings containing ANSI escape codes are passed directly to `<text>` — no processing. The terminal itself interprets the colors.

### 10.7 Responsive breakpoints
| Breakpoint | Gutter | Stream Column | Step Selector | Follow Indicator |
|---|---|---|---|---|
| minimum (80×24) | 4 chars | Hidden | `[< name >]` collapsed | `[F]` |
| standard (120×40) | 6 chars | Visible | Full tabs with badges | `AUTO-FOLLOW OFF` |
| large (200×60+) | 8 chars | Visible | Full tabs + durations | `AUTO-FOLLOW OFF` |