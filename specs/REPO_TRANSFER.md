# REPO_TRANSFER

Specification for REPO_TRANSFER.

## High-Level User POV

Repository transfer lets an owner move a repository from one account to another—either to a different personal user account or to an organization. This is one of the most consequential administrative actions on a repository, so it lives in the "Danger Zone" of repository settings alongside archive and delete.

When a repository owner decides to transfer their repository, they specify the new owner by username or organization name. Codeplane validates that the target account exists, that the actor has the right to transfer into that account, and that no naming collision would result. If all checks pass, the repository instantly moves to the new owner. Its URL changes, all existing clone URLs become invalid, all direct collaborators are removed, and all team-level access grants are cleared. The actor sees the repository under its new home and can share the updated URL with their team.

Transfer is an intentionally high-friction operation. In the CLI, it requires an explicit `--yes` confirmation flag (or an interactive prompt in supported terminals). In the TUI, it requires the user to type the new owner's name into a confirmation prompt. In the web UI, the transfer button lives inside a visually distinct red-bordered Danger Zone section of repository settings, requiring confirmation before execution.

The value of repository transfer is straightforward: organizations evolve, ownership changes, and projects move between personal and organizational contexts. Rather than forcing users to re-create repositories and lose history, transfer preserves the full repository—its code, issues, landing requests, workflows, labels, milestones, wiki, releases, secrets, variables, webhooks, and all other associated data—under the new owner in a single atomic operation.

Importantly, Codeplane does not currently create redirects from the old URL to the new one. After transfer, the old `owner/repo` path returns a 404. Users and any automation referencing the old path must update their references manually. This is a known product decision that should be clearly communicated during the transfer confirmation flow.

## Acceptance Criteria

### Definition of Done

- [ ] A repository owner can transfer a repository to another user account via API, CLI, TUI, and web UI
- [ ] A repository owner can transfer a repository to an organization (where they are an org owner) via all clients
- [ ] All existing collaborators are removed on transfer
- [ ] All team-repository associations are removed on transfer
- [ ] The repository is accessible at the new `owner/repo` URL immediately after transfer
- [ ] The old `owner/repo` URL returns 404 after transfer
- [ ] The API returns the updated repository object with the new owner reflected
- [ ] All clients show a confirmation step before executing the transfer
- [ ] Feature flags `REPO_TRANSFER` and `CLI_REPO_TRANSFER` gate the feature appropriately
- [ ] E2E tests covering all happy paths and error paths pass

### Input Validation Constraints

- [ ] `new_owner` must be a non-empty string after trimming whitespace
- [ ] `new_owner` must not equal the current owner (case-insensitive comparison)
- [ ] `new_owner` must match an existing user or organization name in the system
- [ ] `new_owner` is constrained to valid username/org name characters: `/^[a-zA-Z0-9_-]+$/` (per TUI spec); maximum 40 characters for TUI input; maximum 255 characters at the server/org service layer
- [ ] Repository name must not collide with an existing repository under the target owner (case-insensitive name comparison)
- [ ] The request body must be valid JSON with a `new_owner` string field; empty body or missing field returns a 400/422 validation error

### Edge Cases

- [ ] Transferring to the same owner (any casing) returns a validation error, not a no-op
- [ ] Transferring to a user who already has a repo with the same name returns 409 Conflict
- [ ] Transferring to an org that already has a repo with the same name returns 409 Conflict
- [ ] Transferring to a non-existent user or org returns 404 Not Found
- [ ] Transferring to an org where the actor is a member but not an owner returns 403 Forbidden
- [ ] Transferring to an org where the actor is not a member at all returns 403 Forbidden
- [ ] Attempting transfer as a collaborator (not owner) returns 403 Forbidden
- [ ] Attempting transfer as an unauthenticated user returns 401 Unauthorized
- [ ] Transferring an archived repository succeeds (archive status is preserved)
- [ ] Transferring a repository with active webhooks preserves the webhooks under the new owner
- [ ] Transferring a repository with secrets and variables preserves them under the new owner
- [ ] Transferring a forked repository succeeds (fork metadata is preserved)
- [ ] `new_owner` with leading/trailing whitespace is trimmed before validation
- [ ] Submitting `new_owner` as an empty string after trimming returns a validation error
- [ ] Submitting `new_owner` as null or undefined returns a validation error
- [ ] CLI without `--yes` flag in non-interactive mode fails with a non-zero exit code
- [ ] Transfer from a user-owned repo to a user works (clears org_id, sets user_id)
- [ ] Transfer from an org-owned repo to a user works (clears org_id, sets user_id) — requires actor to be org owner
- [ ] Transfer from a user-owned repo to an org works (sets org_id, clears user_id)
- [ ] Transfer from an org-owned repo to a different org works (updates org_id) — requires actor to be owner of both orgs
- [ ] Concurrent transfer requests for the same repo are handled safely by the database unique constraint

### Boundary Constraints

- [ ] Repository name: max 100 characters, must match `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`, must not end in `.git`
- [ ] Owner/org name: max 255 characters at the service layer
- [ ] TUI owner input: max 40 characters, validated against `/^[a-zA-Z0-9_-]+$/`
- [ ] Request body JSON: must be parseable; malformed JSON returns 400

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/transfer`

**Authentication:** Required (session cookie, PAT, or OAuth token)

**Request Body:**
```json
{
  "new_owner": "target-username-or-org"
}
```

**Success Response (200):**
```json
{
  "id": 42,
  "name": "my-repo",
  "full_name": "new-owner/my-repo",
  "owner": "new-owner",
  "description": "...",
  "private": false,
  "archived": false,
  "default_bookmark": "main",
  "clone_url": "git@codeplane.example:new-owner/my-repo.git",
  "topics": [],
  "created_at": "...",
  "updated_at": "..."
}
```

**Error Responses:**

| Status | Condition | Body Shape |
|--------|-----------|------------|
| 400 | Missing or empty `new_owner`, or malformed JSON body | `{ "message": "...", "errors": [...] }` |
| 401 | Not authenticated | `{ "message": "authentication required" }` |
| 403 | Not repo owner, or not owner of target org | `{ "message": "permission denied" }` or `{ "message": "must be an owner of the target organization" }` |
| 404 | Repo not found, or target user/org not found | `{ "message": "user or organization 'X' not found" }` |
| 409 | Name collision at target | `{ "message": "user 'X' already has a repository named 'Y'" }` |
| 422 | Transferring to same owner | `{ "message": "...", "errors": [{ "resource": "Repository", "field": "new_owner", "code": "invalid" }] }` |
| 500 | Internal database failure | `{ "message": "failed to transfer repository" }` |

### CLI Command

**Command:** `codeplane repo transfer <OWNER/REPO> --to <NEW_OWNER> [--yes] [--json]`

**Arguments:**
- `repo` (positional, required): Repository reference in `OWNER/REPO` format

**Options:**
- `--to` (required): New owner username or organization name. Aliased as `--new-owner` for backwards compatibility.
- `--yes` (optional): Skip interactive confirmation prompt. Required in non-interactive environments.
- `--json` (optional): Output the full repository JSON response instead of a human-readable message.

**Interactive Behavior:**
- Without `--yes`, the CLI should prompt: `Transfer OWNER/REPO to NEW_OWNER? This will remove all collaborators and team access. Type "yes" to confirm:`
- In non-interactive mode (no TTY), absence of `--yes` causes the command to exit with a non-zero exit code and a message directing the user to pass `--yes`.

**Human-readable Output:**
```
Transferred owner/my-repo to new-owner
```

**JSON Output:** Full `RepoResponse` object as returned by the API.

**Error Output:** Non-zero exit code on any error. Human-readable error message to stderr.

### TUI UI

**Location:** Repository Settings screen → Danger Zone section

**Interaction Flow:**
1. User navigates to repository → Settings tab (tab 6)
2. Scrolls to the Danger Zone section (red-bordered)
3. Focuses on "Transfer ownership" action and presses Enter
4. An inline prompt appears: "New owner:" with a text input field
   - Input limited to 40 characters
   - Validated against `/^[a-zA-Z0-9_-]+$/` as the user types
   - Invalid characters are rejected or the input field shows an error indicator
5. User types the target owner name and presses Enter
6. A confirmation prompt appears: "Transfer OWNER/REPO to NEW_OWNER? All collaborators and team access will be removed. (y/n)"
7. On "y": the transfer API is called
   - Success: screen navigates to the new repository URL, breadcrumb updates
   - Error: inline error message displayed (403 → "Owner access required", 404 → "User not found", 409 → "Target already has a repository named 'REPO'", 400 → "Cannot transfer to yourself")
8. On "n" or Esc: prompt dismissed, no action taken

**Data Hook:** `useTransferRepo()` from `@codeplane/ui-core` — calls `POST /api/repos/:owner/:repo/transfer` with `{ new_owner: string }`.

### Web UI Design

**Location:** Repository Settings page → Danger Zone section

**Visual Design:**
- The Danger Zone section appears at the bottom of the repository settings page
- It is visually distinct with a red/destructive border and header
- Transfer ownership is one of several actions in this section (alongside archive and delete)

**Transfer Action Card:**
- Header: "Transfer ownership"
- Description: "Transfer this repository to another user or organization. All collaborators and team access will be removed."
- Action button: "Transfer" (destructive/red variant)

**Confirmation Modal:**
- Title: "Transfer repository"
- Body: "This will transfer **OWNER/REPO** to a new owner. All direct collaborators will be removed. All team access will be removed. The repository URL will change."
- Input field: "New owner" — text input for the target username or org name
- Input validation: shows inline error if the field is empty
- Confirm button: "I understand, transfer this repository" (destructive/red variant, disabled until input is non-empty)
- Cancel button: "Cancel"
- On success: redirect to the new repository URL (`/NEW_OWNER/REPO`)
- On error: display the API error message inline in the modal without closing it

### SDK Shape

The `RepoService` in `@codeplane/sdk` exposes:

```typescript
transferRepo(
  actor: RepoActor | null,
  owner: string,
  repo: string,
  newOwner: string
): Promise<Result<RepoRow, APIError>>
```

This is the single authoritative service method. All route handlers and clients delegate to this method.

### Editor Integrations

Repository transfer is not expected to be a common editor workflow. No specific VS Code or Neovim commands are required for transfer. Users should use the CLI, TUI, or web UI for this operation.

### Documentation

The following end-user documentation should be provided:

1. **Repository Transfer Guide** — A how-to page covering:
   - What repository transfer does (moves ownership)
   - What is preserved (code, issues, landings, workflows, labels, milestones, wiki, releases, secrets, variables, webhooks)
   - What is removed (collaborators, team access)
   - What changes (URL, clone URL)
   - What does NOT happen (no redirect from old URL)
   - Step-by-step instructions for web UI, CLI, and TUI
   - Required permissions (repo owner; org owner if transferring to org)

2. **CLI Reference** — `codeplane repo transfer` command documentation with synopsis, arguments, options, examples for user-to-user, user-to-org, and org-to-org transfers, error messages and troubleshooting

3. **API Reference** — `POST /api/repos/:owner/:repo/transfer` endpoint documentation with request/response schemas, error codes and their meanings, authentication requirements

## Permissions & Security

### Authorization Matrix

| Actor Role | Can Transfer? | Notes |
|---|---|---|
| Repository Owner (user) | ✅ Yes | Full ownership required via `canOwnRepo` |
| Repository Owner (org member with "owner" role) | ✅ Yes | Must be owner of the org that owns the repo |
| Org Admin (non-owner role) | ❌ No | Only org owners can transfer org repos |
| Org Member | ❌ No | Insufficient permissions |
| Repository Collaborator (write/admin) | ❌ No | Collaborators cannot transfer |
| Repository Collaborator (read-only) | ❌ No | Insufficient permissions |
| Authenticated user (no relation to repo) | ❌ No | Not the repo owner |
| Unauthenticated | ❌ No | Returns 401 |

### Cross-Owner Transfer Authorization

When transferring to an **organization**, the actor must additionally be an **owner** of that target organization. Being a member with any other role is insufficient. This prevents users from transferring repositories into organizations they do not control.

When transferring to another **user**, only the current repository owner can initiate the transfer. There is no acceptance/confirmation step on the receiving user's end in the current implementation. The transfer is immediate and unilateral from the sender's perspective.

### Rate Limiting

- Transfer endpoint should be rate-limited to **5 requests per hour per user** to prevent abuse or accidental rapid transfers
- Failed transfer attempts (4xx errors) should still count against the rate limit
- The rate limit should be applied per authenticated user, not per repository

### Data Privacy Constraints

- The transfer operation does not expose any PII beyond what is already visible in the repository's public profile
- Transfer preserves repository secrets and variables — the new owner inherits access to these secrets. This is intentional but should be clearly communicated in the confirmation flow
- Webhook URLs are preserved on transfer — the new owner inherits any configured webhook endpoints, which may point to third-party services. This should be documented
- Transfer activity should be visible in the actor's activity feed but should not expose the contents of secrets, variables, or webhook URLs

### Security Considerations

- Transfer is not reversible through the API. If a mistake is made, a second transfer back to the original owner must be performed
- The cleanup of collaborators and team repos is a security feature: it ensures the new owner starts with a clean access slate and must explicitly re-grant access
- Deploy keys on the repository should be preserved (they are scoped to the repo, not the owner)

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `repo.transferred` | Successful repository transfer | `repo_id`, `repo_name`, `from_owner`, `from_owner_type` (user|org), `to_owner`, `to_owner_type` (user|org), `actor_id`, `client` (web|cli|tui|api), `collaborators_removed_count`, `team_repos_removed_count`, `timestamp` |
| `repo.transfer_failed` | Failed transfer attempt | `repo_id`, `repo_name`, `from_owner`, `to_owner`, `actor_id`, `error_code` (401|403|404|409|422|500), `error_reason`, `client`, `timestamp` |
| `repo.transfer_confirmed` | User confirmed the transfer prompt (CLI/TUI/Web) | `repo_id`, `from_owner`, `to_owner`, `client`, `timestamp` |
| `repo.transfer_cancelled` | User cancelled the transfer prompt | `repo_id`, `from_owner`, `to_owner`, `client`, `timestamp` |

### Funnel Metrics

1. **Transfer Initiation Rate**: How many users click/invoke the transfer action per week
2. **Transfer Confirmation Rate**: Of those who initiate, how many confirm (measures friction level)
3. **Transfer Success Rate**: Of those who confirm, how many succeed (measures validation/error quality)
4. **Transfer Error Distribution**: Breakdown of error codes for failed transfers (informs UX improvements)
5. **Transfer Direction Distribution**: User→User vs. User→Org vs. Org→User vs. Org→Org (informs product direction)
6. **Post-Transfer 404 Rate**: How often the old `owner/repo` path is requested after transfer (informs whether to implement redirects)

### Success Indicators

- Transfer success rate ≥ 90% of confirmed attempts (high success rate means good validation UX)
- Post-transfer 404 rate stabilizes or decreases over time (means users are updating their references)
- Low support ticket rate related to "lost" repositories after transfer
- Transfer feature is used at least monthly by active organizations (indicates the feature is discoverable and useful)

## Observability

### Structured Logging

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| `repo.transfer.initiated` | `info` | `{ repo_id, repo_name, from_owner, to_owner, actor_id }` | Transfer request received and validated |
| `repo.transfer.completed` | `info` | `{ repo_id, repo_name, from_owner, to_owner, to_owner_type, actor_id, duration_ms, collaborators_removed, teams_removed }` | Transfer completed successfully |
| `repo.transfer.failed` | `warn` | `{ repo_id, repo_name, from_owner, to_owner, actor_id, error_code, error_message }` | Transfer failed with a known error |
| `repo.transfer.collaborators_cleaned` | `info` | `{ repo_id, count }` | Collaborators deleted as part of transfer |
| `repo.transfer.team_repos_cleaned` | `info` | `{ repo_id, count }` | Team repo associations deleted as part of transfer |
| `repo.transfer.db_error` | `error` | `{ repo_id, error_type, error_message, stack }` | Unexpected database error during transfer |
| `repo.transfer.unique_violation` | `warn` | `{ repo_id, to_owner, repo_name }` | Name collision caught by DB unique constraint (race condition) |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_repo_transfer_total` | Counter | `status` (success|error), `error_code`, `direction` (user_to_user|user_to_org|org_to_user|org_to_org) | Total transfer attempts |
| `codeplane_repo_transfer_duration_seconds` | Histogram | `status`, `direction` | Time taken for the full transfer operation (including cleanup) |
| `codeplane_repo_transfer_collaborators_removed_total` | Counter | — | Total collaborators removed across all transfers |
| `codeplane_repo_transfer_team_repos_removed_total` | Counter | — | Total team-repo associations removed across all transfers |
| `codeplane_repo_transfer_errors_total` | Counter | `error_code` (401|403|404|409|422|500) | Transfer errors by type |

### Alerts

#### Alert: High Transfer Failure Rate
- **Condition:** `rate(codeplane_repo_transfer_errors_total{error_code="500"}[15m]) > 0.1`
- **Severity:** Critical
- **Runbook:**
  1. Check structured logs for `repo.transfer.db_error` entries in the last 15 minutes
  2. Verify database connectivity: run `SELECT 1` against the primary database
  3. Check if the `repositories` table has any lock contention: query `pg_stat_activity` for blocked queries
  4. Check if any recent migrations have altered the `repositories`, `collaborators`, or `team_repos` tables
  5. If database is healthy, check for application-level errors in the transfer service stack trace
  6. If error rate is isolated to a single repo, check for data integrity issues on that repo row
  7. Escalate to the platform team if database infrastructure issues are suspected

#### Alert: Transfer Duration Spike
- **Condition:** `histogram_quantile(0.95, rate(codeplane_repo_transfer_duration_seconds_bucket[15m])) > 5`
- **Severity:** Warning
- **Runbook:**
  1. Check if the spike correlates with overall database latency (check `pg_stat_activity`)
  2. Review `repo.transfer.collaborators_cleaned` and `repo.transfer.team_repos_cleaned` logs — a repo with thousands of collaborators could legitimately take longer
  3. Check if there are concurrent transfers happening on the same repo (race condition scenario)
  4. If latency is systemic (not isolated to one transfer), check database connection pool utilization
  5. Consider whether the `deleteCollaboratorsByRepo` or `deleteTeamReposByRepo` queries need index optimization

#### Alert: Unusual Transfer Volume
- **Condition:** `increase(codeplane_repo_transfer_total{status="success"}[1h]) > 50`
- **Severity:** Warning
- **Runbook:**
  1. Verify whether this is a legitimate organizational migration (e.g., company renaming, team restructuring)
  2. Check if transfers are coming from a single actor — could indicate automation or abuse
  3. Review the rate limiter: confirm it is active and the per-user limits are being enforced
  4. If transfers are from multiple actors targeting a single org, confirm the org owner initiated or approved
  5. If suspicious, temporarily increase rate limits or disable the feature flag while investigating

#### Alert: Elevated 403 Error Rate on Transfer
- **Condition:** `rate(codeplane_repo_transfer_errors_total{error_code="403"}[1h]) > 1`
- **Severity:** Info
- **Runbook:**
  1. This is usually benign — users attempting to transfer repos they don't own
  2. Check if there's a pattern: same actor repeatedly getting 403s could indicate a confused user or a permissions misconfiguration
  3. If a single actor is generating many 403s, check their org membership roles
  4. No immediate action needed unless the pattern suggests a broken client or permission model bug

### Error Cases and Failure Modes

| Error Case | HTTP Status | Log Level | Recovery |
|---|---|---|---|
| Unauthenticated request | 401 | `debug` | Client should prompt for login |
| Actor is not repo owner | 403 | `info` | No recovery; user lacks permission |
| Actor is not target org owner | 403 | `info` | User must be promoted to org owner first |
| Target user/org not found | 404 | `info` | User must correct the target name |
| Name collision at target | 409 | `info` | User must rename the existing repo at the target first |
| Transfer to self | 422 | `info` | Client-side validation should prevent this |
| Empty new_owner | 400 | `info` | Client-side validation should prevent this |
| Malformed JSON body | 400 | `info` | Client bug; fix the client |
| Database unique violation (race) | 409 | `warn` | Retry or inform user of conflict |
| Database connection failure | 500 | `error` | Retry; escalate if persistent |
| Unexpected service error | 500 | `error` | Investigate logs and stack trace |

## Verification

### API Integration Tests

#### Happy Path Tests
- [ ] **Transfer user repo to another user**: Create repo under user A, transfer to user B, verify response has `owner: B` and `full_name: B/repo`
- [ ] **Transfer user repo to organization**: Create repo under user, transfer to org (where user is org owner), verify ownership change
- [ ] **Transfer org repo to user**: Create repo under org, transfer to user (where user is org owner), verify ownership change
- [ ] **Transfer org repo to different org**: Create repo under org A, transfer to org B (where actor owns both), verify ownership change
- [ ] **Verify updated_at changes**: Compare `updated_at` before and after transfer, assert it increased
- [ ] **Verify collaborators are removed**: Add collaborators to repo, transfer, verify collaborators list is empty
- [ ] **Verify team access is removed**: Associate repo with team, transfer, verify team-repo association is gone
- [ ] **Verify repo accessible at new URL**: After transfer, GET `/api/repos/:newOwner/:repo` returns 200
- [ ] **Verify repo NOT accessible at old URL**: After transfer, GET `/api/repos/:oldOwner/:repo` returns 404
- [ ] **Transfer with leading/trailing whitespace in new_owner**: `" target-user "` should be trimmed and succeed
- [ ] **Transfer an archived repository**: Archived repo should transfer successfully, `archived` field remains `true`
- [ ] **Transfer a forked repository**: Forked repo should transfer successfully
- [ ] **Transfer a private repository**: Private repo should transfer and remain private
- [ ] **Transfer preserves secrets and variables**: Verify secrets/variables exist under new owner after transfer
- [ ] **Transfer preserves webhooks**: Verify webhooks are retained after transfer
- [ ] **Transfer preserves labels and milestones**: Verify labels/milestones are intact after transfer
- [ ] **Transfer preserves wiki content**: Verify wiki pages are accessible after transfer
- [ ] **Transfer preserves issues**: Verify issues are accessible under new owner after transfer
- [ ] **Transfer preserves landing requests**: Verify landing requests are accessible after transfer

#### Error Path Tests
- [ ] **Unauthenticated request returns 401**: No auth header, expect 401
- [ ] **Non-owner returns 403**: Authenticated as collaborator (not owner), expect 403
- [ ] **Transfer to self returns 422**: Transfer `owner/repo` with `new_owner: owner`, expect validation error
- [ ] **Transfer to self (different casing) returns 422**: `new_owner: OWNER` when owner is `owner`, expect validation error
- [ ] **Transfer to nonexistent user/org returns 404**: `new_owner: does-not-exist-xyz`, expect 404
- [ ] **Transfer to org where actor is member (not owner) returns 403**: User is org member but not owner, expect 403
- [ ] **Name collision returns 409**: Target user already has a repo with the same name, expect 409 with descriptive message
- [ ] **Name collision with org returns 409**: Target org already has a repo with the same name, expect 409
- [ ] **Empty new_owner returns 400/422**: `{ "new_owner": "" }`, expect validation error
- [ ] **Whitespace-only new_owner returns 400/422**: `{ "new_owner": "   " }`, expect validation error
- [ ] **Missing new_owner field returns 400/422**: `{}`, expect validation error
- [ ] **Null new_owner returns 400/422**: `{ "new_owner": null }`, expect validation error
- [ ] **Malformed JSON body returns 400**: Send invalid JSON, expect 400
- [ ] **Empty body returns 400**: Send empty request body, expect 400
- [ ] **Non-existent repo returns 404**: Transfer a repo that doesn't exist, expect 404
- [ ] **new_owner at maximum valid length (255 chars)**: Should either succeed (if user exists) or return 404 (user not found), NOT a 500
- [ ] **new_owner exceeding maximum length (256+ chars)**: Should return a validation error, not a crash

#### Concurrent/Race Condition Tests
- [ ] **Concurrent transfers of same repo**: Two simultaneous transfer requests — one should succeed, the other should fail gracefully (409 or 404)
- [ ] **Transfer then immediate re-transfer**: Transfer A→B, then immediately B→A — both should succeed sequentially

### CLI E2E Tests

- [ ] **`codeplane repo transfer OWNER/REPO --to ORG --yes --json`**: Transfers repo to org, verify JSON output contains new owner
- [ ] **`codeplane repo transfer OWNER/REPO --new-owner ORG --yes --json`**: Alias `--new-owner` works the same as `--to`
- [ ] **Verify new ownership via `codeplane repo view`**: After transfer, `codeplane repo view` on new path returns correct owner
- [ ] **Old path returns error after transfer**: `codeplane repo view` on old path returns non-zero exit code
- [ ] **Transfer to nonexistent owner fails**: Non-zero exit code, error message on stderr
- [ ] **Transfer without `--yes` in non-interactive mode fails**: Non-zero exit code, message about confirmation required
- [ ] **Transfer with `--json` flag outputs full repo object**: Verify JSON output schema matches `RepoResponse`
- [ ] **Transfer without `--json` outputs human-readable message**: Output matches `"Transferred repository OWNER/REPO to NEW_OWNER"`
- [ ] **Transfer with `--to ""` fails**: Empty target, non-zero exit code

### TUI E2E Tests

- [ ] **Navigate to Settings → Danger Zone → Transfer**: Verify the transfer action is visible and focusable
- [ ] **Transfer flow completes successfully**: Enter new owner, confirm, verify navigation to new repo URL
- [ ] **Transfer with invalid owner name shows error**: Enter non-existent owner, verify inline error message
- [ ] **Cancel transfer dismisses prompt**: Press Esc or "n" at confirmation, verify no transfer occurred
- [ ] **Input validation rejects invalid characters**: Type special characters, verify they are rejected or error shown
- [ ] **Input respects 40-character limit**: Verify input is capped at 40 characters

### Web UI (Playwright) E2E Tests

- [ ] **Danger Zone section visible for repo owner**: Navigate to repo settings, verify Danger Zone section with transfer action
- [ ] **Danger Zone section NOT visible for non-owner**: Verify collaborators/members don't see the transfer option
- [ ] **Transfer modal opens on button click**: Click "Transfer", verify modal appears with input field and confirm/cancel buttons
- [ ] **Confirm button disabled when input empty**: Verify the confirm button is not clickable until a new owner is entered
- [ ] **Successful transfer redirects to new URL**: Complete transfer flow, verify browser URL changes to `/NEW_OWNER/REPO`
- [ ] **Error message displayed in modal on 404**: Enter non-existent owner, submit, verify error message appears in modal
- [ ] **Error message displayed in modal on 409**: Set up name collision, attempt transfer, verify conflict error in modal
- [ ] **Cancel button closes modal without transferring**: Click cancel, verify modal closes and no API call was made
- [ ] **Transfer of org repo by org owner succeeds**: As org owner, transfer org repo to another user via web UI
- [ ] **Old repo URL shows 404 page**: After transfer, navigate to old URL, verify 404 page
