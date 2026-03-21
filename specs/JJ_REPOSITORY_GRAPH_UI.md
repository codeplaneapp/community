# JJ_REPOSITORY_GRAPH_UI

Specification for JJ_REPOSITORY_GRAPH_UI.

## High-Level User POV

When a developer opens a repository on Codeplane, the **Graph** tab is a dedicated visualization surface in the repository workbench — sitting alongside Changes, Bookmarks, Code, Issues, and Landings in the top navigation. While the Changes tab presents history as a linear paginated list, the Graph tab renders the repository's change history as a visual directed acyclic graph (DAG), giving developers an immediate spatial understanding of how changes branch, merge, and stack across the repository's history.

The graph is the jj-native equivalent of `jj log` with its ASCII art topology, but rendered as an interactive, zoomable, browser-based visualization. Each change is a node in the graph, positioned according to its parent-child relationships. Lines connect parents to children, forming the familiar railroad-track pattern that makes branching and merging patterns instantly visible. Unlike a flat commit list, the graph makes it obvious when a developer's work diverges from a shared base, when two lines of development merge, when a stack of changes forms a clean linear chain, and where conflicts have emerged.

Nodes in the graph carry rich information at a glance. Each node displays the short Change ID, the first line of the description, the author's name, and visual indicators for conflicts (⚠) and empty changes (∅). Bookmarks are rendered as labeled badges attached to their target nodes, making it easy to see which changes correspond to named references. The working-copy change — the change currently checked out by the repository owner — is visually emphasized so that the current state of the repository is always clear.

The graph supports interactive exploration. Users can click any node to see a popover with full change metadata — the complete Change ID and Commit ID with copy buttons, the full description, author details, parent links, and action buttons for navigating to the change detail, diff view, or code explorer at that revision. Users can pan the graph by dragging, zoom in and out with the scroll wheel or pinch gestures, and use keyboard shortcuts to navigate between nodes. A minimap in the corner provides spatial orientation in large histories.

For repositories with long histories, the graph loads progressively. An initial viewport of changes renders immediately, and as the user scrolls or pans toward the edges of the loaded region, additional changes are fetched and appended to the graph. The user never waits for the entire history to load — only the visible region and a buffer zone around it are materialized.

Filtering controls above the graph let users narrow the displayed history. A revset input field accepts jj revset expressions, allowing power users to scope the graph to exactly the subset of changes they care about — for example, `ancestors(bookmark_name)` to see only the history leading to a specific bookmark, or `author(name) & ~empty()` to find non-empty changes by a specific author. Predefined filter presets offer common views: "All changes" (default), "Bookmarked changes," "Conflicted changes," "My changes," and "Recent (last 7 days)." The sort and layout controls let users choose between a top-down vertical layout (default) and a left-to-right horizontal layout.

The Graph tab works for both public and private repositories, respects access control, and provides a uniquely powerful visualization for jj-native workflows. Teams practicing stacked-change development can see their entire stack in spatial context, understand where each team member's work sits relative to shared bookmarks, and spot conflicts before they attempt to land. The graph turns abstract change relationships into a legible map of the repository's evolution.

## Acceptance Criteria

### Definition of Done

- [ ] The web UI route `/:owner/:repo/graph` renders an interactive DAG visualization within the repository workbench
- [ ] The Graph tab appears in the repository navigation alongside Changes, Bookmarks, Code, Issues, Landings, etc.
- [ ] The graph is constructed from `parent_change_ids` relationships returned by `GET /api/repos/:owner/:repo/changes`
- [ ] Bookmark positions are overlaid by consuming `GET /api/repos/:owner/:repo/bookmarks`
- [ ] The graph supports pan, zoom, click-to-select, and keyboard navigation
- [ ] A revset filter input allows scoping the visible graph to an arbitrary jj revset expression
- [ ] Predefined filter presets provide common views without requiring revset knowledge
- [ ] Progressive loading fetches additional history as the user scrolls toward graph edges
- [ ] The feature is covered by Playwright end-to-end tests
- [ ] The graph works for authenticated users on private repositories and anonymous users on public repositories
- [ ] The graph data is consistent with CLI `change list` output and the Changes tab for the same repository

### Functional Constraints — Graph Rendering

- [ ] Each change is rendered as a node containing: short Change ID (12 chars, monospace, primary color), first line of description (truncated at 60 chars with ellipsis), author name (truncated at 20 chars), and relative timestamp
- [ ] Conflict indicator (⚠ in warning color, warning-tinted node border) displayed on nodes where `has_conflict: true`
- [ ] Empty indicator (∅ in muted color, muted/dashed node border) displayed on nodes where `is_empty: true`
- [ ] Nodes that are both conflicted AND empty display both indicators simultaneously; conflict border color takes precedence
- [ ] Parent-child edges are drawn as directed lines from parent node to child node
- [ ] Edge colors distinguish branch lineages — each distinct branch of the graph uses a different color from a palette of at least 8 colors, cycling if more branches exist
- [ ] Merge edges (a child with 2+ parents) are rendered with a visually distinct merge indicator at the child node
- [ ] Root nodes (changes with no parents) display a "root" visual indicator
- [ ] The working-copy change (if identifiable) is rendered with a highlighted border and "working copy" label badge
- [ ] Bookmark badges are rendered as colored labels attached to the node matching the bookmark's `target_change_id`
- [ ] Multiple bookmarks on the same node are stacked vertically beside the node
- [ ] Graph layout must avoid node overlapping — a layout algorithm positions nodes such that no two nodes or edges overlap
- [ ] The graph viewport shows at minimum 20 nodes before requiring scroll/pan, if 20+ changes exist

### Functional Constraints — Interaction

- [ ] Click on node: Opens a popover with full change metadata — full Change ID (copyable), full Commit ID (copyable), complete description, author, timestamp, parent Change IDs as clickable links, and action buttons: "View Detail," "View Diff," "Browse at Revision"
- [ ] Click on bookmark badge: Navigates to `/:owner/:repo/bookmarks/:name`
- [ ] Double-click on node: Navigates directly to `/:owner/:repo/changes/:change_id`
- [ ] Pan: Click and drag on empty canvas area pans the viewport
- [ ] Zoom: Mouse wheel or trackpad pinch zooms in/out. Minimum zoom: 10%. Maximum zoom: 300%
- [ ] Zoom controls: Toolbar buttons for Zoom In (+), Zoom Out (−), Fit All, and Reset
- [ ] Keyboard navigation: Arrow keys move selection between connected nodes. Enter opens popover. Escape closes popover. `f` triggers Fit All. `0` triggers Reset zoom
- [ ] Minimap: A small semi-transparent minimap in the bottom-right corner shows the entire loaded graph with a viewport indicator rectangle, toggleable via toolbar button
- [ ] Hover: Hovering over a node highlights that node and its direct parent/child edges
- [ ] Right-click context menu on a node: "Copy Change ID," "Copy Commit ID," "View Detail," "View Diff," "Browse at Revision"

### Functional Constraints — Filtering

- [ ] Revset input: A text input field above the graph accepts jj revset expressions. Pressing Enter or clicking "Apply" re-fetches and re-renders
- [ ] Revset input has autocomplete suggestions for bookmark names and common revset functions
- [ ] Invalid revset expressions display an inline error message below the input
- [ ] Predefined presets: "All changes" (default), "Bookmarked" (`bookmarks()`), "Conflicted" (`conflict()`), "My changes" (`author(email:<current_user_email>)`), "Recent (7 days)" (`committer_date(after:'7 days ago')`), "Trunk to tips" (`trunk()..`)
- [ ] Selecting a preset populates the revset input and applies it
- [ ] Active filter reflected in URL query string (`?revset=...`) for shareable/bookmarkable views
- [ ] Empty result set shows "No changes match this filter" with a "Clear filter" button

### Functional Constraints — Layout Controls

- [ ] Orientation toggle: Vertical (top-down, default) or Horizontal (left-to-right). Persisted in local preferences
- [ ] Spacing controls: Compact and Comfortable options. Persisted in local preferences
- [ ] Layout changes apply immediately without re-fetching data

### Functional Constraints — Progressive Loading

- [ ] Initial load fetches the first 100 changes
- [ ] When user pans within 20% of loaded graph edge, next page fetched automatically
- [ ] Loading indicator shown during fetches
- [ ] `next_cursor` empty string signals end of history
- [ ] Maximum loaded node count: 2000 changes. Beyond this, a banner reads "Showing 2000 most recent changes. Use a revset filter to explore older history."
- [ ] Newly loaded nodes inserted with smooth animation

### Pagination Constraints

- [ ] API pagination uses cursor-based model with `cursor` and `limit` query parameters
- [ ] Default page size for graph: 100. Maximum: 100. Values above 100 clamped silently
- [ ] `limit=0` or negative returns 400 Bad Request
- [ ] Non-numeric limit returns 400 Bad Request
- [ ] `next_cursor: ""` signals end of pagination
- [ ] Cursor values are opaque to the UI

### Edge Cases

- [ ] Empty repository: Empty state with "This repository has no changes yet"
- [ ] Single change: One node centered, no edges
- [ ] Linear history: Graph degenerates to a vertical/horizontal line
- [ ] Wide merges (5+ parents): All parent edges rendered without overlapping
- [ ] Extremely long descriptions (up to 64KB): Truncated at 60 chars in node; full in popover
- [ ] Unicode in author names and descriptions: Rendered correctly
- [ ] Empty author name: "Unknown" placeholder
- [ ] Empty description: "(no description)" in muted italic
- [ ] Change IDs full-length hex: Truncated to 12 chars in nodes, full in popover
- [ ] Private repos return 404 (not 403) to anonymous users
- [ ] Large repos (10,000+ changes): Progressive loading and 2000-node cap prevent memory exhaustion; 60fps target with 2000 nodes
- [ ] Concurrent mutation: "Repository updated, click to refresh" banner
- [ ] Revset syntax errors: Error inline, graph retains previous valid state
- [ ] Browser resize: Graph reflows; minimap resizes; zoom preserved
- [ ] Touch devices: Pan via drag, zoom via pinch, tap = click, long-press = context menu
- [ ] Accessibility: Nodes focusable with ARIA labels; screen reader traversal via keyboard; color not sole differentiator

### Boundary Constraints

- [ ] Maximum revset expression length: 1000 characters
- [ ] Maximum loaded node count: 2000
- [ ] Minimum zoom: 10%. Maximum zoom: 300%
- [ ] Node label limits: Change ID 12 chars, description 60 chars, author name 20 chars
- [ ] Bookmark badge max: 30 characters with ellipsis
- [ ] Max bookmarks per node: 5 visible, then "+N more" overflow
- [ ] Popover description max: 4000 characters with "Show full description" link

## Design

### Web UI Design

#### Route and Navigation

The graph is accessible at `/:owner/:repo/graph`. It appears as a tab labeled "Graph" with a DAG icon in the repository navigation bar, positioned after "Changes" and before "Issues." The tab is always visible regardless of authentication state.

#### Layout Structure

The page consists of:
1. **Toolbar bar** (top): Contains the revset input field with Apply button, Presets dropdown, Layout toggle (Vertical/Horizontal), Spacing toggle (Compact/Comfortable), and zoom controls (Zoom In, Zoom Out, Fit All, Reset, Toggle Minimap)
2. **Graph canvas** (main area): An interactive SVG/Canvas viewport rendering the DAG
3. **Minimap** (bottom-right overlay): A 150×100px semi-transparent overview of the entire loaded graph with a viewport indicator rectangle

#### Node Design

Each node is a rounded rectangle with:
- **Left**: A circle glyph — filled (◉) for working copy, open (○) for regular, warning-bordered for conflicted, dashed for empty — colored by branch lineage
- **Center**: Short Change ID (monospace, 12 chars), description first line (max 60 chars), and status icons (⚠ ∅)
- **Right**: Author name (max 20 chars) and relative timestamp in muted text
- **Attached badges**: Bookmark names in colored pill badges (max 5 visible, then "+N more")

Nodes adapt to zoom level: at low zoom they collapse to circles with only Change ID; at medium zoom, description and author appear; at high zoom, full detail is visible.

#### Popover Design

On node click, a popover anchored to the selected node shows:
- Full Change ID with copy-to-clipboard button
- Full Commit ID (40 chars) with copy-to-clipboard button
- Status badges: "Conflict" (warning) and/or "Empty" (muted) if applicable
- Full description (up to 4000 chars, with "Show full description" link beyond that)
- Author: avatar, name (linked to profile if Codeplane user), email, timestamp (relative + absolute ISO 8601)
- Parent Change IDs as clickable monospace links
- Action buttons: "View Detail" → `/:owner/:repo/changes/:change_id`, "View Diff" → `/:owner/:repo/changes/:change_id/diff`, "Browse at Revision" → code explorer

#### Color Palette

Edge and branch colors cycle through: blue, green, purple, orange, cyan, magenta, teal, pink. All colors meet WCAG AA contrast ratio against both light and dark backgrounds. Each topological "lane" receives a stable color.

#### Dark/Light Theme

The graph respects the application's theme. Node backgrounds, edge colors, text, and canvas background adapt. The minimap uses a semi-transparent overlay working in both themes.

### API Shape

**Existing endpoints consumed:**
- `GET /api/repos/:owner/:repo/changes?cursor=<cursor>&limit=<limit>` — Paginated changes with `parent_change_ids`
- `GET /api/repos/:owner/:repo/bookmarks?cursor=<cursor>&limit=<limit>` — Bookmarks with `target_change_id`

**New parameter on existing endpoint:**

`GET /api/repos/:owner/:repo/changes?revset=<expression>&cursor=<cursor>&limit=<limit>`

- `revset` (string, optional, max 1000 chars): jj revset expression passed as `-r` argument to `jj log`
- `cursor` (string, optional): Pagination cursor
- `limit` (integer, optional, default 100 for graph context, max 100): Page size
- Response: `{ items: Change[], next_cursor: string }`
- Errors: 400 (invalid revset / revset too long), 404 (repo not found / no access), 504 (jj timeout)

Each `Change` in the response has shape:
```
{
  change_id: string,
  commit_id: string,
  description: string,
  author_name: string,
  author_email: string,
  timestamp: string,
  has_conflict: boolean,
  is_empty: boolean,
  parent_change_ids: string[]
}
```

Revset validation: max 1000 chars, no null bytes, jj validates syntax. Parse errors from jj returned as 400 with error text.

### SDK Shape

The `RepoHostService` in `packages/sdk` exposes the `listChanges` method, which gains an optional `revset` parameter:

```
listChanges(owner, repo, { cursor?, limit?, revset? })
  → Result<{ items: Change[], nextCursor: string }, APIError>
```

When `revset` is provided, the service passes `-r <revset>` to `jj log`. The service enforces:
- Max 1000 character revset length (returns `badRequest` if exceeded)
- Null byte rejection (returns `badRequest`)
- 10-second subprocess timeout (returns gateway timeout)
- jj stderr surfaced as a 400 response body on parse errors

### CLI Command

No new CLI command for graph visualization. The existing `codeplane change list` gains a new flag:

```
codeplane change list --revset <expression>
codeplane change list -r <expression>
```

- Filters changes by jj revset expression (max 1000 chars)
- Output: Same tabular change list, filtered by the revset
- Error: Invalid revset prints API error message, exits with code 1
- Revset expression exceeding 1000 characters prints "revset expression must be 1000 characters or fewer" and exits with code 1

### TUI UI

The TUI does not render a graphical DAG visualization (terminal rendering constraints). Instead, the TUI's existing Changes view (Tab `2` in repository detail) supports a tree-indentation mode at 120+ column widths, showing parent-child indentation using connector characters (`│`, `├`, `└`). This is the TUI analog of the graph.

The TUI changes view gains a `/` key to open a revset filter input, matching the web graph's filtering capability:
- Type a revset expression and press Enter to filter
- Press Escape to cancel
- Invalid revset shows an error toast for 3 seconds
- Active filter shown in a status bar indicator

### Documentation

1. **User Guide — "Repository Graph"**: Explains the graph visualization, navigation (pan, zoom, click, keyboard), revset filtering with examples, and visual element interpretation. Includes annotated screenshots.
2. **User Guide — "Revset Filtering"**: Table of useful revset functions (`ancestors()`, `descendants()`, `author()`, `description()`, `empty()`, `conflict()`, `bookmarks()`, `trunk()`) with examples. Links to jj upstream docs.
3. **API Reference update**: Document the `revset` query parameter on `GET /api/repos/:owner/:repo/changes`.
4. **CLI Reference update**: Document `change list --revset` / `-r` flag.
5. **Keyboard Shortcuts Reference**: Add Graph shortcuts to the keyboard help modal (Arrow keys, Enter, Escape, f, 0, m).

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Repository Owner | Full access to graph on own repositories |
| Organization Admin | Full access to graph on org repositories |
| Team Member (Write) | Full access to graph on assigned repositories |
| Team Member (Read) | Full access to graph on assigned repositories |
| Authenticated User (no explicit access) | Access to graph on public repositories only. Private repos return 404 |
| Anonymous | Access to graph on public repositories only. Private repos return 404 |

The graph is a read-only visualization. No write permissions required. All access checks happen at the API layer using the same repository visibility and membership checks as other repository routes. Private repositories must return 404 (not 403) to unauthorized users to avoid leaking the repository's existence.

### Rate Limiting

- Changes list endpoint (including with `revset`): 60 requests per minute per user (or per IP for anonymous)
- Bookmarks list endpoint: Standard 60 requests per minute per user
- Burst allowance: Up to 10 requests in a 1-second window to accommodate rapid graph scrolling/panning
- Revset abuse protection: Revset expressions causing jj to run longer than 10 seconds are terminated server-side with 504 response. 5+ timeouts in a 5-minute window throttles subsequent revset requests to 1 per 30 seconds for that user
- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` included on all responses
- 429 responses include `Retry-After` header

### Data Privacy

- The graph displays the same change metadata (Change ID, Commit ID, description, author name, author email, timestamps) already available through the Changes tab and API. No additional PII exposed
- Author email addresses in the popover follow the same display rules as the change detail page — shown to authenticated users, potentially redacted for anonymous users based on settings
- The revset input is logged server-side for debugging but must not be returned in client-facing error messages beyond jj's own error output (prevents information leakage about repository internals through crafted revset probes on private repos)
- Revset expressions must be sanitized before being passed to `jj` CLI to prevent command injection — the service uses array-based argument passing (not string interpolation) for subprocess invocation

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `graph.viewed` | User navigates to Graph tab | `repo_id`, `owner`, `repo_name`, `is_authenticated`, `is_public_repo`, `initial_change_count` |
| `graph.node_clicked` | User clicks a node to open popover | `repo_id`, `change_id`, `has_conflict`, `is_empty`, `node_depth_in_graph` |
| `graph.node_navigated` | User navigates from popover to detail/diff/browse | `repo_id`, `change_id`, `destination` (`detail` | `diff` | `browse`) |
| `graph.revset_applied` | User applies a revset filter | `repo_id`, `revset_length`, `is_preset`, `preset_name` (if applicable), `result_count`, `had_error` |
| `graph.revset_error` | Revset expression fails | `repo_id`, `revset_length`, `error_type` (`syntax` | `timeout` | `unknown`) |
| `graph.progressive_load` | Additional page loaded | `repo_id`, `page_number`, `cumulative_node_count`, `triggered_by` (`scroll` | `pan`) |
| `graph.layout_changed` | User changes orientation/spacing | `repo_id`, `orientation` (`vertical` | `horizontal`), `spacing` (`compact` | `comfortable`) |
| `graph.zoom_action` | User zooms | `repo_id`, `zoom_level_percent`, `action` (`wheel` | `pinch` | `button_in` | `button_out` | `fit` | `reset`) |
| `graph.max_nodes_reached` | 2000-node cap reached | `repo_id`, `total_changes_in_repo` (if known) |
| `graph.bookmark_badge_clicked` | User clicks a bookmark badge | `repo_id`, `bookmark_name`, `target_change_id` |
| `graph.context_menu_used` | User opens right-click context menu | `repo_id`, `change_id`, `action_selected` |
| `graph.copy_id` | User copies a Change ID or Commit ID | `repo_id`, `change_id`, `id_type` (`change_id` | `commit_id`) |

### Funnel Metrics

1. **Graph adoption rate**: % of active repository users who visit Graph tab at least once per week
2. **Graph engagement depth**: Average number of node clicks per graph session
3. **Revset filter usage**: % of graph sessions that apply at least one revset filter
4. **Graph → Detail conversion**: % of graph sessions navigating from popover to change detail or diff
5. **Progressive load depth**: Average pages loaded per graph session
6. **Return rate**: % of users visiting Graph tab more than once in 7 days

### Success Indicators

- Graph tab visited by ≥20% of weekly active repo users within 4 weeks of launch
- Revset filtering used in ≥10% of graph sessions
- Graph → Detail navigation rate ≥30%
- p95 time-to-interactive for initial render ≤2 seconds on 500-change repo
- 2000-node cap hit in <5% of sessions (indicates appropriate default load)

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Changes list request received | `info` | `owner`, `repo`, `has_revset`, `revset_length`, `cursor`, `limit`, `user_id` (or `anonymous`) |
| jj log command executed | `debug` | `owner`, `repo`, `args` (redacted revset to first 100 chars), `duration_ms`, `exit_code`, `change_count` |
| jj log command failed | `warn` | `owner`, `repo`, `exit_code`, `stderr` (first 500 chars), `duration_ms` |
| jj log command timed out | `error` | `owner`, `repo`, `revset` (first 100 chars), `timeout_ms` |
| Revset validation failed (too long) | `info` | `owner`, `repo`, `revset_length`, `user_id` |
| Revset null byte rejected | `warn` | `owner`, `repo`, `user_id` |
| Changes list response sent | `info` | `owner`, `repo`, `status_code`, `item_count`, `has_next_cursor`, `duration_ms` |
| Rate limit exceeded for revset | `warn` | `user_id`, `owner`, `repo`, `requests_in_window` |
| Revset timeout throttle activated | `warn` | `user_id`, `timeout_count_in_window` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_graph_requests_total` | Counter | `owner`, `repo`, `status`, `has_revset` | Total graph API requests |
| `codeplane_graph_request_duration_seconds` | Histogram | `owner`, `repo`, `has_revset` | Request latency (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_graph_jj_log_duration_seconds` | Histogram | `has_revset` | jj log subprocess duration (buckets: 0.05, 0.1, 0.5, 1, 2, 5, 10) |
| `codeplane_graph_changes_returned` | Histogram | `has_revset` | Changes per response (buckets: 0, 1, 10, 50, 100) |
| `codeplane_graph_revset_errors_total` | Counter | `error_type` | Revset validation/execution errors |
| `codeplane_graph_revset_timeouts_total` | Counter | — | jj log commands killed due to timeout |
| `codeplane_graph_progressive_loads_total` | Counter | `owner`, `repo` | Progressive load requests (page > 1) |
| `codeplane_graph_active_revset_throttles` | Gauge | — | Number of users currently throttled for revset abuse |

### Alerts

#### Alert: High Graph API Error Rate
**Condition:** `rate(codeplane_graph_requests_total{status=~"5.."}[5m]) / rate(codeplane_graph_requests_total[5m]) > 0.05` for 5 minutes
**Severity:** Warning
**Runbook:**
1. Check `codeplane_graph_requests_total` by status code to identify the specific 5xx error
2. If 500s dominate: Check application logs for `jj log command failed` entries. Common causes: jj binary not found, repository disk corruption, file system full
3. If 504s dominate: Check `codeplane_graph_jj_log_duration_seconds` for elevated latencies. Look for expensive revset expressions in logs
4. Verify jj is accessible: `which jj && jj --version` on the affected host
5. Check disk space: `df -h` on the data directory
6. If a specific repository triggers all errors, inspect it: `cd <repo_path> && jj status`
7. Escalate if: error rate above 20% for 10+ minutes or affects all repositories

#### Alert: Graph API Latency Degradation
**Condition:** `histogram_quantile(0.95, rate(codeplane_graph_request_duration_seconds_bucket[5m])) > 5` for 5 minutes
**Severity:** Warning
**Runbook:**
1. Check `codeplane_graph_jj_log_duration_seconds` to determine if jj subprocess is the bottleneck
2. If jj is slow: Check system load (`uptime`, `top`). jj is CPU-bound during log traversal
3. Filter metrics by `owner`/`repo` labels to identify specific problematic repositories
4. Review recent revset expressions in logs — complex revsets on large repos can be expensive
5. Consider temporarily lowering timeout from 10s to 5s if pathological revsets are common
6. If system-wide: Check disk I/O saturation and whether data volume has grown significantly

#### Alert: Revset Timeout Spike
**Condition:** `rate(codeplane_graph_revset_timeouts_total[10m]) > 0.5` (more than 3 timeouts/min sustained)
**Severity:** Info
**Runbook:**
1. Often indicates users exploring large repositories with broad revsets
2. Review timeout logs for specific revset expressions causing issues
3. If single user/repo: Consider outreach to help craft efficient revsets
4. If system-wide: jj may be under resource pressure; check CPU and I/O
5. No immediate action unless accompanied by the high error rate alert

#### Alert: Progressive Load Spike
**Condition:** `rate(codeplane_graph_progressive_loads_total[5m]) > 50` sustained for 10 minutes
**Severity:** Info
**Runbook:**
1. Likely indicates a single user or bot rapidly scrolling through graph history
2. Check if a single IP/user accounts for majority of load
3. If abuse: rate limiter should handle; verify rate limiting is functioning
4. If legitimate: no action, but monitor downstream jj subprocess CPU usage

### Error Cases and Failure Modes

| Error | HTTP Status | User-Facing Behavior | Logging |
|-------|-------------|---------------------|----------|
| Repository not found | 404 | "Repository not found" page | `info`, expected |
| Unauthorized (private repo) | 404 | "Repository not found" (no 403) | `info`, expected |
| Invalid revset syntax | 400 | Inline error below revset input | `info` |
| Revset too long (>1000 chars) | 400 | Client-side validation prevents; server returns "revset expression exceeds maximum length of 1000 characters" | Client-side only |
| Revset contains null byte | 400 | "Invalid characters in revset expression" | `warn` |
| jj log timeout (>10s) | 504 | "This query took too long. Try a more specific revset filter." | `error` |
| jj binary not found | 500 | "Internal server error. Please try again." | `error`, critical |
| Repository disk corruption | 500 | "Unable to read repository data." | `error`, critical |
| Rate limit exceeded | 429 | "Too many requests." with `Retry-After` header | `warn` |
| Client OOM (2000+ nodes) | N/A | 2000-node cap banner | Client telemetry |
| Network error during progressive load | N/A | "Failed to load more changes. Click to retry." with retry button | Client-side |

## Verification

### API Integration Tests

1. **Graph changes list — default (no revset)**: `GET /api/repos/:owner/:repo/changes?limit=100` returns up to 100 changes with `parent_change_ids` arrays. Verify response shape matches `{ items: Change[], next_cursor: string }`.
2. **Graph changes list — pagination**: Repository with 150 changes. Fetch `limit=100`, verify `next_cursor` non-empty. Fetch with cursor, verify remaining 50 and empty `next_cursor`.
3. **Graph changes list — pagination exhaustion**: Fetch all pages. Verify total unique change count matches repository size.
4. **Graph changes list — limit=1**: Returns exactly 1 change with valid `next_cursor`.
5. **Graph changes list — limit=100 (maximum)**: Returns up to 100 changes.
6. **Graph changes list — limit=101 (above max)**: Returns at most 100 (clamped silently). No error.
7. **Graph changes list — limit=0**: Returns 400 with message "invalid limit value".
8. **Graph changes list — limit=-1**: Returns 400 with message "invalid limit value".
9. **Graph changes list — limit=abc (non-numeric)**: Returns 400 with message "invalid limit value".
10. **Graph changes list — revset valid**: `?revset=bookmarks()` returns only bookmarked changes.
11. **Graph changes list — revset ancestors**: Linear chain A→B→C. `?revset=ancestors(C)` returns A, B, C.
12. **Graph changes list — revset empty result**: `?revset=author(email:nonexistent@nowhere.com)` returns `{ items: [], next_cursor: "" }`.
13. **Graph changes list — revset syntax error**: `?revset=invalid((` returns 400 with jj parse error in message body.
14. **Graph changes list — revset max length (1000 chars)**: Valid 1000-char revset returns 200.
15. **Graph changes list — revset over max (1001 chars)**: Returns 400 with max length error message.
16. **Graph changes list — revset special characters**: `?revset=author(email:"user+tag@example.com")` parses correctly.
17. **Graph changes list — revset null byte**: `?revset=all()\x00` returns 400.
18. **Graph changes list — parent_change_ids correctness**: Merge change C with parents A and B. Verify C's `parent_change_ids` contains both A and B change IDs.
19. **Graph changes list — root change empty parents**: Root change has `parent_change_ids: []`.
20. **Graph changes list — private repo unauthenticated**: Returns 404.
21. **Graph changes list — private repo with access**: Returns 200 with changes.
22. **Graph changes list — private repo without access (authenticated but no permissions)**: Returns 404.
23. **Graph changes list — public repo unauthenticated**: Returns 200.
24. **Graph changes list — rate limiting**: 65 requests in 1 minute; 61st+ returns 429 with `Retry-After` header.
25. **Graph changes list — revset timeout**: Expensive revset returns 504 within ~10s.
26. **Bookmarks overlay**: Verify each bookmark's `target_change_id` matches a change in the changes response.
27. **Graph changes list — empty repository**: Returns `{ items: [], next_cursor: "" }`.
28. **Graph changes list — cursor reuse after filter change**: Applying a new revset resets pagination (old cursor invalid).
29. **Graph changes list — concurrent revset + cursor**: Providing both `revset` and `cursor` works correctly for paginated filtered results.

### Playwright (Web UI) End-to-End Tests

30. **Graph tab renders**: Navigate to `/:owner/:repo/graph`. Verify graph canvas element present with `[data-testid="graph-canvas"]`.
31. **Graph tab navigation**: Click "Graph" tab from overview. Verify URL changes to `/:owner/:repo/graph`.
32. **Graph shows nodes**: Repository with 5 changes shows 5 nodes with `[data-testid="graph-node"]`.
33. **Graph shows edges**: Linear 3-change history shows 2 edges with `[data-testid="graph-edge"]`.
34. **Graph shows bookmark badges**: Bookmark badge appears on correct node with bookmark name text.
35. **Node click opens popover**: Click node, verify popover with Change ID, Commit ID, description, author, actions visible.
36. **Popover copy Change ID**: Click copy button, verify clipboard contains full Change ID.
37. **Popover View Detail navigation**: Click "View Detail", verify navigation to `/:owner/:repo/changes/:change_id`.
38. **Popover View Diff navigation**: Click "View Diff", verify navigation to `/:owner/:repo/changes/:change_id/diff`.
39. **Double-click navigates to detail**: Double-click node, verify navigation to change detail page.
40. **Popover close on Escape**: Open popover, press Escape, verify popover is dismissed.
41. **Revset filter — apply valid**: Type `bookmarks()`, press Enter. Graph re-renders with only bookmarked changes.
42. **Revset filter — error display**: Type `invalid((`, press Enter. Inline error message appears below input.
43. **Revset filter — clear restores all**: Apply filter, clear input, press Enter. All changes shown.
44. **Revset filter — preserves graph state on error**: Apply valid filter, then apply invalid filter. Graph retains previous valid state.
45. **Revset preset selection**: Click "Conflicted" preset. Input populates with `conflict()`, graph updates.
46. **Revset URL persistence**: Apply `bookmarks()`. Verify URL contains `?revset=bookmarks()`. Reload page, verify filter still applied and graph shows filtered results.
47. **Layout toggle vertical to horizontal**: Switch to horizontal. Verify graph re-renders with horizontal orientation. Nodes arranged left-to-right.
48. **Layout toggle persisted**: Switch to horizontal, navigate away, return. Layout remains horizontal.
49. **Zoom Fit All**: Click Fit All button. All loaded nodes visible within viewport.
50. **Zoom in/out buttons**: Click zoom in, verify zoom level increases. Click zoom out, verify decreases.
51. **Zoom min/max bounds**: Zoom out to minimum (10%), verify cannot zoom further. Zoom in to maximum (300%), verify cannot zoom further.
52. **Minimap toggle**: Verify minimap visible by default. Toggle off via toolbar, verify hidden. Toggle on, verify visible again.
53. **Empty repository graph**: Navigate to empty repo's graph tab. "This repository has no changes yet" empty state displayed.
54. **Conflict indicator**: Conflicted change has ⚠ icon and warning-colored border.
55. **Empty indicator**: Empty change has ∅ icon and dashed border.
56. **Conflict + Empty combined**: Change that is both conflicted and empty shows both indicators; conflict border color takes precedence.
57. **Progressive loading**: 150-change repo shows ~100 nodes initially. Pan toward edge, more nodes appear. Verify cumulative count increases.
58. **Max node cap banner**: 2500+ change repo, scroll until banner "Showing 2000 most recent changes. Use a revset filter to explore older history." appears.
59. **Keyboard navigation — arrow keys**: Focus a node, press arrow down, verify next connected node is selected.
60. **Keyboard navigation — Enter opens popover**: Select node with arrows, press Enter, verify popover opens.
61. **Keyboard navigation — f key**: Press `f` to trigger Fit All.
62. **Right-click context menu**: Right-click node, verify context menu appears with "Copy Change ID," "Copy Commit ID," "View Detail," "View Diff," "Browse at Revision."
63. **Right-click context menu — Copy Change ID**: Right-click → "Copy Change ID", verify clipboard.
64. **Dark/light theme**: Toggle theme. Graph canvas, nodes, edges, text all adapt without visual artifacts.
65. **Responsive small viewport**: Resize browser to 1024×768. Graph renders, all toolbar controls accessible, minimap scales.
66. **Touch tap (mobile emulation)**: Emulate touch device, tap node, verify popover opens.
67. **Hover highlights connected edges**: Hover over a node, verify that node and its direct parent/child edges are visually highlighted.
68. **Loading indicator during fetch**: During progressive load, a loading spinner or skeleton is visible.
69. **Multiple bookmarks on one node**: Node with 3 bookmarks shows all 3 badges stacked. Node with 6 bookmarks shows 5 badges and "+1 more."
70. **Parent links in popover**: Click a parent Change ID link in the popover, verify the corresponding node is selected/centered in the graph.

### CLI Integration Tests

71. **`change list --revset bookmarks()`**: Output contains only bookmarked changes. Exit code 0.
72. **`change list --revset` invalid expression**: Non-zero exit code, error message on stderr.
73. **`change list --revset` 1000-char expression**: Successful output with exit code 0.
74. **`change list --revset` 1001-char expression**: Error message "revset expression must be 1000 characters or fewer", exit code 1.
75. **`change list -r` alias**: `-r` accepted as `--revset` alias, produces same output.
76. **`change list -r conflict()`**: Returns only conflicted changes.
77. **`change list --revset` on empty repo**: Returns empty output, exit code 0.
78. **`change list --revset` on private repo without access**: Returns error, exit code 1.
79. **`change list --revset` with JSON output**: `--json` flag produces valid JSON array of changes matching the revset.

### Performance Tests

80. **Initial render time**: 500-change repo, navigation to Graph tab until first meaningful paint ≤2 seconds.
81. **Pan/zoom frame rate**: 2000 nodes loaded, pan/zoom maintains ≥30fps (measured via Performance API).
82. **Progressive load latency**: 500-change repo, each page fetch completes in ≤1 second.
83. **Revset filter round-trip**: Apply `bookmarks()` filter, measure time from Enter to graph re-render ≤1.5 seconds on 500-change repo.
