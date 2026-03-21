# ORG_DELETE

Specification for ORG_DELETE.

## High-Level User POV

When an organization has outlived its usefulness — the team has disbanded, the project has concluded, or the org was created by mistake — the organization owner needs a way to permanently remove it. Deleting an organization is the final action in the organization lifecycle. It is irreversible, and it removes the organization and all of its internal structures from Codeplane entirely.

Deleting an organization permanently removes the organization itself, all of its teams, all team memberships, all team-repository access grants, all organization memberships, all organization-scoped secrets, variables, and webhooks. Critically, **repositories owned by the organization are also deleted**. This means all repository data — code, bookmarks, changes, issues, landing requests, releases, wiki pages, workflows, and agent sessions associated with those repositories — is permanently destroyed. No member loses their Codeplane user account, but everyone in the organization loses their membership and any repository-level access that flowed through the organization or its teams.

Because the consequences of deleting an organization are so severe — potentially destroying multiple repositories and all of their associated data — the operation requires strong confirmation. In the web UI, the owner must type the organization's exact name to confirm. In the CLI, the user must pass a `--confirm <name>` flag that matches the organization's name. The API itself requires no confirmation body (the caller is assumed to be deliberate), but all higher-level clients enforce confirmation before making the API call.

Only the organization owner can delete the organization. Regular members, non-members, and unauthenticated users cannot trigger deletion. This is the same ownership boundary used for other sensitive operations like adding/removing members and managing teams.

From the user's perspective, the workflow is straightforward. An owner decides the organization is no longer needed. They initiate deletion from whichever surface they prefer — web, CLI, TUI, or API. They confirm their intent. The organization, its teams, its memberships, and its repositories disappear. The organization's name becomes available for reuse after deletion. The owner can verify it is gone by attempting to view it — they will receive a "not found" response.

This feature completes the organization lifecycle. Organizations can be created, configured, populated with members and teams, assigned repositories, and ultimately retired when they serve no further purpose. Without this capability, abandoned organizations clutter the system, occupy namespace, and create confusion about which groups are still active.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated organization owner can permanently delete an organization they own through the API, CLI, and Web UI — with all associated teams, memberships, team-repository grants, org-scoped secrets, variables, webhooks, and org-owned repositories cascaded-deleted, proper confirmation workflows enforced, ownership isolation maintained, and all edge cases below handled correctly.

### Functional Constraints

- [ ] The endpoint requires authentication. Unauthenticated requests return `401 Unauthorized`.
- [ ] Only users with the `owner` role in the specified organization may delete it. Members, non-members, and unauthenticated users receive `403 Forbidden`.
- [ ] The organization must exist. If the organization name does not resolve to a valid organization, the endpoint returns `404 Not Found`.
- [ ] The organization name in the URL path is resolved case-insensitively (via `lower_name`).
- [ ] Successful deletion returns `204 No Content` with an empty body.
- [ ] All `org_members` records for the deleted organization are removed. No user account is deleted.
- [ ] All `teams` belonging to the organization are removed.
- [ ] All `team_members` records for any team in the deleted organization are removed.
- [ ] All `team_repos` records for any team in the deleted organization are removed.
- [ ] All repositories where `org_id` matches the deleted organization are deleted, including all associated data (issues, landing requests, labels, milestones, releases, wiki pages, workflows, workflow runs, secrets, variables, webhooks, agent sessions, and on-disk repository storage).
- [ ] All organization-scoped secrets are deleted.
- [ ] All organization-scoped variables are deleted.
- [ ] All organization-scoped webhooks and their delivery records are deleted.
- [ ] Attempting to delete an already-deleted organization returns `404 Not Found` (the org no longer exists).
- [ ] An empty or whitespace-only `:org` path parameter returns `400 Bad Request` with message `"organization name is required"`.
- [ ] Organization names exceeding 255 characters return `404 Not Found` (no matching org will exist; this is enforced at creation time).
- [ ] Path-encoded special characters (e.g., `%2F`, `%00`) in the `:org` parameter result in `404 Not Found` or `400 Bad Request`.
- [ ] Concurrent deletion: if two concurrent delete requests target the same organization, exactly one should succeed with `204` and the other should return `404`.
- [ ] No cascade to user accounts: deleting an organization must not delete any user accounts.
- [ ] No cascade to other organizations: deleting an organization must not affect other organizations.
- [ ] No cascade to user-owned repositories: deleting an organization must not affect repositories owned by individual users (those with `org_id IS NULL`).
- [ ] Request body is ignored. Any body sent with the DELETE request must not cause an error.
- [ ] CLI `org delete` command outputs a JSON object with `status: "deleted"` and `name` fields on success.
- [ ] CLI exits with a non-zero exit code when the API returns an error.
- [ ] The organization name becomes available for reuse after deletion (a new org with the same name can be created).

### Boundary Constraints

- [ ] Organization name in URL path: must be a non-empty string, resolved case-insensitively via `lower_name`.
- [ ] Organization names: 1–39 characters after trimming, `[a-zA-Z0-9-]`, no leading/trailing hyphens, no consecutive hyphens (enforced at creation; deletion lookups simply return 404 for non-matching names).
- [ ] Organization names absolute maximum: 255 characters. Names longer than 255 return 404.
- [ ] Response body: `204 No Content` responses must have an empty body.
- [ ] The entire cascading delete (org + teams + memberships + repos) should execute atomically where feasible — either the org and all its children are deleted, or none are (transaction rollback on failure).

### Edge Cases

- [ ] **Organization with no members besides the owner**: Deleting works. Owner's membership is removed. Returns `204`.
- [ ] **Organization with many members**: All memberships are removed. No user accounts affected. Returns `204`.
- [ ] **Organization with no teams**: Deleting works. Returns `204`.
- [ ] **Organization with many teams (each having members and repos)**: All teams, team memberships, and team repo associations removed. Returns `204`.
- [ ] **Organization with no repositories**: Deleting works. Returns `204`.
- [ ] **Organization with many repositories**: All org-owned repositories and their associated data are deleted. Returns `204`.
- [ ] **Organization with active workflows running in its repositories**: Running workflows are cancelled/terminated before repository deletion. Returns `204`.
- [ ] **Organization with active workspaces in its repositories**: Active workspaces are cleaned up before repository deletion. Returns `204`.
- [ ] **Double-delete**: Delete an organization, then attempt to delete it again. First returns `204`, second returns `404`.
- [ ] **Delete then create same name**: After deletion, creating a new org with the same name succeeds with `201`.
- [ ] **Case mismatch in URL**: Creating `"AcmeCorp"` and deleting via `"acmecorp"` succeeds.
- [ ] **Empty JSON body sent with DELETE**: Ignored. Returns `204`.
- [ ] **Org with org-scoped secrets/variables/webhooks**: All removed on deletion.

## Design

### API Shape

**Endpoint**: `DELETE /api/orgs/:org`

**Path Parameters**:

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>`

**Request Body**: None. Any request body must be ignored.

**Response** (204 No Content):
- Empty body.
- No `Content-Type` header required.

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400    | Empty or whitespace-only `:org` parameter | `{ "error": "organization name is required" }` |
| 401    | Unauthenticated request | `{ "error": "authentication required" }` |
| 403    | Authenticated user is not org owner | `{ "error": "insufficient organization permissions" }` |
| 404    | Organization not found | `{ "error": "organization not found" }` |
| 500    | Database failure during deletion | `{ "error": "internal server error" }` |

**Cascading behavior**: The service layer must ensure all of the following are deleted as part of the operation:

1. All `team_repos` records for all teams in the organization
2. All `team_members` records for all teams in the organization
3. All `teams` records belonging to the organization
4. All `org_members` records for the organization
5. All org-scoped secrets, variables, and webhooks
6. All repositories where `org_id` matches the organization (including all repo-associated data: issues, landing requests, labels, milestones, releases, wiki, workflows, workflow runs, agent sessions, and on-disk repo storage)
7. The `organizations` row itself

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async deleteOrg(
  actor: User,
  orgName: string,
): Promise<Result<void, APIError>>
```

The service:
1. Validates that `actor` is authenticated (returns `401` if not).
2. Resolves the organization by `lower_name` case-insensitively (returns `404` if not found).
3. Verifies the actor holds the `owner` role in the organization (returns `403` if not).
4. Collects the list of all repositories owned by the organization.
5. For each org-owned repository, performs a full repository deletion (issues, landing requests, labels, milestones, releases, wiki, workflows, secrets, variables, webhooks, on-disk storage).
6. Deletes the organization row. Database cascading constraints remove associated `org_members`, `teams`, `team_members`, and `team_repos` records.
7. Returns `Result.ok(undefined)`.

### CLI Command

```
codeplane org delete <name> [--confirm <name>]
```

| Argument | Type   | Required | Description |
|----------|--------|----------|-------------|
| `name`   | string | Yes      | Organization name |

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--confirm` | string | | Organization name confirmation for non-interactive use |
| `--json` | boolean | `false` | Output result as JSON |

**Interactive behavior** (no `--confirm`):
```
⚠ You are about to delete organization "acme-corp".

This will permanently:
  • Delete the organization and all its settings
  • Remove all teams and team configurations
  • Remove all member associations (no user accounts are deleted)
  • DELETE ALL REPOSITORIES owned by the organization
  • Delete all issues, landing requests, releases, workflows, and wiki pages in those repositories

This action cannot be undone.

Type the organization name to confirm:
```

**Output** (success):
```json
{
  "status": "deleted",
  "name": "acme-corp"
}
```

**Output** (error): Standard CLI error output with non-zero exit code.

**Exit codes**: `0` = success, `1` = error.

**Note**: The current CLI implementation does not prompt for confirmation. The `--confirm` flag is a recommended enhancement. Until implemented, the CLI calls the API directly (consistent with `org team delete`).

### Web UI Design

**Status**: `Gated` — The organization settings UI surfaces are referenced in the feature inventory but not yet fully implemented. When implemented:

- **Delete button placement**: A "Delete organization" button appears at the bottom of the organization settings page (`/:org/settings`), in a "Danger zone" section, visible only to organization owners.
- **Confirmation dialog**: Clicking "Delete organization" opens a modal confirmation dialog with:
  - Title: "Delete organization?"
  - Body text: "This will permanently delete the organization **{org_name}**, all of its teams, all member associations, and **all repositories owned by this organization**. All repository data including issues, landing requests, releases, workflows, wiki pages, and agent sessions will be permanently destroyed. This action cannot be undone."
  - A prominent warning callout listing the number of repositories, teams, and members that will be affected (e.g., "This will delete 12 repositories, 4 teams, and 23 member associations").
  - A text input requiring the user to type the organization name exactly to confirm.
  - A red "Delete this organization" button (disabled until the organization name is typed correctly).
  - A "Cancel" button.
- **Post-deletion behavior**: On successful deletion, the user is redirected to their dashboard. A success toast notification appears: "Organization '{org_name}' has been deleted."
- **Error handling**: If the API returns an error, the modal remains open and displays an inline error message.
- **Loading state**: The "Delete this organization" button shows a spinner and is disabled while the API call is in flight.

### TUI UI

**Status**: `Gated` — No organization management screen exists yet in the TUI. When implemented:

- From the organization detail screen, pressing `D` (shift+d, to avoid accidental triggers) opens a confirmation prompt.
- The confirmation prompt displays: "Delete organization '{org_name}'? This will delete ALL org-owned repositories. Type the org name to confirm:"
- The user must type the org name correctly. On match, the TUI calls the API, displays "Organization deleted", and navigates back to the dashboard.
- On cancellation (Escape or incorrect name followed by Enter), the TUI returns to the organization detail screen.
- On error, the TUI displays the error message inline.

### Neovim Plugin API

When implemented, the Neovim plugin should expose:

```vim
:Codeplane org delete <name>
```

This calls the API and displays the result in the command line. A confirmation prompt ("Delete organization '<name>'? Type YES to confirm:") should be shown before executing.

### Documentation

The following documentation surfaces should cover organization deletion:

- **CLI reference** (`/cli-reference/commands#codeplane-org-delete`): Document the `org delete` command, its arguments, output shape, exit codes, and confirmation behavior. Include an example showing the full interactive flow.
- **API reference** (`/api-reference/orgs#delete-an-organization`): Document `DELETE /api/orgs/:org` — path parameters, authentication requirements, response codes, cascading behavior, and example `curl` invocation. Clearly explain that org-owned repositories are deleted.
- **Organizations guide** (`/guides/organizations#deleting-an-organization`): Explain the consequences of deletion, what data is removed, what data is preserved (user accounts), and the recommended workflow: transfer or archive important repositories before deleting the org. Include a pre-deletion checklist.
- **FAQ/Concepts** (if exists): Add an entry explaining that organization deletion is permanent, cannot be undone, and destroys all org-owned repositories. Recommend backing up or transferring repositories before proceeding.

## Permissions & Security

### Authorization Roles

| Role | Can delete the organization? | Notes |
|------|------------------------------|-------|
| Organization Owner | ✅ Yes | Full authority over org lifecycle |
| Organization Member | ❌ No | 403 Forbidden |
| Authenticated non-member | ❌ No | 403 Forbidden |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Security Rules

- Only `owner`-role members can delete an organization. The role check uses the same `requireOrgRole(org.id, actor.id, "owner")` pattern as other owner-restricted operations.
- The delete operation is scoped by organization ID. The actor must be a verified owner of the specific organization being deleted.
- Timing-safe comparison is not required for the org name lookup (case-insensitive name matching is not a secret).
- The deleted organization's name is revealed in the 204 response (via the CLI output), which is acceptable since the actor is the owner.

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- No special per-endpoint rate limit is required beyond the platform default, as deletion is infrequent and owner-restricted.
- A single user cannot be an owner of unbounded organizations, so the blast radius of scripted mass deletion is inherently limited.
- If abuse is detected (e.g., automated deletion of many orgs in rapid succession), the platform rate limiter will throttle the caller.

### Data Privacy

- The request contains only the organization name — not PII.
- The response is `204 No Content` — no data is returned.
- Deleted organization data (name, description, members, teams, repos) is hard-deleted from the database. There is no soft-delete or retention period. This is privacy-positive.
- All org-scoped secrets are permanently removed; no secret values persist.
- Audit logs (if implemented) should record the actor, organization name, organization ID, count of repositories deleted, count of members removed, and timestamp. The audit log itself is access-controlled.
- Repository data associated with the org is permanently destroyed. Users who had access to those repositories through org membership or team grants lose access immediately.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgDeleted` | A successful `204` response is returned | `org_id`, `org_name`, `actor_user_id`, `member_count` (at time of deletion), `team_count` (at time of deletion), `repo_count` (at time of deletion), `org_age_days` (days since `created_at`), `org_visibility`, `client` (`api`, `cli`, `web`, `tui`) |
| `OrgDeleteFailed` | A `4xx` or `5xx` response is returned | `org_name`, `actor_user_id` (if authenticated), `status_code`, `error_reason`, `client` |
| `OrgDeleteConfirmationAborted` | User cancels confirmation dialog or declines CLI prompt | `org_name`, `actor_user_id`, `surface` (`web`, `cli`, `tui`), `timestamp` |

### Funnel Metrics

- **Org deletion rate**: Number of organizations deleted per month as a fraction of total organizations. A healthy rate (1–5%) indicates active organizational hygiene. Near-zero suggests stale orgs accumulating; very high suggests churn or misuse.
- **Org lifespan distribution**: Histogram of `org_age_days` at deletion time. Helps identify whether orgs are being deleted prematurely (within hours, suggesting mistakes) or living too long (years without activity, suggesting stale structures).
- **Pre-deletion org size**: Distribution of `member_count`, `team_count`, and `repo_count` at deletion time. Deleting orgs with many repos is a high-impact event worth monitoring.
- **Delete failure rate**: Percentage of delete attempts that result in errors. Should be <2% (most failures are expected 401/403/404 responses).
- **Confirmation abort rate**: `OrgDeleteConfirmationAborted` events relative to total deletion attempts. Indicates confirmation UX quality (healthy range: 15–50%, given the severity of the action).
- **Client distribution**: Breakdown of org deletions by client surface (API, CLI, web, TUI).

### Success Indicators

- Org deletion API latency p50 < 500ms, p99 < 5s (higher than team delete due to repo cascading).
- Error rate < 1% of requests (excluding expected 401/403/404 responses).
- No orphaned `org_members`, `teams`, `team_members`, `team_repos`, or repositories exist after deletion (verified by periodic consistency checks).
- Confirmation abort rate between 15–50%.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Org delete request received | `info` | `org_name`, `actor_user_id`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Actor not org owner (403) | `info` | `org_name`, `actor_user_id`, `actor_role`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `request_id` |
| Empty org name (400) | `info` | `raw_org`, `request_id` |
| Beginning cascading deletion | `info` | `org_name`, `org_id`, `repo_count`, `team_count`, `member_count`, `actor_user_id`, `request_id` |
| Repository deletion started (per repo) | `info` | `org_name`, `org_id`, `repo_name`, `repo_id`, `request_id` |
| Repository deletion completed (per repo) | `info` | `org_name`, `org_id`, `repo_name`, `repo_id`, `duration_ms`, `request_id` |
| Organization deleted successfully | `info` | `org_name`, `org_id`, `actor_user_id`, `repos_deleted`, `teams_deleted`, `members_removed`, `total_duration_ms`, `request_id` |
| Unexpected error during org deletion | `error` | `org_name`, `org_id`, `actor_user_id`, `error_message`, `error_stack`, `cascade_step`, `request_id` |
| On-disk repo storage cleanup failed | `error` | `org_name`, `repo_name`, `repo_id`, `error_message`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_delete_requests_total` | counter | `status_code` | Total org delete requests |
| `codeplane_org_delete_duration_seconds` | histogram | — | Request duration (buckets: 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0) |
| `codeplane_org_delete_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `bad_request`, `internal`) | Error breakdown |
| `codeplane_orgs_deleted_total` | counter | — | Cumulative count of successfully deleted organizations |
| `codeplane_org_delete_repos_cascaded_total` | counter | — | Cumulative count of repositories deleted as part of org deletion |
| `codeplane_org_delete_cascade_duration_seconds` | histogram | `step` (`repos`, `teams`, `members`, `org_row`) | Duration of each cascade step |

### Alerts

#### Alert: `OrgDeleteHighErrorRate`
- **Condition**: `rate(codeplane_org_delete_errors_total{error_type="internal"}[5m]) > 0.01`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context containing `org_delete` or `deleteOrg`.
  2. Identify the `cascade_step` field to determine which phase of deletion is failing (repo deletion, team cleanup, org row removal).
  3. Verify database connectivity — run `SELECT 1` against the organizations table.
  4. Check if a specific organization is producing all errors (inspect `org_name` in logs).
  5. Check for foreign key constraint violations — this could indicate missing `ON DELETE CASCADE` constraints or circular references.
  6. Check for on-disk repository storage cleanup failures (filesystem permissions, disk space).
  7. Verify that the repository deletion service is functioning independently (try deleting a single repo directly).
  8. Check for recent deployments that may have altered the delete path.
  9. If the error is a query timeout, check `pg_stat_activity` for long-running transactions or locks.
  10. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgDeleteHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_delete_duration_seconds_bucket[5m])) > 30.0`
- **Severity**: Warning
- **Runbook**:
  1. Check the `codeplane_org_delete_cascade_duration_seconds` histogram to identify which cascade step is slow.
  2. Check if the org being deleted has an unusually large number of repositories (cascade delete of many repos with large issue/workflow histories can be slow).
  3. Check on-disk repository storage deletion times — large repos may take significant time to remove from the filesystem.
  4. Run `EXPLAIN ANALYZE` on the cascade delete queries to check for lock contention.
  5. Check database connection pool utilization and wait times.
  6. Inspect `pg_locks` for lock contention on `organizations`, `repositories`, or related tables.
  7. If isolated to a single large organization, this is expected behavior; consider adding progress streaming in a future iteration.

#### Alert: `OrgDeleteSpikeRate`
- **Condition**: `rate(codeplane_orgs_deleted_total[15m]) > 5` (more than 5 org deletions in 15 minutes)
- **Severity**: Warning
- **Runbook**:
  1. Determine if a single actor is responsible — check logs for `actor_user_id` patterns.
  2. Verify this is intentional (instance cleanup, migration) rather than a compromised owner account.
  3. Check how many repositories were cascaded-deleted via `codeplane_org_delete_repos_cascaded_total` to assess data loss magnitude.
  4. If suspicious, temporarily disable the actor's session and notify the admin team.
  5. Check if an automation script or CI pipeline is executing org cleanup.
  6. Review audit trail for the time period.

#### Alert: `OrgDeleteLargeRepoCascade`
- **Condition**: `increase(codeplane_org_delete_repos_cascaded_total[5m]) > 50` (more than 50 repos deleted via org cascading in 5 minutes)
- **Severity**: Info
- **Runbook**:
  1. Identify the org(s) deleted via structured logs.
  2. Verify the deletion was authorized by a legitimate owner.
  3. Confirm on-disk storage was properly cleaned up (check disk usage metrics).
  4. No action required if the deletion was intentional — this alert exists to surface high-impact events.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost mid-delete | 500 Internal Server Error; partial deletion may have occurred depending on transaction boundaries | Alert fires; check database health; verify org state; may require manual cleanup of partially-deleted data |
| CASCADE delete fails (constraint violation) | 500 Internal Server Error; transaction rollback preserves org | Investigate foreign key constraints; check migration state |
| On-disk repo storage deletion fails | Org is deleted from database; on-disk files may remain | `error`-level log; manual cleanup or scheduled GC sweep required |
| Concurrent delete of same org | One request returns 204, the other returns 404 | Both are correct responses; no intervention needed |
| Org with hundreds of repos (very large cascade) | Slow but successful deletion (may take 10–60 seconds) | Monitor latency; consider background job for very large orgs in future |
| Owner account compromised, org deleted | Org and all repos permanently deleted | Restore from backup; revoke compromised credentials; spike alert fires |
| Network timeout before response reaches client | Client sees a timeout; org may already be deleted server-side | Client should check org existence; if 404, deletion succeeded |
| Repository has active webhook deliveries in flight | Webhooks cancelled; in-flight deliveries may fail silently | No action needed; recipients will see delivery failures |

## Verification

### API Integration Tests

- **`test: returns 204 when org owner deletes an existing organization`** — Create org, delete org as owner, assert 204 with empty body.
- **`test: deleted org no longer appears in org view`** — Create org, delete org, attempt to view it, assert 404.
- **`test: returns 401 for unauthenticated request`** — Send DELETE with no session/token, assert 401.
- **`test: returns 403 when org member (non-owner) attempts deletion`** — Create org, add second user as member, authenticate as member, attempt delete, assert 403.
- **`test: returns 403 for authenticated user who is not an org member`** — Authenticate as a user with no org membership, attempt delete, assert 403.
- **`test: returns 404 for nonexistent organization`** — Attempt to delete org `"nonexistent-org-xyz"`, assert 404.
- **`test: returns 404 on second delete of same org (idempotency)`** — Create org, delete org (assert 204), delete same org again (assert 404).
- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", delete using "myorg" (lowercase), assert 204.
- **`test: returns 400 for empty org name`** — Send `DELETE /api/orgs/%20`, assert 400 with message containing `"organization name is required"`.
- **`test: org members are removed on deletion`** — Create org, add 3 members, delete org, verify members list returns 404 (org no longer exists).
- **`test: org teams are removed on deletion`** — Create org, create 2 teams with members and repos, delete org, verify team list returns 404.
- **`test: org-owned repositories are deleted on deletion`** — Create org, create 2 repos in org, delete org, verify repos return 404 when accessed by name.
- **`test: issues in org-owned repos are deleted`** — Create org, create repo, create issue, delete org, verify issue is gone.
- **`test: landing requests in org-owned repos are deleted`** — Create org, create repo, create landing request, delete org, verify landing request is gone.
- **`test: user accounts are preserved after org deletion`** — Create org, add user as member, delete org, verify user still exists and can log in.
- **`test: user-owned repositories are unaffected by org deletion`** — Create org, create user-owned repo, delete org, verify user repo still exists.
- **`test: other organizations are unaffected`** — Create org-a and org-b, delete org-a, verify org-b still exists with correct data.
- **`test: request body is ignored`** — Send DELETE with a JSON body `{ "unexpected": true }`, assert 204.
- **`test: org name with 39 characters resolves correctly`** (maximum valid length) — Create org with 39-character name, delete org, assert 204.
- **`test: org name with 256 characters returns 404`** (exceeds maximum) — Attempt delete with a 256-character org name, assert 404.
- **`test: path-encoded null byte in org name returns 400 or 404`** — Send `DELETE /api/orgs/my%00org`, assert 400 or 404.
- **`test: path-encoded slash in org name returns 400 or 404`** — Send `DELETE /api/orgs/my%2Forg`, assert 400 or 404.
- **`test: deleted org name becomes available for reuse`** — Create org "test-org", delete it, create new org "test-org", assert 201.
- **`test: org with no teams, no repos, no extra members deletes cleanly`** — Create org (only the creator/owner), delete it, assert 204.
- **`test: org with org-scoped secrets deletes cleanly`** — Create org, add secrets, delete org, assert 204, verify secrets are gone.
- **`test: org with org-scoped webhooks deletes cleanly`** — Create org, add webhooks, delete org, assert 204, verify webhooks are gone.

### Concurrent Deletion Tests

- **`test: concurrent delete of same org — one succeeds, one gets 404`** — Create org, fire two DELETE requests simultaneously, assert exactly one 204 and one 404 across the two responses.
- **`test: concurrent delete of org and team within org — no crash`** — Create org with team, fire DELETE on the org and DELETE on the team simultaneously, assert no 500 errors.

### CLI E2E Tests

- **`test: codeplane org delete <name> succeeds`** — Create org, run `org delete <name>`, assert exit code 0 and JSON output contains `"status": "deleted"`.
- **`test: deleted org is gone from org view`** — After CLI delete, run `org view <name>`, assert non-zero exit code (404).
- **`test: CLI outputs correct name field`** — Run delete, parse JSON output, assert `name` matches provided org name.
- **`test: CLI exits non-zero for nonexistent org`** — Run `org delete nonexistent`, assert non-zero exit code.
- **`test: CLI exits non-zero when name argument is omitted`** — Run `org delete` without a name, assert error output.
- **`test: CLI delete followed by re-delete returns error`** — Delete an org, then attempt to delete again, assert non-zero exit code on second attempt.
- **`test: CLI delete org with repos — repos are deleted`** — Create org with repo, delete org via CLI, verify repo is gone via `repo view`.

### Playwright Web UI E2E Tests (when org settings UI is implemented)

- **`test: delete org button visible only to org owners`** — Authenticate as member, navigate to org settings, assert "Delete organization" button is not visible. Switch to owner, assert button is visible.
- **`test: delete org button is in a danger zone section`** — Navigate to org settings as owner, assert "Delete organization" button is in a clearly demarcated danger zone area.
- **`test: delete org confirmation dialog appears on click`** — Click "Delete organization", assert modal with org name confirmation input appears.
- **`test: confirmation dialog shows impact summary`** — Open modal, assert it displays counts of repositories, teams, and members that will be deleted.
- **`test: delete button disabled until org name typed correctly`** — Open modal, assert delete button is disabled. Type wrong name, assert still disabled. Type correct name, assert enabled.
- **`test: successful deletion redirects to dashboard`** — Complete deletion flow, assert URL is the dashboard/home page.
- **`test: success toast appears after deletion`** — Complete deletion, assert toast notification with org name appears.
- **`test: deleted org absent from navigation after redirect`** — After deletion and redirect, assert the deleted org name is not in any sidebar or navigation list.
- **`test: cancel button closes modal without deleting`** — Open confirmation modal, click "Cancel", assert modal closes. Navigate away and back, assert org still exists.
- **`test: escape key closes modal without deleting`** — Open confirmation modal, press Escape, assert modal closes, org still exists.
- **`test: error message displayed in modal on API failure`** — Simulate API failure (e.g., network error), assert error message appears in modal and modal remains open.
- **`test: loading state during deletion`** — Intercept API call to delay, assert spinner on button, both buttons disabled during request.
- **`test: keyboard accessibility of confirmation dialog`** — Dialog navigable via Tab, Enter, Escape.
