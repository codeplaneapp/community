# JJ_COMMIT_STATUS_SET

Specification for JJ_COMMIT_STATUS_SET.

## High-Level User POV

When teams use Codeplane as their forge, external systems — CI/CD pipelines, security scanners, linters, deployment tooling, and AI agents — need a way to report the outcome of their checks against specific code changes. **JJ_COMMIT_STATUS_SET** is the mechanism that lets any authorized system post a status check (such as "build passed", "security scan failed", or "deploy pending") against a specific jj change or git commit in a Codeplane repository.

This is the write-side of commit statuses. Once a status has been posted, it becomes visible across every Codeplane surface: the landing request Checks tab shows whether all required checks have passed before a change can land, the CLI lets users query check results from their terminal, the TUI aggregates check states in the landing detail view, and the web UI displays check badges alongside changes and landing requests.

From the user's perspective, the flow works like this: a CI system finishes a build and calls the Codeplane API (or CLI) to report a status with a context name like `ci/build`, a state like `success` or `failure`, a human-readable description, and a link back to the CI dashboard. Codeplane records this status against the specified commit SHA and, optionally, a jj change ID. The status immediately appears in all surfaces that display checks for that change.

Because Codeplane is jj-native, commit statuses support dual addressing. A status can be associated with both a git commit SHA and a jj change ID simultaneously. This means that even as the underlying git commit changes (for example, when a change is rebased), the status can still be discovered by its stable jj change ID.

The feature is designed for machine-to-machine use. CI runners, webhook-triggered bots, workflow steps, and AI agents are the primary callers. Human users interact with the results downstream — reviewing check status before landing a change, clicking through to a CI dashboard, or waiting for a pending check to complete.

## Acceptance Criteria

### Definition of Done

- [ ] The `POST /api/repos/:owner/:repo/statuses/:sha` endpoint is fully functional (no longer returns 501)
- [ ] Authenticated users with write access to the repository can create commit statuses
- [ ] Created statuses are immediately queryable via the list endpoint
- [ ] The CLI `status create` subcommand is implemented and wired to the API
- [ ] All existing E2E tests in `e2e/cli/commit-status.test.ts` pass without modification
- [ ] The feature is registered in `features.ts` as `JJ_COMMIT_STATUS_SET` with `Implemented` status
- [ ] Webhook events fire when a commit status is created (event type: `status`)

### Input Validation

- [ ] `sha` path parameter is required; empty or whitespace-only values return 400
- [ ] `sha` must be a valid hexadecimal string between 4 and 64 characters; invalid formats return 400
- [ ] `context` is required; empty or whitespace-only values return 400
- [ ] `context` must be at most 255 characters
- [ ] `context` must match the pattern `[a-zA-Z0-9._\-/]+` (alphanumeric, dots, hyphens, underscores, forward slashes); other characters return 400
- [ ] `status` is required and must be one of: `pending`, `success`, `failure`, `error`, `cancelled`; any other value returns 422
- [ ] `description` is optional; defaults to empty string if omitted
- [ ] `description` must be at most 1024 characters; longer values return 400
- [ ] `target_url` is optional; defaults to empty string if omitted
- [ ] `target_url`, if provided and non-empty, must be a valid HTTP or HTTPS URL; invalid URLs return 400
- [ ] `target_url` must be at most 2048 characters
- [ ] `change_id` is optional; if provided, it must be a non-empty string of at most 64 characters
- [ ] `workflow_run_id` is optional; if provided, it must reference an existing workflow run in the same repository (or be ignored if null)
- [ ] Request body must be valid JSON; non-JSON payloads return 415

### Behavioral Constraints

- [ ] Multiple statuses with the same `context` on the same commit SHA are allowed and stored independently (append-only, not upsert)
- [ ] The newest status for a given context is considered the "current" status for that context when aggregating
- [ ] Creating a status on a non-existent repository returns 404
- [ ] Creating a status with an unauthorized or missing token returns 401
- [ ] Creating a status with a read-only token returns 403
- [ ] The response includes the full status object with server-generated `id`, `created_at`, and `updated_at`
- [ ] The `commit_sha` in the response reflects the `sha` from the URL path parameter
- [ ] Timestamps are returned in ISO 8601 format

### Edge Cases

- [ ] Creating a status with only the required fields (`context` and `status`) succeeds
- [ ] Creating a status with an empty `description` and empty `target_url` succeeds
- [ ] Creating two statuses with the same `context` on the same SHA both succeed and both are stored
- [ ] Creating statuses with different `context` values on the same SHA succeeds
- [ ] Creating a status with `change_id` set but no `commit_sha` equivalent still stores the record
- [ ] Creating a status with a `context` that contains forward slashes (e.g., `ci/build/lint`) succeeds
- [ ] Creating a status with maximum-length `context` (255 chars) succeeds
- [ ] Creating a status with maximum-length `description` (1024 chars) succeeds
- [ ] Creating a status with maximum-length `target_url` (2048 chars) succeeds
- [ ] Concurrent creation of multiple statuses on the same SHA does not cause conflicts or data loss
- [ ] Unicode in `description` is accepted and stored correctly (the field is free text)

## Design

### API Shape

#### Create Commit Status

```
POST /api/repos/:owner/:repo/statuses/:sha
Content-Type: application/json
Authorization: Bearer <token>
```

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | yes | Repository owner (user or org) |
| `repo` | string | yes | Repository name |
| `sha` | string | yes | Git commit SHA (4–64 hex chars) |

**Request Body:**
```json
{
  "context": "ci/build",
  "status": "success",
  "description": "Build completed successfully",
  "target_url": "https://ci.example.com/build/42",
  "change_id": "kxyz123456789abcdef"
}
```

| Field | Type | Required | Constraints | Default |
|-------|------|----------|-------------|----------|
| `context` | string | yes | 1–255 chars, `[a-zA-Z0-9._\-/]+` | — |
| `status` | string | yes | One of: `pending`, `success`, `failure`, `error`, `cancelled` | — |
| `description` | string | no | 0–1024 chars | `""` |
| `target_url` | string | no | Valid HTTP/HTTPS URL, 0–2048 chars | `""` |
| `change_id` | string | no | 1–64 chars if provided | `null` |

**Success Response: `201 Created`**
```json
{
  "id": 42,
  "context": "ci/build",
  "status": "success",
  "description": "Build completed successfully",
  "target_url": "https://ci.example.com/build/42",
  "commit_sha": "abc123def456789012345678901234567890abcd",
  "change_id": "kxyz123456789abcdef",
  "created_at": "2026-03-21T10:30:00.000Z",
  "updated_at": "2026-03-21T10:30:00.000Z"
}
```

**Error Responses:**
| Code | Condition |
|------|----------|
| 400 | Missing/invalid `owner`, `repo`, `sha`, `context`, `description` too long, `target_url` too long |
| 401 | No authentication provided |
| 403 | Token lacks write permission on the repository |
| 404 | Repository not found (also used for private repos to prevent existence leaking) |
| 415 | Non-JSON content type |
| 422 | Invalid `status` value |
| 429 | Rate limit exceeded |

### CLI Command

```
codeplane status create <sha> [options]
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `sha` | string | yes | Git commit SHA to attach the status to |

**Options:**
| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--context` | string | yes | Hierarchical context name (e.g., `ci/build`) |
| `--status` | string | yes | Status value: `pending`, `success`, `failure`, `error`, `cancelled` |
| `--description` | string | no | Human-readable description |
| `--target-url` | string | no | URL to external system (CI dashboard, etc.) |
| `--change-id` | string | no | jj change ID to associate with the status |
| `--repo`, `-R` | string | no | Repository slug (`owner/repo`); defaults to current repo context |
| `--json` | flag | no | Output response as JSON |

**Example usage:**

```bash
# Report a pending CI build
codeplane status create abc123def456 \
  --context ci/build \
  --status pending \
  --description "Build #42 is running" \
  --target-url https://ci.example.com/build/42

# Report a successful security scan with change ID
codeplane status create abc123def456 \
  --context security/trivy \
  --status success \
  --description "No vulnerabilities found" \
  --change-id kxyz123456789abcdef

# Report a failure from a linter
codeplane status create abc123def456 \
  --context lint/eslint \
  --status failure \
  --description "3 lint errors found" \
  --target-url https://ci.example.com/lint/42
```

**Default (non-JSON) output:**
```
✓ Created status "ci/build" (pending) on abc123de
  Build #42 is running
  → https://ci.example.com/build/42
```

**JSON output:** Full API response object.

**Error output:**
```
✗ Error: authentication required (401)
✗ Error: invalid status value "invalid-status" — must be one of: pending, success, failure, error, cancelled
```

### SDK Shape

The `@codeplane/sdk` package exposes the commit status service method:

```typescript
interface CreateCommitStatusParams {
  owner: string;
  repo: string;
  sha: string;
  context: string;
  status: "pending" | "success" | "failure" | "error" | "cancelled";
  description?: string;
  targetUrl?: string;
  changeId?: string;
}

interface CommitStatus {
  id: number;
  context: string;
  status: string;
  description: string;
  targetUrl: string;
  commitSha: string;
  changeId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Service method
createCommitStatus(params: CreateCommitStatusParams): Promise<CommitStatus>
```

The `@codeplane/ui-core` API client exposes:

```typescript
api.repos.createCommitStatus(owner, repo, sha, body): Promise<CommitStatus>
```

### Web UI Design

The web UI does not have a dedicated "create status" form — this is a machine-to-machine API. However, the web UI **consumes** commit statuses in:

1. **Landing Request Detail → Checks tab**: Shows aggregated check statuses for all changes in a landing request stack. Each status row displays the context name, status badge (with color), description, change ID, and a clickable target URL link.
2. **Change Detail View**: A status summary badge (e.g., "3/4 checks passed") appears next to the change header when statuses exist.

No new web UI surfaces are required specifically for the "set" operation.

### Documentation

The following documentation should be written for end users:

1. **API Reference: Create Commit Status** — Full endpoint documentation including path, headers, request body schema, response schema, error codes, and usage examples for `curl`, `httpie`, and common CI systems (GitHub Actions, GitLab CI, Jenkins).

2. **CLI Reference: `codeplane status create`** — Command documentation with all flags, examples for common CI integration patterns, and a note about combining with `--change-id` for jj-native workflows.

3. **Integration Guide: CI/CD Status Reporting** — A how-to guide showing users how to configure popular CI systems to report build/test/deploy statuses back to Codeplane. Should cover: GitHub Actions (using a post-build step), generic webhook-based CI, and Codeplane's own workflow engine (which creates statuses automatically).

4. **Conceptual Guide: Commit Statuses and Landing Checks** — Explains the relationship between commit statuses, landing request checks, required checks on protected bookmarks, and how status aggregation works across a change stack.

## Permissions & Security

### Authorization Model

| Role | Can Create Status? | Notes |
|------|-------------------|-------|
| Repository Owner | ✅ Yes | Full access |
| Repository Admin | ✅ Yes | Full access |
| Repository Member (write) | ✅ Yes | Standard CI integration use case |
| Repository Member (read-only) | ❌ No | Returns 403 |
| Organization Member (write via team) | ✅ Yes | If team has write access to repo |
| Anonymous / Unauthenticated | ❌ No | Returns 401 |
| Personal Access Token (write scope) | ✅ Yes | Primary machine-to-machine auth method |
| Personal Access Token (read scope) | ❌ No | Returns 403 |
| Deploy Key (write) | ✅ Yes | Repo-scoped machine identity |
| Deploy Key (read-only) | ❌ No | Returns 403 |

### Rate Limiting

| Caller Type | Limit | Window |
|-------------|-------|--------|
| Authenticated user/token | 1,000 status creations per hour per repository | Rolling 1-hour window |
| Per-IP (authenticated) | 5,000 requests/hour | Rolling 1-hour window |
| Unauthenticated (will be rejected at auth, but rate limited at transport) | 60 requests/hour | Rolling 1-hour window |
| Per-repository burst | 100 status creations per minute | Rolling 1-minute window |

Rate limit headers should be included in every response:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

### Data Privacy

- Commit status `description` and `target_url` fields may contain user-provided content. These must be sanitized on output (HTML-escaped in web UI contexts) to prevent XSS.
- `target_url` must be validated as HTTP/HTTPS only — no `javascript:`, `data:`, or other dangerous URL schemes.
- Commit statuses inherit the visibility of their parent repository: statuses on private repos are not visible to unauthorized users.
- The API must return 404 (not 403) for private repositories to prevent repository existence leaking.
- Audit logs must record who created each status (user ID or token ID), but the caller's token value must never appear in logs.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `CommitStatusCreated` | A commit status is successfully created | `repository_id`, `owner`, `repo`, `context`, `status`, `has_change_id` (bool), `has_target_url` (bool), `has_description` (bool), `auth_method` (session/pat/deploy_key), `caller_type` (human/bot — inferred from auth method), `workflow_run_id` (if present) |
| `CommitStatusCreateFailed` | A commit status creation request fails | `repository_id` (if resolvable), `error_code` (401/403/404/422/429), `context` (if provided), `status` (if provided) |

### Funnel Metrics

| Metric | Description | Success Indicator |
|--------|-------------|-------------------|
| **Adoption rate** | % of active repositories with at least one commit status in the last 30 days | Growing month-over-month |
| **Context diversity** | Average number of distinct `context` values per repository | ≥ 2 indicates meaningful CI integration |
| **Status transition completeness** | % of `pending` statuses that eventually receive a terminal status (`success`, `failure`, `error`, `cancelled`) within 24 hours | ≥ 90% indicates healthy CI pipelines |
| **Landing request check coverage** | % of landing requests that have at least one commit status check before landing | Growing toward 100% for repos with required checks |
| **API vs CLI usage split** | Ratio of direct API calls to CLI-originated calls | Informational; expect API-heavy |
| **Time to first status** | Time from repository creation to first commit status being set | Shorter is better; indicates faster CI onboarding |

## Observability

### Structured Logging

| Log Event | Level | Structured Context |
|-----------|-------|--------------------|  
| Commit status created | `info` | `repository_id`, `status_id`, `context`, `status`, `commit_sha`, `change_id`, `caller_user_id`, `caller_token_id` |
| Commit status creation failed (validation) | `warn` | `repository_id` (if resolvable), `error`, `context` (if provided), `status` (if provided), `caller_ip` |
| Commit status creation failed (auth) | `warn` | `repository_owner`, `repository_name`, `error_code`, `caller_ip` |
| Commit status creation failed (not found) | `info` | `repository_owner`, `repository_name`, `caller_ip` |
| Commit status creation failed (rate limit) | `warn` | `repository_id`, `caller_user_id`, `caller_ip`, `limit`, `remaining` |
| Commit status creation failed (internal) | `error` | `repository_id`, `error`, `stack_trace`, `context`, `status`, `commit_sha` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_commit_status_created_total` | Counter | `status`, `auth_method` | Total commit statuses created, by status value and auth method |
| `codeplane_commit_status_create_errors_total` | Counter | `error_code` | Total failed creation attempts, by HTTP error code |
| `codeplane_commit_status_create_duration_seconds` | Histogram | — | Latency of status creation requests (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_commit_status_create_payload_bytes` | Histogram | — | Request body size in bytes (buckets: 64, 256, 512, 1024, 2048, 4096) |
| `codeplane_commit_status_rate_limited_total` | Counter | — | Total requests rejected by rate limiting |

### Alerts and Runbooks

#### Alert: High Commit Status Creation Error Rate

**Condition:** `rate(codeplane_commit_status_create_errors_total{error_code=~"5.."}[5m]) > 0.1`

**Severity:** Warning (P2)

**Runbook:**
1. Check structured logs for `error`-level commit status creation failures in the last 15 minutes.
2. Look for database connectivity issues — the most common cause is PG connection pool exhaustion.
3. Check if the `commit_statuses` table has grown unusually large (query `pg_stat_user_tables` for row count and dead tuples).
4. If the error is intermittent, check for lock contention on the `commit_statuses` table during concurrent writes.
5. If errors are isolated to a single repository, check for unusual write volume (a runaway CI pipeline).
6. Escalate to the database on-call if connection pool or table health issues are confirmed.

#### Alert: Commit Status Creation Latency Spike

**Condition:** `histogram_quantile(0.99, rate(codeplane_commit_status_create_duration_seconds_bucket[5m])) > 2.0`

**Severity:** Warning (P3)

**Runbook:**
1. Check database query latency — run `EXPLAIN ANALYZE` on the `createCommitStatus` query against the `commit_statuses` table.
2. Verify that indexes on `repository_id`, `commit_sha`, and `change_id` are present and not bloated.
3. Check if autovacuum is running or blocked on the `commit_statuses` table.
4. Look for concurrent long-running transactions that may be holding locks.
5. If latency is isolated to specific repositories, check the row count for those repositories' statuses.

#### Alert: Rate Limiting Spike

**Condition:** `rate(codeplane_commit_status_rate_limited_total[5m]) > 10`

**Severity:** Info (P4)

**Runbook:**
1. Identify the affected caller(s) from structured logs (`caller_user_id`, `caller_ip`, `repository_id`).
2. Determine if this is legitimate high-volume CI usage or potential abuse.
3. If legitimate, consider temporarily raising the per-repo rate limit for that repository or advising the user to batch status updates.
4. If abuse, consider IP-level blocking via the admin API.

#### Alert: Zero Commit Statuses Created (Canary)

**Condition:** `increase(codeplane_commit_status_created_total[1h]) == 0` (only fires during business hours if historically > 0)

**Severity:** Info (P4)

**Runbook:**
1. This is a canary alert — it fires when no statuses have been created for an hour during expected activity.
2. Verify the API server is healthy and accepting requests (`/health` endpoint).
3. Check if a recent deployment may have broken the commit status route (e.g., regression to 501 stub).
4. If the server is healthy, this may be expected during low-activity periods. Acknowledge and monitor.

### Error Cases and Failure Modes

| Error Case | HTTP Code | Behavior | Recovery |
|------------|-----------|----------|----------|
| Missing authentication | 401 | Request rejected before reaching service layer | Caller must provide valid token |
| Insufficient permissions | 403 | Request rejected after auth check | Caller needs write-scoped token |
| Repository not found | 404 | Request rejected after repo lookup | Caller must verify owner/repo slug |
| Invalid JSON body | 415 | Request rejected at middleware | Caller must send `Content-Type: application/json` |
| Invalid status enum value | 422 | Request rejected at validation | Caller must use valid status value |
| Rate limit exceeded | 429 | Request rejected with retry-after header | Caller should back off and retry |
| Database insert failure | 500 | Request fails, error logged | On-call investigates DB health |
| Database connection timeout | 500 | Request fails, error logged | Check connection pool, PG health |
| Malformed SHA (non-hex) | 400 | Request rejected at validation | Caller must provide valid hex SHA |

## Verification

### API Integration Tests

| Test ID | Test Description | Method |
|---------|-----------------|--------|
| API-SET-001 | Create a commit status with all fields populated returns 201 and complete response body | `POST /api/repos/:owner/:repo/statuses/:sha` |
| API-SET-002 | Create a commit status with only required fields (`context`, `status`) returns 201 | POST with minimal body |
| API-SET-003 | Create a commit status with `status: "pending"` succeeds | POST |
| API-SET-004 | Create a commit status with `status: "success"` succeeds | POST |
| API-SET-005 | Create a commit status with `status: "failure"` succeeds | POST |
| API-SET-006 | Create a commit status with `status: "error"` succeeds | POST |
| API-SET-007 | Create a commit status with `status: "cancelled"` succeeds | POST |
| API-SET-008 | Create a commit status with invalid `status: "invalid"` returns 422 | POST |
| API-SET-009 | Create a commit status with empty `context` returns 400 | POST |
| API-SET-010 | Create a commit status with `context` of 255 characters succeeds | POST |
| API-SET-011 | Create a commit status with `context` of 256 characters returns 400 | POST |
| API-SET-012 | Create a commit status with `context` containing special characters (`ci/build.lint-check_v2`) succeeds | POST |
| API-SET-013 | Create a commit status with `context` containing spaces returns 400 | POST |
| API-SET-014 | Create a commit status with `context` containing emoji returns 400 | POST |
| API-SET-015 | Create a commit status with `description` of 1024 characters succeeds | POST |
| API-SET-016 | Create a commit status with `description` of 1025 characters returns 400 | POST |
| API-SET-017 | Create a commit status with `description` containing Unicode text succeeds | POST |
| API-SET-018 | Create a commit status with `target_url` of 2048 characters (valid HTTPS URL) succeeds | POST |
| API-SET-019 | Create a commit status with `target_url` of 2049 characters returns 400 | POST |
| API-SET-020 | Create a commit status with `target_url: "javascript:alert(1)"` returns 400 | POST |
| API-SET-021 | Create a commit status with `target_url: "ftp://example.com"` returns 400 | POST |
| API-SET-022 | Create a commit status with a valid `change_id` stores and returns it | POST |
| API-SET-023 | Create a commit status without `change_id` stores `null` for change_id | POST |
| API-SET-024 | Create a commit status with `change_id` of 65 characters returns 400 | POST |
| API-SET-025 | Create two statuses with the same `context` on the same SHA — both stored, list returns both | POST + GET |
| API-SET-026 | Create statuses with different `context` values on the same SHA — all stored | POST + GET |
| API-SET-027 | Create a commit status on a non-existent repository returns 404 | POST |
| API-SET-028 | Create a commit status without authentication returns 401 | POST (no auth header) |
| API-SET-029 | Create a commit status with a read-only PAT returns 403 | POST |
| API-SET-030 | Create a commit status with a write-scoped PAT succeeds | POST |
| API-SET-031 | Create a commit status on a private repo by a non-member returns 404 | POST |
| API-SET-032 | Create a commit status with malformed SHA (non-hex chars) returns 400 | POST |
| API-SET-033 | Create a commit status with SHA shorter than 4 chars returns 400 | POST |
| API-SET-034 | Create a commit status with SHA of exactly 4 hex chars succeeds | POST |
| API-SET-035 | Create a commit status with SHA of exactly 64 hex chars succeeds | POST |
| API-SET-036 | Create a commit status with SHA of 65 hex chars returns 400 | POST |
| API-SET-037 | Create a commit status with non-JSON content type returns 415 | POST (text/plain body) |
| API-SET-038 | Create a commit status with empty JSON body `{}` returns 400 (missing required fields) | POST |
| API-SET-039 | Response `id` is a unique integer | POST |
| API-SET-040 | Response `created_at` and `updated_at` are valid ISO 8601 timestamps | POST |
| API-SET-041 | Response `commit_sha` matches the SHA from the URL path | POST |
| API-SET-042 | Rate limiting returns 429 after exceeding per-repo burst limit (100/min) | POST (repeated) |
| API-SET-043 | Rate-limited response includes `Retry-After` header | POST |
| API-SET-044 | Create 10 statuses concurrently on the same SHA — all succeed with unique IDs | POST (concurrent) |
| API-SET-045 | Create a commit status with `target_url` set to empty string succeeds (treated as no URL) | POST |

### CLI E2E Tests

| Test ID | Test Description |
|---------|------------------|
| CLI-SET-001 | `codeplane status create <sha> --context ci/build --status pending --description "Build running" --target-url https://ci.example.com/1` creates status and outputs confirmation |
| CLI-SET-002 | `codeplane status create <sha> --context ci/build --status success` with only required fields succeeds |
| CLI-SET-003 | `codeplane status create` with all five valid `--status` values succeeds |
| CLI-SET-004 | `codeplane status create` with `--status invalid` exits non-zero with descriptive error |
| CLI-SET-005 | `codeplane status create` without authentication exits non-zero with 401 error |
| CLI-SET-006 | `codeplane status create` with read-only token exits non-zero |
| CLI-SET-007 | `codeplane status create` with `--change-id` flag stores the change ID |
| CLI-SET-008 | `codeplane status create` on non-existent repo exits non-zero |
| CLI-SET-009 | `codeplane status create` with `--json` flag outputs full JSON response |
| CLI-SET-010 | `codeplane status create` without `--json` outputs human-readable confirmation |
| CLI-SET-011 | `codeplane status create` with `-R owner/repo` flag targets the correct repository |
| CLI-SET-012 | `codeplane status create` without `--context` flag exits non-zero with usage error |
| CLI-SET-013 | `codeplane status create` without `--status` flag exits non-zero with usage error |
| CLI-SET-014 | `codeplane status create` without `<sha>` argument exits non-zero with usage error |

### Playwright (Web UI) E2E Tests

| Test ID | Test Description |
|---------|------------------|
| UI-SET-001 | After creating a commit status via API, the landing request Checks tab displays the new status with correct context, state badge, and description |
| UI-SET-002 | Multiple statuses on the same change show as separate rows in the Checks tab, grouped by change |
| UI-SET-003 | Status badge shows correct color: green for success, red for failure/error, yellow for pending, grey for cancelled |
| UI-SET-004 | Target URL in the Checks tab row is a clickable link to the external system |
| UI-SET-005 | XSS payload in `description` field is rendered safely (HTML-escaped, not executed) |
| UI-SET-006 | Landing request summary shows aggregated check status (e.g., "2/3 checks passed") |

### Cross-Surface Integration Tests

| Test ID | Test Description |
|---------|------------------|
| INT-SET-001 | Create a status via API → list via CLI → verify the created status appears |
| INT-SET-002 | Create a status via CLI → list via API → verify the created status appears |
| INT-SET-003 | Create a status with `change_id` via API → list by `change_id` via CLI → verify status found |
| INT-SET-004 | Create a status via API → verify webhook delivery fires with event type `status` and correct payload |
| INT-SET-005 | Create a status on a landing request's head change → verify it appears in the landing request checks view |
