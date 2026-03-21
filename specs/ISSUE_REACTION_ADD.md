# ISSUE_REACTION_ADD

Specification for ISSUE_REACTION_ADD.

## High-Level User POV

When a Codeplane user is looking at an issue — whether in the web UI, CLI, TUI, or an editor integration — they can express a quick, lightweight response by adding an emoji reaction. Rather than composing a full comment to say "I agree" or "this is important," the user simply clicks a reaction emoji (in the web UI or TUI) or runs a single CLI command to attach their sentiment directly to the issue.

Reactions appear as grouped emoji badges on the issue, each showing the emoji and a count of how many people have reacted with it. This gives the team an at-a-glance sense of community interest, urgency, or agreement on an issue without generating notification noise or cluttering the comment timeline. A user can add multiple different reactions to a single issue, but can only add each type of reaction once — clicking the same reaction a second time in the web UI simply removes it (toggle behavior). The same reactions model also applies to individual comments on an issue, letting people respond to specific discussion points with emoji rather than writing "+1" replies.

Reactions are visible to anyone who can read the issue. Adding or removing reactions requires the user to be authenticated and to have at least read-level access to the repository. This makes reactions a low-friction participation mechanism: even users who lack write permissions to edit the issue or manage labels can still express their perspective through reactions.

Agents interacting with issues through the API can also add reactions programmatically, enabling automated signals like a "thumbs up" when an agent has triaged an issue or an "eyes" emoji when it begins investigating.

## Acceptance Criteria

- **Supported reaction types**: The system supports exactly eight reaction types: `+1`, `-1`, `laugh`, `hooray`, `confused`, `heart`, `rocket`, `eyes`. Any value outside this set is rejected with a `422 Unprocessable Entity` response.
- **Add reaction to issue**: An authenticated user can add a reaction to an issue by specifying the issue number and a valid reaction content value. The server returns the created reaction object with `201 Created`.
- **Idempotent add**: If a user attempts to add a reaction they have already placed on the same issue, the server returns the existing reaction rather than creating a duplicate. The same user cannot have two identical reaction types on a single issue.
- **Multiple reaction types per user**: A user may add multiple distinct reaction types to the same issue (e.g., both `+1` and `heart`). Each is stored as a separate reaction record.
- **Reaction response shape**: A created or retrieved reaction includes: `id` (integer), `user` (object with `id` and `username`), `content` (string matching the enum), and `created_at` (ISO 8601 datetime).
- **Content field name**: The request body field for specifying the reaction type is `content`. The CLI may also accept `reaction` as an alias for backward compatibility, but the canonical API field is `content`.
- **Empty or missing content**: A request with a missing `content` field or an empty string value is rejected with `400 Bad Request`.
- **Content case sensitivity**: Reaction content values are case-sensitive. `Heart` or `HEART` are rejected; only lowercase `heart` is accepted (and `+1`/`-1` exactly as specified).
- **Issue existence validation**: If the specified issue number does not exist, the server returns `404 Not Found`.
- **Issue number validation**: Non-numeric, zero, or negative issue numbers return `400 Bad Request`.
- **Repository scoping**: Reactions are scoped to the repository. Adding a reaction to issue #5 in `alice/frontend` has no effect on issue #5 in `alice/backend`.
- **Authentication required**: Unauthenticated requests to add a reaction return `401 Unauthorized`.
- **Authorization minimum**: The user must have at least read-level access to the repository. Users with no access to a private repository receive `404 Not Found` (to avoid leaking existence).
- **Locked issue behavior**: Adding reactions to locked issues is permitted. Locking restricts new comments, not reactions.
- **Closed issue behavior**: Adding reactions to closed issues is permitted. Issue state does not restrict reactions.
- **Reaction count accuracy**: After a reaction is added, the reaction count for that emoji type on the issue is accurately reflected in list queries.
- **Webhook emission**: A successful reaction add fires an `issue_reaction_added` webhook event with the repository, issue number, reaction content, target type, and actor.
- **CLI support**: The `codeplane issue react <number> <emoji>` command adds a reaction and returns a human-readable confirmation or structured JSON output.
- **Web UI support**: The issue detail page displays grouped reaction badges and provides a reaction picker to add new reactions. Clicking an existing reaction badge the user has already applied removes it (toggle).
- **TUI support**: The TUI issue detail screen shows reaction summaries and provides a keybinding to add reactions via a picker overlay.
- **Cross-client consistency**: The same API endpoint and behavior applies regardless of whether the request originates from the web UI, CLI, TUI, editor, or direct API call.

### Definition of Done

The feature is complete when:
1. The `POST /api/repos/:owner/:repo/issues/:number/reactions` endpoint is implemented, validated, and returns correct responses for all success and error cases.
2. The CLI `issue react` command correctly calls the API and displays appropriate output.
3. The web UI displays reactions on issues with toggle behavior and a reaction picker.
4. The TUI displays reaction summaries on the issue detail screen.
5. Webhook events fire on reaction add.
6. All acceptance criteria above pass automated verification.
7. End-user documentation covers reaction usage from every client surface.
8. Observability instrumentation (metrics, logs, alerts) is in place.

## Design

### API Shape

**Add Reaction to Issue**

```
POST /api/repos/:owner/:repo/issues/:number/reactions
Content-Type: application/json
Authorization: Bearer <token> | Cookie session

{
  "content": "+1"
}
```

**Path Parameters:**
- `owner` (string, required) — Repository owner username or organization name.
- `repo` (string, required) — Repository name.
- `number` (integer, required) — Issue number. Must be a positive integer.

**Request Body:**
- `content` (string, required) — One of: `+1`, `-1`, `laugh`, `hooray`, `confused`, `heart`, `rocket`, `eyes`.

**Response `201 Created`** (reaction newly created):
```json
{
  "id": 789,
  "user": {
    "id": 42,
    "username": "alice"
  },
  "content": "+1",
  "created_at": "2026-03-22T14:30:00Z"
}
```

**Response `200 OK`** (reaction already exists — idempotent):
Returns the existing reaction object with the same shape as `201`.

**Error Responses:**
- `400 Bad Request` — Missing or empty `content` field; invalid issue number.
- `401 Unauthorized` — No authentication provided.
- `403 Forbidden` — User lacks permission to react (below read access on the repo).
- `404 Not Found` — Repository or issue does not exist (or private repo and user has no access).
- `422 Unprocessable Entity` — `content` value is not in the allowed enum.

**Add Reaction to Comment**

```
POST /api/repos/:owner/:repo/issues/comments/:id/reactions
Content-Type: application/json

{
  "content": "rocket"
}
```

Same request/response semantics as issue reactions, scoped to the comment.

**List Reactions on Issue**

```
GET /api/repos/:owner/:repo/issues/:number/reactions
```

Response `200 OK`: Array of reaction objects ordered by `created_at` ascending.

**Remove Reaction from Issue**

```
DELETE /api/repos/:owner/:repo/issues/:number/reactions/:id
```

Response `204 No Content` on success. Only the reaction owner or a repository admin/owner may delete a reaction.

### SDK Shape

The `@codeplane/sdk` IssueService exposes:

- `addIssueReaction(actor, owner, repo, number, content)` → `ReactionResponse`
- `listIssueReactions(viewer, owner, repo, number)` → `ReactionResponse[]`
- `removeIssueReaction(actor, owner, repo, number, reactionId)` → `void`
- `addCommentReaction(actor, owner, repo, commentId, content)` → `ReactionResponse`
- `listCommentReactions(viewer, owner, repo, commentId)` → `ReactionResponse[]`
- `removeCommentReaction(actor, owner, repo, commentId, reactionId)` → `void`

The `@codeplane/ui-core` package provides:

- `useIssueReactions(owner, repo, number)` — fetches and caches reactions for an issue, returns grouped counts and user-specific reaction state.
- `useToggleIssueReaction(owner, repo, number)` — mutation hook that adds or removes a reaction based on whether the current user has already reacted with that emoji. Performs optimistic update.
- `useCommentReactions(owner, repo, commentId)` — same pattern for comments.
- `useToggleCommentReaction(owner, repo, commentId)` — same pattern for comments.

### CLI Command

**Add reaction to issue:**
```bash
codeplane issue react <number> <emoji> [--repo OWNER/REPO] [--json]
```

- `<number>` — Issue number (positional, required).
- `<emoji>` — Reaction type (positional, required). Accepts: `+1`, `-1`, `laugh`, `hooray`, `confused`, `heart`, `rocket`, `eyes`. Also accepts aliases: `thumbs_up` → `+1`, `thumbs_down` → `-1`.
- `--repo` — Repository in `OWNER/REPO` format. Resolved from CWD jj/git context if omitted.
- `--json` — Output the full reaction object as JSON instead of a human-readable message.

**Human-readable output:**
```
Added +1 to issue #42
```

**JSON output (`--json`):**
```json
{
  "id": 789,
  "user": { "id": 42, "username": "alice" },
  "content": "+1",
  "created_at": "2026-03-22T14:30:00Z"
}
```

**Error output:**
```
Error: Invalid reaction type 'fire'. Supported: +1, -1, laugh, hooray, confused, heart, rocket, eyes
```

**List reactions on issue:**
```bash
codeplane issue reactions <number> [--repo OWNER/REPO] [--json]
```

**Human-readable output:**
```
Reactions on issue #42:
  👍 +1 (3): @alice, @bob, @carol
  ❤️ heart (1): @dave
```

### Web UI Design

**Reaction display on issue body:**

Below the issue body (and below each comment), a horizontal row of reaction badges is displayed. Each badge shows the emoji glyph, the count of users who reacted with that type, and is styled as a pill/chip. If the current user has applied a given reaction, that badge is highlighted (e.g., blue border or filled background) to indicate active state.

**Badge layout:**
```
[👍 3] [❤️ 1] [🚀 2] [+]
```

The `[+]` button at the end opens the reaction picker.

**Reaction picker:**

Clicking the `[+]` button opens a compact popover showing all eight supported emoji in a single row or small grid. Hovering over an emoji shows a tooltip with its name (e.g., "thumbs up", "rocket"). Clicking an emoji adds it and closes the picker. If the user already has that reaction, clicking it removes it instead.

**Toggle behavior:**

Clicking an existing reaction badge that the user has already applied removes their reaction (decrements the count). Clicking a badge the user has not applied adds their reaction (increments the count). This is an optimistic update: the UI updates immediately and reverts on server error.

**Empty state:**

When an issue has no reactions, the reaction area shows only the `[+]` add-reaction button (or the button is hidden until hover, depending on design density preference). No "No reactions" text is needed.

**Anonymous / read-only users:**

Users who are not authenticated or lack permission to react see reaction badges with counts (read-only) but the `[+]` button and toggle behavior are disabled or hidden. Hovering shows a tooltip: "Sign in to react."

### TUI UI

**Reaction display:**

On the issue detail screen, reactions are displayed as a compact line below the issue metadata:

```
Reactions: 👍3  ❤️1  🚀2
```

If no reactions exist, the reactions line is omitted.

**Keybinding:**

| Key | Action |
|-----|--------|
| `r` | Open reaction picker overlay |

**Reaction picker overlay:**

A centered overlay showing the eight supported emoji with their names. The user navigates with arrow keys and presses Enter to select. The overlay closes after selection, and the reaction line updates.

```
┌──── Add Reaction ────┐
│  👍 +1      👎 -1    │
│  😂 laugh   🎉 hooray│
│  😕 confused ❤️ heart │
│  🚀 rocket  👀 eyes  │
└──────────────────────┘
```

### Neovim Plugin API

- `:Codeplane issue react <number> <emoji>` — Adds a reaction and displays a confirmation message in the command line.
- The issue detail buffer (opened via `:Codeplane issue view`) displays reaction counts below the issue body.

### VS Code Extension

- The issue detail webview displays reactions with the same badge layout as the web UI.
- An inline action "Add Reaction" in the issue tree view opens a quick-pick menu with the eight emoji options.

### Documentation

End-user documentation must cover:

- **What reactions are**: A brief explanation that reactions are lightweight emoji responses to issues and comments, visible to all readers.
- **Supported emoji list**: Table of all eight supported reaction types with their glyphs and names.
- **How to add a reaction from the web UI**: Click the `+` button on an issue or comment, select an emoji. Mention toggle behavior.
- **How to add a reaction from the CLI**: `codeplane issue react <number> <emoji>` with examples.
- **How to list reactions from the CLI**: `codeplane issue reactions <number>` with example output.
- **How to add a reaction from the TUI**: Press `r` on the issue detail screen, select emoji from picker.
- **How to remove a reaction**: Click an active reaction badge (web UI), or use the API `DELETE` endpoint.
- **API reference**: Full endpoint documentation for add, list, and remove reactions on both issues and comments.
- **Permissions**: Who can add reactions (any authenticated user with read access).

## Permissions & Security

**Authorization by role:**

| Action | Anonymous (public repo) | Read-Only | Member / Write | Admin | Owner |
|--------|------------------------|-----------|----------------|-------|-------|
| View reactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add reaction | ❌ | ✅ | ✅ | ✅ | ✅ |
| Remove own reaction | ❌ | ✅ | ✅ | ✅ | ✅ |
| Remove others' reaction | ❌ | ❌ | ❌ | ✅ | ✅ |

**Private repository access:** All reaction operations on private repositories require authentication and at least read-level repository access. Unauthenticated or unauthorized requests to private repos return `404` (not `403`) to avoid leaking repository existence.

**Organization-owned repositories:** Effective permission is the highest of the user's direct collaboration role and any team role granting access.

**PAT scopes:** Personal access tokens require the `repo` scope for reaction operations on private repositories. Public repository reactions require only the `public_repo` scope.

**Rate limiting:**
- **Add reaction:** 60 requests per minute per user per repository. This prevents reaction spam while allowing normal interactive use.
- **List reactions:** 120 requests per minute per user per repository (higher limit since listing is read-only).
- **Remove reaction:** 60 requests per minute per user per repository.
- **Global burst:** A user may not create more than 200 reactions across all repositories in any 5-minute window.

**Data privacy:**
- Reactions are associated with user IDs and usernames. Usernames are public profile data. No PII beyond what is already visible on the user's profile is exposed.
- When a user account is deleted, all their reactions are cascade-deleted.
- Reactions do not contain free-text input, so there is no risk of PII injection through the reaction content field.

## Telemetry & Product Analytics

**Key business events:**

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `IssueReactionAdded` | User successfully adds a reaction to an issue | `repo_id`, `repo_owner`, `repo_name`, `issue_number`, `reaction_content`, `actor_id`, `actor_username`, `client_surface` (web/cli/tui/api/vscode/neovim), `is_first_reaction_on_issue` (boolean), `target_type` ("issue") |
| `IssueReactionRemoved` | User removes a reaction from an issue | `repo_id`, `issue_number`, `reaction_content`, `actor_id`, `client_surface`, `target_type` ("issue") |
| `CommentReactionAdded` | User adds a reaction to an issue comment | `repo_id`, `issue_number`, `comment_id`, `reaction_content`, `actor_id`, `client_surface`, `target_type` ("comment") |
| `CommentReactionRemoved` | User removes a reaction from a comment | `repo_id`, `comment_id`, `reaction_content`, `actor_id`, `client_surface`, `target_type` ("comment") |
| `ReactionPickerOpened` | User opens the reaction picker UI (web/TUI) | `actor_id`, `client_surface`, `target_type`, `issue_number` |

**Funnel metrics and success indicators:**

- **Reaction adoption rate:** Percentage of issues that receive at least one reaction within 24 hours of creation. Target: >15% of issues in active repositories.
- **Reaction diversity:** Average number of distinct reaction types used per issue (indicates users find value in multiple emoji, not just `+1`).
- **Reactions per active user per week:** Measures engagement depth. A healthy signal is 3-10 reactions per active user per week.
- **Reaction-to-comment ratio:** High ratio suggests reactions are successfully reducing low-value "+1" comments.
- **Client surface distribution:** Breakdown of reactions by client surface (web, CLI, TUI, editor). Validates that the feature is useful across all surfaces, not just one.
- **Toggle rate:** Percentage of reaction adds that are followed by a remove within 5 seconds (indicates accidental clicks or UI confusion).

## Observability

### Logging Requirements

| Event | Log Level | Structured Context |
|-------|-----------|-------------------|
| Reaction created successfully | `info` | `{ event: "reaction_created", repo_id, issue_number, reaction_content, actor_id, target_type, reaction_id }` |
| Reaction already exists (idempotent return) | `debug` | `{ event: "reaction_exists", repo_id, issue_number, reaction_content, actor_id, target_type }` |
| Reaction removed successfully | `info` | `{ event: "reaction_removed", repo_id, issue_number, reaction_id, actor_id, target_type }` |
| Invalid reaction content rejected | `warn` | `{ event: "reaction_invalid_content", repo_id, issue_number, provided_content, actor_id }` |
| Authorization denied for reaction | `warn` | `{ event: "reaction_auth_denied", repo_id, issue_number, actor_id, required_permission, actual_permission }` |
| Rate limit exceeded for reactions | `warn` | `{ event: "reaction_rate_limited", actor_id, repo_id, window_remaining: 0 }` |
| Database error during reaction insert | `error` | `{ event: "reaction_db_error", repo_id, issue_number, reaction_content, actor_id, error_message, error_code }` |
| Webhook delivery for reaction event | `debug` | `{ event: "reaction_webhook_dispatched", repo_id, issue_number, webhook_id, target_url }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_reactions_total` | Counter | `content`, `target_type`, `action` (add/remove) | Total reactions added or removed, segmented by emoji type and target |
| `codeplane_issue_reaction_request_duration_seconds` | Histogram | `method` (POST/DELETE/GET), `status_code` | Latency distribution for reaction API requests |
| `codeplane_issue_reaction_errors_total` | Counter | `error_type` (validation/auth/db/not_found/rate_limit) | Total reaction request errors by category |
| `codeplane_issue_reaction_rate_limit_hits_total` | Counter | — | Total number of reaction requests rejected by rate limiting |
| `codeplane_issue_reaction_webhook_deliveries_total` | Counter | `status` (success/failure) | Total webhook deliveries triggered by reaction events |

### Alerts and Runbooks

**Alert: `ReactionErrorRateHigh`**
- **Condition:** `rate(codeplane_issue_reaction_errors_total{error_type="db"}[5m]) > 0.5`
- **Severity:** Warning
- **Runbook:**
  1. Check database connectivity: `SELECT 1` from the application's database connection.
  2. Check the `reactions` table for lock contention: `SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock'`.
  3. Review application logs for `reaction_db_error` events to identify the specific SQL error.
  4. If the error is a unique constraint violation on the `(user_id, target_type, target_id, emoji)` tuple, the idempotency handling may have a race condition — check the INSERT ON CONFLICT logic.
  5. If the error rate is caused by a single user/repo, check for abuse and consider temporary rate limit reduction.
  6. Escalate to the database on-call if connection pool exhaustion is suspected.

**Alert: `ReactionLatencyP99High`**
- **Condition:** `histogram_quantile(0.99, rate(codeplane_issue_reaction_request_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check database query performance: run `EXPLAIN ANALYZE` on the `INSERT INTO reactions` and `SELECT FROM reactions` queries with representative parameters.
  2. Verify that the `reactions` table has proper indexes on `(target_type, target_id)` and `(user_id, target_type, target_id, emoji)`.
  3. Check if a high-reaction issue (popular issue with hundreds of reactions) is causing fan-out on list queries. Consider adding pagination to the list endpoint if not already present.
  4. Review connection pool metrics for saturation.
  5. If latency is isolated to a specific repository, check for abnormally large reaction counts and consider caching.

**Alert: `ReactionRateLimitSpikeHigh`**
- **Condition:** `rate(codeplane_issue_reaction_rate_limit_hits_total[5m]) > 10`
- **Severity:** Info
- **Runbook:**
  1. Identify the user(s) hitting rate limits by reviewing `reaction_rate_limited` log entries.
  2. Determine if the traffic is legitimate (e.g., a script adding reactions to many issues) or abusive.
  3. If abusive, consider temporary IP or user-level blocking.
  4. If legitimate, evaluate whether the rate limit threshold is too aggressive and consider raising it.

**Alert: `ReactionWebhookDeliveryFailureRateHigh`**
- **Condition:** `rate(codeplane_issue_reaction_webhook_deliveries_total{status="failure"}[10m]) / rate(codeplane_issue_reaction_webhook_deliveries_total[10m]) > 0.3`
- **Severity:** Warning
- **Runbook:**
  1. Check webhook delivery logs for the failing target URLs.
  2. Verify that the webhook target endpoints are reachable from the server (DNS resolution, network connectivity).
  3. Check if specific webhook configurations have invalid URLs or expired secrets.
  4. If a single webhook target is causing all failures, consider disabling that webhook temporarily and notifying the repository owner.
  5. Review the webhook retry queue depth to ensure it is not growing unboundedly.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Detection | Recovery |
|------------|-------------|-----------|----------|
| Invalid reaction content | 422 | Request validation | Return error with supported values |
| Missing content field | 400 | Request validation | Return error specifying required field |
| Issue not found | 404 | Service lookup | Return not found |
| Repository not found | 404 | Service lookup | Return not found |
| User not authenticated | 401 | Auth middleware | Return unauthorized |
| User lacks permission | 403/404 | Authorization check | Return forbidden or not found (private repo) |
| Rate limit exceeded | 429 | Rate limiter | Return retry-after header |
| Database unique constraint violation (duplicate) | 200 | DB error catch | Return existing reaction (idempotent) |
| Database connection failure | 500 | DB error catch | Log, return internal server error, alert |
| Database timeout | 500 | DB error catch | Log, return internal server error, alert |
| Webhook delivery failure | N/A (async) | Webhook delivery service | Retry with exponential backoff, log failure |

## Verification

### API Integration Tests

1. **Add reaction to issue — happy path**: Create a repo and issue, POST a `+1` reaction, assert `201` status and response body contains `id`, `user.username`, `content: "+1"`, `created_at`.
2. **Add reaction — all eight types**: For each of `+1`, `-1`, `laugh`, `hooray`, `confused`, `heart`, `rocket`, `eyes`, POST a reaction and assert `201` with correct `content` value returned.
3. **Add reaction — idempotent duplicate**: POST `+1` twice to the same issue by the same user. First returns `201`, second returns `200` with the same `id`.
4. **Add multiple distinct reactions — same user**: POST `+1` then `heart` to the same issue. Assert both succeed and list returns two reactions.
5. **Add reaction — multiple users**: Two authenticated users each POST `+1` to the same issue. List returns two reactions with distinct `user.id` values.
6. **Add reaction — invalid content value**: POST `{ "content": "fire" }`. Assert `422` with error message listing valid values.
7. **Add reaction — empty content**: POST `{ "content": "" }`. Assert `400`.
8. **Add reaction — missing content field**: POST `{}`. Assert `400`.
9. **Add reaction — content with wrong case**: POST `{ "content": "Heart" }`. Assert `422`.
10. **Add reaction — non-existent issue**: POST reaction to issue #99999 in an existing repo. Assert `404`.
11. **Add reaction — invalid issue number (zero)**: POST reaction to issue #0. Assert `400`.
12. **Add reaction — invalid issue number (negative)**: POST reaction to issue #-1. Assert `400`.
13. **Add reaction — invalid issue number (string)**: POST reaction to issue "abc". Assert `400`.
14. **Add reaction — non-existent repository**: POST reaction to `nonexistent/repo` issue #1. Assert `404`.
15. **Add reaction — unauthenticated**: POST reaction without authentication. Assert `401`.
16. **Add reaction — unauthorized (private repo, no access)**: POST reaction to a private repo the user has no access to. Assert `404`.
17. **Add reaction — read-only user**: A user with read-only access adds a reaction. Assert `201` (read-only users can react).
18. **Add reaction — closed issue**: Close an issue, then POST reaction. Assert `201`.
19. **Add reaction — locked issue**: Lock an issue, then POST reaction. Assert `201`.
20. **List reactions — empty**: List reactions on an issue with no reactions. Assert `200` with empty array.
21. **List reactions — ordered by created_at ascending**: Add `heart`, then `+1` (with slight delay). Assert list returns `heart` before `+1`.
22. **List reactions — includes user info**: List reactions and assert each entry has `user.id` and `user.username`.
23. **Remove reaction — happy path**: Add a reaction, get its `id`, DELETE it, assert `204`. List again, assert it's gone.
24. **Remove reaction — own reaction by non-admin**: A read-only user adds a reaction and removes their own. Assert `204`.
25. **Remove reaction — another user's reaction (non-admin)**: User A adds a reaction, User B (non-admin) tries to DELETE it. Assert `403`.
26. **Remove reaction — another user's reaction (admin)**: User A adds a reaction, an admin DELETEs it. Assert `204`.
27. **Remove reaction — non-existent reaction ID**: DELETE with a bogus reaction ID. Assert `404`.
28. **Add reaction to comment — happy path**: Create a comment, POST reaction to comment endpoint. Assert `201`.
29. **List reactions on comment**: Add reactions to a comment, GET comment reactions. Assert array with correct items.
30. **Remove reaction from comment**: Add reaction to comment, DELETE it, assert `204`.
31. **Webhook fires on reaction add**: Configure a webhook for the repo, add a reaction, assert webhook delivery contains `issue_reaction_added` event payload with `repo_id`, `issue_number`, `reaction_content`, `target_type`, `actor_id`.
32. **Rate limit enforcement**: Send 61 reaction add requests in quick succession. Assert the 61st returns `429`.
33. **Maximum reactions per issue**: Add all 8 reaction types from a single user. Assert all succeed. Add a 9th with an invalid type. Assert `422`.

### CLI Integration Tests

34. **CLI add reaction — human output**: Run `codeplane issue react 42 +1 --repo OWNER/REPO`. Assert exit code 0 and stdout contains `Added +1 to issue #42`.
35. **CLI add reaction — JSON output**: Run `codeplane issue react 42 heart --repo OWNER/REPO --json`. Assert exit code 0 and stdout parses to JSON with `content: "heart"`.
36. **CLI add reaction — alias thumbs_up**: Run `codeplane issue react 42 thumbs_up --repo OWNER/REPO`. Assert success and reaction content is `+1`.
37. **CLI add reaction — invalid emoji**: Run `codeplane issue react 42 fire --repo OWNER/REPO`. Assert non-zero exit code and stderr contains error message.
38. **CLI add reaction — missing issue number**: Run `codeplane issue react --repo OWNER/REPO`. Assert non-zero exit code and usage hint.
39. **CLI list reactions**: Run `codeplane issue reactions 42 --repo OWNER/REPO`. Assert exit code 0 and output lists existing reactions.
40. **CLI list reactions — JSON output**: Run `codeplane issue reactions 42 --repo OWNER/REPO --json`. Assert exit code 0 and stdout parses to JSON array.

### Playwright E2E Tests (Web UI)

41. **Reaction badges visible on issue**: Navigate to an issue with existing reactions. Assert reaction badges are visible with correct emoji and counts.
42. **Add reaction via picker**: Click the `+` add-reaction button on an issue. Assert picker popover appears with all 8 emoji. Click `heart`. Assert the `heart` badge appears with count 1 and is highlighted.
43. **Toggle reaction off**: On an issue where the current user has a `+1` reaction, click the `+1` badge. Assert the badge is removed or count decremented.
44. **Reaction picker closes on selection**: Open picker, click an emoji. Assert picker closes.
45. **Reaction picker closes on outside click**: Open picker, click outside. Assert picker closes without adding a reaction.
46. **Anonymous user cannot react**: View an issue while logged out. Assert the add-reaction button is hidden or disabled.
47. **Reaction on comment**: On a comment with the add-reaction button, click it, select `rocket`. Assert rocket badge appears on the comment.
48. **Optimistic update**: Click a reaction badge. Assert the count updates immediately without waiting for network response. (Intercept network request to add latency and verify instant UI update.)
49. **Optimistic rollback on error**: Intercept the reaction POST to return `500`. Click a reaction. Assert count updates, then reverts when error is received.
50. **Multiple users see reactions**: User A adds a reaction. User B views the same issue. Assert User B sees the reaction badge with count 1.

### E2E Tests (existing reactions.test.ts expansion)

51. **Full lifecycle**: Create repo → create issue → add reaction → list reactions → verify count → remove reaction → list reactions → verify empty. All via API CLI commands.
52. **Comment reaction lifecycle**: Create repo → create issue → create comment → add reaction to comment → list comment reactions → remove comment reaction → verify removal.
53. **Cross-user reaction**: User A adds `+1`, User B adds `+1` to the same issue. List shows 2 reactions with distinct users.
