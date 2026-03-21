# JJ_OPERATION_LOG

Specification for JJ_OPERATION_LOG.

## High-Level User POV

The jj operation log is a core jj-native concept that Codeplane surfaces as a first-class repository audit trail across every client surface: web, API, CLI, TUI, and editors. Every action that modifies repository state in jj — creating a change, rebasing, editing descriptions, importing git refs, snapshotting working copies, creating or moving bookmarks — is recorded as an immutable operation entry. The operation log answers the fundamental developer question: "what happened in this repo, who did it, and when?"

When a developer navigates to a repository in the Codeplane web application, they find an "Operations" tab alongside bookmarks, changes, code, and conflicts. This tab presents a reverse-chronological list of every operation performed on the repository. Each entry shows the operation type (e.g., `snapshot`, `rebase`, `new`, `bookmark`), a human-readable description of what the operation did, who triggered it, and when it occurred. The developer can click on any operation to view its full metadata, including the complete operation ID and parent operation ID — information they need when using `jj op restore` or `jj op diff` from the command line.

In the TUI, the operation log appears as a tab within the repository detail screen. It uses vim-style keyboard navigation (`j`/`k`) to move through operations, `Enter` to inspect details, `y` to copy an operation ID to the clipboard, and `/` to filter operations by type or description. The TUI dynamically adapts its column layout to the terminal width, showing more or fewer columns as space allows.

From the CLI, developers can list recent operations, view details of a specific operation, and filter by type — all formatted for terminal readability with relative timestamps and truncated IDs. The CLI output integrates naturally with shell workflows: operation IDs are easily piped to other commands.

In editors (VS Code and Neovim), operation log awareness manifests as a quick-pick or telescope integration that lets developers inspect recent repository operations without leaving their editing environment, and as context for daemon sync status — understanding which operations have been synced and which are pending.

The operation log is read-only by design. Operations are historical records produced by jj itself; Codeplane does not create, edit, or delete them. The product value is in making this audit trail visible, searchable, and accessible from every surface where a developer works with a Codeplane repository.

## Acceptance Criteria

## Definition of Done

- [ ] The `GET /api/repos/:owner/:repo/operations` endpoint returns a paginated list of jj operations from the repository
- [ ] The endpoint supports cursor-based pagination with `cursor` and `limit` query parameters
- [ ] Operations are returned in reverse chronological order (newest first)
- [ ] Each operation entry includes at minimum: `operation_id`, `description`, and `timestamp`
- [ ] The enriched response includes: `operation_type`, `user`, and `parent_operation_id` when available from the database layer
- [ ] The `GET /api/repos/:owner/:repo/operations/:operation_id` endpoint returns a single operation's full metadata
- [ ] The web UI displays an Operations tab in the repository view with a browsable, filterable list
- [ ] The TUI displays an Op Log tab (tab 5) in the repository detail screen with vim-style keybindings
- [ ] The CLI provides `codeplane repo operations` for listing and `codeplane repo operations --id OPERATION_ID` for detail
- [ ] All clients consume the same API endpoint
- [ ] The `useOperationLog()` hook exists in `@codeplane/ui-core` and is consumed by both web and TUI clients
- [ ] Feature flag `JJ_OPERATION_LOG` gates the feature across all surfaces
- [ ] VS Code extension provides `codeplane.operations.list` command with Quick Pick
- [ ] Neovim plugin provides `:Codeplane operations` command with Telescope integration

## Boundary Constraints

- `operation_id`: full jj hex string, displayed as 12-character short form in lists; max length 64 characters from jj
- `operation_type`: max 64 characters; must be one of the recognized jj operation types (e.g., `snapshot`, `rebase`, `new`, `bookmark`, `import_git_refs`, `edit`, `describe`, `abandon`, `restore`, `undo`, `split`, `squash`, `move`, `git_push`, `git_fetch`)
- `description`: max 500 characters; single-line in list views, wrapped in detail views; may contain any Unicode characters
- `user`: username string, max 39 characters (Codeplane username limit)
- `parent_operation_id`: max 64 characters; may be empty/null for the root operation
- `timestamp`: ISO 8601 format from the API; displayed as relative time in list views and absolute time in detail views
- `cursor`: opaque string; must not exceed 32 characters
- `limit`: integer between 1 and 100 inclusive; defaults to 30; values outside range are clamped (>100) or rejected (≤0)
- Filter input (client-side only): max 100 characters
- Pagination ceiling: maximum 5000 operations loaded in memory across all pages in a single client session
- Initial TUI page size: 50 operations per page
- CLI default display limit: 20 operations

## Edge Cases

- [ ] Repository with zero operations: display "No operations recorded" empty state
- [ ] Repository with exactly one operation (root operation): display single row; parent ID shown as "—"
- [ ] Operation with empty description: display "(no description)" in muted text
- [ ] Operation with description at max length (500 chars): truncated with `…` in list; full text in detail with wrapping
- [ ] Duplicate operation IDs: not possible within a single repository (jj guarantees uniqueness)
- [ ] Concurrent operations from multiple users: all appear in time-sorted order
- [ ] Operation log for a newly created repository that has never been committed to: returns the initial "initialize repo" operation only
- [ ] Requesting operations for a non-existent repository: 404 response
- [ ] Requesting operations for a private repository without access: 404 response (do not leak repo existence)
- [ ] `limit=0`: rejected with 400
- [ ] `limit=-5`: rejected with 400
- [ ] `limit=200`: clamped to 100
- [ ] `cursor` pointing beyond available operations: returns empty items array with empty `next_cursor`
- [ ] Malformed cursor string: returns 400
- [ ] `owner` or `repo` path params that are empty or whitespace: returns 400
- [ ] Terminal resize while scrolled (TUI): scroll position preserved relative to focused item
- [ ] Terminal resize while in detail view (TUI): detail view re-layouts, content re-wraps
- [ ] Rapid `j` presses (TUI): processed sequentially, no debouncing
- [ ] Filter during loading (TUI): filter input disabled until initial data load completes
- [ ] Unicode in descriptions: truncation respects grapheme clusters
- [ ] Network error during pagination: already-loaded operations remain visible; error at list bottom
- [ ] Detail view for operation with no parent: parent ID field shows "—"
- [ ] API returning 501: inline error "Operation log is not available. Backend not implemented."
- [ ] Copy to clipboard failure: status bar shows "Copy failed — clipboard not available" for 2 seconds
- [ ] API timeout (10s): content area shows timeout message with retry hint
- [ ] Memory accumulation (TUI): 5000-item cap; after cap, "End of loaded operations. Press `R` to reload from start." shown

## Keyboard Interactions (TUI)

- [ ] `j` / `Down`: Move focus to next operation row
- [ ] `k` / `Up`: Move focus to previous operation row
- [ ] `Enter`: Open operation detail view for focused operation
- [ ] `y`: Copy focused operation's full ID to clipboard
- [ ] `/`: Focus the filter input
- [ ] `Esc`: Clear filter input and return focus to list (if filter is focused); dismiss detail view (if in detail)
- [ ] `q`: Return from detail view to list; at list level, propagates to parent
- [ ] `G`: Jump to the last operation row in the loaded list
- [ ] `g g`: Jump to the first operation row
- [ ] `Ctrl+D`: Page down within the scrollbox
- [ ] `Ctrl+U`: Page up within the scrollbox
- [ ] `R`: Refresh operation log from API (hard re-fetch)
- [ ] `Tab` / `Shift+Tab`: Switch to next/previous repository tab (handled by parent)

## Responsive Behavior (TUI)

- [ ] Below 80×24: "Terminal too small" handled by router — operation log not rendered
- [ ] 80×24 – 119×39 (minimum): Columns: type (20ch) │ description (flex) │ timestamp (12ch). Op ID and user hidden.
- [ ] 120×40 – 199×59 (standard): Columns: op ID (14ch) │ type (20ch) │ description (flex) │ timestamp (14ch)
- [ ] 200×60+ (large): All columns: op ID (14ch) │ type (24ch) │ user (16ch) │ description (flex) │ parent ID (14ch) │ timestamp (16ch)

## Design

## API Shape

### List Operations

```
GET /api/repos/:owner/:repo/operations?cursor={cursor}&limit={limit}
```

**Request Parameters:**
- `owner` (path, required): Repository owner username or organization name
- `repo` (path, required): Repository name
- `cursor` (query, optional): Opaque pagination cursor from a previous response's `next_cursor`
- `limit` (query, optional): Number of operations per page. Default: 30. Min: 1. Max: 100.

**Success Response (200):**
```json
{
  "items": [
    {
      "operation_id": "abc12345def0ba1234567890abcdef012345678",
      "operation_type": "snapshot",
      "description": "working copy update",
      "user": "alice",
      "parent_operation_id": "xyz98765fed1ba0987654321fedcba987654321",
      "timestamp": "2026-03-21T14:32:07Z"
    }
  ],
  "next_cursor": "eyJvZmZzZXQiOjMwfQ==",
  "total_count": 247
}
```

**Error Responses:**
- `400 Bad Request`: Invalid limit value, missing owner/repo, malformed cursor
- `401 Unauthorized`: Authentication required (private repo without token)
- `404 Not Found`: Repository does not exist or caller lacks access
- `429 Too Many Requests`: Rate limit exceeded; includes `Retry-After` header
- `500 Internal Server Error`: Backend failure (e.g., jj process error)
- `501 Not Implemented`: Backend not available (graceful degradation)

### Get Single Operation

```
GET /api/repos/:owner/:repo/operations/:operation_id
```

**Success Response (200):**
```json
{
  "operation_id": "abc12345def0ba1234567890abcdef012345678",
  "operation_type": "snapshot",
  "description": "working copy update",
  "user": "alice",
  "parent_operation_id": "xyz98765fed1ba0987654321fedcba987654321",
  "timestamp": "2026-03-21T14:32:07Z"
}
```

**Error Responses:**
- `400 Bad Request`: Malformed operation ID
- `404 Not Found`: Operation not found or repo not accessible

## SDK Shape

### `@codeplane/sdk` — RepoHost service

The existing `listOperations(owner, repo, cursor?, limit?)` method returns `Result<{ items: Operation[]; nextCursor: string }, APIError>`. The `Operation` interface should be enriched to include:

```typescript
export interface Operation {
  operation_id: string;
  operation_type?: string;
  description: string;
  user?: string;
  parent_operation_id?: string;
  timestamp: string;
}
```

### `@codeplane/ui-core` — useOperationLog hook

```typescript
function useOperationLog(owner: string, repo: string): {
  data: Operation[];
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  loadNextPage: () => void;
  refresh: () => void;
  hasNextPage: boolean;
}
```

## Web UI Design

The Operations tab appears in the repository navigation alongside Bookmarks, Changes, Code, Conflicts, and Graph.

### List View
- Section header: "Operations (N)" where N is `total_count`
- Each row displays: short operation ID (12 chars, monospaced, muted), operation type (bold, colored by type), description (truncated with ellipsis), relative timestamp (muted, right-aligned)
- Hover state: subtle background highlight
- Click: navigates to operation detail
- Pagination: "Load more" button at bottom, or infinite scroll with loading spinner
- Empty state: centered "No operations recorded." in muted text
- Error state: centered error message with "Retry" button
- Filter: search input above the list that filters client-side by type or description

### Detail View
- Full-width panel or modal showing:
  - Operation ID (monospaced, with copy button)
  - Parent Operation ID (monospaced, muted, with copy button; "—" if none)
  - Type (color-coded badge)
  - Description (full text, wrapped)
  - User (link to user profile)
  - Timestamp (absolute, ISO 8601 format)
- Back navigation returns to list with scroll position preserved

### Operation Type Color Mapping
- `snapshot` → gray/neutral
- `rebase` → orange/warning
- `new` → green/success
- `bookmark` → blue/info
- `import_git_refs` → purple/accent
- `edit` / `describe` → green/success
- `abandon` → red/danger
- All others → default/muted

## CLI Command

```
codeplane repo operations [--repo OWNER/REPO] [--limit N] [--type TYPE] [--json]
```

**Arguments:**
- `--repo` / `-R`: Repository in `owner/repo` format. Defaults to repository detected from current directory.
- `--limit`: Number of operations to display. Default: 20. Max: 100.
- `--type`: Filter by operation type (e.g., `--type rebase`).
- `--json`: Output raw JSON response.

**Output format (default):**
```
Operations for alice/myproject (247 total)

  ID            TYPE            DESCRIPTION                      WHEN
  abc12345def0  snapshot        working copy update              3 minutes ago
  xyz98765fed1  rebase          rebase -r ksxy onto mzrl         1 hour ago
  mno34567abc2  bookmark        create feature/auth              2 hours ago
  pqr56789def3  new             new change                       5 hours ago
  stu90123ghi4  import_git_refs import git refs                  yesterday
```

**View single operation:**
```
codeplane repo operations --id OPERATION_ID [--repo OWNER/REPO] [--json]
```

## TUI UI

The TUI operation log is Tab 5 in the repository detail screen.

### Screen Layout — List View
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo                 ● SYNCED 🔔 3│
├─────────────────────────────────────────────────────────────┤
│ owner/repo                          PUBLIC    ★ 42          │
│ Description text here...                                    │
├─────────────────────────────────────────────────────────────┤
│  1:Bookmarks  2:Changes  3:Code  4:Conflicts [5:OpLog] 6:S │
├─────────────────────────────────────────────────────────────┤
│ Operations (247)                            / filter  R ref │
│                                                             │
│  abc12345def0  snapshot  working copy update         3m ago │
│  xyz98765fed1  rebase    rebase -r ksxy onto mzrl    1h ago │
│  mno34567abc2  bookmark  create feature/auth         2h ago │
│  pqr56789def3  new       new change                  5h ago │
│  stu90123ghi4  import    import git refs           yest.    │
│  ...                                                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:detail  y:copy ID  R:refresh   ? help  │
└─────────────────────────────────────────────────────────────┘
```

### Screen Layout — Detail View
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo                 ● SYNCED 🔔 3│
├─────────────────────────────────────────────────────────────┤
│ owner/repo                          PUBLIC    ★ 42          │
├─────────────────────────────────────────────────────────────┤
│  1:Bookmarks  2:Changes  3:Code  4:Conflicts [5:OpLog] 6:S │
├─────────────────────────────────────────────────────────────┤
│ ◀ Operation Detail                                          │
│                                                             │
│ Operation ID    abc12345def0ba1234567890abcdef012345678      │
│ Parent Op ID    xyz98765fed1ba0987654321fedcba987654321      │
│ Type            snapshot                                    │
│ Description     working copy update                         │
│ User            alice                                       │
│ Timestamp       2026-03-21 14:32:07 UTC                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ q/Esc:back  y:copy ID                                ? help │
└─────────────────────────────────────────────────────────────┘
```

### Keybindings
**List view:** `j`/`Down` (down), `k`/`Up` (up), `Enter` (detail), `y` (copy ID), `/` (filter), `Esc` (clear filter), `G` (bottom), `g g` (top), `Ctrl+D` (page down), `Ctrl+U` (page up), `R` (refresh).
**Detail view:** `q`/`Esc` (back to list), `y` (copy ID), `j`/`k` (scroll), `R` (refresh).

### Responsive Column Layout
| Width | Columns |
|-------|--------|
| 80–119 | type(20) │ description(flex) │ timestamp(12) |
| 120–199 | opID(14) │ type(20) │ description(flex) │ timestamp(14) |
| 200+ | opID(14) │ type(24) │ user(16) │ description(flex) │ parentID(14) │ timestamp(16) |

### Data Hooks
| Hook | Source | Purpose |
|------|--------|----------|
| `useOperationLog()` | `@codeplane/ui-core` | Fetch paginated operation list. Returns `{ data, totalCount, isLoading, error, loadNextPage, refresh }` |
| `useKeyboard()` | `@opentui/react` | Capture all keybindings |
| `useTerminalDimensions()` | `@opentui/react` | Determine column visibility and widths |
| `useOnResize()` | `@opentui/react` | Re-layout on terminal resize |
| `useNavigation()` | Local TUI | Push/pop detail view, preserve focus state |

## VS Code Extension

- **Command**: `codeplane.operations.list` — Opens a Quick Pick showing recent operations for the current repository
- **Quick Pick items**: Each shows operation type, truncated description, and relative timestamp
- **Select action**: Copies the full operation ID to clipboard and shows informational notification
- **Tree View**: Optional tree view provider in the Codeplane sidebar panel showing recent operations under a collapsible "Operations" node
- **Status bar**: Operation count shown as part of repository context when op log feature is enabled

## Neovim Plugin

- **Command**: `:Codeplane operations` — Opens a Telescope picker with recent operations
- **Telescope columns**: Operation ID (short), type, description, timestamp
- **Default action** (`<CR>`): Copies operation ID to clipboard
- **Alternative action** (`<C-o>`): Opens operation detail in a floating window
- **Statusline component**: `require('codeplane').operations_count()` returns the total operation count for statusline integration

## Documentation

1. **Operations Overview** — Conceptual guide explaining what the jj operation log is, why it matters, and how Codeplane surfaces it. Targets jj newcomers and developers familiar with git reflog.
2. **Web UI: Browsing Operations** — Step-by-step walkthrough of the Operations tab in the web application: navigating, filtering, viewing details, copying IDs.
3. **CLI: Working with Operations** — Reference documentation for the `codeplane repo operations` command including all flags, examples, and integration with shell workflows (e.g., piping operation IDs).
4. **TUI: Operation Log Tab** — Guide to keyboard-driven operation log browsing in the TUI, including all keybindings and responsive behavior.
5. **Editor Integrations** — Short section in VS Code extension and Neovim plugin docs covering operation log commands and integration points.
6. **API Reference: Operations Endpoint** — Auto-generated or hand-written API reference for `GET /api/repos/:owner/:repo/operations` and `GET /api/repos/:owner/:repo/operations/:operation_id`, including request parameters, response schema, and error codes.

## Permissions & Security

## Authorization Matrix

| Role | List Operations | View Operation Detail | Access via Public Repo |
|------|----------------|----------------------|----------------------|
| Owner | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ |
| Member (write) | ✅ | ✅ | ✅ |
| Member (read) | ✅ | ✅ | ✅ |
| Anonymous (authenticated, no repo access) | ❌ (404) | ❌ (404) | ✅ |
| Unauthenticated | ❌ (404 for private) | ❌ (404 for private) | ✅ |

## Key Policies

- Private repositories return `404 Not Found` (not `403 Forbidden`) to anonymous and unauthorized users to avoid leaking repository existence
- Deploy keys with read access can access the operation log endpoint
- PATs with `repo:read` scope can access the operation log endpoint
- OAuth applications with `repo` scope can access the operation log endpoint
- The operation log is entirely read-only — there are no write, edit, or delete actions
- No additional role beyond repository read access is required
- Repository admin status is not required; the operation log exposes no admin-only data

## Token-Based Auth

- The TUI and CLI use token-based auth from keychain or `CODEPLANE_TOKEN` environment variable
- No OAuth browser flow is triggered by the operation log view
- The auth token is passed as a Bearer token in the `Authorization` header on requests
- If the auth token expires during a session, subsequent fetches (pagination, refresh) return 401, and the client shows a session-expired message
- The operation log does not read, transmit, display, or log the auth token itself
- Operation user IDs are displayed as usernames — they are not sensitive data

## Rate Limiting

- Operation log list endpoint is subject to standard API rate limits: 5,000 req/hr for authenticated users, 60 req/hr for unauthenticated users
- Each page fetch counts as one API request
- Hard refresh (`R` in TUI, retry in web) counts as one API request per invocation
- Rate limit exhaustion (429 response) displays the `Retry-After` period inline
- Scrollbox pagination does not trigger redundant requests — `loadNextPage` is guarded against concurrent calls
- No additional per-endpoint rate limiting beyond the global tier

## Data Privacy

- Operation descriptions may contain bookmark names, change IDs, and user-authored content — all of which are already visible to anyone with repository access
- Operation user IDs are resolved to usernames — usernames are public profile data and not PII
- The operation log does not expose file contents, diffs, or secrets
- Email addresses are not included in operation responses
- Operation IDs are content-addressable hashes and do not contain sensitive data

## Input Validation

- No user-provided text is submitted to the API (read-only view)
- Filter input is client-side only — not sent to the API
- Operation IDs are displayed from API responses — not used as input for further API calls within the same view (except detail lookup)
- Clipboard operations write to the system clipboard only; they do not execute commands

## Telemetry & Product Analytics

## Key Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `repo.operations.listed` | Operations endpoint returns successfully | `repo_id`, `repo_full_name`, `owner`, `result_count`, `total_count`, `has_cursor`, `limit`, `response_time_ms`, `client` (`web`, `cli`, `tui`, `vscode`, `neovim`, `api`) |
| `repo.operations.detail_viewed` | Single operation detail viewed | `repo_id`, `repo_full_name`, `operation_id`, `operation_type`, `client` |
| `repo.operations.id_copied` | User copies an operation ID to clipboard | `repo_id`, `repo_full_name`, `operation_id`, `operation_type`, `client`, `copy_context` (`list` or `detail`) |
| `repo.operations.filtered` | User applies a filter to the operation list | `repo_id`, `repo_full_name`, `filter_length`, `result_count`, `total_count`, `client` |
| `repo.operations.paginated` | Next page of operations loaded | `repo_id`, `repo_full_name`, `page_number`, `page_size`, `cumulative_loaded`, `response_time_ms`, `client` |
| `repo.operations.refreshed` | User triggers a hard refresh | `repo_id`, `repo_full_name`, `previous_count`, `new_count`, `response_time_ms`, `client` |
| `repo.operations.error` | Operation log request fails | `repo_id`, `repo_full_name`, `error_code`, `error_type`, `action` (`initial_load`, `pagination`, `refresh`, `detail`), `client` |

## Common Event Properties

All events include: `session_id`, `user_id`, `timestamp` (ISO 8601), `feature_flag_version`

## Success Indicators

| Metric | Target | Description |
|---|---|---|
| Operations tab visit rate | >10% of repo sessions | Percentage of repository sessions where user visits Operations tab |
| Detail view engagement | >25% of operations visits | Percentage of operations views where user drills into at least one detail |
| Copy ID usage | >15% of operations visits | Percentage of operations views where user copies at least one ID |
| Filter usage | >10% of operations visits | Percentage of operations views where user engages the filter |
| Pagination depth | median ≤2 pages | How many pages deep the median user scrolls |
| API p50 latency | <200ms | Time from request to first byte |
| API p99 latency | <1000ms | Tail latency |
| Error rate | <1% of requests | Percentage of operation log requests that return 5xx |
| Cross-client adoption | ≥3 clients | Operations are used from at least 3 different client types (web, CLI, TUI, etc.) |

## Observability

## Logging Requirements

| Log Level | Event | Structured Context |
|---|---|---|
| `debug` | Operation list request received | `{ owner, repo, cursor, limit, user_id, request_id }` |
| `debug` | jj subprocess spawned | `{ owner, repo, command: "jj operation log", args, request_id }` |
| `debug` | jj subprocess completed | `{ owner, repo, exit_code, stdout_bytes, stderr_bytes, duration_ms, request_id }` |
| `info` | Operation list served | `{ owner, repo, result_count, total_count, has_next, duration_ms, request_id }` |
| `info` | Operation detail served | `{ owner, repo, operation_id, duration_ms, request_id }` |
| `warn` | jj subprocess failed | `{ owner, repo, exit_code, stderr, duration_ms, request_id }` |
| `warn` | Rate limit triggered | `{ user_id, endpoint, retry_after_seconds, request_id }` |
| `warn` | Invalid pagination parameters | `{ owner, repo, cursor, limit, error, request_id }` |
| `error` | Unhandled exception in operations handler | `{ owner, repo, error_message, stack_trace, request_id }` |
| `error` | Repository path resolution failed | `{ owner, repo, error_message, request_id }` |

All log entries include: `service: "codeplane-server"`, `timestamp`, `request_id`, `trace_id`. Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

## Prometheus Metrics

### Counters
- `codeplane_operations_list_total{owner, repo, status}` — Total operation list requests by HTTP status
- `codeplane_operations_detail_total{owner, repo, status}` — Total operation detail requests by HTTP status
- `codeplane_operations_jj_subprocess_total{owner, repo, exit_code}` — Total jj subprocess invocations by exit code

### Histograms
- `codeplane_operations_list_duration_seconds{owner, repo}` — Duration of operation list requests (buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)
- `codeplane_operations_detail_duration_seconds{owner, repo}` — Duration of operation detail requests
- `codeplane_operations_jj_subprocess_duration_seconds{owner, repo}` — Duration of jj subprocess execution
- `codeplane_operations_result_count{owner, repo}` — Number of operations returned per request (buckets: 1, 5, 10, 25, 50, 100)

### Gauges
- `codeplane_operations_jj_subprocess_active{owner, repo}` — Currently in-flight jj operation log subprocesses

## Alerts

### Alert: OperationsHighErrorRate
- **Condition**: `rate(codeplane_operations_list_total{status=~"5.."}[5m]) / rate(codeplane_operations_list_total[5m]) > 0.05`
- **Severity**: Warning
- **For**: 5 minutes
- **Runbook**:
  1. Check `codeplane_operations_jj_subprocess_total{exit_code!="0"}` — if jj subprocess failures are high, SSH into the server and verify `jj --version` works and repos are accessible at the expected paths.
  2. Check server logs for `OpLog: fetch failed` entries. Look for common `stderr` patterns.
  3. Check disk space on the repository storage volume — `jj operation log` reads from the local repo.
  4. If the issue is isolated to specific repositories, check those repos' health with `jj debug operation --at-op @` directly.
  5. If the error is `ENOENT` or path-related, verify the repo-host path resolution service configuration.
  6. Escalate if >10% error rate sustained for >15 minutes.

### Alert: OperationsHighLatency
- **Condition**: `histogram_quantile(0.99, rate(codeplane_operations_list_duration_seconds_bucket[5m])) > 5`
- **Severity**: Warning
- **For**: 10 minutes
- **Runbook**:
  1. Check `codeplane_operations_jj_subprocess_duration_seconds` — if jj subprocess latency is high, the issue is in jj's operation log reading.
  2. Check system load (`uptime`, `top`) — high CPU or I/O may slow jj subprocess execution.
  3. Check for repositories with exceptionally large operation logs (>10,000 operations). These may need operational cleanup with `jj op abandon`.
  4. Check `codeplane_operations_jj_subprocess_active` gauge for subprocess pile-up.
  5. Consider adding caching for frequently accessed repositories if latency is consistently high.

### Alert: OperationsSubprocessPileup
- **Condition**: `codeplane_operations_jj_subprocess_active > 50`
- **Severity**: Critical
- **For**: 2 minutes
- **Runbook**:
  1. This indicates >50 concurrent jj subprocesses spawned for operation log queries. This risks exhausting server resources.
  2. Check for a traffic spike or runaway client polling.
  3. Check rate limiter effectiveness — is a single user/token bypassing limits?
  4. Temporarily increase rate limiting thresholds or enable circuit-breaking for the operations endpoint.
  5. Kill stuck jj subprocesses if present: `pkill -f "jj operation log"` (safe — these are read-only).
  6. Investigate client-side bugs causing retry storms.

### Alert: OperationsEndpointDown
- **Condition**: `up{job="codeplane-server"} == 1 AND rate(codeplane_operations_list_total[5m]) == 0`
- **Severity**: Info
- **For**: 30 minutes
- **Runbook**:
  1. Verify the operations endpoint is still mounted (not accidentally removed in a deploy).
  2. Check if the `JJ_OPERATION_LOG` feature flag is disabled.
  3. Check server startup logs for route registration confirmation.
  4. If the endpoint was intentionally disabled, silence this alert.

## Error Cases and Failure Modes

| Error Case | HTTP Status | Detection | Recovery |
|---|---|---|---|
| Repository not found | 404 | Path resolution returns null | User is shown "Repository not found" |
| Repository access denied | 404 | Auth middleware denies access | User sees 404 (no repo existence leak) |
| jj not installed on server | 500 | `ENOENT` when spawning subprocess | Operational alert fires; admin must install jj |
| jj operation log times out | 500 | Subprocess exceeds 30s timeout | Error logged; user sees "Request timed out" |
| Corrupted jj operation log | 500 | jj exits with non-zero code, stderr mentions corruption | Error logged; admin runs `jj debug` on affected repo |
| Invalid cursor value | 400 | Cursor parse fails | User sees "Invalid pagination cursor" |
| Limit out of range | 400 | Validation rejects | User sees "Invalid limit value" |
| Server out of memory during large op log | 500 | OOM or result too large | Limit enforced at 100 per page prevents this |
| Feature flag disabled | 501 | Feature flag check fails | User sees "Operation log is not available" |
| Stuck loading state (TUI/Web) | — | 10-second timeout fires | Error message shown; tab bar remains interactive |
| Pagination loop | — | `loadNextPage` guard | No-ops if request is in flight or last page returned fewer items than page size |
| Memory accumulation (TUI) | — | 5000-item cap | After cap, "End of loaded operations. Press `R` to reload from start." shown |

## Verification

## API Integration Tests

### File: `e2e/api/operations.test.ts`

1. **`api-operations-list-basic`** — Create a repository with several jj operations. `GET /api/repos/:owner/:repo/operations`. Assert 200, response contains `items` array, `next_cursor`, and `total_count`. Items are sorted newest-first.
2. **`api-operations-list-pagination-defaults`** — Request with no `limit`. Assert default returns up to 30 items.
3. **`api-operations-list-pagination-custom-limit`** — Request with `limit=5`. Assert exactly 5 items returned. Assert `next_cursor` is non-empty when more exist.
4. **`api-operations-list-pagination-cursor`** — Fetch page 1, then use `next_cursor` to fetch page 2. Assert no overlap between pages. Assert items are still newest-first.
5. **`api-operations-list-pagination-last-page`** — Paginate to the last page. Assert `next_cursor` is empty string. Assert items count ≤ limit.
6. **`api-operations-list-pagination-beyond-end`** — Use a cursor that points beyond all operations. Assert 200 with empty `items` and empty `next_cursor`.
7. **`api-operations-list-limit-max`** — Request with `limit=100`. Assert succeeds and returns up to 100 items.
8. **`api-operations-list-limit-above-max`** — Request with `limit=200`. Assert response clamps to 100 items maximum.
9. **`api-operations-list-limit-zero`** — Request with `limit=0`. Assert 400 Bad Request.
10. **`api-operations-list-limit-negative`** — Request with `limit=-1`. Assert 400 Bad Request.
11. **`api-operations-list-limit-non-numeric`** — Request with `limit=abc`. Assert 400 Bad Request.
12. **`api-operations-list-cursor-malformed`** — Request with `cursor=!!!invalid`. Assert 400 Bad Request.
13. **`api-operations-list-empty-repo`** — Repository with only initialization operation. Assert 200 with ≥1 item (the init operation).
14. **`api-operations-list-missing-owner`** — `GET /api/repos//myrepo/operations`. Assert 400 or 404.
15. **`api-operations-list-missing-repo`** — `GET /api/repos/alice//operations`. Assert 400 or 404.
16. **`api-operations-list-nonexistent-repo`** — Request for non-existent repository. Assert 404.
17. **`api-operations-list-private-repo-unauthenticated`** — Private repo, no auth token. Assert 404 (not 403).
18. **`api-operations-list-private-repo-unauthorized`** — Private repo, auth token for user without access. Assert 404.
19. **`api-operations-list-private-repo-authorized`** — Private repo, auth token for collaborator. Assert 200 with operations.
20. **`api-operations-list-public-repo-unauthenticated`** — Public repo, no auth token. Assert 200 with operations.
21. **`api-operations-list-response-shape`** — Assert each operation in the response has `operation_id` (string, non-empty), `description` (string), `timestamp` (valid ISO 8601 string).
22. **`api-operations-list-operation-type-present`** — When enriched response is available, assert `operation_type` is a non-empty string.
23. **`api-operations-list-timestamps-descending`** — Assert all items' timestamps are in descending order (newest first).
24. **`api-operations-list-rate-limit`** — Exceed rate limit. Assert 429 response with `Retry-After` header.
25. **`api-operations-detail-basic`** — `GET /api/repos/:owner/:repo/operations/:operation_id`. Assert 200 with full operation metadata.
26. **`api-operations-detail-not-found`** — Request with non-existent operation ID. Assert 404.
27. **`api-operations-detail-invalid-id`** — Request with malformed operation ID. Assert 400 or 404.
28. **`api-operations-feature-flag-disabled`** — Disable `JJ_OPERATION_LOG` feature flag. Assert 501 response with informative message.
29. **`api-operations-list-after-new-operation`** — Perform a jj operation (e.g., `jj new`), then list operations. Assert the new operation appears at the top.
30. **`api-operations-list-max-valid-limit`** — Request with `limit=100`. Assert exactly works and returns correct number of operations.

## CLI Integration Tests

### File: `e2e/cli/operations.test.ts`

31. **`cli-operations-list-default`** — Run `codeplane repo operations`. Assert tabular output with ID, TYPE, DESCRIPTION, WHEN columns.
32. **`cli-operations-list-limit`** — Run `codeplane repo operations --limit 5`. Assert exactly 5 rows of output.
33. **`cli-operations-list-json`** — Run `codeplane repo operations --json`. Assert valid JSON output matching API response shape.
34. **`cli-operations-list-type-filter`** — Run `codeplane repo operations --type snapshot`. Assert only snapshot operations shown.
35. **`cli-operations-list-repo-flag`** — Run `codeplane repo operations --repo alice/myproject`. Assert correct repo operations returned.
36. **`cli-operations-list-no-repo`** — Run `codeplane repo operations` outside a repo directory without `--repo`. Assert helpful error.
37. **`cli-operations-list-empty-repo`** — Run on a repo with minimal operations. Assert at least the init operation shown.
38. **`cli-operations-detail`** — Run `codeplane repo operations --id OPERATION_ID`. Assert full operation detail displayed.
39. **`cli-operations-list-unauthenticated`** — Run without auth token. Assert auth error message.

## TUI Snapshot Tests

### File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

40. **`tui-oplog-default-state-120x40`** — Navigate to repo at 120×40, press `5`. Snapshot. Assert operation list visible with header "Operations (N)". Columns: op ID, type, description, timestamp.
41. **`tui-oplog-default-state-80x24`** — At 80×24, press `5`. Snapshot. Assert only type, description, timestamp columns. Op ID hidden.
42. **`tui-oplog-default-state-200x60`** — At 200×60, press `5`. Snapshot. Assert all columns including user and parent op ID.
43. **`tui-oplog-detail-view`** — Press `5` then `Enter`. Snapshot. Assert detail view with full metadata.
44. **`tui-oplog-filter-active`** — Press `5` then `/`. Snapshot. Assert filter input visible.
45. **`tui-oplog-filter-results`** — Press `5`, `/`, type "snapshot". Snapshot. Assert filtered results.
46. **`tui-oplog-filter-no-results`** — Press `5`, `/`, type "zzzznonexistent". Snapshot. Assert "No matching operations."
47. **`tui-oplog-empty-state`** — Repo with no operations. Press `5`. Snapshot. Assert "No operations recorded."
48. **`tui-oplog-error-state`** — API returns 500. Press `5`. Snapshot. Assert error with retry hint.
49. **`tui-oplog-navigate-j-k`** — Press `5`, `j`, `j`, `k`. Assert focus moves down 2, up 1, landing on row 2.
50. **`tui-oplog-enter-detail-and-back`** — Press `5`, `j`, `Enter`, `q`. Assert detail shows for row 2, then returns to list with row 2 focused.
51. **`tui-oplog-copy-id`** — Press `5`, `y`. Assert "Copied!" appears in status bar. Assert clipboard contains operation ID.
52. **`tui-oplog-refresh`** — Press `5`, `R`. Assert list reloads from API.
53. **`tui-oplog-pagination`** — >50 operations, scroll to bottom. Assert next page loads.
54. **`tui-oplog-resize-columns`** — Start at 120×40, resize to 80×24. Assert op ID column disappears; focus preserved.
55. **`tui-oplog-navigate-G-gg`** — Press `5`, `G`. Assert focus on last row. Press `g`, `g`. Assert focus on first row.
56. **`tui-oplog-page-down-up`** — Press `5`, `Ctrl+D`, `Ctrl+U`. Assert scroll advances and returns.
57. **`tui-oplog-filter-case-insensitive`** — Press `5`, `/`, type "SNAPSHOT". Assert matches lowercase "snapshot" type operations.
58. **`tui-oplog-tab-switch`** — Press `5`, then `Tab`. Assert switches to tab 6. Press `Shift+Tab` twice. Assert returns to tab 4.
59. **`tui-oplog-boundary-top`** — Press `5`, `k`. Assert focus stays on first row (no crash or wrap).
60. **`tui-oplog-boundary-bottom`** — Press `5`, `G`, `j`. Assert focus stays on last row.

## Web UI E2E Tests (Playwright)

### File: `e2e/web/operations.test.ts`

61. **`web-operations-tab-visible`** — Navigate to repository page. Assert "Operations" tab is visible in navigation.
62. **`web-operations-tab-click-loads-list`** — Click Operations tab. Assert operation list loads with at least one row.
63. **`web-operations-list-columns`** — Assert each row shows operation type, description, and timestamp.
64. **`web-operations-list-count-header`** — Assert section header shows "Operations (N)" with correct count.
65. **`web-operations-click-operation-detail`** — Click an operation row. Assert detail view shows full operation metadata.
66. **`web-operations-detail-copy-id`** — In detail view, click copy button. Assert clipboard contains operation ID.
67. **`web-operations-detail-back-navigation`** — From detail, click back. Assert list view restored with scroll position preserved.
68. **`web-operations-filter`** — Type in filter input. Assert list narrows to matching operations.
69. **`web-operations-empty-repo`** — Navigate to repo with no operations. Assert empty state message.
70. **`web-operations-pagination`** — Repository with >30 operations. Scroll to bottom or click "Load more". Assert additional operations appear.
71. **`web-operations-feature-flag-disabled`** — Disable feature flag. Assert Operations tab is hidden or shows disabled state.
72. **`web-operations-private-repo-unauthorized`** — Navigate to private repo Operations tab without access. Assert 404 page.
73. **`web-operations-timestamps-relative`** — Assert timestamps in list view are displayed as relative times (e.g., "3 minutes ago").
74. **`web-operations-timestamps-absolute-in-detail`** — Assert timestamps in detail view are absolute ISO 8601 format.
75. **`web-operations-operation-type-badge-color`** — Assert different operation types have distinct visual badges/colors.
