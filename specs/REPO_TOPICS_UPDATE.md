# REPO_TOPICS_UPDATE

Specification for REPO_TOPICS_UPDATE.

## High-Level User POV

When you manage a Codeplane repository, topics are the primary way to categorize and label your project for discoverability. Topics are lightweight, standardized tags — like `jj`, `forge`, `typescript`, or `3d-models` — that tell other users and Codeplane's search engine what your repository is about. Updating topics is how you keep your repository's categorization accurate as its purpose evolves.

Updating repository topics is a dedicated, focused operation distinct from general metadata editing. You can replace all of a repository's topics at once through a single action. This is available from the web UI's repository settings page (where topics appear as an interactive tag input), through the CLI with a one-liner command, from the TUI's settings tab, and directly via the API. The operation is a full replacement: you provide the complete list of desired topics, and the previous topics are entirely replaced. To clear all topics, you submit an empty list. To add a topic, you include it alongside the existing ones. To remove one, you omit it from the list.

Codeplane makes topic entry forgiving. If you type topics in mixed case or with extra whitespace, they're normalized automatically — `"  RUST "` becomes `"rust"`. If you accidentally include the same topic twice, duplicates are silently removed. The only hard rules are that each topic must be 1–35 characters, start with a letter or number, and consist only of lowercase letters, numbers, and hyphens. If any topic in your list violates these rules, the entire update is rejected with a clear validation error so you know exactly what to fix.

Once updated, the new topics are immediately visible everywhere: in the repository overview, in search results, on the browse page topic filters, across the CLI and TUI views, and in any editor integration that shows repository details. Topics are always public metadata on public repositories and visible to anyone who can see a private repository.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users with admin or owner permission on a repository can replace the repository's topics via `PUT /api/repos/:owner/:repo/topics`
- [ ] The endpoint accepts a JSON body with a `topics` array of strings and performs a full replacement of the repository's topic list
- [ ] The endpoint returns the complete, normalized topic list in the response (HTTP 200)
- [ ] The repository's `updated_at` timestamp is refreshed to the current server time on every successful topic update
- [ ] Topics are also updatable as part of the general metadata PATCH endpoint (`PATCH /api/repos/:owner/:repo` with `topics` field) — both paths produce identical results
- [ ] All clients (web UI, CLI, TUI) can trigger topic updates and display the result
- [ ] Unauthenticated requests receive HTTP 401
- [ ] Authenticated users without admin permission receive HTTP 403
- [ ] Updates to non-existent repositories return HTTP 404
- [ ] Updates to non-existent repositories that are private return HTTP 404 (not 403, to avoid leaking existence)
- [ ] The GET endpoint (`GET /api/repos/:owner/:repo/topics`) is publicly readable for public repositories and returns topics for anyone with read access to private repositories
- [ ] Config-as-code support: topics defined in `.codeplane/config.yml` under `repository.topics` are synced to the database and subject to the same validation rules

### Topic Validation Constraints

- Each topic must match the pattern `^[a-z0-9][a-z0-9-]{0,34}$` (after normalization)
- Topics must be 1–35 characters in length
- Topics must start with a lowercase letter or digit (not a hyphen)
- Topics may only contain lowercase letters (`a-z`), digits (`0-9`), and hyphens (`-`)
- Topics are normalized to lowercase before validation — input `"RUST"` becomes `"rust"`
- Topics are trimmed of leading/trailing whitespace before validation — input `" rust "` becomes `"rust"`
- Duplicate topics (after normalization) are silently deduplicated — `["rust", "RUST"]` becomes `["rust"]`
- An empty array `[]` is valid and clears all topics from the repository
- Maximum 20 topics per repository (client-enforced; server accepts the array as-is after normalization and deduplication)
- If any single topic in the submitted array fails validation, the entire request is rejected with HTTP 422

### Edge Cases

- Submitting `{ "topics": [] }` clears all topics — succeeds with `{ "topics": [] }`
- Submitting `{ "topics": ["RUST", "jj"] }` normalizes to `{ "topics": ["rust", "jj"] }`
- Submitting `{ "topics": ["rust", "rust", "jj"] }` deduplicates to `{ "topics": ["rust", "jj"] }`
- Submitting `{ "topics": ["Rust", "rust"] }` deduplicates (case-insensitive) to `{ "topics": ["rust"] }`
- Submitting `{ "topics": ["invalid topic!"] }` returns HTTP 422 (space and special character)
- Submitting `{ "topics": ["-rust"] }` returns HTTP 422 (starts with hyphen)
- Submitting `{ "topics": ["3d-models"] }` succeeds (starting with digit is allowed)
- Submitting `{ "topics": ["a"] }` succeeds (single-character topic is valid)
- Submitting `{ "topics": ["abcdefghijklmnopqrstuvwxyz012345678"] }` succeeds (exactly 35 characters)
- Submitting `{ "topics": ["abcdefghijklmnopqrstuvwxyz0123456789"] }` returns HTTP 422 (36 characters)
- Submitting `{ "topics": [" rust "] }` succeeds after trimming to `"rust"`
- Submitting `{ "topics": ["rust", "jj", "forge"] }` when the repo already has `["old-topic"]` replaces entirely — result is `["rust", "jj", "forge"]`
- Submitting the same topics that already exist succeeds (idempotent, `updated_at` still refreshes)
- Submitting `{ "topics": null }` is treated as `{ "topics": [] }` (defaults to empty array)
- Submitting `{}` (missing `topics` key) is treated as `{ "topics": [] }`
- Topics containing only hyphens (e.g., `["---"]`) return HTTP 422 (must start with alphanumeric)
- Topics that are an empty string `[""]` return HTTP 422 (does not match regex)
- Concurrent topic updates from multiple clients: last-write-wins semantics

## Design

### API Shape

#### Dedicated Topics Endpoint

**Endpoint:** `PUT /api/repos/:owner/:repo/topics`

**Authentication:** Required (session cookie, PAT, or OAuth2 token)

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: token <PAT>` (alternative to cookie)

**Request Body:**
```json
{
  "topics": ["string", "..."]
}
```

**Success Response (HTTP 200):**
```json
{
  "topics": ["jj", "forge", "typescript"]
}
```

**Error Responses:**
- `400 Bad Request`: Malformed JSON or missing `topics` field with invalid type
- `401 Unauthorized`: `{ "message": "authentication required" }`
- `403 Forbidden`: `{ "message": "permission denied" }`
- `404 Not Found`: Repository does not exist or is private and requester lacks access
- `422 Unprocessable Entity`: `{ "message": "Validation Failed", "errors": [{ "resource": "Repository", "field": "topics", "code": "invalid" }] }`
- `429 Too Many Requests`: Rate limit exceeded

#### Read Topics Endpoint

**Endpoint:** `GET /api/repos/:owner/:repo/topics`

**Authentication:** Optional (public repos are readable without auth; private repos require read access)

**Success Response (HTTP 200):**
```json
{
  "topics": ["jj", "forge", "typescript"]
}
```

A repository with no topics returns `{ "topics": [] }`.

#### Topics via General Metadata Update

Topics can also be updated via `PATCH /api/repos/:owner/:repo` by including a `topics` field in the request body. This path uses the same normalization, validation, and permission checks. The response format differs (returns the full `RepoResponse` object rather than just `{ topics: [] }`).

### SDK Shape

The `RepoService` in `@codeplane/sdk` exposes two topic methods:

**`getRepoTopics(viewer, owner, repo)`**
- `viewer: RepoActor | null` — the authenticated user context (null for anonymous)
- `owner: string` — the repository owner username or org name
- `repo: string` — the repository name
- Returns `Result<string[], APIError>` — the topic array or a typed error

**`replaceRepoTopics(actor, owner, repo, topics)`**
- `actor: RepoActor | null` — the authenticated user context
- `owner: string` — the repository owner username or org name
- `repo: string` — the repository name
- `topics: string[]` — the full replacement list of topics
- Returns `Result<string[], APIError>` — the normalized topic array after persistence, or a typed error

Normalization is performed by an internal `normalizeTopics()` function that lowercases, trims, deduplicates, and validates each topic against `^[a-z0-9][a-z0-9-]{0,34}$`.

### CLI Command

**Read topics:**
```bash
codeplane repo topics <OWNER/REPO>
```

**Update topics:**
```bash
codeplane repo topics <OWNER/REPO> --set <topic1,topic2,...>
```

**Options:**
- `--set <topics>` — Comma-separated list of topics (replaces all existing topics)
- `--json` — Output raw JSON response
- `--clear` — Remove all topics (equivalent to `--set ""`)

**Output (default):**
```
Topics for alice/my-repo:
  jj
  forge
  typescript
```

**Output (--json):**
```json
{ "topics": ["jj", "forge", "typescript"] }
```

**Examples:**
```bash
# View current topics
codeplane repo topics alice/my-repo

# Set topics (replaces all existing)
codeplane repo topics alice/my-repo --set jj,forge,typescript

# Clear all topics
codeplane repo topics alice/my-repo --clear

# JSON output
codeplane repo topics alice/my-repo --json

# Via repo edit
codeplane repo edit alice/my-repo --topics rust,jj,forge
```

### TUI UI

The TUI settings tab (tab `6`) within the repository detail screen includes a Topics field in the General section.

**Topics Field:**
- Rendered as a comma-separated multi-value editor
- Editing: press `Enter` on the Topics row to activate edit mode, type comma-separated topics, press `Ctrl+S` to save or `Esc` to cancel
- Client-side validation: each topic validated against the format rules before submission; invalid topics show an inline error message
- Max 20 topics enforced client-side — attempting to add the 21st topic shows "Maximum 20 topics reached"
- Saved topics are shown as inline tags in the overview screen, each rendered in primary color with bracket notation `[topic]`

**Read-Only Mode:**
- Non-admin users see topics displayed but cannot edit them
- Attempting to enter edit mode shows "Admin access required" in the status bar

### Web UI Design

The web repository settings page at `/:owner/:repo/settings` includes a Topics section in the general settings form.

**Tag Input Component:**
- Topics are displayed as removable chips/tags
- Users type a topic and press `Enter` or `,` (comma) to add it to the list
- Each chip has an `×` button to remove it
- Inline validation: if a typed topic fails the format rules, a red validation error appears below the input (e.g., "Topics must be lowercase letters, numbers, and hyphens only")
- Counter shows current count vs. maximum (e.g., "3 / 20 topics")
- When 20 topics are present, the text input is disabled with a note "Maximum 20 topics reached"

**Save Behavior:**
- The "Save changes" button submits changed topics via `PUT /api/repos/:owner/:repo/topics`
- Success shows a toast notification: "Topics updated"
- Server-side validation errors are shown inline next to the topics field

**Repository Overview:**
- Topics are displayed as clickable tag chips on the repository overview page
- Clicking a topic navigates to a search/browse view filtered by that topic

### Config-as-Code

Topics can be managed declaratively in `.codeplane/config.yml`:

```yaml
repository:
  topics:
    - jj
    - forge
    - typescript
```

The config sync service normalizes topics using the same rules (lowercase, trim, deduplicate, sort alphabetically) and applies changes when the config file is pushed.

### Documentation

End-user documentation should include:

- **Topics Guide** — what topics are, naming rules (`1-35 chars, lowercase alphanumeric + hyphens, must start with letter or digit`), how they affect search discoverability, maximum 20 per repository
- **API Reference: PUT /api/repos/:owner/:repo/topics** — request/response schema, error codes, normalization behavior, examples
- **API Reference: GET /api/repos/:owner/:repo/topics** — response schema, public vs. private access rules
- **CLI Reference: `repo topics`** — full command reference with `--set`, `--clear`, `--json` options and examples
- **Config-as-Code Reference** — how to define topics in `.codeplane/config.yml`, normalization and sort behavior

## Permissions & Security

### Authorization Roles

| Role | Can Read Topics | Can Update Topics | Notes |
|------|----------------|-------------------|-------|
| **Owner** | ✅ Yes | ✅ Yes | Full access |
| **Admin** (org team role) | ✅ Yes | ✅ Yes | Same as owner for topic management |
| **Write** (collaborator) | ✅ Yes | ❌ No | Can read but not modify; receives HTTP 403 on PUT |
| **Read** (collaborator) | ✅ Yes | ❌ No | Can read but not modify; receives HTTP 403 on PUT |
| **Anonymous** (public repo) | ✅ Yes | ❌ No | Can read public repo topics; receives HTTP 401 on PUT |
| **Anonymous** (private repo) | ❌ No | ❌ No | Receives HTTP 404 on both GET and PUT (repo existence not leaked) |

### Rate Limiting

- **GET /api/repos/:owner/:repo/topics**: Standard read rate limit (shared with other repo read endpoints)
- **PUT /api/repos/:owner/:repo/topics**: Standard mutation rate limit as configured by the global rate limiter middleware. Recommended burst limit: 30 requests per minute per user per repository (topic updates should be infrequent)
- **Config sync**: Not separately rate-limited; governed by push frequency and sync queue flush interval

### Data Privacy

- Topics are public metadata for public repositories — visible to all users including unauthenticated visitors
- For private repositories, topics are only visible to users with at least read access
- Topics should not contain PII, but the system does not enforce this — the validation regex restricts the character set to lowercase alphanumeric and hyphens, which limits but does not eliminate the possibility of encoding identifiable information
- Topic arrays are returned in their entirety; there is no mechanism to selectively redact individual topics

## Telemetry & Product Analytics

### Business Events

**`repo.topics.updated`**
Fired on every successful topic replacement via `PUT /api/repos/:owner/:repo/topics`.

Properties:
- `repo_id: number` — the repository ID
- `owner: string` — the repository owner
- `repo_name: string` — the repository name
- `actor_id: number` — the user who made the change
- `topics_count: number` — number of topics after the update
- `topics_added: number` — count of topics present in the new list but not the old
- `topics_removed: number` — count of topics present in the old list but not the new
- `was_clear: boolean` — whether the update resulted in zero topics (cleared all)
- `client: "web" | "cli" | "tui" | "api" | "desktop" | "vscode" | "neovim"` — which client surface initiated the change

**`repo.topics.update_failed`**
Fired on every failed topic update attempt.

Properties:
- `repo_id: number | null` — the repository ID (null if repo not found)
- `owner: string` — the requested owner
- `repo_name: string` — the requested repo name
- `actor_id: number | null` — the user who made the attempt
- `error_code: string` — the error classification (`"unauthorized"`, `"forbidden"`, `"validation_failed"`, `"not_found"`, `"internal"`)
- `topics_submitted: number` — count of topics submitted (before validation)

### Funnel Metrics & Success Indicators

- **Topics adoption rate:** percentage of repositories with at least one topic — primary indicator of feature adoption
- **Average topics per repo:** mean number of topics across repositories that have any — indicates depth of categorization
- **Topic update frequency:** average number of topic update operations per repository per week
- **Clear rate:** percentage of topic updates that result in an empty topic list — high rate may indicate confusion or churn
- **Validation rejection rate:** percentage of topic update attempts that fail validation — should be below 5%; high rate indicates UX friction
- **Client distribution:** which clients are used for topic updates — informs investment priority
- **Most popular topics:** top 50 topics by repository count — informs any future topic suggestion/autocomplete feature
- **Time-to-first-topic:** time from repository creation to first topic assignment — indicates onboarding and discoverability awareness

## Observability

### Logging Requirements

**INFO level:**
- `repo.topics.updated` — log every successful topic replacement with `{ repo_id, owner, repo, actor_id, topics_count, topics }` structured context
- `repo.topics.read` — log topic reads at DEBUG level only (high-volume, low-signal)

**WARN level:**
- `repo.topics.validation_failed` — log validation failures with `{ owner, repo, actor_id, invalid_topic, reason }` — include the specific offending topic value and why it failed
- `repo.topics.permission_denied` — log permission failures with `{ owner, repo, actor_id }`

**ERROR level:**
- `repo.topics.update_db_error` — log database errors during the `UPDATE repositories SET topics` operation with `{ repo_id, owner, repo, error_message }` (no raw SQL parameters)
- `repo.topics.resolution_failed` — log when repository or user resolution fails unexpectedly (not a simple 404)

### Prometheus Metrics

**Counters:**
- `codeplane_repo_topics_updates_total{status}` — total topic update operations, labeled by status (`success`, `validation_error`, `permission_error`, `not_found`, `server_error`)
- `codeplane_repo_topics_reads_total{status}` — total topic read operations, labeled by status (`success`, `not_found`, `server_error`)

**Histograms:**
- `codeplane_repo_topics_update_duration_seconds` — latency of the PUT topics endpoint, bucketed at 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0s
- `codeplane_repo_topics_count_on_update` — distribution of topic array sizes submitted on update, bucketed at 0, 1, 3, 5, 10, 15, 20, 25

**Gauges:**
- `codeplane_repo_topics_count{repo_id}` — current topic count per repository (sampled on update)

### Alerts

**Alert: `RepoTopicsUpdateErrorRateHigh`**
- **Condition:** `rate(codeplane_repo_topics_updates_total{status="server_error"}[5m]) / rate(codeplane_repo_topics_updates_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check `repo.topics.update_db_error` logs in the structured log stream for the last 10 minutes
  2. Verify database connectivity: run `SELECT 1` against the primary database
  3. Check for active database locks: query `pg_stat_activity` for long-running transactions on the `repositories` table
  4. Inspect the `topics` column type on the `repositories` table — ensure it is still `text[]` and no migration has altered it
  5. Check disk space on the database volume
  6. If the database is healthy, check whether the `updateRepoTopics` query is failing due to a schema mismatch
  7. Escalate to the database on-call if the issue is infrastructure-related

**Alert: `RepoTopicsUpdateLatencyHigh`**
- **Condition:** `histogram_quantile(0.99, rate(codeplane_repo_topics_update_duration_seconds_bucket[5m])) > 1.0`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency for the `UPDATE repositories SET topics` query
  2. Look for table bloat on `repositories` — run `VACUUM ANALYZE repositories` if needed
  3. Check for lock contention: are there concurrent long-running transactions on the same rows?
  4. Verify index health — the topics update touches `updated_at` which may be indexed
  5. If latency is global, check database connection pool saturation
  6. If latency is isolated to specific repos, check those repos for unusual state

**Alert: `RepoTopicsValidationRateHigh`**
- **Condition:** `rate(codeplane_repo_topics_updates_total{status="validation_error"}[15m]) / rate(codeplane_repo_topics_updates_total[15m]) > 0.3`
- **Severity:** Info
- **Runbook:**
  1. Review `repo.topics.validation_failed` logs to identify patterns — are users consistently trying the same invalid format?
  2. Check if a specific client version is sending malformed topic data
  3. If the rejection pattern is consistent (e.g., users submitting topics with spaces), consider whether the client UX needs improvement
  4. If the rejections are from API/automation clients, check if documentation adequately describes the topic format requirements
  5. No immediate action needed unless combined with user complaints

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Authentication missing | 401 | No session cookie or PAT | User must log in or provide valid credentials |
| Permission denied | 403 | User lacks admin role on the repository | User must request admin access from the repository owner |
| Repository not found | 404 | Repo doesn't exist, or private repo and user lacks access | Verify owner/repo spelling; request access if private |
| Malformed request body | 400 | Invalid JSON, `topics` is not an array, or non-JSON content type | Fix request body to be valid JSON with a `topics` string array |
| Invalid topic format | 422 | Topic contains spaces, special characters, or exceeds 35 chars | Fix each topic to match `^[a-z0-9][a-z0-9-]{0,34}$` |
| Topic starts with hyphen | 422 | Topic begins with `-` instead of alphanumeric | Change topic to start with a letter or number |
| Empty topic string | 422 | Array contains `""` | Remove empty strings from the topics array |
| Database write failure | 500 | Database unavailable, write timeout, or schema drift | Retry after a short delay; if persistent, check server logs and database health |

## Verification

### API Integration Tests — PUT /api/repos/:owner/:repo/topics

**Happy Path:**
- [ ] `PUT /api/repos/:owner/:repo/topics` with `{ "topics": ["rust", "jj", "forge"] }` returns HTTP 200 with `{ "topics": ["rust", "jj", "forge"] }`
- [ ] `PUT /api/repos/:owner/:repo/topics` with `{ "topics": [] }` returns HTTP 200 with `{ "topics": [] }` (clears all topics)
- [ ] After a successful PUT, `GET /api/repos/:owner/:repo/topics` returns the same topics
- [ ] After a successful PUT, `GET /api/repos/:owner/:repo` response includes the updated topics in the full repo object
- [ ] Two consecutive PUTs with different topics — second PUT fully replaces the first (no merging)
- [ ] PUT with the same topics already set — succeeds (idempotent), `updated_at` is refreshed

**Normalization:**
- [ ] `{ "topics": ["RUST", "JJ"] }` returns `{ "topics": ["rust", "jj"] }` (lowercased)
- [ ] `{ "topics": [" rust ", " jj "] }` returns `{ "topics": ["rust", "jj"] }` (trimmed)
- [ ] `{ "topics": ["rust", "rust", "jj"] }` returns `{ "topics": ["rust", "jj"] }` (deduplicated)
- [ ] `{ "topics": ["Rust", "rust", "RUST"] }` returns `{ "topics": ["rust"] }` (case-insensitive dedup)
- [ ] `{ "topics": ["  RUST  ", "rust"] }` returns `{ "topics": ["rust"] }` (trimmed then deduped)

**Boundary — Valid Sizes:**
- [ ] Topic of exactly 1 character: `{ "topics": ["a"] }` — succeeds
- [ ] Topic of exactly 1 digit: `{ "topics": ["9"] }` — succeeds
- [ ] Topic of exactly 35 characters: `{ "topics": ["abcdefghijklmnopqrstuvwxyz012345678"] }` — succeeds
- [ ] Topic starting with a digit: `{ "topics": ["3d-models"] }` — succeeds
- [ ] Topic with hyphens in the middle: `{ "topics": ["my-cool-project"] }` — succeeds
- [ ] Topic ending with a hyphen: `{ "topics": ["rust-"] }` — succeeds (regex allows trailing hyphen)
- [ ] 20 unique valid topics — succeeds
- [ ] 21 unique valid topics — succeeds at the server level (max is client-enforced)

**Boundary — Invalid Sizes:**
- [ ] Topic of 36 characters: `{ "topics": ["abcdefghijklmnopqrstuvwxyz0123456789"] }` — returns HTTP 422
- [ ] Topic of 0 characters (empty string): `{ "topics": [""] }` — returns HTTP 422
- [ ] Topic starting with hyphen: `{ "topics": ["-rust"] }` — returns HTTP 422
- [ ] Topic containing spaces: `{ "topics": ["my topic"] }` — returns HTTP 422
- [ ] Topic containing special characters: `{ "topics": ["rust!"] }` — returns HTTP 422
- [ ] Topic containing underscores: `{ "topics": ["my_topic"] }` — returns HTTP 422
- [ ] Topic containing dots: `{ "topics": ["my.topic"] }` — returns HTTP 422
- [ ] Topic that is only hyphens: `{ "topics": ["---"] }` — returns HTTP 422

**Mixed Valid and Invalid:**
- [ ] `{ "topics": ["rust", "invalid topic!"] }` — returns HTTP 422 (entire request rejected)
- [ ] `{ "topics": ["valid", "also-valid", "-invalid"] }` — returns HTTP 422 (entire request rejected)

**Null/Missing Topics Field:**
- [ ] `{ "topics": null }` — succeeds, treated as `[]` (clears topics)
- [ ] `{}` (missing topics key) — treated as empty array, clears topics
- [ ] Malformed JSON body — returns HTTP 400

**Authentication & Authorization:**
- [ ] Unauthenticated PUT request — returns HTTP 401
- [ ] Authenticated user without any permission on the repo — returns HTTP 403
- [ ] Authenticated user with read permission — returns HTTP 403
- [ ] Authenticated user with write permission — returns HTTP 403
- [ ] Authenticated user with admin permission — returns HTTP 200
- [ ] Repository owner — returns HTTP 200
- [ ] PAT-based authentication with admin access — returns HTTP 200
- [ ] Unauthenticated GET request on public repo — returns HTTP 200 with topics
- [ ] Unauthenticated GET request on private repo — returns HTTP 404
- [ ] Authenticated GET request with read access on private repo — returns HTTP 200 with topics

**Error Handling:**
- [ ] PUT to non-existent owner — returns HTTP 404
- [ ] PUT to non-existent repo — returns HTTP 404
- [ ] PUT to private repo without access — returns HTTP 404 (not 403)
- [ ] Non-JSON content type — returns HTTP 400

### API Integration Tests — GET /api/repos/:owner/:repo/topics

- [ ] GET on a repo with topics — returns HTTP 200 with `{ "topics": ["topic1", "topic2"] }`
- [ ] GET on a repo with no topics — returns HTTP 200 with `{ "topics": [] }`
- [ ] GET on a non-existent repo — returns HTTP 404
- [ ] GET on a public repo without auth — returns HTTP 200
- [ ] GET on a private repo without auth — returns HTTP 404
- [ ] GET on a private repo with read access — returns HTTP 200

### API Integration Tests — PATCH /api/repos/:owner/:repo (topics via metadata update)

- [ ] `PATCH` with `{ "topics": ["rust", "jj"] }` returns HTTP 200 with topics in the full repo response
- [ ] `PATCH` with `{ "topics": [] }` clears topics
- [ ] `PATCH` with `{ "description": "new desc", "topics": ["rust"] }` updates both fields
- [ ] `PATCH` without `topics` field does not change existing topics
- [ ] Same normalization rules apply (lowercase, trim, dedup)
- [ ] Same validation rules apply (422 for invalid topics)

### CLI E2E Tests

- [ ] `codeplane repo topics OWNER/REPO` — exits 0, displays current topics
- [ ] `codeplane repo topics OWNER/REPO --json` — exits 0, outputs valid JSON `{ "topics": [...] }`
- [ ] `codeplane repo topics OWNER/REPO --set rust,jj,forge` — exits 0, displays updated topics
- [ ] `codeplane repo topics OWNER/REPO --set rust,jj,forge --json` — exits 0, outputs valid JSON with updated topics
- [ ] `codeplane repo topics OWNER/REPO --clear` — exits 0, clears all topics
- [ ] `codeplane repo topics OWNER/REPO --set "RUST,JJ"` — exits 0, topics normalized to lowercase
- [ ] `codeplane repo topics OWNER/REPO --set "invalid topic!"` — exits non-zero with validation error
- [ ] `codeplane repo topics NONEXISTENT/REPO` — exits non-zero with 404 error
- [ ] `codeplane repo edit OWNER/REPO --topics rust,jj` — exits 0, topics updated via PATCH endpoint
- [ ] After `--set`, subsequent `codeplane repo topics OWNER/REPO` shows the updated topics

### Web UI Playwright Tests

- [ ] Navigate to `/:owner/:repo` — topics are displayed as tag chips on the overview page
- [ ] Navigate to `/:owner/:repo/settings` — topics section shows current topics as removable chips
- [ ] Type a valid topic in the input and press Enter — topic chip appears in the list
- [ ] Type a topic and press comma — topic chip appears in the list
- [ ] Click × on a topic chip — topic is removed from the list
- [ ] Add a topic with invalid characters — inline validation error appears before save
- [ ] Click "Save changes" after adding topics — toast notification confirms update, topics persist on reload
- [ ] Add 20 topics — counter shows "20 / 20 topics", input is disabled
- [ ] Remove a topic from 20 — input re-enables, counter shows "19 / 20 topics"
- [ ] Clear all topics → save → overview page shows no topic chips
- [ ] Non-admin user visits settings page — topic input is read-only/disabled
- [ ] Clicking a topic chip on the repo overview navigates to a filtered search/browse view

### TUI Tests

- [ ] Navigate to repository settings tab (tab 6) — topics field displays current topics
- [ ] Focus topics field → press Enter → edit mode activates → type comma-separated topics → Ctrl+S saves → topics update
- [ ] Focus topics field → press Enter → type invalid topic → inline validation error shown
- [ ] Focus topics field → press Enter → type topics → Esc cancels → original topics restored
- [ ] Non-admin user — topics field is read-only, Enter does not activate edit mode
- [ ] Press R — topics refresh from API
- [ ] Navigate to repository overview — topics displayed as `[topic]` inline tags

### Config-as-Code Integration Tests

- [ ] Push `.codeplane/config.yml` with `repository.topics: [rust, jj]` — topics are synced to the database
- [ ] Push `.codeplane/config.yml` with `repository.topics: [RUST]` — normalized to `["rust"]`
- [ ] Push `.codeplane/config.yml` with `repository.topics: []` — clears topics
- [ ] Push `.codeplane/config.yml` with an invalid topic — sync produces a validation error, topics unchanged
- [ ] Push `.codeplane/config.yml` with duplicate topics — deduplicated and sorted alphabetically
