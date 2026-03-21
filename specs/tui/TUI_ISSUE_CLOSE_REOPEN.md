# TUI_ISSUE_CLOSE_REOPEN

Specification for TUI_ISSUE_CLOSE_REOPEN.

## High-Level User POV

The close/reopen feature gives terminal developers a single-key action to toggle an issue between the "open" and "closed" states — the most common write operation in issue triage. The interaction is designed to feel instant and forgiving: the UI updates optimistically before the server confirms the change, and reverts smoothly if the server rejects it.

There are two surfaces where close/reopen is available:

**From the issue list screen**, the user focuses an issue row using `j`/`k` navigation, then presses `x`. The state icon on the focused row flips immediately — a green `●` turns red, or a red `●` turns green — and a brief confirmation message appears in the status bar: "Issue #42 closed" or "Issue #42 reopened". The total issue count in the title row updates accordingly. No confirmation dialog is shown; the action is instant because undo is implicit (press `x` again to reverse). If the server returns an error, the icon snaps back to its previous color within the same render frame, and the status bar shows a red error message ("Failed to close #42: Permission denied") for 3 seconds.

**From the issue detail screen**, the user presses `o` (for "open/close toggle"). The state badge next to the title changes from `[open]` in green to `[closed]` in red, or vice versa. A timeline event ("→ @you changed state open → closed — just now") appends to the comments section instantly as an optimistic entry. The status bar briefly confirms the action. On server error, the badge reverts, the optimistic timeline event is removed, and the error is shown in the status bar.

Both surfaces disable the toggle key while a mutation is in-flight to prevent double-fires from rapid keypresses. The key is re-enabled once the server response (or error) arrives. If the user presses `x` or `o` while a mutation is pending, the keypress is silently ignored — no queuing, no error message.

The feature respects permissions: users without write access to the repository can press the key, but the API will return 403 and the TUI will display a permission error. The keybinding hint for `x` (list) and `o` (detail) is always shown regardless of permission — the server is the source of truth, not the client.

At all terminal sizes (80×24 through 200×60+), the close/reopen action behaves identically. The state icon and badge are always visible regardless of breakpoint. The status bar confirmation adapts its text length to the available width (e.g., "#42 closed" at 80 columns vs. "Issue #42 closed successfully" at 120+ columns).

## Acceptance Criteria

### Definition of Done
- [ ] Pressing `x` on a focused issue row in the issue list screen sends `PATCH /api/repos/:owner/:repo/issues/:number` with `{ "state": "closed" }` (if currently open) or `{ "state": "open" }` (if currently closed)
- [ ] Pressing `o` on the issue detail screen sends the same PATCH request to toggle the current issue's state
- [ ] The state icon (issue list) or state badge (issue detail) updates optimistically before the API response arrives
- [ ] The total issue count in the issue list title row ("Issues (N)") updates optimistically: decremented on close (when filtered to "open"), incremented on reopen (when filtered to "open")
- [ ] On successful API response, the optimistic state is confirmed and no further visual change occurs
- [ ] On API error (403, 404, 422, 429, 500, network error), the optimistic state reverts to the previous value within one render frame
- [ ] On API error, a status bar notification appears in `error` color (ANSI 196) for 3 seconds with the error message
- [ ] The `x`/`o` key is disabled (no-op) while a close/reopen mutation is in-flight
- [ ] No confirmation dialog is shown before the action executes
- [ ] The action works on both open and closed issues (bidirectional toggle)
- [ ] On the issue detail screen, an optimistic timeline event is appended showing the state transition; it is removed on error
- [ ] On the issue detail screen, the `closed_at` timestamp appears next to the state badge after closing (set to "just now"); it is removed after reopening
- [ ] The feature works identically at all supported terminal sizes (80×24, 120×40, 200×60+)
- [ ] State icon/badge is always visible at every breakpoint — it is never truncated or hidden

### Keyboard Interactions
- [ ] `x` on focused issue row in issue list: toggle state (close if open, reopen if closed)
- [ ] `o` on issue detail view: toggle state (close if open, reopen if closed)
- [ ] Both keys are no-op when a mutation is already in-flight (no queuing)
- [ ] Both keys are no-op when no issue is focused (list) or no issue is loaded (detail)
- [ ] `R` retries the last failed close/reopen if the error state is active
- [ ] Rapid keypresses (`x` pressed twice quickly): second press is ignored due to in-flight guard

### Status Bar Feedback
- [ ] On success: `"Issue #N closed"` or `"Issue #N reopened"` in `success` color (ANSI 34) for 3 seconds
- [ ] On error: `"Failed to close #N: {reason}"` or `"Failed to reopen #N: {reason}"` in `error` color (ANSI 196) for 3 seconds
- [ ] On 403: reason is `"Permission denied"`
- [ ] On 404: reason is `"Issue not found"`
- [ ] On 429: reason is `"Rate limited. Retry in {Retry-After}s."`
- [ ] On network error: reason is `"Network error"`
- [ ] On 500: reason is `"Server error"`
- [ ] At 80 columns: message truncates to `"#N closed"` / `"#N error: Permission denied"`
- [ ] At 120+ columns: full message shown

### Optimistic UI Behavior
- [ ] State icon color change (list) renders in < 16ms from keypress
- [ ] State badge text change (detail) renders in < 16ms from keypress
- [ ] Revert on error renders in < 16ms from error receipt
- [ ] Issue list total count updates optimistically and reverts on error
- [ ] Issue list: if state filter is "Open" and user closes an issue, the row remains visible (does not disappear) but shows the closed state icon
- [ ] Issue list: if state filter is "Closed" and user reopens an issue, the row remains visible but shows the open state icon
- [ ] Issue detail: optimistic timeline event uses current user's login and "just now" timestamp
- [ ] Issue detail: on revert, the optimistic timeline event is removed without leaving gaps or visual artifacts

### Truncation & Boundary Constraints
- [ ] Issue numbers up to #99999 (6 characters) are supported in status bar messages
- [ ] Error reason strings are truncated at 40 characters with `…` in the status bar
- [ ] Status bar message total length capped at terminal width minus 20 characters (to leave room for other status bar elements)
- [ ] The `Retry-After` value for 429 responses is displayed in seconds (integer, no decimals)

### Edge Cases
- [ ] Terminal resize during in-flight mutation: mutation completes normally, status bar message re-renders at new width
- [ ] SSE disconnect during mutation: mutation uses HTTP (not SSE), so it is unaffected
- [ ] Rapid `x` presses (10+ times in < 1 second): only the first press triggers a mutation; all subsequent are ignored until completion
- [ ] Closing an already-closed issue (stale local state): server returns the issue as-is (idempotent); TUI state reconciles to match
- [ ] Reopening an already-open issue (stale local state): same idempotent behavior
- [ ] Network timeout (> 10 seconds): mutation times out, optimistic state reverts, error shown
- [ ] User navigates away (`q`) while mutation is in-flight: mutation completes in background, no error shown on new screen
- [ ] Issue list re-fetch after close/reopen: server data overwrites optimistic state (no flicker if states match)
- [ ] Unicode in issue title within status bar message: grapheme-cluster-safe truncation
- [ ] Null `closed_at` on a closed issue (unexpected server state): rendered as empty, no crash

## Design

### Issue List Screen — Close/Reopen Interaction

The `x` keybinding on the issue list operates on the currently focused row. The visual change is confined to the state icon column (2 characters wide) at the far left of the row.

```
Before (issue is open):
● #142  Fix login timeout on slow networks  [bug]  alice  💬 3  2h

After pressing x (optimistic, issue now closed):
● #142  Fix login timeout on slow networks  [bug]  alice  💬 3  2h
```

The `●` character changes from `success` color (ANSI 34 / green) to `error` color (ANSI 196 / red). No other row content changes. The reverse video highlight on the focused row is preserved.

**Status bar during mutation:**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Status: j/k:nav Enter:open f:state /:search c:new x:closing… q:back        │
└──────────────────────────────────────────────────────────────────────────────┘
```

The `x:close` hint changes to `x:closing…` while in-flight, reverting to `x:close` (or `x:reopen` based on new state) on completion.

**Status bar after successful close:**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Issue #142 closed          j/k:nav Enter:open f:state /:search c:new q:back │
└──────────────────────────────────────────────────────────────────────────────┘
```

The confirmation message fades (is removed) after 3 seconds.

### Issue Detail Screen — Close/Reopen Interaction

The `o` keybinding on the issue detail screen changes the state badge next to the title.

**Before (issue is open):**

```
Fix memory leak in SSE reconnection handler                          [open]
@alice · opened 2h ago · updated 30m ago · 5 comments
```

**After pressing `o` (optimistic, issue now closed):**

```
Fix memory leak in SSE reconnection handler                        [closed]
@alice · opened 2h ago · closed just now · 5 comments
```

The badge changes from `[open]` in `success` color (ANSI 34) to `[closed]` in `error` color (ANSI 196). The metadata row updates to show `closed just now`. An optimistic timeline event is appended:

```
→ @currentuser changed state open → closed — just now
```

**Status bar hints update:**

```
Before: j/k:scroll n/p:comment c:comment e:edit o:close q:back
After:  j/k:scroll n/p:comment c:comment e:edit o:reopen q:back
```

### Components Used

- `<box>` — Row containers for issue list rows and detail header
- `<text>` — State icon (`●`), state badge (`[open]`/`[closed]`), status bar messages, timeline events
- `<scrollbox>` — Issue list (parent component) and detail view content area (parent component)

No additional components are introduced. Close/reopen modifies existing elements rendered by `TUI_ISSUE_LIST_SCREEN` and `TUI_ISSUE_DETAIL_VIEW`.

### Keybindings

| Key | Screen | Action | Condition |
|-----|--------|--------|-----------||
| `x` | Issue list | Toggle close/reopen on focused issue | Issue focused, no mutation in-flight |
| `o` | Issue detail | Toggle close/reopen on current issue | Issue loaded, no mutation in-flight |
| `R` | Both (after error) | Retry failed close/reopen | Error state active for close/reopen |

### Responsive Behavior

| Terminal Size | State Icon/Badge | Status Bar Message |
|--------------|-----------------|-------------------|
| 80×24 | `●` (2ch) / `[open]`/`[closed]` (8ch) | `"#N closed"` / `"#N reopened"` (truncated) |
| 120×40 | Same | `"Issue #N closed"` / `"Issue #N reopened"` |
| 200×60+ | Same | `"Issue #N closed successfully"` / `"Issue #N reopened successfully"` |

Resize during mutation: layout recalculates synchronously, status bar message adapts to new width, mutation continues unaffected.

### Data Hooks

| Hook | Source | Usage |
|------|--------|-------|
| `useIssues()` | `@codeplane/ui-core` | Provides issue list data; `.items[n].state` updated optimistically on `x` |
| `useIssue(owner, repo, number)` | `@codeplane/ui-core` | Provides single issue data; `.issue.state` updated optimistically on `o` |
| `useUpdateIssue(owner, repo, number)` | `@codeplane/ui-core` | `mutate({ state: "closed" \| "open" })` — fires the PATCH request |
| `useTerminalDimensions()` | `@opentui/react` | Current terminal width for status bar message length |
| `useKeyboard()` | `@opentui/react` | Registers `x` and `o` handlers with in-flight guard |
| `useStatusBarHints()` | local TUI | Updates hint text (`x:close`/`x:reopen`, `o:close`/`o:reopen`, `x:closing…`) |
| `useRepoContext()` | local TUI | Provides `owner` and `repo` for API calls |

### API Endpoint

```
PATCH /api/repos/:owner/:repo/issues/:number
Content-Type: application/json
Authorization: token <token>

{ "state": "closed" }   // or "open"
```

Response: `200 OK` with full `IssueResponse` body.

### Navigation

Close/reopen does not push or pop any screen. The user remains on the current screen after the action completes.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| Close issue | ❌ | ❌ | ✅ | ✅ |
| Reopen issue | ❌ | ❌ | ✅ | ✅ |

- Close/reopen requires **write access** to the repository. This is enforced server-side via the `PATCH /api/repos/:owner/:repo/issues/:number` endpoint.
- The TUI does **not** hide the `x`/`o` keybinding from read-only users. The keybinding hint is always visible. If a read-only user presses the key, the optimistic update fires, the server returns 403, the state reverts, and "Permission denied" appears in the status bar.
- This "optimistic-then-revert" pattern is intentional: it avoids a preflight permission check (which would add latency) and uses the server as the single source of truth for authorization.
- Repository owners, organization members with write role, team members with write permission, and explicitly added collaborators have write access.

### Token-Based Auth

- The auth token is injected by the `<APIClientProvider>` at the application root. The close/reopen feature does not handle tokens directly.
- A 401 response during close/reopen propagates to the global auth error handler: "Session expired. Run `codeplane auth login` to re-authenticate." The optimistic state reverts before the auth error screen is shown.
- The token is never included in log messages, status bar text, or telemetry events.

### Rate Limiting

- `PATCH /api/repos/:owner/:repo/issues/:number` is rate-limited at **60 requests per minute** per authenticated user.
- The in-flight guard (key disabled during mutation) provides natural rate limiting for individual users — at most 1 request in-flight at a time.
- A 429 response triggers optimistic revert and a status bar message: "Rate limited. Retry in {Retry-After}s." The `Retry-After` header value is parsed and displayed.
- The TUI does not auto-retry 429s. The user must wait and press `x`/`o` again (or `R` to retry).

### Input Sanitization

- The only user-controlled input is the state value, which is derived from the current issue state (a fixed enum: `"open"` → `"closed"`, `"closed"` → `"open"`). No free-form text is sent.
- Issue numbers are integers derived from the data model. No injection vector exists.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.issue.close` | User presses `x` (list) or `o` (detail) to close an open issue | `owner`, `repo`, `issue_number`, `surface` ("list" | "detail"), `position_in_list` (list only), `success` (boolean), `duration_ms`, `was_optimistic_revert` (boolean), `error_type` (if failed) |
| `tui.issue.reopen` | User presses `x` (list) or `o` (detail) to reopen a closed issue | `owner`, `repo`, `issue_number`, `surface` ("list" | "detail"), `position_in_list` (list only), `success` (boolean), `duration_ms`, `was_optimistic_revert` (boolean), `error_type` (if failed) |
| `tui.issue.close_reopen.error` | API returns an error for close/reopen | `owner`, `repo`, `issue_number`, `surface`, `http_status`, `error_type` ("permission_denied" | "not_found" | "rate_limited" | "server_error" | "network_error" | "timeout"), `attempted_state` |
| `tui.issue.close_reopen.retry` | User presses `R` to retry a failed close/reopen | `owner`, `repo`, `issue_number`, `surface`, `original_error_type`, `retry_success` (boolean) |
| `tui.issue.close_reopen.ignored` | User presses `x`/`o` while mutation is in-flight | `owner`, `repo`, `issue_number`, `surface` |

### Common Properties (all events)

- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `layout`: `"compact"` | `"standard"` | `"expanded"`
- `state_filter`: Current issue list state filter (list surface only)

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Close/reopen success rate | > 95% | At least 95% of close/reopen attempts succeed without optimistic revert |
| Permission error rate | < 5% | Less than 5% of attempts result in 403 |
| Optimistic revert rate | < 5% | Less than 5% of attempts require an optimistic revert (any error type) |
| Mean mutation round-trip | < 500ms | Average time from keypress to server confirmation |
| Double-press ignore rate | < 10% | Less than 10% of close/reopen actions are followed by an ignored duplicate keypress |
| Close-to-reopen ratio | 3:1 to 5:1 | Healthy ratio indicates issues are being triaged (more closes than reopens) |
| List vs. detail surface split | 60/40 to 70/30 | Most close/reopen happens from the list (batch triage); a meaningful portion from detail (after reading) |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Close/reopen initiated | `IssueCloseReopen: initiated [owner={o}] [repo={r}] [number={n}] [from_state={s}] [to_state={s}] [surface={list|detail}]` |
| `debug` | Optimistic state applied | `IssueCloseReopen: optimistic applied [number={n}] [new_state={s}]` |
| `info` | Close/reopen succeeded | `IssueCloseReopen: success [number={n}] [state={s}] [duration={ms}ms]` |
| `warn` | Close/reopen failed (client-recoverable) | `IssueCloseReopen: failed [number={n}] [http_status={code}] [error={msg}] [duration={ms}ms]` |
| `warn` | Optimistic revert | `IssueCloseReopen: reverted [number={n}] [restored_state={s}] [reason={msg}]` |
| `debug` | Keypress ignored (in-flight) | `IssueCloseReopen: ignored [number={n}] [reason=in_flight]` |
| `error` | Unexpected error (non-HTTP) | `IssueCloseReopen: unexpected error [number={n}] [error={msg}] [stack={trace}]` |
| `debug` | Retry initiated | `IssueCloseReopen: retry [number={n}] [original_error={type}]` |
| `info` | Status bar message shown | `IssueCloseReopen: status [number={n}] [message={text}] [color={success|error}]` |

### Error Cases Specific to TUI

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during in-flight mutation | Mutation continues; status bar message re-renders at new width after completion | Automatic |
| SSE disconnect during mutation | No impact (close/reopen uses HTTP, not SSE) | N/A |
| Network timeout (> 10s) | Optimistic state reverts; status bar shows "Network error" | User presses `R` or `x`/`o` again |
| User quits TUI (`Ctrl+C`) during mutation | Mutation may or may not reach the server; no guarantee of completion | User checks state via CLI or web UI |
| User pops screen (`q`) during mutation | Mutation completes in background; result is discarded (no status bar on new screen) | State is correct on next visit |
| Auth token expires during mutation | 401 propagates to auth error screen after optimistic revert | User runs `codeplane auth login` |
| Server returns unexpected state value | TUI renders whatever the server returns; no validation on response state | N/A (server is source of truth) |
| Concurrent modification (another user changed state) | Server returns current state; TUI reconciles to match server response | Automatic |
| API returns 422 (validation error) | Optimistic revert; status bar shows "Invalid state transition" | User retries or refreshes |

### Failure Modes and Recovery

1. **Optimistic revert cycle**: If the server consistently fails (e.g., 500), the user sees a toggle-then-revert on each press. After 3 consecutive failures, the status bar message adds "Check server status." to hint at a systemic issue.
2. **Stale cache reconciliation**: When the issue list re-fetches (e.g., on filter change or pagination), server data overwrites any optimistic state. If the mutation succeeded, the states will match (no flicker). If the mutation failed and the user hasn't pressed `x` again, the server state takes precedence.
3. **Memory**: Each in-flight mutation stores the previous state (1 enum value per issue). No memory accumulation occurs.

## Verification

### E2E Tests (`e2e/tui/issues.test.ts`)

Tests use `@microsoft/tui-test` for terminal snapshot matching, keyboard interaction simulation, and text assertions. Tests run against a real API server with test fixtures. Tests that fail due to unimplemented backends are left failing — never skipped.

#### Snapshot Tests

| Test ID | Description | Terminal Size |
|---------|-------------|---------------|
| `SNAP-CLOSE-001` | Issue list with open issue focused, before close action | 120×40 |
| `SNAP-CLOSE-002` | Issue list after pressing `x` on open issue — state icon changed to red | 120×40 |
| `SNAP-CLOSE-003` | Issue list after pressing `x` on closed issue — state icon changed to green | 120×40 |
| `SNAP-CLOSE-004` | Issue list status bar showing success message after close | 120×40 |
| `SNAP-CLOSE-005` | Issue list status bar showing error message after failed close (403) | 120×40 |
| `SNAP-CLOSE-006` | Issue detail with open issue, before close action | 120×40 |
| `SNAP-CLOSE-007` | Issue detail after pressing `o` — badge changed to `[closed]`, timeline event appended | 120×40 |
| `SNAP-CLOSE-008` | Issue detail after pressing `o` on closed issue — badge changed to `[open]`, timeline event appended | 120×40 |
| `SNAP-CLOSE-009` | Issue detail status bar showing `o:reopen` hint after close action | 120×40 |
| `SNAP-CLOSE-010` | Issue list at 80×24 with successful close — truncated status bar message | 80×24 |
| `SNAP-CLOSE-011` | Issue list at 200×60 with successful close — extended status bar message | 200×60 |
| `SNAP-CLOSE-012` | Issue detail at 80×24 after close — compact layout with state badge visible | 80×24 |

#### Keyboard Interaction Tests

| Test ID | Description | Key Sequence | Expected State |
|---------|-------------|-------------|----------------|
| `KEY-CLOSE-001` | Close open issue from list | Focus open issue → `x` | State icon turns red, API receives `{ "state": "closed" }` |
| `KEY-CLOSE-002` | Reopen closed issue from list | Focus closed issue → `x` | State icon turns green, API receives `{ "state": "open" }` |
| `KEY-CLOSE-003` | Close open issue from detail | Navigate to open issue detail → `o` | Badge changes to `[closed]`, timeline event appears |
| `KEY-CLOSE-004` | Reopen closed issue from detail | Navigate to closed issue detail → `o` | Badge changes to `[open]`, timeline event appears |
| `KEY-CLOSE-005` | Rapid double-press on list | Focus issue → `x` `x` (< 100ms apart) | Only one API call made, second keypress ignored |
| `KEY-CLOSE-006` | Rapid double-press on detail | Navigate to detail → `o` `o` (< 100ms apart) | Only one API call made, second keypress ignored |
| `KEY-CLOSE-007` | Close then navigate away | Focus issue → `x` → `q` (immediately) | Screen pops, mutation completes in background |
| `KEY-CLOSE-008` | Close issue then change filter | Focus open issue → `x` → `f` | Row remains visible during filter transition |
| `KEY-CLOSE-009` | Press `x` with no issue focused (empty list) | Navigate to empty issue list → `x` | No API call, no-op |
| `KEY-CLOSE-010` | Press `o` while issue is loading on detail | Navigate to detail (loading state) → `o` | No API call, no-op |
| `KEY-CLOSE-011` | `R` to retry after failed close | Focus issue → `x` (server returns 500) → wait → `R` | Retry fires same PATCH request |
| `KEY-CLOSE-012` | Close and verify total count update | Issue list shows "Issues (10)" → focus open issue → `x` | Title updates to "Issues (9)" if filtered to "open" |
| `KEY-CLOSE-013` | Reopen and verify total count update | Switch to "Closed" filter → focus closed issue → `x` | Count decrements by 1 |
| `KEY-CLOSE-014` | Close/reopen preserves focus position | Focus 5th issue → `x` | After action, 5th row still focused |
| `KEY-CLOSE-015` | `x` on issue list, `o` on issue detail use same endpoint | Close from list, navigate to detail → verify badge shows `[closed]` | Consistent state across screens |

#### Error Handling Tests

| Test ID | Description | Setup | Expected |
|---------|-------------|-------|----------|
| `ERR-CLOSE-001` | 403 Permission denied on close | Authenticate as read-only user → `x` | Optimistic revert, status bar shows "Permission denied" in red |
| `ERR-CLOSE-002` | 404 Issue not found on close | Issue deleted by another user → `x` | Optimistic revert, status bar shows "Issue not found" in red |
| `ERR-CLOSE-003` | 429 Rate limited on close | Exhaust rate limit → `x` | Optimistic revert, status bar shows "Rate limited. Retry in Ns." |
| `ERR-CLOSE-004` | 500 Server error on close | Server returns 500 → `x` | Optimistic revert, status bar shows "Server error" in red |
| `ERR-CLOSE-005` | Network timeout on close | Simulate network delay > 10s → `x` | Optimistic revert, status bar shows "Network error" |
| `ERR-CLOSE-006` | 401 Auth expired on close | Expire token → `x` | Optimistic revert, auth error screen shown |
| `ERR-CLOSE-007` | 403 Permission denied on reopen from detail | Read-only user → `o` on detail | Badge reverts, status bar error |
| `ERR-CLOSE-008` | Error message auto-dismisses after 3 seconds | `x` on 403 → wait 3s | Status bar error message disappears, normal hints restored |

#### Responsive Tests

| Test ID | Description | Terminal Size | Expected |
|---------|-------------|---------------|----------|
| `RESP-CLOSE-001` | Close action at minimum terminal size | 80×24 | State icon toggles, truncated status message |
| `RESP-CLOSE-002` | Close action at standard terminal size | 120×40 | State icon toggles, full status message |
| `RESP-CLOSE-003` | Close action at large terminal size | 200×60 | State icon toggles, extended status message |
| `RESP-CLOSE-004` | Resize during in-flight mutation | Start at 120×40 → `x` → resize to 80×24 before response | Status bar message renders at new width |
| `RESP-CLOSE-005` | State icon visible at all sizes after close | Close issue → check at 80×24, 120×40, 200×60 | Red `●` (list) or `[closed]` badge (detail) visible at every size |

#### Integration Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `INT-CLOSE-001` | Close issue and verify server state | Press `x` → GET issue → state is "closed" |
| `INT-CLOSE-002` | Reopen issue and verify server state | Press `x` on closed issue → GET → state is "open" |
| `INT-CLOSE-003` | Close from list, verify on detail | Press `x` on list → Enter to open detail → badge shows `[closed]` |
| `INT-CLOSE-004` | Close from detail, verify on list | Press `o` on detail → `q` to return to list → state icon is red |
| `INT-CLOSE-005` | Close/reopen round-trip | Press `x` → wait → `x` again → verify state returns to original |
| `INT-CLOSE-006` | Optimistic revert does not corrupt list data | Trigger 403 → verify all other issues in list are unchanged |
| `INT-CLOSE-007` | Close issue while filtered to "All" | Filter to "All" → `x` → total count unchanged |
| `INT-CLOSE-008` | Close issue while filtered to "Open" | Filter to "Open" → `x` → total count decrements by 1 |
| `INT-CLOSE-009` | Reopen issue while filtered to "Closed" | Filter to "Closed" → `x` → total count decrements by 1 |
| `INT-CLOSE-010` | Concurrent close from list and detail | Open detail → close → go back → verify list reflects closed state |
