# Research: `tui-workspace-detail-view` — Multi-tab workspace detail view

## 1. Engineering Spec

**File:** `/Users/williamcory/codeplane/specs/tui/engineering/tui-workspace-detail-view.md`  
**Status:** Empty file (path-only, no content yet). The spec needs to be written.

---

## 2. Feature Mapping

**Feature ID:** `TUI_WORKSPACE_DETAIL_VIEW` (from `specs/tui/features.ts` line 108)  
**Feature Group:** `TUI_WORKSPACES` (lines 106-113)  
**Sibling features:** `TUI_WORKSPACE_LIST_SCREEN`, `TUI_WORKSPACE_CREATE_FORM`, `TUI_WORKSPACE_SUSPEND_RESUME`, `TUI_WORKSPACE_SSH_INFO`, `TUI_WORKSPACE_STATUS_STREAM`

---

## 3. Current State of Workspace Detail in Router

### Screen Registration
**File:** `apps/tui/src/router/registry.ts` lines 143-148  
```typescript
[ScreenName.WorkspaceDetail]: {
  component: PlaceholderScreen,
  requiresRepo: false,  // BUG: should be true per scaffold spec
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.workspaceId ? p.workspaceId.slice(0, 8) : "Workspace"),
}
```
**Known issue:** `requiresRepo` is `false` but should be `true`. The workspace API routes are all scoped to `/api/repos/:owner/:repo/workspaces/:id`.

### Screen Name Enum
**File:** `apps/tui/src/router/types.ts` line 30  
```typescript
WorkspaceDetail = "WorkspaceDetail",
```

### No Implementation Exists
- No `apps/tui/src/screens/Workspaces/` directory exists
- The `PlaceholderScreen` at `apps/tui/src/screens/PlaceholderScreen.tsx` (22 lines) just shows screen name + params

---

## 4. Dependency Tickets (Related Workspace Specs)

All 11 workspace engineering specs located at `specs/tui/engineering/`:

| Spec | What it provides | Status |
|------|-----------------|--------|
| `tui-workspace-screen-scaffold.md` | Registry fixes, param validation, `requiresRepo: true` | Not started |
| `tui-workspace-data-hooks.md` | `useWorkspace()`, `useWorkspaces()`, `useWorkspaceSessions()`, `useWorkspaceSSH()`, CRUD mutation hooks in `packages/ui-core/` | Partial (hooks have bugs) |
| `tui-workspace-list-screen.md` | `WorkspaceListScreen` with pagination + filtering | Not started |
| `tui-workspace-status-badge.md` | `WorkspaceStatusBadge` component with status→color mapping, animated spinner for transitional states | Not started |
| `tui-workspace-ssh-info.md` | `WorkspaceSSHPanel` component with token countdown, copy keybindings | Not started |
| `tui-workspace-suspend-resume.md` | `useWorkspaceSuspendResume` hook, `s`/`r` keybindings, optimistic updates | Not started |
| `tui-workspace-sse-adapter.md` | `WorkspaceSSEAdapter` class, `useWorkspaceStatusStream` hook, reconnection logic | Not started |
| `tui-workspace-status-stream.md` | SSE streaming integration for status updates | Not started |
| `tui-workspace-e2e-helpers.md` | `WORKSPACE_FIXTURES`, `launchTUIWithWorkspaceContext()`, `waitForStatusTransition()` | Not started |
| `tui-workspace-create-form.md` | `WorkspaceCreateScreen` form | Not started |
| `tui-workspace-detail-view.md` | **THIS TICKET** — Multi-tab detail view | Empty |

---

## 5. API Endpoints (Server Routes)

**File:** `apps/server/src/routes/workspaces.ts` (524 lines)

Endpoints consumed by the detail view:

| Method | Path | Purpose | Line |
|--------|------|---------|------|
| `GET` | `/api/repos/:owner/:repo/workspaces/:id` | Get workspace detail | 127-138 |
| `GET` | `/api/repos/:owner/:repo/workspaces/:id/ssh` | SSH connection info | 141-160 |
| `POST` | `/api/repos/:owner/:repo/workspaces/:id/suspend` | Suspend workspace | 163-178 |
| `POST` | `/api/repos/:owner/:repo/workspaces/:id/resume` | Resume workspace | 181-196 |
| `DELETE` | `/api/repos/:owner/:repo/workspaces/:id` | Delete workspace | 199-208 |
| `POST` | `/api/repos/:owner/:repo/workspaces/:id/fork` | Fork workspace | 211-236 |
| `POST` | `/api/repos/:owner/:repo/workspaces/:id/snapshot` | Create snapshot | 239-264 |
| `GET` | `/api/repos/:owner/:repo/workspaces/:id/stream` | SSE status stream | 447-482 |
| `GET` | `/api/repos/:owner/:repo/workspace/sessions` | List sessions | 392-408 |
| `POST` | `/api/repos/:owner/:repo/workspace/sessions` | Create session | 348-375 |
| `GET` | `/api/repos/:owner/:repo/workspace/sessions/:id/ssh` | Session SSH info | 411-426 |
| `POST` | `/api/repos/:owner/:repo/workspace/sessions/:id/destroy` | Destroy session | 429-438 |

**Note:** All routes have `repositoryID = 0` and `userID = 0` (TODO: from middleware). Integration tests are expected to fail.

---

## 6. Data Types

### UI-Core Types (canonical for TUI)
**File:** `specs/tui/packages/ui-core/src/types/workspaces.ts` (113 lines)

```typescript
type WorkspaceStatus = "pending" | "starting" | "running" | "suspended" | "stopped" | "failed";
type WorkspaceSessionStatus = "running" | "stopped" | "failed";

interface Workspace {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  status: WorkspaceStatus;
  is_fork: boolean;
  parent_workspace_id?: string;
  freestyle_vm_id: string;
  persistence: string;
  ssh_host?: string;
  snapshot_id?: string;
  idle_timeout_seconds: number;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkspaceSession {
  id: string;
  workspace_id: string;
  repository_id: number;
  user_id: number;
  status: WorkspaceSessionStatus;
  cols: number;
  rows: number;
  last_activity_at: string;
  idle_timeout_secs: number;
  created_at: string;
  updated_at: string;
}

interface WorkspaceSSHInfo {
  workspace_id: string;
  session_id: string;
  vm_id: string;
  host: string;
  ssh_host: string;
  username: string;
  port: number;
  access_token: string;
  command: string;
}

interface WorkspaceSnapshot {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  workspace_id?: string;
  freestyle_snapshot_id: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceStatusEvent {
  workspace_id: string;
  status: WorkspaceStatus;
}
```

### SDK Response Types
**File:** `packages/sdk/src/services/workspace.ts` lines 60-113  
Mirrors UI-core types but `status` is `string` (not a union). The TUI types narrow this.

---

## 7. SSE Streaming Contract

**Workspace SSE stream** (`apps/server/src/routes/workspaces.ts` lines 447-482):
- Endpoint: `GET /api/repos/:owner/:repo/workspaces/:id/stream`
- Channel: `workspace_status_{workspaceId}` (UUID without dashes)
- Event type: `workspace.status`
- Payload: `{ workspace_id: string, status: string }`
- Initial event: sends current workspace status on connect
- Uses PostgreSQL LISTEN/NOTIFY

**Session SSE stream** (lines 487-522):
- Endpoint: `GET /api/repos/:owner/:repo/workspace/sessions/:id/stream`
- Channel: `workspace_status_{sessionId}` (UUID without dashes)
- Event type: `workspace.session`
- Payload: `{ session_id: string, status: string }`

---

## 8. Component Architecture Patterns (Established in Codebase)

### Screen Component Pattern
**Interface:** `ScreenComponentProps` (`apps/tui/src/router/types.ts` lines 83-88)
```typescript
interface ScreenComponentProps {
  entry: ScreenEntry;
  params: Record<string, string>;
}
```

Screens receive `entry` (with `id`, `screen`, `params`, `breadcrumb`) and convenience `params`.

### Directory Structure Pattern (from Agents screen)
```
apps/tui/src/screens/Agents/
├── types.ts                    — Domain types
├── components/
│   ├── MessageBlock.tsx        — Sub-components
│   ├── ToolBlock.tsx
│   └── index.ts               — Barrel export
└── utils/
    └── formatTimestamp.ts      — Utility functions
```

### Expected Workspace Detail Structure (from SSH info spec § 3.1)
```
WorkspaceDetailScreen (parent)
├── WorkspaceMetadata (name, status, persistence, idle timeout)
├── WorkspaceSSHPanel (SSH connection details — separate ticket)
│   ├── SSHInfoPlaceholder (when status ≠ "running")
│   └── SSH fields (when running + data loaded)
└── WorkspaceActions (suspend, delete — separate ticket)
```

### Data Hook Pattern
**File:** `apps/tui/src/hooks/useRepoFetch.ts` (113 lines)  
**File:** `apps/tui/src/hooks/useBookmarks.ts` (112 lines)  
**File:** `apps/tui/src/hooks/useRepoTree.ts` (107 lines)

All follow the same pattern:
- Accept options with `owner`, `repo`, `enabled`
- Use `useRepoFetch()` for authenticated GET requests
- Manage `{ data, isLoading, error }` state
- Return `refetch()` callback
- Use `AbortController` for request cancellation on unmount
- Convert errors via `toLoadingError()`

### Keybinding Registration Pattern
**File:** `apps/tui/src/hooks/useScreenKeybindings.ts` (55 lines)
```typescript
useScreenKeybindings([
  { key: "j", description: "Navigate down", group: "Navigation", handler: moveDown },
  { key: "k", description: "Navigate up",   group: "Navigation", handler: moveUp },
  { key: "Enter", description: "Open",       group: "Actions",    handler: open },
]);
```
Registers PRIORITY.SCREEN scope on mount, auto-generates status bar hints from first 8 bindings.

### Optimistic Mutation Pattern
**File:** `apps/tui/src/hooks/useOptimisticMutation.ts` (93 lines)
```typescript
const { execute, isLoading } = useOptimisticMutation({
  id: "workspace-suspend",
  entityType: "workspace",
  action: "suspend",
  mutate: (args) => api.post(...),
  onOptimistic: (args) => setLocalStatus("suspending"),
  onRevert: (args) => setLocalStatus(previousStatus),
  onSuccess: (args) => { /* SSE will confirm */ },
});
```

---

## 9. Layout & Responsive System

**File:** `apps/tui/src/hooks/useLayout.ts` (110 lines)

`useLayout()` returns:
- `width`, `height` — raw terminal dimensions
- `breakpoint` — `"minimum"` | `"standard"` | `"large"` | `null` (unsupported)
- `contentHeight` — `height - 2` (header + status bar)
- `sidebarVisible`, `sidebarWidth` — for sidebar+main layouts
- `modalWidth`, `modalHeight` — for overlay sizing

**Breakpoints** (from `apps/tui/src/types/breakpoint.ts`):
- `null`: < 80×24 (show "terminal too small")
- `"minimum"`: 80×24 – 119×39 (collapse sidebar, truncate)
- `"standard"`: 120×40 – 199×59 (full layout)
- `"large"`: 200×60+ (wider panels)

---

## 10. Theme System

**File:** `apps/tui/src/theme/tokens.ts`

Semantic tokens used by workspace components:
- `theme.primary` — focused items, links
- `theme.success` — running status (green)
- `theme.warning` — pending/starting/transitional states (yellow)
- `theme.error` — failed/stopped (red)
- `theme.muted` — suspended, secondary text (gray)
- `theme.border` — box borders
- `theme.surface` — modal backgrounds

### Workspace Status Badge Mapping (from status-badge spec § 3.2)
| Status | Token | Icon | Animated |
|--------|-------|------|----------|
| `running` | `success` | `●` | No |
| `starting` | `warning` | spinner | Yes |
| `stopping` | `warning` | spinner | Yes |
| `suspending` | `warning` | spinner | Yes |
| `resuming` | `warning` | spinner | Yes |
| `suspended` | `muted` | `●` | No |
| `pending` | `warning` | spinner | Yes |
| `stopped` | `muted` | `○` | No |
| `failed` | `error` | `✗` | No |

---

## 11. Navigation System

**File:** `apps/tui/src/providers/NavigationProvider.tsx` (193 lines)

Stack-based navigation with:
- `push(screen, params)` — auto-inherits repo context from parent
- `pop()` — go back
- `replace(screen, params)` — swap current screen
- `reset(screen, params)` — clear stack, new root
- `repoContext` — extracted from stack ancestry
- Scroll position cache per screen entry
- Max stack depth: 32

The workspace list screen would `push(ScreenName.WorkspaceDetail, { workspaceId })` to navigate to detail.

---

## 12. Existing Components Available for Composition

**File:** `apps/tui/src/components/index.ts` (17 lines) — 12 shared components:

| Component | Purpose |
|-----------|--------|
| `AppShell` | Header + content + status bar wrapper |
| `HeaderBar` | Breadcrumb navigation |
| `StatusBar` | Keybinding hints + sync status |
| `ErrorBoundary` | Top-level error boundary |
| `TerminalTooSmallScreen` | Min-size fallback |
| `GlobalKeybindings` | Global key handler |
| `FullScreenLoading` | Loading spinner for initial data fetch |
| `FullScreenError` | Error display with retry hint |
| `SkeletonList` | Skeleton for list loading states |
| `SkeletonDetail` | Skeleton for detail loading states |
| `PaginationIndicator` | "Loading more..." at list bottom |
| `ActionButton` | Button with loading/disabled states |
| `OverlayLayer` | Modal rendering layer |

---

## 13. SSE Provider (Current Stub)

**File:** `apps/tui/src/providers/SSEProvider.tsx` (16 lines)
```typescript
// Currently a stub — returns null
export function useSSE(channel: string) {
  return null;
}
```
SSE is stubbed. The `tui-workspace-sse-adapter` spec describes the real implementation with `WorkspaceSSEAdapter` class, `useWorkspaceStatusStream` hook, exponential backoff, and event deduplication.

---

## 14. API Client & Auth

**File:** `apps/tui/src/providers/APIClientProvider.tsx`  
Provides `useAPIClient()` returning `{ baseUrl: string, token: string }`.

**File:** `apps/tui/src/hooks/useRepoFetch.ts` (113 lines)  
Provides authenticated `get<T>(path)` method with `Authorization: Bearer {token}` header.

**Auth flow:** Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var. TUI does not do its own OAuth.

---

## 15. Loading State System

**File:** `apps/tui/src/loading/types.ts` (150 lines)

Types:
- `ScreenLoadingStatus`: `"idle" | "loading" | "error" | "timeout"`
- `LoadingError`: `{ type: "network" | "timeout" | "http_error" | "auth_error" | "rate_limited", httpStatus?: number, summary: string }`
- `ActionStatus`: `"idle" | "loading" | "success" | "error"`
- `MutationState`: tracking for optimistic mutations

`LoadingContextValue` provides `registerLoading`, `completeLoading`, `failLoading`, `registerMutation`, etc.

---

## 16. Test Infrastructure

### E2E Test File (Not Yet Created)
**Expected file:** `e2e/tui/workspaces.test.ts`  
**Currently:** Does NOT exist in `e2e/tui/`. A template exists at `specs/tui/e2e/tui/workspaces.test.ts`.

### Test Helpers
**File:** `e2e/tui/helpers.ts` (492 lines)

Key exports:
- `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN` — paths
- `API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG` — test constants
- `TERMINAL_SIZES` — `{ minimum: {80,24}, standard: {120,40}, large: {200,60} }`
- `TUITestInstance` — interface with `sendKeys()`, `sendText()`, `waitForText()`, `waitForNoText()`, `snapshot()`, `getLine()`, `resize()`, `terminate()`
- `LaunchTUIOptions` — `{ cols?, rows?, env?, args?, launchTimeoutMs? }`
- `createTestCredentialStore(token?)` — temp credential store for test isolation
- `createMockAPIEnv(options?)` — mock API environment
- `launchTUI(options?)` — spawns real TUI process in PTY via `@microsoft/tui-test`
- `run(cmd[])`, `bunEval(expression)` — subprocess helpers

### Workspace E2E Helpers (Specified, Not Built)
**Spec file:** `specs/tui/engineering/tui-workspace-e2e-helpers.md`

Key exports to be created:
- `WORKSPACE_IDS` — deterministic UUIDs for 6 workspace statuses
- `WORKSPACE_FIXTURES` — deterministic workspace objects
- `createWorkspaceFixture(overrides)` — factory function
- `launchTUIWithWorkspaceContext(options)` — launches with workspace screen pre-navigated
- `waitForStatusTransition(terminal, from, to)` — two-phase status wait
- `createWorkspaceStatusEvent(id, status)` — SSE event construction
- `createSSEInjectionFile()` — file-based SSE event injection

### Existing Test Patterns
**File:** `e2e/tui/agents.test.ts` (4331 lines) — Fixture-based tests with navigation helpers  
**File:** `e2e/tui/repository.test.ts` (610 lines) — Hook export tests, bunEval, responsive snapshot tests  
**File:** `e2e/tui/app-shell.test.ts` (5438 lines) — Package scaffold, TypeScript compilation, E2E infra tests

Pattern: define fixtures → create navigation helpers → use `launchTUI()` → `sendKeys()` → `waitForText()` → `snapshot()` → `terminate()`

---

## 17. Design Requirements (from TUI Design Spec)

### Tab Navigation (design.md § 1.4)
- `Tab` / `Shift+Tab` — cycle forward/backward through tabs
- `1`-`9` — jump to tab by number

### Detail View Component Pattern (design.md § 5.2)
```
<scrollbox>
  <box flexDirection="column" gap={1}>
    <DetailHeader title={item.title} status={item.status} />
    <DetailSection title="Description">
      <markdown>{item.body}</markdown>
    </DetailSection>
    <DetailSection title="Comments">
      {comments.map(c => <Comment key={c.id} {...c} />)}
    </DetailSection>
  </box>
</scrollbox>
```

### Workspace Detail Tabs (inferred from PRD + other specs)
The detail view should have tabs for:
1. **Overview** — workspace metadata, status, configuration
2. **SSH** — connection info panel (separate component from `tui-workspace-ssh-info`)
3. **Sessions** — active/past workspace sessions list
4. **Snapshots** — workspace snapshots list

---

## 18. Keybindings for Workspace Detail (from suspend-resume spec § 2.1)

| Key | Action | Condition |
|-----|--------|-----------|
| `s` | Suspend workspace | Status is `running` |
| `r` | Resume workspace | Status is `suspended` |
| `R` | Refresh workspace data | Always |
| `d` | Delete workspace | Confirmation overlay |
| `c` | Copy SSH command | Status is `running`, SSH tab |
| `y` | Copy SSH host | Status is `running`, SSH tab |
| `Tab` / `Shift+Tab` | Cycle tabs | Always |
| `1`-`4` | Jump to tab | Always |
| `q` / `Esc` | Go back to list | Always |

---

## 19. Key Files Summary

### Files to CREATE
```
apps/tui/src/screens/Workspaces/
├── WorkspaceDetailScreen.tsx        — Main detail screen component
├── types.ts                         — Local types (tabs, display status)
├── constants.ts                     — Tab definitions, keybinding config
├── index.ts                         — Barrel export
├── components/
│   ├── WorkspaceOverviewTab.tsx     — Overview tab content
│   ├── WorkspaceSessionsTab.tsx     — Sessions list tab
│   ├── WorkspaceSnapshotsTab.tsx    — Snapshots list tab
│   └── index.ts                     — Barrel
└── hooks/
    ├── useWorkspaceDetail.ts        — Fetch single workspace
    └── useWorkspaceDetailKeybindings.ts — Screen keybindings
```

### Files to MODIFY
```
apps/tui/src/router/registry.ts      — Replace PlaceholderScreen with WorkspaceDetailScreen
e2e/tui/workspaces.test.ts           — Create with detail view tests
apps/tui/src/components/index.ts     — Add WorkspaceStatusBadge export (if badge built)
```

### Files to READ (established patterns)
```
apps/tui/src/hooks/useRepoFetch.ts           — Auth fetch pattern
apps/tui/src/hooks/useBookmarks.ts           — Data hook with pagination pattern
apps/tui/src/hooks/useScreenKeybindings.ts   — Keybinding registration
apps/tui/src/hooks/useOptimisticMutation.ts  — Optimistic mutation pattern
apps/tui/src/hooks/useLayout.ts              — Responsive layout
apps/tui/src/providers/NavigationProvider.tsx — Navigation stack
apps/tui/src/components/StatusBar.tsx        — Theme + hints usage
apps/tui/src/components/HeaderBar.tsx        — Breadcrumb rendering
apps/tui/src/screens/Agents/types.ts         — Screen type definitions
e2e/tui/helpers.ts                           — Test infrastructure
```

---

## 20. Known Issues & Risks

1. **`requiresRepo: false` bug** — `WorkspaceDetail` and `WorkspaceCreate` must be changed to `requiresRepo: true` (registry.ts lines 143-154). Without this, repo context won't be inherited from the navigation stack.

2. **SSE Provider is stubbed** — `useSSE()` returns `null`. Real-time status streaming won't work until `tui-workspace-sse-adapter` is built.

3. **Data hooks have bugs** — `useWorkspaces` and `useWorkspaceSessions` in `packages/ui-core/` have broken `parseResponse` signatures, missing `client` params, and wrong `useMutation` generic order (documented in `tui-workspace-data-hooks.md` § 2).

4. **Server routes hardcode IDs** — All workspace routes use `repositoryID = 0` and `userID = 0`. Integration tests will fail until middleware is wired.

5. **No workspace directory** — `apps/tui/src/screens/Workspaces/` doesn't exist yet. The detail view is the first screen implementation for this domain.

6. **Dependency chain** — The detail view depends on: `tui-workspace-screen-scaffold`, `tui-workspace-data-hooks`, `tui-workspace-status-badge`, `tui-workspace-ssh-info`, `tui-workspace-suspend-resume`, `tui-workspace-sse-adapter`, `tui-workspace-e2e-helpers`. All are specified but unbuilt.