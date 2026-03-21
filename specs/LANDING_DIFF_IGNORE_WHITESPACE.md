# LANDING_DIFF_IGNORE_WHITESPACE

Specification for LANDING_DIFF_IGNORE_WHITESPACE.

## High-Level User POV

When reviewing a landing request in Codeplane, developers frequently encounter diffs cluttered with whitespace-only changes — re-indentation from refactoring, trailing space cleanup, tab-to-space conversions, or blank line adjustments. These cosmetic changes obscure the meaningful code modifications that actually need review attention.

The **Landing Diff Ignore Whitespace** feature gives reviewers a single toggle to hide all whitespace-only changes from the combined landing request diff. When activated, the diff is re-rendered to show only lines where non-whitespace content has actually changed. This applies across the entire stack of changes in the landing request, making it dramatically easier to focus on substantive code modifications during review.

The toggle is available everywhere landing request diffs are viewed: the web UI's Diff tab, the TUI's diff screen, and the CLI. The preference persists naturally within a session — switching between files, toggling between unified and split view modes, or collapsing and expanding hunks all preserve the current whitespace visibility state. A clear visual indicator always tells the reviewer whether whitespace changes are currently visible or hidden, and a dedicated empty state message explains when hiding whitespace has filtered out all visible changes for a file.

This feature is especially valuable for landing requests that contain large-scale formatting changes alongside logic changes, or for stacked change sets where automated tooling or editor-on-save rules have introduced incidental whitespace modifications across many files.

## Acceptance Criteria

### Definition of Done

- [ ] The landing request diff endpoint accepts an `ignore_whitespace` query parameter and returns a diff with whitespace-only changes excluded when set to `true`.
- [ ] The web UI Diff tab on the landing detail page displays a whitespace toggle control that re-fetches and re-renders the diff when toggled.
- [ ] The TUI landing detail Diff tab supports pressing `w` to toggle whitespace visibility with an inline loading indicator and status bar feedback.
- [ ] The CLI `land view` command supports a `--ignore-whitespace` flag when displaying diff output.
- [ ] All clients display a clear indicator of the current whitespace visibility state.
- [ ] An appropriate empty state is shown when hiding whitespace removes all visible changes.

### Functional Constraints

- [ ] Whitespace visibility is a binary state: visible (default) or hidden. There is no third mode.
- [ ] The default state on every new diff view is whitespace **visible** (i.e., `ignore_whitespace=false`).
- [ ] Toggling whitespace triggers a new API request with the updated `ignore_whitespace` parameter; the client does not perform client-side diff filtering.
- [ ] The toggle applies to the **entire combined diff** across all changes in the landing request stack, not per-file or per-change.
- [ ] Whitespace state persists when navigating between files within the same diff view (via `]`/`[` keys in TUI, or clicking files in the web file tree).
- [ ] Whitespace state persists when toggling between unified and split view modes. Toggling view mode does not re-fetch the diff if the whitespace state has not changed.
- [ ] Whitespace state persists when toggling the file tree sidebar.
- [ ] Whitespace state persists when collapsing or expanding hunks.
- [ ] Whitespace state does **not** persist across screen close/reopen — it resets to the default (visible) each time the diff view is mounted.
- [ ] The `ignore_whitespace` query parameter accepts `true` or `1` as truthy values; all other values (including empty string, `false`, `0`, absent) are treated as falsy.
- [ ] When whitespace is hidden and a file's diff becomes empty (all changes were whitespace-only), the file still appears in the file tree but its diff area shows: "No visible changes (whitespace hidden). Press w to show whitespace." (TUI) or equivalent web copy.
- [ ] When whitespace is hidden and the **entire** landing request diff becomes empty, a global empty state is shown: "No visible changes (whitespace hidden)." with a prompt to toggle whitespace back on.
- [ ] Rapid toggling (e.g., pressing `w` multiple times quickly) is debounced at 300ms to prevent excessive API calls.
- [ ] The response shape (`LandingDiffResponse`) is identical regardless of the `ignore_whitespace` value; only the content of `file_diffs` arrays within each change differs.
- [ ] The feature works identically for landing requests in any state (open, closed, landed, draft).
- [ ] Inline comment anchors remain functional and correctly positioned when whitespace is hidden; line numbers in the diff correspond to actual file line numbers, not filtered-diff line numbers.

### Edge Cases

- [ ] Landing request with zero changes: diff endpoint returns the standard empty response regardless of `ignore_whitespace` value.
- [ ] Landing request where every change in the stack is whitespace-only: when `ignore_whitespace=true`, all changes return empty `file_diffs`.
- [ ] Landing request with binary files: binary file diffs are unaffected by the whitespace toggle (binary diffs do not have whitespace semantics).
- [ ] Landing request with conflict markers: conflict markers are not treated as whitespace and remain visible when whitespace is hidden.
- [ ] Very large diffs (100+ files, 10,000+ lines): the toggle must work without timeout; the server should return within the existing rate limit budget.
- [ ] Concurrent viewers toggling whitespace on the same landing request: each viewer's toggle is independent and stateless on the server.
- [ ] Mixed line endings (CRLF/LF): line-ending differences are treated as whitespace changes and hidden when `ignore_whitespace=true`.

## Design

### API Shape

**Endpoint:**
```
GET /api/repos/:owner/:repo/landings/:number/diff?ignore_whitespace=true
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ignore_whitespace` | `string` | `""` (falsy) | When `"true"` or `"1"`, whitespace-only changes are excluded from the diff output. |

**Response:** `200 OK`
```json
{
  "landing_number": 42,
  "changes": [
    {
      "change_id": "abc123",
      "file_diffs": [
        {
          "old_name": "src/main.ts",
          "new_name": "src/main.ts",
          "hunks": [...]
        }
      ]
    }
  ]
}
```

The response schema is identical whether `ignore_whitespace` is true or false. When true, `file_diffs` arrays may contain fewer hunks or fewer lines per hunk, and some `file_diffs` entries may be omitted entirely if all their changes were whitespace-only. Changes whose file_diffs are all eliminated still appear in the `changes` array with an empty `file_diffs: []`.

**Error Responses:**

| Status | Condition |
|--------|-----------||
| `404` | Landing request not found, or repository not found |
| `401` | Unauthenticated request |
| `403` | User lacks read access to the repository |
| `429` | Rate limit exceeded (60 req/min for this endpoint) |

### SDK Shape

```typescript
getLandingDiff(
  viewer: User | null,
  owner: string,
  repo: string,
  number: number,
  opts: LandingDiffOptions,
): Promise<Result<LandingDiffResponse, APIError>>
```

Where:

```typescript
interface LandingDiffOptions {
  ignore_whitespace: boolean;
}

interface LandingDiffResponse {
  landing_number: number;
  changes: FileDiff[];
}

interface FileDiff {
  change_id: string;
  file_diffs: unknown[];
}
```

The `ignore_whitespace` option is passed through to the repo-host/jj subprocess layer, which performs the actual whitespace filtering during diff generation.

### Web UI Design

**Location:** Landing Detail page → Diff tab

**Toggle Control:**
- Positioned in the diff toolbar alongside the Unified/Split view mode toggle.
- Rendered as a labeled toggle button or checkbox: **"Whitespace"** with states **Show** / **Hide**.
- The currently active state is visually distinct (e.g., the "Hide" state uses a warning/muted color to indicate filtered content).

**Behavior:**
- Clicking the toggle immediately shows an inline loading indicator (spinner or subtle animation near the toggle) while the re-fetch occurs.
- The diff content area updates in place when the new response arrives.
- The file tree sidebar updates file-level indicators: files where all changes were whitespace-only show a muted/empty state.
- If the user toggles rapidly, only the final state's request is honored (debounce at 300ms).
- Scroll position is preserved as closely as possible after re-render; the diff scrolls to the nearest surviving hunk if the previously-scrolled-to content was removed.

**Empty States:**
- Per-file: "No visible changes (whitespace hidden)." with a link/button to show whitespace.
- Global (all files empty): "No visible changes in this landing request when whitespace is hidden." with a button to restore whitespace visibility.

**Integration with Other Controls:**
- Toggling between Unified and Split view modes preserves the whitespace state and does not trigger a re-fetch.
- Collapsing/expanding hunks preserves the whitespace state.
- The file tree `+`/`-`/`~` indicators reflect the filtered diff, not the raw diff.
- Inline comment anchors attach to the correct source line numbers regardless of whitespace filter state.

### CLI Command

**Usage:**
```
codeplane land view <number> --diff --ignore-whitespace
codeplane land view <number> --diff -w
```

**Flags:**

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--ignore-whitespace` | `-w` | boolean | `false` | Hide whitespace-only changes in the diff output |

**Output:**
- Standard terminal diff rendering with syntax coloring.
- When whitespace is hidden, a header note is printed: `(whitespace changes hidden)`.
- Files with no remaining visible changes after filtering are listed with a note: `(whitespace only)`.

### TUI UI

**Location:** Landing Detail screen → Diff tab

**Keybinding:** `w` (no modifiers) toggles whitespace visibility.

**Status Bar Indicator:**
- At ≥100 columns: `[ws: visible]` in muted color or `[ws: hidden]` in yellow/warning color.
- At 80×24 (minimum): `ws:vis` or `ws:hid`.

**Loading Indicator:**
- Inline text "Updating diff…" replaces the diff content briefly during re-fetch.
- Not a full-screen loader — the tab header, file tree, and status bar remain visible.

**State Transitions:**
- Mount: `whitespaceVisible = true`
- Press `w`: debounce 300ms → set loading → `GET .../diff?ignore_whitespace=true` → render
- Press `w` again: debounce 300ms → set loading → `GET .../diff` (no param) → render
- Navigate files (`]`/`[`): whitespace state preserved, no re-fetch.
- Toggle view mode (`t`): whitespace state preserved, no re-fetch if whitespace unchanged.
- Close screen: state discarded.

**Caching:**
- Each `(landing_number, ignore_whitespace)` combination has an independent cache entry.
- Cache TTL: 30 seconds.
- Cache is invalidated on explicit refresh (`r` key).

**Empty States:**
- Per-file: "No visible changes (whitespace hidden). Press w to show whitespace."
- Global: "No visible changes (whitespace hidden). Press w to show whitespace."

**Performance Targets:**
- Re-fetch P50 < 400ms, P95 < 1.5s.
- If re-fetch exceeds 30 seconds, show a timeout message and revert to the previous state.

### Documentation

1. **Landing Request Review Guide** — Add a section titled "Filtering Whitespace Changes" explaining how to toggle whitespace visibility in the Diff tab, what it does, and when it's useful. Include screenshots of the toggle in both states.
2. **CLI Reference: `land view`** — Document the `--ignore-whitespace` / `-w` flag with an example command and example output.
3. **TUI Keyboard Reference** — Ensure the `w` key is listed under Diff tab shortcuts with the description "Toggle whitespace visibility".
4. **Web UI Keyboard Shortcuts** — If the web UI supports keyboard shortcuts for diff controls, document the whitespace toggle shortcut.

## Permissions & Security

### Authorization

| Role | Can View Diff | Can Toggle Whitespace |
|------|--------------|----------------------|
| Repository Owner | ✅ | ✅ |
| Repository Admin | ✅ | ✅ |
| Repository Member (Write) | ✅ | ✅ |
| Repository Member (Read) | ✅ | ✅ |
| Anonymous (public repo) | ✅ | ✅ |
| Anonymous (private repo) | ❌ | ❌ |

The whitespace toggle is a read-only view preference. It does not modify any server-side state. Any user who can view the landing request diff can toggle whitespace visibility. There is no separate permission for the whitespace toggle — it inherits the landing request read permission.

### Rate Limiting

- The landing diff endpoint (`GET .../landings/:number/diff`) is rate-limited at **60 requests per minute** per authenticated user.
- This limit is more restrictive than general landing endpoints because diff computation is server-intensive.
- The 300ms client-side debounce is a complementary defense but is not a substitute for server-side rate limiting.
- Anonymous requests to public repositories share a per-IP rate limit at the same threshold.

### Data Privacy

- No PII exposure risk: diffs contain repository code content, not user personal data beyond what is already visible in the repository.
- The `ignore_whitespace` parameter is a stateless query parameter — no user preference data is stored server-side.
- Audit logs do not need to capture whitespace toggle events as they are purely cosmetic view adjustments.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `landing_diff.whitespace_toggled` | User toggles the whitespace visibility control | `repo_id`, `landing_number`, `new_state` (`visible` \| `hidden`), `client` (`web` \| `tui` \| `cli`), `stack_size` (number of changes in the landing request), `file_count` (number of files in the diff), `timestamp` |
| `landing_diff.viewed` | User views the landing diff tab (existing event, augmented) | `repo_id`, `landing_number`, `ignore_whitespace` (boolean), `view_mode` (`unified` \| `split`), `client`, `timestamp` |
| `landing_diff.whitespace_empty_state_shown` | The entire diff becomes empty due to whitespace filtering | `repo_id`, `landing_number`, `client`, `file_count_before_filter`, `timestamp` |

### Funnel Metrics

| Metric | What It Tells Us |
|--------|------------------|
| **Toggle adoption rate** | % of landing diff views where the whitespace toggle is used at least once → indicates feature discovery and utility |
| **Toggle-to-review conversion** | % of sessions where whitespace toggle is used that result in a review being submitted → indicates the toggle helps reviewers reach a decision |
| **Hidden-whitespace diff view duration** | Average time spent viewing the diff in "hidden" state vs "visible" state → indicates whether users find the filtered view useful enough to stay in it |
| **Empty state encounter rate** | % of whitespace toggle activations that result in a fully empty diff → if high, may indicate users are toggling on entirely cosmetic landing requests |
| **Rapid toggle rate** | % of toggle events that are debounced (user toggled again within 300ms) → monitors UX friction |

### Success Indicators

- **Within 30 days of launch:** ≥15% of landing diff views include at least one whitespace toggle activation.
- **Within 60 days:** The toggle-to-review conversion rate is equal to or higher than the baseline review rate for landing requests.
- **Ongoing:** The empty state encounter rate remains below 5% (if higher, investigate whether landing request creation workflows are producing whitespace-only stacks).

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | When |
|-----------|-------|-------------------|------|
| Landing diff requested | `INFO` | `repo_owner`, `repo_name`, `landing_number`, `ignore_whitespace`, `user_id`, `request_id` | Every diff endpoint call |
| Landing diff generated | `INFO` | `repo_owner`, `repo_name`, `landing_number`, `ignore_whitespace`, `change_count`, `file_count`, `duration_ms`, `request_id` | After successful diff generation |
| Landing diff generation failed | `ERROR` | `repo_owner`, `repo_name`, `landing_number`, `ignore_whitespace`, `error_type`, `error_message`, `request_id` | On any diff generation error |
| Landing diff timeout | `WARN` | `repo_owner`, `repo_name`, `landing_number`, `ignore_whitespace`, `timeout_ms`, `request_id` | When diff generation exceeds timeout threshold |
| Landing diff rate limited | `WARN` | `user_id`, `request_count`, `window_seconds`, `request_id` | When a user hits the rate limit |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_diff_requests_total` | Counter | `owner`, `repo`, `ignore_whitespace`, `status_code` | Total landing diff requests |
| `codeplane_landing_diff_duration_seconds` | Histogram | `owner`, `repo`, `ignore_whitespace` | Diff generation latency (buckets: 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30) |
| `codeplane_landing_diff_file_count` | Histogram | `ignore_whitespace` | Number of files in the diff response (buckets: 1, 5, 10, 25, 50, 100, 250) |
| `codeplane_landing_diff_empty_responses_total` | Counter | `ignore_whitespace` | Count of diff responses with zero file diffs (helps detect whitespace-only filtering edge) |
| `codeplane_landing_diff_errors_total` | Counter | `error_type` | Diff generation errors by type (timeout, jj_error, repo_not_found, auth_error) |
| `codeplane_landing_diff_rate_limited_total` | Counter | — | Total rate-limited diff requests |

### Alerts

#### Alert: `LandingDiffHighLatency`
- **Condition:** P95 of `codeplane_landing_diff_duration_seconds` > 5s for 5 minutes.
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_landing_diff_duration_seconds` histogram to identify if latency is across all repos or specific ones.
  2. Check if the affected repositories have unusually large diffs (100+ files). Query `codeplane_landing_diff_file_count` for anomalies.
  3. Inspect jj subprocess performance — run `jj diff` manually on the affected repo to isolate whether latency is in jj or in Codeplane's diff processing.
  4. Check system resource utilization (CPU, memory, disk I/O) on the server.
  5. If a specific large repository is the cause, consider whether diff size limits or pagination should be applied.
  6. If systemic, check for jj version regressions or filesystem performance degradation.

#### Alert: `LandingDiffHighErrorRate`
- **Condition:** `rate(codeplane_landing_diff_errors_total[5m]) / rate(codeplane_landing_diff_requests_total[5m]) > 0.05` for 5 minutes.
- **Severity:** Critical
- **Runbook:**
  1. Check `codeplane_landing_diff_errors_total` by `error_type` to identify the dominant error class.
  2. If `jj_error`: check jj subprocess logs, verify jj binary is accessible, check repo integrity.
  3. If `timeout`: follow the LandingDiffHighLatency runbook.
  4. If `repo_not_found`: check whether a repository migration or deletion is in progress.
  5. If `auth_error`: check auth middleware logs for session/token validation failures.
  6. Check recent deployments for regressions in the landing or diff service layers.

#### Alert: `LandingDiffRateLimitSpike`
- **Condition:** `rate(codeplane_landing_diff_rate_limited_total[5m]) > 10`.
- **Severity:** Warning
- **Runbook:**
  1. Identify the user(s) hitting the rate limit via structured logs (`user_id`).
  2. Determine if this is a legitimate user rapidly toggling (in which case client-side debounce may need tuning) or an abusive script.
  3. If abusive: consider temporary IP block or user suspension per incident response policy.
  4. If legitimate: consider whether the 60 req/min limit is too restrictive and whether client-side caching is working correctly.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | Recovery |
|-------------|-------------------|----------|
| jj subprocess crash during diff generation | Return 500 with structured error; log at ERROR | Automatic — next request retries |
| Repository not found or inaccessible | Return 404 | User-facing error message |
| Landing request not found | Return 404 | User-facing error message |
| Diff generation timeout (>30s) | Return 504 or partial response | Client shows timeout message; user retries manually |
| Rate limit exceeded | Return 429 with `Retry-After` header | Client shows rate limit message; automatic retry after cooldown |
| Invalid `ignore_whitespace` parameter value | Treat as `false` (default) | No error — graceful degradation |
| Corrupted repository state | Return 500 with structured error | Admin intervention to repair repository |

## Verification

### API Integration Tests

- [ ] `GET /api/repos/:owner/:repo/landings/:number/diff` without `ignore_whitespace` returns the full diff including whitespace-only changes.
- [ ] `GET /api/repos/:owner/:repo/landings/:number/diff?ignore_whitespace=true` returns the diff with whitespace-only changes excluded.
- [ ] `GET /api/repos/:owner/:repo/landings/:number/diff?ignore_whitespace=false` returns the same result as omitting the parameter.
- [ ] `GET /api/repos/:owner/:repo/landings/:number/diff?ignore_whitespace=1` returns filtered diff (truthy alias).
- [ ] `GET /api/repos/:owner/:repo/landings/:number/diff?ignore_whitespace=TRUE` returns filtered diff (case-insensitive).
- [ ] `GET /api/repos/:owner/:repo/landings/:number/diff?ignore_whitespace=yes` returns unfiltered diff (invalid truthy value treated as false).
- [ ] `GET /api/repos/:owner/:repo/landings/:number/diff?ignore_whitespace=` returns unfiltered diff (empty string is falsy).
- [ ] Response schema is identical between `ignore_whitespace=true` and `ignore_whitespace=false` — same top-level fields, same `changes` array structure.
- [ ] Landing request with only whitespace changes across all files: `ignore_whitespace=true` returns `changes` array with empty `file_diffs` for each change.
- [ ] Landing request with mixed whitespace and non-whitespace changes: `ignore_whitespace=true` returns only the non-whitespace hunks.
- [ ] Landing request with zero changes: both `ignore_whitespace=true` and `false` return an empty `changes` array.
- [ ] Landing request with a single change containing a single file with only trailing whitespace additions: `ignore_whitespace=true` returns empty `file_diffs` for that change.
- [ ] Landing request with binary files: binary file diffs appear identically regardless of `ignore_whitespace` value.
- [ ] Landing request with tab-to-space conversions only: `ignore_whitespace=true` excludes those changes.
- [ ] Landing request with mixed line endings (CRLF→LF): `ignore_whitespace=true` excludes those changes.
- [ ] Landing request not found: returns 404 regardless of `ignore_whitespace` value.
- [ ] Unauthenticated request to private repo: returns 401 regardless of `ignore_whitespace` value.
- [ ] Unauthorized user (no repo read access): returns 403 regardless of `ignore_whitespace` value.
- [ ] Anonymous request to public repo: returns 200 with correct filtered/unfiltered diff.
- [ ] Rate limit: 61st request within one minute returns 429 with `Retry-After` header.
- [ ] Large diff (100+ files, 10,000+ lines): `ignore_whitespace=true` returns successfully within 30 seconds.
- [ ] Very large diff (maximum supported size — 500+ files): `ignore_whitespace=true` returns successfully or returns a structured error, never hangs.
- [ ] Diff for landing request in each state (open, closed, landed, draft): `ignore_whitespace` works identically.
- [ ] Stacked landing request with 10+ changes: `ignore_whitespace=true` correctly filters each change's file_diffs independently.

### Playwright (Web UI) E2E Tests

- [ ] Navigate to landing detail → Diff tab. The whitespace toggle control is visible in the diff toolbar.
- [ ] Default state: whitespace toggle shows "Show" (visible) state on initial load.
- [ ] Click the whitespace toggle to "Hide". Verify an inline loading indicator appears.
- [ ] After loading completes, verify the diff content has changed (whitespace-only hunks are removed).
- [ ] Click the toggle back to "Show". Verify the original diff with whitespace changes is restored.
- [ ] Toggle whitespace to "Hide", then switch from Unified to Split view. Verify the whitespace state is preserved (diff still shows filtered content in split layout).
- [ ] Toggle whitespace to "Hide", then click a file in the file tree. Verify the whitespace state is preserved when navigating to a different file.
- [ ] Toggle whitespace to "Hide" on a landing request where all changes are whitespace-only. Verify the global empty state message is displayed.
- [ ] Toggle whitespace to "Hide" on a landing request where one file has only whitespace changes. Verify that file shows the per-file empty state message.
- [ ] Verify the per-file empty state message includes a link or button to re-show whitespace.
- [ ] Verify inline comment anchors (`+` icons) remain functional and correctly positioned when whitespace is hidden.
- [ ] Navigate away from the Diff tab and return. Verify the whitespace state has reset to "Show" (default).
- [ ] Open two landing request tabs simultaneously. Verify toggling whitespace in one does not affect the other.
- [ ] Rapid-click the whitespace toggle 5 times quickly. Verify only one API request is sent (debounce behavior) and the final state is correct.
- [ ] Verify the network request includes `?ignore_whitespace=true` when whitespace is hidden, and omits the parameter (or sends `false`) when visible.

### CLI Integration Tests

- [ ] `codeplane land view <number> --diff` displays the full diff including whitespace changes.
- [ ] `codeplane land view <number> --diff --ignore-whitespace` displays the diff with whitespace changes excluded.
- [ ] `codeplane land view <number> --diff -w` uses the short flag alias and produces the same output as `--ignore-whitespace`.
- [ ] `codeplane land view <number> --diff --ignore-whitespace` output includes the header note "(whitespace changes hidden)".
- [ ] `codeplane land view <number> --diff --ignore-whitespace` on a landing request with only whitespace changes shows files listed as "(whitespace only)".
- [ ] `codeplane land view <number> --diff --ignore-whitespace --json` returns JSON with the same schema as the API response.
- [ ] `codeplane land view <number> --diff --ignore-whitespace` on a nonexistent landing request shows a 404 error message.

### TUI Integration Tests

- [ ] Open landing detail screen → navigate to Diff tab. Status bar shows `[ws: visible]` in muted color.
- [ ] Press `w`. Verify inline "Updating diff…" indicator appears.
- [ ] After update, verify status bar shows `[ws: hidden]` in yellow/warning color.
- [ ] After update, verify diff content has changed (whitespace-only changes removed).
- [ ] Press `w` again. Verify diff returns to full content and status bar shows `[ws: visible]`.
- [ ] Press `w` to hide, then `]` to navigate to next file. Verify whitespace remains hidden.
- [ ] Press `w` to hide, then `[` to navigate to previous file. Verify whitespace remains hidden.
- [ ] Press `w` to hide, then `t` to toggle view mode. Verify whitespace remains hidden in the new view mode.
- [ ] Press `w` to hide, then `Ctrl+B` to toggle file tree sidebar. Verify whitespace remains hidden.
- [ ] On a landing request where all changes are whitespace-only, press `w`. Verify empty state: "No visible changes (whitespace hidden). Press w to show whitespace."
- [ ] At 80×24 terminal size, verify abbreviated status indicator: `ws:vis` / `ws:hid`.
- [ ] At 120×40+ terminal size, verify full status indicator: `[ws: visible]` / `[ws: hidden]`.
- [ ] Press `w` 5 times rapidly. Verify only the final debounced API call is executed and the final state is consistent.
- [ ] Press `r` to refresh while whitespace is hidden. Verify the refresh preserves the whitespace-hidden state and re-fetches with `ignore_whitespace=true`.
- [ ] Close the diff screen and reopen it. Verify whitespace state has reset to visible.
