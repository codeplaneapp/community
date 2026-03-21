# AGENT_CLI_LIST

Specification for AGENT_CLI_LIST.

## High-Level User POV

When you're working on a repository with Codeplane, agent sessions accumulate over time — automated conversations where an AI agent helped triage issues, explored code, drafted changes, or ran tasks. At some point you need to check on what agents have been doing. The `codeplane agent list` and `codeplane agent session list` commands let you do exactly that from your terminal.

Running the command shows you a cleanly formatted table of every agent session associated with the repository. You can see at a glance which sessions are still active, which completed successfully, which failed, and which timed out. Each row shows a truncated session ID, the current status, the session's title, how many messages were exchanged, and when it was created in a human-friendly relative timestamp like "2h ago" or "3d ago."

If you need the raw data — maybe to pipe into another tool, feed into a script, or just get the full unformatted detail — you can pass `--json` and get the complete JSON array back from the API. You can paginate through large lists with `--page` and `--per-page`, and you can point the command at any repository with `--repo OWNER/REPO` instead of relying on auto-detection from your current directory.

The command fits naturally into the Codeplane CLI's consistent patterns. If you've used `codeplane issue list` or `codeplane land list`, the agent session list works the same way — same flags, same output style, same repo resolution behavior. It's the terminal-native entry point into understanding and navigating your repository's agent activity.

## Acceptance Criteria

- **The command is accessible via two paths:** `codeplane agent list` (top-level shorthand) and `codeplane agent session list` (explicit subcommand). Both invoke the same underlying logic.
- **Repository resolution works automatically.** When run inside a cloned repository directory, the command auto-detects the repository from jj or git remotes without requiring `--repo`.
- **Repository can be overridden explicitly.** The `--repo OWNER/REPO` flag (and the `-R` alias) overrides auto-detection. Clone URLs and SCP-style SSH URLs are also accepted.
- **Authentication is required.** If the user is not authenticated, the command prints a clear error message ("Authentication required. Run `codeplane auth login` to sign in.") and exits with a non-zero exit code.
- **Pagination defaults are sensible.** Default page is 1. Default per-page is 30. These match the API defaults.
- **Per-page is clamped.** Values above 50 are silently clamped to 50 by the API. The CLI does not need to enforce this client-side but must not break when the API clamps.
- **Page must be ≥ 1.** If a user passes `--page 0` or a negative number, the behavior matches the API (treated as page 1 or returns an error gracefully).
- **Default output is a human-readable table.** The table includes columns: `ID` (first 12 characters of UUID), `STATUS`, `TITLE` (truncated to 40 characters with `…` if longer), `MESSAGES` (count), `CREATED` (relative timestamp).
- **Empty list is handled gracefully.** When no sessions exist, the command outputs `No agent sessions found` rather than an empty table or no output.
- **JSON output is supported via `--json`.** When `--json` is passed, the raw JSON array from the API is printed to stdout. No table formatting, no truncation.
- **Errors from the API are surfaced clearly.** A 404 shows "Repository not found." A 401 shows "Authentication required." A 500 shows "Internal server error" with the server's error message if available.
- **Exit codes are meaningful.** Exit 0 on success (even if the list is empty). Non-zero on any error (auth failure, network failure, repo not found, invalid repo format).
- **The command does not modify any state.** It is a pure read operation.
- **Session titles with special characters render correctly.** Unicode, emoji, and characters like `<>&"'` must appear correctly in terminal output without escaping artifacts.
- **The command works in non-interactive environments.** Output is suitable for CI logs, cron jobs, and piped scripts.

### Definition of Done

1. `codeplane agent list` and `codeplane agent session list` both produce paginated, formatted session list output for the resolved repository.
2. `--page`, `--per-page`, `--repo`, and `--json` flags work as specified.
3. Human-readable table output includes ID prefix, status, title, message count, and relative created timestamp.
4. Empty list, error, and unauthenticated cases produce correct output and exit codes.
5. All verification tests (CLI E2E and API integration) pass.

## Design

### CLI Command

**Primary command:** `codeplane agent list`
**Alias command:** `codeplane agent session list`

Both commands invoke identical logic. The `agent list` path exists because `createRemoteSessionCommands` is applied to both the `agent` base command and the `session` subcommand in the existing CLI architecture.

**Options:**

| Flag         | Type    | Default | Description                                          |
|--------------|---------|---------|------------------------------------------------------|
| `--page`     | number  | 1       | Page number (1-indexed)                              |
| `--per-page` | number  | 30      | Results per page (API clamps to max 50)              |
| `--repo`     | string  | (auto)  | Repository override in `OWNER/REPO` or clone URL format |
| `--json`     | (flag)  | false   | Output raw JSON instead of formatted table           |

The `--repo` flag also accepts the `-R` shorthand via the CLI's root-level argv rewriting.

**Table Output Format:**

```
ID            STATUS     TITLE                                     MESSAGES  CREATED
01HXYZ789012  completed  Fix the login redirect bug                14        2h ago
01HABC345678  active     Triage stale issues                       3         12m ago
01HDEF901234  failed     Migrate database schema                   8         1d ago
01HGHI567890  timed_out  Refactor auth module                      22        3d ago
01HJKL234567  pending    Investigate flaky test                    0         5s ago
```

Column specifications:

| Column     | Source field    | Formatting                                                          |
|------------|----------------|---------------------------------------------------------------------|
| `ID`       | `id`           | First 12 characters of the UUID                                     |
| `STATUS`   | `status`       | Lowercase status string as-is (`active`, `completed`, `failed`, `timed_out`, `pending`) |
| `TITLE`    | `title`        | Truncated to 40 characters; appends `…` if truncated                |
| `MESSAGES` | `messageCount` | Integer count; `0` if null or missing                               |
| `CREATED`  | `createdAt`    | Relative timestamp (e.g., `5s ago`, `12m ago`, `2h ago`, `1d ago`, `3w ago`) |

**Empty state output:**

```
No agent sessions found
```

**JSON output** (`--json`):

The raw JSON array from the API is printed to stdout with no transformation. All fields including `repositoryId`, `userId`, `workflowRunId`, `startedAt`, `finishedAt`, `updatedAt` are included.

**Error output examples:**

```
Error: Authentication required. Run `codeplane auth login` to sign in.
```

```
Error: Repository not found
```

```
Error: Could not determine repository. Use -R OWNER/REPO or run from within a repo.
```

### API Shape

The CLI consumes the existing `GET /api/repos/:owner/:repo/agent/sessions` endpoint. No new API surface is required.

**Request:**
```
GET /api/repos/:owner/:repo/agent/sessions?page=1&per_page=30
Authorization: token <PAT>
Accept: application/json
```

**Response:** `200 OK`

Headers:
- `X-Total-Count`: Total number of sessions (string-encoded integer)

Body: JSON array of session objects with fields: `id`, `repositoryId`, `userId`, `workflowRunId`, `title`, `status`, `startedAt`, `finishedAt`, `createdAt`, `updatedAt`, `messageCount`.

**Error responses:**
- `401 Unauthorized` — missing or invalid auth
- `404 Not Found` — repository does not exist or user lacks read access
- `500 Internal Server Error` — server-side failure

### Output Formatting

A new `formatAgentSessionList` function is added to `apps/cli/src/output.ts`, following the exact same pattern as `formatIssueList`, `formatRepoList`, and `formatLandingList`.

```typescript
export function formatAgentSessionList(sessions: JsonRecord[]): string
```

This function:
- Returns `"No agent sessions found"` for an empty array
- Builds a table with headers `["ID", "STATUS", "TITLE", "MESSAGES", "CREATED"]`
- Truncates the `id` field to 12 characters
- Truncates the `title` field to 40 characters with `…` suffix if needed
- Formats `messageCount` as an integer string, defaulting to `"0"`
- Formats `createdAt` as a relative timestamp string using a `relativeTime` helper

A helper function for relative time formatting:

```typescript
function relativeTime(isoDate: string): string
```

Converts ISO 8601 timestamps to human-friendly relative strings (`5s ago`, `2m ago`, `1h ago`, `3d ago`, `2w ago`, `1mo ago`, `1y ago`).

### Documentation

1. **CLI reference entry** for `codeplane agent list` / `codeplane agent session list` — flags, default values, output format, examples of table and JSON output, and common error messages.
2. **"Managing Agent Sessions" guide** — a section covering CLI-based session listing, including how to paginate through large lists, how to filter with `jq` when using `--json`, and how to combine with other CLI commands (e.g., piping session IDs to `codeplane agent view`).

## Permissions & Security

### Authorization

| Role       | Can run `agent list`? | Notes                                                    |
|------------|:---------------------:|----------------------------------------------------------|
| Anonymous  | ❌                   | Must be authenticated                                    |
| Read-only  | ✅                   | Can view session metadata (titles, statuses, counts)     |
| Member     | ✅                   | Full list access                                         |
| Admin      | ✅                   | Full list access                                         |
| Owner      | ✅                   | Full list access                                         |

The list endpoint returns sessions from all users in the repository, not just the authenticated user's sessions. Agent session visibility is scoped to repository read access, not individual session ownership.

### Rate Limiting

- The underlying `GET /api/repos/:owner/:repo/agent/sessions` endpoint is subject to the global API rate limiter: **60 requests per minute per authenticated user**.
- The CLI does not perform any internal polling or retry loops on list calls. Each invocation makes exactly one API request.
- Scripted usage (e.g., `watch codeplane agent list`) should respect the rate limit. Users polling in scripts should use intervals of ≥10 seconds.

### Data Privacy

- **Session titles may contain sensitive information.** The CLI prints titles directly to the terminal. Users should be aware that session titles are visible in terminal scrollback and logs.
- **User IDs are included in JSON output.** The `userId` field identifies who created each session. This is acceptable for authenticated repository members.
- **Message contents are never included in list output.** Only metadata (title, status, counts, timestamps) is returned by the list endpoint.
- **PAT tokens are sent via `Authorization` header over HTTPS.** The CLI client does not log or print the token value.

## Telemetry & Product Analytics

### Business Events

| Event Name                  | Trigger                                                    | Properties                                                                                     |
|-----------------------------|------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| `AgentSessionListViewed`    | `codeplane agent list` or `codeplane agent session list` completes successfully | `repo_id`, `owner`, `repo`, `client: "cli"`, `session_count` (returned count), `page`, `per_page`, `output_format` ("table" or "json"), `total_count` (from X-Total-Count header) |
| `AgentCLIListErrored`       | The command exits with a non-zero code                     | `repo_id` (if resolved), `client: "cli"`, `error_type` ("auth", "not_found", "repo_resolution", "network", "server_error"), `error_message` |

### Funnel Metrics

1. **CLI List → CLI View conversion rate:** What percentage of `agent list` invocations are followed by an `agent view` or `agent session view` invocation within the same terminal session (5-minute window)? Target: >25%. Indicates the list is being used for navigation.
2. **CLI List repeat usage:** How many times per day does a user invoke `agent list` for the same repository? High repeat usage (>5/day) suggests the command is a valuable status dashboard.
3. **JSON output adoption:** What percentage of `agent list` invocations use `--json`? High adoption (>20%) indicates significant programmatic/scripting use cases.
4. **Pagination usage:** What percentage of invocations use explicit `--page` or `--per-page` flags? Low usage indicates most repositories have fewer than 30 sessions.

### Success Indicators

- Fewer than 1% of `agent list` CLI invocations result in errors (excluding auth/repo resolution errors from first-time users).
- Users who use `agent list` in the CLI are more likely to also use `agent run` or `agent ask` (indicating the list drives agent engagement).
- Average command latency (user-perceived, including network) is under 2 seconds at p95.

## Observability

### Logging

All logging occurs server-side on the API endpoint. The CLI itself does not emit structured logs.

| Log Point                         | Level  | Structured Context                                              |
|-----------------------------------|--------|-----------------------------------------------------------------|
| Session list request received     | `info` | `repo_id`, `user_id`, `page`, `per_page`, `client_type: "cli"` |
| Session list returned successfully| `info` | `repo_id`, `user_id`, `total_count`, `page_size`, `latency_ms` |
| Session list query failed         | `error`| `repo_id`, `user_id`, `error_message`, `error_code`            |
| Session list auth rejected        | `warn` | `request_id`, `ip_address`                                     |
| Session list rate limited         | `warn` | `user_id`, `ip_address`, `endpoint`                            |

### Prometheus Metrics

| Metric Name                                    | Type      | Labels                   | Description                                   |
|------------------------------------------------|-----------|--------------------------|-----------------------------------------------|
| `codeplane_agent_session_list_requests_total`  | Counter   | `repo_id`, `status_code` | Total session list requests                   |
| `codeplane_agent_session_list_latency_seconds` | Histogram | `repo_id`                | Server-side request latency                   |
| `codeplane_agent_session_list_result_count`    | Histogram | `repo_id`                | Number of sessions returned per request       |
| `codeplane_agent_sessions_total`               | Gauge     | `repo_id`, `status`      | Current count of sessions by status per repo  |

### Alerts

#### Alert: High Session List Error Rate

**Condition:** `rate(codeplane_agent_session_list_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_agent_session_list_requests_total[5m]) > 0.05`

**Severity:** Warning (>5%), Critical (>20%)

**Runbook:**
1. Check server logs filtered by `error_code` on the session list endpoint for the most recent errors.
2. Verify database connectivity — the session list query joins `agent_sessions` with an aggregate subquery on `agent_messages`. If the DB is under load, this is a likely failure point.
3. Check for query timeouts. The `listAgentSessionsByRepoWithMessageCount` query involves a LEFT JOIN with a COUNT subquery. If `agent_messages` is very large, consider adding/verifying an index on `agent_messages(session_id)`.
4. If errors are concentrated on specific repositories, check for data anomalies (corrupt rows, unusually large session/message counts).
5. If query plans have regressed, escalate to the database team and consider temporarily increasing query timeouts.

#### Alert: High Session List Latency

**Condition:** `histogram_quantile(0.95, rate(codeplane_agent_session_list_latency_seconds_bucket[5m])) > 2.0`

**Severity:** Warning (>2s p95), Critical (>5s p95)

**Runbook:**
1. Run `EXPLAIN ANALYZE` on the session list query for the slowest repository.
2. Look for lock contention on `agent_sessions` — concurrent session creation or deletion may cause row-level locks.
3. Check database connection pool utilization. Exhausted pools will queue list queries.
4. Check if a specific repository has an unusually large number of sessions (>10,000). Consider cleanup or query optimization.
5. Monitor database server memory — large result sets with message count subqueries can cause memory pressure.

#### Alert: Session List Rate Limiting Spike

**Condition:** `rate(codeplane_agent_session_list_requests_total{status_code="429"}[5m]) > 10`

**Severity:** Warning

**Runbook:**
1. Identify the user(s) being rate-limited from structured logs (`user_id`, `ip_address`).
2. Check if a CLI script or CI job is polling `agent list` in a tight loop.
3. If the traffic is legitimate (e.g., a dashboard script), recommend increasing the polling interval or using the web UI/TUI with SSE fallback instead.
4. If the traffic is abusive, consider temporary IP-level blocking or user-level rate limit escalation.

### Error Cases and Failure Modes

| Error Case                                | Exit Code | User-Facing Output                                                       | Recovery                                   |
|-------------------------------------------|-----------|--------------------------------------------------------------------------|--------------------------------------------||
| Not authenticated                         | 1         | `Error: Authentication required. Run \`codeplane auth login\` to sign in.` | User runs `codeplane auth login`           |
| Invalid/expired PAT                       | 1         | `Error: Authentication required. Run \`codeplane auth login\` to sign in.` | User re-authenticates                      |
| Repository not found                      | 1         | `Error: Repository not found`                                            | Verify owner/repo spelling                 |
| No read access to repository              | 1         | `Error: Repository not found`                                            | Request access from repo admin             |
| Cannot determine repository from CWD      | 1         | `Error: Could not determine repository. Use -R OWNER/REPO or run from within a repo.` | Use `--repo` flag or `cd` into a repo     |
| Invalid `--repo` format                   | 1         | `Error: Invalid repo format: "...". Expected OWNER/REPO or a clone URL.` | Fix the format                             |
| Network unreachable / timeout             | 1         | `Error: Failed to connect to <host>` or similar fetch error              | Check network, verify API URL in config    |
| Server returns 500                        | 1         | `Error: Internal server error` (with detail if available)                | Retry; check server health                 |
| Server returns 429 (rate limited)         | 1         | `Error: Rate limit exceeded` (with detail if available)                  | Wait and retry                             |
| Non-numeric `--page` value                | 1         | CLI framework validation error (incur/zod)                               | Use a valid integer                        |
| Non-numeric `--per-page` value            | 1         | CLI framework validation error (incur/zod)                               | Use a valid integer                        |
| `--per-page` value > 50                   | 0         | Works normally; API clamps to 50 silently                                | N/A (graceful degradation)                 |
| `--page` value of 0 or negative           | 0         | API treats as page 1 or returns empty; command succeeds                  | N/A (graceful degradation)                 |
| Page number exceeds available pages       | 0         | Outputs `No agent sessions found` (empty array from API)                 | N/A (valid scenario)                       |

## Verification

### API Integration Tests

- **List sessions for a repository with no sessions** — `GET /api/repos/:owner/:repo/agent/sessions` returns `200 OK` with empty JSON array `[]` and `X-Total-Count: 0`.
- **List sessions for a repository with one session** — Returns array of 1 session with all expected fields: `id`, `repositoryId`, `userId`, `workflowRunId`, `title`, `status`, `startedAt`, `finishedAt`, `createdAt`, `updatedAt`, `messageCount`.
- **List sessions returns sessions in newest-first order** — Create 3 sessions with known creation order, verify the response array is ordered by `createdAt DESC`.
- **List sessions returns correct `messageCount`** — Create a session, append 5 messages, verify `messageCount` is `5` in list response.
- **List sessions returns `messageCount: 0` for sessions with no messages** — Create a session without appending messages, verify count is `0`.
- **Default pagination (page=1, per_page=30)** — Create 35 sessions, request without query params, verify 30 returned and `X-Total-Count: 35`.
- **Explicit `per_page` parameter** — Request with `per_page=5`, verify exactly 5 sessions returned.
- **Per-page clamped to 50** — Request with `per_page=100`, verify at most 50 sessions returned.
- **Maximum valid per-page (50) works** — Create 50 sessions, request with `per_page=50`, verify all 50 returned in a single page.
- **Per-page of 51 is clamped to 50** — Request with `per_page=51`, verify only 50 returned.
- **Per-page of 1** — Request with `per_page=1`, verify exactly 1 session returned.
- **Page 2** — Create 35 sessions, request `page=2&per_page=30`, verify 5 sessions returned.
- **Page 0** — Request with `page=0`, verify graceful behavior (treated as page 1 or returns valid response).
- **Page exceeding available pages** — Request page 999, verify empty array returned with correct `X-Total-Count`.
- **Non-numeric `page` parameter** — Request with `page=abc`, verify graceful fallback to default.
- **Non-numeric `per_page` parameter** — Request with `per_page=xyz`, verify graceful fallback to default.
- **`X-Total-Count` header accuracy** — Create 42 sessions, verify header value is `"42"`.
- **Authentication required** — Request without auth token returns `401`.
- **Invalid PAT returns 401** — Request with garbage token returns `401`.
- **Non-existent repository returns 404** — Request for `nonexistent-owner/nonexistent-repo` returns `404`.
- **Repository user cannot access returns 404** — User without read access gets `404` (not `403`, to avoid leaking repo existence).
- **All status types returned correctly** — Create sessions with each of the 5 statuses (`active`, `completed`, `failed`, `timed_out`, `pending`), verify all appear with correct status strings.
- **Session with `workflowRunId` populated** — Create a session linked to a workflow run, verify `workflowRunId` is non-null in response.
- **Session without `workflowRunId`** — Verify `workflowRunId` is `null`.
- **`startedAt` and `finishedAt` populated when set** — Verify these fields appear as ISO 8601 strings.
- **`startedAt` and `finishedAt` are `null` when not set** — Verify for a `pending` session.
- **Session title with 255 characters** — Create a session with a 255-character title, verify it appears in full in the list response.
- **Session title with special characters** — Create sessions with titles containing `<script>alert('xss')</script>`, `🤖 Agent run`, `日本語タイトル`, verify all returned verbatim.
- **Deleted sessions excluded** — Create a session, delete it, verify it does not appear in subsequent list calls.
- **Cross-repository isolation** — Create sessions in repo A and repo B, verify listing repo A only shows repo A's sessions.

### CLI E2E Tests

- **`codeplane agent list` with no sessions** — Outputs `No agent sessions found` and exits 0.
- **`codeplane agent list` with sessions** — Outputs formatted table with `ID`, `STATUS`, `TITLE`, `MESSAGES`, `CREATED` columns, correct header, separator line, and data rows. Exits 0.
- **`codeplane agent session list` produces identical output** — Both paths produce the same result for the same repository.
- **`codeplane agent list --json` with no sessions** — Outputs `[]` (valid JSON empty array). Exits 0.
- **`codeplane agent list --json` with sessions** — Outputs valid JSON array. Each object has expected fields. Exits 0.
- **`codeplane agent list --json` output is parseable by `jq`** — Pipe output to `jq '.[0].title'`, verify valid extraction.
- **`codeplane agent list --page 2 --per-page 5`** — Create >5 sessions, verify correct pagination (5 or fewer results on page 2).
- **`codeplane agent list --per-page 1`** — Verify exactly 1 result returned in table format.
- **`codeplane agent list --per-page 50`** — Verify up to 50 results returned (maximum valid page size).
- **`codeplane agent list --per-page 100`** — Verify no error; results capped at 50 (API clamping).
- **`codeplane agent list --repo owner/repo`** — Uses the specified repository override.
- **`codeplane agent list -R owner/repo`** — `-R` alias works identically to `--repo`.
- **`codeplane agent list` with auto-detected repo** — Run inside a cloned repo directory, verify it correctly resolves the repository without `--repo`.
- **`codeplane agent list` outside a repo directory without `--repo`** — Prints repo resolution error and exits non-zero.
- **`codeplane agent list` without authentication** — Prints auth error message mentioning `codeplane auth login` and exits non-zero.
- **`codeplane agent list` for non-existent repository** — Prints "Repository not found" and exits non-zero.
- **`codeplane agent list --repo invalid-format`** — Prints invalid repo format error and exits non-zero.
- **Table output: ID column shows 12-character prefix** — Verify the ID column truncates long UUIDs to 12 characters.
- **Table output: title truncation at 40 characters** — Create a session with a 60-character title, verify it's truncated with `…` in table output.
- **Table output: title with exactly 40 characters is not truncated** — Verify no `…` appended.
- **Table output: relative timestamps are human-friendly** — Verify output contains strings like `2h ago`, `1d ago`, not raw ISO 8601.
- **Table output: message count of 0** — Verify `0` appears in the `MESSAGES` column for sessions with no messages.
- **Table output: all status values render correctly** — Verify `active`, `completed`, `failed`, `timed_out`, `pending` all appear as strings in the `STATUS` column.
- **Table output: Unicode titles render correctly** — Create a session with emoji and CJK characters in the title, verify the table renders without corruption.
- **`codeplane agent list` with `--page` beyond last page** — Outputs `No agent sessions found` and exits 0.
- **JSON output includes all fields not shown in table** — Verify fields like `repositoryId`, `userId`, `workflowRunId`, `startedAt`, `finishedAt`, `updatedAt` are present in JSON but absent from table output.
- **Exit code is 0 on success (even empty list)** — Verify `$?` is `0`.
- **Exit code is non-zero on any error** — Verify `$?` is non-zero for auth failure, repo not found, network error.
