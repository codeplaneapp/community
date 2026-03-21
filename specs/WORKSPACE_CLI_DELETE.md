# WORKSPACE_CLI_DELETE

Specification for WORKSPACE_CLI_DELETE.

## High-Level User POV

When a developer is done with a cloud workspace — whether it was created for a quick experiment, an issue investigation, or a feature branch sandbox — they need a fast, unambiguous way to tear it down from the command line. The `codeplane workspace delete` command gives them exactly that.

A user invokes `codeplane workspace delete <workspace-id>` from any terminal, optionally specifying which repository the workspace belongs to with `--repo OWNER/REPO`. If they are inside a repository directory that has a Codeplane remote configured, the repo is detected automatically. Because deleting a workspace is destructive and irreversible — the underlying container is destroyed and any unsaved work inside the workspace is lost — the CLI requires the user to pass `--yes` to confirm the operation. When `--yes` is omitted, the CLI prints a warning describing what will be destroyed and exits with a non-zero code without performing the deletion.

On success, the CLI prints a concise confirmation message such as `Deleted workspace abc123` in human-readable mode, or returns `{"status":"deleted","id":"abc123"}` in JSON mode (when invoked with `--json`). The user's terminal returns immediately; the underlying VM teardown happens asynchronously on the server side.

This command is the standard way to clean up workspaces after use, and it works equally well from local terminals, CI pipelines, automation scripts, and editor-integrated terminal sessions. It is a building block in the broader workspace lifecycle: create → use → suspend/resume → delete.

## Acceptance Criteria

- **AC-1**: `codeplane workspace delete <id> --yes` deletes the specified workspace and returns exit code 0.
- **AC-2**: `codeplane workspace delete <id>` (without `--yes`) prints a warning message to stderr describing the destructive action, does NOT delete the workspace, and exits with a non-zero exit code.
- **AC-3**: The positional `<id>` argument is required. Omitting it produces a usage error with exit code 1.
- **AC-4**: Workspace ID must be a valid UUID or short-ID string (1–64 characters, alphanumeric plus hyphens). IDs exceeding 64 characters or containing disallowed characters produce a validation error.
- **AC-5**: `--repo OWNER/REPO` overrides automatic repository detection. Both `OWNER` and `REPO` segments must be non-empty and conform to Codeplane's existing slug constraints (1–255 characters, alphanumeric/hyphen/underscore/dot).
- **AC-6**: When `--repo` is omitted, the CLI resolves the repository from the current working directory's jj/git remote configuration. If resolution fails, the CLI prints a clear error and exits with code 1.
- **AC-7**: If the workspace ID does not exist or does not belong to the authenticated user within the resolved repository, the server returns 404 and the CLI prints `workspace not found` and exits with code 1.
- **AC-8**: The command works regardless of workspace status: `running`, `suspended`, `pending`, `starting`, `stopped`, or `failed`.
- **AC-9**: In `--json` mode, successful deletion returns `{"status":"deleted","id":"<workspace-id>"}`.
- **AC-10**: In default (human-readable) mode, successful deletion prints `Deleted workspace <workspace-id>`.
- **AC-11**: The command is idempotent from the user's perspective — deleting an already-stopped workspace succeeds; deleting a non-existent workspace returns 404.
- **AC-12**: The `--yes` flag must be explicitly provided as a boolean flag. It does not accept a value argument.
- **AC-13**: Authentication is required. An unauthenticated request returns a 401 error and the CLI prints an appropriate auth error message.
- **AC-14**: The command must complete within 30 seconds under normal operating conditions.

### Definition of Done

The feature is done when:
1. The CLI `workspace delete` command accepts `--yes` as a confirmation flag and refuses to delete without it.
2. All E2E tests pass, including the existing `workspaces.test.ts` test that uses `--yes`.
3. The server DELETE endpoint properly authorizes, validates, and destroys the workspace.
4. Human-readable and JSON output modes produce the correct output.
5. Error paths (missing ID, bad repo, 404, 401, timeout) produce clear error messages and non-zero exit codes.
6. CLI help text (`codeplane workspace delete --help`) accurately describes all arguments and options.

## Design

### CLI Command

**Command**: `codeplane workspace delete <id> [options]`

**Positional Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | The workspace ID to delete |

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--repo` | string | auto-detected | Repository in `OWNER/REPO` format |
| `--yes` | boolean | `false` | Skip confirmation prompt and proceed with deletion |

**Exit Codes**:

| Code | Meaning |
|------|--------|
| 0 | Workspace successfully deleted |
| 1 | Error: missing argument, validation failure, workspace not found, auth failure, or `--yes` not provided |

**Output Examples**:

Default mode:
```
Deleted workspace abc12345-def6-7890-ghij-klmnopqrstuv
```

Default mode (without `--yes`):
```
Error: Deleting workspace abc12345 is destructive and cannot be undone.
Pass --yes to confirm deletion.
```

JSON mode (`--json`):
```json
{"status":"deleted","id":"abc12345-def6-7890-ghij-klmnopqrstuv"}
```

Error — workspace not found:
```
Error: workspace not found
```

Error — no repo context:
```
Error: could not determine repository — pass --repo OWNER/REPO or run from inside a repository directory
```

### API Shape

**Endpoint**: `DELETE /api/repos/:owner/:repo/workspaces/:id`

**Authentication**: Required (session cookie or PAT).

**Path Parameters**:
- `owner` — repository owner slug
- `repo` — repository name slug
- `id` — workspace ID

**Success Response**: `204 No Content` (empty body)

**Error Responses**:

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{"message":"workspace id is required"}` | Missing or empty `:id` param |
| 401 | `{"message":"unauthorized"}` | No valid auth |
| 403 | `{"message":"forbidden"}` | User does not own the workspace and is not a repo admin |
| 404 | `{"message":"workspace not found"}` | Workspace does not exist or does not belong to user/repo |

### SDK Shape

The `WorkspaceService.deleteWorkspace(workspaceID, repositoryID, userID)` method:
1. Looks up the workspace scoped to the given repository and user.
2. If not found, returns silently (no-op).
3. Attempts to destroy the backing VM via the sandbox client (best-effort).
4. Updates workspace status to `stopped`.
5. Emits a workspace notification event.

### TUI UI

The TUI workspace detail screen should include a "Delete" action bound to a keyboard shortcut (e.g., `d` or `Ctrl+D`). When triggered:
1. A confirmation prompt is displayed inline: `Delete workspace <name>? (y/N)`.
2. On `y`, the workspace is deleted and the user is navigated back to the workspace list.
3. On `N` or `Esc`, the action is cancelled.

### Documentation

1. **CLI Reference — `workspace delete`**: A reference page documenting the command signature, all arguments, all options, output formats, exit codes, and usage examples. Include examples for both interactive (without `--yes`) and scripted (with `--yes`) usage.
2. **Workspace Lifecycle Guide**: Update the existing workspace lifecycle documentation to include deletion as the terminal state in the workspace lifecycle diagram: `create → running → suspend/resume → delete`.
3. **API Reference — DELETE workspace**: Document the REST endpoint, path parameters, auth requirements, response codes, and example `curl` invocation.

## Permissions & Security

### Authorization

| Role | Can Delete Own Workspaces | Can Delete Others' Workspaces |
|------|---------------------------|-------------------------------|
| Repository Owner | ✅ | ✅ |
| Repository Admin | ✅ | ✅ |
| Repository Member (Write) | ✅ | ❌ |
| Repository Member (Read) | ❌ | ❌ |
| Anonymous | ❌ | ❌ |

- The workspace service **must** verify that the requesting user either owns the workspace or has admin-level access to the repository.
- The server route handler **must** extract `repositoryID` and `userID` from authenticated middleware context (currently using placeholder `0` values — this is a known `Partial` gap that should be resolved).

### Rate Limiting

- The `DELETE /api/repos/:owner/:repo/workspaces/:id` endpoint should be subject to the platform's standard rate limiting middleware.
- Additional specific limit: **20 workspace deletions per user per hour**. This prevents bulk-deletion abuse while allowing normal cleanup patterns.

### Data Privacy

- Workspace deletion **must** destroy the backing VM and its filesystem. No user data from inside the workspace should persist after deletion.
- Workspace metadata (ID, name, timestamps, status) may be retained in the database for audit purposes, with status set to `stopped`.
- No PII is exposed in the API response (204 empty body).
- Workspace IDs in CLI output and logs are not PII but should not be logged alongside user tokens or secrets.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceDeleted` | Workspace successfully deleted | `workspace_id`, `repository_id`, `user_id`, `workspace_status_before_delete`, `workspace_age_seconds`, `was_forked`, `had_snapshots`, `deletion_source` (`cli`, `web`, `tui`, `api`) |
| `WorkspaceDeleteFailed` | Deletion attempt failed | `workspace_id`, `repository_id`, `user_id`, `error_type` (`not_found`, `forbidden`, `server_error`, `timeout`), `deletion_source` |
| `WorkspaceDeleteAborted` | User did not pass `--yes` | `workspace_id`, `deletion_source` (`cli`) |

### Funnel Metrics

- **Workspace lifecycle completion rate**: Percentage of created workspaces that eventually reach deletion (healthy cleanup behavior).
- **Deletion confirmation rate**: Percentage of CLI delete attempts that include `--yes` (measures whether users are learning the confirmation requirement).
- **Orphan workspace rate**: Percentage of workspaces older than 7 days that have not been deleted or suspended (measures cleanup discipline).
- **Mean time to delete**: Average time from workspace creation to deletion (measures workspace lifecycle length).

### Success Indicators

- > 80% of workspaces created are eventually deleted (not orphaned).
- < 1% of delete requests fail with server errors (5xx).
- CLI delete command p95 latency < 3 seconds.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|--------------------|-------------|
| Delete request received | `info` | `workspace_id`, `repository_id`, `user_id`, `request_id` | Server receives DELETE request |
| Workspace not found | `warn` | `workspace_id`, `repository_id`, `user_id`, `request_id` | Workspace lookup returned no result |
| VM destruction attempted | `info` | `workspace_id`, `vm_id`, `request_id` | Sandbox deleteVM call initiated |
| VM destruction failed | `warn` | `workspace_id`, `vm_id`, `error_message`, `request_id` | Sandbox deleteVM threw (best-effort) |
| VM destruction succeeded | `info` | `workspace_id`, `vm_id`, `request_id` | Sandbox deleteVM completed |
| Workspace status updated | `info` | `workspace_id`, `old_status`, `new_status`, `request_id` | DB status updated to `stopped` |
| Delete request completed | `info` | `workspace_id`, `duration_ms`, `request_id` | 204 response sent |
| Authorization denied | `warn` | `workspace_id`, `user_id`, `repository_id`, `request_id` | User not authorized to delete workspace |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_deletes_total` | counter | `status` (`success`, `not_found`, `forbidden`, `error`), `source` (`cli`, `web`, `tui`, `api`) | Total workspace delete attempts |
| `codeplane_workspace_delete_duration_seconds` | histogram | `status` | End-to-end delete request duration |
| `codeplane_workspace_vm_destroy_duration_seconds` | histogram | `status` (`success`, `error`, `skipped`) | Time to destroy backing VM |
| `codeplane_workspace_vm_destroy_errors_total` | counter | — | Best-effort VM destroy failures |
| `codeplane_workspaces_active` | gauge | `status` (`running`, `suspended`, `pending`, `starting`, `stopped`, `failed`) | Current workspace count by status |

### Alerts

**Alert 1: High workspace delete error rate**
- **Condition**: `rate(codeplane_workspace_deletes_total{status="error"}[5m]) / rate(codeplane_workspace_deletes_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for workspace delete errors filtered by `request_id`.
  2. Determine if errors are database-related (connection timeouts, deadlocks) or sandbox-related (VM API failures).
  3. If database: check PG connection pool saturation (`pg_stat_activity`), check for long-running transactions or locks.
  4. If sandbox: check sandbox/container runtime health, verify API connectivity, check sandbox client configuration.
  5. If isolated to specific workspaces: inspect workspace records for corrupted state (e.g., invalid `freestyle_vm_id`).
  6. Escalate to platform team if unresolved within 15 minutes.

**Alert 2: High VM destroy failure rate**
- **Condition**: `rate(codeplane_workspace_vm_destroy_errors_total[10m]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. VM destroy failures are currently best-effort and non-blocking — the workspace status is still updated to `stopped`.
  2. Check sandbox runtime logs for error patterns (auth failures, network issues, VM already terminated).
  3. Query for orphaned VMs: workspaces with status `stopped` but VMs still running in the sandbox runtime.
  4. If orphan count is growing: run a cleanup sweep using the background cleanup scheduler.
  5. If sandbox API is consistently failing: check sandbox credentials, endpoint configuration, and runtime health.

**Alert 3: Workspace delete latency spike**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_delete_duration_seconds_bucket[5m])) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Check if the latency is in the DB query phase or the VM destroy phase.
  2. If DB: check for table lock contention on the workspaces table, check query execution plans.
  3. If VM destroy: the sandbox runtime may be overloaded — check sandbox API response times.
  4. Consider whether the cleanup scheduler is running concurrent heavy operations.
  5. If sustained: consider adding a circuit breaker on the VM destroy call with a 5s timeout.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | HTTP Status | CLI Exit Code |
|------------|-------------------|-------------|---------------|
| Workspace ID not provided | Validation error | 400 | 1 |
| Workspace not found | Error message | 404 | 1 |
| User not authenticated | Auth error | 401 | 1 |
| User not authorized | Forbidden error | 403 | 1 |
| Database connection failure | Internal server error | 500 | 1 |
| Sandbox/VM destroy failure | Best-effort skip, workspace still marked stopped | 204 (success) | 0 |
| Network timeout (CLI to server) | Timeout error | N/A | 1 |
| `--yes` flag not provided | Abort with warning | N/A (no request made) | 1 |

## Verification

### CLI Integration Tests

| Test ID | Test Description | Input | Expected Outcome |
|---------|-----------------|-------|------------------|
| CLI-DEL-001 | Delete a running workspace with `--yes` | `workspace delete <id> --yes --repo OWNER/REPO --json` | Exit code 0, JSON output `{"status":"deleted","id":"<id>"}` |
| CLI-DEL-002 | Delete a suspended workspace with `--yes` | Suspend workspace first, then `workspace delete <id> --yes` | Exit code 0, successful deletion |
| CLI-DEL-003 | Delete without `--yes` flag | `workspace delete <id> --repo OWNER/REPO` | Exit code 1, stderr contains confirmation warning |
| CLI-DEL-004 | Delete with auto-detected repo context | Run from inside a repo directory: `workspace delete <id> --yes` | Exit code 0, repo resolved from local remote |
| CLI-DEL-005 | Delete with explicit `--repo` flag | `workspace delete <id> --yes --repo org/myrepo` | Exit code 0, uses explicitly provided repo |
| CLI-DEL-006 | Delete non-existent workspace | `workspace delete nonexistent-id --yes --repo OWNER/REPO` | Exit code 1, error message contains "not found" |
| CLI-DEL-007 | Delete without workspace ID argument | `workspace delete --yes --repo OWNER/REPO` | Exit code 1, usage error about missing argument |
| CLI-DEL-008 | Delete with invalid repo format | `workspace delete <id> --yes --repo "badformat"` | Exit code 1, error about invalid repo reference |
| CLI-DEL-009 | Delete in human-readable mode | `workspace delete <id> --yes --repo OWNER/REPO` (no `--json`) | Exit code 0, stdout contains `Deleted workspace <id>` |
| CLI-DEL-010 | Delete in JSON mode | `workspace delete <id> --yes --repo OWNER/REPO --json` | Exit code 0, valid JSON on stdout |
| CLI-DEL-011 | Delete when unauthenticated | `workspace delete <id> --yes` (no auth token) | Exit code 1, auth error message |
| CLI-DEL-012 | Verify workspace is gone after delete | Delete, then `workspace view <id>` | View returns exit code 1, workspace not found |
| CLI-DEL-013 | Delete workspace, verify not in list | Delete, then `workspace list` | Deleted workspace ID does not appear in list |
| CLI-DEL-014 | Delete with workspace ID at max length (64 chars) | `workspace delete <64-char-id> --yes` | Processes correctly (likely 404 since ID won't match, but no validation error) |
| CLI-DEL-015 | Delete with workspace ID exceeding max length | `workspace delete <65+ char string> --yes` | Exit code 1, validation error |
| CLI-DEL-016 | Delete a workspace in `failed` status | Create workspace that transitions to `failed`, then delete | Exit code 0, successful deletion |
| CLI-DEL-017 | Delete a workspace in `stopped` status | Stop workspace, then delete with `--yes` | Exit code 0, successful deletion (idempotent) |

### API Integration Tests

| Test ID | Test Description | Method/Path | Expected Response |
|---------|-----------------|-------------|-------------------|
| API-DEL-001 | Delete existing workspace | `DELETE /api/repos/owner/repo/workspaces/<id>` | 204 No Content |
| API-DEL-002 | Delete non-existent workspace | `DELETE /api/repos/owner/repo/workspaces/fake-id` | 204 or 404 |
| API-DEL-003 | Delete without authentication | `DELETE` (no auth) | 401 Unauthorized |
| API-DEL-004 | Delete workspace owned by another user | `DELETE` as different user | 403 Forbidden or 404 |
| API-DEL-005 | Delete with empty workspace ID | `DELETE /api/repos/owner/repo/workspaces/` | 400 or 404 (route mismatch) |
| API-DEL-006 | Delete with malformed repo owner | `DELETE /api/repos//repo/workspaces/<id>` | 404 (route mismatch) |
| API-DEL-007 | Verify 204 body is empty | `DELETE /api/repos/owner/repo/workspaces/<id>` | Response body is empty/null |
| API-DEL-008 | Delete idempotency — delete twice | DELETE same workspace ID twice | First: 204, Second: 204 (silent no-op) |
| API-DEL-009 | Rate limit enforcement | 25 DELETE requests in rapid succession | Requests after limit return 429 |

### E2E Playwright Tests (Web UI)

| Test ID | Test Description | Steps | Expected Outcome |
|---------|-----------------|-------|------------------|
| E2E-WEB-DEL-001 | Delete workspace from workspace list | Navigate to workspace list → click delete → confirm in modal | Workspace removed from list, success toast shown |
| E2E-WEB-DEL-002 | Delete workspace from workspace detail | Navigate to workspace detail → click delete → confirm | Redirected to workspace list, workspace gone |
| E2E-WEB-DEL-003 | Cancel deletion in confirmation modal | Click delete → click cancel in modal | Workspace unchanged, modal closes |

### E2E Full Lifecycle Tests

| Test ID | Test Description | Steps | Expected Outcome |
|---------|-----------------|-------|------------------|
| E2E-LIFE-001 | Full workspace lifecycle via CLI | Create → list (verify present) → suspend → resume → delete → list (verify absent) | All steps succeed, workspace cleanly removed |
| E2E-LIFE-002 | Create and immediately delete | `workspace create` → `workspace delete --yes` | Both succeed, no orphaned resources |
| E2E-LIFE-003 | Delete during workspace issue automation | Start `workspace issue` flow → delete workspace mid-flow | Delete succeeds, issue automation handles workspace loss gracefully |
