# TUI_WORKFLOW_ARTIFACTS_VIEW

Specification for TUI_WORKFLOW_ARTIFACTS_VIEW.

## High-Level User POV

The Workflow Artifacts View is the artifact management surface for a specific workflow run in the Codeplane TUI. It presents a full-screen view of all artifacts produced by a workflow run, allowing developers to browse, inspect, download, and delete build outputs directly from the terminal. The screen is reached by navigating to a workflow run detail and pressing `a` to switch to the artifacts tab, or by selecting "Artifacts" when viewing a run's tab bar. It requires both a repository context and a workflow run context — the screen always shows artifacts for a single, specific run.

The screen occupies the entire content area between the header bar and status bar. At the top is a title row showing "Artifacts" in bold primary color, followed by the total artifact count in parentheses (e.g., "Artifacts (5)") and the total combined size in human-readable format (e.g., "12.4 MB total"). Below the title is a filter toolbar with a text search input for narrowing the list by artifact name and a status filter for ready/pending/expired artifacts.

The main content area is a scrollable list of artifact rows. Each row occupies a single line and shows: the artifact status icon (● green for ready, ◎ yellow for pending, ○ gray for expired), the artifact name, the content type, the file size in human-readable format (bytes/KB/MB/GB), the expiration countdown (e.g., "29d", "6h", "expired"), the release attachment indicator (📎 if attached to a release, blank otherwise), and a relative timestamp of when the artifact was created. Navigation uses vim-style `j`/`k` keys and arrow keys. Pressing `Enter` on a focused artifact opens an artifact detail panel showing full metadata. Pressing `D` (capital) initiates a download via `codeplane artifact download` CLI delegation. Pressing `x` on a focused artifact opens a deletion confirmation overlay.

The list is not paginated — all artifacts for a single run are loaded in one request, as runs typically produce fewer than 100 artifacts. The screen adapts responsively: at 80×24 only the status icon, artifact name, size, and expiration are shown; at 120×40 the content type and created timestamp appear; at 200×60+ the full column set including release tag and download count renders.

The artifact detail panel is a modal overlay showing the complete artifact record: name, content type, size, status, GCS storage path (truncated), created timestamp, confirmed timestamp, expiration timestamp, and release attachment details (tag, asset name, attached date) if present. The panel also shows a "Download" action button and a "Delete" action button with their respective keybindings.

## Acceptance Criteria

### Definition of Done
- [ ] The Workflow Artifacts View renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable by pressing `a` on the workflow run detail screen (tab navigation to "Artifacts" tab)
- [ ] The breadcrumb reads "Dashboard > owner/repo > Workflows > workflow-name > Run #N > Artifacts"
- [ ] Pressing `q` pops the screen and returns to the workflow run detail view
- [ ] Artifacts are fetched via `useWorkflowRunArtifacts()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/actions/runs/:id/artifacts`
- [ ] The list defaults to showing all artifacts sorted by `created_at` descending (newest first)
- [ ] Each row displays: status icon (● green / ◎ yellow / ○ gray), artifact name, content type, size, expiration countdown, release indicator, created timestamp
- [ ] The header shows "Artifacts (N)" where N is the total artifact count, followed by total combined size
- [ ] The filter toolbar is always visible below the title row
- [ ] Status filter changes trigger client-side filtering (all artifacts loaded in a single request)
- [ ] Download action delegates to `codeplane artifact download` CLI command and shows download progress in the status bar
- [ ] Delete action sends `DELETE /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name` and removes the row optimistically
- [ ] Delete requires a confirmation overlay before executing

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next artifact row
- [ ] `k` / `Up`: Move focus to previous artifact row
- [ ] `Enter`: Open artifact detail overlay for focused artifact
- [ ] `/`: Focus search input in filter toolbar
- [ ] `Esc`: Close overlay → clear search → pop screen (context-dependent priority)
- [ ] `G`: Jump to last artifact row
- [ ] `g g`: Jump to first artifact row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `R`: Retry failed API request (only in error state)
- [ ] `f`: Cycle status filter (All → Ready → Pending → Expired → All)
- [ ] `D` (capital): Download focused artifact (opens download progress in status bar)
- [ ] `x`: Delete focused artifact (opens confirmation overlay)
- [ ] `s`: Sort cycle (Created ↓ → Created ↑ → Name A-Z → Name Z-A → Size ↓ → Size ↑)
- [ ] `q`: Pop screen

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Status icon (2ch), name (remaining, truncated), size (7ch), expiration (4ch). Content type/timestamp/release hidden. Toolbar: search only, filter label hidden
- [ ] 120×40 – 199×59: Status icon (2ch), name (30ch), content type (18ch, truncated), size (7ch), expiration (4ch), release indicator (2ch), created timestamp (4ch). Full toolbar with labels
- [ ] 200×60+: All columns including release tag (15ch) and full content type (25ch). Name 40ch. Content type not truncated up to 25ch

### Truncation & Boundary Constraints
- [ ] Artifact name: truncated with `…` at column width (remaining/30ch/40ch)
- [ ] Content type: truncated with `…` at 18ch (standard) / 25ch (large); hidden at minimum
- [ ] Size: human-readable format, max 7ch ("1.2 GB", "345 KB", "89 B")
- [ ] Expiration: max 4ch ("29d", "6h", "23m", "exp", "—" for no expiration)
- [ ] Release indicator: single glyph 📎 (2ch) when attached, blank when not
- [ ] Release tag: truncated at 15ch with `…` (large only)
- [ ] Timestamps: max 4ch ("3d", "1w", "2mo", "1y", "now", "—")
- [ ] Search input: max 120ch
- [ ] Memory cap: 200 artifacts max per run (client-side, exceeding shows cap message)
- [ ] Total size: human-readable, max 10ch ("1.23 GB", "456 MB")
- [ ] GCS path in detail: truncated from left with `…` at 60ch

### Edge Cases
- [ ] Terminal resize while scrolled: focus preserved, columns recalculate
- [ ] Rapid j/k: sequential, no debounce, one row per keypress
- [ ] Filter change while search active: both filters compose (status+search)
- [ ] Unicode in artifact names: truncation respects grapheme clusters
- [ ] Null/missing fields: rendered as "—", no "null" text
- [ ] 200+ artifacts: client-side cap, footer shows count
- [ ] Delete on last remaining artifact: list transitions to empty state
- [ ] Delete 403: status bar error "Permission denied"
- [ ] Delete 404: status bar error "Artifact not found" (already deleted)
- [ ] No artifacts: empty state "No artifacts for this run. Artifacts are produced by workflow steps using the artifacts API."
- [ ] All artifacts expired: shown in muted color with "exp" expiration, still navigable
- [ ] Artifact with pending status: shown with yellow icon, download action shows "Artifact upload not confirmed" in status bar
- [ ] Network disconnect during load: error state with retry prompt
- [ ] Search with special regex characters: treated as literal strings
- [ ] Download while another download is in progress: queued, status bar shows "Downloading… (2 queued)"
- [ ] Artifact name with path separators (e.g., "dist/bundle.js"): rendered as-is, no path splitting
- [ ] Extremely large artifact size (TB+): rendered as "1.2 TB", max 7ch
- [ ] Expiration in the past: shown as "exp" in error color (ANSI 196)
- [ ] Delete confirmation during resize: overlay resizes proportionally (min 30ch width)
- [ ] Sort change preserves focus on same artifact (by ID, not position)

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workflows > ci > #42 > Artifacts │
├──────────────────────────────────────────────────────────┤
│ Artifacts (5)                          12.4 MB  / search │
│ Filter: All                    Sort: Created ↓           │
├──────────────────────────────────────────────────────────┤
│  Name              Type          Size    Exp   📎 Created │
│ ● coverage-report  text/html     2.1 MB  29d      3h     │
│ ● dist-bundle      application…  8.9 MB  29d   📎  3h     │
│ ◎ test-logs        text/plain    1.2 MB  —        3h     │
│ ○ old-snapshot     image/png     156 KB  exp      2w     │
│ ● benchmark-data   application…  45 KB   14d      3h     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Status: j/k:nav Enter:detail D:download x:delete q:back │
└──────────────────────────────────────────────────────────┘
```

The screen is composed of: (1) title row "Artifacts (N)" with total size, (2) persistent filter toolbar with status filter, sort indicator, and search input, (3) column header row (standard+ sizes), (4) `<scrollbox>` with artifact rows, (5) empty/error states.

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, rows, toolbar, column alignment
- `<scrollbox>` — Scrollable artifact list (no scroll-to-end pagination needed; all artifacts loaded at once)
- `<text>` — Artifact names, sizes, types, timestamps, status icons, filter labels, sort indicators
- `<input>` — Search input in filter toolbar (focused via `/`)

### ArtifactRow

Status icon (● green ANSI 34 for ready / ◎ yellow ANSI 178 for pending / ○ gray ANSI 245 for expired), artifact name (default color), content type (muted ANSI 245), size (default color), expiration countdown (default for active, error ANSI 196 for expired, muted for no expiration), release indicator (📎 primary ANSI 33 when attached, blank otherwise), created timestamp (muted ANSI 245). Focused row uses reverse video with primary color (ANSI 33). Expired artifacts render name and type in muted color.

### Artifact Detail Overlay

When `Enter` is pressed on an artifact, a centered modal (60% × 50%) appears with border in primary color (ANSI 33), background surface (ANSI 236). Content is a `<scrollbox>` showing:

```
┌─────────────────────────────────────────────┐
│ Artifact: coverage-report                   │
├─────────────────────────────────────────────┤
│ Name:         coverage-report               │
│ Content Type: text/html                     │
│ Size:         2,145,832 bytes (2.1 MB)      │
│ Status:       ● Ready                       │
│ Created:      2026-03-18 14:23:05 UTC       │
│ Confirmed:    2026-03-18 14:23:12 UTC       │
│ Expires:      2026-04-17 14:23:05 UTC (29d) │
│ Storage:      …runs/42/artifacts/7/covera…  │
│                                             │
│ Release Attachment:                         │
│   Tag:        v1.2.3                        │
│   Asset:      coverage-report.html          │
│   Attached:   2026-03-19 09:00:00 UTC       │
│                                             │
│ [D] Download    [x] Delete    [Esc] Close   │
└─────────────────────────────────────────────┘
```

`D` initiates download, `x` opens delete confirmation, `Esc` closes the overlay. Content scrollable with `j`/`k` if taller than overlay viewport.

### Delete Confirmation Overlay

When `x` is pressed on an artifact (from list or detail), a centered modal (40% × 25%) appears with border in error color (ANSI 196), background surface (ANSI 236). Shows artifact name and size. "Are you sure you want to delete this artifact? This cannot be undone." `Enter` confirms deletion, `Esc` cancels. Spinner shown during API call. Success removes row and flashes status bar message "Artifact deleted"; error shows inline.

### Keybindings

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Next row | List focused |
| `k` / `Up` | Previous row | List focused |
| `Enter` | Open artifact detail overlay | Artifact focused |
| `/` | Focus search | List focused |
| `Esc` | Close overlay → clear search → pop | Priority |
| `G` | Last row | List focused |
| `g g` | First row | List focused |
| `Ctrl+D` / `Ctrl+U` | Page down / page up | List focused |
| `R` | Retry | Error state |
| `f` | Cycle filter (All → Ready → Pending → Expired) | List focused |
| `s` | Cycle sort (Created ↓ → Created ↑ → Name A-Z → Name Z-A → Size ↓ → Size ↑) | List focused |
| `D` (Shift+d) | Download artifact | Artifact focused (list or detail overlay) |
| `x` | Delete artifact (opens confirmation) | Artifact focused (list or detail overlay) |
| `q` | Pop screen | Not in input/overlay |

### Responsive Behavior

**80×24**: icon (2), name (fill−13), size (7), expiration (4). No content type, release indicator, or timestamp. Compact toolbar (search only). No column headers.
**120×40**: Column headers visible. icon (2), name (30), content type (18), size (7), expiration (4), release (2), timestamp (4).
**200×60**: All columns: icon (2), name (40), content type (25), size (7), expiration (4), release tag (15), release indicator (2), timestamp (4).

Resize triggers synchronous re-layout; focused row preserved. Detail overlay resizes proportionally (min width 40ch, min height 15 rows).

### Data Hooks
- `useWorkflowRunArtifacts()` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/actions/runs/:id/artifacts`
- `useDeleteWorkflowArtifact()` from `@codeplane/ui-core` → `DELETE /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name` (mutation hook with optimistic removal)
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()`, `useRunContext()` from local TUI navigation

### Navigation
- `Enter` → Opens artifact detail overlay (no screen push, modal within current screen)
- `D` → Delegates to CLI: `codeplane artifact download <runId> <name> --repo owner/repo --output <name>` via child process
- `x` → Opens delete confirmation overlay; on confirm → `DELETE /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name`
- `q` → `pop()`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View artifact list (public repo) | ✅ | ✅ | ✅ | ✅ |
| View artifact list (private repo) | ❌ | ✅ | ✅ | ✅ |
| View artifact detail | Same as view | ✅ | ✅ | ✅ |
| Download artifact | ❌ | ✅ | ✅ | ✅ |
| Delete artifact | ❌ | ❌ | ✅ | ✅ |

- The Artifacts View requires both repository context and workflow run context. Both are enforced at navigation level
- `GET /api/repos/:owner/:repo/actions/runs/:id/artifacts` respects repository visibility: public repos accessible to all authenticated users; private repos require read access
- Download (`GET /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name/download`) requires read access. The actual file download URL may be a signed GCS URL with time-limited access
- Delete (`DELETE /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name`) requires write access. Read-only users see the `x` keybinding hint dimmed (ANSI 245) and receive "Permission denied" on action
- The `D` keybinding delegates to CLI which uses the same token; download URLs are never logged or displayed in full

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- Download URLs (signed GCS URLs) treated as secrets — not shown in logs, truncated in detail overlay
- 401 responses propagate to app-shell auth error screen

### Rate Limiting
- 300 req/min for `GET /api/repos/:owner/:repo/actions/runs/:id/artifacts`
- 60 req/min for `DELETE` operations
- 30 req/min for download initiation (to prevent abuse of signed URL generation)
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting

### Input Sanitization
- Search text is client-side only — never sent to API
- Filter values from fixed enum ("all", "ready", "pending", "expired") — no user strings reach API for filtering
- Artifact names and paths rendered as plain `<text>` (no injection vector in terminal)
- Download output path validated to prevent path traversal (handled by CLI command)

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.artifacts.view` | Screen mounted, data loaded | `repo`, `run_id`, `workflow_name`, `total_count`, `ready_count`, `pending_count`, `expired_count`, `total_size_bytes`, `filter_state`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` |
| `tui.artifacts.open_detail` | Enter on artifact | `repo`, `run_id`, `artifact_id`, `artifact_name`, `content_type`, `size_bytes`, `status`, `has_release_tag`, `position_in_list`, `was_filtered` |
| `tui.artifacts.download` | D pressed, download initiated | `repo`, `run_id`, `artifact_id`, `artifact_name`, `size_bytes`, `content_type`, `success`, `download_time_ms` |
| `tui.artifacts.download_failed` | Download error | `repo`, `run_id`, `artifact_id`, `artifact_name`, `error_type`, `http_status` |
| `tui.artifacts.delete` | Confirm delete | `repo`, `run_id`, `artifact_id`, `artifact_name`, `size_bytes`, `success`, `delete_time_ms` |
| `tui.artifacts.delete_cancel` | Cancel delete overlay | `repo`, `run_id`, `artifact_id` |
| `tui.artifacts.delete_denied` | 403 on delete | `repo`, `run_id`, `artifact_id`, `artifact_name` |
| `tui.artifacts.filter_change` | Press f | `repo`, `run_id`, `new_filter`, `previous_filter`, `visible_count` |
| `tui.artifacts.sort_change` | Press s | `repo`, `run_id`, `new_sort`, `previous_sort` |
| `tui.artifacts.search` | Type in search | `repo`, `run_id`, `query_length`, `match_count`, `total_loaded_count` |
| `tui.artifacts.error` | API failure | `repo`, `run_id`, `error_type`, `http_status`, `request_type` |
| `tui.artifacts.retry` | Press R | `repo`, `run_id`, `error_type`, `retry_success` |
| `tui.artifacts.empty` | Empty state shown | `repo`, `run_id`, `filter_state`, `has_search_text` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Detail view open rate | >40% of views |
| Download rate | >25% of views |
| Download success rate | >95% of attempts |
| Delete success rate | >95% of attempts |
| Filter usage | >15% of views |
| Search adoption | >8% of views |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <1.5s |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `Artifacts: mounted [repo={r}] [run_id={id}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Data loaded | `Artifacts: loaded [repo={r}] [run_id={id}] [count={n}] [ready={r}] [pending={p}] [expired={e}] [total_size={s}] [duration={ms}ms]` |
| `debug` | Search/filter changes | `Artifacts: search [repo={r}] [run_id={id}] [query_length={n}] [matches={m}]` |
| `debug` | Filter changed | `Artifacts: filter [repo={r}] [run_id={id}] [from={old}] [to={new}]` |
| `debug` | Sort changed | `Artifacts: sort [repo={r}] [run_id={id}] [from={old}] [to={new}]` |
| `info` | Fully loaded | `Artifacts: ready [repo={r}] [run_id={id}] [artifacts={n}] [total_ms={ms}]` |
| `info` | Detail opened | `Artifacts: detail opened [repo={r}] [run_id={id}] [artifact_id={aid}] [name={name}]` |
| `info` | Download initiated | `Artifacts: download [repo={r}] [run_id={id}] [artifact_id={aid}] [name={name}] [size={s}]` |
| `info` | Download completed | `Artifacts: downloaded [repo={r}] [run_id={id}] [artifact_id={aid}] [success={bool}] [duration={ms}ms]` |
| `info` | Delete initiated | `Artifacts: delete [repo={r}] [run_id={id}] [artifact_id={aid}] [name={name}]` |
| `info` | Delete completed | `Artifacts: deleted [repo={r}] [run_id={id}] [artifact_id={aid}] [success={bool}] [duration={ms}ms]` |
| `warn` | Fetch failed | `Artifacts: fetch failed [repo={r}] [run_id={id}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `Artifacts: rate limited [repo={r}] [run_id={id}] [retry_after={s}]` |
| `warn` | Delete failed | `Artifacts: delete failed [repo={r}] [run_id={id}] [artifact_id={aid}] [status={code}] [error={msg}]` |
| `warn` | Download failed | `Artifacts: download failed [repo={r}] [run_id={id}] [artifact_id={aid}] [status={code}] [error={msg}]` |
| `warn` | Slow load (>3s) | `Artifacts: slow load [repo={r}] [run_id={id}] [duration={ms}ms]` |
| `warn` | Memory cap | `Artifacts: memory cap [repo={r}] [run_id={id}] [total={n}] [cap=200]` |
| `error` | Auth error | `Artifacts: auth error [repo={r}] [run_id={id}] [status=401]` |
| `error` | Permission denied | `Artifacts: permission denied [repo={r}] [run_id={id}] [artifact_id={aid}] [action={a}]` |
| `error` | Render error | `Artifacts: render error [repo={r}] [run_id={id}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during load | Layout re-renders; fetch continues | Independent |
| Resize with detail overlay open | Overlay resizes proportionally (min 40ch width, min 15 rows) | Synchronous |
| Resize with delete confirmation open | Overlay resizes proportionally (min 30ch width) | Synchronous |
| SSE disconnect | Status bar indicator; artifact list unaffected (SSE not used for artifact list) | SSE provider reconnects |
| Auth expiry | Next API call → 401 → auth error screen | Re-auth via CLI |
| Network timeout (30s) | Loading → error + "Press R to retry" | User retries |
| Delete 403 | Status bar flash "Permission denied" | Informational |
| Delete 404 | Status bar flash "Artifact not found" + remove row | Row removed (already deleted server-side) |
| Delete 409 | Status bar flash "Artifact is attached to a release. Detach first." | Informational |
| Download pending artifact | Status bar flash "Artifact upload not confirmed" | Informational |
| Download expired artifact | Status bar flash "Artifact has expired" | Informational |
| Download 404 | Status bar flash "Artifact not found" | Informational |
| Rapid f cycling | Client-side filter, instant | No cancellation needed |
| No color support | Text markers [R]/[P]/[E] replace ●/◎/○ icons; release uses [A] instead of 📎 | Theme detection |
| Memory cap (200) | Show cap message in footer | Client-side cap |
| CLI download process failure | Status bar error "Download failed: {reason}" | User retries with D |
| Concurrent delete + download on same artifact | Delete cancels pending download, status bar notifies | Automatic |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- Detail overlay crash → overlay dismissed, error flash; user retries `Enter`
- Delete confirmation overlay crash → overlay dismissed, no deletion occurs, error flash
- All API fails → error state; `q` still works for navigation
- Slow network → spinner shown; user navigates away via go-to or palette
- Download CLI subprocess crash → status bar error "Download process exited unexpectedly"
- Partial delete (API succeeds but optimistic UI reverts on re-fetch) → re-fetch reconciles actual state

## Verification

### Test File: `e2e/tui/workflows.test.ts`

### Terminal Snapshot Tests (30 tests)

- SNAP-ART-001: Artifact list at 120×40 with populated artifacts — full layout, headers, columns, focus highlight
- SNAP-ART-002: Artifact list at 80×24 minimum — icon, name, size, expiration only
- SNAP-ART-003: Artifact list at 200×60 large — all columns including release tag and full content type
- SNAP-ART-004: Empty state (zero artifacts) — "No artifacts for this run. Artifacts are produced by workflow steps using the artifacts API."
- SNAP-ART-005: No filter matches — "No artifacts match the current filters."
- SNAP-ART-006: Loading state — "Loading artifacts…" with title/toolbar visible
- SNAP-ART-007: Error state — red error with "Press R to retry"
- SNAP-ART-008: Focused row highlight — primary accent (ANSI 33) reverse video
- SNAP-ART-009: Ready artifact icon — ● green (ANSI 34)
- SNAP-ART-010: Pending artifact icon — ◎ yellow (ANSI 178) with pending name color
- SNAP-ART-011: Expired artifact icon — ○ gray (ANSI 245) with muted name/type and "exp" in error color
- SNAP-ART-012: Release indicator rendering — 📎 in primary color on attached artifacts, blank on others
- SNAP-ART-013: Artifact name truncation with `…` at column boundaries
- SNAP-ART-014: Content type truncation with `…` at 18ch (standard)
- SNAP-ART-015: Size formatting — bytes ("89 B"), kilobytes ("345 KB"), megabytes ("2.1 MB"), gigabytes ("1.2 GB")
- SNAP-ART-016: Expiration countdown — active ("29d", "6h"), no expiration ("—"), expired ("exp" red)
- SNAP-ART-017–019: Filter toolbar states (All/Ready/Pending/Expired)
- SNAP-ART-020–021: Search input active + narrowed results
- SNAP-ART-022: Artifact detail overlay rendering with full metadata
- SNAP-ART-023: Artifact detail overlay with release attachment section
- SNAP-ART-024: Artifact detail overlay without release attachment (section hidden)
- SNAP-ART-025: Delete confirmation overlay rendering with artifact name and size
- SNAP-ART-026: Delete confirmation overlay with spinner during API call
- SNAP-ART-027: Breadcrumb path "Dashboard > owner/repo > Workflows > ci > Run #42 > Artifacts"
- SNAP-ART-028: Title row "Artifacts (5)" with total size "12.4 MB total"
- SNAP-ART-029: Column headers at standard+ sizes
- SNAP-ART-030: Status bar hints "j/k:nav Enter:detail D:download x:delete q:back"

### Keyboard Interaction Tests (42 tests)

- KEY-ART-001–006: j/k/Down/Up navigation through artifact rows
- KEY-ART-007–008: Enter opens artifact detail overlay for focused artifact
- KEY-ART-009–012: / search focusing, narrowing by name, narrowing by content type, Esc clear
- KEY-ART-013–015: Esc context priority (detail overlay → delete overlay → search → pop screen)
- KEY-ART-016–019: G (jump to bottom), g g (jump to top), Ctrl+D (page down), Ctrl+U (page up)
- KEY-ART-020–021: R retry in error state (success + no-op when not in error)
- KEY-ART-022–025: f filter cycling (All → Ready → Pending → Expired → All) with visible count update
- KEY-ART-026–027: D download on ready artifact (initiates CLI download, status bar progress)
- KEY-ART-028: D on pending artifact (status bar message "Artifact upload not confirmed", no download)
- KEY-ART-029: D on expired artifact (status bar message "Artifact has expired", no download)
- KEY-ART-030–031: x delete on artifact (opens confirmation, Enter confirms deletion)
- KEY-ART-032: Esc cancels delete confirmation overlay
- KEY-ART-033: x on artifact without write permission (status bar "Permission denied")
- KEY-ART-034: q pops screen
- KEY-ART-035–037: Keys in search input (j/f/q/D/x type as text, not trigger actions)
- KEY-ART-038: Rapid j presses (15× sequential, one row per keypress)
- KEY-ART-039: Enter during loading state (no-op)
- KEY-ART-040: s sort cycling (Created ↓ → Created ↑ → Name A-Z → Name Z-A → Size ↓ → Size ↑)
- KEY-ART-041: D from within detail overlay (download without closing overlay)
- KEY-ART-042: x from within detail overlay (opens delete confirmation stacked on detail)

### Responsive Tests (14 tests)

- RESP-ART-001–003: 80×24 layout with icon+name+size+expiration only, no column headers, compact toolbar
- RESP-ART-004–006: 120×40 layout with content type, release indicator, timestamp columns, column headers visible
- RESP-ART-007–008: 200×60 layout with all columns (release tag, full content type), wider columns
- RESP-ART-009–010: Resize between breakpoints — columns collapse/expand dynamically
- RESP-ART-011: Focus preserved through resize
- RESP-ART-012: Resize during search (search input width adjusts, text preserved)
- RESP-ART-013: Resize during loading state (spinner repositions)
- RESP-ART-014: Resize with detail overlay open (overlay resizes proportionally, min 40ch width, min 15 rows)

### Integration Tests (22 tests)

- INT-ART-001–003: Auth expiry (→ auth screen), rate limit (→ inline message), network error (→ error state)
- INT-ART-004: Memory cap at 200 artifacts with footer message
- INT-ART-005–006: Navigation round-trips (artifact list → detail overlay → close preserves focus and scroll)
- INT-ART-007: Server 500 error handling
- INT-ART-008–009: Download success (CLI subprocess completes, status bar flash), download failure (status bar error)
- INT-ART-010–011: Delete success (optimistic removal, API call, status bar flash), delete failure (row restored, status bar error)
- INT-ART-012: Delete 403 permission denied
- INT-ART-013: Delete 404 artifact already deleted (row removed, status bar info)
- INT-ART-014: Delete 409 artifact attached to release (status bar error)
- INT-ART-015: Download on pending artifact (blocked with message)
- INT-ART-016: Download on expired artifact (blocked with message)
- INT-ART-017: Back navigation with data refresh (stale data detection)
- INT-ART-018: Null/missing fields in API response (confirmedAt null, releaseTag null)
- INT-ART-019: Size formatting for various magnitudes (bytes, KB, MB, GB, TB)
- INT-ART-020: Expiration countdown calculation (future dates, past dates, null)
- INT-ART-021: Filter + search composition (ready+search, expired+search, clear search keeps filter)
- INT-ART-022: Sort preserves focus on same artifact by ID

### Edge Case Tests (14 tests)

- EDGE-ART-001: No auth token → auth error screen
- EDGE-ART-002–003: Long artifact names (80+ chars), unicode/emoji in names
- EDGE-ART-004: Single artifact in list
- EDGE-ART-005: Concurrent resize + navigation
- EDGE-ART-006: Search no matches with active filter
- EDGE-ART-007: All artifacts expired
- EDGE-ART-008: Artifact with extremely long content type (60+ chars)
- EDGE-ART-009: Rapid x presses (confirmation overlay already open, second x is no-op)
- EDGE-ART-010: Rapid D presses (download already in progress, second D queued)
- EDGE-ART-011: Delete last artifact transitions to empty state
- EDGE-ART-012: Artifact name with special characters (spaces, slashes, dots)
- EDGE-ART-013: Artifact size of 0 bytes (rendered as "0 B")
- EDGE-ART-014: Concurrent delete + download on same artifact (delete wins, download cancelled)

All 122 tests left failing if backend is unimplemented — never skipped or commented out.
