# Research: tui-workflow-artifacts-view

## Ticket Summary

Implement the Workflow Artifacts View screen for the Codeplane TUI — a full-screen artifact browser for a specific workflow run. The screen includes a scrollable artifact list with filtering/sorting, a detail overlay modal, CLI-delegated download, and a delete confirmation dialog with optimistic removal.

## 1. Feature Specification

**Feature ID:** `TUI_WORKFLOW_ARTIFACTS_VIEW` (line 123 of `specs/tui/features.ts`)

**Full spec:** `specs/tui/TUI_WORKFLOW_ARTIFACTS_VIEW.md` (437 lines)

**Engineering spec:** `specs/tui/engineering/tui-workflow-artifacts-view.md` — **currently empty** (needs to be written)

The spec defines:
- Full-screen list view of artifacts for a single workflow run
- Title row: "Artifacts (N)" + total combined size
- Filter toolbar: text search + status filter cycling (All → Ready → Pending → Expired)
- Sort cycling: Created ↓ → Created ↑ → Name A-Z → Name Z-A → Size ↓ → Size ↑
- Artifact detail overlay (modal, 60% × 50%)
- Delete confirmation overlay (modal, 40% × 25%, error-colored border)
- Download delegation to CLI: `codeplane artifact download <runId> <name> --repo owner/repo`
- Responsive column layouts at 80×24, 120×40, 200×60+
- 122 total e2e tests (30 snapshot, 42 keyboard, 14 responsive, 22 integration, 14 edge case)

## 2. Key Source Files — Types & Data Hooks

### 2.1 WorkflowArtifact Type

**File:** `specs/tui/apps/tui/src/hooks/workflow-types.ts` (lines 73-89)
```typescript
interface WorkflowArtifact {
  id: number;
  repository_id: number;
  workflow_run_id: number;
  name: string;
  size: number;
  content_type: string;
  status: "pending" | "ready";
  gcs_key: string;
  confirmed_at: string | null;
  expires_at: string | null;
  release_tag: string | null;
  release_asset_name: string | null;
  release_attached_at: string | null;
  created_at: string;
  updated_at: string;
}
```
**Constant:** `MAX_ARTIFACTS = 200` (line 172)

### 2.2 useWorkflowRunArtifacts Hook

**File:** `specs/tui/apps/tui/src/hooks/useWorkflowRunArtifacts.ts` (22 lines)
- Endpoint: `GET /api/repos/:owner/:repo/actions/runs/:runId/artifacts`
- Returns: `QueryResult<WorkflowArtifact[]>`
- Client-side cap at MAX_ARTIFACTS (200)
- Uses `useQuery` hook from `./useQuery.js`
- Transform: `res?.artifacts || []`, sliced to cap

### 2.3 useDeleteWorkflowArtifact Mutation Hook

**File:** `specs/tui/apps/tui/src/hooks/useWorkflowActions.ts` (lines 149-196)
- Input: `{ runId: number; name: string }`
- Endpoint: `DELETE /api/repos/:owner/:repo/actions/runs/:runId/artifacts/:name`
- Returns: `MutationResult<{ runId: number; name: string }, void>`
- Supports optimistic removal with rollback on error
- Callbacks: `onOptimistic`, `onSuccess`, `onError`
- Artifact name is URL-encoded: `encodeURIComponent(args.name)`

### 2.4 useQuery Base Hook

**File:** `specs/tui/apps/tui/src/hooks/useQuery.ts` (120 lines)
- Generic query hook using `@codeplane/ui-core` API client
- Handles abort controllers, error parsing, refetch counter
- Returns `QueryResult<T>` with `{ data, loading, error, refetch }`

### 2.5 QueryResult / MutationResult Types

**File:** `specs/tui/apps/tui/src/hooks/workflow-types.ts` (lines 121-147)
```typescript
interface QueryResult<T> { data: T | null; loading: boolean; error: HookError | null; refetch: () => void; }
interface MutationResult<TInput, TOutput = void> { execute: (input: TInput) => Promise<TOutput>; loading: boolean; error: HookError | null; reset: () => void; }
```

## 3. API Endpoints (Currently Stubbed)

**File:** `apps/server/src/routes/workflows.ts` (lines 964-998)

| Endpoint | Method | Current Status |
|----------|--------|---------------|
| `/api/repos/:owner/:repo/actions/runs/:id/artifacts` | GET | Stubbed — returns `{ artifacts: [] }` |
| `/api/repos/:owner/:repo/actions/runs/:id/artifacts/:name/download` | GET | Stubbed — returns 404 |
| `/api/repos/:owner/:repo/actions/runs/:id/artifacts/:name` | DELETE | Stubbed — returns 204 |

### 3.1 Database Layer

**File:** `apps/server/src/db/workflow_artifacts_sql.ts`
- `listWorkflowArtifactsByRun(sql, { workflowRunId })` → returns full artifact rows
- `deleteWorkflowArtifact(sql, { name, workflowRunId })` → deletes by name and run
- DB row type includes: id, repositoryId, workflowRunId, name, size, contentType, status, gcsKey, confirmedAt, expiresAt, releaseTag, releaseAssetName, releaseAttachedAt, createdAt, updatedAt

## 4. CLI Download Command Pattern

**File:** `apps/cli/src/commands/artifact.ts` (88 lines)

TUI download should delegate to:
```
codeplane artifact download <runId> <name> --repo owner/repo --output <name>
```

CLI flow:
1. `GET /api/repos/.../artifacts/:name/download` → returns `{ download_url, ...metadata }`
2. Streams download from `download_url` to filesystem
3. Returns `{ name, path, size, content_type }`

## 5. Existing Infrastructure Components

### 5.1 Overlay/Modal System

**OverlayManager:** `apps/tui/src/providers/OverlayManager.tsx` (162 lines)
- Manages overlay state: `activeOverlay`, `openOverlay(type, payload)`, `closeOverlay()`, `isOpen(type)`
- Registers PRIORITY.MODAL keybinding scope with Escape dismiss
- Overrides status bar hints while overlay active
- Handles `ConfirmPayload` with title/message/callbacks

**Overlay Types:** `apps/tui/src/providers/overlay-types.ts` (27 lines)
```typescript
type OverlayType = "help" | "command-palette" | "confirm";
interface ConfirmPayload {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}
```

**OverlayLayer:** `apps/tui/src/components/OverlayLayer.tsx` (91 lines)
- Renders absolutely-positioned box at zIndex=100
- Uses `layout.modalWidth` / `layout.modalHeight` for responsive sizing
- Shows confirm dialog with `confirmPayload.message` and labeled buttons

**useOverlay hook:** `apps/tui/src/hooks/useOverlay.ts` (36 lines)

**⚠ Design note:** The artifact detail overlay is NOT a `confirm` overlay — it's a custom modal. The OverlayManager currently only supports 3 types: "help", "command-palette", "confirm". The artifact screen will need either:
- A screen-local modal state (not using OverlayManager) with its own PRIORITY.MODAL scope
- Or extending OverlayType to support arbitrary overlays

### 5.2 Keybinding System

**KeybindingProvider:** `apps/tui/src/providers/KeybindingProvider.tsx` (165 lines)
- Priority dispatch: TEXT_INPUT(1) > MODAL(2) > GOTO(3) > SCREEN(4) > GLOBAL(5)
- `registerScope({ priority, bindings, active })` → returns scopeId
- `removeScope(id)` for cleanup

**useScreenKeybindings:** `apps/tui/src/hooks/useScreenKeybindings.ts` (56 lines)
- Registers at PRIORITY.SCREEN
- Auto-derives status bar hints from bindings
- Cleanup on unmount

**keybinding-types.ts:** `apps/tui/src/providers/keybinding-types.ts` (90 lines)
- `KeyHandler { key, description, group, handler, when? }`
- `StatusBarHint { keys, label, order? }`
- `PRIORITY = { TEXT_INPUT: 1, MODAL: 2, GOTO: 3, SCREEN: 4, GLOBAL: 5 }`

### 5.3 Layout System

**useLayout:** `apps/tui/src/hooks/useLayout.ts` (111 lines)
```typescript
interface LayoutContext {
  width: number;
  height: number;
  breakpoint: Breakpoint | null;
  contentHeight: number;  // height - 2
  sidebarVisible: boolean;
  sidebarWidth: string;
  modalWidth: string;   // "50%" | "60%" | "90%"
  modalHeight: string;  // "50%" | "60%" | "90%"
  sidebar: SidebarState;
}
```

### 5.4 Navigation System

**NavigationProvider:** `apps/tui/src/providers/NavigationProvider.tsx` (194 lines)
- Stack-based: `push(screen, params)`, `pop()`, `replace()`, `reset()`
- Extracts `repoContext` and `orgContext` from stack
- Scroll position caching per entry
- Duplicate prevention on push

**Router types:** `apps/tui/src/router/types.ts` (103 lines)
- `ScreenName` enum — includes `Workflows` and `WorkflowRunDetail`
- **Note:** No `WorkflowArtifacts` screen name exists — artifacts view is reached as a tab within `WorkflowRunDetail`, not a separate screen push
- `ScreenComponentProps { entry, params }`

**Registry:** `apps/tui/src/router/registry.ts` (208 lines)
- All screens currently map to `PlaceholderScreen`
- `Workflows` entry at line 119: `requiresRepo: true`, breadcrumb "Workflows"
- `WorkflowRunDetail` entry at line 125: breadcrumb `Run #${p.runId}`

### 5.5 Existing Components

| Component | File | Lines | Relevant Pattern |
|-----------|------|-------|------------------|
| ActionButton | `apps/tui/src/components/ActionButton.tsx` | 58 | Loading spinner, disabled state, border color |
| PaginationIndicator | `apps/tui/src/components/PaginationIndicator.tsx` | 60 | Loading/error inline indicator |
| SkeletonList | `apps/tui/src/components/SkeletonList.tsx` | 84 | Deterministic placeholder rows |
| AppShell | `apps/tui/src/components/AppShell.tsx` | 26 | Layout: HeaderBar → content → StatusBar → OverlayLayer |
| HeaderBar | `apps/tui/src/components/HeaderBar.tsx` | 51 | Breadcrumb, repo context, connection indicator |
| StatusBar | `apps/tui/src/components/StatusBar.tsx` | 96 | Hints, error messages, retry indicator |
| PlaceholderScreen | `apps/tui/src/screens/PlaceholderScreen.tsx` | 23 | Default for unimplemented screens |

### 5.6 Theme System

**tokens.ts:** `apps/tui/src/theme/tokens.ts` (263 lines)
- Semantic tokens: `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`
- `TextAttributes`: BOLD(1), DIM(2), UNDERLINE(4), REVERSE(8)
- `statusToToken()`: maps status strings → token names ("ready"→"success", "pending"→"warning")
- Three tiers: truecolor, ansi256, ansi16

### 5.7 Text Utilities

**text.ts:** `apps/tui/src/util/text.ts` (61 lines)
- `truncateRight(text, maxWidth)` → truncates with "…"
- `truncateBreadcrumb(segments, maxWidth)` → smart breadcrumb truncation
- `fitWidth(text, width, align)` → pad or truncate to exact width
- `truncateText(text, maxLength)` → generic truncation
- `wrapText(text, width)` → multi-line wrapping

### 5.8 Workflow Utils

**File:** `specs/tui/apps/tui/src/screens/Workflows/utils.ts` (156 lines)

Already implemented utilities that the artifacts view SHOULD reuse:
- `formatBytes(bytes)` → "0 B", "345 KB", "2.1 MB", "1.2 GB" (max 7ch)
- `formatRelativeTime(timestamp)` → "now", "3m", "2h", "5d", "2w", "1mo", "1y", "—"
- `getRunStatusIcon(status)` → `{ icon, fallback, color, bold, label }`
- `formatDuration(seconds)` → "5s", "2m 30s", "1h 15m"
- `abbreviateSHA(sha)` → 7-char prefix

### 5.9 Format Timestamp (Agents pattern)

**File:** `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` (34 lines)
- Breakpoint-aware: minimum→null, standard→"1m"/"1h"/"1d", large→"1 minute ago"
- Different from `formatRelativeTime` in Workflows utils (which is simpler, 4ch max)

## 6. Navigation Architecture for Artifacts

Per the spec, artifacts are accessed as a **tab within WorkflowRunDetail**, not a separate screen:
- User navigates: Workflows → Runs → Run Detail → press `a` → Artifacts tab
- Breadcrumb: "Dashboard > owner/repo > Workflows > ci > Run #42 > Artifacts"
- `q` pops back to run detail, not to a separate screen

The artifacts view is effectively a sub-view/tab of the WorkflowRunDetail screen. This means:
- No new `ScreenName` enum entry needed
- No new registry entry needed
- The WorkflowRunDetail screen component internally manages tab state
- The artifacts tab component handles its own keybindings, list state, and overlays

## 7. Overlay Architecture Decisions

### 7.1 Artifact Detail Overlay

The spec describes a centered modal (60% × 50%) with:
- Artifact metadata (name, type, size, status, timestamps, GCS path, release info)
- Action buttons: [D] Download, [x] Delete, [Esc] Close
- Scrollable if content exceeds viewport

**Design choice:** This is NOT an OverlayManager overlay. It should be managed via **component-local state** with a manually registered PRIORITY.MODAL keybinding scope:
1. `useState<WorkflowArtifact | null>(detailArtifact)` for detail visibility
2. Register modal keybinding scope when `detailArtifact !== null`
3. `Esc` → close detail, `D` → download, `x` → open delete confirmation
4. Remove scope on close

### 7.2 Delete Confirmation Overlay

This CAN use the existing OverlayManager `confirm` type:
```typescript
openOverlay("confirm", {
  title: "Delete artifact?",
  message: `Delete "${artifact.name}"? This cannot be undone.`,
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
  onConfirm: () => deleteArtifact({ runId, name: artifact.name }),
  onCancel: () => closeOverlay(),
});
```

However, the spec calls for an error-colored border (ANSI 196) and a spinner during API call, which the current OverlayLayer placeholder doesn't support. The implementation will need to either:
- Enhance OverlayLayer's confirm rendering with loading state and custom border color
- Or implement the delete confirmation as a screen-local modal alongside the detail overlay

## 8. Responsive Column Layouts

### 80×24 (minimum)
- icon (2ch) + name (fill−13) + size (7ch) + expiration (4ch)
- No column headers, no content type, no release indicator, no timestamp
- Compact toolbar (search only, no filter label)

### 120×40 (standard)
- icon (2ch) + name (30ch) + content type (18ch, truncated) + size (7ch) + expiration (4ch) + release (2ch) + timestamp (4ch)
- Column headers visible
- Full toolbar with labels

### 200×60+ (large)
- icon (2ch) + name (40ch) + content type (25ch) + size (7ch) + expiration (4ch) + release tag (15ch) + release indicator (2ch) + timestamp (4ch)
- All columns, wider name and content type

## 9. Artifact Status Icons

Per spec:
- Ready: `●` green (ANSI 34) — maps to `theme.success`
- Pending: `◎` yellow (ANSI 178) — maps to `theme.warning`
- Expired: `○` gray (ANSI 245) — maps to `theme.muted`

"Expired" is derived client-side: `artifact.expires_at !== null && new Date(artifact.expires_at) < now`

## 10. Files to Create

Based on the project's file structure patterns:

| File | Purpose |
|------|---------|
| `apps/tui/src/screens/Workflows/ArtifactsView.tsx` | Main artifacts tab component |
| `apps/tui/src/screens/Workflows/ArtifactRow.tsx` | Single artifact row component |
| `apps/tui/src/screens/Workflows/ArtifactDetailOverlay.tsx` | Detail modal overlay |
| `apps/tui/src/screens/Workflows/ArtifactDeleteConfirm.tsx` | Delete confirmation overlay |
| `apps/tui/src/screens/Workflows/artifact-utils.ts` | Artifact-specific formatters (expiration countdown, status derivation) |
| `e2e/tui/workflows.test.ts` | E2E tests (already partially exists in specs) |
| `specs/tui/engineering/tui-workflow-artifacts-view.md` | Engineering spec (to be written) |

## 11. Files to Modify

These existing files will likely need changes:

| File | Change |
|------|---------|
| `apps/tui/src/screens/Workflows/index.ts` | Export new artifact components |
| `apps/tui/src/screens/index.ts` | Barrel export for Workflows screen |
| `apps/tui/src/router/registry.ts` | Update WorkflowRunDetail to point to real component (if building run detail simultaneously) |

## 12. Dependencies & Prerequisites

The artifacts view depends on components and screens that are also currently `Partial`:

1. **WorkflowRunDetail screen** — artifacts is a tab within this screen. The run detail must exist for artifacts to be navigable.
2. **Modal component** — spec at `specs/tui/engineering/tui-modal-component.md` defines the reusable modal. Can be implemented inline for artifacts.
3. **List component** — spec at `specs/tui/engineering/tui-list-component.md` defines reusable list with vim navigation. Can be implemented inline for artifacts.
4. **Workflow data hooks** — already specified and defined in `specs/tui/apps/tui/src/hooks/`.
5. **Workflow utils** — already specified at `specs/tui/apps/tui/src/screens/Workflows/utils.ts` with `formatBytes`, `formatRelativeTime`.

## 13. E2E Test Patterns

**Test infrastructure:** `e2e/tui/helpers.ts` (380+ lines)
- `launchTUI(options)` → `TUITestInstance` with `sendKeys`, `waitForText`, `snapshot`, `resize`, `terminate`
- `TERMINAL_SIZES` — minimum (80×24), standard (120×40), large (200×60)
- `createTestCredentialStore(token)` — isolated auth for tests
- `createMockAPIEnv()` — configures test API endpoint

**Existing workflow test file:** `specs/tui/e2e/tui/workflows.test.ts` — already has `HOOK-WFRA-001` test (lines 210-227) for artifacts empty state.

**Test flow for artifacts:**
```typescript
const terminal = await launchTUI({
  cols: 120, rows: 40,
  args: ["--screen", "workflows", "--repo", "acme/api"],
});
await terminal.waitForText("Workflows");
await terminal.sendKeys("Enter");  // → Runs list
await terminal.waitForText("Runs");
await terminal.sendKeys("Enter");  // → Run detail
await terminal.waitForText("#");
await terminal.sendKeys("a");     // → Artifacts tab
await terminal.waitForText("No artifacts");
```

**Per spec, tests left failing if backend unimplemented — never skipped or commented out.**

## 14. Key Design Decisions

1. **No pagination needed** — All artifacts for a single run loaded in one request. Runs typically produce < 100 artifacts. Client-side cap at 200 with footer message.

2. **Client-side filtering only** — Status filter and search are applied client-side since all data is already loaded. No API calls on filter/search changes.

3. **Download via CLI subprocess** — The TUI spawns `codeplane artifact download` as a child process rather than downloading directly. This avoids implementing download URL handling and file I/O in the TUI.

4. **Sort preserves focus by ID** — When sort order changes, the focused artifact stays focused (matched by `artifact.id`, not list position).

5. **Optimistic delete** — Row removed immediately from the list. If the API call fails, the row is restored and an error appears in the status bar.

6. **"Expired" is a derived status** — The `WorkflowArtifact.status` field only has "pending" | "ready". Expired is computed client-side from `expires_at < now`.

7. **Detail overlay is screen-local** — Not managed by the global OverlayManager. Uses a component-local modal state with manual PRIORITY.MODAL scope registration.

## 15. Formatting Functions Needed

New utilities required (not in existing codebase):

### formatExpiration(expiresAt: string | null): { text: string; color: CoreTokenName }
- `null` → `{ text: "—", color: "muted" }`
- Future: "29d", "6h", "23m" → `{ text: "29d", color: "muted" }`
- Past: → `{ text: "exp", color: "error" }`
- Max 4 characters

### getArtifactStatusIcon(artifact: WorkflowArtifact): { icon: string; color: CoreTokenName }
- status === "ready" && not expired → `{ icon: "●", color: "success" }`
- status === "pending" → `{ icon: "◎", color: "warning" }`
- expired (expires_at < now) → `{ icon: "○", color: "muted" }`

### formatTotalSize(artifacts: WorkflowArtifact[]): string
- Sum all `artifact.size` values, format via `formatBytes`
- Max 10 characters (e.g., "1.23 GB", "456 MB")

## 16. Existing `formatBytes` implementation

**File:** `specs/tui/apps/tui/src/screens/Workflows/utils.ts` (lines 129-142)
```typescript
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / Math.pow(1024, exp);
  const unit = BYTE_UNITS[exp];
  if (exp === 0) return `${Math.floor(value)} ${unit}`;
  if (value < 10) return `${value.toFixed(1)} ${unit}`;
  return `${Math.floor(value)} ${unit}`;
}
```
Max output: 7 characters ("1.2 TB"). Handles TB+ for extremely large artifacts.

## 17. Security & Permission Patterns

| Action | Required Permission |
|--------|--------------------|
| View artifacts | Read access (public repos: any authenticated user) |
| Download artifact | Read access |
| Delete artifact | Write access |

- Read-only users see `x` keybinding hint dimmed and receive "Permission denied" on action
- Download URLs (signed GCS URLs) treated as secrets — never displayed in full
- 401 → auth error screen; 403 → status bar "Permission denied"; 429 → "Rate limited. Retry in {N}s."

## 18. Rate Limits

- GET artifacts list: 300 req/min
- DELETE operations: 60 req/min
- Download initiation: 30 req/min
- 429 responses show inline message, no auto-retry

## 19. Telemetry Events

14 distinct telemetry events defined in the spec, covering view, detail open, download, delete, filter/sort/search changes, errors, retries, and empty states. All include common properties: `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`.

## 20. Observability

- 18 log entries defined (debug/info/warn/error levels)
- Logs to stderr via `CODEPLANE_LOG_LEVEL` (default: warn)
- Includes structured key-value pairs: `[repo={r}] [run_id={id}] [count={n}]`

## 21. Summary of Key Architectural Patterns to Follow

1. **Component structure:** Functional React components with hooks, OpenTUI intrinsics (`<box>`, `<scrollbox>`, `<text>`, `<input>`)
2. **State management:** `useState` for local state, `useRef` for mutable values, `useMemo` for derived values
3. **Keybindings:** `useScreenKeybindings(bindings, hints)` for screen-level bindings at PRIORITY.SCREEN
4. **Modal keybindings:** Manual `keybindingCtx.registerScope({ priority: PRIORITY.MODAL, ... })` for overlay keybindings
5. **Layout:** `useLayout()` for responsive values, never duplicate breakpoint logic
6. **Theme:** `useTheme()` for color tokens, `statusToToken()` for status→color mapping
7. **Text:** `truncateRight()`, `fitWidth()`, `truncateText()` for column truncation
8. **Overlays:** OverlayManager for confirm dialogs, component-local state for custom modals
9. **Navigation:** `useNavigation()` for push/pop/replace, `entry.params` for screen parameters
10. **Loading:** `useScreenLoading()` for full-screen loading, inline loading states for actions