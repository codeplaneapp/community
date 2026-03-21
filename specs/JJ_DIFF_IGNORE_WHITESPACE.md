# JJ_DIFF_IGNORE_WHITESPACE

Specification for JJ_DIFF_IGNORE_WHITESPACE.

## High-Level User POV

When reviewing changes in a jj-native repository on Codeplane, diffs frequently contain a mix of meaningful code modifications and cosmetic whitespace adjustments — indentation changes, trailing whitespace removal, tab-to-space conversions, or formatter-driven reformatting. These whitespace-only changes create visual noise that makes it harder to focus on the substantive logic changes that actually matter during code review.

The ignore-whitespace feature gives you a single, consistent mechanism across every Codeplane surface — the web UI, CLI, TUI, and API — to filter whitespace-only changes out of any jj change diff. When activated, the diff is re-computed by the server with whitespace differences excluded. Files that contained only whitespace modifications disappear entirely from the diff. Hunks within files that were purely whitespace adjustments are stripped away, leaving only the lines where non-whitespace content actually changed. The addition and deletion counts adjust accordingly, giving you an accurate picture of the meaningful scope of the change.

In the web UI, you click a toolbar toggle to switch between the full diff and the whitespace-filtered diff. The current state is visually indicated, and the toggle is always one click away. In the TUI, you press the `w` key. In the CLI, you pass `--ignore-whitespace` to `codeplane change diff`. In direct API usage, you add `?whitespace=ignore` to the diff endpoint URL. Regardless of the surface, the behavior is the same: the server re-computes the diff without whitespace noise and returns a filtered result.

The toggle is stateless from the server's perspective — each request either includes or excludes whitespace, and the server computes the appropriate diff fresh (or serves from cache). From the client's perspective, the current whitespace preference is a session-level setting: it persists while you're looking at a diff, but resets when you navigate away and come back. In the web UI, an optional persistent preference stored in the diff preferences store lets you default to whitespace-ignored if you prefer that as your starting state.

This feature is essential for reviewers working in codebases where formatters, linters, or editor-level whitespace normalization routinely produce whitespace-only changes alongside meaningful code modifications. Without it, a reviewer has to mentally filter noise on every diff they open. With it, they can immediately focus on what matters and toggle whitespace back in when they specifically want to verify formatting.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/changes/:change_id/diff` accepts and honors the `whitespace` query parameter with values `ignore` and `hide`
- [ ] When `whitespace=ignore` or `whitespace=hide`, the jj subprocess is invoked with the appropriate flag to exclude whitespace-only changes
- [ ] Files that contain only whitespace changes are excluded from the `file_diffs` array in the response
- [ ] Hunks within files that contain only whitespace changes are excluded from the `patch` content
- [ ] The `additions` and `deletions` counts on each file reflect only non-whitespace line changes
- [ ] The CLI command `codeplane change diff` supports `--ignore-whitespace` / `-w` flag
- [ ] The TUI diff screen supports the `w` keybinding for toggling whitespace visibility
- [ ] The Web UI diff viewer displays a whitespace toggle control in the diff toolbar
- [ ] The `RepoHostService.getChangeDiff()` method in the SDK accepts an options parameter that includes `ignore_whitespace`
- [ ] Existing diff features (file tree, unified/split view, syntax highlighting, hunk collapse/expand, copy patch) continue to work correctly with whitespace filtering active

### Input Validation & Boundary Constraints

- [ ] The `whitespace` query parameter accepts only `ignore`, `hide`, or empty/absent
- [ ] Any unrecognized value for `whitespace` (e.g., `whitespace=foo`, `whitespace=true`, `whitespace=1`) is treated as absent — the diff includes all changes, no error is returned
- [ ] The `whitespace` parameter value is case-insensitive: `IGNORE`, `Ignore`, `ignore` all behave identically
- [ ] The `whitespace` parameter is trimmed of leading/trailing whitespace before comparison
- [ ] The CLI `--ignore-whitespace` flag is a boolean flag — it does not accept a value argument
- [ ] The CLI `-w` short flag is an alias for `--ignore-whitespace`
- [ ] The maximum length of the `whitespace` query parameter value is 32 characters; values longer than 32 characters are treated as absent
- [ ] The `whitespace` parameter does not affect binary file detection — binary files are always flagged as binary regardless of whitespace setting
- [ ] An empty diff (0 file changes) with `whitespace=ignore` still returns a valid `{ change_id, file_diffs: [] }` response

### Edge Cases

- [ ] A change where every file modification is whitespace-only: with `whitespace=ignore`, the response returns `file_diffs: []` (empty array)
- [ ] A change with mixed whitespace-only and code-change files: only code-change files appear in the filtered response
- [ ] A file that has both whitespace-only hunks and code-change hunks: whitespace-only hunks are excluded, code-change hunks are preserved
- [ ] A rename that also includes whitespace-only content changes: the rename is preserved in the response because the rename itself is a non-whitespace structural change, but the `patch` contains only non-whitespace hunks (or is empty if the content changes were all whitespace)
- [ ] A file where a line has both whitespace changes and non-whitespace changes on the same line: the line is preserved (it's not a whitespace-only change)
- [ ] Tab-to-space and space-to-tab conversions are treated as whitespace-only changes
- [ ] Trailing whitespace additions or removals are treated as whitespace-only changes
- [ ] A blank-line-only addition or removal (a line containing only `\n` or `\r\n`) is treated as a whitespace-only change
- [ ] Changes to file permissions (mode changes) without content changes: preserved even with `whitespace=ignore` since they are structural, not whitespace
- [ ] A diff with `whitespace=ignore` applied to a change that has conflicts: the whitespace filter applies to the diff output normally; conflict markers in the content are not affected
- [ ] The `whitespace=ignore` parameter does not affect the `language` detection or `is_binary` flag on any file
- [ ] Requesting `whitespace=ignore` on a change with 500+ files still returns all non-whitespace-changed files without artificial truncation
- [ ] Unicode whitespace characters (e.g., non-breaking space U+00A0, ideographic space U+3000) are handled according to jj's whitespace semantics — the server delegates to jj rather than reimplementing whitespace classification

### Concurrency and Consistency

- [ ] Two concurrent requests for the same change with different `whitespace` values both complete correctly without interfering
- [ ] The `whitespace` parameter does not create a race condition with the jj operation log

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/changes/:change_id/diff`

This endpoint already exists and accepts the `whitespace` query parameter. The current implementation validates the parameter but returns 501 (not implemented). This feature completes the implementation.

**Query Parameters (additions to existing endpoint):**

| Parameter | Type | Required | Values | Default | Description |
|-----------|------|----------|--------|---------|-------------|
| `whitespace` | string | No | `ignore`, `hide`, empty | empty (show all) | When set to `ignore` or `hide`, whitespace-only changes are excluded from the diff output |

**Behavior:**
- `whitespace=ignore` and `whitespace=hide` are synonymous — both exclude whitespace-only changes
- When whitespace filtering is active, the jj subprocess is invoked with `--ignore-all-space` (or equivalent jj flag) to produce a diff that excludes whitespace-only changes
- The response schema is identical whether whitespace filtering is on or off — the only difference is which files and hunks appear

**Success Response (200) — filtered example:**

```json
{
  "change_id": "kxsmqppt",
  "file_diffs": [
    {
      "path": "src/server.ts",
      "old_path": null,
      "change_type": "modified",
      "patch": "@@ -10,3 +10,5 @@\n-import { old } from 'old'\n+import { new } from 'new'\n+import { extra } from 'extra'",
      "is_binary": false,
      "language": "typescript",
      "additions": 2,
      "deletions": 1,
      "old_content": null,
      "new_content": null
    }
  ]
}
```

Files that were only whitespace-modified (e.g., reformatted but no logic changes) would be absent from this response entirely.

### SDK Shape

The `RepoHostService.getChangeDiff()` method signature is extended to accept an options parameter:

```typescript
interface ChangeDiffOptions {
  ignore_whitespace?: boolean;
}

async getChangeDiff(
  owner: string,
  repo: string,
  changeId: string,
  opts?: ChangeDiffOptions
): Promise<Result<ChangeDiff, APIError>>
```

When `opts.ignore_whitespace` is `true`, the method passes the appropriate flag to the `jj diff` subprocess. The existing `parseGitDiff()` function processes the filtered output identically — no parser changes are needed because jj produces standard git-format diff output regardless of whitespace flags.

### CLI Command

**Command:** `codeplane change diff [id]`

**New options:**

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--ignore-whitespace` | `-w` | boolean | `false` | Exclude whitespace-only changes from the diff output |

**Examples:**

```bash
# View diff for working copy, ignoring whitespace
codeplane change diff --ignore-whitespace

# View diff for a specific change, ignoring whitespace
codeplane change diff kxsmqppt -w

# JSON output with whitespace ignored
codeplane change diff kxsmqppt --ignore-whitespace --json

# Pipe whitespace-filtered diff
codeplane change diff -w | less
```

When `--ignore-whitespace` is used with the default (non-JSON) output mode, the raw diff text excludes whitespace-only changes. When used with `--json`, the structured response has the same filtering applied.

When the CLI is operating against a remote API (via `--repo owner/repo`), it passes `?whitespace=ignore` to the API. When operating locally (direct jj invocation), it passes the appropriate whitespace flag directly to the jj subprocess.

### Web UI Design

The diff toolbar (visible above the diff content area on the change detail page) includes a whitespace toggle:

**Toolbar layout:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  Unified ▾  │  ☐ Hide whitespace  │  Expand all  │  Copy patch       │
└────────────────────────────────────────────────────────────────────────┘
```

**Toggle control:**
- Rendered as a checkbox/toggle switch labeled "Hide whitespace"
- Default state: unchecked (whitespace visible)
- Checked state: whitespace hidden; checkbox is checked; the label may optionally switch to "Whitespace hidden" with a visual indicator (e.g., a subtle yellow badge) to signal that filtering is active
- Clicking the toggle triggers an API re-fetch with `?whitespace=ignore`
- While the re-fetch is in flight, a subtle loading indicator appears inline (not a full-page spinner) and the previous diff remains visible
- When the re-fetch completes, the diff re-renders with filtered content
- The file tree sidebar updates to exclude whitespace-only files
- The file count badge updates to reflect the filtered count
- If all files are whitespace-only, the content area shows: "No visible changes when whitespace is hidden." with a link/button to show whitespace

**State persistence:**
- Whitespace preference is stored in the diff preferences store (`UI_CORE_STORES_DIFF_PREFERENCES`) so it persists across page navigations within the same session
- The preference is optionally persisted to localStorage so it survives page reloads
- Navigating to a different change retains the whitespace preference
- The URL does not change when whitespace is toggled (it's a client-side preference, not a URL parameter)

### TUI UI

The TUI whitespace toggle is specified comprehensively in the `TUI_DIFF_WHITESPACE_TOGGLE` specification. Key behaviors:

- `w` key toggles whitespace visibility
- Status bar shows `[ws: visible]` / `[ws: hidden]` (abbreviated at <120 columns)
- `[ws: hidden]` renders in warning yellow (ANSI 178) to signal filtered state
- Re-fetch is debounced at 300ms
- Previous diff preserved during re-fetch with inline "Updating diff…" indicator
- Whitespace-only diffs show "No visible changes (whitespace hidden). Press w to show whitespace."

### Documentation

The following end-user documentation must be written:

1. **API reference update** for `GET /api/repos/:owner/:repo/changes/:change_id/diff`: document the `whitespace` query parameter, its accepted values, and a curl example showing filtered vs. unfiltered output
2. **CLI reference update** for `codeplane change diff`: document the `--ignore-whitespace` / `-w` flag with examples
3. **Web UI guide section** on diff controls: document the "Hide whitespace" toggle, its behavior, and how it interacts with file tree and counts
4. **TUI guide section** on diff keyboard shortcuts: document the `w` key, status bar indicator, and whitespace-filtered behavior
5. **Conceptual guide addition** to the jj change diff documentation: explain when whitespace filtering is useful, how it interacts with code formatters, and note that the filter is computed server-side by jj (not client-side stripping)

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Anonymous | Can use whitespace filtering on public repository diffs |
| Read-only member | Can use whitespace filtering on repositories they have read access to |
| Member / Write | Can use whitespace filtering |
| Admin | Can use whitespace filtering |
| Owner | Can use whitespace filtering |

No elevated permissions are required to use the whitespace filter. If a user can view a diff, they can view the whitespace-filtered diff. The `whitespace` query parameter does not grant any additional access.

### Rate Limiting

- Whitespace-filtered diff requests are counted against the same rate limit as unfiltered diff requests
- **Authenticated users:** 300 requests/minute per user per repository
- **Anonymous users:** 60 requests/minute per IP per repository
- The client-side debounce (300ms in TUI, implicit in web UI via re-fetch coalescing) prevents accidental rate limit consumption from rapid toggling
- A single toggle round-trip consumes 1 request from the rate limit budget
- No separate rate limit tier is needed for whitespace-filtered requests

### Data Privacy

- Whitespace-filtered diffs contain a subset of the same source code as unfiltered diffs — no additional PII or sensitive data exposure
- The `whitespace` query parameter value is not sensitive and can be logged at `info` level
- Cache keys that include the `whitespace` parameter must be scoped per-user (or per-access-level) to prevent a cached filtered diff from leaking private repo content to unauthorized users
- The `Cache-Control: private` header applies to whitespace-filtered responses identically to unfiltered responses

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `DiffWhitespaceToggled` | User toggles whitespace filtering on or off | `new_state` (`hidden` or `visible`), `client` (`web`, `cli`, `tui`, `editor`), `owner`, `repo`, `change_id`, `file_count_before` (total files in unfiltered diff), `file_count_after` (files remaining after filtering), `response_time_ms` |
| `DiffWhitespaceFilterApplied` | API returns a filtered diff (server-side event) | `owner`, `repo`, `change_id`, `total_files`, `filtered_files` (files excluded), `total_additions_original`, `total_additions_filtered`, `total_deletions_original`, `total_deletions_filtered`, `response_time_ms` |
| `DiffWhitespaceEmptyResult` | Whitespace filtering results in zero visible files | `owner`, `repo`, `change_id`, `total_files_before_filter`, `client` |

### Properties attached to all events

| Property | Description |
|----------|-------------|
| `user_id` | Authenticated user identifier (null for anonymous) |
| `session_id` | Client session identifier |
| `timestamp` | ISO 8601 event timestamp |

### Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Whitespace filter adoption rate | >15% of diff sessions | Percentage of diff view sessions where whitespace filtering is used at least once |
| Toggle-back rate | >30% of filter sessions | Percentage of sessions where the user toggles whitespace back to visible (indicates bidirectional use) |
| Empty result rate | <5% of filter activations | Percentage of whitespace-hide toggles that result in zero visible files |
| Filter response time overhead | <100ms P95 | Additional latency of filtered diff vs. unfiltered diff for the same change |
| Cross-client adoption | >1 client per week per active user | Users using the feature from multiple surfaces (web + TUI, CLI + web, etc.) |

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|--------------------|
| Diff request with whitespace filter | `info` | `owner`, `repo`, `change_id_prefix` (first 8 chars), `whitespace_mode` (`ignore`, `hide`, `none`), `request_id`, `user_id` |
| jj subprocess invoked with whitespace flag | `debug` | `command_args` (array), `repo_path`, `request_id` |
| jj subprocess completed for filtered diff | `debug` | `exit_code`, `stdout_bytes`, `duration_ms`, `request_id` |
| Filtered diff parse completed | `debug` | `file_count`, `files_excluded_by_whitespace_filter`, `parse_duration_ms`, `request_id` |
| Whitespace-filtered diff returned empty | `info` | `owner`, `repo`, `change_id_prefix`, `original_file_count`, `request_id` |
| Invalid whitespace parameter value | `debug` | `raw_value`, `request_id` — logged but not errored |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_change_diff_requests_total` | Counter | `status`, `whitespace_filtered` | Total diff requests, partitioned by whether whitespace filtering was active |
| `codeplane_change_diff_duration_seconds` | Histogram | `phase` (`jj_exec`, `parse`, `total`), `whitespace_filtered` | Duration of diff operations, partitioned by filter state |
| `codeplane_change_diff_filtered_files_total` | Counter | — | Total number of files excluded by whitespace filtering across all requests |
| `codeplane_change_diff_empty_filtered_results_total` | Counter | — | Number of filtered diff requests that returned zero files |

### Alerts

#### `DiffWhitespaceFilterHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_change_diff_duration_seconds_bucket{whitespace_filtered="true", phase="total"}[5m])) > 3`
- **Severity:** Warning
- **Runbook:**
  1. Compare P95 latency between `whitespace_filtered="true"` and `whitespace_filtered="false"` — if both are elevated, the issue is with the jj subprocess or disk I/O, not the whitespace flag specifically
  2. Check `codeplane_change_diff_duration_seconds{phase="jj_exec", whitespace_filtered="true"}` — if jj execution is the bottleneck, the `--ignore-all-space` flag may be causing jj to perform an expensive re-diff
  3. Check for a single repository with unusually large diffs that is skewing the percentile
  4. Verify disk I/O and CPU on the server — whitespace-filtered diffs require jj to do additional comparison work
  5. If the issue persists, consider adding response caching for whitespace-filtered diff results with a short TTL

#### `DiffWhitespaceFilterHighEmptyRate`
- **Condition:** `rate(codeplane_change_diff_empty_filtered_results_total[1h]) / rate(codeplane_change_diff_requests_total{whitespace_filtered="true"}[1h]) > 0.20`
- **Severity:** Info
- **Runbook:**
  1. This alert fires if >20% of whitespace-filtered requests return empty results, which may indicate the feature is being used on changes that are entirely whitespace reformats
  2. Check if a single repository or user is driving the rate — this may indicate an auto-formatter commit pattern
  3. Consider surfacing a hint in the UI: "This change contains only whitespace modifications" before the user toggles filtering
  4. No server-side remediation is needed; this is a product signal, not a bug

#### `DiffWhitespaceJJFlagFailure`
- **Condition:** `rate(codeplane_jj_subprocess_errors_total{command="diff_whitespace"}[5m]) > 0`
- **Severity:** Critical
- **Runbook:**
  1. The jj subprocess failed when invoked with the whitespace ignore flag
  2. Check the jj version — the `--ignore-all-space` or equivalent flag may not be supported in the installed jj version
  3. Run `jj diff --help` on the server to verify the flag exists
  4. Check `jj_stderr` in structured logs for the specific error message
  5. If the flag is not supported, fall back to unfiltered diff and return the result without whitespace filtering, with a warning header `X-Codeplane-Whitespace-Filter: unsupported`
  6. Update jj to a version that supports the whitespace flag

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|--------------|-----------|--------|------------|
| jj does not support the whitespace flag | Non-zero exit code with "unknown flag" in stderr | Whitespace filtering unavailable | Fall back to unfiltered diff; return result with a `X-Codeplane-Whitespace-Filter: unsupported` response header; log at `warn` |
| Whitespace flag produces different output format | Parse returns unexpected structure | Potential silent data loss | Compare file counts between filtered/unfiltered in tests; log anomalies |
| Client sends `whitespace=ignore` on every request (caching failure) | High request volume with `whitespace_filtered="true"` | Unnecessary server load | Client-side caching with TTL; server-side response caching |
| Concurrent filtered and unfiltered requests for same change | Simultaneous jj subprocesses | Resource contention | jj handles its own locking; subprocess pool limits overall concurrency |

## Verification

### API Integration Tests

| Test ID | Description |
|---------|-------------|
| `API-WS-001` | `GET /api/repos/:owner/:repo/changes/:change_id/diff?whitespace=ignore` returns 200 with `file_diffs` that exclude whitespace-only files |
| `API-WS-002` | `GET /api/repos/:owner/:repo/changes/:change_id/diff?whitespace=hide` behaves identically to `whitespace=ignore` |
| `API-WS-003` | `GET /api/repos/:owner/:repo/changes/:change_id/diff` (no `whitespace` param) returns the full diff including whitespace-only files |
| `API-WS-004` | `GET /api/repos/:owner/:repo/changes/:change_id/diff?whitespace=invalid` returns the full diff (invalid value treated as absent) |
| `API-WS-005` | `GET /api/repos/:owner/:repo/changes/:change_id/diff?whitespace=IGNORE` (uppercase) correctly filters whitespace (case-insensitive) |
| `API-WS-006` | `GET /api/repos/:owner/:repo/changes/:change_id/diff?whitespace=%20ignore%20` (with surrounding spaces) correctly filters whitespace (trimmed) |
| `API-WS-007` | A change with only whitespace modifications returns `file_diffs: []` when `whitespace=ignore` |
| `API-WS-008` | A change with 5 files: 2 whitespace-only, 3 code-change. With `whitespace=ignore`, only 3 files appear in `file_diffs` |
| `API-WS-009` | A file with both whitespace-only hunks and code-change hunks: with `whitespace=ignore`, only code-change hunks appear in the `patch` |
| `API-WS-010` | The `additions` and `deletions` counts on each file in the filtered response reflect only non-whitespace changes |
| `API-WS-011` | A renamed file with whitespace-only content changes: `whitespace=ignore` preserves the file in the response (rename is structural) but excludes whitespace hunks from `patch` |
| `API-WS-012` | A binary file is always included in the response regardless of `whitespace` parameter — binary detection is unaffected |
| `API-WS-013` | `language` detection is unaffected by the `whitespace` parameter — same language values returned filtered and unfiltered |
| `API-WS-014` | An empty change (0 files) with `whitespace=ignore` returns `{ change_id, file_diffs: [] }` (not an error) |
| `API-WS-015` | A change with 100+ files where half are whitespace-only: `whitespace=ignore` returns only the non-whitespace files |
| `API-WS-016` | Two concurrent requests — one with `whitespace=ignore`, one without — both return correct results |
| `API-WS-017` | Private repository: authenticated user with read access can use `whitespace=ignore` |
| `API-WS-018` | Private repository: unauthenticated request with `whitespace=ignore` returns 401 |
| `API-WS-019` | Non-existent change_id with `whitespace=ignore` returns 404 (same as without filter) |
| `API-WS-020` | Non-existent repository with `whitespace=ignore` returns 404 (same as without filter) |
| `API-WS-021` | A change where a single line has both whitespace changes and non-whitespace changes: the line is preserved in the filtered diff |
| `API-WS-022` | Tab-to-space conversion only: treated as whitespace-only; excluded with `whitespace=ignore` |
| `API-WS-023` | Trailing whitespace addition only: treated as whitespace-only; excluded with `whitespace=ignore` |
| `API-WS-024` | Blank line additions only (lines containing only `\n`): treated as whitespace-only; excluded with `whitespace=ignore` |
| `API-WS-025` | `whitespace` parameter value longer than 32 characters is treated as absent — full diff returned |
| `API-WS-026` | Rate limit (429) response is returned correctly when the rate limit is exceeded, regardless of `whitespace` parameter |
| `API-WS-027` | Response time for whitespace-filtered diff is within 200ms of unfiltered diff for a change with ≤50 files |
| `API-WS-028` | A change touching 500+ files with `whitespace=ignore`: all non-whitespace-changed files are returned without truncation |
| `API-WS-029` | Mode change (permission change) without content change: file is preserved in filtered response since it's a structural change |

### CLI Integration Tests

| Test ID | Description |
|---------|-------------|
| `CLI-WS-001` | `codeplane change diff --ignore-whitespace` outputs the whitespace-filtered diff for the working copy |
| `CLI-WS-002` | `codeplane change diff -w` is an alias for `--ignore-whitespace` |
| `CLI-WS-003` | `codeplane change diff <id> --ignore-whitespace` outputs the whitespace-filtered diff for the specified change |
| `CLI-WS-004` | `codeplane change diff --ignore-whitespace --json` outputs valid JSON with the filtered diff |
| `CLI-WS-005` | `codeplane change diff -w` output excludes files that are whitespace-only changes |
| `CLI-WS-006` | `codeplane change diff -w` on a change with only whitespace changes outputs nothing (empty diff) |
| `CLI-WS-007` | `codeplane change diff --repo owner/repo <id> -w` passes `?whitespace=ignore` to the remote API |
| `CLI-WS-008` | `codeplane change diff -w` in a local jj repo passes the whitespace flag to the local jj subprocess |
| `CLI-WS-009` | `codeplane change diff --ignore-whitespace` output is pipeable (no ANSI escape codes in non-TTY mode) |
| `CLI-WS-010` | `codeplane change diff` without `--ignore-whitespace` includes whitespace-only changes (default behavior unchanged) |

### TUI E2E Tests

The TUI tests are specified in detail in the `TUI_DIFF_WHITESPACE_TOGGLE` specification. Key tests relevant to this feature:

| Test ID | Description |
|---------|-------------|
| `KEY-WS-001` | `w` toggles whitespace to hidden; re-fetch with `ignore_whitespace=true` |
| `KEY-WS-002` | `w` pressed again toggles whitespace back to visible; re-fetch without filter |
| `KEY-WS-009` | Rapid `w` presses debounced — at most one API call per 300ms window |
| `KEY-WS-014` | `w` on whitespace-only diff shows empty state message |
| `KEY-WS-015` | `w` on empty state restores full diff |
| `INT-WS-001` | Change diff re-fetched with `?ignore_whitespace=true` query parameter |
| `EDGE-WS-003` | Mixed whitespace and code changes filter correctly — file count updates |
| `EDGE-WS-004` | File tree count updates on whitespace toggle |
| `SNAP-WS-002` | Status bar shows `[ws: hidden]` in warning color after toggle |
| `SNAP-WS-007` | Empty state renders "No visible changes (whitespace hidden). Press w to show whitespace." |

### Web UI E2E Tests (Playwright)

| Test ID | Description |
|---------|-------------|
| `WEB-WS-001` | The diff toolbar shows a "Hide whitespace" toggle control |
| `WEB-WS-002` | Clicking "Hide whitespace" triggers an API request with `?whitespace=ignore` |
| `WEB-WS-003` | After clicking "Hide whitespace", whitespace-only files disappear from the file tree |
| `WEB-WS-004` | After clicking "Hide whitespace", the toggle shows checked/active state |
| `WEB-WS-005` | Clicking the toggle again restores the full diff (re-fetches without `whitespace` param) |
| `WEB-WS-006` | While the whitespace-filtered diff is loading, a loading indicator is visible |
| `WEB-WS-007` | When all files are whitespace-only and whitespace is hidden, an empty state message is shown |
| `WEB-WS-008` | The file count badge updates to reflect filtered file count |
| `WEB-WS-009` | Whitespace preference persists when navigating to a different file within the same diff |
| `WEB-WS-010` | Whitespace preference persists when toggling between unified and split view modes |
| `WEB-WS-011` | Whitespace preference persists after a page reload (stored in diff preferences) |
| `WEB-WS-012` | The diff additions/deletions summary updates to reflect filtered counts |

### SDK/Service Integration Tests

| Test ID | Description |
|---------|-------------|
| `SDK-WS-001` | `RepoHostService.getChangeDiff(owner, repo, id, { ignore_whitespace: true })` invokes jj with the whitespace flag |
| `SDK-WS-002` | `RepoHostService.getChangeDiff(owner, repo, id, { ignore_whitespace: false })` invokes jj without the whitespace flag |
| `SDK-WS-003` | `RepoHostService.getChangeDiff(owner, repo, id)` (no options) invokes jj without the whitespace flag (backward-compatible) |
| `SDK-WS-004` | `RepoHostService.getChangeDiff(owner, repo, id, { ignore_whitespace: true })` for a whitespace-only change returns `{ change_id, file_diffs: [] }` |
| `SDK-WS-005` | `RepoHostService.getChangeDiff(owner, repo, id, { ignore_whitespace: true })` for a mixed change returns only non-whitespace files |
| `SDK-WS-006` | If jj does not support the whitespace flag, `getChangeDiff` with `ignore_whitespace: true` falls back to unfiltered diff and returns a result (not an error) |
