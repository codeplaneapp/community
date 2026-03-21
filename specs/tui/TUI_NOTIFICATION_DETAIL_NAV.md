# TUI_NOTIFICATION_DETAIL_NAV

Specification for TUI_NOTIFICATION_DETAIL_NAV.

## High-Level User POV

When a user presses `Enter` on a notification in the Notification List screen, the TUI navigates them directly to the resource that generated the notification. This is not a "notification detail" screen — there is no intermediate view. The notification acts as a link: pressing `Enter` on an issue notification opens the issue detail view, pressing `Enter` on a landing request review notification opens the landing detail view, and pressing `Enter` on a workflow run notification opens the workflow run detail view. The user experiences seamless navigation from their inbox to the exact resource they need to act on.

The navigation is context-aware and type-driven. The TUI reads the notification's `source_type` field to determine which screen to push. For repository-scoped resources (issues, landing requests, workflows), the notification carries denormalized repository context (`repo_owner`, `repo_name`) and the human-readable `resource_number` (e.g., the issue number `#42`, the landing request number `#15`). These fields are populated at notification creation time by the fanout service, which already has this context available on its event objects. For workspace notifications, only the workspace ID is needed. No additional API calls are required for navigation — the notification payload is self-contained.

**Why denormalized fields?** The notification's `source_id` field stores a database primary key, not a human-readable number. For issues and landing requests, the database PK (`id`) and the per-repo sequential number (`number`) are distinct values — they only coincide by accident. The `resource_number` field carries the correct human-readable number that the target detail screen's API requires. Similarly, the notification table does not store repository context, but the fanout service has access to `repositoryId` on all events and can resolve `repo_owner`/`repo_name` at write time.

If a notification was created before the denormalized fields were available (legacy notifications missing `repo_owner`, `repo_name`, or `resource_number`), the TUI calls a server-side resolution endpoint (`GET /api/notifications/:id/source`) to look up the missing context. This resolution is fast — a single lightweight API call that joins the notification's `source_id` against the resource and repository tables — and the user sees a brief "Resolving…" indicator in the status bar during the lookup (typically under 200ms). A spinner appears in the notification row's unread indicator column if resolution exceeds 200ms.

Once the target is determined, the appropriate detail screen is pushed onto the navigation stack with the correct breadcrumb context. For example, pressing `Enter` on an issue comment notification opens the issue detail view with breadcrumb `Dashboard > Notifications > acme/api > Issue #42`. Pressing `q` from the detail view returns to the notification list with scroll position, focus, filter state, and search query all preserved.

The notification is automatically marked as read when the user navigates to its source. This happens optimistically — the unread indicator (`●`) disappears from the row immediately when `Enter` is pressed, before navigation completes. The unread count in the title bar and the notification badge in the header bar both decrement immediately. If the mark-read API call fails, the read status reverts when the user returns to the notification list. Mark-read failure never blocks navigation — the user always reaches the target screen.

If a notification references a resource the user can no longer access, or if the resource has been deleted, the behavior depends on whether the denormalized fields are present. If enriched fields are present, navigation proceeds and the target detail screen handles the error with its own "Not found" or "Access denied" state. If the fallback resolution endpoint is needed and it returns 404 or 403, the user sees a transient status bar message and remains on the notification list. If a notification has a null `source_id` or an unrecognized `source_type`, navigation is blocked with a brief status bar flash and the user stays on the list.

The navigation preserves the notification list state completely. When the user presses `q` on the detail screen to return, their scroll position, focused row, active filter, and search query are all exactly as they left them. This makes it natural to triage a batch of notifications: `Enter` to view, `q` to return, `j` to move to the next, `Enter` again — a tight keyboard loop that respects the terminal user's flow.

For comment-type notifications (`issue_comment`, `lr_review`, `lr_comment`), the navigation pushes the parent resource's detail screen — the issue or landing request that the comment belongs to. The fanout service stores the parent resource's ID (e.g., `event.issueId` for `issue_comment`, `event.landingRequestId` for `lr_comment`) as the notification's `source_id`, so resolution works identically to the parent type.

## Acceptance Criteria

### Definition of Done

#### Source Type Routing
- [ ] `source_type: "issue"` → pushes `issue-detail` screen with `{ repo: "<repo_owner>/<repo_name>", number: <resource_number> }` context
- [ ] `source_type: "issue_comment"` → pushes `issue-detail` screen with `{ repo: "<repo_owner>/<repo_name>", number: <resource_number> }` context (navigates to the parent issue; the fanout stores `issueId` as `source_id` for comment notifications)
- [ ] `source_type: "landing_request"` → pushes `landing-detail` screen with `{ repo: "<repo_owner>/<repo_name>", number: <resource_number> }` context
- [ ] `source_type: "lr_review"` → pushes `landing-detail` screen with `{ repo: "<repo_owner>/<repo_name>", number: <resource_number> }` context
- [ ] `source_type: "lr_comment"` → pushes `landing-detail` screen with `{ repo: "<repo_owner>/<repo_name>", number: <resource_number> }` context
- [ ] `source_type: "workflow_run"` → pushes `workflow-run-detail` screen with `{ repo: "<repo_owner>/<repo_name>", runId: <source_id> }` context (workflow runs use their database ID directly — no separate human-readable number)
- [ ] `source_type: "workspace"` → pushes `workspace-detail` screen with `{ workspaceId: <source_id> }` context (workspaces are not repo-scoped; no resolution needed)
- [ ] Unknown or unsupported `source_type` values show a status bar flash: "Unknown notification type" (3 seconds) with no navigation
- [ ] Null `source_id` blocks navigation and shows status bar flash: "Cannot navigate — source not found" (3 seconds)

#### Notification Payload Enrichment (Primary Path)
- [ ] `NotificationResponse` includes three denormalized fields: `repo_owner: string | null`, `repo_name: string | null`, `resource_number: number | null`
- [ ] For `source_type: "issue"` and `"issue_comment"`: `repo_owner` = repository owner username/org, `repo_name` = repository name, `resource_number` = issue number (the per-repo sequential `number` column, NOT the database `id` primary key)
- [ ] For `source_type: "landing_request"`, `"lr_review"`, `"lr_comment"`: `repo_owner` = repository owner, `repo_name` = repository name, `resource_number` = landing request number
- [ ] For `source_type: "workflow_run"`: `repo_owner` = repository owner, `repo_name` = repository name, `resource_number` = null (workflow runs use `source_id` directly as `runId`)
- [ ] For `source_type: "workspace"`: `repo_owner` = null, `repo_name` = null, `resource_number` = null (workspaces use `source_id` directly as `workspaceId`)
- [ ] The fanout service populates these fields at notification creation time using the event's `repositoryId` (already available on all fanout events) and the resource's human-readable number (already available as `issueNumber`, `landingRequestNumber` on event objects)
- [ ] When `repo_owner` and `repo_name` are present, navigation proceeds synchronously (no additional API call)

#### Fallback Resolution (Legacy Notifications)
- [ ] If a repo-scoped notification is missing `repo_owner`, `repo_name`, or `resource_number` (legacy notifications created before the enrichment migration), the TUI calls `GET /api/notifications/:id/source`
- [ ] The resolution endpoint returns `{ screen: string, repo_owner: string, repo_name: string, resource_number: number | null }` — the navigation context
- [ ] The endpoint resolves by joining `source_id` + `source_type` against the resource and repository tables (e.g., `getIssueByID(source_id)` → `repositoryId` + `number`, then `getRepoByID(repositoryId)` → `owner/name`)
- [ ] The endpoint returns 404 if the notification does not exist, the source resource has been deleted, or the notification belongs to another user
- [ ] The endpoint returns 403 if the user no longer has access to the source resource's repository
- [ ] While the resolution API call is in-flight, the status bar shows "Resolving…" in muted color
- [ ] If resolution takes longer than 200ms, a spinner appears in the focused row's unread indicator column (braille dot cycle: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms per frame)
- [ ] Resolution timeout: 10 seconds. If exceeded, status bar shows "Navigation timed out. Press Enter to retry." and the spinner is removed
- [ ] The user can press `Esc`, `j`, `k`, or `q` during resolution to cancel
- [ ] On resolution 404: status bar shows "Source resource not found." in `warning` color for 3 seconds
- [ ] On resolution 403: status bar shows "You no longer have access to this resource." in `warning` color for 3 seconds

#### Mark Read on Navigate
- [ ] Pressing `Enter` on an unread notification marks it as read optimistically (`●` indicator removed, bold text changed to normal weight, unread count decremented in title and header badge)
- [ ] The mark-read API call (`PATCH /api/notifications/:id`) fires concurrently with navigation (or resolution, if needed)
- [ ] If mark-read fails, the read status reverts when the user returns to the notification list
- [ ] If the notification is already read, no mark-read API call is made
- [ ] Mark-read failure never blocks navigation — the detail screen push always proceeds
- [ ] If mark-read returns 404 (notification deleted server-side), the notification is removed from the list

#### Navigation Stack
- [ ] The pushed detail screen appears in the breadcrumb with full context: e.g., `Dashboard > Notifications > acme/api > Issue #42`
- [ ] For workspace notifications (no repo context): breadcrumb shows `Dashboard > Notifications > Workspace: my-workspace`
- [ ] Pressing `q` on the detail screen returns to the notification list with all state preserved
- [ ] The stack entry for the detail screen uses the resource title as display title (e.g., `Issue #42: Fix login timeout`, truncated to 40 characters with `…`)
- [ ] Double-press `Enter` on the same notification does not push duplicate screens (push-to-same-screen guard)
- [ ] `Enter` while the notification list is in loading or error state is a no-op
- [ ] Navigation stack push happens within 50ms of `Enter` keypress (when enriched fields are present)
- [ ] Navigation after resolution completes within 50ms of resolution response

#### State Preservation on Return
- [ ] Scroll position within the `<scrollbox>` is restored
- [ ] Focused row index is restored (adjusted if the row was removed due to mark-read + Unread filter)
- [ ] Active filter (All / Unread) is preserved
- [ ] Search query text is preserved
- [ ] Loaded pages (cached notification data) are preserved
- [ ] If the notification was marked read and the "Unread" filter is active, the notification is no longer visible — focus advances to the next item, or to the previous item if the navigated notification was the last one

### Keyboard Interactions
- [ ] `Enter` on a focused notification triggers source-type routing and navigation
- [ ] `Enter` is suppressed when search input is focused (key passes to input)
- [ ] `Enter` during resolution is a no-op (prevents double navigation)
- [ ] `Enter` after resolution timeout retries the resolution
- [ ] `Esc` during resolution cancels the in-flight API call; user stays on notification list
- [ ] `j` / `k` during resolution cancels resolution and moves focus normally
- [ ] `q` during resolution cancels resolution and pops the notification list screen
- [ ] `Ctrl+C` during resolution quits the TUI immediately
- [ ] `q` on the target detail screen pops back to the notification list
- [ ] All global keybindings (`:`, `?`, `g`, `Ctrl+C`) remain active on the target detail screen
- [ ] No new keybindings are introduced — this feature augments the existing `Enter` behavior

### Responsive Behavior
- [ ] Navigation behavior is identical across all terminal sizes (80×24, 120×40, 200×60)
- [ ] The target detail screen renders according to its own responsive rules at the current terminal size
- [ ] Terminal resize during resolution: status bar "Resolving…" re-renders at new width; resolution continues
- [ ] Terminal resize during navigation transition does not cause errors

### Truncation & Boundary Constraints
- [ ] Stack entry display title follows the target screen's truncation rules (e.g., `Issue #42: Fix login…` at 40ch max)
- [ ] Breadcrumb segment for "Notifications" is 13 characters (within the 24-character limit)
- [ ] `source_type` matching is exact string comparison — no partial matching, no case-insensitive matching
- [ ] `source_id` is validated as non-null before navigation is attempted
- [ ] `source_id` is a positive integer, max 2^53 - 1 (JavaScript safe integer)
- [ ] `source_type` string max length: 32 characters
- [ ] Status bar messages truncated at terminal width minus 20 characters
- [ ] Resolution spinner cycles at 80ms per frame, single character width, fits in 2ch unread indicator column

### Edge Cases
- [ ] `source_type: "issue_comment"` with `source_id`: the fanout service stores `event.issueId` (the parent issue's database PK, not the comment's ID) as `source_id` for `issue_comment` notifications (see `onIssueCommented` in notification-fanout.ts), so resolution works identically to `"issue"` type
- [ ] Notification for a deleted resource with enriched fields present: navigation proceeds, target detail screen shows its own "Not found" error
- [ ] Notification for a deleted resource requiring resolution: resolution returns 404, status bar flash, user stays on list
- [ ] Rapid `Enter` presses: first press navigates, subsequent are absorbed by the in-progress guard or push-to-same-screen guard
- [ ] `Enter` during SSE reconnection: navigation proceeds normally (SSE state is independent)
- [ ] `Enter` on notification that just arrived via SSE (during highlight animation): navigates normally
- [ ] Terminal resize at the exact moment of `Enter` press: resize and navigation are independent events
- [ ] 429 on mark-read during navigation: navigation still proceeds; mark-read optimistic update reverts silently
- [ ] Navigation from notification in "Unread" filter mode marks the notification read, causing it to disappear from the filtered list on return — focus moves to the next visible notification
- [ ] Network disconnect before navigation push: push is client-side and always succeeds; data fetch failure handled by target detail screen
- [ ] Stack at depth 32 (maximum): status bar error "Navigation stack full"; no push
- [ ] Rapid `Enter` → `Esc` → `Enter` → `Esc` cycle: no state corruption; each cycle cleanly cancels and restarts

## Design

### Source Type Resolution Logic

The navigation dispatch maps each notification to its target screen and constructs the context needed by that screen:

```
source_type            → Screen ID               → Context Source
───────────────────────────────────────────────────────────────────────────────
"issue"                → "issue-detail"           → { repo: repo_owner/repo_name, number: resource_number }
"issue_comment"        → "issue-detail"           → { repo: repo_owner/repo_name, number: resource_number }
"landing_request"      → "landing-detail"         → { repo: repo_owner/repo_name, number: resource_number }
"lr_review"            → "landing-detail"         → { repo: repo_owner/repo_name, number: resource_number }
"lr_comment"           → "landing-detail"         → { repo: repo_owner/repo_name, number: resource_number }
"workflow_run"         → "workflow-run-detail"     → { repo: repo_owner/repo_name, runId: source_id }
"workspace"            → "workspace-detail"       → { workspaceId: source_id }
(unknown)              → (no navigation)          → status bar flash
```

**Critical data note**: The notification's `source_id` stores a database primary key, NOT a human-readable number. For issues and landing requests, the database PK (`id`) and the per-repo sequential number (`number`) are distinct values — they only coincide by accident (e.g., the first issue in the first repo). The `resource_number` field on the enriched notification carries the correct human-readable number. For workflow runs and workspaces, the database ID is used directly as the API identifier.

### Navigation Decision Tree

```
Enter pressed on focused notification
  ├─ Guard: isLoading || isError → no-op
  ├─ Guard: source_id === null → flash "Cannot navigate — source not found"
  ├─ Guard: source_type unknown → flash "Unknown notification type"
  ├─ Guard: isResolving → no-op (already navigating)
  │
  ├─ Mark read (if unread): optimistic UI + fire PATCH /api/notifications/:id
  │
  ├─ source_type === "workspace"
  │   └─ push("workspace-detail", { workspaceId: source_id })
  │
  ├─ Enriched fields present (repo_owner && repo_name && (resource_number != null || source_type === "workflow_run"))
  │   └─ push(targetScreen, { repo: `${repo_owner}/${repo_name}`, number|runId })
  │
  └─ Enriched fields missing (legacy notification)
      ├─ Set isResolving = true
      ├─ Show "Resolving…" in status bar
      ├─ Call GET /api/notifications/:id/source
      │   ├─ 200: push(response.screen, resolved context)
      │   ├─ 404: flash "Source resource not found."
      │   ├─ 403: flash "You no longer have access to this resource."
      │   ├─ 429: flash "Rate limited. Retry in {Retry-After}s."
      │   ├─ 401: delegate to global auth error handler
      │   ├─ timeout (10s): flash "Navigation timed out. Press Enter to retry."
      │   └─ network error: flash "Network error. Press Enter to retry."
      └─ Set isResolving = false
```

### Layout Impact

This feature does not introduce a new screen or layout. It augments the `Enter` keybinding on the Notification List screen and pushes an existing detail screen. The visual transition is:

1. **Before navigation** — Notification list is visible with a focused row highlighted in reverse video
2. **During navigation** (< 50ms when enriched) — Screen stack push; notification list moves to background; target detail screen begins rendering
3. **After navigation** — Target detail screen is fully visible with its own layout; breadcrumb updated

When resolution is needed (legacy notifications), the sequence includes an intermediate state:

1. **Before resolution** — Status bar changes to "Resolving… (Esc to cancel)"
2. **During resolution** (typically < 200ms) — If > 200ms, spinner appears in the row's unread indicator column
3. **After resolution** — Push and render as above

### Status Bar States

```tsx
{/* Normal state */}
<text color="muted">j/k:nav Enter:open r:read R:all f:filter q:back</text>

{/* Resolving state (legacy notifications only) */}
<text color="muted">Resolving… (Esc to cancel)</text>

{/* Error states (transient, 3s) */}
<text color="warning">Source resource not found.</text>
<text color="warning">You no longer have access to this resource.</text>
<text color="warning">Unknown notification type</text>
<text color="muted">Cannot navigate — source not found</text>

{/* Timeout / retry states */}
<text color="error">Navigation timed out. Press Enter to retry.</text>
<text color="error">Network error. Press Enter to retry.</text>
<text color="warning">Rate limited. Retry in {n}s.</text>
```

### Row Spinner (during resolution)

When legacy notification resolution exceeds 200ms, the focused row's unread indicator column shows a spinner:

```tsx
<box flexDirection="row" height={1} style={{ reverse: true, color: "primary" }}>
  <text width={2} color="muted">
    {isResolving ? spinnerFrame : notif.status === "unread" ? "●" : " "}
  </text>
  {/* ... rest of notification row unchanged */}
</box>
```

Spinner sequence: `⠋`, `⠙`, `⠹`, `⠸`, `⠼`, `⠴`, `⠦`, `⠧`, `⠇`, `⠏` — single character, 80ms per frame, fits in the 2ch unread indicator column.

### Breadcrumb Construction

When navigation resolves, the detail screen is pushed with intermediate breadcrumb entries:

```
Issue / Issue Comment:
  [Dashboard] > [Notifications] > [acme/api] > [Issue #42: Fix login…]

Landing Request / LR Review / LR Comment:
  [Dashboard] > [Notifications] > [acme/api] > [Landing #15: Add auth…]

Workflow Run:
  [Dashboard] > [Notifications] > [acme/api] > [Workflow Run #789]

Workspace:
  [Dashboard] > [Notifications] > [Workspace: my-workspace]
```

The "Notifications" segment is always present — pressing `q` on the detail screen pops back to it. For workspace notifications (no repo context), the breadcrumb omits the repo segment.

### Keybindings

No new keybindings are introduced. This feature defines the behavior of the existing `Enter` key on the Notification List screen and adds cancellation behavior during resolution:

| Key | Action | Condition |
|-----|--------|-----------|
| `Enter` | Begin navigation (resolve if needed, push target screen) | Notification focused, not loading, not error, not resolving, source_id non-null |
| `Enter` | Retry resolution | Timeout or network error state active |
| `Enter` | No-op | Resolution in progress, or search input focused |
| `Esc` | Cancel in-flight resolution | Resolution in progress |
| `j` / `k` | Cancel resolution + move focus | Resolution in progress |
| `q` | Cancel resolution + pop screen | Resolution in progress |
| `Ctrl+C` | Quit immediately | Always |

The target detail screen inherits all of its own keybindings after navigation.

### Responsive Behavior

The navigation resolution logic is terminal-size-independent. The only responsive concern is status bar message truncation:

| Terminal Size | Behavior |
|--------------|----------|
| 80×24 | Status bar messages truncated to fit (terminal width − 20ch for sync/help). Spinner visible (2ch column always present). Breadcrumb on pushed screen truncates from left per router spec |
| 120×40 | Full status bar messages. Full breadcrumb on pushed screens |
| 200×60+ | No additional changes from standard behavior |

Resize during resolution: the status bar "Resolving…" message re-renders at the new width. The resolution API call is unaffected by resize.

### Data Hooks

- `useNavigation()` — from TUI routing; provides `push()` to push the resolved detail screen onto the navigation stack
- `useNotifications()` — from `@codeplane/ui-core`; provides the notification list data (including enriched fields `repo_owner`, `repo_name`, `resource_number`) and `markRead()` function for optimistic updates
- `useNotificationSourceResolve(notificationId)` — from `@codeplane/ui-core`; calls `GET /api/notifications/:id/source` for legacy notifications missing enriched fields; returns `{ screen, repo_owner, repo_name, resource_number }` or error
- `useStatusBarHints()` — from TUI routing; provides `setHints()` and `flash()` for status bar text updates
- `useKeyboard()` — from `@opentui/react`; for detecting `Enter`, `Esc`, `j`/`k` keypresses during resolution state
- `useTerminalDimensions()` — from `@opentui/react`; for status bar message truncation calculations

### API Endpoints Consumed

- `PATCH /api/notifications/:id` — Mark notification as read on navigation (optimistic, fire-and-forget with revert on error)
- `GET /api/notifications/:id/source` — (fallback only) Resolve navigation context for legacy notifications missing denormalized `repo_owner`, `repo_name`, `resource_number` fields

### Source Resolution Endpoint

**`GET /api/notifications/:id/source`**

This endpoint is consumed only when a notification is missing the denormalized navigation fields (legacy notifications). It resolves the notification's `source_id` + `source_type` to the navigation context needed by the TUI.

Request:
- Auth: Bearer token (required)
- Path: `id` — notification ID (integer)

Response (200):
```json
{
  "screen": "issue-detail",
  "repo_owner": "acme",
  "repo_name": "api",
  "resource_number": 42
}
```

Response fields:
- `screen` — TUI screen ID: `"issue-detail"`, `"landing-detail"`, `"workflow-run-detail"`, `"workspace-detail"`
- `repo_owner` — repository owner username or org name; null for workspaces
- `repo_name` — repository name; null for workspaces
- `resource_number` — human-readable number (issue number, LR number); null for workflow runs (use `source_id` as `runId`) and workspaces (use `source_id` as `workspaceId`)

Server-side resolution logic:
- `"issue"` / `"issue_comment"`: `getIssueByID(source_id)` → `{ repositoryId, number }` → `getRepoByID(repositoryId)` → `{ owner, name }`
- `"landing_request"` / `"lr_review"` / `"lr_comment"`: `getLandingRequestByID(source_id)` → `{ repositoryId, number }` → `getRepoByID(repositoryId)` → `{ owner, name }`
- `"workflow_run"`: `getWorkflowRunByID(source_id)` → `{ repositoryId }` → `getRepoByID(repositoryId)` → `{ owner, name }`
- `"workspace"`: direct lookup, no repo resolution needed

Error responses:
- 401: not authenticated
- 403: user lacks access to the source resource's repository
- 404: notification not found, source resource deleted, or notification belongs to another user
- 429: rate limited

### State Preservation on Return

When the user presses `q` on the target detail screen:

1. The detail screen is popped from the stack
2. The notification list screen is restored from the stack entry
3. The following state is preserved:
   - Scroll position within the `<scrollbox>`
   - Focused row index (adjusted if the row was removed due to mark-read + Unread filter)
   - Active filter (All / Unread)
   - Search query text
   - Loaded pages (cached notification data)
4. If the notification was marked read and the "Unread" filter is active, the notification is no longer visible — focus advances to the next item in the filtered list, or to the previous item if the navigated notification was the last one

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (own notification) | Authenticated (other's notification) |
|--------|-----------|----------------------------------|--------------------------------------|
| Navigate from notification to source (enriched) | ❌ | ✅ | ❌ |
| Resolve notification source (fallback API) | ❌ | ✅ | ❌ |
| Mark notification as read on navigation | ❌ | ✅ | ❌ |
| View target resource (issue, landing, etc.) | ❌ | ✅ (subject to target resource permissions) | ❌ |

- The notification list screen itself requires authentication (handled by `TUI_NOTIFICATION_LIST_SCREEN`)
- When enriched fields are present, navigation is entirely client-side — no additional server authorization check occurs at navigation time. If the user has since lost access to the target resource, the target detail screen handles the 403/404 with its own error state
- When the fallback resolution endpoint is used, it performs a server-side permission check: if the user no longer has access to the source resource's repository, the endpoint returns 403
- The mark-read API call is user-scoped: a user can only mark their own notifications as read (server-enforced via `WHERE user_id = $1` clause)
- The navigation context (`repo_owner`, `repo_name`, `resource_number`) is derived from server-provided data — it is not user-editable or user-injectable
- There is no admin/org-level notification access — notifications are strictly per-user

### Token-based Auth

- The mark-read `PATCH` and resolution `GET` requests use the same `Bearer` token as all other API calls via `@codeplane/ui-core`
- Token is loaded at TUI bootstrap from CLI keychain or `CODEPLANE_TOKEN` environment variable
- If the token expires between screen mount and `Enter` press, the 401 from mark-read or resolution propagates to the global auth error screen
- Token is never included in log messages, status bar flashes, or error displays
- Resolution results are held in memory only for the duration of the navigation transition — not logged, cached, or persisted
- SSE connections use ticket-based authentication obtained via the auth API (independent of navigation)

### Rate Limiting

| Endpoint | Limit | Rationale |
|----------|-------|-----------|
| `PATCH /api/notifications/:id` (mark read) | 120 req/min | In the triage loop (Enter → q → j → Enter), a user navigates at most ~2 notifications/second, well within limits |
| `GET /api/notifications/:id/source` (resolution) | 120 req/min | Only invoked for legacy notifications; enriched notifications skip this call entirely |

- If either endpoint is rate limited (429), the status bar shows "Rate limited. Retry in {Retry-After}s."
- Mark-read rate limit: optimistic update reverts; navigation still proceeds
- Resolution rate limit: navigation does not proceed; user stays on list
- Rapid `Enter` → `Esc` → `Enter` cycles are naturally throttled by the resolution time and the single-resolution guard

### Data Sensitivity

- The navigation context contains repository owner, repo name, and resource numbers — all of which the user already has access to via the notification
- The resolution endpoint does not expose resource content (title, body, comments) — only identifiers needed for navigation
- No new data exposure beyond what the notification list already shows
- `source_id` is a numeric database ID, not a secret or token
- Notification subjects may contain repository names, issue titles, or user logins — these are user-scoped data, not cross-user

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.notification.navigate` | `Enter` pressed on notification, navigation initiated | `notification_id`, `source_type`, `source_id`, `target_screen`, `was_unread`, `position_in_list`, `list_filter` ("all" / "unread"), `had_search_query`, `time_on_list_ms`, `used_enriched_fields` (boolean), `terminal_width`, `terminal_height` |
| `tui.notification.navigate.resolve` | Fallback resolution API returns | `notification_id`, `source_type`, `resolved_screen`, `resolved_repo`, `resolve_duration_ms`, `success` |
| `tui.notification.navigate.complete` | Detail screen successfully pushed | `notification_id`, `source_type`, `target_screen`, `target_repo`, `total_duration_ms` (Enter to screen push) |
| `tui.notification.navigate.mark_read` | Unread notification marked read on navigation | `notification_id`, `source_type`, `mark_read_success`, `mark_read_latency_ms` |
| `tui.notification.navigate.blocked` | Navigation blocked (null source_id or unknown type) | `notification_id`, `source_type`, `source_id`, `block_reason` ("null_source_id" / "unknown_source_type") |
| `tui.notification.navigate.error` | Resolution fails (404, 403, timeout, network) | `notification_id`, `source_type`, `error_type` ("not_found" / "access_denied" / "timeout" / "network" / "rate_limited"), `http_status` |
| `tui.notification.navigate.cancel` | User cancels resolution (Esc, j/k, q) | `notification_id`, `source_type`, `cancel_method` ("escape" / "move" / "quit"), `resolve_elapsed_ms` |
| `tui.notification.navigate.return` | User pops back from detail to notification list | `notification_id`, `source_type`, `target_screen`, `time_on_detail_ms` |
| `tui.notification.navigate.triage_loop` | User completes a triage cycle: Enter → q → j → Enter (within 30s) | `cycle_count`, `total_triage_time_ms`, `source_types_visited` |

### Common Properties (all events)

- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|-----------|
| Navigation success rate (Enter → detail screen rendered) | >99% | Most notifications should navigate successfully with enriched data |
| Enriched-field hit rate (no resolution needed) | >95% | After migration, nearly all notifications carry denormalized fields |
| Resolution success rate (fallback) | >90% | Legacy notifications with still-existing resources should resolve |
| Resolution latency (p50) | <100ms | Fast enough that the spinner never appears for most users |
| Resolution latency (p95) | <300ms | Spinner appears briefly; user does not consider cancelling |
| Navigation blocked rate (null source_id or unknown type) | <1% | System notifications are rare; all known source types are routed |
| Mark-read-on-navigate success rate | >98% | Mark-read is a simple PATCH with high reliability |
| Return-to-list rate (navigate then pop back) | >70% | Users should return to process remaining notifications |
| Triage loop adoption (≥3 consecutive Enter→q→j cycles) | >30% | Indicates the keyboard triage workflow is effective |
| Navigation latency — enriched (Enter to first paint) | <50ms | Synchronous push, no API call |
| Cancel rate (resolution) | <5% | Low cancel rate means resolution is fast and targets are valid |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Navigation initiated | `NotifNav: initiated [id={id}] [source_type={type}] [source_id={sid}] [enriched={bool}]` |
| `debug` | Resolution started (fallback) | `NotifNav: resolving [id={id}] [reason=missing enriched fields]` |
| `debug` | Resolution cancelled | `NotifNav: cancelled [id={id}] [method={cancel_method}] [elapsed={ms}ms]` |
| `debug` | Mark read fired | `NotifNav: mark read [id={id}] [was_unread={bool}]` |
| `debug` | Target resolved | `NotifNav: resolved [id={id}] → [screen={screenId}] [repo={owner}/{name}] [number={num}]` |
| `info` | Navigation pushed | `NotifNav: pushed [id={id}] [screen={screenId}] [duration={ms}ms] [enriched={bool}]` |
| `info` | Return from detail | `NotifNav: returned [id={id}] [screen={screenId}] [time_on_detail={ms}ms]` |
| `warn` | Navigation blocked (null source_id) | `NotifNav: blocked [id={id}] [reason=null_source_id]` |
| `warn` | Navigation blocked (unknown type) | `NotifNav: blocked [id={id}] [source_type={type}] [reason=unknown_source_type]` |
| `warn` | Mark read failed | `NotifNav: mark read failed [id={id}] [status={code}] [error={msg}]` |
| `warn` | Mark read 404 (deleted) | `NotifNav: mark read 404 [id={id}] — removed from list` |
| `warn` | Mark read 429 (rate limited) | `NotifNav: mark read rate limited [id={id}] [retry_after={s}]` |
| `warn` | Resolution 404 (source deleted) | `NotifNav: source not found [id={id}] [source_type={type}] [status=404]` |
| `warn` | Resolution 403 (access denied) | `NotifNav: access denied [id={id}] [source_type={type}] [status=403]` |
| `warn` | Resolution timeout (10s) | `NotifNav: timeout [id={id}] [source_type={type}] [elapsed=10000ms]` |
| `warn` | Resolution 429 (rate limited) | `NotifNav: rate limited [id={id}] [retry_after={s}s]` |
| `error` | Resolution network error | `NotifNav: network error [id={id}] [error={msg}]` |
| `error` | Auth error (401) | `NotifNav: auth error [id={id}] [status=401]` |
| `error` | Push failed (stack overflow) | `NotifNav: push failed [stack_depth={n}] [max=32]` |
| `error` | Resolution returned unknown screen | `NotifNav: unknown screen [id={id}] [screen={value}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Null `source_id` | Client-side null check | Status bar flash "Cannot navigate — source not found" (3s) | User acknowledges; notification may be system-generated |
| Unknown `source_type` | Exhaustive match misses | Status bar flash "Unknown notification type" (3s) | Future source types require feature update |
| Missing enriched fields (legacy) | Client-side check for `repo_owner`/`repo_name`/`resource_number` | Fallback to resolution endpoint | Automatic; transparent to user |
| Resolution 404 (source deleted) | `GET` response | Status bar flash "Source resource not found." (3s); stays on list | Notification is stale; user can mark read and move on |
| Resolution 403 (access revoked) | `GET` response | Status bar flash "You no longer have access…" (3s) | Access changed; navigation correctly blocked |
| Resolution timeout (10s) | Fetch timeout | Status bar "Navigation timed out. Press Enter to retry."; spinner removed | User retries or cancels |
| Resolution network error | Fetch rejects | Status bar "Network error. Press Enter to retry." | User retries when network restored |
| Mark-read 401 (auth expired) | `PATCH` response | Auth error screen pushed (overrides navigation) | Re-authenticate via CLI |
| Mark-read 404 (deleted) | `PATCH` response | Notification removed from list; navigation cancelled | Resource gone; cleanup correct |
| Mark-read 429 (rate limited) | `PATCH` response | Optimistic revert; navigation still proceeds | Notification stays unread; press `r` later |
| Mark-read network timeout (30s) | Fetch timeout | Optimistic revert; navigation still proceeds | Silent revert |
| Stack depth exceeded (32) | Stack length check | Status bar error "Navigation stack full" | Pop screens to free space |
| Terminal resize during resolution | `useOnResize` fires | Status bar re-renders at new width; resolution continues | Automatic |
| SSE disconnect during navigation | SSE independent of HTTP | Navigation proceeds normally | SSE reconnects with backoff independently |
| Target detail screen crashes | Error boundary | Error boundary shown; `q` pops back to notification list | Press `q` to return or `r` to restart |
| Double Enter (rapid press) | In-progress guard + push-to-same-screen guard | Second Enter is no-op | Automatic dedup |
| Resolution returns unknown screen ID | Screen ID not in known set | Treated as "Unknown notification type" error | Status bar flash; stays on list |
| Concurrent `Enter` on different row (j during resolve then Enter) | Previous resolution cancelled on `j` | New resolution starts for newly focused row | Clean cancel + restart |

### Failure Modes

- **Enriched navigation (primary path) is entirely client-side**: No API call for navigation, so no network failure mode. If the target resource is deleted, the target screen handles it.
- **Mark-read failure does not block navigation**: Navigation always proceeds. Mark-read is fire-and-forget with optimistic revert.
- **Resolution failure (fallback path) keeps user on the list**: All resolution errors are displayed as status bar flashes. The user's notification list state is never disrupted.
- **Auth expiry is the only error that forces a screen change**: A 401 on mark-read or resolution pushes the auth error screen, which takes priority.
- **Component crash**: Caught by the global error boundary. "Press r to restart" or "Press q to quit."
- **SSE permanently fails**: No impact on navigation — SSE and HTTP navigation are independent.

## Verification

### Test File: `e2e/tui/notifications.test.ts`

### Terminal Snapshot Tests (10 tests)

- SNAP-DETAILNAV-001: After Enter on issue notification (enriched) — Issue Detail screen rendered with correct breadcrumb `Dashboard > Notifications > owner/repo > Issue #N`
- SNAP-DETAILNAV-002: After Enter on landing notification (enriched) — Landing Detail screen rendered with correct breadcrumb `Dashboard > Notifications > owner/repo > Landing #N`
- SNAP-DETAILNAV-003: After Enter on workflow notification (enriched) — Workflow Run Detail screen rendered with correct breadcrumb `Dashboard > Notifications > owner/repo > Workflow Run #N`
- SNAP-DETAILNAV-004: After Enter on workspace notification — Workspace Detail screen rendered with correct breadcrumb `Dashboard > Notifications > Workspace: name`
- SNAP-DETAILNAV-005: Status bar flash for null source_id — "Cannot navigate — source not found" visible in status bar, notification list unchanged
- SNAP-DETAILNAV-006: Status bar flash for unknown source_type — "Unknown notification type" visible in status bar, notification list unchanged
- SNAP-DETAILNAV-007: Notification list after return from detail — previously-unread notification now shows as read (no ● dot, normal weight text)
- SNAP-DETAILNAV-008: Notification list after return from detail with Unread filter — navigated notification absent from list, focus on next item
- SNAP-DETAILNAV-009: Resolving state (legacy notification) — status bar shows "Resolving… (Esc to cancel)", row spinner visible in unread indicator column
- SNAP-DETAILNAV-010: Timeout state (legacy notification) — status bar shows "Navigation timed out. Press Enter to retry.", spinner removed from row

### Keyboard Interaction Tests (26 tests)

- KEY-DETAILNAV-001: Enter on `source_type: "issue"` notification (enriched) — pushes issue-detail screen immediately (no resolution API call)
- KEY-DETAILNAV-002: Enter on `source_type: "issue_comment"` notification (enriched) — pushes issue-detail screen (parent issue, not comment)
- KEY-DETAILNAV-003: Enter on `source_type: "landing_request"` notification (enriched) — pushes landing-detail screen
- KEY-DETAILNAV-004: Enter on `source_type: "lr_review"` notification (enriched) — pushes landing-detail screen
- KEY-DETAILNAV-005: Enter on `source_type: "lr_comment"` notification (enriched) — pushes landing-detail screen
- KEY-DETAILNAV-006: Enter on `source_type: "workflow_run"` notification (enriched) — pushes workflow-run-detail screen (uses source_id as runId, not resource_number)
- KEY-DETAILNAV-007: Enter on `source_type: "workspace"` notification — pushes workspace-detail screen (uses source_id as workspaceId, no enriched fields needed)
- KEY-DETAILNAV-008: Enter on notification with `source_id: null` — no navigation, status bar flash "Cannot navigate — source not found"
- KEY-DETAILNAV-009: Enter on notification with unknown `source_type` — no navigation, status bar flash "Unknown notification type"
- KEY-DETAILNAV-010: Enter on unread notification — marked as read optimistically (● dot disappears, text unbolds, unread count decrements)
- KEY-DETAILNAV-011: Enter on already-read notification — no mark-read API call, navigation proceeds normally
- KEY-DETAILNAV-012: Enter on legacy notification (missing enriched fields) — triggers resolution API call, shows "Resolving…", pushes target screen on success
- KEY-DETAILNAV-013: Esc during resolution — cancels resolution, user stays on notification list, status bar returns to normal
- KEY-DETAILNAV-014: j during resolution — cancels resolution, focus moves down one row
- KEY-DETAILNAV-015: k during resolution — cancels resolution, focus moves up one row
- KEY-DETAILNAV-016: q during resolution — cancels resolution and pops notification list screen
- KEY-DETAILNAV-017: Ctrl+C during resolution — TUI exits immediately
- KEY-DETAILNAV-018: Enter after resolution timeout — retries resolution for the same notification
- KEY-DETAILNAV-019: Double Enter on same notification — second Enter is no-op while resolving or while screen is being pushed
- KEY-DETAILNAV-020: Enter, then j, then Enter on different notification — first resolution cancelled, second notification navigates
- KEY-DETAILNAV-021: q on target detail screen — pops back to notification list with preserved state
- KEY-DETAILNAV-022: Return preserves scroll position, focused row, filter, and search query
- KEY-DETAILNAV-023: Enter during loading state — no-op
- KEY-DETAILNAV-024: Enter during error state — no-op
- KEY-DETAILNAV-025: Triage loop: Enter → q → j → Enter on next notification — completes successfully, each notification marked read
- KEY-DETAILNAV-026: Enter when search input is focused — does not trigger navigation (key passes to input)

### Responsive Tests (6 tests)

- RESP-DETAILNAV-001: Navigation at 80×24 — target detail screen renders in minimum mode, breadcrumb truncates from left
- RESP-DETAILNAV-002: Navigation at 120×40 — target detail screen renders in standard mode, full breadcrumb
- RESP-DETAILNAV-003: Navigation at 200×60 — target detail screen renders in large mode
- RESP-DETAILNAV-004: Resize from 120×40 to 80×24 while on target detail screen — detail screen re-renders correctly
- RESP-DETAILNAV-005: Resize during resolution (legacy) — status bar "Resolving…" re-renders at new width, resolution continues
- RESP-DETAILNAV-006: Return to notification list after resize on detail screen — list re-renders at new size with preserved state

### Integration Tests (20 tests)

- INT-DETAILNAV-001: Navigate to issue detail (enriched) — correct issue is loaded matching resource_number (not source_id)
- INT-DETAILNAV-002: Navigate to landing detail (enriched) — correct landing is loaded matching resource_number
- INT-DETAILNAV-003: Navigate to workflow run detail (enriched) — correct run is loaded matching source_id as runId
- INT-DETAILNAV-004: Navigate to workspace detail — correct workspace is loaded matching source_id as workspaceId
- INT-DETAILNAV-005: Navigate to issue detail (legacy, via resolution) — resolution API returns correct repo and number, issue loads
- INT-DETAILNAV-006: Navigate to landing detail (legacy, via resolution) — resolution API returns correct repo and number, landing loads
- INT-DETAILNAV-007: Mark-read API success — notification status updated server-side, optimistic update persists on return
- INT-DETAILNAV-008: Mark-read API failure (500) — optimistic update reverts, notification shows as unread on return
- INT-DETAILNAV-009: Mark-read API 404 (deleted notification) — notification removed from list, navigation cancelled
- INT-DETAILNAV-010: Mark-read API 429 (rate limited) — optimistic reverts, navigation still proceeds to target screen
- INT-DETAILNAV-011: Mark-read API 401 (auth expired) — auth error screen pushed instead of target detail screen
- INT-DETAILNAV-012: Resolution 404 (legacy, source deleted) — status bar flash, user stays on list
- INT-DETAILNAV-013: Resolution 403 (legacy, access revoked) — status bar flash, user stays on list
- INT-DETAILNAV-014: Resolution 429 (legacy, rate limited) — status bar shows retry-after seconds
- INT-DETAILNAV-015: Resolution timeout (legacy, 10s) — spinner at 200ms, timeout message at 10s, Enter retries
- INT-DETAILNAV-016: Navigate from notification, target resource returns 404 — target screen shows "Not found" error
- INT-DETAILNAV-017: Unread badge in header bar decrements on navigate-and-mark-read
- INT-DETAILNAV-018: Unread count in title row decrements on navigate-and-mark-read
- INT-DETAILNAV-019: SSE delivers new notification while on target detail screen — notification list updates correctly on return
- INT-DETAILNAV-020: Navigate from notification to issue, perform action on issue, pop back — notification list state preserved

### Edge Case Tests (12 tests)

- EDGE-DETAILNAV-001: Stack at depth 31 (one below max) — navigation push succeeds
- EDGE-DETAILNAV-002: Stack at depth 32 (at max) — navigation push blocked, status bar error "Navigation stack full"
- EDGE-DETAILNAV-003: `source_type: "issue_comment"` — source_id is parent issue's database ID (as stored by fanout's `onIssueCommented`), enriched `resource_number` is the issue number — resolves correctly
- EDGE-DETAILNAV-004: Rapid Enter → q → Enter on same notification — second navigation succeeds, no duplicate mark-read (already read)
- EDGE-DETAILNAV-005: Navigate from last notification in Unread-filtered list — on return, empty state "No unread notifications. Press f to show all." shown
- EDGE-DETAILNAV-006: Enter immediately after SSE notification arrival (during highlight animation) — navigates correctly
- EDGE-DETAILNAV-007: Navigate, resize terminal to below minimum (<80×24) while on detail, resize back, pop back — notification list recovers
- EDGE-DETAILNAV-008: Concurrent mark-read from another client between navigate and return — notification shows as read on return (server state wins)
- EDGE-DETAILNAV-009: Rapid Enter → Esc → Enter → Esc cycle (10× in 1 second) — no state corruption, clean cancel + restart each cycle
- EDGE-DETAILNAV-010: Resolution returns empty `repo_owner` or `repo_name` — treated as error ("Source not available."); stays on list
- EDGE-DETAILNAV-011: Notification with `resource_number` but null `repo_owner`/`repo_name` (partially enriched) — falls back to resolution
- EDGE-DETAILNAV-012: `source_id` differs from `resource_number` (common case for issues/landings) — navigation correctly uses `resource_number` for screen context, not `source_id`

All 74 tests left failing if backend is unimplemented — never skipped or commented out.
