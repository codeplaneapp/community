# TUI_DIFF_WHITESPACE_TOGGLE

Specification for TUI_DIFF_WHITESPACE_TOGGLE.

## High-Level User POV

The whitespace toggle is a single-key affordance within the Codeplane TUI diff viewer that lets a developer instantly hide or reveal whitespace-only changes across the entire diff. It exists because real-world diffs frequently mix meaningful code changes with cosmetic whitespace adjustments — reformatting, trailing whitespace removal, tab-to-space conversions — and a reviewer needs the ability to strip that noise away to focus on substantive logic changes, then flip it back to verify formatting when they're ready.

When the developer is viewing any diff (a change diff or a landing request diff), pressing `w` toggles whitespace visibility. The toggle is binary: whitespace is either visible or hidden. On the first press, the diff re-fetches from the API with the `ignore_whitespace=true` query parameter, which instructs the server to compute the diff without whitespace-only changes. The status bar indicator at the bottom right of the screen updates from `[ws: visible]` to `[ws: hidden]` immediately on keypress, before the re-fetch completes. While the re-fetch is in flight, an inline loading indicator — `Updating diff…` — appears at the top of the main content area. This is deliberately not a full-screen spinner; the file tree sidebar and status bar remain visible and interactive during the transition, preserving spatial context.

When the re-fetched diff arrives, the content area re-renders with the filtered diff. Files that contained only whitespace changes disappear from the diff entirely. If every file in the diff was whitespace-only, the content area shows a centered message in muted text: "No visible changes (whitespace hidden). Press w to show whitespace." This message directs the developer to the recovery action rather than leaving them staring at an empty screen.

Pressing `w` again reverses the toggle. The status bar updates to `[ws: visible]`, the API is called again without the `ignore_whitespace` parameter, and the full diff including whitespace changes is restored. The toggle is designed to be cheap to invoke — the developer should feel comfortable flipping it multiple times during a review session. To prevent the developer from hammering the API with rapid toggles, the re-fetch is debounced at 300ms. If the developer presses `w` twice within 300ms, only the final state triggers an API call.

The whitespace toggle state persists for the lifetime of the diff screen session. Navigating between files with `]`/`[` or clicking entries in the file tree does not reset the toggle. The same `ignore_whitespace` parameter applies across all files. If the developer toggles view mode (unified to split or vice versa) with `t`, the whitespace state is preserved — the diff is not re-fetched on view toggle because the same data applies to both rendering modes.

The `w` keybinding is active from any focus zone (file tree or main content) and from any scroll position. It does not require the developer to be focused on a specific line or hunk. The key works identically in both unified and split view modes. It is disabled (no-op) only when the diff screen is in an error state, a full-screen loading state, or when the comment creation form overlay is open.

At minimum terminal size (80×24), the status bar abbreviates the indicator to `ws:vis` or `ws:hid` to conserve horizontal space. At standard size (120×40) and above, the full `[ws: visible]` / `[ws: hidden]` labels are displayed. The indicator uses the `muted` color token (ANSI 245) by default; when whitespace is hidden (the non-default state), the `[ws: hidden]` label renders in `warning` color (ANSI 178, yellow) to draw the developer's attention to the fact that the diff is filtered and they are not seeing the complete picture.

## Acceptance Criteria

### Core toggle behavior
- [ ] Pressing `w` toggles `whitespaceVisible` state from `true` to `false` (and vice versa)
- [ ] The toggle is binary: only two states exist (`visible` and `hidden`)
- [ ] Default state on diff screen mount is `whitespaceVisible: true`
- [ ] The `w` keybinding is active in both focus zones: file tree and main content
- [ ] The `w` keybinding works in both unified and split view modes
- [ ] The `w` keybinding works at any scroll position within the diff
- [ ] The `w` keybinding is a no-op when the diff screen is in loading state (initial full-screen load)
- [ ] The `w` keybinding is a no-op when the diff screen is in error state
- [ ] The `w` keybinding is a no-op when the comment creation form overlay is open
- [ ] No modifier keys are required: plain `w` without Ctrl, Shift, or Meta

### API re-fetch behavior
- [ ] When whitespace is toggled to hidden, the diff is re-fetched with `ignore_whitespace=true` query parameter
- [ ] For change diffs: `GET /api/repos/:owner/:repo/changes/:change_id/diff?ignore_whitespace=true`
- [ ] For landing diffs: `GET /api/repos/:owner/:repo/landings/:number/diff?ignore_whitespace=true`
- [ ] When whitespace is toggled back to visible, the diff is re-fetched without the `ignore_whitespace` parameter
- [ ] The re-fetch is debounced at 300ms — rapid `w` presses within the window result in a single API call for the final state
- [ ] If a re-fetch is already in flight when `w` is pressed again, the in-flight request is cancelled (or its result is discarded) and a new request is issued for the updated state
- [ ] The API client passes the auth token in the `Authorization: Bearer <token>` header on all re-fetch requests
- [ ] Cache key for the diff includes the `ignore_whitespace` parameter, so toggling between states serves from cache within the 30-second TTL window

### Status bar indicator
- [ ] The status bar shows `[ws: visible]` when whitespace is visible (default)
- [ ] The status bar shows `[ws: hidden]` when whitespace is hidden
- [ ] The indicator updates immediately on keypress, before the API re-fetch completes
- [ ] At terminal widths < 120 columns, the indicator abbreviates to `ws:vis` or `ws:hid`
- [ ] At terminal widths ≥ 120 columns, the full `[ws: visible]` / `[ws: hidden]` label is displayed
- [ ] The `[ws: visible]` indicator uses `muted` color (ANSI 245)
- [ ] The `[ws: hidden]` indicator uses `warning` color (ANSI 178, yellow) to signal filtered state
- [ ] The indicator position is at the right side of the status bar, between the file position and the help hint

### Inline loading state
- [ ] During re-fetch after `w` press, an inline "Updating diff…" message appears at the top of the main content area
- [ ] The inline loading indicator does NOT replace the full screen (no full-screen spinner)
- [ ] The file tree sidebar remains visible and interactive during the re-fetch
- [ ] The status bar remains visible and accurate during the re-fetch
- [ ] The scroll position is preserved during the re-fetch — content below the loading indicator does not shift
- [ ] Once the re-fetched diff arrives, the loading indicator disappears and the new diff content replaces the old
- [ ] If the re-fetch fails, the previous diff content is restored and an error message is shown in the status bar

### Whitespace-only diff handling
- [ ] Files that contain only whitespace changes are excluded from the rendered diff when `whitespaceVisible` is `false`
- [ ] Files that contain only whitespace changes are excluded from the file tree sidebar when `whitespaceVisible` is `false`
- [ ] The file count in the file tree header updates to reflect the filtered count: `Files (N)` shows only the non-whitespace files
- [ ] The "File N of M" status bar indicator reflects the filtered file count
- [ ] If all files in the diff are whitespace-only and whitespace is hidden, the content area shows: "No visible changes (whitespace hidden). Press w to show whitespace."
- [ ] The "No visible changes" message is centered in the content area and rendered in `muted` color (ANSI 245)
- [ ] The "Press w to show whitespace." portion of the message is rendered in `primary` color (ANSI 33, blue) to draw attention to the recovery action

### State persistence
- [ ] Whitespace toggle state persists across file navigation within the same diff screen session (`]`/`[` do not reset it)
- [ ] Whitespace toggle state persists across file tree selection (`Enter` in file tree does not reset it)
- [ ] Whitespace toggle state persists when toggling sidebar visibility (`Ctrl+B`)
- [ ] Whitespace toggle state persists when toggling view mode (`t` does not trigger re-fetch if whitespace state is unchanged)
- [ ] Whitespace toggle state persists across hunk expand/collapse operations (`z`/`x`/`Z`/`X`)
- [ ] Whitespace toggle state does NOT persist when popping the diff screen (`q`) and re-entering — a new session starts with `whitespaceVisible: true`

### Boundary constraints
- [ ] Maximum re-fetch debounce accumulation: 300ms. After 300ms of no `w` presses, the fetch fires
- [ ] Re-fetch timeout: 30 seconds. If the re-fetch does not complete in 30s, show "Diff loading timed out. Press `R` to retry."
- [ ] Cache entries: the `ignore_whitespace=true` and `ignore_whitespace=false` variants are cached independently with a 30-second TTL each
- [ ] The toggle does not re-render the file tree or main content more than once per state change (no double renders)
- [ ] The `w` key event is consumed and does not propagate to other handlers (e.g., does not trigger text input in any field)

### Edge cases
- [ ] Terminal resize during whitespace re-fetch: layout recalculates; re-fetch continues; result renders at new size
- [ ] Rapid `w` presses (5+ within 1 second): debounce ensures at most 2 API calls (one at 300ms, one at 600ms if state flipped again)
- [ ] `w` pressed during inline "Updating diff…" state: toggles state, cancels previous debounce, starts new debounce
- [ ] Network error during re-fetch: previous diff content remains visible; status bar shows "Failed to update diff. Press R to retry."
- [ ] 401 during re-fetch: auth error screen replaces diff screen
- [ ] 429 during re-fetch: status bar shows "Rate limited. Retry in Ns." with countdown; previous diff content preserved
- [ ] `w` pressed when diff screen is showing "No visible changes" message: toggles back to visible, re-fetches, renders full diff
- [ ] `w` pressed on a diff with 0 files (empty diff): no-op; status bar indicator still toggles cosmetically but no re-fetch occurs
- [ ] Terminal does not support 256 colors: `[ws: hidden]` indicator still rendered using available color; functionality unchanged
- [ ] `w` pressed simultaneously with `]` or `[`: both operations process sequentially; whitespace toggle + file navigation both apply

## Design

### Status bar layout — whitespace indicator position

The whitespace indicator is rendered as part of the global status bar at the bottom of the diff screen. Its position is:

```
┌─────────────────────────────────────────────────────────────────────┐
│ t:view  w:ws  ]/[:files  x/z:hunks │ File 1/4 │ [ws: visible] │ ? │
└─────────────────────────────────────────────────────────────────────┘
```

After toggle:

```
┌─────────────────────────────────────────────────────────────────────┐
│ t:view  w:ws  ]/[:files  x/z:hunks │ File 1/4 │ [ws: hidden]  │ ? │
└─────────────────────────────────────────────────────────────────────┘
```

At 80×24:

```
┌──────────────────────────────────────────────────────────────────┐
│ t:view w:ws ]/[:files │ File 1/4 │ ws:hid │ ?                    │
└──────────────────────────────────────────────────────────────────┘
```

### Inline loading indicator during re-fetch

```
┌───────────────┬─────────────────────────────────────────────────────┐
│ File Tree     │  Updating diff…                                     │
│               │                                                     │
│ M app.ts +5-2 │  (previous diff content remains dimmed/visible      │
│ A utils.ts +12│   below the loading indicator)                      │
│               │                                                     │
└───────────────┴─────────────────────────────────────────────────────┘
```

### "No visible changes" empty state

```
┌───────────────┬─────────────────────────────────────────────────────┐
│ File Tree     │                                                     │
│               │                                                     │
│ (empty)       │   No visible changes (whitespace hidden).           │
│               │   Press w to show whitespace.                       │
│               │                                                     │
└───────────────┴─────────────────────────────────────────────────────┘
```

### Component structure

```tsx
{/* Whitespace indicator in status bar */}
<box flexDirection="row" height={1}>
  {/* Left: keybinding hints */}
  <text color="muted">t:view  w:ws  ]/[:files  x/z:hunks</text>

  {/* Center: file position */}
  <text color="muted">File {focusedFileIndex + 1} of {fileCount}</text>

  {/* Right: whitespace indicator */}
  <text color={whitespaceVisible ? "muted" : "warning"}>
    {terminalWidth >= 120
      ? (whitespaceVisible ? "[ws: visible]" : "[ws: hidden]")
      : (whitespaceVisible ? "ws:vis" : "ws:hid")
    }
  </text>

  {/* Far right: help hint */}
  <text color="muted">?</text>
</box>

{/* Inline loading indicator during re-fetch */}
{isRefetching && (
  <box width="100%" justifyContent="center" paddingY={0}>
    <text color="muted">Updating diff…</text>
  </box>
)}

{/* Empty state when all changes are whitespace-only */}
{!whitespaceVisible && filteredFiles.length === 0 && (
  <box
    flexGrow={1}
    justifyContent="center"
    alignItems="center"
    flexDirection="column"
  >
    <text color="muted">No visible changes (whitespace hidden).</text>
    <text color="primary">Press w to show whitespace.</text>
  </box>
)}
```

### Keybinding reference

| Key | Context | Action | Modifier | Notes |
|-----|---------|--------|----------|-------|
| `w` | Any focus zone (tree or content) | Toggle whitespace visibility | None | Debounced 300ms for API re-fetch |
| `w` | Loading state (initial) | No-op | None | Key is consumed but ignored |
| `w` | Error state | No-op | None | Key is consumed but ignored |
| `w` | Comment form overlay open | No-op | None | Key types into form body instead |

### Keybinding registration

```tsx
useKeyboard((key) => {
  if (key.name === "w" && !key.ctrl && !key.meta && !key.shift) {
    if (screenState === "loaded" && !commentFormOpen) {
      setWhitespaceVisible(prev => !prev)
      // Debounced re-fetch triggered via useEffect
    }
  }
})
```

### Responsive behavior

| Terminal size | Indicator label | Indicator color (hidden) | Indicator color (visible) |
|---------------|-----------------|-------------------------|---------------------------|
| 80×24 – 119×39 | `ws:vis` / `ws:hid` | ANSI 178 (yellow) | ANSI 245 (gray) |
| 120×40 – 199×59 | `[ws: visible]` / `[ws: hidden]` | ANSI 178 (yellow) | ANSI 245 (gray) |
| 200×60+ | `[ws: visible]` / `[ws: hidden]` | ANSI 178 (yellow) | ANSI 245 (gray) |

On terminal resize:
- The status bar indicator label may change length (abbreviated vs. full) — recalculates synchronously
- If the terminal shrinks during a whitespace re-fetch, the inline loading indicator re-layouts within new dimensions
- The whitespace toggle state is never affected by resize

### Data hooks consumed

| Hook | Source | Purpose in whitespace toggle |
|------|--------|------------------------------|
| `useChangeDiff(owner, repo, change_id, opts?)` | `@codeplane/ui-core` | Re-fetch with `{ ignore_whitespace: true }` option |
| `useLandingDiff(owner, repo, number, opts?)` | `@codeplane/ui-core` | Re-fetch with `{ ignore_whitespace: true }` option |
| `useKeyboard(handler)` | `@opentui/react` | Register `w` keybinding |
| `useTerminalDimensions()` | `@opentui/react` | Determine status bar label length (abbreviated vs. full) |
| `useOnResize(callback)` | `@opentui/react` | Re-layout status bar on terminal resize |

The `opts` parameter to `useChangeDiff` and `useLandingDiff` includes the `ignore_whitespace` boolean. The hook constructs the appropriate query string: `?ignore_whitespace=true` when the option is set, omitted entirely when not set.

### State management

```
whitespaceVisible: boolean
  - Default: true
  - Set by: `w` keypress
  - Consumed by: status bar indicator, API fetch opts, empty state check
  - Scope: diff screen session (reset on screen unmount)

isRefetching: boolean
  - Default: false
  - Set by: API re-fetch initiated from whitespace toggle
  - Consumed by: inline loading indicator
  - Reset: when re-fetch completes (success or error)
```

## Permissions & Security

### Authorization

| Action | Required role | Behavior when unauthorized |
|--------|--------------|----------------------------|
| Toggle whitespace and re-fetch diff | Repository read access | 404 "Repository not found" (same as initial diff load) |
| Toggle whitespace on private repo diff | Repository member or collaborator | 404 "Repository not found" |

The whitespace toggle does not require any additional permissions beyond the read access needed to view the diff initially. If the user could see the diff, they can toggle whitespace. There is no separate permission for the `ignore_whitespace` parameter.

### Token-based authentication
- The re-fetch request triggered by the whitespace toggle uses the same auth token as the initial diff load
- 401 on the re-fetch shows: "Session expired. Run `codeplane auth login` to re-authenticate."
- The TUI does not attempt to re-authenticate; the user must run `codeplane auth login` in another terminal session

### Rate limiting
- Whitespace toggle re-fetches are subject to the standard API rate limit (5,000 requests per hour per authenticated user)
- The 300ms debounce on the re-fetch prevents the user from consuming rate limit budget through rapid toggling
- If the whitespace re-fetch receives a 429 response: the previous diff content is preserved, and the status bar shows "Rate limited. Retry in Ns." with a countdown
- After the rate limit cooldown, the user can press `R` to retry or press `w` again to re-trigger

### Input sanitization
- The `ignore_whitespace` query parameter is a boolean value (`true`), not user-supplied free text
- No user input is interpolated into the request beyond the parameter name/value
- The `w` key event is consumed by the handler and does not propagate

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.diff.whitespace_toggled` | Developer presses `w` and state changes | `visible` (boolean — the new state), `file_count` (total files before filtering), `filtered_file_count` (files remaining after whitespace exclusion when hidden), `source` (`"change"` | `"landing"`), `repo` (owner/repo string), `view_mode` (`"unified"` | `"split"`), `session_toggle_count` (number of times toggled in this session so far) |
| `tui.diff.whitespace_refetch_completed` | Re-fetch completes after toggle | `visible` (boolean), `duration_ms` (re-fetch latency), `file_count_delta` (change in visible file count), `cache_hit` (boolean — whether the result was served from cache) |
| `tui.diff.whitespace_refetch_failed` | Re-fetch errors after toggle | `visible` (boolean), `error_type` (`"network"` | `"timeout"` | `"auth"` | `"rate_limit"` | `"server"`), `status_code` (HTTP status if available) |
| `tui.diff.whitespace_empty_state` | All files filtered out by whitespace toggle | `total_file_count` (files in the unfiltered diff), `repo`, `source` |

### Common properties (attached to all events above)

| Property | Description |
|----------|-------------|
| `session_id` | Unique TUI session identifier |
| `terminal_width` | Current terminal column count |
| `terminal_height` | Current terminal row count |
| `timestamp` | ISO 8601 event timestamp |
| `user_id` | Authenticated user identifier |

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Whitespace toggle adoption | > 10% of diff sessions | Percentage of diff screen sessions where the user toggles whitespace at least once |
| Re-fetch latency (P50) | < 400ms | Median time from `w` press to new diff rendered |
| Re-fetch latency (P95) | < 1.5s | 95th percentile re-fetch latency |
| Empty state encounter rate | < 5% of toggles | Percentage of whitespace-hide toggles that result in "No visible changes" |
| Error rate on re-fetch | < 0.5% | Percentage of whitespace re-fetches that fail |
| Repeat toggle rate | > 30% of sessions using toggle | Percentage of sessions where the user toggles back (indicating they use the feature bidirectionally) |
| Toggle-to-file-navigation correlation | > 60% | Percentage of sessions that also use `]`/`[` after toggling, indicating the feature aids focused review |

## Observability

### Logging requirements

| Level | Event | Format | When |
|-------|-------|--------|------|
| `info` | `diff.whitespace.toggled` | `{visible: boolean, file_count: number, source: string}` | Developer presses `w` and state changes |
| `info` | `diff.whitespace.refetch.started` | `{visible: boolean, cache_key: string}` | API re-fetch initiated (after debounce) |
| `info` | `diff.whitespace.refetch.completed` | `{visible: boolean, duration_ms: number, file_count: number, cache_hit: boolean}` | API re-fetch completes successfully |
| `warn` | `diff.whitespace.refetch.slow` | `{visible: boolean, duration_ms: number}` | Re-fetch takes > 3 seconds |
| `warn` | `diff.whitespace.rate_limited` | `{retry_after_s: number}` | Re-fetch returns 429 |
| `error` | `diff.whitespace.refetch.failed` | `{visible: boolean, status_code: number, error_message: string}` | API re-fetch fails |
| `error` | `diff.whitespace.refetch.timeout` | `{visible: boolean, timeout_ms: 30000}` | Re-fetch exceeds 30-second timeout |
| `debug` | `diff.whitespace.debounce.cancelled` | `{previous_state: boolean, new_state: boolean}` | Rapid toggle cancelled a pending debounce |
| `debug` | `diff.whitespace.cache.hit` | `{cache_key: string, age_ms: number}` | Re-fetch served from cache |
| `debug` | `diff.whitespace.cache.miss` | `{cache_key: string}` | Cache miss, fetching from API |
| `debug` | `diff.whitespace.noop` | `{reason: string}` | `w` pressed but ignored (loading, error, comment form) |

### TUI-specific error cases

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during whitespace re-fetch | Layout recalculates synchronously; re-fetch continues; "Updating diff…" indicator re-layouts at new width | Automatic |
| SSE disconnect during whitespace re-fetch | Not applicable (whitespace toggle uses HTTP GET, not SSE) | N/A |
| Network loss during re-fetch | Previous diff content preserved; status bar shows "Failed to update diff. Press R to retry." | Press `R` to retry; or press `w` to toggle back and retry |
| API timeout (>30s) during re-fetch | Previous diff content preserved; error message "Diff loading timed out. Press R to retry." replaces inline loading indicator | Press `R` to retry |
| 401 during re-fetch | Auth error screen replaces diff screen entirely | Run `codeplane auth login` in another terminal, then reopen diff |
| 429 during re-fetch | Previous diff content preserved; status bar shows countdown "Rate limited. Retry in Ns." | Wait for cooldown; press `R` or `w` again |
| 500 during re-fetch | Previous diff content preserved; status bar shows "Server error. Press R to retry." | Press `R` to retry |
| Rapid `w` presses cause debounce queue buildup | Debounce collapses all intermediate presses; at most one API call per 300ms window | Automatic via debounce |
| `w` pressed during "Updating diff…" already showing | Previous debounce cancelled; new debounce started for updated state; in-flight request result discarded | Automatic |
| Re-fetch returns different file set than expected (API inconsistency) | Render whatever the API returns; file tree and file position reset to first file if the previous focused file no longer exists | Automatic with file position reset |

### Failure modes and degradation

| Failure | Impact | Degradation |
|---------|--------|-------------|
| Re-fetch fails silently (network error with no status code) | Cannot show filtered diff | Previous diff preserved; error in status bar; toggle state reverts to previous value |
| Cached whitespace-hidden diff expires during file navigation | Next navigation may trigger unexpected re-fetch | Re-fetch triggers transparently; inline loading indicator shown |
| Terminal does not support ANSI 178 (yellow) | `[ws: hidden]` indicator loses visual emphasis | Falls back to available warning color; text content still readable |
| API does not support `ignore_whitespace` parameter | Server ignores the parameter; diff returned is identical | User sees same diff; no error; feature appears non-functional until backend implements |
| Very large diff (10MB+) with whitespace toggle | Re-fetch and re-render may be slow | "Updating diff…" indicator persists; `diff.whitespace.refetch.slow` warning logged |

## Verification

Test file: `e2e/tui/diff.test.ts`

Tests for TUI_DIFF_WHITESPACE_TOGGLE are organized within the diff test file alongside other diff feature tests. Test IDs use the existing diff test ID scheme with whitespace-specific identifiers.

### Snapshot tests — visual states (10 tests)

| Test ID | Test name | Terminal size | Description |
|---------|-----------|--------------|-------------|
| SNAP-WS-001 | `renders whitespace visible indicator in status bar at 120x40` | 120×40 | Status bar shows `[ws: visible]` in muted color (ANSI 245) at the correct position |
| SNAP-WS-002 | `renders whitespace hidden indicator in status bar at 120x40` | 120×40 | After pressing `w`, status bar shows `[ws: hidden]` in warning color (ANSI 178) |
| SNAP-WS-003 | `renders abbreviated whitespace indicator at 80x24` | 80×24 | Status bar shows `ws:vis` in muted color at minimum terminal size |
| SNAP-WS-004 | `renders abbreviated whitespace hidden indicator at 80x24` | 80×24 | After pressing `w`, status bar shows `ws:hid` in warning color at minimum terminal size |
| SNAP-WS-005 | `renders whitespace indicator at 200x60` | 200×60 | Status bar shows `[ws: visible]` with full layout at large terminal size |
| SNAP-WS-006 | `renders inline updating indicator during re-fetch` | 120×40 | "Updating diff…" appears at the top of the main content area while re-fetch is in flight |
| SNAP-WS-007 | `renders no visible changes empty state` | 120×40 | After toggling whitespace on a whitespace-only diff: centered "No visible changes (whitespace hidden). Press w to show whitespace." message |
| SNAP-WS-008 | `renders no visible changes empty state at 80x24` | 80×24 | Same empty state message at minimum size; message wraps correctly within 80 columns |
| SNAP-WS-009 | `renders filtered file tree with whitespace hidden` | 120×40 | File tree shows only non-whitespace files; file count header reflects filtered count |
| SNAP-WS-010 | `renders diff with whitespace changes excluded` | 120×40 | Main content area shows diff without whitespace-only hunks/files after toggle |

### Keyboard interaction tests (17 tests)

| Test ID | Test name | Key sequence | Expected state change |
|---------|-----------|-------------|----------------------|
| KEY-WS-001 | `w toggles whitespace to hidden` | `w` | `whitespaceVisible` becomes `false`; status bar shows `[ws: hidden]` in yellow; re-fetch initiated with `ignore_whitespace=true` |
| KEY-WS-002 | `w toggles whitespace back to visible` | `w`, wait 500ms, `w` | `whitespaceVisible` becomes `true`; status bar shows `[ws: visible]` in gray; re-fetch initiated without `ignore_whitespace` |
| KEY-WS-003 | `w is no-op during initial loading` | (during load) `w` | No state change; no re-fetch; status bar unchanged |
| KEY-WS-004 | `w is no-op during error state` | (on error) `w` | No state change; no re-fetch; status bar unchanged |
| KEY-WS-005 | `w is no-op when comment form is open` | `c`, `w` | `w` types into comment form body instead of toggling whitespace |
| KEY-WS-006 | `w works from file tree focus zone` | `Tab` (to tree), `w` | Whitespace toggles from file tree focus; re-fetch initiated |
| KEY-WS-007 | `w works from main content focus zone` | `w` (default focus on content) | Whitespace toggles from content focus; re-fetch initiated |
| KEY-WS-008 | `w works in split view mode` | `t` (to split at 120+), `w` | Whitespace toggles in split view; re-fetch initiated; view mode preserved as split |
| KEY-WS-009 | `rapid w presses debounced` | `w`, `w`, `w` (within 300ms) | Only one API call made (for final state: `whitespaceVisible: false`); status bar reflects final state |
| KEY-WS-010 | `w during Updating diff indicator` | `w`, (wait 100ms, before fetch completes), `w` | First fetch cancelled/discarded; new fetch for `whitespaceVisible: true`; status bar shows `[ws: visible]` |
| KEY-WS-011 | `w then file navigation preserves whitespace state` | `w`, `]` | Whitespace hidden; navigates to next file; whitespace remains hidden; same filtered diff |
| KEY-WS-012 | `w then view toggle preserves whitespace state` | `w`, wait 500ms, `t` | Whitespace hidden; view toggled to split; no additional re-fetch; whitespace remains hidden |
| KEY-WS-013 | `w on empty diff is no-op` | (on 0-file diff) `w` | Status bar indicator toggles cosmetically; no re-fetch since file count is 0 |
| KEY-WS-014 | `w on whitespace-only diff shows empty state` | (on all-whitespace diff) `w` | Content area shows "No visible changes" message; file tree is empty |
| KEY-WS-015 | `w on empty state restores full diff` | (on empty state) `w` | Content area re-fetches without `ignore_whitespace`; full diff including whitespace changes renders; file tree repopulates |
| KEY-WS-016 | `Shift+W does not trigger toggle` | `W` (Shift+w) | No state change; `w` handler requires `!key.shift` |
| KEY-WS-017 | `Ctrl+W does not trigger toggle` | `Ctrl+W` | No state change; `w` handler requires `!key.ctrl` |

### Responsive behavior tests (8 tests)

| Test ID | Test name | Terminal size / transition | Expected behavior |
|---------|-----------|--------------------------|-------------------|
| RSP-WS-001 | `status bar indicator abbreviates at 80x24` | 80×24 | `ws:vis` or `ws:hid` label used |
| RSP-WS-002 | `status bar indicator full at 120x40` | 120×40 | `[ws: visible]` or `[ws: hidden]` label used |
| RSP-WS-003 | `status bar indicator full at 200x60` | 200×60 | `[ws: visible]` or `[ws: hidden]` label used |
| RSP-WS-004 | `resize from 120 to 80 abbreviates indicator` | 120→80 | Indicator changes from `[ws: hidden]` to `ws:hid` on resize |
| RSP-WS-005 | `resize from 80 to 120 expands indicator` | 80→120 | Indicator changes from `ws:hid` to `[ws: hidden]` on resize |
| RSP-WS-006 | `resize during whitespace re-fetch` | 120→80 during "Updating diff…" | Layout recalculates; loading indicator re-layouts; re-fetch continues |
| RSP-WS-007 | `whitespace state preserved across resize` | 120→80→120 | `whitespaceVisible` remains unchanged through resize sequence |
| RSP-WS-008 | `empty state message at 80x24` | 80×24 | "No visible changes" message fits within 80 columns without overflow |

### Data loading and integration tests (10 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| INT-WS-001 | `whitespace toggle re-fetches change diff with ignore_whitespace` | Pressing `w` on change diff triggers `GET /api/repos/:owner/:repo/changes/:change_id/diff?ignore_whitespace=true` |
| INT-WS-002 | `whitespace toggle re-fetches landing diff with ignore_whitespace` | Pressing `w` on landing diff triggers `GET /api/repos/:owner/:repo/landings/:number/diff?ignore_whitespace=true` |
| INT-WS-003 | `whitespace toggle back re-fetches without ignore_whitespace` | Pressing `w` twice re-fetches without `ignore_whitespace` parameter |
| INT-WS-004 | `whitespace toggle serves from cache within TTL` | Toggle to hidden, toggle to visible, toggle to hidden within 30s — second hidden fetch is a cache hit |
| INT-WS-005 | `whitespace toggle re-fetches after cache expires` | Toggle to hidden, wait > 30s, toggle to visible and back to hidden — cache miss, new API call |
| INT-WS-006 | `401 during whitespace re-fetch shows auth error` | API returns 401 on re-fetch; diff screen replaced by auth error state |
| INT-WS-007 | `404 during whitespace re-fetch shows error` | API returns 404 on re-fetch; previous diff preserved; error in status bar |
| INT-WS-008 | `429 during whitespace re-fetch shows rate limit` | API returns 429 on re-fetch; previous diff preserved; countdown in status bar |
| INT-WS-009 | `network error during whitespace re-fetch preserves previous diff` | Network failure on re-fetch; previous diff content stays visible; error in status bar |
| INT-WS-010 | `re-fetch timeout after 30 seconds` | Simulated slow response > 30s; timeout error shown; previous diff preserved |

### Edge case tests (10 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| EDGE-WS-001 | `whitespace-only diff shows empty state when hidden` | Diff where every file is whitespace-only; pressing `w` shows "No visible changes" message |
| EDGE-WS-002 | `recovering from empty state restores all files` | After seeing empty state, pressing `w` re-fetches and shows all whitespace-only files |
| EDGE-WS-003 | `mixed whitespace and code changes filter correctly` | Diff with 5 files: 2 whitespace-only, 3 with code changes; pressing `w` shows only 3 files |
| EDGE-WS-004 | `file tree count updates on whitespace toggle` | File tree header shows "Files (5)" → toggle → "Files (3)" → toggle back → "Files (5)" |
| EDGE-WS-005 | `file position resets when focused file is whitespace-only` | Focused on file 3 (whitespace-only); press `w` (hidden); focus moves to file 1 of filtered set |
| EDGE-WS-006 | `status bar file count reflects filtered count` | "File 1 of 5" → toggle → "File 1 of 3" → toggle back → "File 1 of 5" |
| EDGE-WS-007 | `hunk collapse state resets on whitespace toggle` | Collapse hunk with `z`; press `w`; after re-fetch, all hunks expanded (fresh diff data) |
| EDGE-WS-008 | `scroll position resets to top on whitespace toggle` | Scrolled to line 200; press `w`; after re-fetch, scroll position resets to top of first file |
| EDGE-WS-009 | `debounce correctly handles odd number of rapid toggles` | Press `w` 3 times in 200ms; final state is `hidden`; one API call with `ignore_whitespace=true` |
| EDGE-WS-010 | `debounce correctly handles even number of rapid toggles` | Press `w` 4 times in 200ms; final state is `visible`; one API call without `ignore_whitespace` (or no call if net effect is no-op) |
