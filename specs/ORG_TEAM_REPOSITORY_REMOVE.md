# ORG_TEAM_REPOSITORY_REMOVE

Specification for ORG_TEAM_REPOSITORY_REMOVE.

## High-Level User POV

When an organization owner decides that a team should no longer have access to a particular repository, they need a way to revoke that assignment cleanly and immediately. The **Remove Repository from Team** action lets an organization owner dissociate a repository from a team, effectively revoking whatever team-level access permissions that team previously held against that repository.

From the user's perspective, the flow is straightforward: navigate to the team's repository list (in the web UI, CLI, or TUI), identify the repository to remove, and confirm the removal. Once removed, the repository disappears from that team's repository list. The repository itself is unaffected — it is not deleted, its contents are untouched, and it remains accessible to other teams, org members, or anyone with direct repository-level permissions. Only the association between the specific team and the specific repository is severed.

This action is important for access hygiene. As organizations evolve — teams are restructured, projects wind down, or access policies tighten — owners need a reliable, auditable way to trim team-level repository scopes. The operation is intentionally idempotent: if the repository is already not assigned to the team, the system treats the request as successful rather than raising an error. This makes the action safe to call from automation, scripts, and agent-driven workflows without requiring pre-checks.

The removal is immediate and takes effect for all team members. No grace period or staged rollback exists — if the removal was a mistake, the owner simply re-adds the repository.

## Acceptance Criteria

### Functional Requirements

- [ ] An authenticated organization owner can remove a repository from a team by specifying the organization name, team name, repository owner, and repository name.
- [ ] Successful removal returns an empty response with HTTP 204 No Content status.
- [ ] The repository is immediately removed from the team's repository list after a successful call.
- [ ] The repository itself is not deleted, modified, or affected in any way — only the team-to-repository association is removed.
- [ ] Other team memberships and other team-to-repository associations are unaffected.
- [ ] The operation is idempotent: removing a repository that is not currently assigned to the team still returns 204 No Content.
- [ ] All identifier lookups (organization name, team name, repository owner, repository name) are case-insensitive.

### Authentication & Authorization

- [ ] Unauthenticated requests receive 401 Unauthorized.
- [ ] Authenticated users who are not organization owners receive 403 Forbidden.
- [ ] Organization members with non-owner roles (e.g., member) receive 403 Forbidden.

### Validation & Error Handling

- [ ] If the organization name path parameter is empty or missing, the request returns 400 Bad Request with message "organization name is required".
- [ ] If the team name path parameter is empty or missing, the request returns 400 Bad Request with message "team name is required".
- [ ] If the repository owner path parameter is empty or missing, the request returns 400 Bad Request with message "owner is required".
- [ ] If the repository name path parameter is empty or missing, the request returns 400 Bad Request with message "repository name is required".
- [ ] If the organization does not exist, the request returns 404 Not Found.
- [ ] If the team does not exist within the organization, the request returns 404 Not Found.
- [ ] If the repository does not exist, the request returns 404 Not Found.
- [ ] If the repository exists but does not belong to the organization, the request returns 422 Validation Failed with resource "TeamRepo", field "repository", code "invalid".

### Boundary Constraints

- [ ] Organization name: 1–40 characters, alphanumeric plus hyphens, case-insensitive lookup via `lower_name`.
- [ ] Team name (slug): 1–40 characters, alphanumeric plus hyphens, case-insensitive lookup via `lower_name`.
- [ ] Repository owner: 1–40 characters, alphanumeric plus hyphens, case-insensitive lookup.
- [ ] Repository name: 1–100 characters, alphanumeric plus hyphens/underscores/periods, case-insensitive lookup via `lower_name`.
- [ ] Path parameters containing only whitespace are treated as empty after trimming and return 400.

### Definition of Done

- [ ] API route `DELETE /api/orgs/:org/teams/:team/repos/:owner/:repo` is mounted and functional.
- [ ] SDK service method `removeTeamRepo` passes all acceptance criteria.
- [ ] CLI command `codeplane org team repo remove <org> <team> <repo>` invokes the API and handles success/error output.
- [ ] All error codes (400, 401, 403, 404, 422) are tested via integration/E2E tests.
- [ ] Idempotent removal (removing a non-assigned repo) is tested.
- [ ] The org-ownership validation for the repository is tested (repo exists but belongs to a different org).
- [ ] Telemetry event `team_repo_removed` fires on successful removal.
- [ ] Structured logs are emitted for the operation at `info` level.

## Design

### API Shape

```
DELETE /api/orgs/:org/teams/:team/repos/:owner/:repo
```

**Path Parameters:**

| Parameter | Type   | Required | Description                                       |
|-----------|--------|----------|---------------------------------------------------|
| `org`     | string | Yes      | Organization name (case-insensitive)               |
| `team`    | string | Yes      | Team slug (case-insensitive)                       |
| `owner`   | string | Yes      | Repository owner name (case-insensitive)           |
| `repo`    | string | Yes      | Repository name (case-insensitive)                 |

**Request Body:** None.

**Response:**

| Status | Body   | Condition                                                  |
|--------|--------|------------------------------------------------------------||
| 204    | Empty  | Repository successfully removed from team (or was not assigned) |
| 400    | JSON   | Missing or empty path parameter                            |
| 401    | JSON   | Not authenticated                                          |
| 403    | JSON   | Authenticated but not an organization owner                |
| 404    | JSON   | Organization, team, or repository not found                |
| 422    | JSON   | Repository does not belong to the organization             |

**Error Response Shape:**

```json
{
  "message": "string describing the error",
  "errors": [
    {
      "resource": "TeamRepo",
      "field": "repository",
      "code": "invalid"
    }
  ]
}
```

### SDK Shape

```typescript
async removeTeamRepo(
  actor: User,
  orgName: string,
  teamName: string,
  owner: string,
  repo: string,
): Promise<Result<void, APIError>>
```

**Behavior:**
1. Validate actor is authenticated (401 if null).
2. Resolve organization by name, case-insensitive (404 if not found).
3. Require actor has `owner` role in organization (403 if not).
4. Resolve team by name within organization, case-insensitive (404 if not found).
5. Resolve repository by owner and lower_name, case-insensitive (404 if not found).
6. Verify repository's `orgId` matches the resolved organization's `id` (422 if mismatch).
7. Execute `DELETE FROM team_repos WHERE team_id = $1 AND repository_id = $2`.
8. Return `Result.ok(undefined)` — the DELETE is idempotent regardless of whether a row existed.

### CLI Command

```
codeplane org team repo remove <org> <team> <repo>
```

**Arguments:**

| Argument | Type   | Required | Description                                   |
|----------|--------|----------|-----------------------------------------------|
| `org`    | string | Yes      | Organization name                              |
| `team`   | string | Yes      | Team slug                                      |
| `repo`   | string | Yes      | Repository in `OWNER/REPO` format              |

**Behavior:**
1. Parse `repo` argument using `resolveRepoRef()` to extract `owner` and `repo` components.
2. Issue `DELETE /api/orgs/{org}/teams/{team}/repos/{owner}/{repo}`.
3. On success (204), print JSON to stdout:
   ```json
   {
     "status": "removed",
     "org": "<org>",
     "team": "<team>",
     "repo": "<owner>/<repo>"
   }
   ```
4. On error, print the error response and exit with code 1.

**Example:**
```bash
$ codeplane org team repo remove acme backend-team acme/api-server
{"status":"removed","org":"acme","team":"backend-team","repo":"acme/api-server"}
```

### Web UI Design

**Location:** Organization → Team Settings → Repositories tab.

The team's repository list displays each assigned repository as a row. Each row shows the repository name (as `owner/repo`), a short description, and visibility badge (public/private). For organization owners, each row includes a "Remove" action.

**Remove flow:**
1. Owner clicks the "Remove" button (trash icon or text button) on a repository row.
2. A confirmation dialog appears: *"Remove **acme/api-server** from team **backend-team**? The repository will no longer be accessible through this team's permissions."*
3. On confirm, the UI issues the DELETE request.
4. On success, the row is removed from the list with a brief success toast: *"Repository removed from team."*
5. On error, the toast displays the error message from the API response.
6. If the team has no remaining repositories after removal, the UI shows an empty state: *"No repositories assigned to this team yet."*

**Note:** The web UI for team management is currently `Gated` (`ORG_TEAM_MANAGEMENT_UI` feature flag). This spec documents the intended behavior for when the flag is enabled.

### TUI Design

The TUI team detail screen includes a repositories section. When viewing a team's repositories:
1. Each repository row shows name, description, and visibility.
2. Pressing `d` or `Delete` on a highlighted repository opens a confirmation prompt.
3. On confirm, the TUI calls the API and removes the row from the list.
4. A status message appears at the bottom: "Repository removed from team."

**Note:** TUI team screens are not yet implemented. This spec documents intended behavior.

### Documentation

The following end-user documentation should be written:

- **CLI reference entry** for `codeplane org team repo remove` including synopsis, arguments, examples, and error table.
- **API reference entry** for `DELETE /api/orgs/:org/teams/:team/repos/:owner/:repo` including path parameters, response codes, error shapes, and example curl commands.
- **Team management guide section** explaining how to manage repository access through teams, including adding and removing repositories, with a note that removal is idempotent and does not delete the repository.

## Permissions & Security

### Authorization Matrix

| Role                        | Can Remove Repo from Team? |
|-----------------------------|---------------------------|
| Anonymous / Unauthenticated | No (401)                   |
| Authenticated, non-member   | No (403)                   |
| Organization Member         | No (403)                   |
| Organization Owner          | **Yes** (204)              |

### Rate Limiting

- Standard API rate limiting applies (same tier as other mutation endpoints).
- Per-user rate limit: 60 mutation requests per minute.
- Per-IP rate limit for unauthenticated requests: 10 requests per minute (to limit probing).
- No additional rate limiting is required beyond the global policy since this is a low-frequency administrative operation.

### Data Privacy

- No PII is exposed in the response body (204 returns empty body).
- Error responses reference entity names (org name, team name, repo name) that are already visible to the authenticated user through their membership context.
- Audit logs should record the actor's user ID, the organization, the team, and the repository identifiers. These logs are admin-visible only, not exposed to the general user.
- No secrets, tokens, or credentials are involved in this operation.

### Security Considerations

- The org-ownership validation (step 6 in the SDK behavior) prevents a user from probing whether arbitrary repositories exist by checking 422 vs 404. Since the actor must already be an org owner, they already have visibility into org repositories, so this does not leak information.
- Path parameters are trimmed and lowercased before lookup, preventing injection via case or whitespace manipulation.

## Telemetry & Product Analytics

### Business Events

| Event Name            | Trigger                                 | Properties                                                                                                     |
|-----------------------|-----------------------------------------|----------------------------------------------------------------------------------------------------------------|
| `team_repo_removed`   | Successful repository removal from team | `org_id`, `org_name`, `team_id`, `team_name`, `repository_id`, `repository_name`, `actor_id`, `timestamp`      |

### Funnel Metrics

| Metric                                  | Description                                                                                 |
|-----------------------------------------|---------------------------------------------------------------------------------------------|
| **Team repo remove attempts**           | Count of all DELETE requests to this endpoint (including errors).                            |
| **Team repo remove success rate**       | Ratio of 204 responses to total requests. Should be >95% in normal operation.               |
| **Team repo remove error distribution** | Breakdown of error codes (401, 403, 404, 422) to identify access or configuration issues.   |
| **Team repo churn**                     | Ratio of removals to additions per org per week. High churn may indicate UX or workflow issues. |
| **Time from add to remove**             | Duration between a repo being added to a team and being removed. Short durations may indicate mistakes or experimentation. |

### Success Indicators

- Successful removal events with no follow-up re-addition within 5 minutes (indicates intentional removal, not a mistake).
- Low 403 error rate (indicates users understand who has permission to manage team repos).
- The feature is used at all by active organizations (adoption signal).

## Observability

### Logging

| Log Point                        | Level  | Structured Context                                                                      |
|----------------------------------|--------|-----------------------------------------------------------------------------------------|
| Remove request received          | `debug`| `{ org, team, owner, repo, actorId, requestId }`                                        |
| Authorization check failed       | `warn` | `{ org, team, actorId, requiredRole: "owner", actualRole, requestId }`                   |
| Organization not found           | `info` | `{ org, requestId }`                                                                     |
| Team not found                   | `info` | `{ org, team, requestId }`                                                               |
| Repository not found             | `info` | `{ owner, repo, requestId }`                                                             |
| Repository not in organization   | `warn` | `{ org, orgId, owner, repo, repoOrgId, requestId }`                                     |
| Repository removed from team     | `info` | `{ org, orgId, team, teamId, owner, repo, repositoryId, actorId, requestId }`            |
| Unexpected error                 | `error`| `{ org, team, owner, repo, actorId, error, stack, requestId }`                           |

### Prometheus Metrics

| Metric                                          | Type      | Labels                           | Description                                              |
|-------------------------------------------------|-----------|----------------------------------|----------------------------------------------------------|
| `codeplane_team_repo_remove_total`              | Counter   | `org`, `status_code`             | Total remove requests by org and HTTP status code.       |
| `codeplane_team_repo_remove_duration_seconds`   | Histogram | `org`                            | Request duration for team repo removal.                  |
| `codeplane_team_repo_remove_errors_total`       | Counter   | `org`, `error_type`              | Total errors broken down by error type (auth, not_found, validation, internal). |

### Alerts

#### Alert: High Team Repo Remove Error Rate

**Condition:** `rate(codeplane_team_repo_remove_errors_total{error_type="internal"}[5m]) > 0.1`

**Severity:** Warning

**Runbook:**
1. Check server logs for `error`-level entries with context matching `removeTeamRepo`.
2. Verify database connectivity — internal errors most commonly stem from DB connection pool exhaustion or query timeouts.
3. Check `codeplane_team_repo_remove_duration_seconds` histogram for latency spikes.
4. If DB is healthy, inspect recent deployments for regressions in the org service or SQL query layer.
5. If the error is transient, monitor for self-recovery. If persistent, escalate to the platform team.

#### Alert: Unusual Remove Volume Spike

**Condition:** `rate(codeplane_team_repo_remove_total[5m]) > 10 * avg_over_time(rate(codeplane_team_repo_remove_total[5m])[1h:5m])`

**Severity:** Info

**Runbook:**
1. Check if a bulk automation or script is running team cleanup operations — this is likely benign.
2. Verify the actor IDs in recent logs to confirm operations are from legitimate org owners.
3. If suspicious, check for compromised PATs or session tokens associated with the actor.
4. If confirmed malicious, revoke the actor's sessions and tokens and notify the org owners.

### Error Cases and Failure Modes

| Error Case                             | HTTP Status | Error Message                                    | Recovery                                      |
|----------------------------------------|-------------|--------------------------------------------------|-----------------------------------------------|
| No authentication token/session        | 401         | "authentication required"                        | User must authenticate.                       |
| Actor is not org owner                 | 403         | "forbidden"                                      | Contact an org owner to perform the action.   |
| Organization not found                 | 404         | "organization not found"                         | Verify organization name spelling.            |
| Team not found in org                  | 404         | "team not found"                                 | Verify team slug spelling and org context.    |
| Repository not found                   | 404         | "repository not found"                           | Verify owner/repo spelling.                   |
| Repo exists but not in org             | 422         | Validation failed (resource: TeamRepo)           | Only org-owned repos can be managed.          |
| Database connection failure            | 500         | "internal server error"                          | Retry; check DB health.                       |
| Request timeout                        | 504         | Gateway timeout                                  | Retry; check query performance.               |

## Verification

### API Integration Tests

- [ ] **Happy path: Remove a repository from a team** — Create org, team, repo, add repo to team, call DELETE, verify 204, verify repo no longer in team repo list.
- [ ] **Idempotent removal: Remove a repo that is not assigned** — Create org, team, repo (but don't add it to team), call DELETE, verify 204.
- [ ] **Double removal: Remove the same repo twice** — Add repo to team, call DELETE twice, both should return 204.
- [ ] **401: Unauthenticated request** — Call DELETE without auth, verify 401.
- [ ] **403: Non-owner org member** — Authenticate as org member (not owner), call DELETE, verify 403.
- [ ] **403: Authenticated non-member** — Authenticate as a user not in the org, call DELETE, verify 403.
- [ ] **404: Organization does not exist** — Call with non-existent org name, verify 404.
- [ ] **404: Team does not exist** — Call with valid org but non-existent team, verify 404.
- [ ] **404: Repository does not exist** — Call with valid org and team but non-existent repo, verify 404.
- [ ] **422: Repository belongs to a different org** — Create repo in org-A, attempt to remove from team in org-B, verify 422.
- [ ] **422: Repository has no org (user-owned repo)** — Create user-owned repo, attempt to remove from team, verify 404 or 422.
- [ ] **Case-insensitive org name** — Create org "AcmeCorp", call DELETE with "acmecorp", verify 204.
- [ ] **Case-insensitive team name** — Create team "Backend-Team", call DELETE with "backend-team", verify 204.
- [ ] **Case-insensitive repo owner** — Call DELETE with uppercased owner, verify 204.
- [ ] **Case-insensitive repo name** — Call DELETE with uppercased repo name, verify 204.
- [ ] **400: Empty org name** — Call DELETE with empty org path param, verify 400.
- [ ] **400: Empty team name** — Call DELETE with empty team path param, verify 400.
- [ ] **400: Empty owner** — Call DELETE with empty owner path param, verify 400.
- [ ] **400: Empty repo name** — Call DELETE with empty repo path param, verify 400.
- [ ] **Whitespace-only parameters** — Call with org=" ", verify 400 or 404 after trim.
- [ ] **Verify other team associations preserved** — Add repo to team-A and team-B, remove from team-A, verify repo still in team-B.
- [ ] **Verify other repo associations preserved** — Add repo-1 and repo-2 to team, remove repo-1, verify repo-2 still in team.
- [ ] **Verify repo is not deleted** — Remove repo from team, verify repo still exists via repo GET.
- [ ] **Verify team membership is unaffected** — Remove repo from team, verify team members list unchanged.
- [ ] **Maximum length org name (40 chars)** — Create org with 40-char name, create team and repo, add and remove, verify 204.
- [ ] **Maximum length team name (40 chars)** — Create team with 40-char slug, add and remove repo, verify 204.
- [ ] **Maximum length repo name (100 chars)** — Create repo with 100-char name, add to team and remove, verify 204.
- [ ] **Org name exceeding max length (41 chars)** — Call DELETE with 41-char org name, verify 404 (org won't exist).
- [ ] **Special characters in team name (hyphens)** — Create team "my-cool-team", add/remove repo, verify 204.

### CLI E2E Tests

- [ ] **CLI happy path** — `codeplane org team repo remove <org> <team> <owner/repo>`, verify exit code 0 and JSON output `{ "status": "removed", "org": "...", "team": "...", "repo": "..." }`.
- [ ] **CLI with non-existent org** — Verify exit code 1 and error message.
- [ ] **CLI with non-existent team** — Verify exit code 1 and error message.
- [ ] **CLI with non-existent repo** — Verify exit code 1 and error message.
- [ ] **CLI idempotent removal** — Remove a repo not assigned, verify exit code 0.
- [ ] **CLI unauthorized** — Run without auth config, verify exit code 1 and 401 error.
- [ ] **CLI OWNER/REPO parsing** — Verify `resolveRepoRef` correctly splits "acme/api-server" into owner="acme" and repo="api-server".
- [ ] **CLI case-insensitive** — Pass uppercased org/team/repo, verify success.
- [ ] **CLI JSON output format** — Verify output is valid JSON with exactly the keys: `status`, `org`, `team`, `repo`.

### Playwright (Web UI) E2E Tests

> Note: These tests apply when `ORG_TEAM_MANAGEMENT_UI` feature flag is enabled.

- [ ] **Remove button visibility for owners** — Navigate to team repos page as org owner, verify "Remove" button is visible on each repo row.
- [ ] **Remove button hidden for non-owners** — Navigate as org member (non-owner), verify "Remove" button is not rendered.
- [ ] **Remove confirmation dialog** — Click "Remove", verify confirmation dialog appears with correct repo and team names.
- [ ] **Confirm removal** — Click "Confirm" in dialog, verify the repo row disappears from the list and success toast appears.
- [ ] **Cancel removal** — Click "Cancel" in dialog, verify repo row remains and no API call was made.
- [ ] **Empty state after last removal** — Remove the only repo from a team, verify empty state message is displayed.
- [ ] **Error toast on failure** — Simulate a 500 error, verify error toast is displayed with the error message.
