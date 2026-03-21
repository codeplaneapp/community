# LANDING_CONFLICT_STATUS_VIEW

Specification for LANDING_CONFLICT_STATUS_VIEW.

## High-Level User POV

When a user opens a landing request — whether from the web UI, CLI, TUI, or an editor integration — they need to immediately understand whether the proposed changes can land cleanly or whether unresolved jj conflicts will block the merge. The **landing conflict status view** is the dedicated surface that communicates this information clearly across every Codeplane client.

In a jj-native workflow, conflicts are a natural part of rebasing and evolving changes. Unlike traditional git merge conflicts that appear only at merge time, jj tracks conflicts as first-class objects within the repository's operation history. The landing conflict status view surfaces this jj-native conflict information directly within the landing request experience, so reviewers and authors can see exactly which changes in the stack are conflicted, which files are affected, and what type of conflict each represents — without leaving the review context.

The conflict status view has three possible states: **clean** (all changes rebase cleanly onto the target bookmark), **conflicted** (one or more changes contain unresolved conflicts), and **unknown** (the conflict check has not yet completed or the result is stale). Each state is visually distinct so users can assess landability at a glance — a green checkmark for clean, a red X for conflicted, and a yellow question mark for unknown.

When the status is "conflicted," the view expands to show a per-change breakdown. For each conflicted change in the stack, it lists the affected file paths and the jj conflict type (such as "2-sided conflict," "modify-delete conflict," or "add-add conflict"). This breakdown lets the landing request author know exactly what needs resolution before the request can proceed.

The conflict status view also enforces a critical product gate: a landing request cannot be queued for merge while its conflict status is anything other than "clean." The merge button is disabled and a clear explanation tells the user why. This prevents teams from accidentally landing conflicted code.

Users can trigger a manual conflict re-check to refresh stale status — useful after rebasing changes or resolving conflicts locally in jj. The re-check reaches into the repository's jj state, evaluates each change against the target bookmark, and updates the conflict status and per-change details accordingly.

For teams using agents, the conflict status view is equally important. When an agent produces a landing request from an automated issue resolution flow, the conflict status signals whether the agent's changes are mergeable or need human intervention. The conflict view is one of the first things a reviewer checks before diving into the diff.

The landing conflict status view is not a standalone page. It is an integrated section within the landing request detail page (web UI overview tab, CLI structured output, TUI overview panel, editor summary views). Its purpose is to provide conflict visibility exactly where the user is already working — inside the landing request context.

## Acceptance Criteria

### Definition of Done

- [ ] The landing request detail page displays a dedicated conflict status section on the Overview tab (web), overview panel (TUI), and structured output (CLI).
- [ ] The conflict status section displays one of three visual states: clean (green checkmark, "No conflicts"), conflicted (red X, "Conflicts detected"), or unknown (yellow question mark, "Conflict status not yet determined").
- [ ] When the status is "conflicted," the section expands to show a per-change conflict breakdown grouped by change ID.
- [ ] Each conflicted change shows its short change ID (first 12 hex characters) and a list of affected file paths with their jj conflict types.
- [ ] When the status is "clean," the section shows only the clean indicator and label with no expanded details.
- [ ] When the status is "unknown," the section shows the unknown indicator and an explanation that the check is pending or stale.
- [ ] The merge/land action is disabled when conflict status is "conflicted" or "unknown," with a tooltip or inline message explaining the blocker.
- [ ] Users with write access to the repository can trigger a manual conflict re-check from the conflict status section.
- [ ] The conflict re-check updates the status and per-change breakdown in place without a full page reload.
- [ ] The API endpoint `GET /api/repos/:owner/:repo/landings/:number/conflicts` returns structured conflict data including overall status, `has_conflicts` boolean, and a `conflicts_by_change` map.
- [ ] The `conflicts_by_change` map keys are jj change IDs and values are arrays of `{ file_path, conflict_type }` objects.
- [ ] The landing request list view displays a conflict status indicator column showing the per-row conflict state.
- [ ] The CLI `land view` command includes conflict status and per-change details in its output.
- [ ] The CLI `land conflicts` command returns conflict details for a specific landing request.
- [ ] The TUI landing detail screen includes a conflict status section with keyboard navigation.
- [ ] Editor integrations (VS Code, Neovim) display conflict status in landing request summary views.
- [ ] SSE-based real-time updates push conflict status changes to connected clients without requiring manual refresh.

### Edge Cases

- [ ] A landing request with zero changes (empty `change_ids` array) shows conflict status as "clean" (vacuously — no changes means no conflicts).
- [ ] A landing request with 500 changes (maximum stack size) where all are conflicted renders the conflict breakdown with pagination or scrolling, not an overwhelming flat list.
- [ ] A landing request where only one change out of many is conflicted highlights only that change in the breakdown and correctly marks the overall status as "conflicted."
- [ ] A file path containing Unicode characters, spaces, or deeply nested directory structures (up to 4,096 characters) renders correctly in the conflict file list.
- [ ] A file path at exactly 4,096 characters displays without truncation in the API response and truncates with an ellipsis in width-constrained UI views (TUI, narrow browser).
- [ ] A change with 500+ conflicted files (pathological case) renders a scrollable/paginated list rather than breaking the layout.
- [ ] A conflict re-check triggered while a previous re-check is still in progress is debounced and does not create duplicate evaluations.
- [ ] A conflict re-check on a repository that has been deleted or archived returns a clear error rather than hanging.
- [ ] Triggering a conflict re-check on a landing request in "merged" or "closed" state is rejected with an appropriate message ("Cannot re-check conflicts on a merged/closed landing request").
- [ ] Conflict types returned by jj that are not explicitly known (future jj versions may add new types) are displayed verbatim without breaking the UI.
- [ ] The conflict status view handles the transition from "unknown" → "conflicted" and "unknown" → "clean" without layout shift or flicker.
- [ ] An anonymous user viewing a public repository's landing request sees the conflict status but has no re-check action.
- [ ] When the `conflicts_by_change` field is null or an empty object (stub behavior), the status indicator still displays correctly based on the `conflict_status` string.
- [ ] A landing request whose target bookmark has been deleted shows "unknown" conflict status and displays a warning that the target bookmark no longer exists.
- [ ] Two users triggering re-check simultaneously on the same landing request see consistent final state (last evaluation wins).
- [ ] The conflict status section does not display sensitive file contents — only file paths and conflict type labels.

### Boundary Constraints

| Field | Min | Max | Allowed Values |
|---|---|---|---|
| `conflict_status` | — | — | Enum: `"clean"`, `"conflicted"`, `"unknown"` |
| `has_conflicts` | — | — | Boolean: `true`, `false` |
| `conflicts_by_change` keys | 0 entries | 500 entries | Hex strings (jj change IDs) |
| `conflicts_by_change[].file_path` | 1 char | 4,096 chars | Valid filesystem path characters, UTF-8 |
| `conflicts_by_change[].conflict_type` | 1 char | 255 chars | Free-form string from jj (e.g., "2-sided conflict") |
| Re-check rate limit | — | 1 per 10 seconds per landing request | Per-user, per-landing-request |
| Maximum conflicted files per change | 0 | 10,000 | Integer |
| Maximum total conflicts across all changes | 0 | 50,000 | Integer |

## Design

### Web UI Design

#### Location

The conflict status view is rendered as a dedicated section within the **Overview tab** of the landing request detail page at `/:owner/:repo/landings/:number`.

It also appears as a compact indicator in:
- The **page header** of the landing request detail page (icon + short label next to the state badge).
- The **landing request list** at `/:owner/:repo/landings` as a single-icon column.

#### Conflict Status Section (Overview Tab)

The conflict status section is a bordered card/callout placed between the markdown description and the review summary section.

**Clean state:**
```
┌─────────────────────────────────────────┐
│ ✓ No conflicts                          │
│   All changes rebase cleanly onto main  │
└─────────────────────────────────────────┘
```
- Green left border accent or green background tint.
- Green checkmark icon (✓).
- Label: "No conflicts".
- Subtitle: "All changes rebase cleanly onto {target_bookmark}".

**Conflicted state:**
```
┌─────────────────────────────────────────────────────────────┐
│ ✗ Conflicts detected                          [Re-check ↻] │
│   2 of 5 changes have unresolved conflicts                  │
│                                                             │
│ ▼ abc123def456 (Change 3 of 5)                              │
│   • src/auth.ts — 2-sided conflict                          │
│   • src/config.ts — modify-delete conflict                  │
│                                                             │
│ ▼ def456ghi789 (Change 5 of 5)                              │
│   • README.md — 2-sided conflict                            │
└─────────────────────────────────────────────────────────────┘
```
- Red left border accent or red background tint.
- Red X icon (✗).
- Label: "Conflicts detected".
- Subtitle: "{N} of {total} changes have unresolved conflicts".
- Per-change collapsible sections (expanded by default), each showing:
  - Short change ID (first 12 hex characters, monospace, linked to change detail).
  - Position label: "(Change {pos} of {total})".
  - Bulleted list of conflicted files with path and conflict type.
- "Re-check" button (↻ icon) in the top-right corner, visible only to users with write access. Shows a spinner during re-check. Disabled for 10 seconds after last trigger.

**Unknown state:**
```
┌─────────────────────────────────────────────────────────────┐
│ ? Conflict status not yet determined          [Re-check ↻] │
│   Checking conflicts against main…                          │
└─────────────────────────────────────────────────────────────┘
```
- Yellow left border accent or yellow background tint.
- Yellow question mark icon (?).
- Label: "Conflict status not yet determined".
- Subtitle: "Checking conflicts against {target_bookmark}…".
- "Re-check" button visible to users with write access.

#### Header Indicator

A compact icon next to the state badge in the landing request page header:
- Clean: green ✓ (tooltip: "No conflicts")
- Conflicted: red ✗ (tooltip: "Conflicts detected — N changes affected")
- Unknown: yellow ? (tooltip: "Conflict status pending")

#### Landing List Column

A dedicated column in the landing request list table:
- Column header: no text (icon-only column, narrow width).
- Cell content: single icon (✓ / ✗ / ?) colored appropriately.
- Tooltip on hover shows the full status label.

#### Merge Gate UI

When a user clicks the "Queue for merge" button on a landing request with `conflict_status` ≠ `"clean"`:
- The button is visually disabled (grayed out, cursor: not-allowed).
- A tooltip reads: "Cannot merge — conflicts must be resolved first" (for conflicted) or "Cannot merge — conflict status is unknown" (for unknown).
- If the user has write access, a link or suggestion says "Re-check conflict status" pointing them to the conflict status section.

#### Real-Time Updates

The conflict status section subscribes to landing request SSE events. When a conflict status change event is received:
- The section updates in-place with a brief fade transition.
- If the status transitions to "conflicted," the per-change breakdown animates in.
- If the status transitions to "clean," the breakdown collapses and the clean indicator appears.

### API Shape

#### Get Landing Conflicts

```
GET /api/repos/:owner/:repo/landings/:number/conflicts
```

**Authentication:** Optional (public repos accessible without auth).

**Response (200):**
```json
{
  "conflict_status": "conflicted",
  "has_conflicts": true,
  "conflicts_by_change": {
    "abc123def456": [
      { "file_path": "src/auth.ts", "conflict_type": "2-sided conflict" },
      { "file_path": "src/config.ts", "conflict_type": "modify-delete conflict" }
    ],
    "def456ghi789": [
      { "file_path": "README.md", "conflict_type": "2-sided conflict" }
    ]
  }
}
```

**Response fields:**
- `conflict_status` (string, required): One of `"clean"`, `"conflicted"`, `"unknown"`.
- `has_conflicts` (boolean, required): `true` when `conflict_status === "conflicted"`.
- `conflicts_by_change` (object, optional): Map of change ID → array of conflict entries. Omitted or empty when status is `"clean"` or `"unknown"`.

**Error responses:**
- `404`: Landing request not found.
- `403`: User does not have read access to the repository.
- `410`: Repository has been deleted.

#### Trigger Conflict Re-check

```
POST /api/repos/:owner/:repo/landings/:number/conflicts/recheck
```

**Authentication:** Required. User must have write access.

**Response (202):**
```json
{
  "conflict_status": "unknown",
  "message": "Conflict re-check initiated"
}
```

The re-check runs asynchronously. The status is set to `"unknown"` immediately and updated to `"clean"` or `"conflicted"` when evaluation completes. An SSE event is emitted when the result is ready.

**Error responses:**
- `404`: Landing request not found.
- `403`: User does not have write access.
- `409`: Landing request is in a terminal state (merged, closed).
- `429`: Rate limited (more than 1 re-check per 10 seconds for this landing request).

#### Conflict Status on Landing Request Object

The landing request object returned by `GET /api/repos/:owner/:repo/landings/:number` includes `conflict_status` as a top-level field:

```json
{
  "number": 42,
  "title": "Add auth flow",
  "state": "open",
  "conflict_status": "clean"
}
```

### SDK Shape

The `@codeplane/sdk` landing service exposes:

```typescript
getLandingConflicts(
  viewer: User | null,
  owner: string,
  repo: string,
  number: number,
): Promise<Result<LandingConflictsResponse, APIError>>

recheckLandingConflicts(
  viewer: User,
  owner: string,
  repo: string,
  number: number,
): Promise<Result<{ conflict_status: string; message: string }, APIError>>
```

The `@codeplane/ui-core` package exposes a shared hook:

```typescript
useLandingConflicts(owner: string, repo: string, number: number): {
  data: LandingConflictsResponse | undefined;
  loading: boolean;
  error: Error | null;
  recheck: () => Promise<void>;
  recheckDisabled: boolean;
}
```

### CLI Command

#### `codeplane land view <number>`

Includes conflict status in the default output:

```
Landing Request #42 — Add auth flow
State:      open
Author:     alice
Target:     main
Conflicts:  ✗ conflicted (2 changes affected)

Conflicted Changes:
  Change abc123def456 (3 of 5):
    src/auth.ts           2-sided conflict
    src/config.ts         modify-delete conflict
  Change def456ghi789 (5 of 5):
    README.md             2-sided conflict
```

With `--json`:
```json
{
  "number": 42,
  "conflict_status": "conflicted",
  "conflicts_by_change": { "..." }
}
```

#### `codeplane land conflicts <number>`

Dedicated command for conflict inspection:

```
codeplane land conflicts 42
```

Output:
```
Conflict Status: conflicted
2 of 5 changes have unresolved conflicts

Change abc123def456 (3 of 5):
  src/auth.ts           2-sided conflict
  src/config.ts         modify-delete conflict

Change def456ghi789 (5 of 5):
  README.md             2-sided conflict
```

#### `codeplane land recheck <number>`

Triggers a manual conflict re-check:

```
codeplane land recheck 42
```

Output:
```
Conflict re-check initiated for Landing Request #42
Status: checking…
```

With `--wait`:
```
Conflict re-check initiated for Landing Request #42
Status: clean ✓ — No conflicts
```

### TUI UI

#### Landing List Screen

A dedicated conflict column in the landing request list:
- Column width: 3 characters.
- Content: `✓` (green ANSI 34), `✗` (red ANSI 196), `?` (yellow ANSI 178).
- Column is placed after the state column and before the title column.

#### Landing Detail Overview Tab

A "Conflict Status" section rendered below the description and above the review summary:

**Clean:**
```
Conflict Status
  ✓ No conflicts — all changes rebase cleanly onto main
```

**Conflicted:**
```
Conflict Status
  ✗ Conflicts detected — 2 of 5 changes affected

  abc123def456 (Change 3 of 5)
    src/auth.ts ............ 2-sided conflict
    src/config.ts .......... modify-delete conflict

  def456ghi789 (Change 5 of 5)
    README.md .............. 2-sided conflict
```

**Unknown:**
```
Conflict Status
  ? Checking conflicts against main…
```

#### Keyboard Shortcuts

| Key | Action | Condition |
|---|---|---|
| `Shift+C` | Trigger conflict re-check | Write access, open/draft state, not rate-limited |
| `m` | Queue for merge | Write access, open state, conflict_status = "clean" |
| `j` / `k` | Navigate conflict file list | Conflict section focused |
| `Enter` | Navigate to conflicted file diff | Conflict file selected |
| `c` | Cycle conflict filter in list view | Landing list screen |

#### Real-Time Updates

The TUI subscribes to SSE events for the current landing request. When conflict status changes:
- The status line updates immediately.
- A brief flash or highlight draws attention to the change.
- The status bar shows a transient notification.

### VS Code Extension

The VS Code extension landing request tree view includes:
- A conflict status icon next to each landing request in the tree (✓ / ✗ / ?).
- Clicking a conflicted landing request opens a detail webview that includes the conflict breakdown.
- A "Re-check Conflicts" command available via right-click context menu on a landing request tree item.
- Status bar item shows conflict count when a conflicted landing request is active.

### Neovim Plugin

The Neovim plugin provides:
- `:Codeplane land conflicts <number>` command that opens a floating window with conflict details.
- Telescope picker for landing requests includes a conflict indicator column.
- Statusline component shows conflict status for the current landing request context.
- `:Codeplane land recheck <number>` command to trigger re-check with status feedback in the command line.

### Documentation

The following end-user documentation should be written:

- **Landing Request Conflict Status Guide**: A user-facing guide explaining what conflict statuses mean, how jj conflicts differ from git merge conflicts, and how to resolve conflicts locally before re-checking.
- **CLI Reference — `land conflicts`**: Man-page-style reference for the `land conflicts` and `land recheck` commands with examples.
- **Keyboard Shortcuts Reference**: Updated keyboard shortcuts table for the TUI and web UI including conflict-related bindings.
- **Troubleshooting — Common Conflict Scenarios**: A troubleshooting guide covering scenarios like "My landing request shows conflicts after rebase," "Conflict status is stuck on unknown," and "Re-check is rate-limited."

## Permissions & Security

### Authorization Matrix

| Role | View Conflict Status | View Per-Change Breakdown | Trigger Re-check | Merge (requires clean) |
|---|---|---|---|---|
| **Owner** | ✓ | ✓ | ✓ | ✓ |
| **Admin** | ✓ | ✓ | ✓ | ✓ |
| **Member (write)** | ✓ | ✓ | ✓ | ✓ |
| **Member (read)** | ✓ | ✓ | ✗ | ✗ |
| **Anonymous (public repo)** | ✓ | ✓ | ✗ | ✗ |
| **Anonymous (private repo)** | ✗ | ✗ | ✗ | ✗ |

### Rate Limiting

| Endpoint | Limit | Scope |
|---|---|---|
| `GET .../conflicts` | 60 requests per minute | Per user (or IP for anonymous) |
| `POST .../conflicts/recheck` | 1 request per 10 seconds | Per user, per landing request |
| `POST .../conflicts/recheck` | 30 requests per hour | Per user, global |

### Data Privacy

- The conflict endpoint exposes **file paths only**, never file contents. This is acceptable because file paths are already visible in the repository's public tree and diff views.
- No PII is included in the conflict response beyond what is already present in the landing request object (author username).
- The `conflicts_by_change` payload must not include `base_content`, `left_content`, or `right_content` fields in the landing conflict status API — those are reserved for the per-change conflict detail API used by diff views.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `LandingConflictStatusViewed` | User opens landing detail and conflict status section is rendered | `landing_number`, `repo_id`, `conflict_status`, `conflicted_change_count`, `total_change_count`, `viewer_role`, `client` (web/cli/tui/vscode/neovim) |
| `LandingConflictRecheckTriggered` | User triggers a manual conflict re-check | `landing_number`, `repo_id`, `previous_status`, `client` |
| `LandingConflictRecheckCompleted` | Server completes a conflict re-check | `landing_number`, `repo_id`, `previous_status`, `new_status`, `conflicted_file_count`, `duration_ms` |
| `LandingConflictStatusChanged` | Conflict status transitions (any source) | `landing_number`, `repo_id`, `from_status`, `to_status`, `trigger` (recheck/push/rebase) |
| `LandingMergeBlockedByConflict` | User attempts merge on a conflicted/unknown landing request | `landing_number`, `repo_id`, `conflict_status`, `client` |
| `LandingConflictBreakdownExpanded` | User expands per-change conflict details (web/TUI) | `landing_number`, `repo_id`, `change_id`, `conflicted_file_count`, `client` |

### Funnel Metrics

1. **Conflict Resolution Funnel**: `LandingConflictStatusViewed` (conflicted) → `LandingConflictRecheckTriggered` → `LandingConflictRecheckCompleted` (clean) → `LandingEnqueued` — Measures how effectively users resolve conflicts and proceed to merge.
2. **Re-check Success Rate**: Percentage of re-checks where status transitions from "conflicted" → "clean" — indicates whether users are successfully resolving conflicts before re-checking.
3. **Conflict Prevalence**: Percentage of landing requests that have `conflict_status = "conflicted"` at any point in their lifecycle — signals repository health.
4. **Time to Resolution**: Median time from first `conflict_status = "conflicted"` to `conflict_status = "clean"` per landing request — measures user productivity.
5. **Merge Block Rate**: Percentage of merge attempts that are blocked by conflict status — signals whether users understand the gate.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|---|---|---|
| Conflict status fetch | `debug` | `{ landing_number, repo_id, viewer_id, conflict_status }` |
| Conflict re-check initiated | `info` | `{ landing_number, repo_id, user_id, previous_status }` |
| Conflict re-check completed | `info` | `{ landing_number, repo_id, new_status, conflicted_change_count, conflicted_file_count, duration_ms }` |
| Conflict re-check failed | `error` | `{ landing_number, repo_id, error_message, error_code, duration_ms }` |
| jj subprocess error during conflict evaluation | `error` | `{ landing_number, repo_id, change_id, command, exit_code, stderr }` |
| Rate limit hit on re-check | `warn` | `{ landing_number, repo_id, user_id, retry_after_seconds }` |
| Conflict status SSE event emitted | `debug` | `{ landing_number, repo_id, status, subscriber_count }` |
| Conflict status update persisted | `info` | `{ landing_number, repo_id, from_status, to_status }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_landing_conflict_status_fetch_total` | Counter | `status`, `repo_id` | Total conflict status fetches |
| `codeplane_landing_conflict_status_fetch_duration_seconds` | Histogram | `status` | Latency of conflict status fetches |
| `codeplane_landing_conflict_recheck_total` | Counter | `result` (clean/conflicted/error), `repo_id` | Total conflict re-checks |
| `codeplane_landing_conflict_recheck_duration_seconds` | Histogram | `result` | Latency of conflict re-check evaluations |
| `codeplane_landing_conflict_status_gauge` | Gauge | `status` (clean/conflicted/unknown) | Current count of landing requests by conflict status |
| `codeplane_landing_conflict_merge_blocked_total` | Counter | `conflict_status`, `repo_id` | Merge attempts blocked by conflict status |
| `codeplane_landing_conflict_recheck_rate_limited_total` | Counter | `repo_id` | Re-check attempts rejected by rate limiter |
| `codeplane_landing_conflict_jj_subprocess_errors_total` | Counter | `repo_id`, `error_type` | jj subprocess failures during conflict evaluation |

### Alerts

#### Alert: High Conflict Re-check Failure Rate

**Condition:** `rate(codeplane_landing_conflict_recheck_total{result="error"}[5m]) / rate(codeplane_landing_conflict_recheck_total[5m]) > 0.1` for 5 minutes.

**Severity:** Warning.

**Runbook:**
1. Check the server logs for `conflict re-check failed` entries with error details.
2. Verify that the jj binary is accessible and responsive: `jj version` on the repo host.
3. Check disk space on the repository storage volume — jj operations fail when disk is full.
4. Check if a specific repository is causing all failures (filter by `repo_id` label). If so, inspect that repository's jj operation log for corruption.
5. If jj subprocess calls are timing out, check system load and consider increasing the subprocess timeout.
6. Escalate to the platform team if the jj binary itself is crashing.

#### Alert: Conflict Re-check Latency Spike

**Condition:** `histogram_quantile(0.95, rate(codeplane_landing_conflict_recheck_duration_seconds_bucket[5m])) > 30` for 5 minutes.

**Severity:** Warning.

**Runbook:**
1. Check whether a specific repository has unusually large stacks (500 changes) causing slow sequential conflict evaluation.
2. Review `jj subprocess error during conflict evaluation` logs for slow or hanging jj processes.
3. Check repository storage I/O latency — slow disks directly impact jj operation speed.
4. If the issue is isolated to one repository, check its size (number of operations, working copy size).
5. Consider whether concurrent re-checks are overwhelming the repo host. Check `codeplane_landing_conflict_recheck_total` rate.

#### Alert: Conflict Status Stuck on Unknown

**Condition:** `codeplane_landing_conflict_status_gauge{status="unknown"} > 50` for 15 minutes.

**Severity:** Warning.

**Runbook:**
1. This indicates many landing requests have not had their conflict status evaluated.
2. Check whether the background conflict evaluation job is running (look for scheduled task logs).
3. Check the job queue or task runner for backlog.
4. Verify database connectivity — the status update may be failing at the persistence layer.
5. If this is a new deployment, confirm that the conflict evaluation service was initialized correctly during server bootstrap.
6. Manually trigger re-checks on a sample of stuck landing requests to see if they resolve.

#### Alert: Excessive Merge Blocks

**Condition:** `rate(codeplane_landing_conflict_merge_blocked_total[1h]) > 100`.

**Severity:** Info.

**Runbook:**
1. This is informational — it means many users are attempting to merge conflicted landing requests.
2. Check whether users are confused about the merge gate (could indicate a UX gap).
3. Review the most-blocked repositories. If one repo dominates, it may have systemic rebase issues.
4. Consider whether the conflict status check is producing false positives — compare `conflict_status = "conflicted"` with actual jj conflict state.
5. If the rate is extremely high, check for automation or bots repeatedly hitting the merge endpoint.

### Error Cases and Failure Modes

| Error | Cause | User-Facing Behavior | Recovery |
|---|---|---|---|
| jj binary not found | Missing or misconfigured jj installation on repo host | Re-check fails; status remains "unknown"; error toast/message | Install or configure jj on the repo host |
| jj subprocess timeout | Large repository or slow I/O causing jj to hang | Re-check fails after timeout; status remains "unknown" | Retry; investigate repo size and I/O |
| Repository not found | Deleted or transferred repository | 404 on conflict endpoint | User navigates away |
| Landing request not found | Invalid number or deleted landing request | 404 on conflict endpoint | User navigates away |
| Database write failure | Transient DB issue | Re-check appears to succeed but status does not update | Automatic retry on next re-check |
| SSE connection dropped | Network interruption | Client misses real-time update; stale status shown | Client reconnects automatically; user can manual refresh |
| Rate limit exceeded | User triggers re-check too frequently | 429 response; re-check button disabled with countdown | Wait for rate limit window to expire |
| Concurrent re-check race | Two users trigger re-check simultaneously | Last evaluation wins; both users see final consistent state | No action needed |

## Verification

### API Tests

- [ ] `GET /api/repos/:owner/:repo/landings/:number/conflicts` returns 200 with `conflict_status: "clean"`, `has_conflicts: false`, empty `conflicts_by_change` for a clean landing request.
- [ ] `GET /api/repos/:owner/:repo/landings/:number/conflicts` returns 200 with `conflict_status: "conflicted"`, `has_conflicts: true`, populated `conflicts_by_change` for a conflicted landing request.
- [ ] `GET /api/repos/:owner/:repo/landings/:number/conflicts` returns 200 with `conflict_status: "unknown"`, `has_conflicts: false` for a landing request with unknown status.
- [ ] `GET /api/repos/:owner/:repo/landings/:number/conflicts` returns 404 for a non-existent landing request number.
- [ ] `GET /api/repos/:owner/:repo/landings/:number/conflicts` returns 404 for a non-existent repository.
- [ ] `GET /api/repos/:owner/:repo/landings/:number/conflicts` returns 403 for a private repository when the user has no access.
- [ ] `GET /api/repos/:owner/:repo/landings/:number/conflicts` succeeds for an anonymous user on a public repository.
- [ ] `GET /api/repos/:owner/:repo/landings/:number/conflicts` includes correct `file_path` and `conflict_type` for each conflict entry.
- [ ] `conflicts_by_change` keys match the `change_ids` array of the landing request (only conflicted changes appear as keys).
- [ ] A landing request with 500 changes and 50 conflicted returns correct `conflicts_by_change` structure.
- [ ] A landing request with a single change that has 500 conflicted files returns all 500 entries in the response.
- [ ] A `file_path` at exactly 4,096 characters is returned without truncation.
- [ ] A `conflict_type` value that is not a known type (e.g., "4-sided conflict") is returned verbatim.
- [ ] `POST /api/repos/:owner/:repo/landings/:number/conflicts/recheck` returns 202 for an authorized user with write access.
- [ ] `POST .../recheck` returns 403 for a user with read-only access.
- [ ] `POST .../recheck` returns 403 for an anonymous user.
- [ ] `POST .../recheck` returns 404 for a non-existent landing request.
- [ ] `POST .../recheck` returns 409 for a landing request in "merged" state.
- [ ] `POST .../recheck` returns 409 for a landing request in "closed" state.
- [ ] `POST .../recheck` returns 429 when called twice within 10 seconds for the same landing request.
- [ ] `POST .../recheck` succeeds when called 10+ seconds after the previous re-check for the same landing request.
- [ ] After a successful re-check, `GET .../conflicts` returns updated status.
- [ ] The `conflict_status` field on the landing request object (from `GET .../landings/:number`) matches the conflict endpoint response.
- [ ] `PATCH .../landings/:number` with `conflict_status: "invalid_value"` returns a validation error.
- [ ] `PATCH .../landings/:number` with `conflict_status: "clean"` successfully updates the status.
- [ ] Rate limiter correctly applies per-user per-landing-request scope (user A and user B can both re-check the same landing request within 10 seconds).

### Web UI E2E Tests (Playwright)

- [ ] Landing detail page loads and displays the conflict status section in the Overview tab.
- [ ] Conflict status section shows green checkmark and "No conflicts" label for a clean landing request.
- [ ] Conflict status section shows red X, "Conflicts detected," and per-change breakdown for a conflicted landing request.
- [ ] Conflict status section shows yellow question mark and "Conflict status not yet determined" for an unknown-status landing request.
- [ ] Per-change breakdown displays correct short change ID (12 characters), position label, file paths, and conflict types.
- [ ] Per-change sections are collapsible — clicking collapses and re-expands.
- [ ] The "Re-check" button is visible to authenticated users with write access.
- [ ] The "Re-check" button is not visible to anonymous users.
- [ ] The "Re-check" button is not visible to users with read-only access.
- [ ] Clicking "Re-check" shows a loading spinner and updates the conflict status section upon completion.
- [ ] The "Re-check" button is disabled for 10 seconds after being clicked.
- [ ] The "Queue for merge" button is disabled when conflict status is "conflicted" with an appropriate tooltip.
- [ ] The "Queue for merge" button is disabled when conflict status is "unknown" with an appropriate tooltip.
- [ ] The "Queue for merge" button is enabled when conflict status is "clean."
- [ ] Landing request list page shows conflict status icon (✓, ✗, ?) in the correct column for each row.
- [ ] Page header includes the compact conflict status indicator next to the state badge.
- [ ] A landing request with a Unicode file path in the conflict list renders the path correctly.
- [ ] A landing request with zero changes shows conflict status as "clean" with no breakdown.
- [ ] The conflict status section updates via SSE without manual refresh when status changes server-side.
- [ ] The "Re-check" button is not visible on a merged landing request.
- [ ] The "Re-check" button is not visible on a closed landing request.

### CLI Tests

- [ ] `codeplane land view <number>` includes "Conflicts: ✓ clean" for a clean landing request.
- [ ] `codeplane land view <number>` includes "Conflicts: ✗ conflicted" and per-change breakdown for a conflicted landing request.
- [ ] `codeplane land view <number>` includes "Conflicts: ? unknown" for an unknown-status landing request.
- [ ] `codeplane land view <number> --json` includes `conflict_status` and `conflicts_by_change` fields.
- [ ] `codeplane land conflicts <number>` outputs structured conflict details for a conflicted landing request.
- [ ] `codeplane land conflicts <number>` outputs "No conflicts" for a clean landing request.
- [ ] `codeplane land conflicts <number>` returns exit code 0 for clean or conflicted and non-zero for errors.
- [ ] `codeplane land conflicts <number> --json` returns valid JSON matching the API response schema.
- [ ] `codeplane land recheck <number>` outputs "Conflict re-check initiated" on success.
- [ ] `codeplane land recheck <number>` returns an error for a user without write access.
- [ ] `codeplane land recheck <number>` returns an error for a merged landing request.
- [ ] `codeplane land recheck <number> --wait` polls until the re-check completes and prints the final status.
- [ ] `codeplane land land <number>` (merge command) on a conflicted landing request prints a clear error about conflicts.
- [ ] `codeplane land land <number>` on an unknown-status landing request prints a clear error about unknown status.
- [ ] File paths with spaces and Unicode characters render correctly in CLI conflict output.

### TUI Tests

- [ ] Landing list screen displays the conflict status icon column with correct icons and ANSI colors.
- [ ] Landing detail Overview tab renders the "Conflict Status" section with correct status and formatting.
- [ ] Conflicted status shows per-change breakdown with change IDs and file paths.
- [ ] `Shift+C` triggers conflict re-check and updates the display.
- [ ] `Shift+C` is debounced — pressing it twice within 10 seconds shows a rate limit message.
- [ ] `Shift+C` is ignored on merged/closed landing requests.
- [ ] `m` key is disabled when conflict status is "conflicted" or "unknown."
- [ ] `m` key works when conflict status is "clean" and state is "open."
- [ ] `j`/`k` navigation works within the conflict file list.
- [ ] `Enter` on a conflicted file navigates to the diff view for that file.
- [ ] `c` key cycles through conflict filter states in the landing list (all → clean → conflicted → unknown → all).
- [ ] SSE update causes the conflict status to refresh in the TUI without user input.
- [ ] Terminal resize does not break the conflict status section layout at widths 80, 120, and 200+.

### Cross-Client Consistency Tests

- [ ] Conflict status returned by the API, displayed in web UI, CLI, and TUI all agree for the same landing request.
- [ ] After a re-check triggered via CLI, the web UI reflects the updated status on next load.
- [ ] After a re-check triggered via web UI, the CLI reflects the updated status.
- [ ] The per-change breakdown in CLI `--json` output matches the API response structure exactly.
- [ ] Conflict type strings are displayed identically across all clients (no client-side mapping or transformation).
