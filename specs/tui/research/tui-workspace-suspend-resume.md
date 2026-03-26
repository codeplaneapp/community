# Research: `tui-workspace-suspend-resume` — Workspace suspend/resume actions with optimistic updates

## 1. Existing File Inventory (Files to Create/Modify)

### Files to Create (do not exist yet)

| File | Verified | Notes |
|---|---|---|
| `apps/tui/src/workspaces/constants.ts` | ✅ No `apps/tui/src/workspaces/` directory exists | New directory + file |
| `apps/tui/src/hooks/useWorkspaceStatusBar.ts` | ✅ Not found | New hook |
| `apps/tui/src/hooks/useWorkspaceSuspendResume.ts` | ✅ Not found | New hook |
| `apps/tui/src/hooks/useWorkspaceSuspendResumeKeybindings.ts` | ✅ Not found | New hook |
| `e2e/tui/workspaces.test.ts` | ✅ Not found (only `specs/tui/e2e/tui/workspaces.test.ts` exists in specs) | New test file |

### Files to Modify

| File | Path | Lines | What Changes |
|---|---|---|---|
| `LoadingProvider.tsx` | `apps/tui/src/providers/LoadingProvider.tsx` | 231 lines | Add `statusBarSuccess` state + `setStatusBarSuccess()` method |
| `types.ts` (loading) | `apps/tui/src/loading/types.ts` | 151 lines | Add `statusBarSuccess` and `setStatusBarSuccess` to `LoadingContextValue` interface |
| `StatusBar.tsx` | `apps/tui/src/components/StatusBar.tsx` | 95 lines | Add success message rendering path |
| `hooks/index.ts` | `apps/tui/src/hooks/index.ts` | 41 lines | Export new hooks |

---

## 2. Core Pattern: `useOptimisticMutation` (Primary Integration Point)

**File:** `apps/tui/src/hooks/useOptimisticMutation.ts` (94 lines)

**Interface:**
```typescript
interface OptimisticMutationOptions<TArgs> {
  id: string;              // Unique mutation ID
  entityType: string;      // e.g., "workspace"
  action: string;          // e.g., "suspend"
  mutate: (args: TArgs) => Promise<void>;
  onOptimistic: (args: TArgs) => void;
  onRevert: (args: TArgs) => void;
  onSuccess?: (args: TArgs) => void;
}
```

**Behavior (lines 54-87):**
1. Calls `onOptimistic(args)` synchronously
2. Sets `isLoadingRef.current = true`
3. Calls `loading.registerMutation(id, action, entityType)`
4. Fires `mutate(args)` promise
5. On success: `loading.completeMutation(id)`, calls `onSuccess`
6. On error: calls `onRevert(args)`, then `loading.failMutation(id, errorMessage)` with 60-char truncation
7. Mutation is never canceled on unmount

**Key Design Decision for Suspend/Resume:** The spec's `useWorkspaceSuspendResume` wraps this pattern but adds per-workspace in-flight guards (via `Map<string, boolean>` ref), custom 3s message timing (vs the default 5s), and retry support. It does NOT directly use `useOptimisticMutation` — instead it reimplements the same pattern with these additions.

---

## 3. LoadingProvider — Current State and Required Modifications

**File:** `apps/tui/src/providers/LoadingProvider.tsx` (231 lines)

### Current state that matters:

- **Line 23:** `const [statusBarError, setStatusBarError] = useState<string | null>(null);`
- **Lines 143-161:** `failMutation(id, errorMessage)` — deletes mutation state, sets `statusBarError`, auto-clears after `STATUS_BAR_ERROR_DURATION_MS` (5000ms)
- **Lines 135-141:** `completeMutation(id)` — only deletes mutation state, **NO success message**
- **Lines 193-208:** Context value exposes `statusBarError` but **no `statusBarSuccess`**

### What must be added:

1. New state: `const [statusBarSuccess, setStatusBarSuccessState] = useState<string | null>(null);`
2. New ref: `const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);`
3. New method: `setStatusBarSuccess(message: string, durationMs: number = 3000)` — sets success message with auto-clear timer
4. Cleanup on unmount for `successTimerRef`
5. Add to context value: `statusBarSuccess`, `setStatusBarSuccess`

### Loading types modification:

**File:** `apps/tui/src/loading/types.ts` (lines 47-123, `LoadingContextValue` interface)

Must add:
```typescript
/** Status bar success message (set by workspace actions, auto-clears). */
statusBarSuccess: string | null;
/** Show a timed success message in the status bar. */
setStatusBarSuccess(message: string, durationMs?: number): void;
```

---

## 4. StatusBar Component — Current Rendering Logic

**File:** `apps/tui/src/components/StatusBar.tsx` (95 lines)

**Current rendering (lines 63-81):**
```tsx
{statusBarError ? (
  <text fg={theme.error}>{truncateRight(statusBarError, maxErrorWidth)}</text>
) : (
  <>
    {displayedHints.map(...)}
    {showRetryHint && <text>R:retry</text>}
  </>
)}
```

**Required change:** Insert `statusBarSuccess` between error and hints:
```tsx
{statusBarError ? (
  <text fg={theme.error}>...</text>
) : statusBarSuccess ? (
  <text fg={theme.success}>{truncateRight(statusBarSuccess, maxErrorWidth)}</text>
) : (
  // existing hints
)}
```

**Note:** `useLoading()` on line 16 must be updated to destructure `statusBarSuccess`.

---

## 5. Keybinding System — How Screen Keys Are Registered

### `useScreenKeybindings` (lines 17-55)

**Signature:** `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[]): void`

**Behavior:**
- Registers `PRIORITY.SCREEN` (4) scope on mount
- Stores bindings in ref to keep handlers fresh
- Auto-generates status bar hints from first 8 bindings if `hints` not provided
- Dependency key for re-registration: `bindings.map(b => b.key).join(",")`

### `KeyHandler` interface (keybinding-types.ts lines 1-28)
```typescript
interface KeyHandler {
  key: string;          // normalized key descriptor
  description: string;  // for help overlay
  group: string;        // "Navigation", "Actions", etc.
  handler: () => void;
  when?: () => boolean; // conditional — evaluated at dispatch time
}
```

### `StatusBarHint` (keybinding-types.ts lines 71-78)
```typescript
interface StatusBarHint {
  keys: string;    // e.g., "s", "r"
  label: string;   // e.g., "suspend", "resume"
  order?: number;  // lower = shown first, default 50
}
```

### Dispatch priority (line 30-41)
- PRIORITY.TEXT_INPUT = 1 (highest)
- PRIORITY.MODAL = 2
- PRIORITY.GOTO = 3
- PRIORITY.SCREEN = 4 ← suspend/resume keys registered here
- PRIORITY.GLOBAL = 5 (fallback — q, Esc, etc.)

### Key normalization (normalize-key.ts)
- Single chars like `s`, `r` normalize to themselves
- `R` (shift+r) normalizes to `R` (uppercase)

### Integration pattern for dynamic hints:
The `useWorkspaceSuspendResumeKeybindings` hook should pass hints to `useScreenKeybindings`. Since hints must change as focused workspace changes, they need to be passed as the `hints` parameter. The `useScreenKeybindings` effect re-runs when hints reference changes.

---

## 6. Workspace Data Layer (Dependencies)

### `useSuspendWorkspace` (specs/tui/packages/ui-core/...)

**File:** `specs/tui/packages/ui-core/src/hooks/workspaces/useSuspendWorkspace.ts`

**Known bugs (must be fixed by `tui-workspace-data-hooks` ticket):**
1. **Line 18:** `mutationFn: async (workspaceId, { fetch })` — second param is `AbortSignal` per `useMutation`, not `{ fetch }`
2. **Line 29:** passes `onRevert` callback — `useMutation` has no `onRevert` field (only `onOptimistic`, `onSuccess`, `onError`, `onSettled`)
3. Generic order: `useMutation<Workspace, string>` should be `useMutation<string, Workspace>` (input, output)

### `useMutation` (actual implementation)

**File:** `specs/tui/packages/ui-core/src/hooks/internal/useMutation.ts`

**Signature:**
```typescript
interface MutationConfig<TInput, TOutput> {
  mutationFn: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
  onOptimistic?: (input: TInput) => void;
  onSuccess?: (output: TOutput, input: TInput) => void;
  onError?: (error: HookError, input: TInput) => void;
  onSettled?: (input: TInput) => void;
}
```

**No `onRevert` field** — confirms the bug in `useSuspendWorkspace`/`useResumeWorkspace`.

### Workspace types

**File:** `specs/tui/packages/ui-core/src/types/workspaces.ts`

```typescript
type WorkspaceStatus = "pending" | "starting" | "running" | "suspended" | "stopped" | "failed";

interface Workspace {
  id: string;
  name: string;
  status: WorkspaceStatus;
  suspended_at: string | null;
  // ... other fields
}

interface WorkspaceStatusEvent {
  workspace_id: string;
  status: WorkspaceStatus;
}
```

### WorkspaceDisplayStatus (extended for optimistic updates)

**File:** `specs/tui/apps/tui/src/components/WorkspaceStatusBadge.tsx` (line 19-30)

```typescript
export type WorkspaceDisplayStatus =
  | "pending" | "starting" | "running" | "stopping"
  | "suspending" | "suspended" | "resuming"
  | "stopped" | "deleted" | "error" | "failed";
```

This is the type the `useWorkspaceSuspendResume` hook should use for status transitions.

---

## 7. Server Endpoints (Verified)

**File:** `apps/server/src/routes/workspaces.ts`

### Suspend endpoint (lines 162-178)
```
POST /api/repos/:owner/:repo/workspaces/:id/suspend
→ 200: WorkspaceResponse (updated workspace)
→ 400: { message: "workspace id is required" }
→ 404: { message: "workspace not found" }
→ 500: handleServiceError (catches service exceptions)
```

### Resume endpoint (lines 180-196)
```
POST /api/repos/:owner/:repo/workspaces/:id/resume
→ 200: WorkspaceResponse (updated workspace)
→ 400: { message: "workspace id is required" }
→ 404: { message: "workspace not found" }
→ 500: handleServiceError
```

### SSE stream endpoint (lines 447-482)
```
GET /api/repos/:owner/:repo/workspaces/:id/stream
→ SSE stream with:
  - Initial event: { type: "workspace.status", data: { workspace_id, status } }
  - Live events via PostgreSQL NOTIFY on channel workspace_status_{uuid_no_dashes}
  - Keep-alive pings every 15s
```

---

## 8. Text Utilities Available

**File:** `apps/tui/src/util/text.ts` (61 lines)

- `truncateText(text, maxLength)` (lines 36-41) — truncates with `…` suffix. Used for workspace names (20 chars).
- `truncateRight(text, maxWidth)` (lines 24-28) — handles maxWidth ≤ 3 edge case. Used for status bar messages.
- `fitWidth(text, width, align)` (lines 30-34) — pad or truncate to exact width.
- `wrapText(text, width)` (lines 43-60) — word wrap for multi-line.

**Constants from `apps/tui/src/loading/constants.ts`:**
- `STATUS_BAR_ERROR_DURATION_MS = 5_000` (line 15) — used by LoadingProvider, NOT what the spec wants (spec wants 3s)
- `STATUS_BAR_ERROR_PADDING = 20` (line 33) — used for message width cap
- `ERROR_SUMMARY_MAX_LENGTH = 60` (line 30)

**Constants from `apps/tui/src/util/constants.ts`:**
- `STATUS_BAR_CONFIRMATION_MS = 3_000` (line 43) — exists but currently only used for auth confirmation. This matches the spec's 3s requirement.

---

## 9. Navigation System Context

**File:** `apps/tui/src/providers/NavigationProvider.tsx` (194 lines)

- `useNavigation()` returns `NavigationContext` with `repoContext: { owner, repo } | null`
- `repoContext` extracted by walking the stack backwards
- Workspace screens set `requiresRepo: false` (lines 29-33, 143-148 in registry)
- But workspace list screen is top-level, no repo context needed — workspaces are per-user
- **Important:** Suspend/resume API calls need `owner` and `repo` — but workspace endpoints are at `/api/repos/:owner/:repo/workspaces/:id/suspend`. This means workspace list may need to carry repo context per workspace row (each workspace belongs to a repo).

---

## 10. Screen Registry — Workspace Screens

**File:** `apps/tui/src/router/registry.ts`

- `ScreenName.Workspaces` → PlaceholderScreen, `requiresRepo: false` (line 29-34)
- `ScreenName.WorkspaceDetail` → PlaceholderScreen, `requiresRepo: false` (line 143-148)
- `ScreenName.WorkspaceCreate` → PlaceholderScreen, `requiresRepo: false` (line 149-154)

All use PlaceholderScreen — screens must be built before suspend/resume integration.

---

## 11. Theme Token Mapping for Workspace Statuses

**File:** `apps/tui/src/theme/tokens.ts`

`statusToToken()` function (line 209-256) maps status strings to theme tokens:
- `"running"` → `"success"` (green)
- `"suspended"` → `"warning"` (yellow)
- `"pending"`, `"syncing"` → `"warning"` (yellow)
- `"failed"`, `"stopped"` → `"error"` (red)

**WorkspaceStatusBadge** (specs file) maps:
- `"running"` → `success` (green), static dot
- `"suspending"` → `warning` (yellow), animated spinner
- `"suspended"` → `muted` (gray), static dot
- `"resuming"` → `warning` (yellow), animated spinner

---

## 12. E2E Test Infrastructure

**File:** `e2e/tui/helpers.ts` (491 lines)

### Key exports:
- `launchTUI(options?)` → `TUITestInstance`
- `TUITestInstance.sendKeys(...keys)` — 50ms delay between keys
- `TUITestInstance.waitForText(text, timeoutMs?)` — polls every 100ms, default 10s timeout
- `TUITestInstance.waitForNoText(text, timeoutMs?)` — polls for absence
- `TUITestInstance.snapshot()` → full terminal buffer string
- `TUITestInstance.getLine(n)` → specific row
- `TUITestInstance.resize(cols, rows)` — with 200ms settle delay
- `TERMINAL_SIZES` — `{ minimum: {80,24}, standard: {120,40}, large: {200,60} }`
- `WRITE_TOKEN` — `codeplane_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`
- `READ_TOKEN` — `codeplane_feedfacefeedfacefeedfacefeedfacefeedface`

### Workspace-specific helpers (specs):

**File:** `specs/tui/e2e/tui/helpers/workspaces.ts` (352 lines)

- `WORKSPACE_FIXTURES` — 6 deterministic workspace objects for all states
- `WORKSPACE_IDS` — UUID constants per status
- `launchTUIWithWorkspaceContext(options?)` — launches with `--screen workspaces`
- `waitForStatusTransition(terminal, from, to, options?)` — waits for status change
- `createWorkspaceStatusEvent(id, status)` — creates SSE event objects
- `createSSEInjectionFile()` — creates temp file for deterministic SSE testing
- `launchTUIWithSSEInjection(options?)` — launches TUI with SSE injection file
- `assertWorkspaceRow(terminal, line, expected)` — validates workspace row content
- `stripAnsi(str)` — removes ANSI escape codes
- `hasReverseVideo(str)` — checks for reverse video (focus indicator)

**File:** `specs/tui/e2e/tui/helpers/workspace-sse.ts` (83 lines)
- `createWorkspaceSSEEvent(id, status)` — wire format SSE event
- `createSSEInjectionFile()` — alternative SSE injection
- `waitForWorkspaceStatus(terminal, status)` — waits for capitalized status
- `assertConnectionIndicator(line, state)` — validates connection indicator

---

## 13. Spinner Hook

**File:** `apps/tui/src/hooks/useSpinner.ts` (178 lines)

- `useSpinner(active: boolean): string` — returns braille frame when active, `""` when inactive
- Module-level singleton with OpenTUI Timeline engine
- All spinners frame-synchronized (singleton animation)
- Per-caller gating: returns `""` even if other components are spinning
- Used by `WorkspaceStatusBadge` for transitional states (`suspending`, `resuming`)

---

## 14. SSE Adapter Architecture (Dependency)

**File:** `specs/tui/apps/tui/src/streaming/WorkspaceSSEAdapter.ts` (282 lines)

- Manages SSE connection with exponential backoff (1s → 30s)
- Connection states: `idle → connecting → connected → degraded → reconnecting → disconnected`
- Ticket-based auth (preferred) with bearer token fallback
- Deduplication via sliding window (1000 events)
- Keepalive monitoring (45s timeout)
- Dead connection detection (30s → degraded)

**Status:** Specified but not built. Suspend/resume works without it (HTTP response provides confirmed status).

---

## 15. Critical Implementation Notes

### a. 3s vs 5s message duration
The spec requires 3s auto-dismiss for workspace action messages. The existing `STATUS_BAR_ERROR_DURATION_MS` is 5s. The `STATUS_BAR_CONFIRMATION_MS` constant in `util/constants.ts` (line 43) is already 3s — reuse this for workspace messages.

### b. Per-workspace in-flight guard
The spec uses `useRef<Map<string, boolean>>` not `useState` — this avoids re-renders when guard state changes. The `useOptimisticMutation` hook uses a single `isLoadingRef` which doesn't support multiple workspaces.

### c. No AbortController for mutations
Both `useOptimisticMutation` (line 61) and the spec explicitly state mutations must complete even on unmount. No AbortController.

### d. Interim approach for broken ui-core hooks
The `useWorkspaceSuspendResume` hook accepts `suspendMutate` and `resumeMutate` as injected functions. During development, wire directly to API client. Once `tui-workspace-data-hooks` fixes the bugs, swap to `useSuspendWorkspace().mutate`.

### e. `repoContext` availability
Workspace screens have `requiresRepo: false` in the registry. The suspend/resume API needs `owner` and `repo`. Either:
- Each workspace carries `repository_id` and we need a lookup
- Or the workspace list screen manages `owner/repo` per workspace row
- Or workspace API endpoints get refactored to not require repo context

The spec assumes `owner` and `repo` are available — they come from `useNavigation().repoContext` or from the workspace data itself.

### f. Error reason extraction
The spec defines a switch on HTTP status code:
- 401 → "Session expired"
- 403 → "Permission denied"
- 404 → "Workspace not found"
- 409 → "Invalid state transition"
- 429 → "Rate limited" (with optional Retry-After)
- 500 → "Server error"
- Timeout/network → "Network error"

This is more nuanced than `useOptimisticMutation`'s generic 60-char truncation.

### g. Debug logging
The pattern from `LoadingProvider` (lines 215-230) emits JSON to stderr when `CODEPLANE_TUI_DEBUG=true`. The spec uses a simpler key=value format but the same env var gate.

---

## 16. File-by-File Dependencies Confirmed

| New File | Depends On |
|---|---|
| `workspaces/constants.ts` | None (pure constants) |
| `hooks/useWorkspaceStatusBar.ts` | `useLayout`, `truncateText`, `workspaces/constants` |
| `hooks/useWorkspaceSuspendResume.ts` | `useLoading`, `useWorkspaceStatusBar`, `workspaces/constants`, `WorkspaceDisplayStatus` type |
| `hooks/useWorkspaceSuspendResumeKeybindings.ts` | `keybinding-types`, `WorkspaceDisplayStatus`, `useWorkspaceSuspendResume`, `workspaces/constants` |
| `LoadingProvider.tsx` (mod) | No new deps |
| `loading/types.ts` (mod) | No new deps |
| `StatusBar.tsx` (mod) | `useLoading` (already imported) |
| `e2e/tui/workspaces.test.ts` | `helpers.ts`, `helpers/workspaces.ts` |

---

## 17. Test Patterns to Follow

From `e2e/tui/repository.test.ts` and `e2e/tui/app-shell.test.ts`:

1. **File existence:** `expect(existsSync(path)).toBe(true)`
2. **TypeScript compilation:** `run(["bun", "run", "check"])`
3. **Snapshot tests:** `expect(tui.snapshot()).toMatchSnapshot()`
4. **Text waiting:** `await tui.waitForText("text", timeout)`
5. **No-text waiting:** `await tui.waitForNoText("text", timeout)`
6. **Line inspection:** `const line = tui.getLine(tui.rows - 1)` for status bar
7. **Regex on lines:** `expect(line).toMatch(/pattern/)`
8. **Snapshot comparison for no-op:** Compare before/after snapshots
9. **Navigation:** `await tui.sendKeys("g", "w")` for go-to workspaces
10. **Cleanup:** `afterEach(async () => { await tui?.terminate(); })`
11. **Import:** `import { describe, test, expect, afterEach } from "bun:test"`

Tests that fail due to unimplemented backends are left failing — never skipped or commented out.