# TUI_LANDING_CONFLICT_STATUS

Specification for TUI_LANDING_CONFLICT_STATUS.

## High-Level User POV

When a terminal user navigates to a landing request — whether in the landing list or the landing detail view — they see a clear, color-coded indicator of the landing's conflict status. This indicator tells them at a glance whether the changes in the landing request can be merged cleanly, have merge conflicts that need resolution, or are in an indeterminate state while the system evaluates rebaseability.

In the landing list, the conflict status appears as a single-character icon in a dedicated column: a green ✓ for clean, a red ✗ for conflicted, or a yellow ? for unknown. This column sits between the target bookmark and the author, giving the user a fast visual scan across all open landings to identify which ones need attention.

In the landing detail view, the Overview tab contains a dedicated "Conflict Status" section. When the landing is clean, this section shows a succinct green confirmation. When conflicts are detected, the section expands to show a per-change breakdown: each change ID is listed with its conflicted file paths and conflict types (e.g., content, modify-delete, add-add). The user can scroll through this list using standard j/k navigation. When the conflict status is unknown, a yellow notice explains that the system is still evaluating.

The conflict status updates in real-time via SSE streaming. If a user is viewing a landing detail and someone pushes a change that introduces or resolves a conflict, the status indicator transitions without requiring a manual refresh. The status bar flashes briefly to draw attention to the state change.

The conflict status also gates the merge action. When a user presses m to merge a landing, the system checks the conflict status first. If the landing is conflicted, the merge is blocked and the status bar shows "Landing has conflicts, cannot merge" in red. If the status is unknown, the status bar shows "Conflict status pending, try again shortly" in yellow. Only clean landings can proceed to the merge confirmation dialog.

The user can manually trigger a conflict re-check by pressing Shift+C on a landing detail view. This sends a request to the server to re-evaluate the conflict status, and the indicator transitions to the unknown/pending state while the check runs, then updates to the final result.

## Acceptance Criteria

### Definition of Done

- [ ] Conflict status icon (✓/✗/?) renders in the landing list screen in a dedicated column with correct ANSI color coding
- [ ] Conflict status section renders in the landing detail Overview tab with full per-change breakdown when conflicted
- [ ] All three conflict states (clean, conflicted, unknown) render with correct icon, color, and label text
- [ ] Merge action (m key) is gated by conflict status — blocked when conflicted or unknown, allowed when clean
- [ ] Status bar shows appropriate flash message when merge is blocked due to conflicts
- [ ] Conflict re-check action (Shift+C) triggers server re-evaluation and shows pending state
- [ ] SSE streaming updates conflict status in real-time on both list and detail views
- [ ] Conflict file list in detail view is scrollable and navigable with j/k
- [ ] Feature consumes useLandingConflicts() hook from @codeplane/ui-core

### Terminal Edge Cases

- [ ] At 80x24 (minimum terminal), the conflict column in the list view still renders (it uses only 3 characters including padding)
- [ ] At 80x24, the per-change conflict breakdown in the detail view wraps long file paths with ellipsis truncation at the available width minus 4 characters of indent
- [ ] On terminals without color support (TERM=dumb), conflict icons render as plain ASCII characters (✓/✗/?) without color — the icon shape alone conveys meaning
- [ ] Rapid j/k input through the conflict file list does not cause render thrashing — scroll position updates are debounced at 16ms
- [ ] Terminal resize during conflict detail view re-layouts the per-change breakdown without losing scroll position

### Boundary Constraints

- [ ] File paths in conflict list are truncated to terminal_width - 8 characters with trailing …
- [ ] Change IDs are displayed as the first 12 characters of the full ID (e.g., Change abc123def012:)
- [ ] Maximum of 500 conflict files displayed per change; beyond 500, show "+N more files" summary
- [ ] Maximum of 50 changes displayed in conflict breakdown; beyond 50, show "+N more changes" summary
- [ ] Conflict type strings are displayed as-is (e.g., content, modify-delete) with no transformation, truncated at 20 characters
- [ ] Empty conflicts_by_change with conflict_status === "conflicted" shows "Conflicts detected (details unavailable)" in red
- [ ] SSE reconnection after disconnect re-fetches conflict status via REST to avoid stale display

## Design

### Landing List — Conflict Column

The conflict status column is positioned in the landing list row between the target bookmark and the author. The column uses a single character (✓/✗/?) with ANSI color coding: green (34) for clean, red (196) for conflicted, yellow (178) for unknown. The column header shows ⚡.

OpenTUI component structure for list row:
```jsx
<box flexDirection="row" gap={1}>
  <text width={1}>{voteIcon}</text>
  <text width={5} fg={245}>#{landing.number}</text>
  <text flexGrow={1} truncate>{landing.title}</text>
  <text width={10} fg={245}>→ {landing.target_bookmark}</text>
  <text width={1} fg={conflictColor(landing.conflict_status)}>
    {conflictIcon(landing.conflict_status)}
  </text>
  <text width={8} fg={245}>{landing.author}</text>
  <text width={4} fg={245}>{relativeTime(landing.created_at)}</text>
</box>
```

### Landing Detail — Conflict Status Section

Within the Overview tab, a "Conflict Status" section renders one of three states:

**Clean**: `✓ No conflicts` in green (ANSI 34)
**Unknown**: `? Conflict status unknown — checking…` in yellow (ANSI 178)
**Conflicted**: `✗ Conflicts detected` in red (ANSI 196), followed by a scrollable per-change breakdown showing truncated change IDs (12 chars) and file paths with conflict types.

OpenTUI structure:
```jsx
<box flexDirection="column" paddingTop={1}>
  <text bold>Conflict Status</text>
  {conflict_status === "clean" && <text fg={34} paddingLeft={2}>✓ No conflicts</text>}
  {conflict_status === "unknown" && <text fg={178} paddingLeft={2}>? Conflict status unknown — checking…</text>}
  {conflict_status === "conflicted" && (
    <box flexDirection="column" paddingLeft={2}>
      <text fg={196}>✗ Conflicts detected</text>
      <scrollbox maxHeight={conflictScrollHeight}>
        {Object.entries(conflicts_by_change).map(([changeId, files]) => (
          <box key={changeId} flexDirection="column" paddingTop={1} paddingLeft={2}>
            <text fg={245}>Change {changeId.slice(0, 12)}:</text>
            {files.slice(0, 500).map(f => (
              <text key={f.file_path} fg={196} paddingLeft={2}>
                {truncate(f.file_path, termWidth - 8)} ({f.conflict_type})
              </text>
            ))}
            {files.length > 500 && <text fg={245} paddingLeft={2}>+{files.length - 500} more files</text>}
          </box>
        ))}
      </scrollbox>
    </box>
  )}
</box>
```

### Keybindings

**Landing list (conflict-relevant):**
| Key | Action | Condition |
|-----|--------|----------|
| m | Merge landing | Only when conflict_status === "clean" and state === "open" |
| c | Cycle conflict status filter (all → clean → conflicted → unknown → all) | Always |

**Landing detail (conflict-relevant):**
| Key | Action | Condition |
|-----|--------|----------|
| m | Merge landing | Only when conflict_status === "clean" and state === "open" |
| Shift+C | Trigger conflict re-check | When state === "open" |
| j/k | Scroll through conflict file list | When conflict section is focused |
| Enter | Navigate to conflicted file diff | When cursor is on a conflict file row |

### Terminal Resize Behavior

| Terminal Size | Behavior |
|---|---|
| < 80x24 | "Terminal too small" message |
| 80x24 – 119x39 | Conflict icon only (1 char), file paths truncated aggressively, scrollbox maxHeight = 6 |
| 120x40 – 199x59 | Full column with padding, file paths up to 100 chars, scrollbox maxHeight = 12 |
| 200x60+ | Full layout, full file paths, scrollbox maxHeight = 20 |

On resize: useOnResize() triggers immediate re-layout. Scroll position is preserved (clamped to valid range). File path truncation recalculates based on new width.

### Data Hooks

| Hook | Source | Usage |
|---|---|---|
| useLandings(owner, repo, { state, conflict_status }) | @codeplane/ui-core | List view with optional conflict status filter |
| useLandingConflicts(owner, repo, number) | @codeplane/ui-core | Detail view conflict breakdown |
| useLanding(owner, repo, number) | @codeplane/ui-core | Detail view landing metadata including conflict_status |
| useSSE("landing-conflicts") | SSE context | Real-time conflict status updates |
| useTerminalDimensions() | @opentui/react | Terminal size for responsive truncation |
| useOnResize() | @opentui/react | Re-layout trigger |
| useKeyboard() | @opentui/react | Keybinding registration |

## Permissions & Security

### Authorization

| Action | Required Role | Notes |
|---|---|---|
| View conflict status (list and detail) | Repository read access | Any authenticated user with repo visibility |
| Trigger conflict re-check (Shift+C) | Repository write access | Contributors, maintainers, admins |
| Merge landing (m) | Repository write access + clean conflicts | Merge permission required |
| Filter by conflict status | Repository read access | Read-only filter operation |

### Authentication

- TUI uses token-based authentication via CLI keychain or CODEPLANE_TOKEN environment variable
- No OAuth browser flow — the TUI displays "Run `codeplane auth login` to authenticate" on 401
- SSE conflict channels require ticket-based auth obtained via the REST API before connection
- Token expiry during an SSE connection triggers reconnection with a fresh ticket

### Rate Limiting

- GET /api/repos/:owner/:repo/landings/:number/conflicts — standard read rate limit (shared with other landing endpoints)
- Conflict re-check (Shift+C) — rate limited to 1 request per 10 seconds per landing per user; the TUI enforces this client-side with a cooldown timer shown in the status bar ("Re-check available in Ns")
- SSE connections are limited to 1 per user per landing channel (server-enforced)

### Security Notes

- File paths in conflict responses are relative to repository root — no absolute filesystem paths are exposed
- Conflict types are server-defined enum values; the TUI renders them as-is without interpretation
- The TUI never sends conflict resolution commands — resolution happens via the CLI or editor integrations

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| tui.landing.conflict_status.viewed | User views a landing with conflict info visible | conflict_status, repo, landing_number, terminal_size, view_type ("list" or "detail") |
| tui.landing.conflict_status.filter_applied | User cycles conflict status filter in list view | filter_value ("all", "clean", "conflicted", "unknown"), repo |
| tui.landing.conflict_status.recheck_triggered | User presses Shift+C to re-check conflicts | repo, landing_number, previous_status |
| tui.landing.conflict_status.merge_blocked | User attempts merge on conflicted/unknown landing | conflict_status, repo, landing_number |
| tui.landing.conflict_status.sse_update_received | SSE delivers a conflict status change | repo, landing_number, old_status, new_status |
| tui.landing.conflict_status.conflict_file_navigated | User presses Enter on a conflict file to view diff | repo, landing_number, file_path, conflict_type |

### Event Properties (Common)

| Property | Type | Description |
|---|---|---|
| conflict_status | string | Current conflict status value |
| repo | string | owner/repo identifier |
| landing_number | number | Landing request number |
| terminal_size | string | WxH (e.g., 120x40) |
| view_type | string | "list" or "detail" |
| client | string | Always "tui" |
| session_id | string | TUI session identifier |

### Success Indicators

| Indicator | Target | Measurement |
|---|---|---|
| Conflict status visibility | >90% of landing detail views include conflict status render | % of viewed events with view_type=detail vs total detail views |
| Re-check usage | >10% of users viewing conflicted landings trigger re-check | % of recheck_triggered / viewed where conflict_status=conflicted |
| Merge block comprehension | <5% of users retry merge on conflicted landing within same session | Count of repeated merge_blocked events per session |
| SSE freshness | >95% of conflict status updates received within 2s of server-side change | P95 latency of sse_update_received events |

## Observability

### Logging Requirements

| Log Level | Event | Details |
|---|---|---|
| info | Conflict status loaded | landing_number, conflict_status, conflict_count (number of files), load_time_ms |
| info | Conflict re-check triggered | landing_number, previous_status |
| info | SSE conflict update received | landing_number, old_status, new_status |
| warn | Conflict API returned unexpected status value | landing_number, raw_status (for forward-compat with new values) |
| warn | Conflict re-check rate limited (client-side) | landing_number, cooldown_remaining_ms |
| error | Conflict API request failed | landing_number, status_code, error_message |
| error | SSE conflict channel disconnected | landing_number, reconnect_attempt, backoff_ms |
| debug | Conflict section rendered | landing_number, conflict_status, terminal_width, truncated_paths_count |

### Error Cases Specific to TUI

| Error Case | Behavior | Recovery |
|---|---|---|
| API returns 404 for conflict endpoint | Show "Conflict status unavailable" in muted gray | Retry on next screen visit or Shift+C |
| API returns 401 | Show "Session expired. Run `codeplane auth login`" | No auto-recovery; user must re-auth via CLI |
| API returns 500 | Show "Error loading conflict status" with R to retry hint | Manual retry via R key or Shift+C |
| SSE disconnect during detail view | Status bar shows disconnection indicator; conflict status shows stale with "(stale)" suffix | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s); re-fetch via REST on reconnection |
| Terminal resize during conflict file list scroll | Re-layout preserving scroll offset; clamp if offset exceeds new max | Synchronous re-render via useOnResize() |
| Network timeout (>10s) | Show "Loading conflict status…" spinner; timeout after 10s with "Request timed out" | Retry on R or Shift+C |
| Unknown conflict_status value (forward-compat) | Render as ? icon with yellow color, treat as "unknown" | Log warning for monitoring; no user-visible error |
| Empty conflicts_by_change when conflicted | Show "Conflicts detected (details unavailable)" | Display is informational; re-check via Shift+C may populate details |

### Failure Modes

| Mode | Impact | Mitigation |
|---|---|---|
| Conflict API unavailable | List view shows ? for all landings; detail view shows unavailable message | Graceful degradation; all other landing features remain functional |
| SSE channel never connects | Conflict status is static (loaded once via REST) | REST fetch on screen mount ensures baseline data |
| Stale conflict status (server updated but SSE missed) | User sees outdated icon until manual action | Shift+C re-check always fetches fresh data; page navigation re-fetches |

## Verification

### Test File

All tests reside in `e2e/tui/landings.test.ts` under the `TUI_LANDING_CONFLICT_STATUS` describe block.

### Terminal Snapshot Tests

```
test("renders clean conflict status icon in landing list row")
  → Launch TUI → navigate to landing list for repo with clean landing
  → Snapshot: verify green ✓ icon in conflict column for the landing row

test("renders conflicted conflict status icon in landing list row")
  → Launch TUI → navigate to landing list for repo with conflicted landing
  → Snapshot: verify red ✗ icon in conflict column for the landing row

test("renders unknown conflict status icon in landing list row")
  → Launch TUI → navigate to landing list for repo with unknown-status landing
  → Snapshot: verify yellow ? icon in conflict column for the landing row

test("renders clean conflict section in landing detail overview tab")
  → Launch TUI → open clean landing detail → Overview tab
  → Snapshot: verify "✓ No conflicts" in green

test("renders conflicted section with per-change breakdown in landing detail")
  → Launch TUI → open conflicted landing detail → Overview tab
  → Snapshot: verify "✗ Conflicts detected" header, change IDs (12-char), file paths, conflict types

test("renders unknown conflict section in landing detail")
  → Launch TUI → open unknown-status landing detail → Overview tab
  → Snapshot: verify "? Conflict status unknown — checking…" in yellow

test("renders 'details unavailable' when conflicted but no conflicts_by_change")
  → Launch TUI → open conflicted landing with empty conflicts_by_change
  → Snapshot: verify "Conflicts detected (details unavailable)" message

test("renders conflict file list truncation at 80-column terminal")
  → Launch TUI at 80x24 → open conflicted landing with long file paths
  → Snapshot: verify file paths truncated with … at column 72

test("renders conflict section at 200x60 terminal with full paths")
  → Launch TUI at 200x60 → open conflicted landing
  → Snapshot: verify full file paths without truncation
```

### Keyboard Interaction Tests

```
test("pressing 'm' on clean landing opens merge confirmation")
  → Navigate to landing list → focus clean landing → press 'm'
  → Assert: merge confirmation dialog appears

test("pressing 'm' on conflicted landing shows blocked message in status bar")
  → Navigate to landing list → focus conflicted landing → press 'm'
  → Assert: status bar contains "Landing has conflicts, cannot merge"
  → Assert: no merge dialog appears

test("pressing 'm' on unknown-status landing shows pending message in status bar")
  → Navigate to landing list → focus unknown-status landing → press 'm'
  → Assert: status bar contains "Conflict status pending, try again shortly"
  → Assert: no merge dialog appears

test("pressing 'c' cycles conflict status filter in list view")
  → Navigate to landing list → press 'c'
  → Assert: filter shows "clean" → press 'c' → filter shows "conflicted"
  → press 'c' → filter shows "unknown" → press 'c' → filter shows "all"

test("pressing Shift+C on landing detail triggers conflict re-check")
  → Navigate to landing detail → press 'Shift+C'
  → Assert: conflict section shows pending/checking state
  → Assert: section updates to new status after API response

test("pressing Shift+C is rate limited to once per 10 seconds")
  → Navigate to landing detail → press 'Shift+C' → immediately press 'Shift+C' again
  → Assert: status bar shows cooldown message with remaining seconds

test("j/k navigates through conflict file list in detail view")
  → Navigate to conflicted landing detail with multiple conflict files
  → Press 'j' three times → assert cursor moved down three files
  → Press 'k' once → assert cursor moved up one file

test("Enter on focused conflict file navigates to diff view")
  → Navigate to conflicted landing detail → focus a conflict file → press Enter
  → Assert: diff view opens for the selected file

test("pressing 'm' in landing detail view on conflicted landing is blocked")
  → Navigate to conflicted landing detail → press 'm'
  → Assert: status bar shows conflict block message

test("Esc closes merge-blocked status bar flash")
  → Navigate to conflicted landing → press 'm' → see status message → press Esc
  → Assert: status bar returns to default keybinding hints
```

### Responsive Tests

```
test("conflict column renders at 80x24 minimum terminal")
  → Launch TUI at 80x24 → navigate to landing list
  → Assert: conflict icon column renders (1 char wide)
  → Assert: list row does not overflow terminal width

test("conflict detail section renders at 80x24 with truncated paths")
  → Launch TUI at 80x24 → open conflicted landing detail
  → Assert: file paths truncated to fit width
  → Assert: scrollbox maxHeight is ≤ 6 lines

test("conflict detail section renders at 120x40 standard terminal")
  → Launch TUI at 120x40 → open conflicted landing detail
  → Assert: file paths shown up to 100 characters
  → Assert: scrollbox maxHeight is ≤ 12 lines

test("conflict detail section renders at 200x60 large terminal")
  → Launch TUI at 200x60 → open conflicted landing detail
  → Assert: full file paths visible
  → Assert: scrollbox maxHeight is ≤ 20 lines

test("terminal resize during conflict detail preserves scroll position")
  → Launch TUI at 200x60 → open conflicted landing → scroll to 5th file
  → Resize terminal to 120x40
  → Assert: scroll position is preserved (or clamped if beyond new max)
  → Assert: layout re-renders without error

test("terminal resize below 80x24 shows too-small message")
  → Launch TUI at 120x40 → open conflicted landing detail
  → Resize terminal to 60x20
  → Assert: "terminal too small" message replaces content
```

### SSE / Streaming Tests

```
test("SSE conflict status update changes icon in list view in real-time")
  → Navigate to landing list → landing #42 shows ✓ (clean)
  → Server emits SSE event changing #42 to conflicted
  → Assert: icon for #42 changes to ✗ (red) without page refresh

test("SSE conflict status update changes section in detail view")
  → Navigate to landing #42 detail (clean) → showing "✓ No conflicts"
  → Server emits SSE event changing #42 to conflicted with file details
  → Assert: section transitions to "✗ Conflicts detected" with file list

test("SSE disconnect shows stale indicator and reconnects")
  → Navigate to landing detail → disconnect SSE
  → Assert: conflict status shows "(stale)" suffix
  → Assert: SSE reconnects with exponential backoff
  → Assert: on reconnection, conflict status is re-fetched via REST
```

### Error Handling Tests

```
test("API 404 on conflict endpoint shows unavailable message")
  → Navigate to landing detail where conflict endpoint returns 404
  → Assert: "Conflict status unavailable" shown in muted gray

test("API 500 on conflict endpoint shows error with retry hint")
  → Navigate to landing detail where conflict endpoint returns 500
  → Assert: "Error loading conflict status" with "R to retry" hint

test("pressing R after conflict load error retries the request")
  → Navigate to landing detail → conflict endpoint fails → press 'R'
  → Assert: loading spinner shown → then updated conflict status

test("API 401 on conflict endpoint shows auth expired message")
  → Navigate to landing detail where conflict endpoint returns 401
  → Assert: "Session expired. Run `codeplane auth login` to re-authenticate."
```

Note: Tests that fail due to unimplemented backend features (e.g., per-change conflict details returning empty from getLandingConflicts) are left failing. They are never skipped or commented out.
