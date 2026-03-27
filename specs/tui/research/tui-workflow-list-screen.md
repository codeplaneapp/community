# Research: `tui-workflow-list-screen` — Workflow Definition List Screen

## 1. Ticket Summary

**Ticket:** `tui-workflow-list-screen`  
**Eng spec:** `specs/tui/engineering/tui-workflow-list-screen.md` (currently empty — only contains title line)  
**Feature flag:** `TUI_WORKFLOW_LIST_SCREEN` (in `TUI_WORKFLOWS` group, `specs/tui/features.ts:117`)  
**Screen name:** `ScreenName.Workflows` (already defined in `apps/tui/src/router/types.ts:25`)  
**Navigation:** `g f` go-to keybinding (already wired in `apps/tui/src/navigation/goToBindings.ts:20`, `requiresRepo: true`)  
**Deep link:** `--screen workflows` (already mapped in `apps/tui/src/navigation/deepLinks.ts:27`)  

## 2. Current State

### 2.1 Screen Registry
- **File:** `apps/tui/src/router/registry.ts:119-124`
- `ScreenName.Workflows` currently points to `PlaceholderScreen`
- `requiresRepo: true`, `requiresOrg: false`, breadcrumb: `"Workflows"`

### 2.2 Placeholder Screen
- **File:** `apps/tui/src/screens/PlaceholderScreen.tsx`
- Renders screen name + params in a basic box layout
- Must be replaced with the real `WorkflowListScreen` component

### 2.3 Screens Directory
- `apps/tui/src/screens/` currently contains:
  - `PlaceholderScreen.tsx`
  - `Agents/` (with `components/`, `types.ts`, `utils/formatTimestamp.ts`)
  - `index.ts` (barrel export)
- No `Workflows/` directory exists yet

## 3. Dependencies & Prerequisite Tickets

### 3.1 `tui-workflow-screen-scaffold` 
- **Spec:** `specs/tui/engineering/tui-workflow-screen-scaffold.md`
- Creates `apps/tui/src/screens/Workflows/` directory structure
- Adds 4 new `ScreenName` entries: `WorkflowRunList`, `WorkflowLogViewer`, `WorkflowArtifacts`, `WorkflowCaches`
- Creates placeholder screen components for all 6 workflow screens
- Updates registry imports
- **Status:** Not yet implemented (spec is complete)

### 3.2 `tui-workflow-data-hooks`
- **Spec:** `specs/tui/engineering/tui-workflow-data-hooks.md` (fully specified, ~600 lines)
- Provides `useWorkflowDefinitions()` hook — the primary data source for this screen
- Hook signature: `useWorkflowDefinitions(repo: RepoIdentifier, options?: { page?, perPage?, enabled? }): PaginatedQueryResult<WorkflowDefinition>`
- API endpoint: `GET /api/repos/:owner/:repo/workflows` → `{ workflows: WorkflowDefinition[], total_count? }`
- Uses `usePaginatedQuery` from a local `useQuery.ts` hook (not from ui-core, since ui-core doesn't exist as a package)
- Shared types defined in `apps/tui/src/hooks/workflow-types.ts` (spec complete)
- **Status:** Not yet implemented (spec is complete)

### 3.3 `tui-workflow-ui-utils`
- **Spec:** `specs/tui/engineering/tui-workflow-ui-utils.md` (fully specified, ~600 lines)
- Provides: `getRunStatusIcon()`, `getMiniStatusBar()`, `formatDuration()`, `formatRelativeTime()`, `abbreviateSHA()`, `formatRunCount()`, `getDurationColor()`, `formatBytes()`, plus no-color variants
- Location: `apps/tui/src/screens/Workflows/utils.ts`
- **Mini status bar** is critical for the list screen — generates 5-character colored dot array from recent runs
- **Status:** Not yet implemented (spec is complete)

## 4. API Contract

### 4.1 List Workflow Definitions
- **Endpoint:** `GET /api/repos/:owner/:repo/workflows`
- **Server location:** `apps/server/src/routes/workflows.ts:469-477`
- **Pagination:** `page` (1-based) and `per_page` (default 30, max 100) query params
- **Response:** `{ workflows: WorkflowDefinition[] }`
- **Server calls:** `workflowService.listWorkflowDefinitions(repositoryID, page, limit)`

### 4.2 WorkflowDefinition Type
```typescript
interface WorkflowDefinition {
  id: number;
  repository_id: number;
  name: string;          // Display name
  path: string;          // File path (e.g., ".codeplane/workflows/ci.ts")
  config: unknown;       // WorkflowTriggerConfig (opaque to UI)
  is_active: boolean;
  created_at: string;    // ISO 8601
  updated_at: string;
}
```

### 4.3 Per-Definition Runs Endpoint (for mini status bar)
- **Endpoint:** `GET /api/repos/:owner/:repo/workflows/:id/runs`
- **Server location:** `apps/server/src/routes/workflows.ts:491-513`
- **Response:** `{ workflow_runs: WorkflowRun[] }`
- Used to fetch last 5 runs per workflow for the mini status bar display

### 4.4 WorkflowRun Type
```typescript
interface WorkflowRun {
  id: number;
  repository_id: number;
  workflow_definition_id: number;
  status: WorkflowRunStatus; // "queued" | "running" | "success" | "failure" | "cancelled" | "error"
  trigger_event: string;
  trigger_ref: string;
  trigger_commit_sha: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  workflow_name?: string;  // Enriched from v2 endpoint
  workflow_path?: string;
}
```

## 5. Architecture Patterns to Follow

### 5.1 Screen Component Pattern
- **Props:** `ScreenComponentProps` from `apps/tui/src/router/types.ts:83-88`
  - `entry: ScreenEntry` (id, screen, params, breadcrumb)
  - `params: Record<string, string>`
- **Repo context:** Access via `useNavigation().repoContext` → `{ owner, repo }`
- **Keybindings:** Register via `useScreenKeybindings()` from `apps/tui/src/hooks/useScreenKeybindings.ts`
- **Loading:** Use `useScreenLoading()` from `apps/tui/src/hooks/useScreenLoading.ts`

### 5.2 Loading States
- `useScreenLoading({ id, label, isLoading, error, onRetry })` returns:
  - `showSpinner`: true after 80ms threshold
  - `showSkeleton`: true during loading, before spinner shows
  - `showError`: true on error
  - `retry()`: debounced retry handler
  - `spinnerFrame`: current braille/ASCII spinner character
- Full screen loading: `<FullScreenLoading spinnerFrame={...} label="Loading workflows…" />`
- Skeleton: `<SkeletonList columns={3} metaWidth={6} statusWidth={5} />`

### 5.3 Navigation Patterns
- **Push to run list:** `nav.push(ScreenName.WorkflowRunList, { workflowId: String(def.id), workflowName: def.name, owner, repo })`
- **Push to run detail:** `nav.push(ScreenName.WorkflowRunDetail, { runId: String(run.id), owner, repo })`
- **Back:** `nav.pop()` or `q` key
- **Scroll position caching:** `nav.saveScrollPosition(entry.id, position)` / `nav.getScrollPosition(entry.id)`

### 5.4 Data Fetching Pattern (from useBookmarks as reference)
- `useRepoFetch()` hook from `apps/tui/src/hooks/useRepoFetch.ts`
- Returns `{ get: <T>(path, options?) => Promise<T> }`
- Uses `useAPIClient()` for base URL + token
- Error handling: `FetchError` class, `toLoadingError()` converter
- AbortController for cancellation on unmount
- Pagination: cursor or page-based, `fetchMore()` callback

### 5.5 List View Keybindings (from design spec)
| Key | Action |
|-----|--------|
| `j` / `Down` | Move cursor down |
| `k` / `Up` | Move cursor up |
| `Enter` | Open focused workflow's run list |
| `G` | Jump to bottom |
| `g g` | Jump to top |
| `/` | Focus search/filter input |
| `Esc` | Clear search |
| `d` | Dispatch workflow |
| `R` | Retry on error |
| `Ctrl+D` | Page down |
| `Ctrl+U` | Page up |

### 5.6 Responsive Values
- `useResponsiveValue()` from `apps/tui/src/hooks/useResponsiveValue.ts`
- Breakpoints: `minimum` (80×24), `standard` (120×40), `large` (200×60)
- Example: `const pageSize = useResponsiveValue({ minimum: 10, standard: 25, large: 50 }, 10)`

### 5.7 Theme & Colors
- `useTheme()` from `apps/tui/src/hooks/useTheme.ts` → `ThemeTokens`
- Tokens: `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`
- `CoreTokenName` type from `apps/tui/src/theme/tokens.ts:198`
- `statusToToken()` for generic status→color mapping (but workflow-specific utils override for `queued`→primary, `running`→warning, `cancelled`→muted)

## 6. Mini Status Bar (Key Visual Feature)

The workflow list screen displays a 5-dot mini status bar per workflow definition showing last 5 run results:

```
getMiniStatusBar(recentRuns: readonly MiniRun[]): Array<{ char: string; color: CoreTokenName }>
```

**Characters:**
- `success`: `●` (green)
- `failure`: `●` (red)
- `running`: `◎` (yellow)
- `queued`: `○` (primary/blue)
- `cancelled`: `·` (muted)
- `error`: `●` (red)
- Empty slot: `·` (muted)

Always returns exactly 5 elements for consistent column width.

## 7. Row Layout Design

Based on the design spec and patterns from other list screens:

### Standard (120×40)
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ✓ CI Pipeline          .codeplane/workflows/ci.ts      ●●●●○    3m    42 runs    2h ago  │
│ ◎ Deploy Production    .codeplane/workflows/deploy.ts   ●●◎··    15m   18 runs    now     │
│ ✗ Nightly Tests        .codeplane/workflows/nightly.ts  ●✗●●●    8m    156 runs   1d ago  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Minimum (80×24)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ✓ CI Pipeline          ●●●●○    42 runs  │
│ ◎ Deploy Production    ●●◎··    18 runs  │
│ ✗ Nightly Tests        ●✗●●●    156 runs │
└──────────────────────────────────────────────────────────────────────────────┘
```

At minimum breakpoint: hide path, hide duration, hide relative time.

## 8. Component Hierarchy

```
WorkflowListScreen
├── useNavigation() → repoContext
├── useWorkflowDefinitions(repo) → definitions, loading, error, loadMore, hasMore
├── useScreenLoading()
├── useScreenKeybindings()
├── useResponsiveValue() → page size, visible columns
├── useLayout() → contentHeight, breakpoint
│
├── [showSpinner] → <FullScreenLoading />
├── [showSkeleton] → <SkeletonList />
├── [showError] → <FullScreenError />
├── [data ready] →
│   ├── [filter bar] → <box> <input> search filter </box>
│   ├── <scrollbox>
│   │   ├── WorkflowDefinitionRow (per item)
│   │   │   ├── Status icon (getRunStatusIcon for latest run)
│   │   │   ├── Name (bold)
│   │   │   ├── Path (muted, hidden at minimum)
│   │   │   ├── Mini status bar (getMiniStatusBar)
│   │   │   ├── Duration (formatDuration, hidden at minimum)
│   │   │   ├── Run count (formatRunCount)
│   │   │   └── Last run time (formatRelativeTime, hidden at minimum)
│   │   └── <PaginationIndicator />
│   └── Empty state → "No workflows found"
```

## 9. Key Files to Create/Modify

### Create:
| File | Purpose |
|------|---------|
| `apps/tui/src/screens/Workflows/WorkflowListScreen.tsx` | Main screen component |
| `apps/tui/src/screens/Workflows/utils.ts` | UI utilities (if not done by prerequisite ticket) |
| `apps/tui/src/screens/Workflows/index.ts` | Barrel exports (if not done by prerequisite ticket) |
| `apps/tui/src/hooks/workflow-types.ts` | Shared types (if not done by prerequisite ticket) |
| `apps/tui/src/hooks/useWorkflowDefinitions.ts` | Data hook (if not done by prerequisite ticket) |
| `e2e/tui/workflows.test.ts` | E2E test file |

### Modify:
| File | Change |
|------|--------|
| `apps/tui/src/router/registry.ts:119-124` | Replace `PlaceholderScreen` with `WorkflowListScreen` |
| `apps/tui/src/screens/index.ts` | Add re-export of Workflows screen |

## 10. Reference Implementations

### 10.1 Agents Screen (closest pattern)
- **Directory:** `apps/tui/src/screens/Agents/`
- **Components:** `MessageBlock.tsx`, `ToolBlock.tsx`
- **Types:** `types.ts` (defines `StatusIconConfig`)
- **Utils:** `utils/formatTimestamp.ts`
- This is the most complete non-placeholder screen implementation

### 10.2 Bookmarks Hook (data fetching pattern)
- **File:** `apps/tui/src/hooks/useBookmarks.ts`
- Demonstrates: `useRepoFetch()`, `useState` for data/loading/error, pagination with cursor, AbortController, `toLoadingError()`
- This is the TUI's native data-fetching pattern (not from ui-core)

### 10.3 SkeletonList (loading placeholder)
- **File:** `apps/tui/src/components/SkeletonList.tsx`
- Deterministic width generation per row
- Uses `useLayout()` for content height
- Renders muted block characters

### 10.4 PaginationIndicator (pagination UI)
- **File:** `apps/tui/src/components/PaginationIndicator.tsx`
- Shows spinner during loading, error with retry hint
- Uses `usePaginationLoading()` hook

## 11. E2E Testing

### 11.1 Test File
- **Location:** `e2e/tui/workflows.test.ts` (does not exist yet)
- **Feature group:** `TUI_WORKFLOWS`

### 11.2 Test Helpers
- **File:** `e2e/tui/helpers.ts`
- `launchTUI(options)`: spawn terminal with PTY
- `TERMINAL_SIZES`: `{ minimum: 80×24, standard: 120×40, large: 200×60 }`
- `TUITestInstance`: `sendKeys()`, `waitForText()`, `snapshot()`, `getLine()`, `resize()`, `terminate()`
- `createTestCredentialStore()`: temp credential for isolation
- `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `API_URL`: test constants

### 11.3 Test Categories
- `SNAP-WFL`: Terminal snapshot tests (full screen captures)
- `KEY-WFL`: Keyboard interaction tests (j/k navigation, Enter to open, / for search)
- `RESP-WFL`: Responsive layout tests (minimum/standard/large)
- `INT-WFL`: Integration tests (real API calls for workflow listing)
- `EDGE-WFL`: Edge cases (empty list, error states, very long names)

### 11.4 Test Philosophy
- Tests that fail due to unimplemented backends are left failing (never skipped)
- Each test validates user-facing behavior, not implementation details
- Snapshot tests capture full terminal output at key interaction points
- Tests run against real API server with test fixtures

## 12. OpenTUI Components Used

| Component | Usage |
|-----------|-------|
| `<box>` | Layout containers with flexbox |
| `<text>` | Text rendering with `fg`, `bold`, `attributes` |
| `<span>` | Inline text segments with different colors |
| `<scrollbox>` | Scrollable list container |
| `<input>` | Search/filter text input |
| `useKeyboard` | Keyboard event handling (via KeybindingProvider) |
| `useTerminalDimensions` | Terminal size (via useLayout) |

## 13. Workflow-Specific Color Overrides

The workflow list screen uses custom status→color mapping from `utils.ts`, NOT the generic `statusToToken()`:

| Status | Generic `statusToToken()` | Workflow-specific |
|--------|--------------------------|-------------------|
| `queued` | `"warning"` (yellow) | `"primary"` (blue/cyan) |
| `running` | `"success"` (green) | `"warning"` (yellow) |
| `cancelled` | `"error"` (red) | `"muted"` (gray) |
| `success` | `"success"` | `"success"` |
| `failure` | `"error"` | `"error"` |
| `error` | `"error"` | `"error"` |

## 14. Pagination Strategy

- Page-based pagination: `page=N&per_page=30`
- `usePaginatedQuery` or local hook with `loadMore()` callback
- Scroll-to-end detection at 80% content height triggers next page
- `<PaginationIndicator>` at list bottom shows loading/error state
- Memory cap: `MAX_DEFINITIONS = 300`

## 15. Search/Filtering

- Client-side filtering on `name` and `path` fields
- `/` key focuses search input (PRIORITY.TEXT_INPUT)
- `Esc` clears search and returns focus to list
- Filter is case-insensitive substring match
- Filter state is local (not sent to API)

## 16. Important Architecture Notes

### 16.1 No ui-core package
- The `@codeplane/ui-core` package does not exist in the repo
- The data hooks spec references it but the actual implementation uses local hooks
- `APIClientProvider` in `apps/tui/src/providers/APIClientProvider.tsx` is a simple context with `baseUrl` + `token`
- The `useRepoFetch()` hook is the authenticated fetch primitive

### 16.2 Provider Stack
The full provider hierarchy (from `apps/tui/src/index.tsx`):
```
ErrorBoundary > ThemeProvider > KeybindingProvider > OverlayManager > AuthProvider > APIClientProvider > SSEProvider > NavigationProvider > LoadingProvider > GlobalKeybindings > AppShell > ScreenRouter
```

### 16.3 Keybinding Priority
1. TEXT_INPUT (1) — OpenTUI focus system
2. MODAL (2) — command palette, help
3. GOTO (3) — g-prefix mode (1500ms timeout)
4. SCREEN (4) — screen-specific bindings
5. GLOBAL (5) — always-active fallback

### 16.4 Import Conventions
- All imports use `.js` extension for ESM compatibility
- Barrel exports follow `index.ts` pattern
- Type-only imports use `import type { ... }`